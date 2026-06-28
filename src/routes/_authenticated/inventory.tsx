import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, ScanLine, Trash2, Package, AlertTriangle, ArrowLeftRight, FileDown } from "lucide-react";

import {
  createMovement,
  deleteProduct,
  listMovements,
  listProducts,
  listLowStock,
  scanInvoice,
  upsertProduct,
} from "@/lib/inventory.functions";
import { LowStockAlerts } from "@/components/low-stock-alerts";
import { StockHistoryChart } from "@/components/charts/stock-history-chart";
import { downloadCsv } from "@/lib/export-utils";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/lib/use-permissions";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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
  const scanFn = useServerFn(scanInvoice);

  const { data: products } = useSuspenseQuery({ queryKey: ["inv", "products"], queryFn: () => productsFn() });
  const { data: movements } = useSuspenseQuery({ queryKey: ["inv", "movs"], queryFn: () => movsFn() });
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
          {canWrite && <ScanDialog scan={scanFn} onApplied={refresh} />}
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
                            <Button variant="ghost" size="icon" onClick={() => delFn({ data: { id: p.id } }).then(refresh)}>
                              <Trash2 className="size-4" />
                            </Button>
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

function ProductDialog({ onSubmit }: { onSubmit: (v: { name: string; sku?: string | null; unit: string; cost: number; price: number; stock: number; min_stock: number; category?: string | null }) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", sku: "", unit: "unit", cost: "0", price: "0", stock: "0", min_stock: "0", category: "" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="size-4" />{t("inv.add_product")}</Button></DialogTrigger>
      <DialogContent className="glass">
        <DialogHeader><DialogTitle>{t("inv.add_product")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={t("inv.field.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="sm:col-span-2" />
          <Input placeholder={t("inv.field.sku")} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />
          <Input placeholder={t("inv.field.category")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Input placeholder={t("inv.field.unit")} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          <Input type="number" placeholder={t("inv.field.cost")} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          <Input type="number" placeholder={t("inv.field.price")} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          <Input type="number" placeholder={t("inv.field.stock")} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
          <Input type="number" placeholder={t("inv.field.min")} value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          <Button disabled={!f.name} onClick={() => {
            onSubmit({ name: f.name, sku: f.sku || null, unit: f.unit || "unit", cost: Number(f.cost), price: Number(f.price), stock: Number(f.stock), min_stock: Number(f.min_stock), category: f.category || null });
            setOpen(false); setF({ name: "", sku: "", unit: "unit", cost: "0", price: "0", stock: "0", min_stock: "0", category: "" });
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

function ScanDialog({ scan, onApplied }: { scan: (a: { data: { image_data_url: string; mime: string; commit: boolean } }) => Promise<ScanResult>; onApplied: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string>("");
  const [mime, setMime] = useState<string>("");
  const [preview, setPreview] = useState<ScanResult | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setMime(file.type);
    setErrorKey(null);
    setPreview(null);
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
    mutationFn: (commit: boolean) => scan({ data: { image_data_url: dataUrl, mime, commit } }),
    onSuccess: (res, commit) => {
      setErrorKey(null);
      if (commit) {
        toast.success(`${res.created} ${t("inv.created_movs")}`);
        setOpen(false); setPreview(null); setDataUrl(""); setMime("");
        onApplied();
      } else {
        setPreview(res);
        toast.success(`${res.parsed.items.length} ${t("inv.detected_items")}`);
      }
    },
    onError: (e: Error) => {
      const key = mapError(e.message);
      setErrorKey(key);
      // Keep the file selected so the user can retry without re-uploading.
      toast.error(t(key as Parameters<typeof t>[0]));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setDataUrl(""); setMime(""); setErrorKey(null); } }}>
      <DialogTrigger asChild><Button variant="outline"><ScanLine className="size-4" />{t("inv.scan")}</Button></DialogTrigger>
      <DialogContent className="glass max-w-2xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine className="size-4 text-primary" />{t("inv.scan")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">{t("inv.scan.hint")}</p>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <div className="grid gap-3">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            {dataUrl ? (mime.startsWith("image/") ? "📷 " : "📄 ") + (mime || "file") : t("inv.scan")}
          </Button>
          {dataUrl && mime.startsWith("image/") && (
            <img src={dataUrl} alt="invoice" className="max-h-64 rounded-lg border border-border/50 object-contain" />
          )}
          {errorKey && (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
              <div className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{t(errorKey as Parameters<typeof t>[0])}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={run.isPending || !dataUrl}
                  onClick={() => { setErrorKey(null); run.mutate(false); }}
                >
                  {t("inv.scan.retry")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setErrorKey(null); setDataUrl(""); setMime(""); inputRef.current?.click(); }}
                >
                  {t("inv.scan.change_file")}
                </Button>
              </div>
            </div>
          )}
          {preview && (
            <div className="max-h-64 overflow-auto rounded-lg border border-border/50 bg-card/40 p-3">
              <p className="mb-2 text-xs text-muted-foreground">{preview.parsed.summary}</p>
              <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                {preview.parsed.invoice_number && <span>#{preview.parsed.invoice_number}</span>}
                {preview.parsed.invoice_date && <span>{preview.parsed.invoice_date}</span>}
                <span className="ml-auto font-mono">Total: {preview.parsed.total.toFixed(2)} {preview.parsed.currency}</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {preview.parsed.items.map((it, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="py-1">{it.description}</td>
                      <td className="py-1 text-right font-mono text-muted-foreground">×{it.quantity}</td>
                      <td className="py-1 text-right font-mono">{(it.total || it.quantity * it.unit_price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("fin.cancel")}</Button>
          {!preview ? (
            <Button disabled={run.isPending || !dataUrl} onClick={() => run.mutate(false)}>
              {run.isPending ? t("inv.scanning") : t("inv.scan.run")}
            </Button>
          ) : (
            <Button disabled={run.isPending} onClick={() => run.mutate(true)}>
              {run.isPending ? t("inv.scanning") : `${t("inv.scan.apply")} (${preview.parsed.items.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}