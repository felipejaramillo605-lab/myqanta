import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Play, Loader2 } from "lucide-react";
import {
  listFixedAssets,
  upsertFixedAsset,
  deleteFixedAsset,
  runDepreciation,
  listDepreciationEntries,
  listCostCenters,
  upsertCostCenter,
  deleteCostCenter,
} from "@/lib/finance-assets.functions";
import { listAccountsCoa } from "@/lib/finance-ext.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/finance_/assets")({
  head: () => ({
    meta: [
      { title: "Qanta — Activos fijos y depreciación" },
      { name: "description", content: "Registro de activos fijos, depreciación lineal NIC 16 y centros de costo." },
      { property: "og:title", content: "Activos fijos y depreciación — Qanta" },
      { property: "og:description", content: "Depreciación lineal NIC 16, valor en libros y centros de costo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["fixed_assets"], queryFn: () => listFixedAssets() });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: AssetsPage,
});

const emptyAsset = {
  name: "",
  category: "",
  acquisition_date: new Date().toISOString().slice(0, 10),
  cost: 0,
  residual_value: 0,
  useful_life_months: 60,
  method: "straight_line" as const,
  status: "active" as const,
  asset_account_id: "",
  depreciation_expense_account_id: "",
  accumulated_depreciation_account_id: "",
  notes: "",
};

function AssetsPage() {
  const qc = useQueryClient();
  const assets = useSuspenseQuery({ queryKey: ["fixed_assets"], queryFn: () => listFixedAssets() });
  const accounts = useQuery({ queryKey: ["fin_accounts_coa"], queryFn: () => listAccountsCoa() });
  const deps = useQuery({ queryKey: ["depreciation_entries"], queryFn: () => listDepreciationEntries() });
  const centers = useQuery({ queryKey: ["cost_centers"], queryFn: () => listCostCenters() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyAsset);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [center, setCenter] = useState({ code: "", name: "" });

  const fmt = useMemo(() => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }), []);

  const save = useMutation({
    mutationFn: (d: any) =>
      upsertFixedAsset({
        data: {
          ...d,
          cost: Number(d.cost),
          residual_value: Number(d.residual_value),
          useful_life_months: Number(d.useful_life_months),
          category: d.category || null,
          notes: d.notes || null,
          asset_account_id: d.asset_account_id || null,
          depreciation_expense_account_id: d.depreciation_expense_account_id || null,
          accumulated_depreciation_account_id: d.accumulated_depreciation_account_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("Activo guardado");
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
      setOpen(false);
      setForm(emptyAsset);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFixedAsset({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fixed_assets"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: () => runDepreciation({ data: { period } }),
    onSuccess: (r) => {
      toast.success(`Depreciación ${r.period.slice(0, 7)}: ${r.posted.length} activo(s), ${fmt.format(r.total)}`);
      if (r.skipped.length) toast.message(`Omitidos: ${r.skipped.map((s) => `${s.asset} (${s.reason})`).join(", ")}`);
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
      qc.invalidateQueries({ queryKey: ["depreciation_entries"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveCenter = useMutation({
    mutationFn: () => upsertCostCenter({ data: { ...center, active: true } }),
    onSuccess: () => {
      setCenter({ code: "", name: "" });
      qc.invalidateQueries({ queryKey: ["cost_centers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delCenter = useMutation({
    mutationFn: (id: string) => deleteCostCenter({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost_centers"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const accountOptions = (accounts.data ?? []) as any[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activos fijos y depreciación</h1>
          <p className="text-sm text-muted-foreground">Depreciación lineal (NIC 16) con asientos en borrador.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={period.slice(0, 7)} onChange={(e) => setPeriod(`${e.target.value}-01`)} className="w-40" />
          <Button variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
            Correr depreciación
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 size-4" /> Nuevo activo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Activo fijo</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Categoría (equipo, vehículo…)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <div>
                  <label className="text-xs text-muted-foreground">Fecha de adquisición</label>
                  <Input type="date" value={form.acquisition_date} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Vida útil (meses)</label>
                  <Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Costo</label>
                  <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor residual</label>
                  <Input type="number" value={form.residual_value} onChange={(e) => setForm({ ...form, residual_value: e.target.value })} />
                </div>
                {[
                  ["asset_account_id", "Cuenta del activo"],
                  ["depreciation_expense_account_id", "Cuenta gasto depreciación"],
                  ["accumulated_depreciation_account_id", "Cuenta depreciación acumulada"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <Select value={form[key] || ""} onValueChange={(v) => setForm({ ...form, [key]: v })}>
                      <SelectTrigger><SelectValue placeholder="Sin cuenta" /></SelectTrigger>
                      <SelectContent>
                        {accountOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <Textarea className="sm:col-span-2" placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate(form)} disabled={save.isPending}>Guardar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">Activos</TabsTrigger>
          <TabsTrigger value="history">Historial de depreciación</TabsTrigger>
          <TabsTrigger value="centers">Centros de costo</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-2 pt-4">
          {assets.data.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              Aún no hay activos fijos. Registra el primero para calcular su depreciación mensual.
            </div>
          )}
          {(assets.data as any[]).map((a) => (
            <div key={a.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.name}</span>
                  {a.category && <Badge variant="secondary">{a.category}</Badge>}
                  {a.status !== "active" && <Badge variant="outline">dado de baja</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Adquirido {a.acquisition_date} · vida {a.useful_life_months} meses · cuota {fmt.format(a.monthly_depreciation)}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Costo</div>
                  <div className="font-mono">{fmt.format(Number(a.cost))}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Dep. acum.</div>
                  <div className="font-mono">{fmt.format(a.accumulated_depreciation)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Valor en libros</div>
                  <div className="font-mono">{fmt.format(a.book_value)}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <div className="glass overflow-hidden rounded-2xl">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Periodo</th>
                  <th className="px-3 py-2">Activo</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                  <th className="px-3 py-2">Asiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {((deps.data ?? []) as any[]).map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2">{String(d.period_month).slice(0, 7)}</td>
                    <td className="px-3 py-2">{d.asset?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt.format(Number(d.amount))}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{d.journal_entry_id ? "borrador creado" : "solo cálculo"}</td>
                  </tr>
                ))}
                {(deps.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Sin depreciaciones registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="centers" className="space-y-3 pt-4">
          <div className="glass flex flex-wrap items-end gap-2 rounded-2xl p-4">
            <Input placeholder="Código" className="w-32" value={center.code} onChange={(e) => setCenter({ ...center, code: e.target.value })} />
            <Input placeholder="Nombre del centro de costo" className="w-64" value={center.name} onChange={(e) => setCenter({ ...center, name: e.target.value })} />
            <Button onClick={() => saveCenter.mutate()} disabled={!center.code || !center.name}>Agregar</Button>
          </div>
          <div className="space-y-2">
            {((centers.data ?? []) as any[]).map((c) => (
              <div key={c.id} className="glass flex items-center justify-between rounded-xl p-3 text-sm">
                <span><span className="font-mono">{c.code}</span> · {c.name}</span>
                <Button size="icon" variant="ghost" onClick={() => delCenter.mutate(c.id)}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            {(centers.data ?? []).length === 0 && (
              <div className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
                Los centros de costo son opcionales y permiten filtrar presupuestos y ejecución.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
