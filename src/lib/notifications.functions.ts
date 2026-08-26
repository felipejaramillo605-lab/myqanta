import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";

export type Notification = {
  id: string;
  kind: "low_stock" | "task_due" | "task_overdue" | "event_upcoming" | "reminder_due" | "reminder_failed";
  title: string;
  detail?: string;
  href: string;
  severity: "info" | "warning" | "danger";
  date?: string;
  read: boolean;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();


    const [lowStockRes, tasksRes, eventsRes, remindersRes] = await Promise.all([
      context.supabase
        .from("inv_products")
        .select("id,name,stock,min_stock,unit")
        .eq("org_id", orgId)
        .gt("min_stock", 0)
        .order("name"),
      context.supabase
        .from("tasks")
        .select("id,title,due_date,status")
        .eq("org_id", orgId)
        .neq("status", "done")
        .neq("status", "archived")
        .not("due_date", "is", null)
        .lte("due_date", in48h),
      context.supabase
        .from("events")
        .select("id,title,starts_at,location")
        .eq("org_id", orgId)
        .gte("starts_at", now.toISOString())
        .lt("starts_at", in48h)
        .order("starts_at"),
      context.supabase
        .from("reminders")
        .select("id,title,scheduled_at,status,channel,error")
        .eq("org_id", orgId)
        .eq("user_id", context.userId)
        .in("status", ["pending", "failed"])
        .lte("scheduled_at", in48h)
        .order("scheduled_at")
        .limit(50),
    ]);

    const notifs: Omit<Notification, "read">[] = [];

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
          failed ? `Falló: ${r.error ?? "error"}` : `${r.channel === "email" ? "Email" : "WhatsApp"} · ${new Date(r.scheduled_at).toLocaleString()}`,
        ].join(" "),
        href: "/reminders",
        severity: failed ? "danger" : "info",
        date: r.scheduled_at,
      });
    }

    // Las notificaciones son sintéticas (se recalculan en cada request), así que
    // marcamos "read" cruzando sus ids contra notification_reads del usuario.
    const readsRes = await context.supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("org_id", orgId)
      .eq("user_id", context.userId);
    const readIds = new Set((readsRes.data ?? []).map((r) => r.notification_id));

    return notifs.map((n): Notification => ({ ...n, read: readIds.has(n.id) }));
  });

/**
 * Marca una notificación sintética como leída.
 *
 * Nota de mantenimiento: los ids son sintéticos y dependen del estado actual
 * (ej. `task:<uuid>` desaparece cuando la tarea se completa). Si el id ya no
 * se genera, la fila en `notification_reads` queda huérfana. Es inofensivo
 * (solo ocupa espacio) y no requiere limpieza inmediata; si algún día crece
 * demasiado, se puede purgar por antigüedad de `read_at`.
 */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("notification_reads")
      .upsert(
        { org_id: orgId, user_id: context.userId, notification_id: data.id, read_at: new Date().toISOString() },
        { onConflict: "org_id,user_id,notification_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const current = await listNotifications();
    const rows = current.map((n) => ({
      org_id: orgId,
      user_id: context.userId,
      notification_id: n.id,
      read_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return { ok: true, count: 0 };
    const { error } = await context.supabase
      .from("notification_reads")
      .upsert(rows, { onConflict: "org_id,user_id,notification_id" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });
