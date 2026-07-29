import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";

const SourceType = z.enum(["task", "habit", "event", "custom"]);
const RecurrenceEnum = z.enum(["none", "daily", "weekly", "monthly"]);
const ChannelEnum = z.enum(["whatsapp", "email"]);

// ===== Settings =====
export const getWhatsappSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {
      user_id: context.userId,
      phone_e164: null,
      enabled: true,
      provider: "mock",
      default_lead_minutes: 30,
    };
  });

const SettingsInput = z.object({
  phone_e164: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  default_lead_minutes: z.number().int().min(0).max(1440).optional(),
});

export const upsertWhatsappSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettingsInput.parse(d))
  .handler(async ({ context, data }) => {
    const payload = { user_id: context.userId, ...data };
    const { data: out, error } = await context.supabase
      .from("whatsapp_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

// ===== Reminders =====
export const listReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { data, error } = await context.supabase
      .from("reminders")
      .select("*")
      .eq("org_id", orgId)
      .eq("user_id", context.userId)
      .order("scheduled_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const CreateInput = z.object({
  source_type: SourceType.default("custom"),
  source_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  message: z.string().min(1).max(1000),
  channel: ChannelEnum.default("whatsapp"),
  phone_e164: z.string().min(6).nullable().optional(),
  email: z.string().email().nullable().optional(),
  team_member_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string(),
  recurrence: RecurrenceEnum.default("none"),
  recurrence_interval: z.number().int().min(1).max(365).default(1),
  recurrence_until: z.string().nullable().optional(),
});

export const createReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    if (data.channel === "email" && !data.email) throw new Error("Falta el correo de destino.");
    if (data.channel === "whatsapp" && !data.phone_e164) throw new Error("Falta el número de WhatsApp.");
    const { data: settings } = await context.supabase
      .from("whatsapp_settings")
      .select("provider")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: out, error } = await context.supabase
      .from("reminders")
      .insert({
        org_id: orgId,
        user_id: context.userId,
        source_type: data.source_type,
        source_id: data.source_id ?? null,
        title: data.title,
        message: data.message,
        channel: data.channel,
        phone_e164: data.phone_e164 ?? null,
        email: data.email ?? null,
        team_member_id: data.team_member_id ?? null,
        scheduled_at: data.scheduled_at,
        provider: data.channel === "email" ? "gmail" : (settings?.provider ?? "mock"),
        recurrence: data.recurrence,
        recurrence_interval: data.recurrence_interval,
        recurrence_until: data.recurrence_until ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const cancelReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("reminders")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("reminders")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendReminderNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: r, error } = await context.supabase
      .from("reminders")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r) throw new Error("Reminder not found");

    const { processDueReminder } = await import("./reminders-dispatch.server");
    return processDueReminder(context.supabase as any, r);
  });

// Sources for quick-create dropdown (upcoming tasks / events / habits)
export const listReminderSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const now = new Date().toISOString();
    const [tasks, events, habits, team] = await Promise.all([
      context.supabase
        .from("tasks")
        .select("id,title,due_date")
        .eq("org_id", orgId)
        .neq("status", "done")
        .neq("status", "archived")
        .not("due_date", "is", null)
        .gte("due_date", now)
        .order("due_date")
        .limit(50),
      context.supabase
        .from("events")
        .select("id,title,starts_at")
        .eq("org_id", orgId)
        .gte("starts_at", now)
        .order("starts_at")
        .limit(50),
      context.supabase
        .from("habits")
        .select("id,name")
        .eq("org_id", orgId)
        .eq("archived", false)
        .order("name")
        .limit(50),
      context.supabase
        .from("team_members")
        .select("id,code,full_name,email,phone_e164,position")
        .eq("org_id", orgId)
        .eq("archived", false)
        .order("full_name")
        .limit(200),
    ]);
    return {
      tasks: tasks.data ?? [],
      events: events.data ?? [],
      habits: habits.data ?? [],
      team: team.data ?? [],
    };
  });