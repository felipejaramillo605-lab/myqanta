import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { listLowStock } from "@/lib/inventory.functions";
import { useI18n } from "@/lib/i18n";

export function LowStockAlerts({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const fn = useServerFn(listLowStock);
  const { data } = useSuspenseQuery({ queryKey: ["inv", "low"], queryFn: () => fn() });

  if (data.length === 0) {
    return (
      <section className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <AlertTriangle className="size-4 text-primary" />
          {t("inv.alerts.title")}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("inv.alerts.empty")}</p>
      </section>
    );
  }

  const items = compact ? data.slice(0, 5) : data;

  return (
    <section className="glass rounded-2xl border border-destructive/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-destructive">
          <AlertTriangle className="size-4" />
          {t("inv.alerts.title")}
        </div>
        <span className="font-mono text-xs text-destructive">
          {data.length} {t("inv.alerts.count")}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-border/30">
        {items.map((p) => {
          const stock = Number(p.stock);
          const min = Number(p.min_stock);
          const below = stock < min;
          return (
            <li key={p.id} className="flex items-center justify-between py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{p.name}</div>
                {p.sku && (
                  <div className="font-mono text-[10px] text-muted-foreground">{p.sku}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">
                  {min} {p.unit}
                </span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 font-mono text-[10px] " +
                    (below
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/15 text-primary")
                  }
                >
                  {stock} {p.unit} · {below ? t("inv.alerts.below") : t("inv.alerts.at")}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {compact && data.length > items.length && (
        <div className="mt-3 text-right">
          <Link to="/inventory" className="font-mono text-xs text-primary hover:underline">
            +{data.length - items.length} →
          </Link>
        </div>
      )}
    </section>
  );
}