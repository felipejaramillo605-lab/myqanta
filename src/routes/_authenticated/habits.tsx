import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, Flame, CheckCircle2, Circle, Loader2, CalendarDays } from "lucide-react";

import {
  createHabit, deleteHabit, deleteTask, listHabits, listTasks, updateHabit,
  setTaskStatus, toggleHabitToday, upsertTask,
} from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HabitYearHeatmap } from "@/components/charts/habit-year-heatmap";
import { HabitWeekChart } from "@/components/charts/habit-week-chart";
import { Pencil } from "lucide-react";

type Status = "todo" | "doing" | "done" | "archived";
type Priority = "low" | "medium" | "high" | "urgent";

export const Route = createFileRoute("/_authenticated/habits")({
  head: () => ({ meta: [{ title: "Qanta — Productividad" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["pro", "tasks"], queryFn: () => listTasks() }),
      context.queryClient.ensureQueryData({ queryKey: ["pro", "habits"], queryFn: () => listHabits() }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: Productivity,
});

function Productivity() {
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">SYSTEM · OS</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t("pro.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pro.sub")}</p>
      </header>

      <ReadOnlyBanner />

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">{t("pro.tasks")}</TabsTrigger>
          <TabsTrigger value="habits">{t("pro.habits")}</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="mt-4"><TasksPanel /></TabsContent>
        <TabsContent value="habits" className="mt-4"><HabitsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function TasksPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const fn = useServerFn(listTasks);
  const upsertFn = useServerFn(upsertTask);
  const statusFn = useServerFn(setTaskStatus);
  const delFn = useServerFn(deleteTask);
  const { data: tasks } = useSuspenseQuery({ queryKey: ["pro", "tasks"], queryFn: () => fn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["pro", "tasks"] });

  const save = (v: Parameters<Parameters<typeof TaskDialog>[0]["onSubmit"]>[0]) =>
    upsertFn({ data: v })
      .then(() => { refresh(); toast.success("✓"); })
      .catch((e: Error) => toast.error(e.message));

  const cols: { key: Status; label: string }[] = [
    { key: "todo", label: t("pro.status.todo") },
    { key: "doing", label: t("pro.status.doing") },
    { key: "done", label: t("pro.status.done") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && <TaskDialog onSubmit={save} />}
      </div>
      {tasks.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">{t("pro.empty.tasks")}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {cols.map((c) => {
            const items = tasks.filter((tk) => tk.status === c.key);
            return (
              <div key={c.key} className="glass rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <span>{c.label}</span>
                  <span className="font-mono">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((tk) => (
                    <div key={tk.id} className="group rounded-xl border border-border/50 bg-card/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{tk.title}</div>
                          {tk.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{tk.description}</div>}
                          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider">
                            <PriorityBadge p={tk.priority as Priority} />
                            {tk.due_date && <span className="font-mono text-muted-foreground">{new Date(tk.due_date).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        {canWrite && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <TaskDialog
                              initial={{
                                id: tk.id,
                                title: tk.title,
                                description: tk.description ?? "",
                                priority: tk.priority as Priority,
                                due: tk.due_date ? new Date(tk.due_date).toISOString().slice(0, 10) : "",
                                status: tk.status as Status,
                              }}
                              onSubmit={save}
                              trigger={
                                <Button variant="ghost" size="icon" title="Editar">
                                  <Pencil className="size-3.5" />
                                </Button>
                              }
                            />
                            <Button variant="ghost" size="icon" title="Eliminar" onClick={() => delFn({ data: { id: tk.id } }).then(refresh)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex gap-1">
                        {cols.map((cc) => (
                          <Button key={cc.key} variant={tk.status === cc.key ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-[10px]" disabled={!canWrite}
                            onClick={() => statusFn({ data: { id: tk.id, status: cc.key } }).then(refresh)}>
                            {cc.key === "todo" && <Circle className="size-3" />}
                            {cc.key === "doing" && <Loader2 className="size-3" />}
                            {cc.key === "done" && <CheckCircle2 className="size-3" />}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ p }: { p: Priority }) {
  const { t } = useI18n();
  const cls: Record<Priority, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-secondary text-foreground",
    high: "bg-amber-500/20 text-amber-400",
    urgent: "bg-destructive/20 text-destructive",
  };
  return <span className={"rounded-full px-2 py-0.5 " + cls[p]}>{t(("pro.priority." + p) as never)}</span>;
}

type TaskFormValue = {
  id?: string;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
  due_date?: string | null;
  tags: string[];
};

function TaskDialog({
  onSubmit,
  initial,
  trigger,
}: {
  onSubmit: (v: TaskFormValue) => void;
  initial?: { id: string; title: string; description: string; priority: Priority; due: string; status: Status };
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    priority: initial?.priority ?? ("medium" as Priority),
    due: initial?.due ?? "",
  });
  const isEdit = Boolean(initial);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && initial) {
          setF({
            title: initial.title,
            description: initial.description,
            priority: initial.priority,
            due: initial.due,
          });
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button><Plus className="size-4" />{t("pro.add_task")}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{isEdit ? "Editar tarea" : t("pro.add_task")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs font-medium">{t("pro.task.title")}</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.task_title")}</p>
          </div>
          <div>
            <Label className="text-xs font-medium">{t("pro.task.desc")}</Label>
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.task_desc")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v as Priority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["low","medium","high","urgent"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{t(("pro.priority." + p) as never)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div>
              <Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
              <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.task_due")}</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!f.title} onClick={() => {
            onSubmit({
              ...(initial?.id ? { id: initial.id } : {}),
              title: f.title,
              description: f.description || null,
              status: initial?.status ?? "todo",
              priority: f.priority,
              due_date: f.due ? new Date(f.due).toISOString() : null,
              tags: [],
            });
            setOpen(false);
            if (!initial) setF({ title: "", description: "", priority: "medium", due: "" });
          }}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HabitsPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const fn = useServerFn(listHabits);
  const createFn = useServerFn(createHabit);
  const updateFn = useServerFn(updateHabit);
  const toggleFn = useServerFn(toggleHabitToday);
  const delFn = useServerFn(deleteHabit);
  const { data } = useSuspenseQuery({ queryKey: ["pro", "habits"], queryFn: () => fn() });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pro", "habits"] });
    qc.invalidateQueries({ queryKey: ["pro", "heatmap"] });
  };

  const existingCategories = Array.from(
    new Set(data.habits.map((h) => (h.category ?? "").trim()).filter(Boolean)),
  );

  // group logs by habit
  const logsByHabit = new Map<string, Set<string>>();
  for (const l of data.logs) {
    if (!logsByHabit.has(l.habit_id)) logsByHabit.set(l.habit_id, new Set());
    logsByHabit.get(l.habit_id)!.add(l.logged_on);
  }

  const streak = (set: Set<string>) => {
    let n = 0;
    const d = new Date();
    while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
    return n;
  };

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <HabitFormDialog
            categories={existingCategories}
            trigger={<Button><Plus className="size-4" />{t("pro.add_habit")}</Button>}
            onSubmit={(v) =>
              createFn({ data: { ...v, cadence: "daily" } })
                .then(() => { refresh(); toast.success("✓"); })
                .catch((e: Error) => toast.error(e.message))
            }
          />
        )}
      </div>
      {data.habits.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">{t("pro.empty.habits")}</div>
      ) : (
      <>
        <div className="grid gap-3">
          {data.habits.map((h) => {
            const set = logsByHabit.get(h.id) ?? new Set<string>();
            const doneToday = set.has(data.today);
            const s = streak(set);
            const color = h.color || "#22d3ee";
            return (
              <div key={h.id} className="glass flex items-center gap-4 rounded-2xl p-4">
                <Button
                  variant={doneToday ? "default" : "outline"}
                  size="icon"
                  className="size-12 rounded-full"
                  style={doneToday ? { backgroundColor: color, borderColor: color, color: "#0a0a0a" } : { borderColor: color, color }}
                  disabled={!canWrite}
                  onClick={() => toggleFn({ data: { habit_id: h.id } }).then(refresh)}
                >
                  {doneToday ? <Check className="size-5" /> : <Circle className="size-5" />}
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{h.name}</div>
                    {h.category && (
                      <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${color}22`, color }}>
                        {h.category}
                      </span>
                    )}
                    <div className="flex items-center gap-1 text-xs text-amber-400"><Flame className="size-3.5" /><span className="font-mono">{s}</span><span className="text-muted-foreground">{t("pro.habit.streak")}</span></div>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {last7.map((d) => (
                      <div
                        key={d}
                        className="h-1.5 flex-1 rounded-full"
                        style={{ backgroundColor: set.has(d) ? color : "hsl(var(--border) / 0.5)" }}
                        title={d}
                      />
                    ))}
                  </div>
                </div>
                {canWrite && (
                  <HabitFormDialog
                    categories={existingCategories}
                    initial={{ name: h.name, category: h.category ?? "", color, target_per_period: h.target_per_period }}
                    trigger={<Button variant="ghost" size="icon" title={t("pro.habit.edit")}><Pencil className="size-4" /></Button>}
                    onSubmit={(v) =>
                      updateFn({ data: { id: h.id, ...v } })
                        .then(() => { refresh(); toast.success("✓"); })
                        .catch((e: Error) => toast.error(e.message))
                    }
                  />
                )}
                {canWrite && <Button variant="ghost" size="icon" onClick={() => delFn({ data: { id: h.id } }).then(refresh)}><Trash2 className="size-4" /></Button>}
                {canWrite && (
                  <HabitDatePicker
                    doneSet={set}
                    color={color}
                    onToggle={(date) =>
                      toggleFn({ data: { habit_id: h.id, date } })
                        .then(refresh)
                        .catch((e: Error) => toast.error(e.message))
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
        <HabitWeekChart />
        <HabitYearHeatmap />
      </>
      )}
    </div>
  );
}

const HABIT_PALETTE = ["#22d3ee","#a78bfa","#34d399","#fbbf24","#f472b6","#60a5fa","#fb923c","#f87171"];

function HabitFormDialog({
  trigger,
  onSubmit,
  initial,
  categories,
}: {
  trigger: React.ReactNode;
  onSubmit: (v: { name: string; category: string | null; color: string; target_per_period: number }) => void | Promise<unknown>;
  initial?: { name: string; category: string; color: string; target_per_period: number };
  categories: string[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [color, setColor] = useState(initial?.color ?? HABIT_PALETTE[0]);
  const [target, setTarget] = useState(String(initial?.target_per_period ?? 1));
  const [pending, setPending] = useState(false);

  const reset = () => {
    setName(initial?.name ?? "");
    setCategory(initial?.category ?? "");
    setColor(initial?.color ?? HABIT_PALETTE[0]);
    setTarget(String(initial?.target_per_period ?? 1));
  };

  const submit = async () => {
    setPending(true);
    try {
      await onSubmit({
        name: name.trim(),
        category: category.trim() ? category.trim() : null,
        color,
        target_per_period: Math.max(1, Number(target) || 1),
      });
      setOpen(false);
      if (!initial) reset();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader>
          <DialogTitle>{initial ? t("pro.habit.edit") : t("pro.add_habit")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs font-medium">{t("pro.habit.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leer 20 min" />
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.habit_name")}</p>
          </div>
          <div>
            <Label className="text-xs font-medium">{t("pro.habit.category")}</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="habit-categories"
              placeholder="Salud, Estudio, Trabajo…"
            />
            <datalist id="habit-categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
            <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.habit_category")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium">{t("pro.habit.target")}</Label>
              <Input type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
              <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.habit_target")}</p>
            </div>
            <div>
              <Label className="text-xs font-medium">{t("pro.habit.color")}</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border/50 bg-transparent"
                />
                <div className="flex flex-wrap gap-1">
                  {HABIT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={"size-5 rounded-full border-2 " + (color.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-transparent")}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{t("form.help.habit_color")}</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!name.trim() || pending} onClick={submit}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}