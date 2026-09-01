import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, ScrollText } from "lucide-react";
import { downloadCsv } from "@/lib/export-utils";
import {
  getBalanceSheet,
  getIncomeStatement,
  getTrialBalance,
  type StatementLine,
} from "@/lib/finance-statements.functions";

export const Route = createFileRoute("/_authenticated/finance_/statements")({
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
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

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

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          Desde
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
        </label>
        <label className="text-xs text-muted-foreground">
          Hasta / corte
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
        </label>
      </div>

      <Tabs defaultValue="trial">
        <TabsList>
          <TabsTrigger value="trial">Balance de comprobación</TabsTrigger>
          <TabsTrigger value="pl">Estado de resultados</TabsTrigger>
          <TabsTrigger value="bs">Situación financiera</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
