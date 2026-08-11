import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LogOut, Plus, Send, Settings, Trash2, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/session";
import { AVATAR_BUCKET, avatarSrc, signAvatars } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
          "Converse em tempo real com sua equipe: mensagens diretas, grupos e histórico completo.",
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

type Profile = {
  id: string;
  full_name: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  description: string | null;
  sector: string | null;
};
type Conversation = { id: string; title: string | null; is_group: boolean; updated_at: string };
type Member = { conversation_id: string; user_id: string };
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

function ConversationsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])),
    [profiles],
  );
  const myProfile = me ? (profileMap[me] ?? null) : null;

  const loadProfiles = useCallback(async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, username, email, avatar_url, description, sector")
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
      supabase.from("conversation_members").select("conversation_id, user_id"),
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

  // Mensagens da conversa ativa + realtime
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, created_at")
      .eq("conversation_id", activeId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setMessages(data ?? []);
      });

    const channel = supabase
      .channel(`messages:${activeId}`)
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
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeId]);

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

  async function createConversation() {
    if (!me || picked.length === 0) return;
    const isGroup = picked.length > 1;

    if (!isGroup) {
      // Evita conversas duplicadas: reabre a existente, se houver.
      const fresh = await loadConversations();
      const existing = findDirect(picked[0]!, fresh.convs, fresh.mems);
      if (existing) {
        setDialogOpen(false);
        setPicked([]);
        setActiveId(existing);
        toast.info("Conversa já existente aberta.");
        return;
      }
    }

    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({
        created_by: me,
        is_group: isGroup,
        title: isGroup ? groupName.trim() || "Novo grupo" : null,
      })
      .select("id, title, is_group, updated_at")
      .single();
    if (error || !conv) {
      toast.error("Não foi possível criar a conversa.");
      return;
    }
    const rows = [
      { conversation_id: conv.id, user_id: me, is_admin: true },
      ...picked.map((uid) => ({ conversation_id: conv.id, user_id: uid, is_admin: false })),
    ];
    const { error: memErr } = await supabase.from("conversation_members").insert(rows);
    if (memErr) {
      toast.error("Não foi possível adicionar os participantes.");
      return;
    }
    setDialogOpen(false);
    setPicked([]);
    setGroupName("");
    await loadConversations();
    setActiveId(conv.id);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || !me) return;
    setDraft("");
    const { error } = await supabase
      .from("messages")
      .insert({ conversation_id: activeId, sender_id: me, content });
    if (error) {
      toast.error("Mensagem não enviada.");
      setDraft(content);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;
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
          <Avatar className="size-9">
            <AvatarImage src={avatarSrc(myProfile?.avatar_url, signed)} alt="" />
            <AvatarFallback className="text-xs">{initials(myProfile?.full_name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {myProfile?.full_name ?? "Meu perfil"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {myProfile?.sector || `@${myProfile?.username ?? ""}`}
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
                          {p.sector ? ` · ${p.sector}` : ""}
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
                <span className="truncate">{conversationLabel(c)}</span>
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
            <header className="border-b border-border px-6 py-4">
              <h1 className="text-base font-semibold tracking-tight">
                {conversationLabel(active)}
              </h1>
              <p className="text-xs text-muted-foreground">
                {members.filter((m) => m.conversation_id === active.id).length} participante(s)
              </p>
            </header>

            <ScrollArea className="flex-1">
              <div className="space-y-4 px-6 py-6">
                {messages.map((m) => {
                  const mine = m.sender_id === me;
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
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            <form onSubmit={send} className="flex gap-2 border-t border-border px-6 py-4">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escreva uma mensagem…"
                maxLength={4000}
              />
              <Button type="submit" size="icon" aria-label="Enviar">
                <Send className="size-4" />
              </Button>
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

  async function uploadAvatar(file: File) {
    if (!profile) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 3 MB.");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurações do usuário</DialogTitle>
          <DialogDescription>
            Gerencie sua foto de perfil e sua senha de acesso.
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
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
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
                if (file) void uploadAvatar(file);
              }}
            />
          </div>
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
  );
}
