import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { listThirdParties, upsertThirdParty, deleteThirdParty } from "@/lib/finance-ext.functions";
import { getPartyAging } from "@/lib/finance-assets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/finance_/parties")({
  head: () => ({ meta: [{ title: "Qanta — Matriz de terceros" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({ queryKey: ["third_parties"], queryFn: () => listThirdParties() });
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-destructive text-sm">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: PartiesPage,
});

function PartiesPage() {
  const qc = useQueryClient();
  const q = useSuspenseQuery({ queryKey: ["third_parties"], queryFn: () => listThirdParties() });
  const [open, setOpen] = useState(false);
  const empty = { kind: "supplier" as const, name: "", tax_id: "", email: "", phone: "", address: "", tax_regime: "", applicable_taxes: { vat: false, ica: false, retention: false } as any, contract_document_id: "", notes: "" };
  const [form, setForm] = useState<any>(empty);

  const saveMut = useMutation({
    mutationFn: (data: any) => upsertThirdParty({ data }),
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["third_parties"] }); setOpen(false); setForm(empty); },
    onError: (e: any) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => deleteThirdParty({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["third_parties"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Matriz de terceros</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="size-4 mr-1" /> Nuevo</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Tercero</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Cliente</SelectItem>
                  <SelectItem value="supplier">Proveedor</SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="NIT / identificación fiscal" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
              <Input placeholder="Régimen tributario" value={form.tax_regime} onChange={(e) => setForm({ ...form, tax_regime: e.target.value })} />
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Textarea className="col-span-2" placeholder="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className="col-span-2 space-y-2">
                <div className="text-xs text-muted-foreground">Impuestos y retenciones aplicables</div>
                <div className="flex gap-4 text-sm">
                  {["vat", "ica", "retention"].map((k) => (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" checked={!!form.applicable_taxes?.[k]}
                        onChange={(e) => setForm({ ...form, applicable_taxes: { ...form.applicable_taxes, [k]: e.target.checked } })} />
                      {k.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
              <Input className="col-span-2" placeholder="ID contrato (documento vinculado — módulo Legal próximo)"
                value={form.contract_document_id ?? ""} onChange={(e) => setForm({ ...form, contract_document_id: e.target.value })} />
              <Textarea className="col-span-2" placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button onClick={() => saveMut.mutate({ ...form, contract_document_id: form.contract_document_id || null })}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {q.data.map((p: any) => (
          <div key={p.id} className="glass rounded-xl p-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <Badge variant="secondary">{p.kind}</Badge>
                {p.contract_document_id && <Badge variant="outline"><LinkIcon className="size-3 mr-1" />contrato</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{p.tax_id} · {p.tax_regime} · {Object.keys(p.applicable_taxes || {}).filter((k) => p.applicable_taxes[k]).join(", ") || "sin impuestos"}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => delMut.mutate(p.id)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>

      <AgingSection />
    </div>
  );
}
function AgingSection() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const aging = useQuery({ queryKey: ["party_aging", asOf], queryFn: () => getPartyAging({ data: { as_of: asOf } }) });
  const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

  const table = (title: string, rows: any[]) => (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="border-b border-border/40 px-3 py-2 text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Tercero</th>
            <th className="px-3 py-2 text-right">0-30</th>
            <th className="px-3 py-2 text-right">31-60</th>
            <th className="px-3 py-2 text-right">61-90</th>
            <th className="px-3 py-2 text-right">90+</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((r) => (
            <tr key={r.third_party_id}>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt.format(r.d0_30)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt.format(r.d31_60)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmt.format(r.d61_90)}</td>
              <td className="px-3 py-2 text-right font-mono text-destructive">{fmt.format(r.d90_plus)}</td>
              <td className="px-3 py-2 text-right font-mono font-medium">{fmt.format(r.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Sin saldos pendientes.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Cartera por antigüedad (30/60/90/90+)</h2>
        <div>
          <label className="text-xs text-muted-foreground">Corte</label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
        </div>
      </div>
      {table("Por cobrar (clientes)", aging.data?.receivables ?? [])}
      {table("Por pagar (proveedores)", aging.data?.payables ?? [])}
      <p className="text-xs text-muted-foreground">
        Calculado sobre asientos publicados con tercero asociado en cuentas 13xx (por cobrar) y 22xx/23xx (por pagar).
      </p>
    </div>
  );
}
