import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type NotificationKind =
  | "low_stock"
  | "task_due"
  | "task_overdue"
  | "event_upcoming"
  | "reminder_due"
  | "reminder_failed";

export type NotificationBase = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  href: string;
  severity: "info" | "warning" | "danger";
  date?: string;
};

/**
 * Calcula las notificaciones vivas de la organización para un usuario.
 * Los ids son sintéticos y derivados del estado actual (`low:<id>`, `task:<id>`, …).
 */
export async function computeNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<NotificationBase[]> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in48h = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

  const [lowStockRes, tasksRes, eventsRes, remindersRes] = await Promise.all([
    supabase
      .from("inv_products")
      .select("id,name,stock,min_stock,unit")
      .eq("org_id", orgId)
      .gt("min_stock", 0)
      .order("name"),
    supabase
      .from("tasks")
      .select("id,title,due_date,status")
      .eq("org_id", orgId)
      .neq("status", "done")
      .neq("status", "archived")
      .not("due_date", "is", null)
      .lte("due_date", in48h),
    supabase
      .from("events")
      .select("id,title,starts_at,location")
      .eq("org_id", orgId)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", in48h)
      .order("starts_at"),
    supabase
      .from("reminders")
      .select("id,title,scheduled_at,status,channel,error")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .in("status", ["pending", "failed"])
      .lte("scheduled_at", in48h)
      .order("scheduled_at")
      .limit(50),
  ]);

  const notifs: NotificationBase[] = [];

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

  for (const r of remindersRes.data ?? []) {
    const failed = r.status === "failed";
    notifs.push({
      id: `reminder:${r.id}`,
      kind: failed ? "reminder_failed" : "reminder_due",
      title: r.title,
      detail: [
        failed
          ? `Falló: ${r.error ?? "error"}`
          : `${r.channel === "email" ? "Email" : "WhatsApp"} · ${new Date(r.scheduled_at).toLocaleString()}`,
      ].join(" "),
      href: "/reminders",
      severity: failed ? "danger" : "info",
      date: r.scheduled_at,
    });
  }

  return notifs;
}
