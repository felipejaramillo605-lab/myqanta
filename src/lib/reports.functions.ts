import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";

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

function sum(rows: Array<Record<string, unknown>>, field: string): number {
  return rows.reduce((acc, r) => acc + Number((r as Record<string, unknown>)[field] ?? 0), 0);
}

export const getConsolidatedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ context, data }): Promise<ConsolidatedReport> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const s = context.supabase;
    const { from, to } = data;

    // Finance
    const { data: fin = [] } = await s
      .from("finance_transactions")
      .select("amount,bucket,kind,occurred_on")
      .eq("org_id", orgId)
      .gte("occurred_on", from)
      .lte("occurred_on", to);
    const byBucket: Record<string, number> = {};
    let revenue = 0, cogs = 0, opex = 0;
    for (const r of fin ?? []) {
      const amt = Number(r.amount ?? 0);
      const bucket = String(r.bucket ?? "other");
      byBucket[bucket] = (byBucket[bucket] ?? 0) + amt;
      const k = String(r.kind ?? "");
      if (k === "revenue") revenue += amt;
      else if (k === "cogs") cogs += amt;
      else if (k === "opex") opex += amt;
    }
    const ebitda = revenue - cogs - opex;

    // Sales
    const { data: inv = [] } = await s
      .from("sales_invoices")
      .select("id,customer_id,total,status,paid_amount,issued_on")
      .eq("org_id", orgId)
      .gte("issued_on", from)
      .lte("issued_on", to);
    const byStatus: Record<string, number> = {};
    let invoicedTotal = 0, paidTotal = 0;
    const custTotals = new Map<string, number>();
    for (const r of inv ?? []) {
      const total = Number(r.total ?? 0);
      invoicedTotal += total;
      paidTotal += Number(r.paid_amount ?? 0);
      const st = String(r.status ?? "draft");
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (r.customer_id) custTotals.set(r.customer_id, (custTotals.get(r.customer_id) ?? 0) + total);
    }
    const topCustomerIds = [...custTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    let topCustomers: { name: string; total: number }[] = [];
    if (topCustomerIds.length > 0) {
      const { data: custs = [] } = await s
        .from("sales_customers")
        .select("id,name")
        .in("id", topCustomerIds.map((c) => c[0]));
      const nameMap = new Map((custs ?? []).map((c) => [c.id, c.name]));
      topCustomers = topCustomerIds.map(([id, total]) => ({ name: nameMap.get(id) ?? "—", total }));
    }

    // Inventory
    const { data: prods = [] } = await s
      .from("inv_products")
      .select("id,stock_qty,cost_price,min_stock")
      .eq("org_id", orgId);
    const stockValue = (prods ?? []).reduce(
      (acc, p) => acc + Number(p.stock_qty ?? 0) * Number(p.cost_price ?? 0),
      0,
    );
    const lowStock = (prods ?? []).filter(
      (p) => p.min_stock != null && Number(p.stock_qty ?? 0) <= Number(p.min_stock),
    ).length;

    // Projects + time
    const { data: projs = [] } = await s
      .from("projects")
      .select("id,status")
      .eq("org_id", orgId);
    const activeProjects = (projs ?? []).filter((p) => p.status === "active" || p.status === "in_progress").length;
    const { data: entries = [] } = await s
      .from("time_entries")
      .select("hours,billable,occurred_on")
      .eq("org_id", orgId)
      .gte("occurred_on", from)
      .lte("occurred_on", to);
    const hours = sum(entries ?? [], "hours");
    const billableHours = (entries ?? []).filter((e) => e.billable).reduce((a, e) => a + Number(e.hours ?? 0), 0);

    // HR
    const { data: team = [] } = await s
      .from("team_members")
      .select("id")
      .eq("org_id", orgId);
    const { data: payroll = [] } = await s
      .from("hr_payroll_runs")
      .select("total_net,period_start,period_end,status")
      .eq("org_id", orgId)
      .gte("period_start", from)
      .lte("period_end", to);
    const payrollCost = sum(payroll ?? [], "total_net");
    const { data: leaves = [] } = await s
      .from("hr_leaves")
      .select("id,status")
      .eq("org_id", orgId)
      .eq("status", "pending");

    // CRM
    const { data: deals = [] } = await s
      .from("crm_deals")
      .select("id,status,amount,stage")
      .eq("org_id", orgId);
    let dealsOpen = 0, dealsWon = 0, pipelineValue = 0, wonValue = 0;
    for (const d of deals ?? []) {
      const amt = Number(d.amount ?? 0);
      const st = String(d.status ?? "");
      if (st === "won") { dealsWon++; wonValue += amt; }
      else if (st !== "lost") { dealsOpen++; pipelineValue += amt; }
    }

    return {
      range: { from, to },
      finance: { revenue, cogs, opex, ebitda, net: ebitda, by_bucket: byBucket },
      sales: {
        invoiced_total: invoicedTotal,
        paid_total: paidTotal,
        outstanding: invoicedTotal - paidTotal,
        invoice_count: (inv ?? []).length,
        by_status: byStatus,
        top_customers: topCustomers,
      },
      inventory: { products: (prods ?? []).length, low_stock: lowStock, stock_value: stockValue },
      projects: { active: activeProjects, hours, billable_hours: billableHours },
      hr: { headcount: (team ?? []).length, payroll_cost: payrollCost, open_leaves: (leaves ?? []).length },
      crm: { deals_open: dealsOpen, deals_won: dealsWon, pipeline_value: pipelineValue, won_value: wonValue },
    };
  });