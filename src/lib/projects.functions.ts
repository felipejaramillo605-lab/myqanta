import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";
import { computeProjectProfitability } from "./project-profitability";

export const PROJECT_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_TYPES = ["video", "design", "social_media", "campaign", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

// ===== Projects =====
const ProjectInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(40).nullable().optional(),
  client_name: z.string().trim().max(160).nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).default("active"),
  project_type: z.enum(PROJECT_TYPES).default("other"),
  platform: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  budget_amount: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().max(8).default("EUR"),
});


export type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  client_name: string | null;
  customer_id: string | null;
  status: ProjectStatus;
  project_type: ProjectType;
  platform: string | null;

  description: string | null;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_amount: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const { data, error } = await context.supabase
      .from("projects" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ProjectRow[];
  });

export const upsertProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const payload: Record<string, unknown> = {
      ...data,
      customer_id: data.customer_id || null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      budget_amount: data.budget_amount ?? null,
      org_id: orgId,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("projects" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Ensure creator is a lead member on new projects
    if (!data.id && out) {
      const row = out as unknown as { id: string; org_id: string };
      await context.supabase.from("project_members" as never).upsert({
        project_id: row.id,
        org_id: row.org_id,
        user_id: context.userId,
        role: "lead",
      } as never, { onConflict: "project_id,user_id" } as never);
    }
    return out;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "admin");
    const { error } = await context.supabase.from("projects" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Time entries =====
const TimeEntryInput = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  task_id: z.string().uuid().nullable().optional(),
  entry_date: z.string().min(8),
  hours: z.number().positive().max(24),
  billable: z.boolean().default(true),
  note: z.string().trim().max(500).nullable().optional(),
});

export type TimeEntryRow = {
  id: string;
  org_id: string;
  project_id: string;
  task_id: string | null;
  user_id: string;
  entry_date: string;
  hours: number;
  billable: boolean;
  note: string | null;
  created_at: string;
};

export const listTimeEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      mine: z.boolean().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    let q = context.supabase
      .from("time_entries" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("entry_date", { ascending: false })
      .limit(500);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    if (data.mine) q = q.eq("user_id", context.userId);
    if (data.from) q = q.gte("entry_date", data.from);
    if (data.to) q = q.lte("entry_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as TimeEntryRow[];
  });

export const upsertTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TimeEntryInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const payload: Record<string, unknown> = {
      ...data,
      task_id: data.task_id || null,
      note: data.note ?? null,
      org_id: orgId,
      user_id: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("time_entries" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const { data: member } = await context.supabase
      .from("organization_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const isAdmin = member?.role === "admin" || member?.role === "owner";
    let q = context.supabase
      .from("time_entries" as never)
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (!isAdmin) q = q.eq("user_id", context.userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Aggregate hours per project (last 90 days) — small in-memory rollup.
export const projectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("time_entries" as never)
      .select("project_id,hours,billable,entry_date")
      .eq("org_id", orgId)
      .gte("entry_date", since);
    if (error) throw new Error(error.message);
    const map = new Map<string, { total: number; billable: number }>();
    for (const r of (data ?? []) as unknown as Array<{ project_id: string; hours: number; billable: boolean }>) {
      const cur = map.get(r.project_id) ?? { total: 0, billable: 0 };
      cur.total += Number(r.hours);
      if (r.billable) cur.billable += Number(r.hours);
      map.set(r.project_id, cur);
    }
    return Array.from(map.entries()).map(([project_id, v]) => ({ project_id, ...v }));
  });