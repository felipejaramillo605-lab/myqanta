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
// ===== Project members (with per-project hourly rate) =====
const ProjectMemberInput = z.object({
  project_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["lead", "member", "viewer"]).default("member"),
  hourly_rate: z.number().nonnegative().nullable().optional(),
});

export type ProjectMemberRow = {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  role: "lead" | "member" | "viewer";
  hourly_rate: number | null;
  created_at: string;
};

export const listProjectMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    let q = context.supabase
      .from("project_members" as never)
      .select("*")
      .eq("org_id", orgId);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ProjectMemberRow[];
  });

export const upsertProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectMemberInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "admin");
    // Ensure the project belongs to the caller's org.
    const { data: project, error: pErr } = await context.supabase
      .from("projects" as never)
      .select("id")
      .eq("id", data.project_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Project not found");

    const { data: out, error } = await context.supabase
      .from("project_members" as never)
      .upsert(
        {
          project_id: data.project_id,
          user_id: data.user_id,
          role: data.role,
          hourly_rate: data.hourly_rate ?? null,
          org_id: orgId,
        } as never,
        { onConflict: "project_id,user_id" } as never,
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as ProjectMemberRow;
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: z.string().uuid(), user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "admin");
    const { error } = await context.supabase
      .from("project_members" as never)
      .delete()
      .eq("org_id", orgId)
      .eq("project_id", data.project_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Project expenses =====
const ProjectExpenseInput = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid(),
  description: z.string().trim().min(1).max(300),
  amount: z.number().nonnegative(),
  currency: z.string().trim().max(8).default("EUR"),
  expense_date: z.string().min(8),
  category: z.string().trim().max(80).nullable().optional(),
});

export type ProjectExpenseRow = {
  id: string;
  org_id: string;
  project_id: string;
  description: string;
  amount: number;
  currency: string;
  expense_date: string;
  category: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const listProjectExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      project_id: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    let q = context.supabase
      .from("project_expenses" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("expense_date", { ascending: false })
      .limit(500);
    if (data.project_id) q = q.eq("project_id", data.project_id);
    if (data.from) q = q.gte("expense_date", data.from);
    if (data.to) q = q.lte("expense_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ProjectExpenseRow[];
  });

export const upsertProjectExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectExpenseInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const { data: project, error: pErr } = await context.supabase
      .from("projects" as never)
      .select("id")
      .eq("id", data.project_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!project) throw new Error("Project not found");

    const payload: Record<string, unknown> = {
      ...data,
      category: data.category ?? null,
      org_id: orgId,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("project_expenses" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as ProjectExpenseRow;
  });

export const deleteProjectExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");
    const { error } = await context.supabase
      .from("project_expenses" as never)
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Profitability =====
export const projectProfitability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ include_all_statuses: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/projects", "member");

    let projectsQuery = context.supabase
      .from("projects" as never)
      .select("id,name,status,project_type,platform,budget_amount,currency,client_name")
      .eq("org_id", orgId);
    if (!data.include_all_statuses) projectsQuery = projectsQuery.eq("status", "active");

    const [projectsRes, timeRes, ratesRes, expensesRes, invoicesRes] = await Promise.all([
      projectsQuery,
      context.supabase.from("time_entries" as never).select("project_id,user_id,hours").eq("org_id", orgId),
      context.supabase.from("project_members" as never).select("project_id,user_id,hourly_rate").eq("org_id", orgId),
      context.supabase.from("project_expenses" as never).select("project_id,amount").eq("org_id", orgId),
      context.supabase.from("sales_invoices" as never).select("project_id,total,paid_amount").eq("org_id", orgId),
    ]);
    for (const res of [projectsRes, timeRes, ratesRes, expensesRes, invoicesRes]) {
      if (res.error) throw new Error(res.error.message);
    }

    const projects = (projectsRes.data ?? []) as unknown as Array<{
      id: string;
      name: string;
      status: ProjectStatus;
      project_type: ProjectType;
      platform: string | null;
      budget_amount: number | null;
      currency: string;
      client_name: string | null;
    }>;
    const ids = new Set(projects.map((p) => p.id));

    const rows = computeProjectProfitability({
      projectIds: projects.map((p) => p.id),
      timeEntries: ((timeRes.data ?? []) as unknown as Array<{ project_id: string; user_id: string; hours: number }>)
        .filter((t) => ids.has(t.project_id)),
      memberRates: ((ratesRes.data ?? []) as unknown as Array<{ project_id: string; user_id: string; hourly_rate: number | null }>)
        .filter((m) => ids.has(m.project_id)),
      expenses: ((expensesRes.data ?? []) as unknown as Array<{ project_id: string; amount: number }>)
        .filter((e) => ids.has(e.project_id)),
      invoices: ((invoicesRes.data ?? []) as unknown as Array<{ project_id: string | null; total: number; paid_amount: number }>)
        .filter((i) => !!i.project_id && ids.has(i.project_id)),
    });

    const byId = new Map(rows.map((r) => [r.project_id, r]));
    return projects.map((p) => ({
      project: p,
      ...(byId.get(p.id) ?? {
        project_id: p.id,
        hours: 0,
        hours_cost: 0,
        expenses: 0,
        invoiced_total: 0,
        invoiced_paid: 0,
        cost_total: 0,
        margin: 0,
        margin_pct: null,
      }),
    }));
  });
