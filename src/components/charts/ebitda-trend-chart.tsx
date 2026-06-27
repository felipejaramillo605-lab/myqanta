import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { getEbitdaSeries } from "@/lib/finance.functions";
import { useI18n } from "@/lib/i18n";

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toFixed(0);
}

export function EbitdaTrendChart({ months = 12 }: { months?: number }) {
  const { t } = useI18n();
  const fn = useServerFn(getEbitdaSeries);
  const { data } = useSuspenseQuery({
    queryKey: ["finance", "series", months],
    queryFn: () => fn({ data: { months } }),
  });

  const hasData = data.some((d) => d.revenue || d.costs || d.ebitda);

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t("chart.ebitda_trend")}
        </h2>
      </div>
      {!hasData ? (
        <div className="mt-6 grid h-56 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
          {t("chart.no_data")}
        </div>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gEb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={fmtShort} width={48} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number) => fmtShort(v)}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#gRev)" strokeWidth={2} name={t("dash.kpi.revenue")} />
              <Area type="monotone" dataKey="costs" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.1)" strokeWidth={2} name={t("dash.kpi.costs")} />
              <Area type="monotone" dataKey="ebitda" stroke="hsl(var(--accent))" fill="url(#gEb)" strokeWidth={2} name={t("dash.kpi.ebitda")} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}