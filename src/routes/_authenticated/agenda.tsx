import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Calendar as CalendarIcon, Pencil, ChevronLeft, ChevronRight, CheckSquare, Repeat } from "lucide-react";

import { deleteEvent, listEvents, upsertEvent } from "@/lib/productivity.functions";
import { listTasks, listHabits } from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ReminderPromptDialog, type ReminderPromptPayload } from "@/components/reminder-prompt-dialog";
import { TasksPanel, HabitsPanel } from "@/components/productivity-panels";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Qanta — Agenda" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["agenda", "events"], queryFn: () => listEvents({ data: {} }) }),
      context.queryClient.ensureQueryData({ queryKey: ["agenda", "tasks"], queryFn: () => listTasks() }),
      context.queryClient.ensureQueryData({ queryKey: ["agenda", "habits"], queryFn: () => listHabits() }),
      context.queryClient.ensureQueryData({ queryKey: ["pro", "tasks"], queryFn: () => listTasks() }),
      context.queryClient.ensureQueryData({ queryKey: ["pro", "habits"], queryFn: () => listHabits() }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: Agenda,
});

type CalItem = {
  id: string;
  type: "event" | "task" | "habit";
  title: string;
  date: Date;
  endsAt?: Date;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  color: string;
};

const TYPE_STYLES: Record<CalItem["type"], { color: string; label: string; icon: typeof CalendarIcon }> = {
  event: { color: "#6366f1", label: "Evento", icon: CalendarIcon },
  task: { color: "#f59e0b", label: "Tarea", icon: CheckSquare },
  habit: { color: "#10b981", label: "Hábito", icon: Repeat },
};

function dayKey(d: Date | string) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const c = new Date(d);
  const day = (c.getDay() + 6) % 7; // Monday = 0
  c.setDate(c.getDate() - day);
  c.setHours(0, 0, 0, 0);
  return c;
}

function Agenda() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const fn = useServerFn(listEvents);
  const tasksFn = useServerFn(listTasks);
  const habitsFn = useServerFn(listHabits);
  const upsertFn = useServerFn(upsertEvent);
  const delFn = useServerFn(deleteEvent);
  const { data: events } = useSuspenseQuery({ queryKey: ["agenda", "events"], queryFn: () => fn({ data: {} }) });
  const { data: tasks } = useSuspenseQuery({ queryKey: ["agenda", "tasks"], queryFn: () => tasksFn() });
  const { data: habitData } = useSuspenseQuery({ queryKey: ["agenda", "habits"], queryFn: () => habitsFn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["agenda"] });
  const locale = lang === "es" ? "es-ES" : "en-US";

  const items: CalItem[] = useMemo(() => {
    const arr: CalItem[] = [];
    for (const e of events) {
      arr.push({
        id: `event:${e.id}`,
        type: "event",
        title: e.title,
        date: new Date(e.starts_at),
        endsAt: new Date(e.ends_at),
        allDay: e.all_day,
        location: e.location,
        description: e.description,
        color: e.color || TYPE_STYLES.event.color,
      });
    }
    for (const tk of tasks as Array<{ id: string; title: string; due_date: string | null }>) {
      if (!tk.due_date) continue;
      arr.push({ id: `task:${tk.id}`, type: "task", title: tk.title, date: new Date(tk.due_date), allDay: true, color: TYPE_STYLES.task.color });
    }
    const habitsById = new Map((habitData?.habits ?? []).map((h: any) => [h.id, h]));
    for (const log of habitData?.logs ?? []) {
      const h: any = habitsById.get((log as any).habit_id);
      if (!h) continue;
      const d = new Date((log as any).logged_on + "T09:00:00");
      arr.push({ id: `habit:${(log as any).id}`, type: "habit", title: h.name, date: d, allDay: true, color: h.color || TYPE_STYLES.habit.color });
    }
    return arr;
  }, [events, tasks, habitData]);

  const itemsByDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) {
      const k = dayKey(it.date);
      const list = m.get(k) ?? [];
      list.push(it);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());
    return m;
  }, [items]);

  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const [reminderPrompt, setReminderPrompt] = useState<ReminderPromptPayload | null>(null);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">CALENDAR · TIMELINE</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t("ag.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("ag.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/50 p-0.5 text-xs">
            {(["month", "week", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 capitalize transition ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v === "month" ? (lang === "es" ? "Mes" : "Month") : v === "week" ? (lang === "es" ? "Semana" : "Week") : (lang === "es" ? "Lista" : "List")}
              </button>
            ))}
          </div>
          {canWrite && (
            <EventDialog
              onSubmit={(v) =>
                upsertFn({ data: v })
                  .then((row: { id: string } | null | undefined) => {
                    refresh();
                    toast.success("✓");
                    if (row?.id) {
                      setReminderPrompt({ source_type: "event", source_id: row.id, title: v.title });
                    }
                  })
                  .catch((e: Error) => toast.error(e.message))
              }
            />
          )}
        </div>
      </header>

      <ReadOnlyBanner />

      <Legend />

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => document.getElementById("tasks-section")?.scrollIntoView({ behavior: "smooth" })}
          className="rounded-md border border-border/50 px-3 py-1.5 text-muted-foreground hover:text-foreground"
        >
          {lang === "es" ? "Ir a tareas" : "Go to tasks"}
        </button>
        <button
          type="button"
          onClick={() => document.getElementById("habits-section")?.scrollIntoView({ behavior: "smooth" })}
          className="rounded-md border border-border/50 px-3 py-1.5 text-muted-foreground hover:text-foreground"
        >
          {lang === "es" ? "Ir a hábitos" : "Go to habits"}
        </button>
      </div>

      {view === "month" && (
        <MonthView
          cursor={cursor}
          setCursor={setCursor}
          itemsByDay={itemsByDay}
          locale={locale}
          onDayClick={(k) => setDayDetail(k)}
          lang={lang}
        />
      )}
      {view === "week" && (
        <WeekView
          cursor={cursor}
          setCursor={setCursor}
          items={items}
          locale={locale}
          lang={lang}
        />
      )}
      {view === "list" && (
        <ListView
          events={events}
          locale={locale}
          lang={lang}
          canWrite={canWrite}
          onDelete={(id) => delFn({ data: { id } }).then(refresh)}
          onEdit={(v, id) => upsertFn({ data: { ...v, id } }).then(() => { refresh(); toast.success("✓"); }).catch((err: Error) => toast.error(err.message))}
        />
      )}

      <DayDetailDialog dayKey={dayDetail} onClose={() => setDayDetail(null)} itemsByDay={itemsByDay} locale={locale} />

      <section id="tasks-section" className="space-y-3 scroll-mt-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {lang === "es" ? "Tareas" : "Tasks"}
        </h2>
        <TasksPanel />
      </section>

      <section id="habits-section" className="space-y-3 scroll-mt-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {lang === "es" ? "Hábitos" : "Habits"}
        </h2>
        <HabitsPanel />
      </section>

      <ReminderPromptDialog payload={reminderPrompt} onClose={() => setReminderPrompt(null)} />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {Object.entries(TYPE_STYLES).map(([k, v]) => {
        const Icon = v.icon;
        return (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: v.color }} />
            <Icon className="size-3" />
            {v.label}
          </span>
        );
      })}
    </div>
  );
}

function MonthView({
  cursor, setCursor, itemsByDay, locale, onDayClick, lang,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  itemsByDay: Map<string, CalItem[]>;
  locale: string;
  onDayClick: (k: string) => void;
  lang: string;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  const monthLabel = cursor.toLocaleString(locale, { month: "long", year: "numeric" });
  const today = dayKey(new Date());
  const weekDays = lang === "es"
    ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-lg font-semibold capitalize">{monthLabel}</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>{lang === "es" ? "Hoy" : "Today"}</Button>
          <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-border/50 bg-border/50">
        {weekDays.map((d) => (
          <div key={d} className="bg-background/60 px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{d}</div>
        ))}
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayItems = itemsByDay.get(k) ?? [];
          const visible = dayItems.slice(0, 3);
          const more = dayItems.length - visible.length;
          return (
            <button
              key={k}
              onClick={() => onDayClick(k)}
              className={`flex min-h-[92px] flex-col items-stretch gap-1 p-1.5 text-left transition hover:bg-sidebar-accent/60 ${inMonth ? "bg-background" : "bg-background/40 text-muted-foreground"}`}
            >
              <div className={`text-xs font-medium ${k === today ? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}`}>
                {d.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {visible.map((it) => (
                  <span
                    key={it.id}
                    className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                    style={{ background: it.color }}
                    title={it.title}
                  >
                    {it.title}
                  </span>
                ))}
                {more > 0 && <span className="text-[10px] text-muted-foreground">+{more} {lang === "es" ? "más" : "more"}</span>}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function WeekView({
  cursor, setCursor, items, locale, lang,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  items: CalItem[];
  locale: string;
  lang: string;
}) {
  const start = startOfWeek(cursor);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7..20
  const dayKeys = new Set(days.map(dayKey));
  const shown = items.filter((it) => dayKeys.has(dayKey(it.date)));
  const rangeLabel = `${days[0].toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;

  const step = (delta: number) => {
    const c = new Date(cursor);
    c.setDate(c.getDate() + delta * 7);
    setCursor(c);
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-lg font-semibold">{rangeLabel}</div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => step(-1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>{lang === "es" ? "Hoy" : "Today"}</Button>
          <Button variant="ghost" size="icon" onClick={() => step(1)}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-px rounded-lg border border-border/50 bg-border/50 text-xs">
        <div className="bg-background/60" />
        {days.map((d) => (
          <div key={d.toISOString()} className="bg-background/60 px-1.5 py-1 text-center">
            <div className="text-[10px] uppercase text-muted-foreground">{d.toLocaleDateString(locale, { weekday: "short" })}</div>
            <div className="font-mono text-sm">{d.getDate()}</div>
          </div>
        ))}
        {HOURS.map((h) => (
          <Fragment key={`h-${h}`}>
            <div className="bg-background/60 px-1 py-0.5 text-right font-mono text-[10px] text-muted-foreground">{String(h).padStart(2, "0")}:00</div>
            {days.map((d) => (
              <div key={`${d.toISOString()}-${h}`} className="relative h-12 bg-background" />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="relative -mt-[calc(48*14px)] pointer-events-none">
        {/* Overlay events */}
        <WeekOverlay days={days} hours={HOURS} items={shown} />
      </div>
    </div>
  );
}

function WeekOverlay({ days, hours, items }: { days: Date[]; hours: number[]; items: CalItem[] }) {
  const HOUR_PX = 48;
  const startHour = hours[0];
  const totalH = hours.length * HOUR_PX;
  return (
    <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-px" style={{ height: totalH }}>
      <div />
      {days.map((d) => {
        const dk = dayKey(d);
        const dayItems = items.filter((it) => dayKey(it.date) === dk);
        return (
          <div key={dk} className="relative">
            {dayItems.map((it) => {
              const startH = it.date.getHours() + it.date.getMinutes() / 60;
              const endH = it.endsAt ? it.endsAt.getHours() + it.endsAt.getMinutes() / 60 : startH + 0.75;
              const top = Math.max(0, (startH - startHour) * HOUR_PX);
              const height = Math.max(20, (endH - startH) * HOUR_PX);
              if (startH >= startHour + hours.length || endH <= startHour) return null;
              return (
                <div
                  key={it.id}
                  className="pointer-events-auto absolute inset-x-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
                  style={{ top, height, background: it.color }}
                  title={`${it.title} — ${it.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                >
                  {it.title}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DayDetailDialog({
  dayKey: dk, onClose, itemsByDay, locale,
}: {
  dayKey: string | null;
  onClose: () => void;
  itemsByDay: Map<string, CalItem[]>;
  locale: string;
}) {
  const open = dk !== null;
  const list = dk ? itemsByDay.get(dk) ?? [] : [];
  const title = dk ? new Date(dk + "T00:00:00").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle className="capitalize">{title}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {list.length === 0 && <p className="text-sm text-muted-foreground">Sin actividad.</p>}
          {list.map((it) => {
            const Icon = TYPE_STYLES[it.type].icon;
            return (
              <div key={it.id} className="flex items-start gap-3 rounded-lg border border-border/40 p-2.5">
                <span className="mt-1 inline-block size-3 shrink-0 rounded-full" style={{ background: it.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="size-3.5 text-muted-foreground" />
                    {it.title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {it.allDay
                      ? TYPE_STYLES[it.type].label + " · " + (locale.startsWith("es") ? "Todo el día" : "All day")
                      : `${TYPE_STYLES[it.type].label} · ${it.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${it.endsAt ? ` – ${it.endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`}
                    {it.location && <> · {it.location}</>}
                  </div>
                  {it.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{it.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type EventRow = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

type EventFormValue = {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

function ListView({
  events, locale, lang, canWrite, onDelete, onEdit,
}: {
  events: EventRow[];
  locale: string;
  lang: string;
  canWrite: boolean;
  onDelete: (id: string) => void;
  onEdit: (v: EventFormValue, id: string) => void;
}) {
  const { t } = useI18n();
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.ends_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.ends_at).getTime() < now).slice(0, 20);
  return (
    <>
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("ag.upcoming")}</h2>
        {upcoming.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">{t("ag.empty")}</div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <div key={e.id} className="glass flex items-center gap-4 rounded-2xl p-4">
                <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-primary/10 p-2 text-primary">
                  <div className="text-[10px] font-medium uppercase">{new Date(e.starts_at).toLocaleString(locale, { month: "short" })}</div>
                  <div className="font-mono text-2xl">{new Date(e.starts_at).getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <CalendarIcon className="size-3" />
                    {e.all_day
                      ? lang === "es" ? "Todo el día" : "All day"
                      : `${new Date(e.starts_at).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" })} – ${new Date(e.ends_at).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" })}`}
                    {e.location && <><span>·</span><MapPin className="size-3" />{e.location}</>}
                  </div>
                  {e.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.description}</p>}
                </div>
                {canWrite && (
                  <>
                    <EventDialog
                      initial={e}
                      trigger={<Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>}
                      onSubmit={(v) => onEdit(v, e.id)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => onDelete(e.id)}><Trash2 className="size-4" /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("ag.past")}</h2>
          <div className="glass overflow-hidden rounded-2xl divide-y divide-border/40">
            {past.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-muted-foreground">{e.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{new Date(e.starts_at).toLocaleDateString(locale)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

type EventInitial = {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

function EventDialog({
  onSubmit,
  initial,
  trigger,
}: {
  onSubmit: (v: { title: string; description?: string | null; location?: string | null; starts_at: string; ends_at: string; all_day: boolean }) => void;
  initial?: EventInitial;
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const def = today.toISOString().slice(0, 16);
  const defEnd = new Date(today.getTime() + 3600_000).toISOString().slice(0, 16);
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    location: initial?.location ?? "",
    starts: initial ? toLocalInput(initial.starts_at) : def,
    ends: initial ? toLocalInput(initial.ends_at) : defEnd,
    allDay: initial?.all_day ?? false,
  });
  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4" />{t("ag.add")}</Button>}</DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{isEdit ? "Editar evento" : t("ag.add")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs font-medium">{t("ag.field.title")}</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.event_title")}</p>
          </div>
          <div>
            <Label className="text-xs font-medium">{t("pro.task.desc")}</Label>
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs font-medium">{t("ag.field.location")}</Label>
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.event_location")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="allday" checked={f.allDay} onCheckedChange={(v) => setF({ ...f, allDay: v })} />
            <Label htmlFor="allday" className="text-sm">{t("ag.field.all_day")}</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs font-medium">{t("ag.field.start")}</Label><Input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
            <div><Label className="text-xs font-medium">{t("ag.field.end")}</Label><Input type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></div>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("form.help.event_time")}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!f.title} onClick={() => {
            onSubmit({
              title: f.title,
              description: f.description || null,
              location: f.location || null,
              starts_at: new Date(f.starts).toISOString(),
              ends_at: new Date(f.ends).toISOString(),
              all_day: f.allDay,
            });
            setOpen(false);
          }}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}