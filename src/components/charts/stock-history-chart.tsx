import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import { getStockHistory } from "@/lib/inventory.functions";
import { useI18n } from "@/lib/i18n";

export function StockHistoryChart({ productId, days = 90 }: { productId: string; days?: number }) {
  const { t } = useI18n();
  const fn = useServerFn(getStockHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["inv", "stock-hist", productId, days],
    queryFn: () => fn({ data: { product_id: productId, days } }),
    enabled: !!productId,
  });

  if (!productId) return null;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {data?.product?.name ?? t("chart.stock_history")}
        </h2>
      </div>
      {isLoading || !data ? (
        <div className="mt-6 grid h-56 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
          …
        </div>
      ) : data.series.length === 0 ? (
        <div className="mt-6 grid h-56 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
          {t("chart.no_data")}
        </div>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "hsl(var(--foreground))" }} iconType="circle" />
              {Number(data.product.min_stock) > 0 && (
                <ReferenceLine y={Number(data.product.min_stock)} stroke="#f87171" strokeDasharray="3 3" label={{ value: t("inv.field.min"), fill: "#f87171", fontSize: 10 }} />
              )}
              <Line type="stepAfter" dataKey="stock" name={t("chart.stock_history")} stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}