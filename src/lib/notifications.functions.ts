import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Notification = {
  id: string;
  kind: "low_stock" | "task_due" | "task_overdue" | "event_upcoming";
  title: string;
  detail?: string;
  href: string;
  severity: "info" | "warning" | "danger";
  date?: string;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

    const [lowStockRes, tasksRes, eventsRes] = await Promise.all([
      context.supabase
        .from("inv_products")
        .select("id,name,stock,min_stock,unit")
        .gt("min_stock", 0)
        .order("name"),
      context.supabase
        .from("tasks")
        .select("id,title,due_date,status")
        .neq("status", "done")
        .neq("status", "archived")
        .not("due_date", "is", null)
        .lte("due_date", in48h),
      context.supabase
        .from("events")
        .select("id,title,starts_at,location")
        .gte("starts_at", now.toISOString())
        .lt("starts_at", in48h)
        .order("starts_at"),
    ]);

    const notifs: Notification[] = [];

    for (const p of lowStockRes.data ?? []) {
      if (Number(p.stock) <= Number(p.min_stock)) {
        notifs.push({
          id: `low:${p.id}`,
          kind: "low_stock",
          title: p.name,
          detail: `${Number(p.stock)} / ${Number(p.min_stock)} ${p.unit}`,
          href: "/inventory",
          severity: "warning",
        });
      }
    }

    for (const tk of tasksRes.data ?? []) {
      if (!tk.due_date) continue;
      const overdue = tk.due_date.slice(0, 10) < today;
      notifs.push({
        id: `task:${tk.id}`,
        kind: overdue ? "task_overdue" : "task_due",
        title: tk.title,
        detail: new Date(tk.due_date).toLocaleString(),
        href: "/habits",
        severity: overdue ? "danger" : "info",
        date: tk.due_date,
      });
    }

    for (const ev of eventsRes.data ?? []) {
      notifs.push({
        id: `event:${ev.id}`,
        kind: "event_upcoming",
        title: ev.title,
        detail: [new Date(ev.starts_at).toLocaleString(), ev.location].filter(Boolean).join(" · "),
        href: "/agenda",
        severity: "info",
        date: ev.starts_at,
      });
    }

    return notifs;
  });