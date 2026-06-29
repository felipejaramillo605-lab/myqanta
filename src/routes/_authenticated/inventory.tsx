import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, ScanLine, Trash2, Package, AlertTriangle, ArrowLeftRight, FileDown, PieChart, Pencil } from "lucide-react";

import {
  applyInvoiceItems,
  createMovement,
  deleteProduct,
  deleteMovement,
  getCategorySummary,
  listMovements,
  listProducts,
  listLowStock,
  scanInvoice,
  upsertProduct,
} from "@/lib/inventory.functions";
import { EXPENSE_CATEGORIES, suggestCategory, type DecimalSeparator } from "@/lib/categories";
import { LowStockAlerts } from "@/components/low-stock-alerts";
import { StockHistoryChart } from "@/components/charts/stock-history-chart";
import { ScanHistoryDialog } from "@/components/scan-history-dialog";
import { downloadCsv } from "@/lib/export-utils";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Kind = "purchase" | "sale" | "adjustment" | "transfer";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Qanta — Inventario" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({ queryKey: ["inv", "products"], queryFn: () => listProducts() }),
      context.queryClient.ensureQueryData({ queryKey: ["inv", "movs"], queryFn: () => listMovements() }),
      context.queryClient.ensureQueryData({ queryKey: ["inv", "low"], queryFn: () => listLowStock() }),
      context.queryClient.ensureQueryData({ queryKey: ["inv", "cats"], queryFn: () => getCategorySummary({ data: { days: 90 } }) }),
    ]);
  },
  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: Inventory,
});

function Inventory() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const productsFn = useServerFn(listProducts);
  const movsFn = useServerFn(listMovements);
  const upsertFn = useServerFn(upsertProduct);
  const delFn = useServerFn(deleteProduct);
  const movFn = useServerFn(createMovement);
  const delMovFn = useServerFn(deleteMovement);
  const scanFn = useServerFn(scanInvoice);
  const applyFn = useServerFn(applyInvoiceItems);
  const catFn = useServerFn(getCategorySummary);

  const { data: products } = useSuspenseQuery({ queryKey: ["inv", "products"], queryFn: () => productsFn() });
  const { data: movements } = useSuspenseQuery({ queryKey: ["inv", "movs"], queryFn: () => movsFn() });
  const { data: catSummary } = useSuspenseQuery({ queryKey: ["inv", "cats"], queryFn: () => catFn({ data: { days: 90 } }) });
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["inv"] });

  const lowStock = products.filter((p) => Number(p.stock) <= Number(p.min_stock) && Number(p.min_stock) > 0).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">B2C · B2B</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{t("inv.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("inv.sub")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={products.length === 0} onClick={() => downloadCsv(
            `qanta-products-${new Date().toISOString().slice(0,10)}.csv`,
            products.map((p) => ({ sku: p.sku ?? "", name: p.name, category: p.category ?? "", unit: p.unit, stock: Number(p.stock), min_stock: Number(p.min_stock), cost: Number(p.cost), price: Number(p.price) })),
          )}>
            <FileDown className="size-4" />{t("export.csv")}
          </Button>
          <ScanHistoryDialog kind="invoice" onUndone={refresh} />
          {canWrite && <ScanDialog scan={scanFn} apply={applyFn} onApplied={refresh} />}
          {canWrite && <MovementDialog products={products} onSubmit={(v) => movFn({ data: v }).then(() => { refresh(); toast.success("✓"); }).catch((e: Error) => toast.error(e.message))} />}
          {canWrite && <ProductDialog onSubmit={(v) => upsertFn({ data: v }).then(() => { refresh(); toast.success("✓"); }).catch((e: Error) => toast.error(e.message))} />}
        </div>
      </header>

      <ReadOnlyBanner />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<Package className="size-4" />} label={t("inv.products")} value={products.length.toString()} />
        <Stat icon={<ArrowLeftRight className="size-4" />} label={t("inv.movements")} value={movements.length.toString()} />
        <Stat icon={<AlertTriangle className="size-4 text-destructive" />} label={t("inv.low_stock")} value={lowStock.toString()} />
        <Stat icon={<ScanLine className="size-4 text-primary" />} label={lang === "es" ? "IA Gemini" : "Gemini AI"} value="OCR" />
      </div>

      <LowStockAlerts />

      <CategorySummary data={catSummary} />

      {products.length > 0 && (
        <section className="glass rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("chart.stock_history")}
            </div>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t("chart.select_product")} />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProduct && (
            <div className="mt-3">
              <StockHistoryChart productId={selectedProduct} days={90} />
            </div>
          )}
        </section>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">{t("inv.products")}</TabsTrigger>
          <TabsTrigger value="movements">{t("inv.movements")}</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <section className="glass overflow-hidden rounded-2xl">
            {products.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">{t("inv.empty.products")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("inv.field.name")}</th>
                    <th className="px-4 py-3">{t("inv.field.sku")}</th>
                    <th className="px-4 py-3 text-right">{t("inv.field.stock")}</th>
                    <th className="px-4 py-3 text-right">{t("inv.field.cost")}</th>
                    <th className="px-4 py-3 text-right">{t("inv.field.price")}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const low = Number(p.stock) <= Number(p.min_stock) && Number(p.min_stock) > 0;
                    return (
                      <tr key={p.id} className="border-b border-border/30 last:border-0">
                        <td className="px-4 py-2">{p.name}{p.category ? <span className="ml-2 text-[10px] text-muted-foreground">{p.category}</span> : null}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</td>
                        <td className={"px-4 py-2 text-right font-mono " + (low ? "text-destructive" : "")}>{Number(p.stock)} {p.unit}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{Number(p.cost).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-mono">{Number(p.price).toFixed(2)}</td>
                        <td className="px-2">
                          {canWrite && (
                            <div className="flex justify-end gap-1">
                              <ProductDialog
                                initial={p}
                                trigger={<Button variant="ghost" size="icon" title={t("common.edit")}><Pencil className="size-4" /></Button>}
                                onSubmit={(v) => upsertFn({ data: { ...v, id: p.id } }).then(() => { refresh(); toast.success("✓"); }).catch((e: Error) => toast.error(e.message))}
                              />
                              <Button variant="ghost" size="icon" title={t("common.delete")} onClick={() => { if (confirm(t("common.confirm_delete"))) delFn({ data: { id: p.id } }).then(refresh); }}>
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <section className="glass overflow-hidden rounded-2xl">
            {movements.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">{t("inv.empty.movements")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("fin.tx.date")}</th>
                    <th className="px-4 py-3">{t("inv.field.name")}</th>
                    <th className="px-4 py-3">{lang === "es" ? "Tipo" : "Kind"}</th>
                    <th className="px-4 py-3 text-right">{lang === "es" ? "Cantidad" : "Qty"}</th>
                    <th className="px-4 py-3 text-right">{t("inv.field.price")}</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{new Date(m.occurred_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2">{(m as { inv_products?: { name: string } }).inv_products?.name ?? "—"}</td>
                      <td className="px-4 py-2"><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider">{t(("inv.kind." + m.kind) as never)}</span></td>
                      <td className="px-4 py-2 text-right font-mono">{Number(m.quantity)}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{Number(m.unit_price).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono">{Number(m.total).toFixed(2)}</td>
                      <td className="px-2">
                        {canWrite && (
                          <Button variant="ghost" size="icon" title={t("inv.delete_movement")} onClick={() => { if (confirm(t("common.confirm_delete"))) delMovFn({ data: { id: m.id } }).then(() => { refresh(); toast.success("✓"); }).catch((e: Error) => toast.error(e.message)); }}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{icon}{label}</div>
      <div className="mt-3 font-mono text-3xl font-semibold tracking-tight">{value}</div>
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

type ProductFormValue = { name: string; sku?: string | null; unit: string; cost: number; price: number; stock: number; min_stock: number; category?: string | null };
type ProductRow = { name: string; sku: string | null; unit: string; cost: number | string; price: number | string; stock: number | string; min_stock: number | string; category: string | null };

function ProductDialog({ onSubmit, initial, trigger }: { onSubmit: (v: ProductFormValue) => void; initial?: ProductRow; trigger?: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const empty = { name: "", sku: "", unit: "unit", cost: "0", price: "0", stock: "0", min_stock: "0", category: "" };
  const fromInitial = () => initial ? {
    name: initial.name,
    sku: initial.sku ?? "",
    unit: initial.unit ?? "unit",
    cost: String(initial.cost ?? 0),
    price: String(initial.price ?? 0),
    stock: String(initial.stock ?? 0),
    min_stock: String(initial.min_stock ?? 0),
    category: initial.category ?? "",
  } : empty;
  const [f, setF] = useState(fromInitial);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(fromInitial()); }}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4" />{t("inv.add_product")}</Button>}</DialogTrigger>
      <DialogContent className="glass max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t("inv.edit_product") : t("inv.add_product")}</DialogTitle>
          <DialogDescription>{t("inv.scan.hint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("inv.field.name")} hint={t("form.help.product_name")} className="sm:col-span-2">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t("inv.field.sku")} hint={t("form.help.sku")}>
            <Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />
          </Field>
          <Field label={t("inv.field.category")} hint={t("form.help.category")}>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue placeholder={t("cat.summary.uncategorized")} /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(("cat." + c) as never)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("inv.field.unit")} hint={t("form.help.unit")}>
            <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </Field>
          <Field label={t("inv.field.cost")} hint={t("form.help.cost")}>
            <Input type="number" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          </Field>
          <Field label={t("inv.field.price")} hint={t("form.help.price")}>
            <Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
          <Field label={t("inv.field.stock")} hint={t("form.help.stock")}>
            <Input type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
          </Field>
          <Field label={t("inv.field.min")} hint={t("form.help.min")}>
            <Input type="number" value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!f.name} onClick={() => {
            onSubmit({ name: f.name, sku: f.sku || null, unit: f.unit || "unit", cost: Number(f.cost), price: Number(f.price), stock: Number(f.stock), min_stock: Number(f.min_stock), category: f.category || null });
            setOpen(false); if (!initial) setF(empty);
          }}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ products, onSubmit }: { products: { id: string; name: string }[]; onSubmit: (v: { product_id: string; kind: Kind; quantity: number; unit_price: number; notes?: string | null }) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState<Kind>("purchase");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("0");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" disabled={products.length === 0}><ArrowLeftRight className="size-4" />{t("inv.add_movement")}</Button></DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{t("inv.add_movement")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger><SelectValue placeholder={t("inv.field.name")} /></SelectTrigger>
            <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["purchase","sale","adjustment","transfer"] as Kind[]).map((k) => <SelectItem key={k} value={k}>{t(("inv.kind." + k) as never)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
            <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t("inv.field.price")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!productId} onClick={() => {
            onSubmit({ product_id: productId, kind, quantity: Number(qty), unit_price: Number(price) });
            setOpen(false); setQty("1"); setPrice("0");
          }}>{t("fin.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ScanResult = Awaited<ReturnType<typeof scanInvoice>>;
type ScanSuccess = Extract<ScanResult, { ok: true }>;
type ApplyData = { supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; currency: string; subtotal: number; tax: number; total: number; items: { description: string; sku: string | null; quantity: number; unit_price: number; total: number; expense_category: string }[] };
type ApplyFn = (a: { data: ApplyData }) => Promise<{ ok: true; created: number; invoice: unknown }>;
type EditableItem = { description: string; sku: string; quantity: number; unit_price: number; total: number; expense_category: string };

function ScanDialog({ scan, apply, onApplied }: { scan: (a: { data: { image_data_url: string; mime: string; commit: boolean; decimal_separator?: DecimalSeparator } }) => Promise<ScanResult>; apply: ApplyFn; onApplied: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [mime, setMime] = useState<string>("");
  const [preview, setPreview] = useState<ScanSuccess | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sep, setSep] = useState<DecimalSeparator>("auto");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [meta, setMeta] = useState({ supplier: "", number: "", date: "", currency: "EUR", subtotal: 0, tax: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setMime(file.type);
    setErrorKey(null);
    setPreview(null);
    setItems([]);
    const reader = new FileReader();
    reader.onload = () => setDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const mapError = (msg: string): string => {
    switch (msg) {
      case "SCAN_PARSE_FAILED": return "inv.scan.err.parse";
      case "SCAN_TOO_LARGE": return "inv.scan.err.too_large";
      case "SCAN_UNSUPPORTED_FILE": return "inv.scan.err.unsupported";
      case "SCAN_RATE_LIMITED": return "inv.scan.err.rate";
      case "SCAN_NO_CREDITS": return "inv.scan.err.credits";
      default: return "inv.scan.err.generic";
    }
  };

  const run = useMutation({
    mutationFn: () => scan({ data: { image_data_url: dataUrl, mime, commit: false, decimal_separator: sep } }),
    onSuccess: (res) => {
      if (!res.ok) {
        const key = mapError(res.error);
        setErrorKey(key);
        toast.error(t(key as Parameters<typeof t>[0]));
        return;
      }
      setErrorKey(null);
      setPreview(res);
      setMeta({
        supplier: res.parsed.supplier_name ?? "",
        number: res.parsed.invoice_number ?? "",
        date: res.parsed.invoice_date ?? "",
        currency: res.parsed.currency ?? "EUR",
        subtotal: res.parsed.subtotal ?? 0,
        tax: res.parsed.tax ?? 0,
        total: res.parsed.total ?? 0,
      });
      setItems(res.parsed.items.map((it) => ({
        description: it.description,
        sku: it.sku ?? "",
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        total: it.total || (it.quantity || 1) * (it.unit_price || 0),
        expense_category: suggestCategory(it.description),
      })));
      toast.success(`${res.parsed.items.length} ${t("inv.detected_items")}`);
    },
    onError: (e: Error) => {
      const key = mapError(e.message);
      setErrorKey(key);
      toast.error(t(key as Parameters<typeof t>[0]));
    },
  });

  const applyMut = useMutation({
    mutationFn: () => apply({ data: {
      supplier_name: meta.supplier || null,
      invoice_number: meta.number || null,
      invoice_date: meta.date || null,
      currency: meta.currency || "EUR",
      subtotal: meta.subtotal,
      tax: meta.tax,
      total: meta.total,
      items: items.map((it) => ({
        description: it.description,
        sku: it.sku || null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total: it.total,
        expense_category: it.expense_category,
      })),
    }}),
    onSuccess: (res) => {
      toast.success(`${res.created} ${t("inv.created_movs")}`);
      setOpen(false); setPreview(null); setDataUrl(""); setMime(""); setItems([]);
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = (i: number, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      if (patch.quantity !== undefined || patch.unit_price !== undefined) next.total = next.quantity * next.unit_price;
      return next;
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setDataUrl(""); setMime(""); setErrorKey(null); setItems([]); } }}>
      <DialogTrigger asChild><Button variant="outline"><ScanLine className="size-4" />{t("inv.scan")}</Button></DialogTrigger>
      <DialogContent className="glass max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="size-4 text-primary" />{t("inv.scan")}</DialogTitle>
          <DialogDescription>{t("inv.scan.hint")}</DialogDescription>
        </DialogHeader>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <div className="grid gap-3">
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
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            {dataUrl ? (mime.startsWith("image/") ? "📷 " : "📄 ") + (mime || "file") : t("inv.scan")}
          </Button>
          {dataUrl && mime.startsWith("image/") && (
            <img src={dataUrl} alt="invoice" className="max-h-48 rounded-lg border border-border/50 object-contain" />
          )}
          {errorKey && (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{t(errorKey as Parameters<typeof t>[0])}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={run.isPending || !dataUrl} onClick={() => { setErrorKey(null); run.mutate(); }}>
                  {t("inv.scan.retry")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setErrorKey(null); setDataUrl(""); setMime(""); inputRef.current?.click(); }}>
                  {t("inv.scan.change_file")}
                </Button>
              </div>
            </div>
          )}
          {preview && (
            <div className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-3 text-xs text-muted-foreground">{t("edit.preview.hint")}</p>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label={t("inv.field.sku")}><Input value={meta.number} onChange={(e) => setMeta({ ...meta, number: e.target.value })} /></Field>
                <Field label={t("form.help.tx_date")}><Input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></Field>
                <Field label={"Currency"}><Input value={meta.currency} onChange={(e) => setMeta({ ...meta, currency: e.target.value })} /></Field>
                <Field label={"Total"}><Input type="number" value={meta.total} onChange={(e) => setMeta({ ...meta, total: Number(e.target.value) })} /></Field>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-border/30 p-2">
                    <Input className="col-span-12 sm:col-span-4" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder={t("inv.field.name")} />
                    <Input className="col-span-4 sm:col-span-2" type="number" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} placeholder="Qty" />
                    <Input className="col-span-4 sm:col-span-2" type="number" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })} placeholder={t("inv.field.price")} />
                    <Select value={it.expense_category} onValueChange={(v) => updateItem(i, { expense_category: v })}>
                      <SelectTrigger className="col-span-3 sm:col-span-3"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(("cat." + c) as never)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, { description: "", sku: "", quantity: 1, unit_price: 0, total: 0, expense_category: "otros_gastos" }])}>
                  <Plus className="size-4" />{t("edit.add_row")}
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          {!preview ? (
            <Button disabled={run.isPending || !dataUrl} onClick={() => run.mutate()}>
              {run.isPending ? t("inv.scanning") : t("inv.scan.run")}
            </Button>
          ) : (
            <Button disabled={applyMut.isPending || items.length === 0} onClick={() => applyMut.mutate()}>
              {applyMut.isPending ? t("inv.scanning") : `${t("edit.apply")} (${items.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategorySummary({ data }: { data: { items: { category: string; total: number; count: number }[]; total: number; days: number } }) {
  const { t } = useI18n();
  if (!data || data.total === 0) {
    return (
      <section className="glass rounded-2xl p-5">
        <header className="mb-2 flex items-center gap-2">
          <PieChart className="size-4 text-primary" />
          <h2 className="font-semibold tracking-tight">{t("cat.summary.title")}</h2>
        </header>
        <p className="text-xs text-muted-foreground">{t("cat.summary.empty")}</p>
      </section>
    );
  }
  const sorted = [...data.items].sort((a, b) => b.total - a.total);
  return (
    <section className="glass rounded-2xl p-5">
      <header className="mb-4 flex items-center gap-2">
        <PieChart className="size-4 text-primary" />
        <h2 className="font-semibold tracking-tight">{t("cat.summary.title")}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{data.days}d</span>
      </header>
      <p className="mb-3 text-xs text-muted-foreground">{t("cat.summary.sub")}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sorted.map((c) => {
          const pct = data.total > 0 ? (c.total / data.total) * 100 : 0;
          return (
            <div key={c.category} className="rounded-lg border border-border/40 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t(("cat." + c.category) as never)}</span>
                <span className="text-[10px] text-muted-foreground">{c.count}</span>
              </div>
              <div className="mt-2 font-mono text-lg font-semibold">{c.total.toFixed(2)}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="mt-1 text-right text-[10px] text-muted-foreground">{pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
