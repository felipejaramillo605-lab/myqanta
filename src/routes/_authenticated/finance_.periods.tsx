import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, LockOpen, CheckCircle2, AlertTriangle, Upload, ListChecks, ExternalLink } from "lucide-react";
import {
  getMonthlyReconciliation,
  closeBankReconciliation,
  reopenBankReconciliation,
  listAccountingPeriods,
  setAccountingPeriodStatus,
  importBankStatement,
} from "@/lib/finance-periods.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const currentMonth = () => new Date().toISOString().slice(0, 7);

type ParsedRow = { occurred_on: string; description: string | null; reference: string | null; amount: number };

/** Acepta filas "fecha;descripción;referencia;valor" o "fecha,descripción,valor" (CSV o pegado). */
function parseStatementText(text: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    if (idx === 0 && /fecha|date/i.test(line) && /valor|monto|amount/i.test(line)) return; // encabezado
    const sep = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
    const cells = line.split(sep).map((c) => c.replace(/^"|"$/g, "").trim());
    if (cells.length < 2) { errors.push(`Línea ${idx + 1}: faltan columnas`); return; }
    const rawDate = cells[0]!;
    let occurred_on = rawDate;
    const dmy = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) occurred_on = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred_on)) { errors.push(`Línea ${idx + 1}: fecha inválida "${rawDate}"`); return; }
    const rawAmount = cells[cells.length - 1]!.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount)) { errors.push(`Línea ${idx + 1}: valor inválido "${cells[cells.length - 1]}"`); return; }
    const description = cells.length >= 3 ? cells[1] || null : null;
    const reference = cells.length >= 4 ? cells[2] || null : null;
    rows.push({ occurred_on, description, reference, amount });
  });
  return { rows, errors };
}

export const Route = createFileRoute("/_authenticated/finance_/periods")({
  head: () => ({
    meta: [
      { title: "Qanta — Cierre mensual y periodos contables" },
      {
        name: "description",
        content:
          "Conciliación mensual de cuentas bancarias y terceros, con bloqueo de periodos contables para evitar asientos en meses cerrados.",
      },
      { property: "og:title", content: "Cierre mensual y periodos contables — Qanta" },
      {
        property: "og:description",
        content: "Concilia bancos y terceros por mes y cierra el periodo para bloquear nuevos asientos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const month = currentMonth();
    await context.queryClient.ensureQueryData({
      queryKey: ["month_recon", month],
      queryFn: () => getMonthlyReconciliation({ data: { period_month: month } }),
    });
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: PeriodsPage,
});

const money = (n: number) => Number(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });

function PeriodsPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [statement, setStatement] = useState<Record<string, string>>({});

  const recon = useSuspenseQuery({
    queryKey: ["month_recon", month],
    queryFn: () => getMonthlyReconciliation({ data: { period_month: month } }),
  });
  const periods = useSuspenseQuery({
    queryKey: ["acc_periods", year],
    queryFn: () => listAccountingPeriods({ data: { year } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["month_recon"] });
    qc.invalidateQueries({ queryKey: ["acc_periods"] });
  };

  const closeBankMut = useMutation({
    mutationFn: (d: { bank_account_id: string; statement_balance: number }) =>
      closeBankReconciliation({ data: { ...d, period_month: month } }),
    onSuccess: () => { toast.success("Conciliación cerrada"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const reopenBankMut = useMutation({
    mutationFn: (id: string) => reopenBankReconciliation({ data: { bank_account_id: id, period_month: month } }),
    onSuccess: () => { toast.success("Conciliación reabierta"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const periodMut = useMutation({
    mutationFn: (d: { month: number; status: "open" | "closed"; year?: number }) =>
      setAccountingPeriodStatus({ data: { year: d.year ?? year, month: d.month, status: d.status } }),
    onSuccess: (r: any) => {
      toast.success(r.status === "closed" ? "Periodo cerrado" : "Periodo reabierto");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const data = recon.data;
  const selYear = Number(month.slice(0, 4));
  const selMonth = Number(month.slice(5, 7));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cierre mensual</h1>
          <p className="text-sm text-muted-foreground">
            Concilia bancos y terceros, luego bloquea el periodo contable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} className="w-40" />
          {data.period_status === "closed" ? (
            <Badge variant="secondary" className="gap-1"><Lock className="size-3" /> Periodo cerrado</Badge>
          ) : (
            <Badge className="gap-1"><LockOpen className="size-3" /> Periodo abierto</Badge>
          )}
          {data.period_status === "closed" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={periodMut.isPending}
              onClick={() => periodMut.mutate({ month: selMonth, status: "open", year: selYear })}
            >
              <LockOpen className="size-4 mr-1" /> Reabrir periodo
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={periodMut.isPending}
              onClick={() => periodMut.mutate({ month: selMonth, status: "closed", year: selYear })}
            >
              <Lock className="size-4 mr-1" /> Cerrar periodo {month}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="banks">
        <TabsList>
          <TabsTrigger value="banks">Bancos ({data.banks.length})</TabsTrigger>
          <TabsTrigger value="parties">Terceros ({data.third_parties.length})</TabsTrigger>
          <TabsTrigger value="periods">Periodos contables</TabsTrigger>
        </TabsList>

        <TabsContent value="banks" className="space-y-3">
          {!data.banks.length && (
            <div className="text-sm text-muted-foreground">No hay cuentas bancarias registradas.</div>
          )}
          {data.banks.map((b) => {
            const ok = Math.abs(b.difference) <= 0.01 && b.unreconciled === 0;
            return (
              <div key={b.bank_account_id} className="glass rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {b.bank_name} {b.account_number_masked ? `· ${b.account_number_masked}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">{b.currency}</div>
                  </div>
                  {b.status === "closed" ? (
                    <Badge variant="secondary" className="gap-1"><Lock className="size-3" /> Conciliado</Badge>
                  ) : ok ? (
                    <Badge className="gap-1"><CheckCircle2 className="size-3" /> Listo para cerrar</Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" /> Con diferencias</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <Stat label="Saldo inicial libros" value={money(b.book_opening)} />
                  <Stat label="Movimiento libros" value={money(b.book_movement)} />
                  <Stat label="Saldo final libros" value={money(b.book_closing)} />
                  <Stat label="Extracto" value={money(b.statement_balance)} />
                  <Stat
                    label="Diferencia"
                    value={money(b.difference)}
                    tone={Math.abs(b.difference) > 0.01 ? "bad" : "good"}
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  Movimientos del mes sin conciliar: <strong>{b.unreconciled}</strong>
                </div>

                {b.items.length > 0 && (
                  <div className="rounded-xl border border-border/40 overflow-x-auto">
                    <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Partidas conciliatorias
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border/40">
                          <th className="p-2 text-left">Fecha</th>
                          <th className="p-2 text-left">Descripción</th>
                          <th className="p-2 text-left">Referencia</th>
                          <th className="p-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.items.map((it) => (
                          <tr key={it.id} className="border-b border-border/20">
                            <td className="p-2 whitespace-nowrap">{it.occurred_on}</td>
                            <td className="p-2">{it.description ?? "—"}</td>
                            <td className="p-2 text-muted-foreground">{it.reference ?? "—"}</td>
                            <td className="p-2 text-right font-mono tabular-nums">{money(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {b.status === "closed" ? (
                  <Button size="sm" variant="ghost" onClick={() => reopenBankMut.mutate(b.bank_account_id)}>
                    <LockOpen className="size-4 mr-1" /> Reabrir conciliación
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Saldo del extracto</div>
                      <Input
                        type="number"
                        className="w-40"
                        value={statement[b.bank_account_id] ?? String(b.book_closing)}
                        onChange={(e) => setStatement({ ...statement, [b.bank_account_id]: e.target.value })}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={closeBankMut.isPending}
                      onClick={() =>
                        closeBankMut.mutate({
                          bank_account_id: b.bank_account_id,
                          statement_balance: Number(statement[b.bank_account_id] ?? b.book_closing),
                        })
                      }
                    >
                      <Lock className="size-4 mr-1" /> Cerrar conciliación
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="parties">
          <div className="glass rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/50">
                  <th className="text-left p-3">Tercero</th>
                  <th className="text-left p-3">NIT / CC</th>
                  <th className="text-right p-3">Saldo inicial</th>
                  <th className="text-right p-3">Débito</th>
                  <th className="text-right p-3">Crédito</th>
                  <th className="text-right p-3">Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {data.third_parties.map((p) => (
                  <tr key={p.third_party_id} className="border-b border-border/30">
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.tax_id ?? "—"}</td>
                    <td className="p-3 text-right">{money(p.opening)}</td>
                    <td className="p-3 text-right">{money(p.debit)}</td>
                    <td className="p-3 text-right">{money(p.credit)}</td>
                    <td className="p-3 text-right font-medium">{money(p.closing)}</td>
                  </tr>
                ))}
                {!data.third_parties.length && (
                  <tr><td colSpan={6} className="p-4 text-muted-foreground">Sin movimientos de terceros en el periodo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="periods" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-muted-foreground">Año</div>
            <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {periods.data.map((p) => (
              <div key={p.month} className="glass rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{MONTHS[p.month - 1]} {p.year}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.entries} publicados · {p.drafts} borradores
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === "closed" ? (
                    <>
                      <Badge variant="secondary" className="gap-1"><Lock className="size-3" /> Cerrado</Badge>
                      <Button size="sm" variant="ghost"
                        onClick={() => periodMut.mutate({ month: p.month, status: "open" })}>
                        Reabrir
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline"
                      onClick={() => periodMut.mutate({ month: p.month, status: "closed" })}>
                      <Lock className="size-4 mr-1" /> Cerrar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "bad" ? "text-destructive font-medium" : tone === "good" ? "text-primary font-medium" : "font-medium"}>
        {value}
      </div>
    </div>
  );
}
