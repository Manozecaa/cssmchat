import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/session";
import { avatarSrc, signAvatars } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Minha agenda — Nexo Chat Corporativo" },
      {
        name: "description",
        content: "Calendário pessoal com eventos e reuniões marcados com você e sua equipe.",
      },
      { property: "og:title", content: "Minha agenda — Nexo Chat Corporativo" },
      { property: "og:description", content: "Seus eventos e reuniões em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgendaPage,
});

type Profile = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  sector: string | null;
};

type CalEvent = {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  conversation_id: string | null;
};

type Participant = { event_id: string; user_id: string };

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AgendaPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string>(() => dayKey(new Date()));
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const load = useCallback(async () => {
    const [{ data: evs }, { data: parts }] = await Promise.all([
      supabase
        .from("calendar_events")
        .select("id, created_by, title, description, starts_at, duration_minutes, conversation_id")
        .order("starts_at", { ascending: true }),
      supabase.from("calendar_event_participants").select("event_id, user_id"),
    ]);
    setEvents(evs ?? []);
    setParticipants(parts ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url, sector")
        .order("full_name", { ascending: true });
      setProfiles(profs ?? []);
      setSigned(await signAvatars((profs ?? []).map((p) => p.avatar_url)));
      await load();
    })();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      const k = dayKey(new Date(ev.starts_at));
      (map[k] ??= []).push(ev);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [cursor]);

  const dayEvents = eventsByDay[selectedDay] ?? [];
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= Date.now() - 3600_000).slice(0, 8);
  const detail = events.find((e) => e.id === detailId) ?? null;

  function participantsOf(eventId: string) {
    return participants.filter((p) => p.event_id === eventId).map((p) => p.user_id);
  }

  async function removeEvent(id: string) {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir o evento.");
      return;
    }
    setDetailId(null);
    await load();
    toast.success("Evento excluído.");
  }

  async function leaveEvent(id: string) {
    if (!me) return;
    const { error } = await supabase
      .from("calendar_event_participants")
      .delete()
      .eq("event_id", id)
      .eq("user_id", me);
    if (error) {
      toast.error("Não foi possível sair do evento.");
      return;
    }
    setDetailId(null);
    await load();
    toast.success("Você saiu do evento.");
  }

  async function addParticipant(eventId: string, userId: string) {
    const { error } = await supabase
      .from("calendar_event_participants")
      .insert({ event_id: eventId, user_id: userId });
    if (error) {
      toast.error("Não foi possível adicionar o participante.");
      return;
    }
    await load();
  }

  async function removeParticipant(eventId: string, userId: string) {
    const { error } = await supabase
      .from("calendar_event_participants")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", userId);
    if (error) {
      toast.error("Não foi possível remover o participante.");
      return;
    }
    await load();
  }

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const todayKey = dayKey(new Date());

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Voltar para conversas"
          onClick={() => navigate({ to: "/conversas" })}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="flex-1 text-base font-semibold tracking-tight">Minha agenda</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="size-4" /> Novo evento
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-3 sm:p-6 lg:grid-cols-[1fr_360px]">
        <section className="flex min-h-0 flex-col rounded-lg border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-medium capitalize">{monthLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-medium uppercase text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7 grid-rows-6">
            {grid.map((d) => {
              const k = dayKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const evs = eventsByDay[k] ?? [];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedDay(k)}
                  className={cn(
                    "flex min-h-14 flex-col items-start gap-1 border-b border-r border-border p-1.5 text-left text-xs transition-colors hover:bg-accent sm:min-h-20",
                    !inMonth && "text-muted-foreground/50",
                    selectedDay === k && "bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full",
                      k === todayKey && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex w-full flex-col gap-0.5">
                    {evs.slice(0, 2).map((ev) => (
                      <span
                        key={ev.id}
                        className="truncate rounded bg-primary/15 px-1 py-0.5 text-[10px] font-medium text-primary"
                      >
                        {new Date(ev.starts_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        {ev.title}
                      </span>
                    ))}
                    {evs.length > 2 && (
                      <span className="text-[10px] text-muted-foreground">+{evs.length - 2}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4">
          <div className="rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </div>
            <ScrollArea className="max-h-64">
              <div className="space-y-1 p-2">
                {dayEvents.length === 0 && (
                  <p className="px-2 py-4 text-sm text-muted-foreground">Nenhum evento neste dia.</p>
                )}
                {dayEvents.map((ev) => (
                  <EventRow key={ev.id} ev={ev} me={me} count={participantsOf(ev.id).length} onOpen={() => setDetailId(ev.id)} />
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">Próximos eventos</div>
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {upcoming.length === 0 && (
                  <p className="px-2 py-4 text-sm text-muted-foreground">Nada agendado por enquanto.</p>
                )}
                {upcoming.map((ev) => (
                  <EventRow key={ev.id} ev={ev} me={me} count={participantsOf(ev.id).length} showDate onOpen={() => setDetailId(ev.id)} />
                ))}
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>

      {me && (
        <CreateEventDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          userId={me}
          defaultDate={selectedDay}
          people={profiles.filter((p) => p.id !== me)}
          signed={signed}
          onCreated={load}
        />
      )}

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetailId(null)}>
        {detail && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>
                {new Date(detail.starts_at).toLocaleString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {detail.duration_minutes} min · organizado por{" "}
                {detail.created_by === me ? "você" : (profileMap[detail.created_by]?.full_name ?? "Usuário")}
              </DialogDescription>
            </DialogHeader>
            {detail.description && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{detail.description}</p>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Participantes ({participantsOf(detail.id).length})</Label>
              <div className="space-y-1">
                {participantsOf(detail.id).map((uid) => {
                  const p = profileMap[uid];
                  return (
                    <div key={uid} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                      <Avatar className="size-6">
                        <AvatarImage src={avatarSrc(p?.avatar_url, signed)} alt="" />
                        <AvatarFallback className="text-[10px]">{initials(p?.full_name ?? "?")}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate">
                        {p?.full_name ?? "Usuário"}
                        {uid === detail.created_by && (
                          <span className="ml-1 text-xs text-muted-foreground">(organizador)</span>
                        )}
                      </span>
                      {detail.created_by === me && uid !== me && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Remover participante"
                          onClick={() => removeParticipant(detail.id, uid)}
                        >
                          <UserMinus className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              {detail.created_by === me && (
                <AddPeople
                  people={profiles.filter((p) => p.id !== me && !participantsOf(detail.id).includes(p.id))}
                  signed={signed}
                  onAdd={(uid) => addParticipant(detail.id, uid)}
                />
              )}
            </div>

            <DialogFooter>
              {detail.created_by === me ? (
                <Button variant="destructive" onClick={() => removeEvent(detail.id)}>
                  <Trash2 className="size-4" /> Excluir evento
                </Button>
              ) : (
                <Button variant="outline" onClick={() => leaveEvent(detail.id)}>
                  <UserMinus className="size-4" /> Sair do evento
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function EventRow({
  ev,
  me,
  count,
  showDate,
  onOpen,
}: {
  ev: CalEvent;
  me: string | null;
  count: number;
  showDate?: boolean;
  onOpen: () => void;
}) {
  const d = new Date(ev.starts_at);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
    >
      <span className="mt-0.5 flex shrink-0 flex-col items-center text-[11px] tabular-nums text-muted-foreground">
        {showDate && (
          <span>{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
        )}
        <span className="inline-flex items-center gap-0.5">
          <Clock className="size-3" />
          {d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{ev.title}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3" /> {count} · {ev.duration_minutes} min
          {ev.created_by === me && " · você organiza"}
        </span>
      </span>
    </button>
  );
}

function AddPeople({
  people,
  signed,
  onAdd,
}: {
  people: Profile[];
  signed: Record<string, string>;
  onAdd: (uid: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = people.filter((p) => {
    const s = q.trim().toLowerCase();
    return !s || p.full_name.toLowerCase().includes(s) || p.username.toLowerCase().includes(s);
  });
  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Adicionar participantes
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Input placeholder="Buscar pessoa…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ScrollArea className="max-h-40">
        <div className="space-y-0.5">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAdd(p.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Avatar className="size-6">
                <AvatarImage src={avatarSrc(p.avatar_url, signed)} alt="" />
                <AvatarFallback className="text-[10px]">{initials(p.full_name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
              <UserPlus className="size-3.5 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">Ninguém encontrado.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  userId,
  defaultDate,
  people,
  signed,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  defaultDate: string;
  people: Profile[];
  signed: Record<string, string>;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDate(defaultDate);
  }, [open, defaultDate]);

  const filtered = people.filter((p) => {
    const s = q.trim().toLowerCase();
    return !s || p.full_name.toLowerCase().includes(s) || p.username.toLowerCase().includes(s);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !time) {
      toast.error("Informe título, dia e horário.");
      return;
    }
    setBusy(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from("calendar_events").insert({
      id,
      created_by: userId,
      title: title.trim(),
      description: description.trim() || null,
      starts_at: new Date(`${date}T${time}`).toISOString(),
      duration_minutes: Number(duration) || 30,
    });
    if (error) {
      setBusy(false);
      toast.error("Não foi possível criar o evento.");
      return;
    }
    const rows = [userId, ...picked].map((uid) => ({ event_id: id, user_id: uid }));
    const { error: pErr } = await supabase.from("calendar_event_participants").insert(rows);
    setBusy(false);
    if (pErr) toast.error("Evento criado, mas houve falha ao adicionar participantes.");
    setTitle("");
    setDescription("");
    setPicked([]);
    setQ("");
    onOpenChange(false);
    await onCreated();
    toast.success("Evento criado.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
          <DialogDescription>Marque um evento e escolha quem participa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cal-title">Título</Label>
            <Input id="cal-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cal-date">Dia</Label>
              <Input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-time">Horário</Label>
              <Input id="cal-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-dur">Duração (min)</Label>
              <Input id="cal-dur" type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cal-desc">Descrição (opcional)</Label>
            <Textarea id="cal-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>Participantes {picked.length > 0 && `(${picked.length})`}</Label>
            <Input placeholder="Buscar pessoa…" value={q} onChange={(e) => setQ(e.target.value)} />
            <ScrollArea className="max-h-40 rounded-md border border-border">
              <div className="space-y-0.5 p-1">
                {filtered.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                    <Checkbox
                      checked={picked.includes(p.id)}
                      onCheckedChange={(v) =>
                        setPicked((prev) => (v ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                      }
                    />
                    <Avatar className="size-6">
                      <AvatarImage src={avatarSrc(p.avatar_url, signed)} alt="" />
                      <AvatarFallback className="text-[10px]">{initials(p.full_name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">
                      {p.full_name}
                      {p.sector && <span className="text-xs text-muted-foreground"> · {p.sector}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full">
              Salvar evento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
