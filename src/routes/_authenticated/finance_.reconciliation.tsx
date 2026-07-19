import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Zap, Link2, Unlink } from "lucide-react";
import { listReconciliation, autoReconcile, manualReconcile, unmatchReconciliation } from "@/lib/finance-ext.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/finance_/reconciliation")({
  head: () => ({ meta: [{ title: "Qanta — Conciliación bancaria" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["recon"], queryFn: () => listReconciliation() });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: ReconciliationPage,
});

function ReconciliationPage() {
  const qc = useQueryClient();
  const data = useSuspenseQuery({ queryKey: ["recon"], queryFn: () => listReconciliation() });
  const [amtTol, setAmtTol] = useState(500);
  const [dateTol, setDateTol] = useState(3);
  const [manualEntry, setManualEntry] = useState<Record<string, string>>({});

  const autoMut = useMutation({
    mutationFn: () => autoReconcile({ data: { amount_tolerance: amtTol, date_tolerance_days: dateTol } }),
    onSuccess: (r: any) => { toast.success(`${r.matched} conciliados automáticamente`); qc.invalidateQueries({ queryKey: ["recon"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const manualMut = useMutation({
    mutationFn: (d: any) => manualReconcile({ data: d }),
    onSuccess: () => { toast.success("Conciliado"); qc.invalidateQueries({ queryKey: ["recon"] }); },
  });
  const unMut = useMutation({
    mutationFn: (id: string) => unmatchReconciliation({ data: { bank_transaction_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recon"] }),
  });

  const pending = (data.data.txs as any[]).filter((t) => !t.reconciled_entry_id);
  const matched = (data.data.txs as any[]).filter((t) => t.reconciled_entry_id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Conciliación bancaria</h1>

      <div className="glass rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Tolerancia monto</div>
          <Input type="number" value={amtTol} onChange={(e) => setAmtTol(Number(e.target.value))} className="w-32" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Tolerancia días</div>
          <Input type="number" value={dateTol} onChange={(e) => setDateTol(Number(e.target.value))} className="w-24" />
        </div>
        <Button onClick={() => autoMut.mutate()} disabled={autoMut.isPending}>
          <Zap className="size-4 mr-1" /> Auto-conciliar
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pendientes ({pending.length})</TabsTrigger>
          <TabsTrigger value="matched">Conciliados ({matched.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-2">
          {pending.map((t) => (
            <div key={t.id} className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm">{t.occurred_on} · {t.description}</div>
                <div className="text-xs text-muted-foreground">Ref: {t.reference} · {Number(t.amount).toLocaleString()}</div>
              </div>
              <Select value={manualEntry[t.id] ?? ""} onValueChange={(v) => setManualEntry({ ...manualEntry, [t.id]: v })}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Elegir asiento" /></SelectTrigger>
                <SelectContent>
                  {(data.data.entries as any[]).map((e) => (
                    <SelectItem key={e.id} value={e.id}>#{e.entry_no} · {e.entry_date} · {e.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!manualEntry[t.id]}
                onClick={() => manualMut.mutate({ bank_transaction_id: t.id, journal_entry_id: manualEntry[t.id] })}>
                <Link2 className="size-4 mr-1" /> Conciliar
              </Button>
            </div>
          ))}
          {!pending.length && <div className="text-sm text-muted-foreground">Nada pendiente 🎉</div>}
        </TabsContent>

        <TabsContent value="matched" className="space-y-2">
          {matched.map((t) => {
            const m = (data.data.matches as any[]).find((x) => x.bank_transaction_id === t.id);
            return (
              <div key={t.id} className="glass rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm">{t.occurred_on} · {t.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {Number(t.amount).toLocaleString()} · {m?.auto ? <Badge variant="secondary">auto</Badge> : <Badge>manual</Badge>}
                    {m && Math.abs(m.diff) > 0.01 && <span className="ml-2">diff: {Number(m.diff).toFixed(2)}</span>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => unMut.mutate(t.id)}><Unlink className="size-4 mr-1" /> Deshacer</Button>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}