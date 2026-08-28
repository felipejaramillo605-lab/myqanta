import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { listBankAccounts, upsertBankAccount, deleteBankAccount, listBankTransactions, upsertBankTransaction, getBankBalancesConverted } from "@/lib/finance-ext.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/finance_/banks")({
  head: () => ({ meta: [{ title: "Qanta — Bancos" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["banks"], queryFn: () => listBankAccounts() });
    await context.queryClient.ensureQueryData({ queryKey: ["bank_txs"], queryFn: () => listBankTransactions({ data: {} }) });
    await context.queryClient.ensureQueryData({ queryKey: ["bank_fx"], queryFn: () => getBankBalancesConverted() }).catch(() => null);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: BanksPage,
});

function BanksPage() {
  const qc = useQueryClient();
  const banks = useSuspenseQuery({ queryKey: ["banks"], queryFn: () => listBankAccounts() });
  const txs = useSuspenseQuery({ queryKey: ["bank_txs"], queryFn: () => listBankTransactions({ data: {} }) });
  const fxQ = useQuery({ queryKey: ["bank_fx"], queryFn: () => getBankBalancesConverted(), retry: false });
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const empty = { bank_name: "", account_number_masked: "", currency: "COP", opening_balance: 0, current_balance: 0, active: true, notes: "" };
  const [form, setForm] = useState<any>(empty);

  const saveMut = useMutation({
    mutationFn: (d: any) => upsertBankAccount({ data: d }),
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["banks"] }); setOpen(false); setForm(empty); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({ mutationFn: (id: string) => deleteBankAccount({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["banks"] }) });

  const [tx, setTx] = useState({ bank_account_id: "", occurred_on: new Date().toISOString().slice(0, 10), description: "", reference: "", amount: 0 });
  const saveTxMut = useMutation({
    mutationFn: (d: any) => upsertBankTransaction({ data: d }),
    onSuccess: (res: any) => {
      toast.success("Movimiento registrado");
      const fx = res?.fx;
      if (fx?.difference && Math.abs(fx.difference) >= 0.01) {
        const label = fx.applied ? t("fin.fx.diff_recorded") : t("fin.fx.diff_pending");
        toast.info(`${label}: ${Number(fx.difference).toLocaleString()} ${fx.base_currency ?? ""}`, {
          description: fx.warning ?? `${t("fin.fx.rate")} ${fx.rate_at_date} → ${fx.rate_latest}`,
        });
      } else if (fx?.warning) {
        toast.warning(fx.warning);
      }
      qc.invalidateQueries({ queryKey: ["bank_txs"] });
      qc.invalidateQueries({ queryKey: ["bank_fx"] });
      setTx({ ...tx, description: "", reference: "", amount: 0 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bancos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-1" /> Nueva cuenta</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cuenta bancaria</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Banco" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              <Input placeholder="Número (enmascarado)" value={form.account_number_masked} onChange={(e) => setForm({ ...form, account_number_masked: e.target.value })} />
              <Input placeholder="Moneda" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              <Input type="number" placeholder="Saldo inicial" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value), current_balance: Number(e.target.value) })} />
            </div>
            <DialogFooter><Button onClick={() => saveMut.mutate(form)}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Cuentas</TabsTrigger>
          <TabsTrigger value="txs">Movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="space-y-2">
          {banks.data.map((b: any) => (
            <div key={b.id} className="glass rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{b.bank_name} · {b.account_number_masked}</div>
                <div className="text-xs text-muted-foreground">{b.currency} · Saldo: {Number(b.current_balance).toLocaleString()}</div>
                {fxQ.data?.accounts?.[b.id] && (
                  <div className="text-xs text-primary">
                    {t("fin.fx.converted")} {Number(fxQ.data.accounts[b.id]!.converted).toLocaleString()} {fxQ.data.accounts[b.id]!.base_currency}
                    <span className="text-muted-foreground"> · {t("fin.fx.rate")} {fxQ.data.accounts[b.id]!.rate} {t("fin.fx.as_of")} {fxQ.data.accounts[b.id]!.rate_date}</span>
                  </div>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => delMut.mutate(b.id)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </TabsContent>
        <TabsContent value="txs" className="space-y-3">
          <div className="glass rounded-2xl p-4 grid grid-cols-1 md:grid-cols-6 gap-2">
            <Select value={tx.bank_account_id} onValueChange={(v) => setTx({ ...tx, bank_account_id: v })}>
              <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Cuenta" /></SelectTrigger>
              <SelectContent>
                {banks.data.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bank_name} · {b.account_number_masked}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={tx.occurred_on} onChange={(e) => setTx({ ...tx, occurred_on: e.target.value })} />
            <Input placeholder="Descripción" value={tx.description} onChange={(e) => setTx({ ...tx, description: e.target.value })} />
            <Input placeholder="Referencia" value={tx.reference} onChange={(e) => setTx({ ...tx, reference: e.target.value })} />
            <Input type="number" placeholder="Monto (± signo)" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: Number(e.target.value) })} />
            <Button className="md:col-span-6" disabled={!tx.bank_account_id || !tx.amount} onClick={() => saveTxMut.mutate(tx)}>Registrar movimiento</Button>
          </div>
          <div className="space-y-2">
            {txs.data.map((t: any) => (
              <div key={t.id} className="glass rounded-lg p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono text-xs">{t.occurred_on}</span> · {t.description} <span className="text-muted-foreground">{t.reference}</span>
                </div>
                <div className={t.amount < 0 ? "text-destructive" : "text-primary"}>{Number(t.amount).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}