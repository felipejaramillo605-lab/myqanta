import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, AlertTriangle, CalendarClock, ListChecks } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listNotifications, type Notification } from "@/lib/notifications.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

function iconFor(n: Notification) {
  if (n.kind === "low_stock") return <AlertTriangle className="size-3.5" />;
  if (n.kind === "event_upcoming") return <CalendarClock className="size-3.5" />;
  return <ListChecks className="size-3.5" />;
}

export function NotificationBell() {
  const { t } = useI18n();
  const fn = useServerFn(listNotifications);
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const count = data.length;
  const danger = data.some((n) => n.severity === "danger");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="notifications">
          <Bell className="size-4" />
          {count > 0 && (
            <span
              className={
                "absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold text-primary-foreground " +
                (danger ? "bg-destructive" : "bg-primary")
              }
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass w-80 p-0">
        <div className="border-b border-border/50 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("notif.title")} {count > 0 && <span className="font-mono">· {count}</span>}
        </div>
        {count === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">{t("notif.empty")}</div>
        ) : (
          <ul className="max-h-96 divide-y divide-border/30 overflow-auto">
            {data.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.href as never}
                  className="flex items-start gap-3 px-4 py-3 text-sm transition hover:bg-sidebar-accent/40"
                >
                  <div
                    className={
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md " +
                      (n.severity === "danger"
                        ? "bg-destructive/15 text-destructive"
                        : n.severity === "warning"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-primary/15 text-primary")
                    }
                  >
                    {iconFor(n)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{n.title}</div>
                    {n.detail && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground">{n.detail}</div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}