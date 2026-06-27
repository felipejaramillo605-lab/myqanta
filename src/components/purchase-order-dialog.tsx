import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPurchaseOrder } from "@/lib/inventory.functions";
import { useI18n } from "@/lib/i18n";

export type POProduct = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stock: number | string;
  min_stock: number | string;
  cost?: number | string | null;
};

function suggestQty(p: POProduct) {
  const stock = Number(p.stock) || 0;
  const min = Number(p.min_stock) || 0;
  // Bring stock up to 2x minimum
  const target = min * 2;
  return Math.max(target - stock, min || 1);
}

type Row = { product_id: string; name: string; unit: string; quantity: number; unit_price: number };

export function PurchaseOrderDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: POProduct[];
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fn = useServerFn(createPurchaseOrder);

  const initial = useMemo<Row[]>(
    () =>
      products.map((p) => ({
        product_id: p.id,
        name: p.name,
        unit: p.unit,
        quantity: suggestQty(p),
        unit_price: Number(p.cost ?? 0) || 0,
      })),
    [products],
  );
  const [rows, setRows] = useState<Row[]>(initial);

  // Reset rows when dialog re-opens with different products
  useEffect(() => setRows(initial), [initial]);

  const total = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);

  const mut = useMutation({
    mutationFn: (items: Row[]) =>
      fn({
        data: {
          items: items.map((r) => ({
            product_id: r.product_id,
            quantity: r.quantity,
            unit_price: r.unit_price,
          })),
        },
      }),
    onSuccess: () => {
      toast.success(t("inv.po.saved"));
      qc.invalidateQueries({ queryKey: ["inv"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`${t("inv.po.error")}: ${e.message}`),
  });

  function patch(idx: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...p } : r)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-primary" />
            {t("inv.po.title")}
          </DialogTitle>
          <DialogDescription>{t("inv.po.sub")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-auto rounded-xl border border-border/40">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("inv.po.product")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("inv.po.qty")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("inv.po.price")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("inv.po.subtotal")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.product_id} className="border-t border-border/30">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.unit}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.quantity}
                      onChange={(e) => patch(i, { quantity: Number(e.target.value) })}
                      className="h-8 w-24 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={r.unit_price}
                      onChange={(e) => patch(i, { unit_price: Number(e.target.value) })}
                      className="h-8 w-24 text-right font-mono"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(r.quantity * r.unit_price).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/40 bg-muted/20">
                <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">
                  {t("inv.po.total")}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            {t("inv.po.cancel")}
          </Button>
          <Button
            onClick={() => mut.mutate(rows.filter((r) => r.quantity > 0))}
            disabled={mut.isPending || rows.every((r) => r.quantity <= 0)}
          >
            {mut.isPending ? "…" : t("inv.po.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}