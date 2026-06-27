import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { ArrowDownRight, ArrowUpRight, Calendar, Flame, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Qanta — Panel" }] }),
  component: Dashboard,
});

function KPI({ label, value, delta, positive }: { label: string; value: string; delta: string; positive?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div
          className={
            "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] " +
            (positive ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive")
          }
        >
          {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {delta}
        </div>
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Dashboard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? user?.email?.split("@")[0];

  return (
    <div className="space-y-8">
      <header>
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {t("dash.phase")}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("dash.welcome")}, <span className="text-gradient">{name}</span>
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label={t("dash.kpi.revenue")} value="—" delta="0.0%" positive />
        <KPI label={t("dash.kpi.costs")} value="—" delta="0.0%" />
        <KPI label={t("dash.kpi.ebitda")} value="—" delta="0.0%" positive />
        <KPI label={t("dash.kpi.net")} value="—" delta="0.0%" positive />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="glass col-span-1 rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {t("dash.cashflow")}
            </h2>
          </div>
          <div className="mt-6 grid h-48 place-items-center rounded-xl bg-muted/40 font-mono text-xs text-muted-foreground">
            {t("dash.coming")}
          </div>
        </section>

        <section className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {t("dash.agenda")}
            </h2>
          </div>
          <div className="mt-6 grid h-48 place-items-center rounded-xl bg-muted/40 font-mono text-xs text-muted-foreground">
            {t("dash.coming")}
          </div>
        </section>

        <section className="glass col-span-1 rounded-2xl p-5 lg:col-span-3">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-primary" />
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {t("dash.habits")}
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <div
                key={d}
                className="grid size-12 place-items-center rounded-xl border border-border/60 bg-card/40 font-mono text-xs text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            {lang === "es"
              ? "Tu sistema de rachas se activará en la fase de Productividad."
              : "Streak system unlocks in the Productivity phase."}
          </p>
        </section>
      </div>
    </div>
  );
}