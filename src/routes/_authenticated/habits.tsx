import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, Flame, CheckCircle2, Circle, Loader2 } from "lucide-react";

import {
  createHabit, deleteHabit, deleteTask, listHabits, listTasks,
  setTaskStatus, toggleHabitToday, upsertTask,
} from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const fn = useServerFn(listTasks);
  const upsertFn = useServerFn(upsertTask);
  const statusFn = useServerFn(setTaskStatus);
  const delFn = useServerFn(deleteTask);
  const { data: tasks } = useSuspenseQuery({ queryKey: ["pro", "tasks"], queryFn: () => fn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["pro", "tasks"] });

  const cols: { key: Status; label: string }[] = [
    { key: "todo", label: t("pro.status.todo") },
    { key: "doing", label: t("pro.status.doing") },
    { key: "done", label: t("pro.status.done") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <TaskDialog onSubmit={(v) => upsertFn({ data: v }).then(() => { refresh(); toast.success("✓"); }).catch((e: Error) => toast.error(e.message))} />
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
                        <Button variant="ghost" size="icon" className="opacity-0 transition group-hover:opacity-100" onClick={() => delFn({ data: { id: tk.id } }).then(refresh)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <div className="mt-3 flex gap-1">
                        {cols.map((cc) => (
                          <Button key={cc.key} variant={tk.status === cc.key ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-[10px]"
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

function TaskDialog({ onSubmit }: { onSubmit: (v: { title: string; description?: string | null; status: Status; priority: Priority; due_date?: string | null; tags: string[] }) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", priority: "medium" as Priority, due: "" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" />{t("pro.add_task")}</Button></DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{t("pro.add_task")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Input placeholder={t("pro.task.title")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Textarea placeholder={t("pro.task.desc")} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v as Priority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["low","medium","high","urgent"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{t(("pro.priority." + p) as never)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!f.title} onClick={() => {
            onSubmit({ title: f.title, description: f.description || null, status: "todo", priority: f.priority, due_date: f.due ? new Date(f.due).toISOString() : null, tags: [] });
            setOpen(false); setF({ title: "", description: "", priority: "medium", due: "" });
          }}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HabitsPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fn = useServerFn(listHabits);
  const createFn = useServerFn(createHabit);
  const toggleFn = useServerFn(toggleHabitToday);
  const delFn = useServerFn(deleteHabit);
  const { data } = useSuspenseQuery({ queryKey: ["pro", "habits"], queryFn: () => fn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["pro", "habits"] });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("1");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name, cadence: "daily", target_per_period: Number(target) } }),
    onSuccess: () => { refresh(); setOpen(false); setName(""); setTarget("1"); toast.success("✓"); },
    onError: (e: Error) => toast.error(e.message),
  });

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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4" />{t("pro.add_habit")}</Button></DialogTrigger>
          <DialogContent className="glass">
            <DialogHeader><DialogTitle>{t("pro.add_habit")}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Input placeholder={t("pro.habit.name")} value={name} onChange={(e) => setName(e.target.value)} />
              <Input type="number" min="1" placeholder={t("pro.habit.target")} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
              <Button disabled={!name || createMut.isPending} onClick={() => createMut.mutate()}>{t("fin.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {data.habits.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">{t("pro.empty.habits")}</div>
      ) : (
        <div className="grid gap-3">
          {data.habits.map((h) => {
            const set = logsByHabit.get(h.id) ?? new Set<string>();
            const doneToday = set.has(data.today);
            const s = streak(set);
            return (
              <div key={h.id} className="glass flex items-center gap-4 rounded-2xl p-4">
                <Button variant={doneToday ? "default" : "outline"} size="icon" className="size-12 rounded-full" onClick={() => toggleFn({ data: { habit_id: h.id } }).then(refresh)}>
                  {doneToday ? <Check className="size-5" /> : <Circle className="size-5" />}
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{h.name}</div>
                    <div className="flex items-center gap-1 text-xs text-amber-400"><Flame className="size-3.5" /><span className="font-mono">{s}</span><span className="text-muted-foreground">{t("pro.habit.streak")}</span></div>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {last7.map((d) => (
                      <div key={d} className={"h-1.5 flex-1 rounded-full " + (set.has(d) ? "bg-primary" : "bg-border/50")} title={d} />
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => delFn({ data: { id: h.id } }).then(refresh)}><Trash2 className="size-4" /></Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}