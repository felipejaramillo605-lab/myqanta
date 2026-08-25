import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";

import {
  listProjectExpenses, upsertProjectExpense, deleteProjectExpense,
  listProjectMembers, upsertProjectMember,
  type ProjectExpenseRow,
} from "@/lib/projects.functions";
import { listMembers } from "@/lib/org.functions";
import { usePermissions } from "@/lib/use-permissions";
import {
  MARGIN_STYLE, PROJECT_TYPE_COLOR, PROJECT_TYPE_LABEL,
  fmtMoney, marginState, type ProjectProfitRow,
} from "@/lib/project-ui";
import { ProjectBreakdownChart } from "@/components/charts/project-margin-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ProjectDetailDialog({ row, onClose }: { row: ProjectProfitRow; onClose: () => void }) {
  const currency = row.project.currency ?? "EUR";
  const state = marginState(row.margin_pct);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {row.project.name}
            <Badge variant="outline" className={PROJECT_TYPE_COLOR[row.project.project_type]}>
              {PROJECT_TYPE_LABEL[row.project.project_type]}
            </Badge>
            {row.project.platform && (
              <Badge variant="outline" className="border-border/60 text-muted-foreground">
                {row.project.platform}
              </Badge>
            )}
            <Badge variant="outline" className={MARGIN_STYLE[state].className}>
              {row.margin_pct === null ? MARGIN_STYLE[state].label : `${row.margin_pct.toFixed(1)}% margen`}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Rentabilidad</TabsTrigger>
            <TabsTrigger value="expenses">Gastos</TabsTrigger>
            <TabsTrigger value="rates">Tarifas</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label="Costo de horas" value={fmtMoney(row.hours_cost, currency)} hint={`${row.hours.toFixed(1)}h`} />
              <Mini label="Gastos directos" value={fmtMoney(row.expenses, currency)} />
              <Mini label="Facturado" value={fmtMoney(row.invoiced_total, currency)} hint={`${fmtMoney(row.invoiced_paid, currency)} cobrado`} />
              <Mini
                label="Margen"
                value={fmtMoney(row.margin, currency)}
                hint={row.margin_pct === null ? "Sin facturar" : `${row.margin_pct.toFixed(1)}%`}
                tone={row.margin < 0 ? "bad" : row.margin > 0 ? "good" : "neutral"}
              />
            </div>
            <ProjectBreakdownChart row={row} />
            <p className="text-xs text-muted-foreground">
              El costo de horas usa la tarifa por hora de cada miembro en este proyecto. Los miembros sin tarifa
              no suman costo.
            </p>
          </TabsContent>

          <TabsContent value="expenses">
            <ExpensesTab projectId={row.project.id} currency={currency} />
          </TabsContent>

          <TabsContent value="rates">
            <RatesTab projectId={row.project.id} currency={currency} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ label, value, hint, tone = "neutral" }: {
  label: string; value: string; hint?: string; tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-rose-500" : "";
  return (
    <div className="glass rounded-xl border border-border/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 font-mono text-sm font-semibold " + toneClass}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const emptyExpense = () => ({
  id: undefined as string | undefined,
  description: "",
  amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  category: "",
});

function ExpensesTab({ projectId, currency }: { projectId: string; currency: string }) {
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const expensesQ = useQuery({
    queryKey: ["project-expenses", projectId],
    queryFn: () => listProjectExpenses({ data: { project_id: projectId } }),
  });
  const [form, setForm] = useState(emptyExpense());

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project-expenses", projectId] });
    qc.invalidateQueries({ queryKey: ["project-profitability"] });
  };

  const save = useMutation({
    mutationFn: () => upsertProjectExpense({
      data: {
        id: form.id,
        project_id: projectId,
        description: form.description.trim(),
        amount: Number(form.amount),
        currency,
        expense_date: form.expense_date,
        category: form.category || null,
      },
    }),
    onSuccess: () => {
      toast.success(form.id ? "Gasto actualizado" : "Gasto añadido");
      setForm(emptyExpense());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteProjectExpense({ data: { id } }),
    onSuccess: () => { toast.success("Gasto eliminado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = expensesQ.data ?? [];
  const total = rows.reduce((a, b) => a + Number(b.amount), 0);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="glass space-y-3 rounded-xl border border-border/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Descripción *</Label>
              <Input value={form.description} placeholder="Licencia de música, freelance de motion…"
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Importe ({currency}) *</Label>
              <Input type="number" step="0.01" min="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Categoría</Label>
              <Input value={form.category} placeholder="software, subcontratación, viajes…"
                onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              disabled={!form.description.trim() || !form.amount || save.isPending}
              onClick={() => save.mutate()}
            >
              {form.id ? <Check className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
              {save.isPending ? "Guardando…" : form.id ? "Guardar cambios" : "Añadir gasto"}
            </Button>
            {form.id && (
              <Button variant="ghost" onClick={() => setForm(emptyExpense())}>Cancelar edición</Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Descripción</th>
              <th className="p-2 text-left">Categoría</th>
              <th className="p-2 text-right">Importe</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e: ProjectExpenseRow) => (
              <tr key={e.id} className="border-t border-border/40">
                <td className="p-2 text-xs text-muted-foreground">{e.expense_date}</td>
                <td className="p-2">{e.description}</td>
                <td className="p-2 text-xs text-muted-foreground">{e.category ?? "—"}</td>
                <td className="p-2 text-right font-mono">{fmtMoney(Number(e.amount), e.currency)}</td>
                <td className="p-2 text-right whitespace-nowrap">
                  {canWrite && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setForm({
                        id: e.id,
                        description: e.description,
                        amount: String(e.amount),
                        expense_date: e.expense_date,
                        category: e.category ?? "",
                      })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm(`¿Eliminar "${e.description}"?`)) del.mutate(e.id);
                      }}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                Sin gastos registrados en este proyecto.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="text-right text-xs text-muted-foreground">
          Total gastos: <span className="font-mono">{fmtMoney(total, currency)}</span>
        </div>
      )}
    </div>
  );
}

function RatesTab({ projectId, currency }: { projectId: string; currency: string }) {
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const orgQ = useQuery({ queryKey: ["org-members"], queryFn: () => listMembers() });
  const pmQ = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => listProjectMembers({ data: { project_id: projectId } }),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const byUser = useMemo(() => {
    const m = new Map<string, { role: string; hourly_rate: number | null }>();
    for (const pm of pmQ.data ?? []) m.set(pm.user_id, { role: pm.role, hourly_rate: pm.hourly_rate });
    return m;
  }, [pmQ.data]);

  const save = useMutation({
    mutationFn: (v: { user_id: string; rate: string; role: string }) => upsertProjectMember({
      data: {
        project_id: projectId,
        user_id: v.user_id,
        role: (v.role === "lead" || v.role === "viewer" ? v.role : "member") as "lead" | "member" | "viewer",
        hourly_rate: v.rate === "" ? null : Number(v.rate),
      },
    }),
    onSuccess: () => {
      toast.success("Tarifa guardada");
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["project-profitability"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border/50 p-4 text-sm text-muted-foreground">
        Solo los administradores de la organización pueden asignar tarifas por hora.
      </div>
    );
  }

  const members = orgQ.data?.members ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Asigna la tarifa por hora de cada persona en este proyecto. Sin tarifa, sus horas no generan costo.
      </p>
      <div className="overflow-hidden rounded-xl border border-border/50">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Miembro</th>
              <th className="p-2 text-left">Rol en la org.</th>
              <th className="p-2 text-right">Tarifa/hora ({currency})</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const pm = byUser.get(m.user_id);
              const current = pm?.hourly_rate != null ? String(pm.hourly_rate) : "";
              const value = drafts[m.user_id] ?? current;
              return (
                <tr key={m.user_id} className="border-t border-border/40">
                  <td className="p-2">
                    {m.full_name ?? m.user_id.slice(0, 8)}
                    {m.is_me && <span className="ml-1 text-xs text-muted-foreground">(tú)</span>}
                    {pm && <span className="ml-2 text-[10px] text-muted-foreground">· {pm.role}</span>}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{m.role}</td>
                  <td className="p-2 text-right">
                    <Input
                      className="ml-auto w-28 text-right"
                      type="number" step="0.01" min="0" placeholder="—"
                      value={value}
                      onChange={(ev) => setDrafts({ ...drafts, [m.user_id]: ev.target.value })}
                    />
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <Button
                      size="sm" variant="ghost"
                      disabled={save.isPending || value === current}
                      onClick={() => save.mutate({ user_id: m.user_id, rate: value, role: pm?.role ?? "member" })}
                    >
                      <Check className="size-4" />
                    </Button>
                    {drafts[m.user_id] !== undefined && drafts[m.user_id] !== current && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        const next = { ...drafts };
                        delete next[m.user_id];
                        setDrafts(next);
                      }}>
                        <X className="size-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sin miembros en la organización.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
