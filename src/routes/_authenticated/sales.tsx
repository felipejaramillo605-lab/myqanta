import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, FileText, CircleDollarSign, Send, Ban, Download, Pencil } from "lucide-react";

import {
  addPayment, deleteCustomer, deleteInvoice, deletePayment, getInvoice, issueInvoice,
  listCustomers, listInvoices, saveInvoiceDraft, upsertCustomer, voidInvoice,
} from "@/lib/sales.functions";
import { listProducts } from "@/lib/inventory.functions";
import { listAccounts } from "@/lib/finance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({ meta: [
    { title: "Qanta — Ventas y Facturación" },
    { name: "description", content: "Gestión de clientes, facturas y cobros para tu negocio." },
  ] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["sales-invoices"], queryFn: () => listInvoices() }),
      context.queryClient.ensureQueryData({ queryKey: ["sales-customers"], queryFn: () => listCustomers() }),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">404</div>,
  component: SalesPage,
});

type Invoice = {
  id: string; number: number | null; status: "draft" | "issued" | "paid" | "void";
  issue_date: string; due_date: string | null; currency: string;
  subtotal: number; tax_amount: number; total: number; paid_amount: number;
  customer_id: string | null; customer_name_snapshot: string | null;
};
type Customer = {
  id: string; name: string; tax_id: string | null; email: string | null;
  phone: string | null; address: string | null; notes: string | null; archived: boolean;
};

function fmt(n: number, cur = "EUR") {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur }).format(Number(n) || 0);
}

const STATUS_BADGE: Record<Invoice["status"], { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Emitida", cls: "bg-blue-500/10 text-blue-500" },
  paid: { label: "Pagada", cls: "bg-emerald-500/10 text-emerald-500" },
  void: { label: "Anulada", cls: "bg-destructive/10 text-destructive" },
};

function SalesPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">ERP · SALES</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Ventas y Facturación</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clientes, facturas y cobros. Al emitir, el stock se descuenta; al cobrar en una cuenta, se registra en Finanzas.
        </p>
      </header>
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Facturas</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><InvoicesPanel /></TabsContent>
        <TabsContent value="customers"><CustomersPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

/* =================== Customers =================== */
function CustomersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCustomers);
  const saveFn = useServerFn(upsertCustomer);
  const delFn = useServerFn(deleteCustomer);
  const { data: customers } = useSuspenseQuery({ queryKey: ["sales-customers"], queryFn: () => listFn() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sales-customers"] });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CustomerDialog onSave={(v) => saveFn({ data: v }).then(() => { refresh(); toast.success("Cliente guardado"); }).catch((e: Error) => toast.error(e.message))} />
      </div>
      {customers.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Aún no hay clientes. Añade el primero para facturar.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(customers as Customer[]).map((c) => (
            <div key={c.id} className="glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  {c.tax_id && <div className="font-mono text-[10px] text-muted-foreground">{c.tax_id}</div>}
                </div>
                <div className="flex gap-1">
                  <CustomerDialog customer={c} onSave={(v) => saveFn({ data: { ...v, id: c.id } }).then(() => { refresh(); toast.success("Actualizado"); }).catch((e: Error) => toast.error(e.message))} />
                  <Button variant="ghost" size="icon" onClick={() => {
                    if (!confirm(`Eliminar cliente ${c.name}?`)) return;
                    delFn({ data: { id: c.id } }).then(() => { refresh(); toast.success("Eliminado"); }).catch((e: Error) => toast.error(e.message));
                  }}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {c.email && <div>{c.email}</div>}
                {c.phone && <div>{c.phone}</div>}
                {c.address && <div className="line-clamp-2">{c.address}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerDialog({ customer, onSave }: { customer?: Customer; onSave: (v: Omit<Customer, "id" | "archived">) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    tax_id: customer?.tax_id ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {customer
          ? <Button variant="ghost" size="icon"><Pencil className="size-4" /></Button>
          : <Button size="sm"><Plus className="mr-2 size-4" />Nuevo cliente</Button>}
      </DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{customer ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>NIF/CIF</Label><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Dirección</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Notas</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => {
            if (!form.name.trim()) return toast.error("Nombre requerido");
            onSave(form as never);
            setOpen(false);
          }}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== Invoices =================== */
function InvoicesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvoices);
  const delFn = useServerFn(deleteInvoice);
  const voidFn = useServerFn(voidInvoice);
  const issueFn = useServerFn(issueInvoice);
  const { data: invoices } = useSuspenseQuery({ queryKey: ["sales-invoices"], queryFn: () => listFn() });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["sales-invoices"] });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-2 size-4" />Nueva factura</Button>
      </div>

      {invoices.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Aún no hay facturas. Crea la primera.
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Nº</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Cobrado</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(invoices as unknown as Invoice[]).map((inv) => (
                <tr key={inv.id} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs">{inv.number ? `#${inv.number}` : "—"}</td>
                  <td className="px-4 py-3">{inv.customer_name_snapshot ?? "Cliente"}</td>
                  <td className="px-4 py-3 text-xs">{inv.issue_date}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(inv.total, inv.currency)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(inv.paid_amount, inv.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge className={STATUS_BADGE[inv.status].cls}>{STATUS_BADGE[inv.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Ver / editar" onClick={() => setEditingId(inv.id)}>
                        <FileText className="size-4" />
                      </Button>
                      {inv.status === "draft" && (
                        <Button variant="ghost" size="icon" title="Emitir" onClick={() => {
                          issueFn({ data: { id: inv.id } })
                            .then((r) => { toast.success(`Emitida como #${(r as { number: number }).number}`); refresh(); })
                            .catch((e: Error) => toast.error(e.message));
                        }}><Send className="size-4" /></Button>
                      )}
                      {(inv.status === "issued") && (
                        <Button variant="ghost" size="icon" title="Anular" onClick={() => {
                          if (!confirm("¿Anular factura?")) return;
                          voidFn({ data: { id: inv.id } }).then(() => { toast.success("Anulada"); refresh(); }).catch((e: Error) => toast.error(e.message));
                        }}><Ban className="size-4" /></Button>
                      )}
                      {inv.status === "draft" && (
                        <Button variant="ghost" size="icon" title="Eliminar" onClick={() => {
                          if (!confirm("¿Eliminar borrador?")) return;
                          delFn({ data: { id: inv.id } }).then(() => { toast.success("Eliminado"); refresh(); }).catch((e: Error) => toast.error(e.message));
                        }}><Trash2 className="size-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editingId) && (
        <InvoiceEditor
          invoiceId={editingId}
          onClose={() => { setCreating(false); setEditingId(null); }}
          onSaved={() => { refresh(); }}
        />
      )}
    </div>
  );
}

/* =================== Invoice editor =================== */
type EditorItem = {
  id?: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
};

function InvoiceEditor({ invoiceId, onClose, onSaved }: {
  invoiceId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const listCustFn = useServerFn(listCustomers);
  const listProdFn = useServerFn(listProducts);
  const getFn = useServerFn(getInvoice);
  const saveFn = useServerFn(saveInvoiceDraft);
  const addPayFn = useServerFn(addPayment);
  const delPayFn = useServerFn(deletePayment);
  const listAccFn = useServerFn(listAccounts);

  const { data: customers = [] } = useQuery({ queryKey: ["sales-customers"], queryFn: () => listCustFn() });
  const { data: products = [] } = useQuery({ queryKey: ["inv-products"], queryFn: () => listProdFn() });
  const { data: accounts = [] } = useQuery({ queryKey: ["fin-accounts"], queryFn: () => listAccFn() });
  const { data: existing, refetch } = useQuery({
    queryKey: ["invoice", invoiceId], enabled: !!invoiceId,
    queryFn: () => getFn({ data: { id: invoiceId! } }),
  });

  const inv = existing?.invoice as Invoice | undefined;
  const readOnly = !!inv && inv.status !== "draft";

  const [customerId, setCustomerId] = useState<string>("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<EditorItem[]>([
    { product_id: null, description: "", quantity: 1, unit_price: 0, tax_rate: 21 },
  ]);
  const [hydrated, setHydrated] = useState(false);

  useMemo(() => {
    if (inv && !hydrated) {
      setCustomerId(inv.customer_id ?? "");
      setIssueDate(inv.issue_date);
      setDueDate(inv.due_date ?? "");
      setCurrency(inv.currency);
      const its = (existing?.items ?? []) as Array<EditorItem & { id: string }>;
      if (its.length) setItems(its.map((i) => ({
        id: i.id, product_id: i.product_id, description: i.description,
        quantity: Number(i.quantity), unit_price: Number(i.unit_price), tax_rate: Number(i.tax_rate),
      })));
      setHydrated(true);
    }
    return null;
  }, [inv, existing, hydrated]);

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    items.forEach((it) => {
      const line = Number(it.quantity) * Number(it.unit_price);
      subtotal += line;
      tax += line * (Number(it.tax_rate) / 100);
    });
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  function patchItem(i: number, p: Partial<EditorItem>) {
    setItems((rs) => rs.map((r, idx) => idx === i ? { ...r, ...p } : r));
  }

  async function save() {
    const customer = (customers as Customer[]).find((c) => c.id === customerId);
    try {
      const res = await saveFn({ data: {
        id: invoiceId ?? undefined,
        customer_id: customerId || null,
        customer_name_snapshot: customer?.name ?? "",
        issue_date: issueDate,
        due_date: dueDate || null,
        currency,
        notes: notes || null,
        items: items.filter((i) => i.description && i.quantity > 0),
      } });
      toast.success("Borrador guardado");
      onSaved();
      if (!invoiceId && res?.id) {
        // switch to editing mode
        onClose();
      }
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inv ? (inv.number ? `Factura #${inv.number}` : "Borrador de factura") : "Nueva factura"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Select value={customerId} onValueChange={setCustomerId} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>
                  {(customers as Customer[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={readOnly} />
            </div>
            <div>
              <Label>Vencimiento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={readOnly} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-right">Cant.</th>
                  <th className="px-2 py-2 text-right">Precio</th>
                  <th className="px-2 py-2 text-right">IVA%</th>
                  <th className="px-2 py-2 text-right">Subtotal</th>
                  {!readOnly && <th></th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="px-2 py-1">
                      <div className="flex flex-col gap-1">
                        <Select
                          value={it.product_id ?? "__none__"}
                          onValueChange={(v) => {
                            if (v === "__none__") { patchItem(i, { product_id: null }); return; }
                            const p = (products as Array<{ id: string; name: string; price: number }>).find((x) => x.id === v);
                            patchItem(i, { product_id: v, description: p?.name ?? it.description, unit_price: Number(p?.price ?? it.unit_price) });
                          }}
                          disabled={readOnly}
                        >
                          <SelectTrigger className="h-8"><SelectValue placeholder="Producto (opcional)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Libre —</SelectItem>
                            {(products as Array<{ id: string; name: string }>).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={it.description} onChange={(e) => patchItem(i, { description: e.target.value })} placeholder="Descripción" className="h-8" disabled={readOnly} />
                      </div>
                    </td>
                    <td className="px-2 py-1"><Input type="number" step="0.01" value={it.quantity} onChange={(e) => patchItem(i, { quantity: Number(e.target.value) })} className="h-8 w-20 text-right font-mono" disabled={readOnly} /></td>
                    <td className="px-2 py-1"><Input type="number" step="0.01" value={it.unit_price} onChange={(e) => patchItem(i, { unit_price: Number(e.target.value) })} className="h-8 w-24 text-right font-mono" disabled={readOnly} /></td>
                    <td className="px-2 py-1"><Input type="number" step="0.5" value={it.tax_rate} onChange={(e) => patchItem(i, { tax_rate: Number(e.target.value) })} className="h-8 w-16 text-right font-mono" disabled={readOnly} /></td>
                    <td className="px-2 py-1 text-right font-mono">{fmt(Number(it.quantity) * Number(it.unit_price), currency)}</td>
                    {!readOnly && (
                      <td className="px-2 py-1">
                        <Button variant="ghost" size="icon" onClick={() => setItems((rs) => rs.filter((_, idx) => idx !== i))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setItems((rs) => [...rs, { product_id: null, description: "", quantity: 1, unit_price: 0, tax_rate: 21 }])}>
              <Plus className="mr-2 size-4" />Añadir línea
            </Button>
          )}

          <div className="flex justify-end">
            <div className="min-w-[240px] space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{fmt(totals.subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Impuestos</span><span className="font-mono">{fmt(totals.tax, currency)}</span></div>
              <div className="flex justify-between border-t border-border/40 pt-1 text-base font-semibold"><span>Total</span><span className="font-mono">{fmt(totals.total, currency)}</span></div>
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
          </div>

          {inv && inv.status !== "draft" && inv.status !== "void" && (
            <PaymentsBlock
              invoice={inv}
              accounts={accounts as Array<{ id: string; name: string; currency: string }>}
              payments={(existing?.payments ?? []) as Array<{ id: string; paid_on: string; amount: number; method: string; notes: string | null }>}
              onAdd={async (payload) => {
                try { await addPayFn({ data: { ...payload, invoice_id: inv.id } });
                  toast.success("Pago registrado"); refetch(); onSaved();
                } catch (e) { toast.error((e as Error).message); }
              }}
              onDelete={async (id) => {
                try { await delPayFn({ data: { id } }); toast.success("Pago eliminado"); refetch(); onSaved(); }
                catch (e) { toast.error((e as Error).message); }
              }}
            />
          )}

          {inv && inv.status !== "draft" && (
            <div>
              <Button variant="outline" size="sm" onClick={() => downloadInvoicePDF(inv, (existing?.items ?? []) as Array<EditorItem & { subtotal: number }>, customers as Customer[])}>
                <Download className="mr-2 size-4" />Descargar PDF
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {!readOnly && <Button onClick={save}>Guardar borrador</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsBlock({ invoice, accounts, payments, onAdd, onDelete }: {
  invoice: Invoice;
  accounts: Array<{ id: string; name: string; currency: string }>;
  payments: Array<{ id: string; paid_on: string; amount: number; method: string; notes: string | null }>;
  onAdd: (p: { paid_on: string; amount: number; method: "cash"|"card"|"transfer"|"other"; account_id: string | null; notes: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const outstanding = Math.max(0, Number(invoice.total) - Number(invoice.paid_amount));
  const [amount, setAmount] = useState<number>(outstanding);
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"cash"|"card"|"transfer"|"other">("transfer");
  const [accountId, setAccountId] = useState<string>("");

  return (
    <div className="rounded-xl border border-border/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <CircleDollarSign className="size-4 text-primary" /> Cobros
        <span className="ml-auto text-xs text-muted-foreground">Pendiente: {fmt(outstanding, invoice.currency)}</span>
      </div>
      {payments.length > 0 && (
        <div className="mb-3 divide-y divide-border/40 rounded-lg border border-border/30 text-sm">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="font-mono text-xs">{p.paid_on}</span>
              <span className="text-xs text-muted-foreground">{p.method}</span>
              <span className="ml-auto font-mono">{fmt(p.amount, invoice.currency)}</span>
              <Button variant="ghost" size="icon" onClick={() => { if (confirm("¿Eliminar cobro?")) onDelete(p.id); }}><Trash2 className="size-3" /></Button>
            </div>
          ))}
        </div>
      )}
      {invoice.status !== "paid" && outstanding > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="text-right font-mono" />
          <Select value={method} onValueChange={(v) => setMethod(v as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountId || "__none__"} onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Cuenta (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Sin registrar en Finanzas —</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => {
            if (amount <= 0) return toast.error("Importe inválido");
            onAdd({ paid_on: paidOn, amount, method, account_id: accountId || null, notes: null });
          }}>Registrar</Button>
        </div>
      )}
    </div>
  );
}

/* =================== PDF =================== */
async function downloadInvoicePDF(inv: Invoice, items: Array<EditorItem & { subtotal: number }>, customers: Customer[]) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  const cust = customers.find((c) => c.id === inv.customer_id);
  const title = inv.number ? `Factura #${inv.number}` : "Borrador";
  doc.setFontSize(18); doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Fecha: ${inv.issue_date}`, 14, 30);
  if (inv.due_date) doc.text(`Vencimiento: ${inv.due_date}`, 14, 36);
  doc.text(`Cliente: ${cust?.name ?? inv.customer_name_snapshot ?? ""}`, 120, 30);
  if (cust?.tax_id) doc.text(`NIF: ${cust.tax_id}`, 120, 36);
  autoTable(doc, {
    startY: 46,
    head: [["Descripción", "Cant.", "Precio", "IVA%", "Subtotal"]],
    body: items.map((i) => [i.description, String(i.quantity), fmt(i.unit_price, inv.currency), String(i.tax_rate), fmt(i.subtotal, inv.currency)]),
  });
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.text(`Subtotal: ${fmt(inv.subtotal, inv.currency)}`, 140, y);
  doc.text(`Impuestos: ${fmt(inv.tax_amount, inv.currency)}`, 140, y + 6);
  doc.setFontSize(12);
  doc.text(`Total: ${fmt(inv.total, inv.currency)}`, 140, y + 14);
  doc.save(`${title}.pdf`);
}