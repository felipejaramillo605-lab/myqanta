import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithModuleAccess } from "./permissions";
import {
  budgetVsActual,
  indirectCashFlow,
  monthlyDepreciation,
  partyAging,
  runMonthlyDepreciation,
  monthStart,
} from "./finance-assets.server";
import type { BudgetVsActualRow, IndirectCashFlow, AgingRow } from "./finance-assets.server";

export type { BudgetVsActualRow, IndirectCashFlow, AgingRow };

// -------------------- Fixed assets --------------------

export const listFixedAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("fin_fixed_assets" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("acquisition_date", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: dep } = await context.supabase
      .from("fin_depreciation_entries" as never)
      .select("asset_id, amount")
      .eq("org_id", orgId);
    const accumulated = new Map<string, number>();
    for (const d of (dep ?? []) as any[]) {
      accumulated.set(d.asset_id as string, (accumulated.get(d.asset_id as string) ?? 0) + Number(d.amount ?? 0));
    }
    return ((data ?? []) as any[]).map((a) => {
      const acc = accumulated.get(a.id as string) ?? 0;
      return {
        ...a,
        monthly_depreciation: monthlyDepreciation(a),
        accumulated_depreciation: acc,
        book_value: Number(a.cost ?? 0) - acc,
      };
    });
  });

const AssetInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().max(80).nullable().optional(),
  acquisition_date: z.string(),
  cost: z.number().nonnegative(),
  residual_value: z.number().nonnegative().default(0),
  useful_life_months: z.number().int().min(1).max(1200),
  method: z.enum(["straight_line"]).default("straight_line"),
  asset_account_id: z.string().uuid().nullable().optional(),
  depreciation_expense_account_id: z.string().uuid().nullable().optional(),
  accumulated_depreciation_account_id: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "disposed"]).default("active"),
  disposed_at: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AssetInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("fin_fixed_assets" as never).select("org_id").eq("id", data.id).single();
      if (!existing || (existing as any).org_id !== orgId) throw new Error("Activo no encontrado");
    }
    const payload: any = {
      ...data,
      org_id: orgId,
      category: data.category || null,
      disposed_at: data.disposed_at || null,
      notes: data.notes || null,
      asset_account_id: data.asset_account_id || null,
      depreciation_expense_account_id: data.depreciation_expense_account_id || null,
      accumulated_depreciation_account_id: data.accumulated_depreciation_account_id || null,
    };
    const { data: out, error } = await context.supabase
      .from("fin_fixed_assets" as never).upsert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteFixedAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase
      .from("fin_fixed_assets" as never).delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runDepreciation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ period: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "admin");
    return await runMonthlyDepreciation(context.supabase, orgId, context.userId, data.period);
  });

export const listDepreciationEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("fin_depreciation_entries" as never)
      .select("*, asset:fin_fixed_assets(name)")
      .eq("org_id", orgId)
      .order("period_month", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

// -------------------- Cost centers --------------------

export const listCostCenters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("fin_cost_centers" as never).select("*").eq("org_id", orgId).order("code");
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

export const upsertCostCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      code: z.string().trim().min(1).max(20),
      name: z.string().trim().min(1).max(120),
      active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("fin_cost_centers" as never).select("org_id").eq("id", data.id).single();
      if (!existing || (existing as any).org_id !== orgId) throw new Error("Centro de costo no encontrado");
    }
    const { data: out, error } = await context.supabase
      .from("fin_cost_centers" as never)
      .upsert({ ...data, org_id: orgId } as never)
      .select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteCostCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase
      .from("fin_cost_centers" as never).delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Budgets --------------------

export const listBudgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: rows, error } = await context.supabase
      .from("fin_budgets" as never)
      .select("*, account:fin_accounts(code, name, type), cost_center:fin_cost_centers(code, name)")
      .eq("org_id", orgId)
      .eq("year", data.year)
      .order("month");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const upsertBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12),
      account_id: z.string().uuid(),
      cost_center_id: z.string().uuid().nullable().optional(),
      amount: z.number(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const payload: any = { ...data, org_id: orgId, cost_center_id: data.cost_center_id || null };
    if (!payload.id) delete payload.id;
    const { data: out, error } = await context.supabase
      .from("fin_budgets" as never)
      .upsert(payload as never, { onConflict: "org_id,year,month,account_id" } as never)
      .select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase
      .from("fin_budgets" as never).delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBudgetVsActual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2100),
      month: z.number().int().min(1).max(12).nullable().optional(),
      cost_center_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    return await budgetVsActual(context.supabase, orgId, data.year, data.month ?? null, data.cost_center_id ?? null);
  });

// -------------------- Cash flow (indirect) --------------------

export const getIndirectCashFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    return await indirectCashFlow(context.supabase, orgId, monthStart(data.from), data.to);
  });

// -------------------- Aging --------------------

export const getPartyAging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ as_of: z.string().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const asOf = data.as_of || new Date().toISOString().slice(0, 10);
    return await partyAging(context.supabase, orgId, asOf);
  });
