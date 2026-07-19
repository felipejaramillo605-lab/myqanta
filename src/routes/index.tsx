import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Qanta — Centro de mando financiero y operativo" },
      { name: "description", content: "ERP ligero que combina finanzas (EBITDA), inventario, hábitos y agenda con IA." },
      { property: "og:title", content: "Qanta — Centro de mando financiero y operativo" },
      { property: "og:description", content: "ERP ligero que combina finanzas (EBITDA), inventario, hábitos y agenda con IA." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[500px] rounded-full bg-chart-2/15 blur-[120px]" />
      </div>

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <span className="font-mono text-sm font-bold">Q</span>
          </div>
          <span className="font-mono text-lg tracking-tight">{t("app.name")}</span>
        </div>
        <Link to={user ? "/dashboard" : "/auth"}>
          <Button variant="secondary" size="sm" className="glass-subtle">
            {user ? t("nav.dashboard") : t("auth.signin")}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </nav>

      <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pb-20 pt-20 text-center sm:pt-32">
        <div className="glass-subtle mb-8 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3 text-primary" />
          {t("dash.phase")}
        </div>
        <h1 className="text-gradient max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          {t("app.name")}
        </h1>
        <p className="mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
          {t("auth.welcome_sub")}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to={user ? "/dashboard" : "/auth"}>
            <Button size="lg" className="font-medium">
              {user ? t("nav.dashboard") : t("auth.signup")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "nav.finance", d: "EBITDA · P&L · IA" },
            { k: "nav.inventory", d: "B2C · B2B · OCR" },
            { k: "nav.productivity", d: "Hábitos · Rachas" },
            { k: "nav.agenda", d: "Citas · Recordatorios" },
          ].map((c) => (
            <div key={c.k} className="glass rounded-2xl p-5 text-left">
              <div className="text-sm font-medium">{t(c.k as never)}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{c.d}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
