import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";

export type ActionCenter = {
  receivables: { pending: number; overdue: number; overdue_count: number };
  deals: { closing_this_month: number; amount: number; stale: number };
  inventory: { low_stock: number; stock_value: number };
  approvals: { pending: number };
  tasks: { overdue: number };
};

/**
 * Cross-module snapshot for the dashboard action center. Read-only and
 * tolerant: a module the user cannot read simply reports zeros (RLS filters).
 */
export const getActionCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ActionCenter> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const staleCut = new Date(now.getTime() - 14 * 86_400_000).toISOString();

    const [invRes, dealRes, prodRes, apRes, taskRes] = await Promise.all([
      context.supabase
        .from("sales_invoices")
        .select("total,paid_amount,due_date,status")
        .eq("org_id", orgId)
        .not("status", "in", "(draft,void,paid)")
        .limit(500),
      context.supabase
        .from("crm_deals")
        .select("amount,stage,expected_close_date,updated_at")
        .eq("org_id", orgId)
        .not("stage", "in", "(won,lost)")
        .limit(300),
      context.supabase.from("inv_products").select("stock,min_stock,cost").eq("org_id", orgId).limit(500),
      context.supabase
        .from("approvals")
        .select("id")
        .eq("org_id", orgId)
        .in("status", ["pending", "in_review"])
        .limit(200),
      context.supabase
        .from("tasks")
        .select("id")
        .eq("org_id", orgId)
        .in("status", ["todo", "doing"])
        .lt("due_date", now.toISOString())
        .limit(200),
    ]);

    let pending = 0;
    let overdue = 0;
    let overdueCount = 0;
    for (const i of invRes.data ?? []) {
      const bal = Number(i.total) - Number(i.paid_amount ?? 0);
      if (bal <= 0) continue;
      pending += bal;
      if (i.due_date && i.due_date < today) {
        overdue += bal;
        overdueCount += 1;
      }
    }

    let closing = 0;
    let closingAmount = 0;
    let stale = 0;
    for (const d of dealRes.data ?? []) {
      if (d.expected_close_date && d.expected_close_date <= monthEnd) {
        closing += 1;
        closingAmount += Number(d.amount ?? 0);
      }
      if (d.updated_at && d.updated_at < staleCut) stale += 1;
    }

    let low = 0;
    let value = 0;
    for (const p of prodRes.data ?? []) {
      if (Number(p.stock) <= Number(p.min_stock)) low += 1;
      value += Number(p.stock ?? 0) * Number(p.cost ?? 0);
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      receivables: { pending: round(pending), overdue: round(overdue), overdue_count: overdueCount },
      deals: { closing_this_month: closing, amount: round(closingAmount), stale },
      inventory: { low_stock: low, stock_value: round(value) },
      approvals: { pending: (apRes.data ?? []).length },
      tasks: { overdue: (taskRes.data ?? []).length },
    };
  });
