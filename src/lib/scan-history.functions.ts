import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveOrgWithRole, resolveOrgWithModuleAccess } from "./permissions";

/**
 * scan_batches.affected stores an ordered list of objects describing rows
 * created by an applied scan. Shape per entry:
 *   { table: "inv_invoices" | "inv_products" | "inv_movements" | "finance_transactions" | "finance_statements",
 *     id: string,
 *     product_id?: string,       // for inv_movements
 *     stock_delta?: number,      // for inv_movements (signed: +purchase, -sale)
 *     created?: boolean }        // true when we created the product as part of this batch
 */

export type AffectedRow = {
  table: "inv_invoices" | "inv_products" | "inv_movements" | "finance_transactions" | "finance_statements";
  id: string;
  product_id?: string;
  stock_delta?: number;
  created?: boolean;
};

export const listScanBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // A batch can be an invoice (inventory) or statement (finance); allow any
    // org member to see the list — the UI already gates by kind, and rows
    // are filtered client-side inside the appropriate module page.
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data, error } = await context.supabase
      .from("scan_batches")
      .select("id,kind,source_name,summary,item_count,total,currency,created_at,undone_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const undoScanBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // Resolve org first with basic membership, then gate by the batch's kind.
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: batch, error } = await context.supabase
      .from("scan_batches")
      .select("id,org_id,kind,affected,undone_at")
      .eq("id", data.id)
      .eq("org_id", orgId)
      .single();
    if (error || !batch) throw new Error(error?.message ?? "Batch not found");
    if (batch.undone_at) return { ok: true, already: true };

    const moduleKey = batch.kind === "invoice" ? "/inventory" : "/finance";
    await resolveOrgWithModuleAccess(context.supabase, context.userId, moduleKey, "member");

    const affected = (batch.affected as AffectedRow[]) ?? [];

    // 1) Reverse stock for movements + delete movements
    const movements = affected.filter((a) => a.table === "inv_movements");
    for (const m of movements) {
      if (m.product_id && typeof m.stock_delta === "number") {
        const { data: cur } = await context.supabase
          .from("inv_products").select("stock").eq("id", m.product_id).eq("org_id", orgId).maybeSingle();
        if (cur) {
          await context.supabase
            .from("inv_products")
            .update({ stock: Number(cur.stock) - m.stock_delta })
            .eq("id", m.product_id);
        }
      }
      await context.supabase.from("inv_movements").delete().eq("id", m.id).eq("org_id", orgId);
    }

    // 2) Delete products that were auto-created by this batch (only when stock is now <= 0)
    const createdProducts = affected.filter((a) => a.table === "inv_products" && a.created);
    for (const p of createdProducts) {
      const { data: cur } = await context.supabase
        .from("inv_products").select("stock").eq("id", p.id).eq("org_id", orgId).maybeSingle();
      if (cur && Number(cur.stock) <= 0) {
        await context.supabase.from("inv_products").delete().eq("id", p.id).eq("org_id", orgId);
      }
    }

    // 3) Delete finance transactions
    const txs = affected.filter((a) => a.table === "finance_transactions");
    if (txs.length) {
      await context.supabase
        .from("finance_transactions")
        .delete()
        .eq("org_id", orgId)
        .in("id", txs.map((t) => t.id));
    }

    // 4) Delete statement + invoice headers
    const stmts = affected.filter((a) => a.table === "finance_statements");
    for (const s of stmts) {
      await context.supabase.from("finance_statements").delete().eq("id", s.id).eq("org_id", orgId);
    }
    const invs = affected.filter((a) => a.table === "inv_invoices");
    for (const inv of invs) {
      await context.supabase.from("inv_invoices").delete().eq("id", inv.id).eq("org_id", orgId);
    }

    await context.supabase
      .from("scan_batches")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", batch.id);

    return { ok: true, undone: affected.length };
  });