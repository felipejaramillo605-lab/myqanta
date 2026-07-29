import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextOccurrence } from "./reminders-recurrence";

type AnyClient = SupabaseClient<any, any, any>;

export type DispatchResult = {
  provider: string | null;
  ok: boolean;
  simulated: boolean;
  error?: string | null;
  messageId?: string | null;
};

export async function dispatchReminder(
  channel: string,
  opts: { phone?: string | null; email?: string | null; title: string; message: string; provider?: string | null },
): Promise<DispatchResult> {
  if (channel === "email") {
    const { sendGmail } = await import("./gmail.server");
    if (!opts.email) return { provider: "gmail", ok: false, simulated: false, error: "Sin correo de destino." };
    return (await sendGmail(opts.email, opts.title, opts.message)) as DispatchResult;
  }
  const { sendWhatsapp } = await import("./whatsapp.server");
  if (!opts.phone) return { provider: opts.provider ?? "mock", ok: false, simulated: false, error: "Sin teléfono de destino." };
  return (await sendWhatsapp(opts.phone, opts.message, opts.provider ?? undefined)) as DispatchResult;
}

/**
 * Sends one reminder, updates its state, and schedules the next occurrence
 * when it is recurrent. Works with any Supabase client (user-scoped or
 * service_role) so it can be reused from a system cron job with no session.
 */
export async function processDueReminder(client: AnyClient, r: any) {
  const res = await dispatchReminder(r.channel ?? "whatsapp", {
    phone: r.phone_e164,
    email: r.email,
    title: r.title,
    message: r.message,
    provider: r.provider,
  });

  const patch = res.ok
    ? {
        status: "sent" as const,
        sent_at: new Date().toISOString(),
        provider_message_id: res.messageId ?? null,
        error: null,
        attempts: (r.attempts ?? 0) + 1,
      }
    : {
        status: "failed" as const,
        error: res.error ?? "Error desconocido",
        attempts: (r.attempts ?? 0) + 1,
      };
  await client.from("reminders").update(patch).eq("id", r.id);

  if (res.ok && r.recurrence && r.recurrence !== "none") {
    const next = computeNextOccurrence(
      r.scheduled_at,
      r.recurrence,
      r.recurrence_interval ?? 1,
      r.recurrence_until,
    );
    if (next) {
      await client.from("reminders").insert({
        org_id: r.org_id,
        user_id: r.user_id,
        source_type: r.source_type,
        source_id: r.source_id,
        title: r.title,
        message: r.message,
        channel: r.channel,
        phone_e164: r.phone_e164,
        email: r.email,
        team_member_id: r.team_member_id,
        scheduled_at: next.toISOString(),
        provider: r.provider,
        recurrence: r.recurrence,
        recurrence_interval: r.recurrence_interval ?? 1,
        recurrence_until: r.recurrence_until,
        parent_reminder_id: r.parent_reminder_id ?? r.id,
      });
    }
  }

  return { ok: res.ok, simulated: res.simulated };
}