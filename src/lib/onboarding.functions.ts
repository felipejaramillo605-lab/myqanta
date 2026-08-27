import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";

export type OnboardingState = {
  org_id: string;
  step: number;
  skipped: boolean;
  onboarded_at: string | null;
  name: string;
  industry: string | null;
  business_type: string | null;
  description: string | null;
  goals: string | null;
  team_size: string | null;
  currency: string | null;
  view_mode: "business" | "personal";
  hidden_modules: string[];
  is_owner: boolean;
};

export type SetupChecklist = {
  profile_done: boolean;
  mode_done: boolean;
  team_count: number;
  agenda_count: number;
  finance_count: number;
  product_count: number;
  contact_count: number;
  invoice_count: number;
};

export const getOnboardingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingState> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const [orgRes, memberRes] = await Promise.all([
      context.supabase
        .from("organizations")
        .select(
          "id,name,industry,business_type,description,goals,team_size,currency,onboarded_at,view_mode,hidden_modules,onboarding_step,onboarding_skipped",
        )
        .eq("id", orgId)
        .maybeSingle(),
      context.supabase
        .from("organization_members")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (orgRes.error) throw new Error(orgRes.error.message);
    const row = (orgRes.data ?? {}) as Record<string, unknown>;
    return {
      org_id: orgId,
      step: Number(row["onboarding_step"] ?? 0),
      skipped: !!row["onboarding_skipped"],
      onboarded_at: (row["onboarded_at"] as string | null) ?? null,
      name: (row["name"] as string | null) ?? "",
      industry: (row["industry"] as string | null) ?? null,
      business_type: (row["business_type"] as string | null) ?? null,
      description: (row["description"] as string | null) ?? null,
      goals: (row["goals"] as string | null) ?? null,
      team_size: (row["team_size"] as string | null) ?? null,
      currency: (row["currency"] as string | null) ?? "USD",
      view_mode: row["view_mode"] === "personal" ? "personal" : "business",
      hidden_modules: ((row["hidden_modules"] as string[] | null) ?? []),
      is_owner: memberRes.data?.role === "owner" || memberRes.data?.role === "admin",
    };
  });

/** Estado del tour de producto (por usuario, no por organización). */
export const getProductTourState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ has_seen: boolean }> => {
    const { data } = await context.supabase
      .from("profiles")
      .select("has_seen_product_tour")
      .eq("id", context.userId)
      .maybeSingle();
    return { has_seen: !!(data as { has_seen_product_tour?: boolean } | null)?.has_seen_product_tour };
  });

export const markProductTourSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ has_seen_product_tour: true } as never)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSetupChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SetupChecklist> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const head = { count: "exact" as const, head: true };
    const [org, team, events, tasks, fin, prods, contacts, invoices] = await Promise.all([
      context.supabase
        .from("organizations")
        .select("industry,business_type,goals,onboarding_step,view_mode")
        .eq("id", orgId)
        .maybeSingle(),
      context.supabase.from("team_members").select("id", head).eq("org_id", orgId),
      context.supabase.from("events").select("id", head).eq("org_id", orgId),
      context.supabase.from("tasks").select("id", head).eq("org_id", orgId),
      context.supabase.from("fin_journal_entries").select("id", head).eq("org_id", orgId),
      context.supabase.from("inv_products").select("id", head).eq("org_id", orgId),
      context.supabase.from("crm_contacts").select("id", head).eq("org_id", orgId),
      context.supabase.from("sales_invoices").select("id", head).eq("org_id", orgId),
    ]);
    const o = (org.data ?? {}) as Record<string, unknown>;
    return {
      profile_done: !!o["industry"] && !!o["business_type"],
      mode_done: Number(o["onboarding_step"] ?? 0) > 0 || !!o["view_mode"],
      team_count: team.count ?? 0,
      agenda_count: (events.count ?? 0) + (tasks.count ?? 0),
      finance_count: fin.count ?? 0,
      product_count: prods.count ?? 0,
      contact_count: contacts.count ?? 0,
      invoice_count: invoices.count ?? 0,
    };
  });

export const saveOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ step: z.number().int().min(0).max(10) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("organizations")
      .update({ onboarding_step: data.step } as never)
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveOnboardingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        industry: z.string().trim().min(1).max(80),
        business_type: z.string().trim().min(1).max(40),
        team_size: z.string().trim().max(20).optional().default(""),
        currency: z.string().trim().min(1).max(8).default("USD"),
        description: z.string().trim().max(600).optional().default(""),
        goals: z.string().trim().max(600).optional().default(""),
        step: z.number().int().min(0).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("organizations")
      .update({
        name: data.name,
        industry: data.industry,
        business_type: data.business_type,
        team_size: data.team_size || null,
        currency: data.currency,
        description: data.description || null,
        goals: data.goals || null,
        ...(data.step === undefined ? {} : { onboarding_step: data.step }),
      } as never)
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveOnboardingMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        view_mode: z.enum(["business", "personal"]),
        hidden_modules: z.array(z.string()).default([]),
        step: z.number().int().min(0).max(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("organizations")
      .update({
        view_mode: data.view_mode,
        hidden_modules: data.hidden_modules,
        ...(data.step === undefined ? {} : { onboarding_step: data.step }),
      } as never)
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finishOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ skipped: z.boolean().default(false) }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("organizations")
      .update({
        onboarded_at: new Date().toISOString(),
        onboarding_skipped: data.skipped,
        onboarding_step: 99,
      } as never)
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("organizations")
      .update({ onboarding_step: 0, onboarding_skipped: false, onboarded_at: null } as never)
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
