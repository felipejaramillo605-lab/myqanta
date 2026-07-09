import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";

// ===== Customers =====
const CustomerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  tax_id: z.string().trim().max(64).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(32).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("sales_customers" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; name: string; tax_id: string | null; email: string | null;
      phone: string | null; address: string | null; notes: string | null; archived: boolean;
    }>;
  });

export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CustomerInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const payload: Record<string, unknown> = {
      ...data,
      email: data.email || null,
      org_id: orgId,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("sales_customers" as never)
      .upsert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("sales_customers" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Invoices =====
const ItemInput = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
  tax_rate: z.number().min(0).max(100).default(0),
});

const InvoiceInput = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name_snapshot: z.string().trim().max(160).nullable().optional(),
  issue_date: z.string(),
  due_date: z.string().nullable().optional(),
  currency: z.string().max(8).default("EUR"),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(ItemInput).min(1),
});

function computeTotals(items: z.infer<typeof ItemInput>[]) {
  let subtotal = 0;
  let tax = 0;
  const rows = items.map((it) => {
    const line = Number(it.quantity) * Number(it.unit_price);
    const lineTax = line * (Number(it.tax_rate) / 100);
    subtotal += line;
    tax += lineTax;
    return { ...it, subtotal: line };
  });
  const total = subtotal + tax;
  return { rows, subtotal, tax, total };
}

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("sales_invoices" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("issue_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveActiveOrgId(context.supabase, context.userId);
    const { data: inv, error } = await context.supabase
      .from("sales_invoices" as never).select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: items } = await context.supabase
      .from("sales_invoice_items" as never).select("*").eq("invoice_id", data.id).order("position");
    const { data: payments } = await context.supabase
      .from("sales_payments" as never).select("*").eq("invoice_id", data.id).order("paid_on");
    return { invoice: inv, items: items ?? [], payments: payments ?? [] };
  });

export const saveInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InvoiceInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const totals = computeTotals(data.items);
    const base = {
      org_id: orgId,
      created_by: context.userId,
      customer_id: data.customer_id ?? null,
      customer_name_snapshot: data.customer_name_snapshot ?? null,
      issue_date: data.issue_date,
      due_date: data.due_date ?? null,
      currency: data.currency,
      notes: data.notes ?? null,
      subtotal: totals.subtotal,
      tax_amount: totals.tax,
      total: totals.total,
    };
    let invoiceId = data.id ?? null;
    if (invoiceId) {
      const { error } = await context.supabase
        .from("sales_invoices" as never)
        .update(base as never).eq("id", invoiceId);
      if (error) throw new Error(error.message);
      await context.supabase.from("sales_invoice_items" as never).delete().eq("invoice_id", invoiceId);
    } else {
      const { data: out, error } = await context.supabase
        .from("sales_invoices" as never)
        .insert({ ...base, status: "draft" } as never).select("id").single();
      if (error) throw new Error(error.message);
      invoiceId = (out as { id: string }).id;
    }
    const rows = totals.rows.map((r, i) => ({
      invoice_id: invoiceId,
      org_id: orgId,
      product_id: r.product_id ?? null,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      tax_rate: r.tax_rate,
      subtotal: r.subtotal,
      position: i,
    }));
    const { error: e2 } = await context.supabase.from("sales_invoice_items" as never).insert(rows as never);
    if (e2) throw new Error(e2.message);
    return { id: invoiceId };
  });

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: inv, error } = await context.supabase
      .from("sales_invoices" as never).select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const invoice = inv as { status: string; number: number | null };
    if (invoice.status !== "draft") throw new Error("Solo facturas en borrador se pueden emitir");
    const { data: numRes, error: numErr } = await (context.supabase.rpc as never)(
      "next_invoice_number", { _org_id: orgId },
    );
    if (numErr) throw new Error((numErr as { message: string }).message);
    const number = numRes as unknown as number;

    // Decrement stock for line items with a product
    const { data: items } = await context.supabase
      .from("sales_invoice_items" as never).select("product_id, quantity, unit_price")
      .eq("invoice_id", data.id);
    for (const it of (items ?? []) as Array<{ product_id: string | null; quantity: number; unit_price: number }>) {
      if (!it.product_id) continue;
      const { data: p } = await context.supabase
        .from("inv_products").select("stock").eq("id", it.product_id).single();
      const currentStock = Number(p?.stock ?? 0);
      await context.supabase.from("inv_products")
        .update({ stock: currentStock - Number(it.quantity) }).eq("id", it.product_id);
      await context.supabase.from("inv_movements").insert({
        org_id: orgId,
        user_id: context.userId,
        product_id: it.product_id,
        kind: "sale",
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        notes: `Factura #${number}`,
      } as never);
    }

    const { error: uerr } = await context.supabase.from("sales_invoices" as never)
      .update({ status: "issued", number, issued_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (uerr) throw new Error(uerr.message);
    return { number };
  });

export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("sales_invoices" as never)
      .update({ status: "void" } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: inv } = await context.supabase
      .from("sales_invoices" as never).select("status").eq("id", data.id).single();
    if ((inv as { status: string } | null)?.status !== "draft") {
      throw new Error("Solo se pueden eliminar borradores");
    }
    const { error } = await context.supabase.from("sales_invoices" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Payments =====
const PaymentInput = z.object({
  invoice_id: z.string().uuid(),
  paid_on: z.string(),
  amount: z.number().positive(),
  method: z.enum(["cash", "card", "transfer", "other"]).default("cash"),
  account_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const addPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PaymentInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: inv, error } = await context.supabase
      .from("sales_invoices" as never).select("*").eq("id", data.invoice_id).single();
    if (error) throw new Error(error.message);
    const invoice = inv as { status: string; total: number; paid_amount: number; currency: string; number: number | null };
    if (invoice.status === "draft") throw new Error("Emite la factura antes de registrar pagos");
    if (invoice.status === "void") throw new Error("Factura anulada");

    // Optional finance transaction
    let txId: string | null = null;
    if (data.account_id) {
      const { data: tx, error: terr } = await context.supabase.from("finance_transactions").insert({
        org_id: orgId,
        user_id: context.userId,
        account_id: data.account_id,
        occurred_on: data.paid_on,
        description: `Cobro factura #${invoice.number ?? ""}`.trim(),
        amount: data.amount,
        currency: invoice.currency,
        bucket: "revenue" as never,
        source: "sales",
      } as never).select("id").single();
      if (terr) throw new Error(terr.message);
      txId = (tx as { id: string }).id;
    }

    const { error: perr } = await context.supabase.from("sales_payments" as never).insert({
      invoice_id: data.invoice_id,
      org_id: orgId,
      created_by: context.userId,
      paid_on: data.paid_on,
      amount: data.amount,
      method: data.method,
      account_id: data.account_id ?? null,
      finance_transaction_id: txId,
      notes: data.notes ?? null,
    } as never);
    if (perr) throw new Error(perr.message);

    const newPaid = Number(invoice.paid_amount) + Number(data.amount);
    const newStatus = newPaid + 0.005 >= Number(invoice.total) ? "paid" : "issued";
    await context.supabase.from("sales_invoices" as never)
      .update({ paid_amount: newPaid, status: newStatus } as never)
      .eq("id", data.invoice_id);
    return { ok: true, paid: newPaid, status: newStatus };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: pay } = await context.supabase
      .from("sales_payments" as never).select("invoice_id, amount, finance_transaction_id")
      .eq("id", data.id).single();
    const p = pay as { invoice_id: string; amount: number; finance_transaction_id: string | null } | null;
    if (!p) throw new Error("Pago no encontrado");
    if (p.finance_transaction_id) {
      await context.supabase.from("finance_transactions").delete().eq("id", p.finance_transaction_id);
    }
    await context.supabase.from("sales_payments" as never).delete().eq("id", data.id);
    const { data: inv } = await context.supabase
      .from("sales_invoices" as never).select("paid_amount, total, status").eq("id", p.invoice_id).single();
    const invoice = inv as { paid_amount: number; total: number; status: string };
    const newPaid = Math.max(0, Number(invoice.paid_amount) - Number(p.amount));
    const newStatus = invoice.status === "void" ? "void"
      : (newPaid + 0.005 >= Number(invoice.total) ? "paid" : "issued");
    await context.supabase.from("sales_invoices" as never)
      .update({ paid_amount: newPaid, status: newStatus } as never).eq("id", p.invoice_id);
    return { ok: true };
  });