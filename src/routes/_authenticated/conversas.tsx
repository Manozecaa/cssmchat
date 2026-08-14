import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CalendarPlus,
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
};
type Conversation = { id: string; title: string | null; is_group: boolean; updated_at: string };
type Member = {
  conversation_id: string;
  user_id: string;
  muted_until: string | null;
  sound: string | null;
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
type ChatEvent = {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
};

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
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [draft, setDraft] = useState("");
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
      .select("id, full_name, username, email, avatar_url, description, sector, status")
      .order("full_name", { ascending: true });
    setProfiles(profs ?? []);
    setSigned(await signAvatars((profs ?? []).map((p) => p.avatar_url)));
  }, []);

  const loadConversations = useCallback(async () => {
    const [{ data: convs }, { data: mems }] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, title, is_group, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id, muted_until, sound"),
    ]);
    setConversations(convs ?? []);
    setMembers(mems ?? []);
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

  // Notificação sonora global (respeita silenciar e som por conversa)
  useEffect(() => {
    const channel = supabase
      .channel("messages:all")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as Message;
        if (row.sender_id === meRef.current) return;
        const membership = myMembership(row.conversation_id);
        if (!membership) return;
        if (membership.muted_until && new Date(membership.muted_until) > new Date()) return;
        playSound((membership.sound ?? "padrao") as SoundId);
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
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  // Atualiza a lista de conversas/participantes a cada 5s
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadConversations();
    };
    const timer = setInterval(tick, 5000);
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

  function conversationLabel(c: Conversation) {
    if (c.title) return c.title;
    const other = members.find((m) => m.conversation_id === c.id && m.user_id !== me);
    return other ? (profileMap[other.user_id]?.full_name ?? "Conversa") : "Conversa";
  }

  function conversationAvatar(c: Conversation) {
    const other = members.find((m) => m.conversation_id === c.id && m.user_id !== me);
    return other ? avatarSrc(profileMap[other.user_id]?.avatar_url, signed) : undefined;
  }

  function isMuted(conversationId: string) {
    const m = members.find((x) => x.conversation_id === conversationId && x.user_id === me);
    return !!m?.muted_until && new Date(m.muted_until) > new Date();
  }

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
    const rows = [
      { conversation_id: convId, user_id: me, is_admin: true },
      ...picked.map((uid) => ({ conversation_id: convId, user_id: uid, is_admin: false })),
    ];
    const { error: memErr } = await supabase.from("conversation_members").insert(rows);
    if (memErr) {
      console.error("addMembers", memErr);
      toast.error("Não foi possível adicionar os participantes.");
      return;
    }
    setDialogOpen(false);
    setPicked([]);
    setGroupName("");
    await loadConversations();
    setActiveId(convId);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if ((!content && !pendingFile) || !activeId || !me || sending) return;
    setSending(true);

    let attachment: {
      attachment_path: string;
      attachment_name: string;
      attachment_type: string;
      attachment_size: number;
    } | null = null;

    if (pendingFile) {
      if (pendingFile.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`O arquivo deve ter no máximo ${MAX_FILE_MB} MB.`);
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
    setDraft("");
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
    <div className="flex h-screen bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight">Nexo</span>
          <div className="flex items-center gap-1">
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
                <Input
                  placeholder="Nome do grupo"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
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
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent",
                  c.id === activeId && "bg-accent font-medium",
                )}
              >
                <Avatar className="size-8">
                  <AvatarImage src={conversationAvatar(c)} alt="" />
                  <AvatarFallback className="text-xs">
                    {c.is_group ? <Users className="size-4" /> : initials(conversationLabel(c))}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate">{conversationLabel(c)}</span>
                {isMuted(c.id) && <BellOff className="size-3.5 shrink-0 text-muted-foreground" />}
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                Você ainda não tem conversas.
              </p>
            )}
          </nav>
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-border px-6 py-4">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold tracking-tight">
                  {conversationLabel(active)}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {members.filter((m) => m.conversation_id === active.id).length} participante(s)
                  {isMuted(active.id) ? " · silenciada" : ""}
                </p>
              </div>

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
              <div className="flex flex-wrap gap-2 border-b border-border bg-muted/40 px-6 py-3">
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
              <div className="space-y-4 px-6 py-6">
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
                      <div className={cn("max-w-[70%]", mine && "text-right")}>
                        <p className="text-xs text-muted-foreground">
                          {profileMap[m.sender_id]?.full_name ?? "Usuário"} ·{" "}
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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

            <form onSubmit={send} className="border-t border-border px-6 py-4">
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
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva uma mensagem…"
                  maxLength={4000}
                />
                <Button type="submit" size="icon" aria-label="Enviar" disabled={sending}>
                  <Send className="size-4" />
                </Button>
              </div>
            </form>
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
          onCreated={(ev) => setEvents((prev) => [...prev, ev])}
        />
      )}

      <UserSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={myProfile}
        avatarUrl={avatarSrc(myProfile?.avatar_url, signed)}
        onSaved={loadProfiles}
      />
    </div>
  );
}

function NewEventDialog({
  open,
  onOpenChange,
  conversationId,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  userId: string;
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile | null;
  avatarUrl: string | undefined;
  onSaved: () => Promise<void>;
}) {
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
    if (password.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres.");
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
