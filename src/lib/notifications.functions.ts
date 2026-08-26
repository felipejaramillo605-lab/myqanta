import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import type { NotificationBase } from "./notifications.server";

export type Notification = NotificationBase & { read: boolean };

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Notification[]> => {
    const { computeNotifications } = await import("./notifications.server");
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const notifs = await computeNotifications(context.supabase, context.userId, orgId);

    const readsRes = await context.supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("org_id", orgId)
      .eq("user_id", context.userId);
    const readIds = new Set((readsRes.data ?? []).map((r) => r.notification_id));

    return notifs.map((n) => ({ ...n, read: readIds.has(n.id) }));
  });

/**
 * Marca una notificación sintética como leída.
 *
 * Nota de mantenimiento: los ids son sintéticos y dependen del estado actual
 * (ej. `task:<uuid>` deja de generarse cuando la tarea se completa o deja de
 * estar vencida). En ese caso la fila de `notification_reads` queda huérfana.
 * Es inofensivo (solo ocupa espacio y nunca se vuelve a leer) y no requiere
 * limpieza inmediata; si la tabla creciera demasiado se puede purgar por
 * antigüedad de `read_at`.
 */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase.from("notification_reads").upsert(
      {
        org_id: orgId,
        user_id: context.userId,
        notification_id: data.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "org_id,user_id,notification_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { computeNotifications } = await import("./notifications.server");
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const notifs = await computeNotifications(context.supabase, context.userId, orgId);
    if (notifs.length === 0) return { ok: true, count: 0 };
    const readAt = new Date().toISOString();
    const { error } = await context.supabase.from("notification_reads").upsert(
      notifs.map((n) => ({
        org_id: orgId,
        user_id: context.userId,
        notification_id: n.id,
        read_at: readAt,
      })),
      { onConflict: "org_id,user_id,notification_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: notifs.length };
  });
