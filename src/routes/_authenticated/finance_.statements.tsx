import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, ScrollText, ExternalLink } from "lucide-react";
import { downloadCsv } from "@/lib/export-utils";
import {
  getBalanceSheet,
  getCashFlowStatement,
  getEquityStatement,
  getIncomeStatement,
  getTrialBalance,
  type CashFlowSection,
  type StatementLine,
} from "@/lib/finance-statements.functions";

const searchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const Route = createFileRoute("/_authenticated/finance_/statements")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Qanta — Estados financieros" },
      {
        name: "description",
        content:
          "Balance de comprobación, estado de resultados y situación financiera generados desde tus asientos contables.",
      },
      { property: "og:title", content: "Qanta — Estados financieros" },
      {
        property: "og:description",
        content: "Reportes formales de partida doble derivados del libro diario.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StatementsPage,
});

const money = (n: number) =>
  n.toLocaleString("es-CO", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function iso(y: number, m0: number, d: number) {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: iso(y!, m! - 1, 1), to: iso(y!, m!, 0) };
}

type Preset = "this_month" | "last_month" | "quarter" | "ytd" | "year" | "last_year" | "custom";

/** Rango de fechas para cada preset de periodo. */
function presetRange(p: Preset): { from: string; to: string } | null {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (p) {
    case "this_month": return { from: iso(y, m, 1), to: today() };
    case "last_month": return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "quarter": { const qs = Math.floor(m / 3) * 3; return { from: iso(y, qs, 1), to: today() }; }
    case "ytd": return { from: iso(y, 0, 1), to: today() };
    case "year": return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "last_year": return { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) };
    default: return null;
  }
}

function LineRows({ rows }: { rows: StatementLine[] }) {
  if (!rows.length)
    return (
      <tr>
        <td colSpan={2} className="py-2 text-sm text-muted-foreground">
          Sin movimientos.
        </td>
      </tr>
    );
  return (
    <>
      {rows.map((r) => (
        <tr key={r.code + r.name} className="border-b border-border/20">
          <td className="py-1.5 pr-3">
            <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
          </td>
          <td className="py-1.5 text-right font-mono tabular-nums">{money(r.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function Section({ title, rows }: { title: string; rows: StatementLine[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <tr className="bg-muted/40">
        <td className="py-2 pr-3 text-xs font-semibold uppercase tracking-wider">{title}</td>
        <td className="py-2 text-right font-mono text-xs font-semibold tabular-nums">{money(total)}</td>
      </tr>
      <LineRows rows={rows} />
    </>
  );
}

function StatementsPage() {
  const search = Route.useSearch();
  const initial = search.from && search.to
    ? { from: search.from, to: search.to }
    : search.month
      ? monthRange(search.month)
      : { from: monthStart(), to: today() };
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<Preset>(search.month || search.from ? "custom" : "this_month");
  const [month, setMonth] = useState(search.month ?? "");
  const [tab, setTab] = useState("trial");

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const r = presetRange(p);
    if (r) { setFrom(r.from); setTo(r.to); setMonth(""); }
  };
  const applyMonth = (m: string) => {
    setMonth(m);
    if (!m) return;
    const r = monthRange(m);
    setFrom(r.from); setTo(r.to); setPreset("custom");
  };

  const tb = useQuery({
    queryKey: ["trial-balance", from, to],
    queryFn: () => getTrialBalance({ data: { from, to } }),
  });
  const pl = useQuery({
    queryKey: ["income-statement", from, to],
    queryFn: () => getIncomeStatement({ data: { from, to } }),
  });
  const bs = useQuery({
    queryKey: ["balance-sheet", to],
    queryFn: () => getBalanceSheet({ data: { as_of: to } }),
  });
  const cf = useQuery({
    queryKey: ["cash-flow", from, to],
    queryFn: () => getCashFlowStatement({ data: { from, to } }),
  });
  const eq = useQuery({
    queryKey: ["equity-statement", from, to],
    queryFn: () => getEquityStatement({ data: { from, to } }),
  });

  const suffix = `${from}_${to}`;
  const flat = (rows: StatementLine[], seccion: string) =>
    rows.map((r) => ({ seccion, codigo: r.code, cuenta: r.name, valor: r.amount }));

  const exportCurrent = () => {
    if (tab === "trial" && tb.data) {
      downloadCsv(`balance-comprobacion_${suffix}.csv`, tb.data.rows.map((r) => ({
        codigo: r.code, cuenta: r.name, tipo: r.type,
        saldo_inicial: r.opening, debito: r.debit, credito: r.credit, saldo_final: r.closing,
      })));
    } else if (tab === "pl" && pl.data) {
      downloadCsv(`estado-resultados_${suffix}.csv`, [
        ...flat(pl.data.revenue, "Ingresos operacionales"),
        ...flat(pl.data.cogs, "Costo de ventas"),
        ...flat(pl.data.opex, "Gastos operacionales"),
        ...flat(pl.data.other, "Otros ingresos y egresos"),
        { seccion: "Totales", codigo: "", cuenta: "EBITDA", valor: pl.data.totals.ebitda },
        { seccion: "Totales", codigo: "", cuenta: "Resultado neto", valor: pl.data.totals.net },
      ]);
    } else if (tab === "bs" && bs.data) {
      downloadCsv(`situacion-financiera_${to}.csv`, [
        ...flat(bs.data.assets_current, "Activo corriente"),
        ...flat(bs.data.assets_non_current, "Activo no corriente"),
        ...flat(bs.data.liabilities_current, "Pasivo corriente"),
        ...flat(bs.data.liabilities_non_current, "Pasivo no corriente"),
        ...flat(bs.data.equity, "Patrimonio"),
        { seccion: "Totales", codigo: "", cuenta: "Resultado del ejercicio", valor: bs.data.result_of_period },
        { seccion: "Totales", codigo: "", cuenta: "Total activo", valor: bs.data.total_assets },
        { seccion: "Totales", codigo: "", cuenta: "Total pasivo + patrimonio", valor: bs.data.total_liabilities + bs.data.total_equity },
      ]);
    } else if (tab === "cf" && cf.data) {
      downloadCsv(`flujo-efectivo_${suffix}.csv`, [
        { seccion: "Operación", codigo: "", cuenta: "Resultado neto", valor: cf.data.net_income },
        { seccion: "Operación", codigo: "", cuenta: "Depreciación", valor: cf.data.depreciation },
        { seccion: "Operación", codigo: "", cuenta: "Amortización", valor: cf.data.amortization },
        ...flat(cf.data.working_capital, "Capital de trabajo"),
        ...flat(cf.data.investing_items, "Inversión"),
        ...flat(cf.data.financing_items, "Financiación"),
        { seccion: "Totales", codigo: "", cuenta: "Variación neta de efectivo", valor: cf.data.net_change },
        { seccion: "Totales", codigo: "", cuenta: "Efectivo al inicio", valor: cf.data.cash_opening },
        { seccion: "Totales", codigo: "", cuenta: "Efectivo al final", valor: cf.data.cash_closing },
      ]);
    } else if (tab === "eq" && eq.data) {
      downloadCsv(`cambios-patrimonio_${suffix}.csv`, eq.data.rows.map((r) => ({
        codigo: r.code, cuenta: r.name, saldo_inicial: r.opening, aumentos: r.increase, disminuciones: r.decrease, saldo_final: r.closing,
      })));
    }
  };
  const canExport =
    (tab === "trial" && !!tb.data?.rows.length) || (tab === "pl" && !!pl.data) || (tab === "bs" && !!bs.data) ||
    (tab === "cf" && !!cf.data) || (tab === "eq" && !!eq.data);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Estados financieros</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Generados exclusivamente desde asientos contabilizados (partida doble).
        </p>
      </header>

      <div className="glass rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Periodo
          <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
            <SelectTrigger className="mt-1 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Mes actual</SelectItem>
              <SelectItem value="last_month">Mes anterior</SelectItem>
              <SelectItem value="quarter">Trimestre actual</SelectItem>
              <SelectItem value="ytd">Año a la fecha</SelectItem>
              <SelectItem value="year">Año completo</SelectItem>
              <SelectItem value="last_year">Año anterior</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="text-xs text-muted-foreground">
          Mes
          <Input type="month" value={month} onChange={(e) => applyMonth(e.target.value)} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-muted-foreground">
          Desde
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); setMonth(""); }} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-muted-foreground">
          Fecha de corte
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); setMonth(""); }} className="mt-1 w-40" />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!canExport} onClick={exportCurrent}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>
      {from > to && (
        <div className="text-sm text-destructive">La fecha inicial es posterior a la fecha de corte.</div>
      )}

      <Tabs defaultValue="trial">
        <TabsList>
          <TabsTrigger value="trial">Balance de comprobación</TabsTrigger>
          <TabsTrigger value="pl">Estado de resultados</TabsTrigger>
          <TabsTrigger value="bs">Situación financiera</TabsTrigger>
          <TabsTrigger value="cf">Flujo de efectivo</TabsTrigger>
          <TabsTrigger value="eq">Cambios en el patrimonio</TabsTrigger>
        </TabsList>

        <TabsContent value="trial" className="pt-4">
          <div className="mb-3 flex items-center gap-3">
            {tb.data && (
              <Badge variant={tb.data.balanced ? "secondary" : "destructive"}>
                {tb.data.balanced ? "Cuadrado" : "Descuadrado"}
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!tb.data?.rows.length}
              onClick={() => downloadCsv(`balance-comprobacion-${from}-${to}.csv`, tb.data?.rows ?? [])}
            >
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="py-2 pl-3 pr-3 text-left">Cuenta</th>
                  <th className="py-2 pr-3 text-right">Saldo inicial</th>
                  <th className="py-2 pr-3 text-right">Débito</th>
                  <th className="py-2 pr-3 text-right">Crédito</th>
                  <th className="py-2 pr-3 text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {tb.isLoading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Cargando…
                    </td>
                  </tr>
                )}
                {tb.data?.rows.map((r) => (
                  <tr key={r.account_id} className="border-b border-border/20">
                    <td className="py-1.5 pl-3 pr-3">
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.opening)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.debit)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.credit)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.closing)}</td>
                  </tr>
                ))}
                {tb.data && !tb.data.rows.length && !tb.isLoading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Sin movimientos contabilizados en el periodo.
                    </td>
                  </tr>
                )}
                {tb.data?.rows.length ? (
                  <tr className="bg-muted/40 font-semibold">
                    <td className="py-2 pl-3 pr-3">Totales</td>
                    <td />
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(tb.data.total_debit)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(tb.data.total_credit)}</td>
                    <td />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="pl" className="pt-4">
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <tbody>
                <Section title="Ingresos operacionales" rows={pl.data?.revenue ?? []} />
                <Section title="Costo de ventas" rows={pl.data?.cogs ?? []} />
                <Section title="Gastos operacionales" rows={pl.data?.opex ?? []} />
                <Section title="Otros ingresos y egresos" rows={pl.data?.other ?? []} />
                {pl.data && (
                  <>
                    <tr className="border-t border-border/40 font-semibold">
                      <td className="py-2 pr-3">EBITDA</td>
                      <td className="py-2 text-right font-mono tabular-nums">{money(pl.data.totals.ebitda)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2 pr-3">Resultado neto</td>
                      <td className="py-2 text-right font-mono tabular-nums">{money(pl.data.totals.net)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="bs" className="pt-4">
          {bs.data && (
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <Badge variant={bs.data.balanced ? "secondary" : "destructive"}>
                {bs.data.balanced ? "Activo = Pasivo + Patrimonio" : "Ecuación contable descuadrada"}
              </Badge>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <tbody>
                <Section title="Activo corriente" rows={bs.data?.assets_current ?? []} />
                <Section title="Activo no corriente" rows={bs.data?.assets_non_current ?? []} />
                <Section title="Pasivo corriente" rows={bs.data?.liabilities_current ?? []} />
                <Section title="Pasivo no corriente" rows={bs.data?.liabilities_non_current ?? []} />
                <Section title="Patrimonio" rows={bs.data?.equity ?? []} />
                {bs.data && (
                  <>
                    <tr className="border-b border-border/20">
                      <td className="py-1.5 pr-3">Resultado del ejercicio</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {money(bs.data.result_of_period)}
                      </td>
                    </tr>
                    <tr className="border-t border-border/40 font-semibold">
                      <td className="py-2 pr-3">Total activo</td>
                      <td className="py-2 text-right font-mono tabular-nums">{money(bs.data.total_assets)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2 pr-3">Total pasivo + patrimonio</td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {money(bs.data.total_liabilities + bs.data.total_equity)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="cf" className="pt-4">
          {cf.data && (
            <div className="mb-3 flex items-center gap-2">
              <Badge variant={cf.data.reconciled ? "secondary" : "destructive"}>
                {cf.data.reconciled
                  ? "Conciliado con el movimiento de caja"
                  : "Diferencia frente al movimiento de caja"}
              </Badge>
              <span className="text-xs text-muted-foreground">Método indirecto</span>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <tbody>
                {cf.isLoading && (
                  <tr>
                    <td className="py-6 text-center text-muted-foreground">Cargando…</td>
                  </tr>
                )}
                {cf.data && (
                  <>
                    <GroupHeader title="Actividades de operación" total={cf.data.operating} />
                    <Row label="Resultado neto del periodo" amount={cf.data.net_income} />
                    <Row label="(+) Depreciación" amount={cf.data.depreciation} />
                    <Row label="(+) Amortización" amount={cf.data.amortization} />
                    <FlowRows rows={cf.data.working_capital} />
                    <GroupHeader title="Actividades de inversión" total={cf.data.investing} />
                    <FlowRows rows={cf.data.investing_items} />
                    <GroupHeader title="Actividades de financiación" total={cf.data.financing} />
                    <FlowRows rows={cf.data.financing_items} />
                    <tr className="border-t border-border/40 font-semibold">
                      <td className="py-2 pl-3 pr-3">Variación neta de efectivo</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(cf.data.net_change)}</td>
                    </tr>
                    <Row label="Efectivo al inicio" amount={cf.data.cash_opening} />
                    <Row label="Efectivo al final" amount={cf.data.cash_closing} />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="eq" className="pt-4">
          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/40">
                  <th className="py-2 pl-3 pr-3 text-left">Cuenta de patrimonio</th>
                  <th className="py-2 pr-3 text-right">Saldo inicial</th>
                  <th className="py-2 pr-3 text-right">Aumentos</th>
                  <th className="py-2 pr-3 text-right">Disminuciones</th>
                  <th className="py-2 pr-3 text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {eq.isLoading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">Cargando…</td>
                  </tr>
                )}
                {eq.data?.rows.map((r) => (
                  <tr key={r.code + r.name} className="border-b border-border/20">
                    <td className="py-1.5 pl-3 pr-3">
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.opening)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.increase)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.decrease)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.closing)}</td>
                  </tr>
                ))}
                {eq.data && !eq.data.rows.length && !eq.isLoading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Sin cuentas de patrimonio con movimiento.
                    </td>
                  </tr>
                )}
                {eq.data && (
                  <>
                    <tr className="border-t border-border/40">
                      <td className="py-2 pl-3 pr-3">Resultado del ejercicio</td>
                      <td colSpan={3} />
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">
                        {money(eq.data.result_of_period)}
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2 pl-3 pr-3">Patrimonio al inicio / al final</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(eq.data.opening_total)}</td>
                      <td colSpan={2} />
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(eq.data.closing_total)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupHeader({ title, total }: { title: string; total: number }) {
  return (
    <tr className="bg-muted/40">
      <td className="py-2 pl-3 pr-3 text-xs font-semibold uppercase tracking-wider">{title}</td>
      <td className="py-2 pr-3 text-right font-mono text-xs font-semibold tabular-nums">{money(total)}</td>
    </tr>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="border-b border-border/20">
      <td className="py-1.5 pl-3 pr-3">{label}</td>
      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(amount)}</td>
    </tr>
  );
}

function FlowRows({ rows }: { rows: CashFlowSection[] }) {
  if (!rows.length)
    return (
      <tr>
        <td colSpan={2} className="py-2 pl-3 text-sm text-muted-foreground">
          Sin variaciones.
        </td>
      </tr>
    );
  return (
    <>
      {rows.map((r) => (
        <tr key={r.code + r.name} className="border-b border-border/20">
          <td className="py-1.5 pl-3 pr-3">
            <span className="font-mono text-xs text-muted-foreground">{r.code}</span> {r.name}
          </td>
          <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(r.amount)}</td>
        </tr>
      ))}
    </>
  );
}
