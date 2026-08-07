import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LogOut, Plus, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

type Profile = { id: string; full_name: string; email: string | null };
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const loadConversations = useCallback(async () => {
    const [{ data: convs }, { data: mems }] = await Promise.all([
      supabase.from("conversations").select("id, title, is_group, updated_at").order("updated_at", { ascending: false }),
      supabase.from("conversation_members").select("conversation_id, user_id"),
    ]);
    setConversations(convs ?? []);
    setMembers(mems ?? []);
    return convs ?? [];
  }, []);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
      setProfiles(profs ?? []);
      const convs = await loadConversations();
      if (convs.length > 0) setActiveId(convs[0]!.id);
    })();
  }, [loadConversations]);

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

  async function createConversation() {
    if (!me || picked.length === 0) return;
    const isGroup = picked.length > 1;
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

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight">Nexo</span>
          <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
            <LogOut className="size-4" />
          </Button>
        </div>

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
              {picked.length > 1 && (
                <Input
                  placeholder="Nome do grupo"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              )}
              <ScrollArea className="max-h-64 pr-3">
                <div className="space-y-1">
                  {profiles
                    .filter((p) => p.id !== me)
                    .map((p) => (
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
                          <AvatarFallback className="text-xs">
                            {initials(p.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{p.full_name}</span>
                      </label>
                    ))}
                  {profiles.filter((p) => p.id !== me).length === 0 && (
                    <p className="px-2 py-6 text-sm text-muted-foreground">
                      Nenhum outro usuário cadastrado ainda.
                    </p>
                  )}
                </div>
              </ScrollArea>
              <Button onClick={createConversation} disabled={picked.length === 0}>
                Criar
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
    </div>
  );
}
