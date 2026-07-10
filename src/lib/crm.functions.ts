import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";

export const DEAL_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

// ===== Contacts =====
const ContactInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(32).nullable().optional(),
  title: z.string().trim().max(120).nullable().optional(),
  source: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("crm_contacts" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; name: string; company: string | null; email: string | null;
      phone: string | null; title: string | null; source: string | null;
      tags: string[]; notes: string | null; archived: boolean; created_at: string;
    }>;
  });

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ContactInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const payload: Record<string, unknown> = {
      ...data,
      email: data.email || null,
      tags: data.tags ?? [],
      org_id: orgId,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("crm_contacts" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("crm_contacts" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Deals =====
const DealInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  contact_id: z.string().uuid().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  amount: z.number().min(0).default(0),
  currency: z.string().trim().min(3).max(6).default("EUR"),
  probability: z.number().int().min(0).max(100).default(20),
  expected_close_date: z.string().nullable().optional(),
  lost_reason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  position: z.number().int().optional(),
});

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("crm_deals" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("stage")
      .order("position");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; title: string; contact_id: string | null; owner_user_id: string | null;
      stage: DealStage; amount: number; currency: string; probability: number;
      expected_close_date: string | null; closed_at: string | null; lost_reason: string | null;
      notes: string | null; position: number; created_at: string;
    }>;
  });

export const upsertDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DealInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const payload: Record<string, unknown> = {
      ...data,
      org_id: orgId,
      created_by: context.userId,
    };
    if (data.stage === "won" || data.stage === "lost") {
      payload.closed_at = new Date().toISOString();
    } else if (data.stage) {
      payload.closed_at = null;
    }
    const { data: out, error } = await context.supabase
      .from("crm_deals" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const moveDealStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), stage: z.enum(DEAL_STAGES), position: z.number().int().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const patch: Record<string, unknown> = { stage: data.stage };
    if (typeof data.position === "number") patch.position = data.position;
    if (data.stage === "won" || data.stage === "lost") patch.closed_at = new Date().toISOString();
    else patch.closed_at = null;
    const { error } = await context.supabase.from("crm_deals" as never).update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("crm_deals" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Activities =====
const ActivityInput = z.object({
  id: z.string().uuid().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["note", "call", "email", "meeting", "task"]).default("note"),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().max(4000).nullable().optional(),
  occurred_at: z.string().optional(),
});

export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ deal_id: z.string().uuid().optional(), contact_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    let q = context.supabase.from("crm_activities" as never).select("*").eq("org_id", orgId);
    if (data.deal_id) q = q.eq("deal_id", data.deal_id);
    if (data.contact_id) q = q.eq("contact_id", data.contact_id);
    const { data: rows, error } = await q.order("occurred_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Array<{
      id: string; contact_id: string | null; deal_id: string | null;
      kind: string; subject: string | null; body: string | null; occurred_at: string;
    }>;
  });

export const addActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActivityInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const payload: Record<string, unknown> = {
      ...data,
      org_id: orgId,
      created_by: context.userId,
      occurred_at: data.occurred_at ?? new Date().toISOString(),
    };
    const { data: out, error } = await context.supabase
      .from("crm_activities" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("crm_activities" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });