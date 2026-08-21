import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getKpis } from "@/lib/finance.functions";
import { listLowStock } from "@/lib/inventory.functions";
import { LowStockAlerts } from "@/components/low-stock-alerts";
import { EbitdaTrendChart } from "@/components/charts/ebitda-trend-chart";
import { EbitdaBucketDonut } from "@/components/charts/ebitda-bucket-donut";
import { HabitYearHeatmap } from "@/components/charts/habit-year-heatmap";
import { getEbitdaSeries } from "@/lib/finance.functions";
import { getHabitsHeatmap } from "@/lib/productivity.functions";
import { getActionCenter } from "@/lib/insights.functions";
import { ActionCenter } from "@/components/action-center";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Qanta — Panel" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["finance","kpis"],
        queryFn: () => getKpis({ data: {} }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["inv","low"],
        queryFn: () => listLowStock(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["finance","series",12],
        queryFn: () => getEbitdaSeries({ data: { months: 12 } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["pro","heatmap"],

        queryFn: () => getHabitsHeatmap(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["insights","action-center"],
        queryFn: () => getActionCenter(),
      }),
    ]);
  },

  errorComponent: ({ error }) => <div className="glass rounded-2xl p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">404</div>,
  component: Dashboard,
});

function KPI({ label, value, delta, positive }: { label: string; value: string; delta: number; positive?: boolean }) {
  const good = positive ? delta >= 0 : delta <= 0;
  const sign = delta >= 0 ? "+" : "";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div
          className={
            "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] " +
            (good ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive")
          }
        >
          {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {sign}{delta.toFixed(1)}%
        </div>
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const kpisFn = useServerFn(getKpis);
  const { data: kpis } = useSuspenseQuery({ queryKey: ["finance","kpis"], queryFn: () => kpisFn({ data: {} }) });
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? user?.email?.split("@")[0];

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {t("dash.tagline")}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("dash.welcome")}, <span className="text-gradient">{name}</span>
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label={t("dash.kpi.revenue")} value={fmt(kpis.current.revenue)} delta={kpis.deltas.revenue} positive />
        <KPI label={t("dash.kpi.costs")} value={fmt(kpis.current.costs)} delta={kpis.deltas.costs} />
        <KPI label={t("dash.kpi.ebitda")} value={fmt(kpis.current.ebitda)} delta={kpis.deltas.ebitda} positive />
        <KPI label={t("dash.kpi.net")} value={fmt(kpis.current.net)} delta={kpis.deltas.net} positive />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <LowStockAlerts compact />
        </div>
        <div className="lg:col-span-2">
          <EbitdaTrendChart months={12} />
        </div>
        <EbitdaBucketDonut byBucket={kpis.byBucket} />
        <div className="lg:col-span-3">
          <HabitYearHeatmap />
        </div>
      </div>
    </div>
  );
}