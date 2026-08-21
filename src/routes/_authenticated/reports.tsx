import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, RefreshCw, Loader2 } from "lucide-react";
import { getConsolidatedReport, getFinancialIndicators, type ConsolidatedReport, type FinancialIndicators } from "@/lib/reports.functions";
import { getBusinessContext } from "@/lib/business-context.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { downloadCsv } from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [
    { title: "Qanta — Reportería" },
    { name: "description", content: "Reporte consolidado de finanzas, ventas, inventario, proyectos, RRHH y CRM." },
  ] }),
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: ReportsPage,
});

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }

function ReportsPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<ConsolidatedReport | null>(null);
  const [prev, setPrev] = useState<ConsolidatedReport | null>(null);
  const [indicators, setIndicators] = useState<FinancialIndicators | null>(null);
  const [currency, setCurrency] = useState("USD");

  const run = useMutation({
    mutationFn: async () => {
      const span = Math.max(Math.round((Date.parse(to) - Date.parse(from)) / 86400000), 0) + 1;
      const prevTo = new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10);
      const prevFrom = new Date(Date.parse(from) - span * 86400000).toISOString().slice(0, 10);
      const [r, biz, ind, p] = await Promise.all([
        getConsolidatedReport({ data: { from, to } }),
        getBusinessContext().catch(() => null),
        getFinancialIndicators().catch(() => null),
        getConsolidatedReport({ data: { from: prevFrom, to: prevTo } }).catch(() => null),
      ]);
      if (biz?.currency) setCurrency(biz.currency);
      setIndicators(ind);
      setPrev(p);
      return r;
    },
    onSuccess: (r) => setReport(r),
  });


  const fmt = useMemo(() => new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }), [currency]);

  const exportCsv = () => {
    if (!report) return;
    const rows: Record<string, string | number>[] = [
      { section: "Finanzas", metric: "Ingresos", value: report.finance.revenue },
      { section: "Finanzas", metric: "COGS", value: report.finance.cogs },
      { section: "Finanzas", metric: "OPEX", value: report.finance.opex },
      { section: "Finanzas", metric: "EBITDA", value: report.finance.ebitda },
      { section: "Ventas", metric: "Facturado", value: report.sales.invoiced_total },
      { section: "Ventas", metric: "Cobrado", value: report.sales.paid_total },
      { section: "Ventas", metric: "Pendiente", value: report.sales.outstanding },
      { section: "Ventas", metric: "Facturas", value: report.sales.invoice_count },
      { section: "Inventario", metric: "Productos", value: report.inventory.products },
      { section: "Inventario", metric: "Bajo stock", value: report.inventory.low_stock },
      { section: "Inventario", metric: "Valor stock", value: report.inventory.stock_value },
      { section: "Proyectos", metric: "Activos", value: report.projects.active },
      { section: "Proyectos", metric: "Horas", value: report.projects.hours },
      { section: "Proyectos", metric: "Horas facturables", value: report.projects.billable_hours },
      { section: "RRHH", metric: "Plantilla", value: report.hr.headcount },
      { section: "RRHH", metric: "Nómina neta", value: report.hr.payroll_cost },
      { section: "RRHH", metric: "Ausencias pendientes", value: report.hr.open_leaves },
      { section: "CRM", metric: "Deals abiertos", value: report.crm.deals_open },
      { section: "CRM", metric: "Deals ganados", value: report.crm.deals_won },
      { section: "CRM", metric: "Pipeline", value: report.crm.pipeline_value },
      { section: "CRM", metric: "Ganado", value: report.crm.won_value },
    ];
    downloadCsv(`qanta-reporte-${from}_${to}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportería consolidada</h1>
          <p className="text-sm text-muted-foreground">KPIs de todos los módulos en el rango seleccionado.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Generar
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={!report}>
            <Download className="mr-2 size-4" /> CSV
          </Button>
        </div>
      </header>

      {!report && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
          Selecciona un rango y pulsa <b>Generar</b> para consolidar los datos.
        </div>
      )}

      {report && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Section title="Finanzas">
            <Kpi label="Ingresos" value={fmt.format(report.finance.revenue)} />
            <Kpi label="COGS" value={fmt.format(report.finance.cogs)} />
            <Kpi label="OPEX" value={fmt.format(report.finance.opex)} />
            <Kpi label="EBITDA" value={fmt.format(report.finance.ebitda)} accent />
          </Section>
          <Section title="Ventas">
            <Kpi label="Facturado" value={fmt.format(report.sales.invoiced_total)} />
            <Kpi label="Cobrado" value={fmt.format(report.sales.paid_total)} />
            <Kpi label="Pendiente" value={fmt.format(report.sales.outstanding)} />
            <Kpi label="Facturas" value={String(report.sales.invoice_count)} />
          </Section>
          <Section title="Inventario">
            <Kpi label="Productos" value={String(report.inventory.products)} />
            <Kpi label="Bajo stock" value={String(report.inventory.low_stock)} />
            <Kpi label="Valor stock" value={fmt.format(report.inventory.stock_value)} />
          </Section>
          <Section title="Proyectos">
            <Kpi label="Activos" value={String(report.projects.active)} />
            <Kpi label="Horas" value={report.projects.hours.toFixed(1)} />
            <Kpi label="Facturables" value={report.projects.billable_hours.toFixed(1)} />
          </Section>
          <Section title="RRHH">
            <Kpi label="Plantilla" value={String(report.hr.headcount)} />
            <Kpi label="Nómina neta" value={fmt.format(report.hr.payroll_cost)} />
            <Kpi label="Ausencias" value={String(report.hr.open_leaves)} />
          </Section>
          <Section title="CRM">
            <Kpi label="Abiertos" value={String(report.crm.deals_open)} />
            <Kpi label="Ganados" value={String(report.crm.deals_won)} />
            <Kpi label="Pipeline" value={fmt.format(report.crm.pipeline_value)} />
            <Kpi label="Ganado" value={fmt.format(report.crm.won_value)} />
          </Section>

          {report.sales.top_customers.length > 0 && (
            <div className="glass rounded-2xl p-5 md:col-span-2 xl:col-span-3">
              <h3 className="mb-3 text-sm font-semibold">Top clientes</h3>
              <div className="divide-y divide-border/40">
                {report.sales.top_customers.map((c) => (
                  <div key={c.name} className="flex items-center justify-between py-2 text-sm">
                    <span>{c.name}</span>
                    <span className="font-mono">{fmt.format(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {indicators && <IndicatorsSection data={indicators} />}
    </div>
  );
}

const INDICATOR_META: { key: keyof FinancialIndicators["indicators"]; label: string; percent: boolean }[] = [
  { key: "razon_corriente", label: "Razón corriente", percent: false },
  { key: "prueba_acida", label: "Prueba ácida", percent: false },
  { key: "endeudamiento_total", label: "Endeudamiento total", percent: true },
  { key: "razon_autonomia", label: "Razón de autonomía", percent: true },
  { key: "roi", label: "ROI", percent: true },
  { key: "roe", label: "ROE", percent: true },
];

function labelTone(label: string | null) {
  if (!label) return "bg-muted text-muted-foreground";
  if (["saludable", "bajo", "sólida", "positivo"].includes(label)) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (["ajustado", "moderado"].includes(label)) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-destructive/15 text-destructive";
}

function IndicatorsSection({ data }: { data: FinancialIndicators }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Indicadores financieros</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {INDICATOR_META.map((m) => {
          const ind = data.indicators[m.key];
          const value = ind.value === null
            ? "—"
            : m.percent ? `${(ind.value * 100).toFixed(2)}%` : ind.value.toFixed(2);
          return (
            <div key={m.key} className="glass rounded-2xl p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                <Badge variant="secondary" className={labelTone(ind.label)}>{ind.label ?? "sin datos"}</Badge>
              </div>
              <div className="mt-2 font-mono text-2xl">{value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={"rounded-xl border border-border/50 p-3 " + (accent ? "bg-primary/10" : "")}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}