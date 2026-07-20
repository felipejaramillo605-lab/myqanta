import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, BookOpen } from "lucide-react";
import {
  listAccountsCoa, upsertAccount, deleteAccount,
  listJournalEntries, saveJournalEntry, deleteJournalEntry,
} from "@/lib/finance-ext.functions";
import { listJournalTemplates } from "@/lib/journal-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/finance_/journal")({
  head: () => ({ meta: [{ title: "Qanta — Asientos contables" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["coa"], queryFn: () => listAccountsCoa() }),
      context.queryClient.ensureQueryData({ queryKey: ["journal"], queryFn: () => listJournalEntries() }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: JournalPage,
});

type Line = { account_id: string; debit: number; credit: number; description?: string };

function JournalPage() {
  const qc = useQueryClient();
  const coa = useSuspenseQuery({ queryKey: ["coa"], queryFn: () => listAccountsCoa() });
  const entries = useSuspenseQuery({ queryKey: ["journal"], queryFn: () => listJournalEntries() });

  const [entryDate, setEntryDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receiptId, setReceiptId] = useState<string>("");
  const [status, setStatus] = useState<"draft" | "posted">("draft");
  const [lines, setLines] = useState<Line[]>([
    { account_id: "", debit: 0, credit: 0 },
    { account_id: "", debit: 0, credit: 0 },
  ]);

  const totalD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.01 && totalD > 0;

  const saveMut = useMutation({
    mutationFn: (payload: any) => saveJournalEntry({ data: payload }),
    onSuccess: () => {
      toast.success("Asiento guardado");
      qc.invalidateQueries({ queryKey: ["journal"] });
      setLines([{ account_id: "", debit: 0, credit: 0 }, { account_id: "", debit: 0, credit: 0 }]);
      setDescription(""); setReceiptId(""); setStatus("draft");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const delEntryMut = useMutation({
    mutationFn: (id: string) => deleteJournalEntry({ data: { id } }),
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["journal"] }); },
  });

  // Accounts management
  const [acc, setAcc] = useState({ code: "", name: "", type: "asset" as const });
  const saveAccMut = useMutation({
    mutationFn: (payload: any) => upsertAccount({ data: payload }),
    onSuccess: () => { toast.success("Cuenta creada"); qc.invalidateQueries({ queryKey: ["coa"] }); setAcc({ code: "", name: "", type: "asset" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const delAccMut = useMutation({
    mutationFn: (id: string) => deleteAccount({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coa"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Asientos contables</h1>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span>Débito: {totalD.toFixed(2)}</span>
          <span>Crédito: {totalC.toFixed(2)}</span>
          <Badge variant={balanced ? "default" : "destructive"}>{balanced ? "Cuadra" : "No cuadra"}</Badge>
        </div>
      </div>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Libro diario</TabsTrigger>
          <TabsTrigger value="coa">Plan de cuentas</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-4">
          <div className="glass rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              <Input placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
              <Input placeholder="ID comprobante (UUID de documento)" value={receiptId} onChange={(e) => setReceiptId(e.target.value)} />
            </div>
            <TemplatePicker
              coa={coa.data as any[]}
              onApply={(newLines, desc) => {
                setLines(newLines);
                if (desc && !description) setDescription(desc);
              }}
            />
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Select value={l.account_id} onValueChange={(v) => setLines(ls => ls.map((x, j) => j === i ? { ...x, account_id: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="Cuenta" /></SelectTrigger>
                      <SelectContent>
                        {coa.data.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="col-span-3" type="number" step="0.01" placeholder="Débito"
                    value={l.debit || ""} onChange={(e) => setLines(ls => ls.map((x, j) => j === i ? { ...x, debit: Number(e.target.value), credit: 0 } : x))} />
                  <Input className="col-span-3" type="number" step="0.01" placeholder="Crédito"
                    value={l.credit || ""} onChange={(e) => setLines(ls => ls.map((x, j) => j === i ? { ...x, credit: Number(e.target.value), debit: 0 } : x))} />
                  <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setLines(ls => [...ls, { account_id: "", debit: 0, credit: 0 }])}>
                <Plus className="size-4 mr-1" /> Añadir línea
              </Button>
            </div>
            <div className="flex gap-2 justify-end">
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="posted">Publicado</SelectItem>
                </SelectContent>
              </Select>
              <Button disabled={!balanced || lines.some(l => !l.account_id) || saveMut.isPending}
                onClick={() => saveMut.mutate({
                  entry_date: entryDate, description: description || null, status,
                  receipt_document_id: receiptId || null,
                  lines: lines.filter(l => l.account_id).map(l => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
                })}>
                <Save className="size-4 mr-1" /> Guardar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {entries.data.map((e: any) => (
              <div key={e.id} className="glass rounded-xl p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">#{e.entry_no}</span>
                    <span className="text-sm">{e.entry_date}</span>
                    <Badge variant={e.status === "posted" ? "default" : "secondary"}>{e.status}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{e.description}</div>
                  <div className="text-xs mt-1">{e.lines?.length ?? 0} líneas</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => delEntryMut.mutate(e.id)}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="coa" className="space-y-4">
          <div className="glass rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input placeholder="Código" value={acc.code} onChange={(e) => setAcc({ ...acc, code: e.target.value })} />
            <Input placeholder="Nombre" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} />
            <Select value={acc.type} onValueChange={(v: any) => setAcc({ ...acc, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">Activo</SelectItem>
                <SelectItem value="liability">Pasivo</SelectItem>
                <SelectItem value="equity">Patrimonio</SelectItem>
                <SelectItem value="income">Ingreso</SelectItem>
                <SelectItem value="expense">Gasto</SelectItem>
              </SelectContent>
            </Select>
            <Button disabled={!acc.code || !acc.name} onClick={() => saveAccMut.mutate(acc)}>
              <Plus className="size-4 mr-1" /> Crear cuenta
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {coa.data.map((a: any) => (
              <div key={a.id} className="glass rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm">{a.code} · {a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.type}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => delAccMut.mutate(a.id)}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplatePicker({
  coa,
  onApply,
}: {
  coa: Array<{ id: string; code: string; name: string }>;
  onApply: (lines: Line[], description: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [step, setStep] = useState<"accrual" | "payment">("accrual");
  const [amount, setAmount] = useState<string>("");
  const q = useQuery({ queryKey: ["journal-templates"], queryFn: () => listJournalTemplates(), enabled: open });
  const tpl = q.data?.find((t) => t.id === templateId);

  const matchAccount = (code: string | null, name: string) => {
    if (code) {
      const byCode = coa.find((a) => a.code === code);
      if (byCode) return byCode.id;
    }
    const byName = coa.find((a) => a.name.toLowerCase() === name.toLowerCase());
    return byName?.id ?? "";
  };

  const apply = () => {
    if (!tpl) return;
    const amt = Number(amount) || 0;
    const stepLines = tpl.lines.filter((l) => l.step === step).sort((a, b) => a.order_index - b.order_index);
    const newLines: Line[] = stepLines.map((l) => ({
      account_id: matchAccount(l.account_code, l.account_name),
      debit: l.side === "debit" ? amt : 0,
      credit: l.side === "credit" ? amt : 0,
      description: `${l.account_name}`,
    }));
    onApply(newLines, `${tpl.name} — ${step === "accrual" ? "Causación" : "Pago"}`);
    setOpen(false);
    setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="size-4 mr-1" /> Usar plantilla
        </Button>
      </DialogTrigger>
      <DialogContent className="glass max-w-lg">
        <DialogHeader>
          <DialogTitle>Usar plantilla NIIF</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar plantilla" /></SelectTrigger>
            <SelectContent>
              {(q.data ?? []).filter((t) => t.is_active).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name} · {t.niif_category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={step} onValueChange={(v: any) => setStep(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accrual">Causación</SelectItem>
              <SelectItem value="payment">Pago / cancelación</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" step="0.01" placeholder="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {tpl && (
            <div className="text-xs text-muted-foreground space-y-1">
              {tpl.lines.filter((l) => l.step === step).map((l, i) => {
                const matched = matchAccount(l.account_code, l.account_name);
                return (
                  <div key={i} className="flex justify-between">
                    <span>{l.side === "debit" ? "DR" : "CR"} · {l.account_code ? `${l.account_code} · ` : ""}{l.account_name}</span>
                    <span className={matched ? "text-emerald-500" : "text-amber-500"}>
                      {matched ? "✓ cuenta encontrada" : "⚠ crear cuenta"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!tpl || !amount} onClick={apply}>Prellenar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}