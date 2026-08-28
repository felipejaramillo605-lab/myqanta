import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  getBudgetVsActual,
  getIndirectCashFlow,
  listBudgets,
  listCostCenters,
  upsertBudget,
  deleteBudget,
} from "@/lib/finance-assets.functions";
import { listAccountsCoa } from "@/lib/finance-ext.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/finance_/budgets")({
  head: () => ({
    meta: [
      { title: "Qanta — Presupuestos y flujo de caja" },
      { name: "description", content: "Presupuesto vs. ejecución real por cuenta y centro de costo, y flujo de caja indirecto." },
      { property: "og:title", content: "Presupuestos y flujo de caja — Qanta" },
      { property: "og:description", content: "Compara presupuesto y ejecución real y revisa el flujo de caja por método indirecto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: BudgetsPage,
});

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function BudgetsPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<string>("all");
  const [costCenter, setCostCenter] = useState<string>("all");
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ month: String(now.getMonth() + 1), account_id: "", cost_center_id: "", amount: 0 });

  const accounts = useQuery({ queryKey: ["fin_accounts_coa"], queryFn: () => listAccountsCoa() });
  const centers = useQuery({ queryKey: ["cost_centers"], queryFn: () => listCostCenters() });
  const budgets = useQuery({ queryKey: ["budgets", year], queryFn: () => listBudgets({ data: { year } }) });
  const bva = useQuery({
    queryKey: ["budget_vs_actual", year, month, costCenter],
    queryFn: () =>
      getBudgetVsActual({
        data: {
          year,
          month: month === "all" ? null : Number(month),
          cost_center_id: costCenter === "all" ? null : costCenter,
        },
      }),
  });
  const cash = useQuery({ queryKey: ["cash_flow", from, to], queryFn: () => getIndirectCashFlow({ data: { from, to } }) });

  const fmt = useMemo(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }), []);

  const save = useMutation({
    mutationFn: () =>
      upsertBudget({
        data: {
          year,
          month: Number(form.month),
          account_id: form.account_id,
          cost_center_id: form.cost_center_id || null,
          amount: Number(form.amount),
        },
      }),
    onSuccess: () => {
      toast.success("Presupuesto guardado");
      qc.invalidateQueries({ queryKey: ["budgets", year] });
      qc.invalidateQueries({ queryKey: ["budget_vs_actual"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteBudget({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budgets", year] });
      qc.invalidateQueries({ queryKey: ["budget_vs_actual"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const accountOptions = ((accounts.data ?? []) as any[]).filter((a) => a.type === "income" || a.type === "expense");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presupuestos y flujo de caja</h1>
          <p className="text-sm text-muted-foreground">Presupuesto vs. real por cuenta y centro de costo, y flujo de caja indirecto.</p>
        </div>
        <div className="flex items-end gap-2">
          <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo el año</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={costCenter} onValueChange={setCostCenter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los centros</SelectItem>
              {((centers.data ?? []) as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 size-4" /> Presupuesto</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Presupuesto {year}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <Select value={form.month} onValueChange={(v) => setForm({ ...form, month: v })}>
                  <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Cuenta (ingreso o gasto)" /></SelectTrigger>
                  <SelectContent>
                    {accountOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={form.cost_center_id || "none"} onValueChange={(v) => setForm({ ...form, cost_center_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Centro de costo (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin centro de costo</SelectItem>
                    {((centers.data ?? []) as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Importe" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate()} disabled={!form.account_id || save.isPending}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Tabs defaultValue="bva">
        <TabsList>
          <TabsTrigger value="bva">Presupuesto vs. real</TabsTrigger>
          <TabsTrigger value="list">Presupuestos cargados</TabsTrigger>
          <TabsTrigger value="cash">Flujo de caja</TabsTrigger>
        </TabsList>

        <TabsContent value="bva" className="pt-4">
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2 text-right">Presupuesto</th>
                  <th className="px-3 py-2 text-right">Real</th>
                  <th className="px-3 py-2 text-right">Variación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(bva.data?.rows ?? []).map((r) => {
                  const good = r.type === "income" ? r.variance >= 0 : r.variance <= 0;
                  return (
                    <tr key={r.account_id}>
                      <td className="px-3 py-2"><span className="font-mono text-xs">{r.code}</span> {r.name}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt.format(r.budget)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt.format(r.actual)}</td>
                      <td className={"px-3 py-2 text-right font-mono " + (good ? "text-emerald-500" : "text-destructive")}>
                        {fmt.format(r.variance)}{r.variance_pct === null ? "" : ` (${r.variance_pct.toFixed(1)}%)`}
                      </td>
                    </tr>
                  );
                })}
                {(bva.data?.rows ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Carga presupuestos o registra asientos publicados para comparar.</td></tr>
                )}
              </tbody>
              {bva.data && bva.data.rows.length > 0 && (
                <tfoot className="bg-muted/20 font-medium">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt.format(bva.data.totals.budget)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt.format(bva.data.totals.actual)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt.format(bva.data.totals.variance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TabsContent>

        <TabsContent value="list" className="space-y-2 pt-4">
          {((budgets.data ?? []) as any[]).map((b) => (
            <div key={b.id} className="glass flex items-center justify-between rounded-xl p-3 text-sm">
              <span>
                {MONTHS[(b.month as number) - 1]} · <span className="font-mono text-xs">{b.account?.code}</span> {b.account?.name}
                {b.cost_center ? ` · ${b.cost_center.name}` : ""}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-mono">{fmt.format(Number(b.amount))}</span>
                <Button size="icon" variant="ghost" onClick={() => del.mutate(b.id)}><Trash2 className="size-4" /></Button>
              </span>
            </div>
          ))}
          {(budgets.data ?? []).length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">Sin presupuestos para {year}.</div>
          )}
        </TabsContent>

        <TabsContent value="cash" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          {cash.data && (
            <div className="glass overflow-hidden rounded-2xl">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border/40">
                  {[
                    ["Utilidad neta del periodo", cash.data.net_income],
                    ["+ Depreciación (no monetaria)", cash.data.depreciation],
                    ["± Cambio en capital de trabajo", cash.data.working_capital_change],
                    ["= Flujo de caja operativo", cash.data.operating],
                    ["± Inversión y financiación (residual)", cash.data.investing_financing],
                    ["Caja inicial", cash.data.cash_start],
                    ["Caja final", cash.data.cash_end],
                  ].map(([label, value], i) => (
                    <tr key={String(label)} className={i === 3 ? "bg-primary/5 font-medium" : ""}>
                      <td className="px-3 py-2">{label}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt.format(Number(value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Método indirecto sobre asientos publicados. Caja = cuentas del PUC que inician en 11.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
