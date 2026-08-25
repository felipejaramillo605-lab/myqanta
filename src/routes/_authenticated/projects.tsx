import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Clock, Briefcase, X, BarChart3, TrendingUp, TrendingDown } from "lucide-react";

import {
  PROJECT_STATUSES, type ProjectStatus,
  PROJECT_TYPES, type ProjectType,
  listProjects, upsertProject, deleteProject,
  listTimeEntries, upsertTimeEntry, deleteTimeEntry,
  projectStats, projectProfitability,
  type ProjectRow, type TimeEntryRow,
} from "@/lib/projects.functions";
import {
  MARGIN_STYLE, PROJECT_TYPE_COLOR, PROJECT_TYPE_LABEL,
  expectedHours, fmtMoney, marginState, type ProjectProfitRow,
} from "@/lib/project-ui";
import { ProjectMarginChart } from "@/components/charts/project-margin-chart";
import { ProjectDetailDialog } from "@/components/project-detail-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [
    { title: "Qanta — Proyectos" },
    { name: "description", content: "Proyectos, rentabilidad, miembros y registro de horas." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["projects"], queryFn: () => listProjects() }),
      context.queryClient.ensureQueryData({ queryKey: ["project-stats"], queryFn: () => projectStats() }),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: ProjectsPage,
});


const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Activo",
  paused: "En pausa",
  completed: "Completado",
  cancelled: "Cancelado",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  completed: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  cancelled: "bg-rose-500/15 text-rose-500 border-rose-500/30",
};

/** Barra de avance temporal del proyecto entre inicio y fin. */
function TimelineBar({ start, end }: { start: string | null; end: string | null }) {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  const pct = Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100));
  const late = pct >= 100;
  return (
    <div className="mt-1">
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={"h-full rounded-full " + (late ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
        {late ? "Plazo cumplido" : `${pct.toFixed(0)}% del plazo`}
      </div>
    </div>
  );
}

function ProjectsPage() {

  const qc = useQueryClient();
  const projectsQ = useSuspenseQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const statsQ = useSuspenseQuery({ queryKey: ["project-stats"], queryFn: () => projectStats() });
  const profitQ = useQuery({
    queryKey: ["project-profitability"],
    queryFn: () => projectProfitability({ data: { include_all_statuses: true } }),
  });

  const [editing, setEditing] = useState<Partial<ProjectRow> | null>(null);
  const [timeFor, setTimeFor] = useState<ProjectRow | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; billable: number }>();
    for (const s of statsQ.data) m.set(s.project_id, { total: s.total, billable: s.billable });
    return m;
  }, [statsQ.data]);

  const profit = useMemo(() => {
    const m = new Map<string, ProjectProfitRow>();
    for (const r of (profitQ.data ?? []) as ProjectProfitRow[]) m.set(r.project_id, r);
    return m;
  }, [profitQ.data]);

  const activeRows = useMemo(
    () => ((profitQ.data ?? []) as ProjectProfitRow[]).filter((r) => r.project.status === "active"),
    [profitQ.data],
  );

  const ranking = useMemo(() => {
    const billed = activeRows.filter((r) => r.margin_pct !== null);
    const sorted = [...billed].sort((a, b) => (b.margin_pct ?? 0) - (a.margin_pct ?? 0));
    return { best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse() };
  }, [activeRows]);

  const totals = useMemo(() => {
    const active = projectsQ.data.filter((p) => p.status === "active").length;
    const hours = statsQ.data.reduce((a, b) => a + Number(b.total), 0);
    const billable = statsQ.data.reduce((a, b) => a + Number(b.billable), 0);
    const margin = activeRows.reduce((a, b) => a + b.margin, 0);
    return { active, hours, billable, margin };
  }, [projectsQ.data, statsQ.data, activeRows]);

  const currency = activeRows[0]?.project.currency ?? projectsQ.data[0]?.currency ?? "EUR";

  const delMut = useMutation({
    mutationFn: (id: string) => deleteProject({ data: { id } }),
    onSuccess: () => {
      toast.success("Proyecto eliminado");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project-stats"] });
      qc.invalidateQueries({ queryKey: ["project-profitability"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailRow = detailFor ? profit.get(detailFor) ?? null : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Briefcase className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
          <p className="text-sm text-muted-foreground">
            Rentabilidad, horas y gastos de cada proyecto creativo.
          </p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setEditing({ status: "active", currency: "EUR", project_type: "video" })}>
            <Plus className="mr-2 size-4" /> Nuevo proyecto
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Proyectos activos" value={totals.active} />
        <Kpi label="Horas (90d)" value={totals.hours.toFixed(1)} />
        <Kpi label="Horas facturables (90d)" value={totals.billable.toFixed(1)} />
        <Kpi label="Margen activo" value={fmtMoney(totals.margin, currency)} />
      </div>

      {(ranking.best.length > 0 || ranking.worst.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RankingCard
            title="Mejor margen"
            icon={<TrendingUp className="size-4 text-emerald-500" />}
            rows={ranking.best}
            onOpen={setDetailFor}
          />
          <RankingCard
            title="Peor margen"
            icon={<TrendingDown className="size-4 text-rose-500" />}
            rows={ranking.worst}
            onOpen={setDetailFor}
          />
        </div>
      )}

      {activeRows.length > 0 && <ProjectMarginChart rows={activeRows} />}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projectsQ.data.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            hours={stats.get(p.id) ?? { total: 0, billable: 0 }}
            profit={profit.get(p.id) ?? null}
            onDetail={() => setDetailFor(p.id)}
            onTime={() => setTimeFor(p)}
            onEdit={() => setEditing(p)}
            onDelete={() => { if (confirm(`¿Eliminar "${p.name}"?`)) delMut.mutate(p.id); }}
          />
        ))}
        {projectsQ.data.length === 0 && (
          <div className="glass rounded-2xl border border-border/50 p-6 text-center text-muted-foreground md:col-span-2 xl:col-span-3">
            Aún no tienes proyectos. Crea el primero para empezar a registrar horas y medir rentabilidad.
          </div>
        )}
      </div>

      {editing && <ProjectDialog project={editing} onClose={() => setEditing(null)} />}
      {timeFor && <TimeSheetDialog project={timeFor} onClose={() => setTimeFor(null)} />}
      {detailRow && <ProjectDetailDialog row={detailRow} onClose={() => setDetailFor(null)} />}
    </div>
  );
}

function RankingCard({ title, icon, rows, onOpen }: {
  title: string;
  icon: React.ReactNode;
  rows: ProjectProfitRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const state = marginState(r.margin_pct);
          return (
            <li key={r.project_id}>
              <button
                className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/60"
                onClick={() => onOpen(r.project_id)}
              >
                <span className="truncate font-medium">{r.project.name}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {fmtMoney(r.margin, r.project.currency)}
                </span>
                <Badge variant="outline" className={MARGIN_STYLE[state].className}>
                  {r.margin_pct === null ? "—" : `${r.margin_pct.toFixed(0)}%`}
                </Badge>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-2 text-xs text-muted-foreground">Sin proyectos facturados todavía.</li>
        )}
      </ul>
    </section>
  );
}

function ProjectCard({ project: p, hours, profit, onDetail, onTime, onEdit, onDelete }: {
  project: ProjectRow;
  hours: { total: number; billable: number };
  profit: ProjectProfitRow | null;
  onDetail: () => void;
  onTime: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const state = marginState(profit?.margin_pct ?? null);
  const target = profit ? expectedHours(profit) : null;
  const loggedHours = profit?.hours ?? hours.total;
  const pct = target ? Math.min(100, (loggedHours / target) * 100) : null;
  const over = target ? loggedHours > target : false;

  return (
    <article className="glass flex flex-col gap-3 rounded-2xl border border-border/50 p-4">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: p.color ?? "hsl(var(--primary))" }} />
        <button className="min-w-0 flex-1 text-left" onClick={onDetail}>
          <div className="truncate font-medium">{p.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {p.client_name ?? "Sin cliente"}{p.code ? ` · ${p.code}` : ""}
          </div>
        </button>
        <Badge variant="outline" className={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={PROJECT_TYPE_COLOR[p.project_type]}>
          {PROJECT_TYPE_LABEL[p.project_type]}
        </Badge>
        {p.platform && (
          <Badge variant="outline" className="border-border/60 text-muted-foreground">{p.platform}</Badge>
        )}
        <Badge variant="outline" className={MARGIN_STYLE[state].className}>
          {profit && profit.margin_pct !== null
            ? `${profit.margin_pct.toFixed(0)}% margen`
            : MARGIN_STYLE[state].label}
        </Badge>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Horas registradas</span>
          <span className="font-mono">
            {loggedHours.toFixed(1)}h{target ? ` / ${target.toFixed(0)}h est.` : ""}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={"h-full rounded-full " + (over ? "bg-destructive" : "bg-primary")}
            style={{ width: `${pct ?? (loggedHours > 0 ? 100 : 0)}%` }}
          />
        </div>
        {!target && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Añade presupuesto y tarifas por hora para estimar el objetivo.
          </div>
        )}
        <TimelineBar start={p.start_date} end={p.end_date} />
      </div>

      {profit && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <MiniStat label="Costo" value={fmtMoney(profit.cost_total, p.currency)} />
          <MiniStat label="Facturado" value={fmtMoney(profit.invoiced_total, p.currency)} />
          <MiniStat
            label="Margen"
            value={fmtMoney(profit.margin, p.currency)}
            tone={profit.margin < 0 ? "bad" : profit.margin > 0 ? "good" : "neutral"}
          />
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-border/40 pt-2">
        <Button size="sm" variant="ghost" onClick={onDetail}>
          <BarChart3 className="mr-1 size-4" /> Rentabilidad
        </Button>
        <Button size="sm" variant="ghost" onClick={onTime}><Clock className="size-4" /></Button>
        <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="size-4" /></Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onDelete}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </article>
  );
}

function MiniStat({ label, value, tone = "neutral" }: {
  label: string; value: string; tone?: "good" | "bad" | "neutral";
}) {
  const toneClass = tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-rose-500" : "";
  return (
    <div className="rounded-lg bg-secondary/40 p-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={"font-mono text-[11px] font-medium " + toneClass}>{value}</div>
    </div>
  );
}


function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass rounded-xl border border-border/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ProjectDialog({ project, onClose }: { project: Partial<ProjectRow>; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: project.name ?? "",
    code: project.code ?? "",
    client_name: project.client_name ?? "",
    status: (project.status ?? "active") as ProjectStatus,
    description: project.description ?? "",
    color: project.color ?? "#6366f1",
    start_date: project.start_date ?? "",
    end_date: project.end_date ?? "",
    budget_amount: project.budget_amount != null ? String(project.budget_amount) : "",
    currency: project.currency ?? "EUR",
  });

  const save = useMutation({
    mutationFn: () => upsertProject({
      data: {
        id: project.id,
        name: form.name.trim(),
        code: form.code || null,
        client_name: form.client_name || null,
        status: form.status,
        description: form.description || null,
        color: form.color || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget_amount: form.budget_amount ? Number(form.budget_amount) : null,
        currency: form.currency || "EUR",
      },
    }),
    onSuccess: () => {
      toast.success(project.id ? "Proyecto actualizado" : "Proyecto creado");
      qc.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project.id ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <Label>Cliente</Label>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Color</Label>
              <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Inicio</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Presupuesto</Label>
              <Input type="number" step="0.01" value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })} />
            </div>
            <div>
              <Label>Moneda</Label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeSheetDialog({ project, onClose }: { project: ProjectRow; onClose: () => void }) {
  const qc = useQueryClient();
  const entriesQ = useQuery({
    queryKey: ["time-entries", project.id],
    queryFn: () => listTimeEntries({ data: { project_id: project.id } }),
  });
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    hours: "1",
    billable: true,
    note: "",
  });

  const add = useMutation({
    mutationFn: () => upsertTimeEntry({
      data: {
        project_id: project.id,
        entry_date: form.entry_date,
        hours: Number(form.hours),
        billable: form.billable,
        note: form.note || null,
      },
    }),
    onSuccess: () => {
      toast.success("Registro añadido");
      setForm({ ...form, hours: "1", note: "" });
      qc.invalidateQueries({ queryKey: ["time-entries", project.id] });
      qc.invalidateQueries({ queryKey: ["project-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTimeEntry({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-entries", project.id] });
      qc.invalidateQueries({ queryKey: ["project-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = (entriesQ.data ?? []).reduce((a, b) => a + Number(b.hours), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Horas · {project.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="log">
          <TabsList>
            <TabsTrigger value="log">Registrar</TabsTrigger>
            <TabsTrigger value="history">Historial ({(entriesQ.data ?? []).length})</TabsTrigger>
          </TabsList>

          <TabsContent value="log" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
              </div>
              <div>
                <Label>Horas</Label>
                <Input type="number" step="0.25" min="0.25" max="24" value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })} />
              </div>
              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.billable}
                    onChange={(e) => setForm({ ...form, billable: e.target.checked })} />
                  Facturable
                </label>
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea rows={2} value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <Button disabled={!form.hours || add.isPending} onClick={() => add.mutate()}>
              <Plus className="mr-2 size-4" /> Añadir registro
            </Button>
          </TabsContent>

          <TabsContent value="history">
            <div className="mb-2 text-xs text-muted-foreground">
              Total: <span className="font-mono">{total.toFixed(2)}h</span>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-border/40">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-right">Horas</th>
                    <th className="p-2 text-left">Nota</th>
                    <th className="p-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {(entriesQ.data ?? []).map((e: TimeEntryRow) => (
                    <tr key={e.id} className="border-t border-border/40">
                      <td className="p-2">{e.entry_date}</td>
                      <td className="p-2 text-right font-mono">
                        {Number(e.hours).toFixed(2)}
                        {e.billable ? "" : <span className="ml-1 text-xs text-muted-foreground">(no fact.)</span>}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{e.note ?? "—"}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => del.mutate(e.id)}>
                          <X className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(entriesQ.data ?? []).length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sin registros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}