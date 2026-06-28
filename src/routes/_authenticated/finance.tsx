import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2, TrendingUp, ArrowDownRight, ArrowUpRight, FileDown, FileText } from "lucide-react";

import {
  analyzeStatement,
  applyExtractedTransactions,
  createTransaction,
  deleteTransaction,
  getKpis,
  getEbitdaSeries,
  listTransactions,
  monthlyClosingSummary,
} from "@/lib/finance.functions";
import { EXPENSE_CATEGORIES, suggestCategory, type DecimalSeparator } from "@/lib/categories";
import { downloadCsv } from "@/lib/export-utils";
import { generateEbitdaReportPdf } from "@/lib/pdf-report";
import { EbitdaTrendChart } from "@/components/charts/ebitda-trend-chart";
import { EbitdaBucketDonut } from "@/components/charts/ebitda-bucket-donut";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BUCKETS = ["revenue","cogs","opex","depreciation","amortization","interest","tax","other_income","other_expense"] as const;
type Bucket = (typeof BUCKETS)[number];

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({ meta: [{ title: "Qanta — Finanzas" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["finance","kpis"], queryFn: () => getKpis({ data: {} }) }),
      context.queryClient.ensureQueryData({ queryKey: ["finance","tx"], queryFn: () => listTransactions() }),
      context.queryClient.ensureQueryData({ queryKey: ["finance","series",12], queryFn: () => getEbitdaSeries({ data: { months: 12 } }) }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: Finance,
});

function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}
function pct(n: number) {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}

function KpiCard({ label, value, delta, positive }: { label: string; value: string; delta: number; positive?: boolean }) {
  const good = positive ? delta >= 0 : delta <= 0;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={"flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] " + (good ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive")}>
          {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {pct(delta)}
        </div>
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Finance() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();

  const kpisFn = useServerFn(getKpis);
  const txFn = useServerFn(listTransactions);
  const createFn = useServerFn(createTransaction);
  const delFn = useServerFn(deleteTransaction);
  const analyzeFn = useServerFn(analyzeStatement);
  const applyExtractFn = useServerFn(applyExtractedTransactions);
  const closingFn = useServerFn(monthlyClosingSummary);

  const { data: kpis } = useSuspenseQuery({ queryKey: ["finance","kpis"], queryFn: () => kpisFn({ data: {} }) });
  const { data: txs } = useSuspenseQuery({ queryKey: ["finance","tx"], queryFn: () => txFn() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["finance"] });

  const createMut = useMutation({
    mutationFn: (input: { occurred_on: string; description: string; amount: number; bucket: Bucket; currency: string }) =>
      createFn({ data: input }),
    onSuccess: () => { refresh(); toast.success("✓"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: refresh,
  });

  const margin = kpis.current.revenue > 0 ? (kpis.current.ebitda / kpis.current.revenue) * 100 : 0;

  const closingMut = useMutation({
    mutationFn: () => closingFn({ data: { lang } }),
    onSuccess: (res) => {
      toast.success(t("export.closing_ready"));
      generateEbitdaReportPdf({
        month: res.month.slice(0, 7),
        current: res.current,
        previous: res.previous,
        byBucket: res.byBucket,
        transactions: txs as never,
        summary: res.summary,
        lang,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = txs.map((r) => ({
      date: r.occurred_on,
      description: r.description,
      bucket: r.bucket,
      amount: Number(r.amount),
      currency: r.currency,
    }));
    downloadCsv(`qanta-transactions-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{t("fin.ebitda.formula")}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t("fin.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("fin.sub")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={txs.length === 0}>
            <FileDown className="size-4" />{t("export.csv")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => closingMut.mutate()} disabled={closingMut.isPending}>
            <FileText className="size-4" />
            {closingMut.isPending ? t("export.closing_run") : t("export.closing")}
          </Button>
          {canWrite && <AnalyzeDialog analyze={analyzeFn} apply={applyExtractFn} onApplied={refresh} />}
          {canWrite && <AddTxDialog onSubmit={(v) => createMut.mutate(v)} pending={createMut.isPending} />}
        </div>
      </header>

      <ReadOnlyBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t("dash.kpi.revenue")} value={fmt(kpis.current.revenue)} delta={kpis.deltas.revenue} positive />
        <KpiCard label={t("dash.kpi.costs")} value={fmt(kpis.current.costs)} delta={kpis.deltas.costs} />
        <KpiCard label={t("dash.kpi.ebitda")} value={fmt(kpis.current.ebitda)} delta={kpis.deltas.ebitda} positive />
        <KpiCard label={t("dash.kpi.net")} value={fmt(kpis.current.net)} delta={kpis.deltas.net} positive />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EbitdaTrendChart months={12} />
        </div>
        <EbitdaBucketDonut byBucket={kpis.byBucket} />
      </div>

      <section className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("fin.kpi.ebitda_margin")}</h2>
          </div>
          <span className="font-mono text-2xl">{margin.toFixed(1)}%</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {BUCKETS.map((b) => (
            <div key={b} className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t(("fin.bucket." + b) as never)}</div>
              <div className="mt-1 font-mono text-sm">{fmt(kpis.byBucket[b] ?? 0)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass overflow-hidden rounded-2xl">
        {txs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t("fin.empty")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-4 py-3">{t("fin.tx.date")}</th><th className="px-4 py-3">{t("fin.tx.desc")}</th><th className="px-4 py-3">{t("fin.tx.bucket")}</th><th className="px-4 py-3 text-right">{t("fin.tx.amount")}</th><th className="w-10" /></tr>
            </thead>
            <tbody>
              {txs.map((r) => (
                <tr key={r.id} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.occurred_on}</td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider">{t(("fin.bucket." + r.bucket) as never)}</span></td>
                  <td className={"px-4 py-2 text-right font-mono " + (Number(r.amount) >= 0 ? "text-primary" : "text-destructive")}>{fmt(Number(r.amount), r.currency)}</td>
                  <td className="px-2">{canWrite && <Button variant="ghost" size="icon" onClick={() => delMut.mutate(r.id)}><Trash2 className="size-4" /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-center font-mono text-[10px] text-muted-foreground">
        {lang === "es" ? "IA: Gemini vía Lovable AI Gateway" : "AI: Gemini via Lovable AI Gateway"}
      </p>
    </div>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"flex flex-col gap-1 " + (className ?? "")}>
      <Label className="text-xs font-medium text-foreground/90">{label}</Label>
      {children}
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function AddTxDialog({ onSubmit, pending }: { onSubmit: (v: { occurred_on: string; description: string; amount: number; bucket: Bucket; currency: string; expense_category?: string | null }) => void; pending: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [bucket, setBucket] = useState<Bucket>("opex");
  const [category, setCategory] = useState<string>("otros_gastos");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" />{t("fin.add")}</Button>
      </DialogTrigger>
      <DialogContent className="glass max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("fin.add")}</DialogTitle>
          <DialogDescription>{t("edit.preview.hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label={t("fin.tx.date")} hint={t("form.help.tx_date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("fin.tx.desc")} hint={t("form.help.tx_desc")}>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <Field label={t("fin.tx.amount")} hint={t("form.help.tx_amount")}>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label={t("fin.tx.bucket")} hint={t("form.help.tx_bucket")}>
            <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUCKETS.map((b) => <SelectItem key={b} value={b}>{t(("fin.bucket." + b) as never)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("inv.field.category")} hint={t("form.help.tx_category")}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(("cat." + c) as never)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button
            disabled={pending || !desc || !amount}
            onClick={() => {
              onSubmit({ occurred_on: date, description: desc, amount: Number(amount), bucket, currency: "USD", expense_category: category });
              setOpen(false); setDesc(""); setAmount("");
            }}
          >{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AnalyzeResult = Awaited<ReturnType<typeof analyzeStatement>>;
type EditableTx = { occurred_on: string; description: string; amount: number; bucket: Bucket; expense_category: string };
type ApplyExtractFn = (a: { data: { source_name: string; currency: string; transactions: { occurred_on: string; description: string; amount: number; bucket: Bucket; expense_category: string | null }[] } }) => Promise<{ inserted: number }>;

function AnalyzeDialog({ analyze, apply, onApplied }: { analyze: (a: { data: { source_name: string; text: string; currency: string; commit: boolean; decimal_separator?: DecimalSeparator } }) => Promise<AnalyzeResult>; apply: ApplyExtractFn; onApplied: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [sep, setSep] = useState<DecimalSeparator>("auto");
  const [preview, setPreview] = useState<AnalyzeResult | null>(null);
  const [items, setItems] = useState<EditableTx[]>([]);

  const run = useMutation({
    mutationFn: () => analyze({ data: { source_name: source || "statement", text, currency: "USD", commit: false, decimal_separator: sep } }),
    onSuccess: (res) => {
      setPreview(res);
      setItems(res.transactions.map((tx) => ({
        occurred_on: tx.occurred_on,
        description: tx.description,
        amount: Number(tx.amount),
        bucket: tx.bucket as Bucket,
        expense_category: suggestCategory(tx.description),
      })));
      toast.success(`${res.transactions.length} ${t("fin.detected")}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () => apply({ data: {
      source_name: source || "statement",
      currency: "USD",
      transactions: items.map((it) => ({ ...it, expense_category: it.expense_category })),
    }}),
    onSuccess: (res) => {
      toast.success(`${t("fin.applied")}: ${res.inserted}`);
      setOpen(false); setPreview(null); setText(""); setSource(""); setItems([]);
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = (i: number, patch: Partial<EditableTx>) => {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setItems([]); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Sparkles className="size-4" />{t("fin.analyze")}</Button>
      </DialogTrigger>
      <DialogContent className="glass max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />{t("fin.analyze")}</DialogTitle>
          <DialogDescription>{t("edit.preview.hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label={t("fin.statement.source")} hint={t("form.help.statement_source")}>
            <Input value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>
          <Field label={t("dec.label")} hint={t("dec.hint")}>
            <Select value={sep} onValueChange={(v) => setSep(v as DecimalSeparator)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("dec.auto")}</SelectItem>
                <SelectItem value="comma">{t("dec.comma")}</SelectItem>
                <SelectItem value="dot">{t("dec.dot")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("fin.statement.placeholder")} hint={t("form.help.statement_text")}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-xs" />
          </Field>
          {preview && items.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-2 text-xs text-muted-foreground">{preview.summary}</p>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-border/30 p-2">
                    <Input className="col-span-6 sm:col-span-2" type="date" value={it.occurred_on} onChange={(e) => updateItem(i, { occurred_on: e.target.value })} />
                    <Input className="col-span-12 sm:col-span-4" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                    <Input className="col-span-6 sm:col-span-2" type="number" step="0.01" value={it.amount} onChange={(e) => updateItem(i, { amount: Number(e.target.value) })} />
                    <Select value={it.bucket} onValueChange={(v) => updateItem(i, { bucket: v as Bucket })}>
                      <SelectTrigger className="col-span-6 sm:col-span-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BUCKETS.map((b) => <SelectItem key={b} value={b}>{t(("fin.bucket." + b) as never)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={it.expense_category} onValueChange={(v) => updateItem(i, { expense_category: v })}>
                      <SelectTrigger className="col-span-11 sm:col-span-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(("cat." + c) as never)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          {!preview ? (
            <Button disabled={run.isPending || text.length < 20} onClick={() => run.mutate()}>
              {run.isPending ? t("fin.analyzing") : t("fin.analyze.run")}
            </Button>
          ) : (
            <Button disabled={applyMut.isPending || items.length === 0} onClick={() => applyMut.mutate()}>
              {applyMut.isPending ? t("fin.analyzing") : `${t("edit.apply")} (${items.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
