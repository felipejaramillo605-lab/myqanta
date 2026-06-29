import { useState } from "react";
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
import { ChartLegend, RangeSelect } from "./chart-controls";

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toFixed(0);
}

const SERIES = [
  { key: "revenue", color: "#22d3ee" },
  { key: "costs", color: "#f87171" },
  { key: "ebitda", color: "#a78bfa" },
] as const;

export function EbitdaTrendChart({ months: initialMonths = 12 }: { months?: number }) {
  const { t } = useI18n();
  const [months, setMonths] = useState<number>(initialMonths);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const fn = useServerFn(getEbitdaSeries);
  const { data } = useSuspenseQuery({
    queryKey: ["finance", "series", months],
    queryFn: () => fn({ data: { months } }),
  });

  const hasData = data.some((d) => d.revenue || d.costs || d.ebitda);
  const toggle = (k: string) =>
    setHidden((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const reset = () => { setHidden(new Set()); setMonths(initialMonths); };
  const legendItems = SERIES.map((s) => ({
    key: s.key,
    color: s.color,
    label: t(("dash.kpi." + s.key) as never),
  }));

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
        <>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gEb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
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
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(v) => fmtShort(Number(v))}
              />
              {!hidden.has("revenue") && (
                <Area type="monotone" dataKey="revenue" stroke="#22d3ee" fill="url(#gRev)" strokeWidth={2} name={t("dash.kpi.revenue")} />
              )}
              {!hidden.has("costs") && (
                <Area type="monotone" dataKey="costs" stroke="#f87171" fill="url(#gCost)" strokeWidth={2} name={t("dash.kpi.costs")} />
              )}
              {!hidden.has("ebitda") && (
                <Area type="monotone" dataKey="ebitda" stroke="#a78bfa" fill="url(#gEb)" strokeWidth={2} name={t("dash.kpi.ebitda")} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <ChartLegend
          items={legendItems}
          hidden={hidden}
          onToggle={toggle}
          onReset={reset}
          rangeControl={
            <RangeSelect<number>
              label={t("chart.range")}
              value={months}
              onChange={setMonths}
              options={[
                { value: 3, label: t("chart.range.3m") },
                { value: 6, label: t("chart.range.6m") },
                { value: 12, label: t("chart.range.12m") },
                { value: 24, label: t("chart.range.24m") },
              ]}
            />
          }
        />
        </>
      )}
    </section>
  );
}