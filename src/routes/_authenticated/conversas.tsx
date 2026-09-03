import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  BellOff,
  CalendarDays,
  CalendarPlus,
  UserPlus,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  LogOut,
  MoreVertical,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  Upload,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/session";
import { AVATAR_BUCKET, avatarSrc, signAvatars } from "@/lib/avatars";
import {
  CHAT_BUCKET,
  MAX_FILE_MB,
  formatSize,
  isImage,
  safeFileName,
  signAttachments,
} from "@/lib/chat-files";
import { SOUND_OPTIONS, playSound, type SoundId } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { AvatarCropper } from "@/components/AvatarCropper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/conversas")({
  head: () => ({
    meta: [
      { title: "Conversas — Nexo Chat Corporativo" },
      {
        name: "description",
        content:
          "Converse em tempo real com sua equipe: mensagens diretas, grupos, anexos, eventos e histórico completo.",
      },
      { property: "og:title", content: "Conversas — Nexo Chat Corporativo" },
      {
        property: "og:description",
        content: "Mensagens diretas e em grupo em tempo real para sua equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConversationsPage,
});

const STATUS_OPTIONS = [
  { id: "ativo", label: "Ativo", color: "bg-emerald-500" },
  { id: "ocupado", label: "Ocupado", color: "bg-red-500" },
  { id: "reuniao", label: "Em reunião", color: "bg-amber-500" },
  { id: "ausente", label: "Ausente", color: "bg-slate-400" },
];

function statusMeta(status: string | null | undefined) {
  return STATUS_OPTIONS.find((s) => s.id === (status ?? "ativo")) ?? STATUS_OPTIONS[0]!;
}

type Profile = {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  description: string | null;
  sector: string | null;
  status: string | null;
  category?: string | null;
  must_change_password?: boolean | null;
};

type Conversation = {
  id: string;
  title: string | null;
  is_group: boolean;
  updated_at: string;
  avatar_path: string | null;
  only_admins_send: boolean;
  created_by: string;
};
type Member = {
  conversation_id: string;
  user_id: string;
  muted_until: string | null;
  sound: string | null;
  is_admin: boolean;
  can_send: boolean;
  pinned: boolean;
  hidden_at: string | null;
  last_read_at: string;
  last_delivered_at: string;
};
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
};
type LastMessage = { sender_id: string; created_at: string; preview: string };
type ChatEvent = {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
};

type NotifPrefs = { popup: boolean; soundMuted: boolean };
const PREFS_KEY = "nexo:notif-prefs";
function readPrefs(): NotifPrefs {
  if (typeof window === "undefined") return { popup: true, soundMuted: false };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { popup: true, soundMuted: false, ...(JSON.parse(raw) as Partial<NotifPrefs>) };
  } catch {
    /* ignore */
  }
  return { popup: true, soundMuted: false };
}
function writePrefs(p: NotifPrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, content, created_at, attachment_path, attachment_name, attachment_type, attachment_size";

function ConversationsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [readAt, setReadAt] = useState<Record<string, string>>({});

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupPhoto, setGroupPhoto] = useState<File | null>(null);
  const [groupAdmins, setGroupAdmins] = useState<string[]>([]);
  const groupPhotoRef = useRef<HTMLInputElement>(null);
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const draftRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const meRef = useRef<string | null>(null);
  const membersRef = useRef<Member[]>([]);
  meRef.current = me;
  membersRef.current = members;

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const myProfile = me ? (profileMap[me] ?? null) : null;

  const myMembership = useCallback(
    (conversationId: string) =>
      membersRef.current.find(
        (m) => m.conversation_id === conversationId && m.user_id === meRef.current,
      ) ?? null,
    [],
  );

  const loadProfiles = useCallback(async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, username, email, avatar_url, description, sector, status, category, must_change_password")
      .order("full_name", { ascending: true });
    setProfiles(profs ?? []);
    const map = await signAvatars((profs ?? []).map((p) => p.avatar_url));
    setSigned((prev) => ({ ...prev, ...map }));
  }, []);

  const loadConversations = useCallback(async () => {
    const [{ data: convs }, { data: mems }, { data: recent }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, title, is_group, updated_at, avatar_path, only_admins_send, created_by")
        .order("updated_at", { ascending: false }),
      supabase
        .from("conversation_members")
        .select(
          "conversation_id, user_id, muted_until, sound, is_admin, can_send, pinned, hidden_at, last_read_at, last_delivered_at",
        ),
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, attachment_name")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(400),
    ]);
    setConversations(convs ?? []);
    setMembers(mems ?? []);

    const last: Record<string, LastMessage> = {};
    for (const row of recent ?? []) {
      if (!last[row.conversation_id]) {
        last[row.conversation_id] = {
          sender_id: row.sender_id,
          created_at: row.created_at,
          preview: row.content || (row.attachment_name ? `📎 ${row.attachment_name}` : ""),
        };
      }
    }
    setLastMessages(last);

    // Confirmação de recebimento: este cliente acabou de receber as mensagens
    // mais novas de cada conversa → registra last_delivered_at (2 checks).
    const uid = meRef.current;
    if (uid) {
      const toDeliver = (mems ?? []).filter((m) => {
        if (m.user_id !== uid) return false;
        const l = last[m.conversation_id];
        return !!l && l.sender_id !== uid && new Date(l.created_at) > new Date(m.last_delivered_at);
      });
      if (toDeliver.length > 0) {
        const stamp = new Date(
          Math.max(Date.now(), ...toDeliver.map((m) => new Date(last[m.conversation_id]!.created_at).getTime())),
        ).toISOString();
        void supabase
          .from("conversation_members")
          .update({ last_delivered_at: stamp })
          .eq("user_id", uid)
          .in(
            "conversation_id",
            toDeliver.map((m) => m.conversation_id),
          );
      }
    }

    const convAvatars = await signAvatars((convs ?? []).map((c) => c.avatar_path));
    setSigned((prev) => ({ ...prev, ...convAvatars }));

    return { convs: convs ?? [], mems: mems ?? [] };
  }, []);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      await loadProfiles();
      const { convs } = await loadConversations();
      if (convs.length > 0) setActiveId(convs[0]!.id);
    })();
  }, [loadProfiles, loadConversations]);

  useSessionTimeout(() => {
    toast.info("Sessão encerrada por inatividade.");
    navigate({ to: "/auth", replace: true });
  });

  // Configurações globais definidas no Painel ADM
  const [appSettings, setAppSettings] = useState({
    max_attachment_mb: MAX_FILE_MB,
    allow_user_groups: true,
  });
  useEffect(() => {
    void supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["max_attachment_mb", "allow_user_groups"])
      .then(({ data }) => {
        if (!data) return;
        setAppSettings((prev) => {
          const next = { ...prev };
          for (const row of data) {
            if (row.key === "max_attachment_mb" && Number(row.value) > 0) next.max_attachment_mb = Number(row.value);
            if (row.key === "allow_user_groups") next.allow_user_groups = row.value !== false && row.value !== "false";
          }
          return next;
        });
      });
  }, []);

  // Preferências locais de notificação (pop-up e som global)
  const [prefs, setPrefs] = useState<NotifPrefs>(() => readPrefs());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const profileMapRef = useRef(profileMap);
  profileMapRef.current = profileMap;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  function updatePrefs(patch: Partial<NotifPrefs>) {
    const next = { ...prefsRef.current, ...patch };
    setPrefs(next);
    writePrefs(next);
  }

  // Notificação global: som (respeita silenciar geral e por conversa) + pop-up
  useEffect(() => {
    const channel = supabase
      .channel("messages:all")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as Message;
        if (row.sender_id === meRef.current) return;
        const membership = myMembership(row.conversation_id);
        if (!membership) return;
        const convMuted = !!membership.muted_until && new Date(membership.muted_until) > new Date();
        const p = prefsRef.current;
        if (!convMuted && !p.soundMuted) playSound((membership.sound ?? "padrao") as SoundId);

        if (!p.popup || convMuted) return;
        const isActiveVisible =
          activeIdRef.current === row.conversation_id && document.visibilityState === "visible";
        if (isActiveVisible) return;
        const sender = profileMapRef.current[row.sender_id]?.full_name ?? "Alguém";
        const conv = conversationsRef.current.find((c) => c.id === row.conversation_id);
        const where = conv?.is_group && conv.title ? ` em ${conv.title}` : "";
        const body = row.content || (row.attachment_name ? `📎 ${row.attachment_name}` : "Nova mensagem");
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
          const n = new Notification(`${sender}${where}`, { body, tag: row.conversation_id });
          n.onclick = () => {
            window.focus();
            setActiveId(row.conversation_id);
            n.close();
          };
        } else {
          toast(`${sender}${where}`, {
            description: body,
            action: { label: "Abrir", onClick: () => setActiveId(row.conversation_id) },
          });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myMembership]);

  // Mensagens + eventos da conversa ativa e realtime
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setEvents([]);
      return;
    }
    let cancelled = false;

    const loadEvents = async () => {
      const { data } = await supabase
        .from("conversation_events")
        .select("id, conversation_id, created_by, title, description, starts_at, duration_minutes")
        .eq("conversation_id", activeId)
        .order("starts_at", { ascending: true });
      if (!cancelled) setEvents(data ?? []);
    };

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", activeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      setMessages((prev) =>
        prev.length === data.length && prev.every((m, i) => m.id === data[i]?.id) ? prev : data,
      );
      const paths = data.map((m) => m.attachment_path).filter(Boolean) as string[];
      if (paths.length > 0) {
        const next = await signAttachments(paths);
        if (!cancelled) setFiles((prev) => ({ ...prev, ...next }));
      }
    };

    void loadMessages();
    void loadEvents();

    const channel = supabase
      .channel(`conversation:${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.attachment_path) {
            void signAttachments([row.attachment_path]).then((next) =>
              setFiles((prev) => ({ ...prev, ...next })),
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_events",
          filter: `conversation_id=eq.${activeId}`,
        },
        () => void loadEvents(),
      )
      .subscribe();

    // Polling de segurança: mantém o chat fluido mesmo se o tempo real cair
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadMessages();
      void loadEvents();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  // Atualiza a lista de conversas/participantes a cada 2s
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadConversations();
    };
    const timer = setInterval(tick, 2000);
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadConversations]);



  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Marca a conversa aberta como lida (recibo de leitura estilo WhatsApp).
  // Usa o horário da última mensagem quando ele for maior que o relógio local,
  // evitando que a notificação "volte" por diferença de relógio.
  useEffect(() => {
    if (!activeId || !me) return;
    const newest = messages.length > 0 ? messages[messages.length - 1]!.created_at : null;
    const stamp = new Date(
      Math.max(Date.now(), newest ? new Date(newest).getTime() : 0),
    ).toISOString();
    setReadAt((prev) =>
      prev[activeId] && new Date(prev[activeId]!) >= new Date(stamp)
        ? prev
        : { ...prev, [activeId]: stamp },
    );
    void supabase
      .from("conversation_members")
      .update({ last_read_at: stamp, last_delivered_at: stamp })
      .eq("conversation_id", activeId)
      .eq("user_id", me);
  }, [activeId, me, messages]);

  function otherMember(c: Conversation) {
    const other = members.find((m) => m.conversation_id === c.id && m.user_id !== me);
    return other ? (profileMap[other.user_id] ?? null) : null;
  }

  function conversationLabel(c: Conversation) {
    if (c.title) return c.title;
    return otherMember(c)?.full_name ?? "Conversa";
  }

  function conversationAvatar(c: Conversation) {
    if (c.is_group) return avatarSrc(c.avatar_path, signed);
    return avatarSrc(otherMember(c)?.avatar_url, signed);
  }

  function isMuted(conversationId: string) {
    const m = members.find((x) => x.conversation_id === conversationId && x.user_id === me);
    return !!m?.muted_until && new Date(m.muted_until) > new Date();
  }

  function conversationMembers(conversationId: string) {
    return members.filter((m) => m.conversation_id === conversationId);
  }

  function isGroupAdmin(conversationId: string) {
    return !!members.find(
      (m) => m.conversation_id === conversationId && m.user_id === me && m.is_admin,
    );
  }

  function hasUnread(c: Conversation) {
    const mine = members.find((m) => m.conversation_id === c.id && m.user_id === me);
    const last = lastMessages[c.id];
    if (!mine || !last || last.sender_id === me) return false;
    if (c.id === activeId) return false;
    const local = readAt[c.id];
    const seenAt = Math.max(
      new Date(mine.last_read_at).getTime(),
      local ? new Date(local).getTime() : 0,
    );
    return new Date(last.created_at).getTime() > seenAt;
  }


  function lastMessageTime(c: Conversation) {
    const last = lastMessages[c.id];
    const iso = last?.created_at ?? c.updated_at;
    const date = new Date(iso);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  /**
   * Status de uma mensagem minha:
   * - sent: 1 check (gravada no servidor)
   * - delivered: 2 checks (todos os outros participantes receberam)
   * - read: 2 checks azuis (todos os outros participantes abriram a conversa depois dela)
   */
  function messageStatus(m: Message): "sent" | "delivered" | "read" {
    const others = conversationMembers(m.conversation_id).filter((x) => x.user_id !== me);
    if (others.length === 0) return "sent";
    const at = new Date(m.created_at).getTime();
    if (others.every((x) => new Date(x.last_read_at).getTime() >= at)) return "read";
    if (others.every((x) => new Date(x.last_delivered_at).getTime() >= at)) return "delivered";
    return "sent";
  }

  async function togglePin(conversationId: string, pinned: boolean) {
    if (!me) return;
    const { error } = await supabase
      .from("conversation_members")
      .update({ pinned })
      .eq("conversation_id", conversationId)
      .eq("user_id", me);
    if (error) {
      toast.error("Não foi possível fixar a conversa.");
      return;
    }
    await loadConversations();
  }

  /** Some com a conversa apenas para o usuário; o painel do ADM continua com o histórico. */
  async function hideConversation(conversationId: string) {
    if (!me) return;
    const { error } = await supabase
      .from("conversation_members")
      .update({ hidden_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", me);
    if (error) {
      toast.error("Não foi possível excluir a conversa da sua lista.");
      return;
    }
    if (activeId === conversationId) setActiveId(null);
    await loadConversations();
    toast.success("Conversa removida da sua lista.");
  }

  const visibleConversations = useMemo(() => {
    const list = conversations.filter((c) => {
      const mine = members.find((m) => m.conversation_id === c.id && m.user_id === me);
      if (!mine) return false;
      // Conversa sem nenhuma mensagem só aparece para quem a criou.
      if (!lastMessages[c.id] && c.created_by !== me) return false;
      if (!mine.hidden_at) return true;
      const last = lastMessages[c.id];
      // Uma mensagem nova depois da exclusão traz a conversa de volta.
      return !!last && new Date(last.created_at) > new Date(mine.hidden_at);
    });
    const time = (c: Conversation) =>
      new Date(lastMessages[c.id]?.created_at ?? c.updated_at).getTime();
    const pinnedOf = (c: Conversation) =>
      members.find((m) => m.conversation_id === c.id && m.user_id === me)?.pinned ?? false;
    return list.sort((a, b) => {
      const pa = pinnedOf(a) ? 1 : 0;
      const pb = pinnedOf(b) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return time(b) - time(a);
    });
  }, [conversations, members, lastMessages, me]);

  // Notificações no título da aba do navegador
  useEffect(() => {
    if (typeof document === "undefined") return;
    const unreadList = visibleConversations.filter((c) => hasUnread(c));
    if (unreadList.length === 0) {
      document.title = "Conversas — Nexo";
      return;
    }
    const newest = unreadList.reduce((acc, c) =>
      new Date(lastMessages[c.id]?.created_at ?? 0) > new Date(lastMessages[acc.id]?.created_at ?? 0)
        ? c
        : acc,
    );
    const senderId = lastMessages[newest.id]?.sender_id;
    const senderName = senderId ? (profileMap[senderId]?.full_name ?? "Alguém") : "Alguém";
    document.title = `(${unreadList.length}) ${senderName} enviou uma mensagem`;
  }, [visibleConversations, lastMessages, readAt, members, activeId, profileMap]);



  /** Procura uma conversa direta já existente entre mim e o outro usuário. */
  function findDirect(otherId: string, convs: Conversation[], mems: Member[]) {
    return (
      convs.find((c) => {
        if (c.is_group) return false;
        const ids = mems.filter((m) => m.conversation_id === c.id).map((m) => m.user_id);
        return ids.length === 2 && ids.includes(otherId) && ids.includes(me!);
      })?.id ?? null
    );
  }

  /** Procura um grupo já existente com exatamente os mesmos participantes. */
  function findGroup(ids: string[], convs: Conversation[], mems: Member[]) {
    const target = [...ids, me!].sort().join("|");
    return (
      convs.find((c) => {
        if (!c.is_group) return false;
        const current = mems
          .filter((m) => m.conversation_id === c.id)
          .map((m) => m.user_id)
          .sort()
          .join("|");
        return current === target;
      })?.id ?? null
    );
  }

  async function createConversation() {
    if (!me || picked.length === 0) return;
    const isGroup = picked.length > 1;
    if (isGroup && !appSettings.allow_user_groups && (myProfile?.category ?? "comum") === "comum") {
      toast.error("A criação de grupos está restrita a Gestão, Diretoria e Administradores.");
      return;
    }

    // Evita conversas duplicadas: reabre a existente, se houver.
    const fresh = await loadConversations();
    const existing = isGroup
      ? findGroup(picked, fresh.convs, fresh.mems)
      : findDirect(picked[0]!, fresh.convs, fresh.mems);
    if (existing) {
      setDialogOpen(false);
      setPicked([]);
      setGroupName("");
      setActiveId(existing);
      toast.info("Conversa já existente aberta.");
      return;
    }

    // O id é gerado no cliente: a política de leitura exige participação,
    // então não é possível usar .select() no mesmo insert.
    const convId = crypto.randomUUID();
    const { error } = await supabase.from("conversations").insert({
      id: convId,
      created_by: me,
      is_group: isGroup,
      title: isGroup ? groupName.trim() || "Novo grupo" : null,
    });
    if (error) {
      console.error("createConversation", error);
      toast.error("Não foi possível criar a conversa.");
      return;
    }
    // Grupos criados por gestão/diretoria/administração já nascem fixados
    const leaderCategories = ["gestao", "diretoria", "administrador"];
    const autoPin = isGroup && leaderCategories.includes(myProfile?.category ?? "comum");
    const rows = [
      { conversation_id: convId, user_id: me, is_admin: true, pinned: autoPin },
      ...picked.map((uid) => ({
        conversation_id: convId,
        user_id: uid,
        is_admin: isGroup && groupAdmins.includes(uid),
        pinned: autoPin,
      })),
    ];

    const { error: memErr } = await supabase.from("conversation_members").insert(rows);
    if (memErr) {
      console.error("addMembers", memErr);
      toast.error("Não foi possível adicionar os participantes.");
      return;
    }

    if (isGroup && groupPhoto) {
      const path = `${me}/grupo-${convId}-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, groupPhoto, { contentType: groupPhoto.type || "image/jpeg", upsert: true });
      if (!upErr) {
        await supabase.from("conversations").update({ avatar_path: path }).eq("id", convId);
      }
    }

    setDialogOpen(false);
    setPicked([]);
    setGroupName("");
    setGroupPhoto(null);
    setGroupAdmins([]);
    await loadConversations();
    setActiveId(convId);
  }

  async function updateMemberFlags(
    conversationId: string,
    userId: string,
    patch: { is_admin?: boolean; can_send?: boolean },
  ) {
    const { error } = await supabase
      .from("conversation_members")
      .update(patch)
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) {
      toast.error("Não foi possível atualizar o participante.");
      return;
    }
    await loadConversations();
  }

  async function removeMember(conversationId: string, userId: string) {
    const { error } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (error) {
      toast.error("Não foi possível remover o participante.");
      return;
    }
    await loadConversations();
    toast.success("Participante removido do grupo.");
  }

  async function setOnlyAdminsSend(conversationId: string, value: boolean) {
    const { error } = await supabase
      .from("conversations")
      .update({ only_admins_send: value })
      .eq("id", conversationId);
    if (error) {
      toast.error("Não foi possível salvar a configuração do grupo.");
      return;
    }
    await loadConversations();
  }

  async function uploadGroupAvatar(conversationId: string, file: File) {
    if (!me) return;
    const path = `${me}/grupo-${conversationId}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
    if (upErr) {
      toast.error("Não foi possível enviar a imagem do grupo.");
      return;
    }
    const { error } = await supabase
      .from("conversations")
      .update({ avatar_path: path })
      .eq("id", conversationId);
    if (error) {
      toast.error("Não foi possível salvar a foto do grupo.");
      return;
    }
    await loadConversations();
    toast.success("Foto do grupo atualizada.");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = (draftRef.current?.value ?? "").trim();
    if ((!content && !pendingFile) || !activeId || !me || sending) return;
    setSending(true);

    let attachment: {
      attachment_path: string;
      attachment_name: string;
      attachment_type: string;
      attachment_size: number;
    } | null = null;

    if (pendingFile) {
      if (pendingFile.size > appSettings.max_attachment_mb * 1024 * 1024) {
        toast.error(`O arquivo deve ter no máximo ${appSettings.max_attachment_mb} MB.`);
        setSending(false);
        return;
      }
      const path = `${activeId}/${Date.now()}-${safeFileName(pendingFile.name)}`;
      const { error: upErr } = await supabase.storage
        .from(CHAT_BUCKET)
        .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream" });
      if (upErr) {
        toast.error("Não foi possível enviar o arquivo.");
        setSending(false);
        return;
      }
      attachment = {
        attachment_path: path,
        attachment_name: pendingFile.name,
        attachment_type: pendingFile.type || "application/octet-stream",
        attachment_size: pendingFile.size,
      };
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender_id: me,
      content,
      ...(attachment ?? {}),
    });
    setSending(false);
    if (error) {
      toast.error("Mensagem não enviada.");
      return;
    }
    if (draftRef.current) draftRef.current.value = "";
    setPendingFile(null);
  }

  async function setMute(conversationId: string, hours: number | null, forever = false) {
    if (!me) return;
    const muted_until = forever
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 3650).toISOString()
      : hours === null
        ? null
        : new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const { error } = await supabase
      .from("conversation_members")
      .update({ muted_until })
      .eq("conversation_id", conversationId)
      .eq("user_id", me);
    if (error) {
      toast.error("Não foi possível atualizar o silenciamento.");
      return;
    }
    await loadConversations();
    toast.success(muted_until ? "Conversa silenciada." : "Silenciamento removido.");
  }

  async function setConversationSound(conversationId: string, sound: SoundId) {
    if (!me) return;
    const { error } = await supabase
      .from("conversation_members")
      .update({ sound })
      .eq("conversation_id", conversationId)
      .eq("user_id", me);
    if (error) {
      toast.error("Não foi possível salvar o som.");
      return;
    }
    playSound(sound);
    await loadConversations();
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const activeMembership = active
    ? (members.find((m) => m.conversation_id === active.id && m.user_id === me) ?? null)
    : null;
  const others = profiles.filter((p) => p.id !== me);
  const filteredOthers = others.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      (p.sector ?? "").toLowerCase().includes(q)
    );
  });
  const upcoming = events.filter(
    (e) => new Date(e.starts_at).getTime() > Date.now() - 60 * 60 * 1000,
  );

  return (
    <div className="flex h-dvh bg-background">
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-border md:flex md:w-72 lg:w-80",
          active ? "hidden" : "flex",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight">Nexo</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate({ to: "/agenda" })}
              aria-label="Minha agenda"
              title="Minha agenda"
            >
              <CalendarDays className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Configurações do usuário"
            >
              <Settings className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="mx-2 mb-2 flex items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
        >
          <span className="relative">
            <Avatar className="size-9">
              <AvatarImage src={avatarSrc(myProfile?.avatar_url, signed)} alt="" />
              <AvatarFallback className="text-xs">{initials(myProfile?.full_name)}</AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
                statusMeta(myProfile?.status).color,
              )}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {myProfile?.full_name ?? "Meu perfil"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {statusMeta(myProfile?.status).label}
              {myProfile?.sector ? ` · ${myProfile.sector}` : ""}
            </span>
          </span>
        </button>

        <div className="px-4 pb-3">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" size="sm">
                <Plus className="size-4" /> Nova conversa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova conversa</DialogTitle>
                <DialogDescription>
                  Selecione uma pessoa para conversa direta ou várias para criar um grupo.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="Buscar pessoa, usuário ou setor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {picked.length > 1 && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <Input
                    placeholder="Nome do grupo"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12">
                      <AvatarImage
                        src={groupPhoto ? URL.createObjectURL(groupPhoto) : undefined}
                        alt=""
                      />
                      <AvatarFallback>
                        <Users className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => groupPhotoRef.current?.click()}
                    >
                      <ImageIcon className="size-4" /> Foto do grupo
                    </Button>
                    {groupPhoto && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setGroupPhoto(null)}
                      >
                        Remover
                      </Button>
                    )}
                    <input
                      ref={groupPhotoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (file.size > 8 * 1024 * 1024) {
                          toast.error("A imagem deve ter no máximo 8 MB.");
                          return;
                        }
                        setGroupPhoto(file);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Administradores do grupo</Label>
                    <div className="flex flex-wrap gap-2">
                      {picked.map((id) => (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
                        >
                          <Checkbox
                            checked={groupAdmins.includes(id)}
                            onCheckedChange={(v) =>
                              setGroupAdmins((prev) =>
                                v ? [...prev, id] : prev.filter((x) => x !== id),
                              )
                            }
                          />
                          {profileMap[id]?.full_name ?? "Usuário"}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <ScrollArea className="max-h-64 pr-3">
                <div className="space-y-1">
                  {filteredOthers.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                    >
                      <Checkbox
                        checked={picked.includes(p.id)}
                        onCheckedChange={(v) =>
                          setPicked((prev) =>
                            v ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                          )
                        }
                      />
                      <Avatar className="size-7">
                        <AvatarImage src={avatarSrc(p.avatar_url, signed)} alt="" />
                        <AvatarFallback className="text-xs">
                          {initials(p.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{p.full_name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{p.username}
                          {p.sector ? ` · ${p.sector}` : ""} · {statusMeta(p.status).label}
                        </span>
                      </span>
                    </label>
                  ))}
                  {filteredOthers.length === 0 && (
                    <p className="px-2 py-6 text-sm text-muted-foreground">
                      Nenhum usuário ativo encontrado.
                    </p>
                  )}
                </div>
              </ScrollArea>
              <Button onClick={createConversation} disabled={picked.length === 0}>
                {picked.length > 1 ? "Criar grupo" : "Abrir conversa"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          <nav className="space-y-1 px-2 pb-4">
            {visibleConversations.map((c) => {
              const mine = members.find((m) => m.conversation_id === c.id && m.user_id === me);
              const unread = hasUnread(c);
              const other = c.is_group ? null : otherMember(c);
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent",
                    c.id === activeId && "bg-accent",
                  )}
                >
                  <button
                    onClick={() => {
                      setReadAt((prev) => ({ ...prev, [c.id]: new Date().toISOString() }));
                      setActiveId(c.id);
                    }}

                    className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm"
                  >
                    <span className="relative shrink-0">
                      <Avatar className="size-9">
                        <AvatarImage src={conversationAvatar(c)} alt="" />
                        <AvatarFallback className="text-xs">
                          {c.is_group ? (
                            <Users className="size-4" />
                          ) : (
                            initials(conversationLabel(c))
                          )}
                        </AvatarFallback>
                      </Avatar>
                      {other && (
                        <span
                          title={statusMeta(other.status).label}
                          className={cn(
                            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
                            statusMeta(other.status).color,
                          )}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex w-full min-w-0 items-center gap-1.5">
                        {mine?.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                        <span
                          className={cn("min-w-0 flex-1 truncate", unread && "font-bold")}
                        >
                          {conversationLabel(c)}
                        </span>
                        {unread && <span className="size-2 shrink-0 rounded-full bg-orange-500" />}
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {lastMessageTime(c)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex w-full min-w-0 items-center gap-1">

                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs",
                            unread ? "font-semibold text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {lastMessages[c.id]
                            ? c.is_group
                              ? `${
                                  lastMessages[c.id]!.sender_id === me
                                    ? "Você"
                                    : (profileMap[lastMessages[c.id]!.sender_id]?.full_name ?? "Alguém").split(" ")[0]
                                }: ${lastMessages[c.id]!.preview}`
                              : lastMessages[c.id]!.preview
                            : "Sem mensagens"}
                        </span>
                        {isMuted(c.id) && (
                          <BellOff className="size-3 shrink-0 text-muted-foreground" />
                        )}
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => togglePin(c.id, !mine?.pinned)}>
                        {mine?.pinned ? (
                          <>
                            <PinOff className="size-4" /> Desafixar
                          </>
                        ) : (
                          <>
                            <Pin className="size-4" /> Fixar no topo
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => hideConversation(c.id)}
                      >
                        <Trash2 className="size-4" /> Excluir da minha lista
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
            {visibleConversations.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                Você ainda não tem conversas.
              </p>
            )}
          </nav>
        </ScrollArea>
      </aside>

      <main className={cn("min-w-0 flex-1 flex-col", active ? "flex" : "hidden md:flex")}>
        {active ? (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Voltar para conversas"
                onClick={() => setActiveId(null)}
              >
                <ArrowLeft className="size-5" />
              </Button>
              <Avatar className="size-10">
                <AvatarImage src={conversationAvatar(active)} alt="" />
                <AvatarFallback className="text-xs">
                  {active.is_group ? (
                    <Users className="size-4" />
                  ) : (
                    initials(conversationLabel(active))
                  )}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex max-w-full items-center gap-1 text-left">
                    <h1 className="truncate text-base font-semibold tracking-tight">
                      {conversationLabel(active)}
                    </h1>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72">
                    <DropdownMenuLabel>Participantes</DropdownMenuLabel>
                    {conversationMembers(active.id).map((m) => {
                      const p = profileMap[m.user_id];
                      return (
                        <div
                          key={m.user_id}
                          className="flex items-center gap-2 px-2 py-1.5 text-sm"
                        >
                          <Avatar className="size-6">
                            <AvatarImage src={avatarSrc(p?.avatar_url, signed)} alt="" />
                            <AvatarFallback className="text-[10px]">
                              {initials(p?.full_name ?? "?")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate">
                            {p?.full_name ?? "Usuário"}
                            {m.is_admin && (
                              <Shield className="ml-1 inline size-3 text-muted-foreground" />
                            )}
                          </span>
                          {active.is_group && isGroupAdmin(active.id) && m.user_id !== me && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              aria-label="Remover do grupo"
                              onClick={() => removeMember(active.id, m.user_id)}
                            >
                              <UserMinus className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>

                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {active.is_group
                    ? `${conversationMembers(active.id).length} participante(s)`
                    : [
                        otherMember(active)?.sector ?? otherMember(active)?.description ?? null,
                        statusMeta(otherMember(active)?.status).label,
                      ]
                        .filter(Boolean)
                        .join(" · ")}

                  {isMuted(active.id) ? " · silenciada" : ""}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent"
                    onClick={() => {
                      void navigator.clipboard.writeText(active.id);
                      toast.success("ID da conversa copiado.");
                    }}
                  >
                    <Copy className="size-3" />
                    <span className="max-w-[140px] truncate sm:max-w-none">{active.id}</span>
                  </button>
                </p>
              </div>

              {active.is_group && isGroupAdmin(active.id) && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setGroupOpen(true)}>
                    <Settings className="size-4" /> Grupo
                  </Button>
                  <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Configurações do grupo</DialogTitle>
                        <DialogDescription>
                          Defina a foto, os administradores e quem pode enviar mensagens.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="flex items-center gap-3">
                        <Avatar className="size-14">
                          <AvatarImage src={conversationAvatar(active)} alt="" />
                          <AvatarFallback>
                            <Users className="size-5" />
                          </AvatarFallback>
                        </Avatar>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => groupPhotoRef.current?.click()}
                        >
                          <ImageIcon className="size-4" /> Alterar foto
                        </Button>
                        <input
                          ref={groupPhotoRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void uploadGroupAvatar(active.id, file);
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-md border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">Somente administradores enviam</p>
                          <p className="text-xs text-muted-foreground">
                            Libere pessoas específicas na lista abaixo.
                          </p>
                        </div>
                        <Switch
                          checked={active.only_admins_send}
                          onCheckedChange={(v) => setOnlyAdminsSend(active.id, v)}
                        />
                      </div>

                      <AddGroupMembers
                        candidates={others.filter(
                          (p) => !conversationMembers(active.id).some((m) => m.user_id === p.id),
                        )}
                        signed={signed}
                        onAdd={(ids) => addMembers(active.id, ids)}
                      />

                      <div className="space-y-1">
                        {conversationMembers(active.id).map((m) => (
                          <div
                            key={m.user_id}
                            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {profileMap[m.user_id]?.full_name ?? "Usuário"}
                            </span>
                            <label className="flex items-center gap-1 text-xs">
                              <Checkbox
                                checked={m.is_admin}
                                disabled={m.user_id === me}
                                onCheckedChange={(v) =>
                                  updateMemberFlags(active.id, m.user_id, { is_admin: !!v })
                                }
                              />
                              Admin
                            </label>
                            <label className="flex items-center gap-1 text-xs">
                              <Checkbox
                                checked={m.can_send}
                                disabled={m.is_admin}
                                onCheckedChange={(v) =>
                                  updateMemberFlags(active.id, m.user_id, { can_send: !!v })
                                }
                              />
                              Pode enviar
                            </label>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              <Button variant="outline" size="sm" onClick={() => setEventOpen(true)}>
                <CalendarPlus className="size-4" /> Evento
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Notificações da conversa">
                    {isMuted(active.id) ? (
                      <BellOff className="size-4" />
                    ) : (
                      <Bell className="size-4" />
                    )}
                    Notificações
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Silenciar conversa</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setMute(active.id, 1)}>
                    Por 1 hora
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMute(active.id, 8)}>
                    Por 8 horas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMute(active.id, 24)}>
                    Por 24 horas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMute(active.id, null, true)}>
                    Até eu reativar
                  </DropdownMenuItem>
                  {isMuted(active.id) && (
                    <DropdownMenuItem onClick={() => setMute(active.id, null)}>
                      Reativar notificações
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Som desta conversa</DropdownMenuLabel>
                  <div className="px-2 pb-2">
                    <Select
                      value={(activeMembership?.sound ?? "padrao") as string}
                      onValueChange={(v) => setConversationSound(active.id, v as SoundId)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOUND_OPTIONS.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            {upcoming.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-border bg-muted/40 px-3 py-2 sm:px-6 sm:py-3">
                {upcoming.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                  >
                    <CalendarPlus className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{ev.title}</span>
                    <span className="text-muted-foreground">
                      {new Date(ev.starts_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {ev.duration_minutes} min
                    </span>
                    {ev.created_by === me && (
                      <button
                        aria-label="Cancelar evento"
                        onClick={async () => {
                          await supabase.from("conversation_events").delete().eq("id", ev.id);
                          setEvents((prev) => prev.filter((x) => x.id !== ev.id));
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <ScrollArea className="flex-1">
              <div className="space-y-4 px-3 py-4 sm:px-6 sm:py-6">
                {messages.map((m) => {
                  const mine = m.sender_id === me;
                  const url = m.attachment_path ? files[m.attachment_path] : undefined;
                  return (
                    <div key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
                      <Avatar className="size-8 shrink-0">
                        <AvatarImage
                          src={avatarSrc(profileMap[m.sender_id]?.avatar_url, signed)}
                          alt=""
                        />
                        <AvatarFallback className="text-xs">
                          {initials(profileMap[m.sender_id]?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn("max-w-[85%] sm:max-w-[70%]", mine && "text-right")}>
                        <p
                          className={cn(
                            "flex items-center gap-1 text-xs text-muted-foreground",
                            mine && "justify-end",
                          )}
                        >
                          {profileMap[m.sender_id]?.full_name ?? "Usuário"} ·{" "}
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {mine &&
                            (() => {
                              const st = messageStatus(m);
                              if (st === "read")
                                return <CheckCheck className="size-3.5 text-sky-500" aria-label="Lida" />;
                              if (st === "delivered")
                                return <CheckCheck className="size-3.5" aria-label="Recebida" />;
                              return <Check className="size-3.5" aria-label="Enviada" />;
                            })()}
                        </p>
                        {m.attachment_path && (
                          <div className="mt-1">
                            {isImage(m.attachment_type) && url ? (
                              <a href={url} target="_blank" rel="noreferrer">
                                <img
                                  src={url}
                                  alt={m.attachment_name ?? "Imagem"}
                                  loading="lazy"
                                  className="max-h-64 rounded-lg border border-border"
                                />
                              </a>
                            ) : (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm hover:bg-accent"
                              >
                                <FileText className="size-4" />
                                <span className="max-w-[220px] truncate">
                                  {m.attachment_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatSize(m.attachment_size)}
                                </span>
                                <Download className="size-4" />
                              </a>
                            )}
                          </div>
                        )}
                        {m.content && (
                          <div
                            className={cn(
                              "mt-1 inline-block whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
                              mine
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            {m.content}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {active.is_group &&
            active.only_admins_send &&
            !activeMembership?.is_admin &&
            !activeMembership?.can_send ? (
              <div className="border-t border-border px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
                Apenas administradores podem enviar mensagens neste grupo.
              </div>
            ) : (
            <form onSubmit={send} className="border-t border-border px-3 py-3 sm:px-6 sm:py-4">
              {pendingFile && (
                <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs">
                  <Paperclip className="size-3.5" />
                  <span className="max-w-[260px] truncate">{pendingFile.name}</span>
                  <span className="text-muted-foreground">{formatSize(pendingFile.size)}</span>
                  <button
                    type="button"
                    aria-label="Remover anexo"
                    onClick={() => setPendingFile(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Anexar arquivo"
                  onClick={() => attachRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                </Button>
                <input
                  ref={attachRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) setPendingFile(file);
                  }}
                />
                <Input
                  ref={draftRef}
                  defaultValue=""
                  dir="ltr"
                  autoComplete="off"
                  enterKeyHint="send"
                  placeholder="Escreva uma mensagem…"
                  maxLength={4000}
                  className="min-w-0 flex-1"
                />
                <Button type="submit" size="icon" aria-label="Enviar" disabled={sending}>
                  <Send className="size-4" />
                </Button>
              </div>
            </form>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Selecione uma conversa ou crie uma nova para começar a falar com sua equipe.
            </p>
          </div>
        )}
      </main>

      {active && me && (
        <NewEventDialog
          open={eventOpen}
          onOpenChange={setEventOpen}
          conversationId={active.id}
          userId={me}
          memberIds={conversationMembers(active.id).map((m) => m.user_id)}
          onCreated={(ev) => setEvents((prev) => [...prev, ev])}
        />
      )}

      {myProfile?.must_change_password && (
        <ForcePasswordDialog profileId={myProfile.id} onDone={loadProfiles} />
      )}

      <UserSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={myProfile}
        avatarUrl={avatarSrc(myProfile?.avatar_url, signed)}
        onSaved={loadProfiles}
        prefs={prefs}
        onPrefs={updatePrefs}
      />
    </div>
  );
}

function passwordProblem(password: string): string | null {
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "A senha deve conter ao menos 1 letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A senha deve conter ao menos 1 letra minúscula.";
  if (!/\d/.test(password)) return "A senha deve conter ao menos 1 número.";
  if (!/[^A-Za-z0-9\s]/.test(password)) return "A senha deve conter ao menos 1 caractere especial.";
  return null;
}

function ForcePasswordDialog({ profileId, onDone }: { profileId: string; onDone: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      toast.error(
        /same/i.test(error.message)
          ? "A nova senha deve ser diferente da atual."
          : "Não foi possível alterar a senha.",
      );
      return;
    }
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", profileId);
    setBusy(false);
    if (profileError) {
      toast.error("Senha alterada, mas não foi possível concluir. Tente novamente.");
      return;
    }
    await onDone();
    toast.success("Senha definida. Bem-vindo!");
  }

  return (
    <Dialog open>
      <DialogContent
        className="[&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Defina uma nova senha</DialogTitle>
          <DialogDescription>
            Este é o seu primeiro acesso. Por segurança, crie uma senha com pelo menos 8 caracteres,
            incluindo 1 letra maiúscula, 1 letra minúscula, 1 número e 1 caractere especial.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="force-pass">Nova senha</Label>
            <Input
              id="force-pass"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="force-pass-2">Confirmar nova senha</Label>
            <Input
              id="force-pass-2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            Salvar nova senha
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewEventDialog({
  open,
  onOpenChange,
  conversationId,
  userId,
  memberIds,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  userId: string;
  memberIds: string[];
  onCreated: (ev: ChatEvent) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !time) {
      toast.error("Informe título, dia e horário.");
      return;
    }
    setBusy(true);
    const starts = new Date(`${date}T${time}`);
    const { data, error } = await supabase
      .from("conversation_events")
      .insert({
        conversation_id: conversationId,
        created_by: userId,
        title: title.trim(),
        description: description.trim() || null,
        starts_at: starts.toISOString(),
        duration_minutes: Number(duration) || 30,
      })
      .select("id, conversation_id, created_by, title, description, starts_at, duration_minutes")
      .single();
    if (!error && data) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: `📅 Evento agendado: ${data.title} — ${starts.toLocaleString("pt-BR")} (${data.duration_minutes} min)`,
      });
      // Também salva na agenda pessoal de todos os participantes da conversa
      const calId = crypto.randomUUID();
      const { error: calErr } = await supabase.from("calendar_events").insert({
        id: calId,
        created_by: userId,
        title: data.title,
        description: data.description,
        starts_at: data.starts_at,
        duration_minutes: data.duration_minutes,
        conversation_id: conversationId,
      });
      if (!calErr) {
        const ids = Array.from(new Set([userId, ...memberIds]));
        await supabase
          .from("calendar_event_participants")
          .insert(ids.map((uid) => ({ event_id: calId, user_id: uid })));
      }
      onCreated(data);
    }
    setBusy(false);
    if (error) {
      toast.error("Não foi possível criar o evento.");
      return;
    }
    setTitle("");
    setDescription("");
    setDate("");
    setTime("");
    onOpenChange(false);
    toast.success("Evento criado.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
          <DialogDescription>
            Agende uma reunião com a pessoa ou o grupo desta conversa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Título</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Reunião de alinhamento"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">Dia</Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-time">Horário</Label>
              <Input
                id="ev-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-dur">Duração (min)</Label>
              <Input
                id="ev-dur"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descrição (opcional)</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full">
              Agendar evento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserSettingsDialog({
  open,
  onOpenChange,
  profile,
  avatarUrl,
  onSaved,
  prefs,
  onPrefs,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile | null;
  avatarUrl: string | undefined;
  onSaved: () => Promise<void>;
  prefs: NotifPrefs;
  onPrefs: (patch: Partial<NotifPrefs>) => void;
}) {
  async function togglePopup(on: boolean) {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      const res = await Notification.requestPermission();
      if (res !== "granted") toast.info("Sem permissão do navegador, o pop-up aparece dentro do chat.");
    }
    onPrefs({ popup: on });
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);

  async function uploadAvatar(blob: Blob) {
    if (!profile) return;
    setBusy(true);
    const path = `${profile.id}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) {
      setBusy(false);
      toast.error("Não foi possível enviar a imagem.");
      return;
    }
    const old = profile.avatar_url;
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", profile.id);
    if (updErr) {
      setBusy(false);
      toast.error("Não foi possível salvar a foto.");
      return;
    }
    if (old && !old.startsWith("http")) {
      await supabase.storage.from(AVATAR_BUCKET).remove([old]);
    }
    await onSaved();
    setBusy(false);
    setCropFile(null);
    toast.success("Foto de perfil atualizada.");
  }

  async function removeAvatar() {
    if (!profile?.avatar_url) return;
    setBusy(true);
    const old = profile.avatar_url;
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id);
    if (error) {
      setBusy(false);
      toast.error("Não foi possível remover a foto.");
      return;
    }
    if (!old.startsWith("http")) {
      await supabase.storage.from(AVATAR_BUCKET).remove([old]);
    }
    await onSaved();
    setBusy(false);
    toast.success("Foto removida.");
  }

  async function changeStatus(status: string) {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ status }).eq("id", profile.id);
    if (error) {
      toast.error("Não foi possível alterar o status.");
      return;
    }
    await onSaved();
    toast.success(`Status: ${statusMeta(status).label}.`);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível alterar a senha.");
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Senha alterada.");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações do usuário</DialogTitle>
            <DialogDescription>
              Gerencie sua foto de perfil, seu status e sua senha de acesso.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage src={avatarUrl} alt="" />
              <AvatarFallback>{initials(profile?.full_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                @{profile?.username}
                {profile?.sector ? ` · ${profile.sector}` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" /> {profile?.avatar_url ? "Trocar" : "Adicionar"}
                </Button>
                {profile?.avatar_url && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={removeAvatar}>
                    <Trash2 className="size-4" /> Remover
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 8 * 1024 * 1024) {
                    toast.error("A imagem deve ter no máximo 8 MB.");
                    return;
                  }
                  setCropFile(file);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={profile?.status ?? "ativo"} onValueChange={changeStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", s.color)} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {profile?.description && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {profile.description}
            </p>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <Label>Notificações</Label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Pop-up de novas mensagens
                <span className="block text-xs text-muted-foreground">
                  Aviso na tela quando chegar mensagem de outra conversa ou com a aba em segundo plano.
                </span>
              </span>
              <input
                type="checkbox"
                className="size-4 shrink-0"
                checked={prefs.popup}
                onChange={(e) => void togglePopup(e.target.checked)}
              />
            </label>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                Som das mensagens
                <span className="block text-xs text-muted-foreground">
                  {prefs.soundMuted ? "Silenciado em todas as conversas." : "Ativo (respeita o som de cada conversa)."}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant={prefs.soundMuted ? "default" : "outline"}
                onClick={() => {
                  onPrefs({ soundMuted: !prefs.soundMuted });
                  toast.success(prefs.soundMuted ? "Som restaurado." : "Som silenciado.");
                }}
              >
                {prefs.soundMuted ? "Restaurar som" : "Silenciar"}
              </Button>
            </div>
          </div>

          <form onSubmit={changePassword} className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-pass">Nova senha</Label>
              <Input
                id="new-pass"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pass-2">Confirmar nova senha</Label>
              <Input
                id="new-pass-2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              Alterar senha
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AvatarCropper
        file={cropFile}
        open={!!cropFile}
        onOpenChange={(v) => !v && setCropFile(null)}
        onConfirm={uploadAvatar}
        busy={busy}
      />
    </>
  );
}
