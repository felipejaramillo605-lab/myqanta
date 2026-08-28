import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";
import { countBusinessDays, getOrgCountry, getPublicHolidays } from "./holidays.server";

export const LEAVE_KINDS = ["vacation", "sick", "permission", "unpaid"] as const;
export const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export type LeaveRow = {
  id: string;
  org_id: string;
  member_id: string;
  kind: LeaveKind;
  start_date: string;
  end_date: string;
  days: number;
  status: LeaveStatus;
  reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type PayrollRow = {
  id: string;
  org_id: string;
  period_year: number;
  period_month: number;
  status: "draft" | "finalized";
  total_gross: number;
  total_net: number;
  notes: string | null;
  details: Array<{ member_id: string; full_name: string; gross: number; net: number }>;
  finance_txn_id: string | null;
  created_at: string;
};

const LeaveInput = z.object({
  id: z.string().uuid().optional(),
  member_id: z.string().uuid(),
  kind: z.enum(LEAVE_KINDS).default("vacation"),
  start_date: z.string().min(8),
  end_date: z.string().min(8),
  days: z.number().nonnegative().max(366).default(0),
  status: z.enum(LEAVE_STATUSES).default("pending"),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const listLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const { data, error } = await context.supabase
      .from("hr_leaves" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("start_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as LeaveRow[];
  });

export const upsertLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeaveInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const calendarDays = Math.max(
      1,
      Math.round((Date.parse(data.end_date) - Date.parse(data.start_date)) / 86400000) + 1,
    );
    let days = data.days > 0 ? data.days : calendarDays;
    if (data.days <= 0 && data.kind === "vacation") {
      // Vacaciones se cuentan en días hábiles (sin fines de semana ni festivos).
      try {
        const country = await getOrgCountry(context.supabase, orgId);
        days = await countBusinessDays(data.start_date, data.end_date, country, context.supabase);
      } catch {
        days = calendarDays;
      }
    }
    const payload: Record<string, unknown> = {
      ...data,
      days,
      reason: data.reason ?? null,
      org_id: orgId,
      created_by: context.userId,
    };
    if (data.status === "approved") {
      payload.approved_by = context.userId;
      payload.approved_at = new Date().toISOString();
    }
    const { data: out, error } = await context.supabase
      .from("hr_leaves" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const { error } = await context.supabase.from("hr_leaves" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==== Payroll ====
const PayrollInput = z.object({
  period_year: z.number().int().min(2000).max(2100),
  period_month: z.number().int().min(1).max(12),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const listPayrollRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const { data, error } = await context.supabase
      .from("hr_payroll_runs" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PayrollRow[];
  });

// Generate a monthly payroll run from team_members.salary_base and optionally
// post a single aggregated expense transaction to Finance.
export const generatePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PayrollInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "admin");
    const { data: members, error: mErr } = await context.supabase
      .from("team_members")
      .select("id, full_name, salary_base, archived")
      .eq("org_id", orgId);
    if (mErr) throw new Error(mErr.message);
    const active = (members ?? []).filter((m: any) => !m.archived && Number(m.salary_base) > 0);
    const details = active.map((m: any) => {
      const gross = Number(m.salary_base) || 0;
      // Simple flat retention estimate (client can tune later)
      const net = Math.round(gross * 0.78 * 100) / 100;
      return { member_id: m.id, full_name: m.full_name, gross, net };
    });
    const total_gross = details.reduce((s, d) => s + d.gross, 0);
    const total_net = details.reduce((s, d) => s + d.net, 0);
    const payload = {
      org_id: orgId,
      period_year: data.period_year,
      period_month: data.period_month,
      status: "draft",
      total_gross,
      total_net,
      details,
      notes: data.notes ?? null,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("hr_payroll_runs" as never)
      .upsert(payload as never, { onConflict: "org_id,period_year,period_month" } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const finalizePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "admin");
    const { data: run, error: rErr } = await context.supabase
      .from("hr_payroll_runs" as never)
      .select("*")
      .eq("id", data.id)
      .eq("org_id", orgId)
      .single();
    if (rErr || !run) throw new Error(rErr?.message ?? "Nómina no encontrada");
    const r = run as unknown as PayrollRow;
    if (r.status === "finalized") return r;
    // Post an aggregated expense to finance_transactions (opex).
    const txnDate = new Date(r.period_year, r.period_month - 1, 28).toISOString().slice(0, 10);
    const { data: txn, error: tErr } = await context.supabase
      .from("finance_transactions" as never)
      .insert({
        org_id: orgId,
        occurred_at: txnDate,
        description: `Nómina ${r.period_year}-${String(r.period_month).padStart(2, "0")}`,
        bucket: "opex",
        amount: r.total_gross,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);
    const { data: updated, error: uErr } = await context.supabase
      .from("hr_payroll_runs" as never)
      .update({ status: "finalized", finance_txn_id: (txn as any).id } as never)
      .eq("id", data.id)
      .select()
      .single();
    if (uErr) throw new Error(uErr.message);
    return updated;
  });

export const deletePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "admin");
    const { error } = await context.supabase.from("hr_payroll_runs" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Convenience for HR page: list members with HR fields.
export const listHrMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const { data, error } = await context.supabase
      .from("team_members")
      .select("id, full_name, position, email, archived, contract_type, salary_base, hire_date, vacation_days_available, cedula" as never)
      .eq("org_id", orgId)
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const HrMemberInput = z.object({
  id: z.string().uuid(),
  contract_type: z.string().trim().max(60).nullable().optional(),
  salary_base: z.number().nonnegative().nullable().optional(),
  hire_date: z.string().nullable().optional(),
  vacation_days_available: z.number().int().min(0).max(365).nullable().optional(),
  cedula: z.string().trim().max(40).nullable().optional(),
});

export const updateHrMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HrMemberInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "admin");
    const { id, ...rest } = data;
    const { data: out, error } = await context.supabase
      .from("team_members")
      .update(rest as never)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

// ==================== Org chart ====================

const OrgNodeInput = z.object({
  id: z.string().uuid().optional(),
  member_id: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(160),
  position_title: z.string().trim().max(160).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  pos_x: z.number().default(0),
  pos_y: z.number().default(0),
});

export const listOrgNodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr/org-chart", "member");
    const { data, error } = await context.supabase
      .from("org_nodes" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const saveOrgNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OrgNodeInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("org_nodes" as never).select("org_id").eq("id", data.id).single();
      if (!existing || (existing as any).org_id !== orgId) throw new Error("Nodo no encontrado");
    }
    const payload = {
      ...data,
      org_id: orgId,
      member_id: data.member_id ?? null,
      parent_id: data.parent_id ?? null,
      position_title: data.position_title ?? null,
    };
    const { data: out, error } = await context.supabase
      .from("org_nodes" as never).upsert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteOrgNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const { error } = await context.supabase.from("org_nodes" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==================== Attendance ====================

// Daily QR token: sha256(salt + org_id + YYYY-MM-DD) truncated.
// Reuses APP_METRICS_SALT so no extra secret is required.
async function computeDayToken(orgId: string, dateISO: string): Promise<string> {
  const salt = process.env.APP_METRICS_SALT ?? "";
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`${salt}|${orgId}|${dateISO}`).digest("hex").slice(0, 20);
}

export const getAttendanceQrInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr/attendance", "member");
    const today = new Date().toISOString().slice(0, 10);
    const token = await computeDayToken(orgId, today);
    return { orgId, date: today, token, path: `/attendance/${orgId}/${token}` };
  });

export const listAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      member_id: z.string().uuid().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr/attendance", "member");
    let q = context.supabase.from("attendance_marks" as never)
      .select("*").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(500);
    if (data.from) q = q.gte("occurred_at", data.from);
    if (data.to) q = q.lte("occurred_at", data.to);
    if (data.member_id) q = q.eq("member_id", data.member_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

// ==================== Hojas de vida (análisis con IA) ====================

export type ResumeReviewRow = {
  id: string;
  org_id: string;
  candidate_name: string;
  position_applied: string | null;
  file_name: string | null;
  score: number;
  recommendation: "strong" | "maybe" | "no";
  summary: string;
  strengths: string[];
  gaps: string[];
  skills: string[];
  experience_years: number;
  email: string | null;
  phone: string | null;
  created_at: string;
};

const RESUME_ERROR_MESSAGES: Record<string, string> = {
  RESUME_TOO_LARGE: "El archivo es demasiado grande (máx. 8 MB).",
  RESUME_UNSUPPORTED_FILE: "Formato no soportado. Usa PDF, JPG o PNG.",
  RESUME_PARSE_FAILED: "No se pudo interpretar la hoja de vida. Intenta con un archivo más legible.",
  RESUME_RATE_LIMITED: "Demasiadas solicitudes de IA. Espera un momento e inténtalo de nuevo.",
  RESUME_NO_CREDITS: "Sin créditos de IA disponibles.",
  RESUME_FAILED: "El análisis de la hoja de vida falló.",
};

export const listResumeReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "member");
    const { data, error } = await context.supabase
      .from("hr_resume_reviews" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ResumeReviewRow[];
  });

export const analyzeResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        file_data_url: z.string().min(32).max(12_000_000),
        mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
        file_name: z.string().trim().max(200).optional(),
        role_target: z.string().trim().max(160).optional(),
        requirements: z.string().trim().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "admin");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { analyzeResumeFile } = await import("./resume-review.server");
    const res = await analyzeResumeFile({
      file_data_url: data.file_data_url,
      mime: data.mime,
      role_target: data.role_target ?? null,
      requirements: data.requirements ?? null,
      apiKey: key,
    });
    if (!res.ok) throw new Error(RESUME_ERROR_MESSAGES[res.error] ?? RESUME_ERROR_MESSAGES.RESUME_FAILED);
    const review = res.data;
    const { data: out, error } = await context.supabase
      .from("hr_resume_reviews" as never)
      .insert({
        org_id: orgId,
        candidate_name: review.candidate_name || "Candidato sin nombre",
        position_applied: data.role_target?.trim() || review.position_applied,
        file_name: data.file_name ?? null,
        score: review.score,
        recommendation: review.recommendation,
        summary: review.summary,
        strengths: review.strengths,
        gaps: review.gaps,
        skills: review.skills,
        experience_years: review.experience_years,
        email: review.email,
        phone: review.phone,
        raw: review as never,
        created_by: context.userId,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out as unknown as ResumeReviewRow;
  });

export const deleteResumeReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/hr", "admin");
    const { error } = await context.supabase
      .from("hr_resume_reviews" as never)
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
