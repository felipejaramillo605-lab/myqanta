import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, AlertTriangle, CalendarClock, ListChecks, Check, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from "@/lib/notifications.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

function iconFor(n: Notification) {
  if (n.kind === "low_stock") return <AlertTriangle className="size-3.5" />;
  if (n.kind === "event_upcoming") return <CalendarClock className="size-3.5" />;
  return <ListChecks className="size-3.5" />;
}

export function NotificationBell() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fn = useServerFn(listNotifications);
  const markOneFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markOneFn({ data: { id } }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<Notification[]>(["notifications"]);
      qc.setQueryData<Notification[]>(["notifications"], (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllFn(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<Notification[]>(["notifications"]);
      qc.setQueryData<Notification[]>(["notifications"], (old) =>
        (old ?? []).map((n) => ({ ...n, read: true })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data.filter((n) => !n.read);
  const count = unread.length;
  const danger = unread.some((n) => n.severity === "danger");

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
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("notif.title")} {count > 0 && <span className="font-mono">· {count}</span>}
          </span>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="mr-1 size-3.5" />
              {t("notif.markAll")}
            </Button>
          )}
        </div>
        {data.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">{t("notif.empty")}</div>
        ) : (
          <ul className="max-h-96 divide-y divide-border/30 overflow-auto">
            {data.map((n) => (
              <li key={n.id} className="flex items-stretch">
                <Link
                  to={n.href as never}
                  onClick={() => {
                    if (!n.read) markOne.mutate(n.id);
                  }}
                  className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-sm transition hover:bg-sidebar-accent/40"
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
                    <div className={"truncate " + (n.read ? "text-muted-foreground" : "font-medium")}>
                      {n.title}
                    </div>
                    {n.detail && (
                      <div className="truncate font-mono text-[10px] text-muted-foreground">{n.detail}</div>
                    )}
                  </div>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                </Link>
                {!n.read && (
                  <button
                    type="button"
                    aria-label={t("notif.markRead")}
                    title={t("notif.markRead")}
                    onClick={() => markOne.mutate(n.id)}
                    className="grid w-9 shrink-0 place-items-center border-l border-border/30 text-muted-foreground transition hover:bg-sidebar-accent/40 hover:text-foreground"
                  >
                    <Check className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
