import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BookOpen, Download, Lock, LockOpen, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { listJournalEntriesByMonth, setAccountingPeriodStatus, type PeriodEntry } from "@/lib/finance-periods.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv } from "@/lib/export-utils";

const currentMonth = () => new Date().toISOString().slice(0, 7);

const searchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  status: z.enum(["all", "posted", "draft"]).optional(),
});

export const Route = createFileRoute("/_authenticated/finance_/period-entries")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Qanta — Asientos por periodo" },
      {
        name: "description",
        content: "Revisa qué asientos se contabilizaron y cuáles siguen en borrador en cada mes, y cierra el periodo.",
      },
      { property: "og:title", content: "Asientos por periodo — Qanta" },
      { property: "og:description", content: "Asientos publicados y en borrador por mes, con cierre del periodo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: PeriodEntriesPage,
});

const money = (n: number) => Number(n ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 2 });

function PeriodEntriesPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const month = search.month ?? currentMonth();
  const status = search.status ?? "all";
  const [q, setQ] = useState("");

  const data = useQuery({
    queryKey: ["period_entries", month],
    queryFn: () => listJournalEntriesByMonth({ data: { period_month: month } }),
  });

  const periodMut = useMutation({
    mutationFn: (s: "open" | "closed") =>
      setAccountingPeriodStatus({
        data: { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)), status: s },
      }),
    onSuccess: (r: any) => {
      toast.success(r.status === "closed" ? "Periodo cerrado" : "Periodo reabierto");
      qc.invalidateQueries({ queryKey: ["period_entries"] });
      qc.invalidateQueries({ queryKey: ["month_recon"] });
      qc.invalidateQueries({ queryKey: ["acc_periods"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const all = data.data?.entries ?? [];
  const filtered = all
    .filter((e) => (status === "all" ? true : status === "posted" ? e.status === "posted" : e.status !== "posted"))
    .filter((e) =>
      !q.trim()
        ? true
        : `${e.entry_no ?? ""} ${e.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()),
    );
  const totals = data.data?.totals;
  const closed = data.data?.period_status === "closed";

  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const exportCsv = () =>
    downloadCsv(
      `asientos-${month}-${status}.csv`,
      filtered.map((e) => ({
        numero: e.entry_no ?? "",
        fecha: e.entry_date,
        descripcion: e.description ?? "",
        estado: e.status === "posted" ? "contabilizado" : "borrador",
        lineas: e.lines,
        debito: e.debit,
        credito: e.credit,
        cuadrado: e.balanced ? "sí" : "no",
      })),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold">Asientos por periodo</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Qué se contabilizó y qué sigue en borrador en cada mes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setSearch({ month: e.target.value || currentMonth() })}
            className="w-40"
          />
          {data.data && (
            closed ? (
              <>
                <Badge variant="secondary" className="gap-1"><Lock className="size-3" /> Periodo cerrado</Badge>
                <Button size="sm" variant="ghost" disabled={periodMut.isPending} onClick={() => periodMut.mutate("open")}>
                  <LockOpen className="size-4 mr-1" /> Reabrir
                </Button>
              </>
            ) : (
              <>
                <Badge className="gap-1"><LockOpen className="size-3" /> Periodo abierto</Badge>
                <Button
                  size="sm"
                  disabled={periodMut.isPending || (totals?.drafts ?? 0) > 0}
                  title={(totals?.drafts ?? 0) > 0 ? "Publica o elimina los borradores antes de cerrar" : undefined}
                  onClick={() => periodMut.mutate("closed")}
                >
                  <Lock className="size-4 mr-1" /> Cerrar periodo
                </Button>
              </>
            )
          )}
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Contabilizados" value={String(totals.posted)} />
          <Kpi label="Borradores" value={String(totals.drafts)} tone={totals.drafts ? "bad" : "good"} />
          <Kpi label="Débitos" value={money(totals.posted_debit)} />
          <Kpi label="Créditos" value={money(totals.posted_credit)} />
          <Kpi
            label="Diferencia"
            value={money(totals.posted_debit - totals.posted_credit)}
            tone={Math.abs(totals.posted_debit - totals.posted_credit) > 0.01 ? "bad" : "good"}
          />
        </div>
      )}

      {totals && totals.drafts > 0 && !closed && (
        <div className="rounded-xl bg-destructive/10 text-destructive text-sm p-3 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            Hay {totals.drafts} asiento(s) en borrador. No se puede cerrar {month} hasta publicarlos o eliminarlos en{" "}
            <Link to="/finance/journal" className="underline">Asientos contables</Link>.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={status} onValueChange={(v) => setSearch({ status: v as typeof status })}>
          <TabsList>
            <TabsTrigger value="all">Todos ({all.length})</TabsTrigger>
            <TabsTrigger value="posted">Contabilizados ({totals?.posted ?? 0})</TabsTrigger>
            <TabsTrigger value="draft">Borradores ({totals?.drafts ?? 0})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Input placeholder="Buscar # o descripción" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <Button size="sm" variant="outline" disabled={!filtered.length} onClick={exportCsv}>
            <Download className="size-4 mr-1" /> CSV
          </Button>
          <Link to="/finance/periods" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ExternalLink className="size-3" /> Cierre mensual
          </Link>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border/50">
              <th className="text-left p-3">#</th>
              <th className="text-left p-3">Fecha</th>
              <th className="text-left p-3">Descripción</th>
              <th className="text-left p-3">Estado</th>
              <th className="text-right p-3">Líneas</th>
              <th className="text-right p-3">Débito</th>
              <th className="text-right p-3">Crédito</th>
              <th className="text-center p-3">Cuadre</th>
            </tr>
          </thead>
          <tbody>
            {data.isLoading && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {filtered.map((e: PeriodEntry) => (
              <tr key={e.id} className="border-b border-border/30">
                <td className="p-3 font-mono text-xs">{e.entry_no ?? "—"}</td>
                <td className="p-3 whitespace-nowrap">{e.entry_date}</td>
                <td className="p-3">{e.description ?? "—"}</td>
                <td className="p-3">
                  {e.status === "posted" ? (
                    <Badge variant="secondary">Contabilizado</Badge>
                  ) : (
                    <Badge variant="outline">Borrador</Badge>
                  )}
                </td>
                <td className="p-3 text-right">{e.lines}</td>
                <td className="p-3 text-right font-mono tabular-nums">{money(e.debit)}</td>
                <td className="p-3 text-right font-mono tabular-nums">{money(e.credit)}</td>
                <td className="p-3 text-center">
                  {e.balanced ? (
                    <CheckCircle2 className="size-4 inline text-primary" />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive text-xs">
                      <AlertTriangle className="size-4" /> {money(e.debit - e.credit)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {data.data && !filtered.length && !data.isLoading && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin asientos para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}
