import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { assertModuleAccess, resolveOrgWithModuleAccess } from "./permissions";
import { computeFinancialIndicators, type FinancialIndicators } from "./financial-indicators";
import { aggregatePnl, fetchPostedLines, pnlTotals } from "./accounting-core";



export type ReportRange = { from: string; to: string };

const rangeSchema = z.object({
  from: z.string().min(10),
  to: z.string().min(10),
});

export type ConsolidatedReport = {
  range: ReportRange;
  finance: {
    revenue: number;
    cogs: number;
    opex: number;
    ebitda: number;
    net: number;
    by_bucket: Record<string, number>;
  };
  sales: {
    invoiced_total: number;
    paid_total: number;
    outstanding: number;
    invoice_count: number;
    by_status: Record<string, number>;
    top_customers: { name: string; total: number }[];
  };
  inventory: {
    products: number;
    low_stock: number;
    stock_value: number;
  };
  projects: {
    active: number;
    hours: number;
    billable_hours: number;
  };
  hr: {
    headcount: number;
    payroll_cost: number;
    open_leaves: number;
  };
  crm: {
    deals_open: number;
    deals_won: number;
    pipeline_value: number;
    won_value: number;
  };
};

export const getConsolidatedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ context, data }): Promise<ConsolidatedReport> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    await assertModuleAccess(context.supabase, context.userId, orgId, "/reports");
    const s = context.supabase;
    const { from, to } = data;

    const [finLines, invRes, prodRes, projRes, entriesRes, teamRes, payrollRes, leavesRes, dealsRes] = await Promise.all([
      fetchPostedLines(s, orgId, { from, to }),
      s.from("sales_invoices").select("id,customer_id,total,status,paid_amount").eq("org_id", orgId).gte("issue_date", from).lte("issue_date", to),
      s.from("inv_products").select("id,stock,cost,min_stock").eq("org_id", orgId),
      s.from("projects").select("id,status").eq("org_id", orgId),
      s.from("time_entries").select("hours,billable").eq("org_id", orgId).gte("entry_date", from).lte("entry_date", to),
      s.from("team_members").select("id").eq("org_id", orgId),
      s.from("hr_payroll_runs").select("total_net,period_year,period_month,status").eq("org_id", orgId),
      s.from("hr_leaves").select("id,status").eq("org_id", orgId).eq("status", "pending"),
      s.from("crm_deals").select("id,stage,amount").eq("org_id", orgId),
    ]);

    // Finance figures come from POSTED journal lines (single source of truth).
    const buckets = aggregatePnl(finLines);
    const totals = pnlTotals(buckets);
    const byBucket = buckets as unknown as Record<string, number>;
    const revenue = totals.revenue;
    const cogs = totals.cogs;
    const opex = totals.opex;
    const ebitda = totals.ebitda;


    const inv = invRes.data ?? [];
    const byStatus: Record<string, number> = {};
    let invoicedTotal = 0, paidTotal = 0;
    const custTotals = new Map<string, number>();
    for (const r of inv) {
      const total = Number(r.total ?? 0);
      invoicedTotal += total;
      paidTotal += Number(r.paid_amount ?? 0);
      const st = String(r.status ?? "draft");
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (r.customer_id) custTotals.set(r.customer_id, (custTotals.get(r.customer_id) ?? 0) + total);
    }
    const topIds = [...custTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    let topCustomers: { name: string; total: number }[] = [];
    if (topIds.length > 0) {
      const { data: custs } = await s.from("sales_customers").select("id,name").in("id", topIds.map((c) => c[0]));
      const map = new Map((custs ?? []).map((c) => [c.id, c.name]));
      topCustomers = topIds.map(([id, total]) => ({ name: map.get(id) ?? "—", total }));
    }

    const prods = prodRes.data ?? [];
    const stockValue = prods.reduce((a, p) => a + Number(p.stock ?? 0) * Number(p.cost ?? 0), 0);
    const lowStock = prods.filter((p) => p.min_stock != null && Number(p.stock ?? 0) <= Number(p.min_stock)).length;

    const projs = projRes.data ?? [];
    const activeProjects = projs.filter((p) => p.status === "active").length;
    const entries = entriesRes.data ?? [];
    const hours = entries.reduce((a, e) => a + Number(e.hours ?? 0), 0);
    const billableHours = entries.filter((e) => e.billable).reduce((a, e) => a + Number(e.hours ?? 0), 0);

    const team = teamRes.data ?? [];
    const payroll = (payrollRes.data ?? []).filter((p) => {
      // Keep runs whose (year, month) intersects range
      const y = p.period_year, m = p.period_month;
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return end >= new Date(from) && start <= new Date(to);
    });
    const payrollCost = payroll.reduce((a, p) => a + Number(p.total_net ?? 0), 0);
    const leaves = leavesRes.data ?? [];

    const deals = dealsRes.data ?? [];
    let dealsOpen = 0, dealsWon = 0, pipelineValue = 0, wonValue = 0;
    for (const d of deals) {
      const amt = Number(d.amount ?? 0);
      const st = String(d.stage ?? "");
      if (st === "won") { dealsWon++; wonValue += amt; }
      else if (st !== "lost") { dealsOpen++; pipelineValue += amt; }
    }

    return {
      range: { from, to },
      finance: { revenue, cogs, opex, ebitda, net: totals.net, by_bucket: byBucket },
      sales: {
        invoiced_total: invoicedTotal,
        paid_total: paidTotal,
        outstanding: invoicedTotal - paidTotal,
        invoice_count: inv.length,
        by_status: byStatus,
        top_customers: topCustomers,
      },
      inventory: { products: prods.length, low_stock: lowStock, stock_value: stockValue },
      projects: { active: activeProjects, hours, billable_hours: billableHours },
      hr: { headcount: team.length, payroll_cost: payrollCost, open_leaves: leaves.length },
      crm: { deals_open: dealsOpen, deals_won: dealsWon, pipeline_value: pipelineValue, won_value: wonValue },
    };
  });

// -------------------- Financial indicators --------------------

export type { IndicatorValue, FinancialIndicators } from "./financial-indicators";

export const getFinancialIndicators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FinancialIndicators> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/reports", "member");
    return computeFinancialIndicators(context.supabase, orgId);
  });
