import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";
import type { ParsedInvoice, ScanErrorCode } from "./invoice-ocr.server";
import { EXPENSE_CATEGORIES, parseNumberWithSeparator, suggestCategory, type DecimalSeparator } from "./categories";

// ===== Products =====
export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const { data, error } = await context.supabase
      .from("inv_products")
      .select("*")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listLowStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const { data, error } = await context.supabase
      .from("inv_products")
      .select("id,name,sku,unit,stock,min_stock,category,cost")
      .eq("org_id", orgId)
      .gt("min_stock", 0)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).filter((p) => Number(p.stock) <= Number(p.min_stock));
  });

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  unit: z.string().default("unit"),
  cost: z.number().default(0),
  price: z.number().default(0),
  stock: z.number().default(0),
  min_stock: z.number().default(0),
  category: z.string().optional().nullable(),
});

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProductInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const row = { ...data, user_id: context.userId, org_id: orgId };
    const { data: out, error } = await context.supabase
      .from("inv_products")
      .upsert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const { error } = await context.supabase.from("inv_products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Movements =====
const MovementInput = z.object({
  product_id: z.string().uuid(),
  kind: z.enum(["purchase", "sale", "adjustment", "transfer"]),
  quantity: z.number(),
  unit_price: z.number().default(0),
  notes: z.string().optional().nullable(),
  occurred_at: z.string().optional(),
  expense_category: z.string().optional().nullable(),
});

function stockDelta(kind: string, qty: number) {
  if (kind === "purchase") return qty;
  if (kind === "sale") return -qty;
  if (kind === "adjustment") return qty;
  return 0; // transfer net zero in single-location model
}

export const createMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MovementInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const total = data.quantity * data.unit_price;
    const { data: mov, error } = await context.supabase
      .from("inv_movements")
      .insert({
        user_id: context.userId,
        org_id: orgId,
        product_id: data.product_id,
        kind: data.kind,
        quantity: data.quantity,
        unit_price: data.unit_price,
        total,
        occurred_at: data.occurred_at ?? new Date().toISOString(),
        notes: data.notes ?? null,
        expense_category: data.expense_category ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Update stock
    const { data: prod } = await context.supabase
      .from("inv_products").select("stock").eq("id", data.product_id).single();
    const newStock = Number(prod?.stock ?? 0) + stockDelta(data.kind, data.quantity);
    await context.supabase.from("inv_products").update({ stock: newStock }).eq("id", data.product_id);

    return mov;
  });

export const deleteMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const { data: mov, error: ferr } = await context.supabase
      .from("inv_movements")
      .select("product_id, kind, quantity")
      .eq("id", data.id)
      .single();
    if (ferr) throw new Error(ferr.message);
    const { error } = await context.supabase.from("inv_movements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (mov) {
      const { data: prod } = await context.supabase
        .from("inv_products").select("stock").eq("id", mov.product_id).single();
      const reversed = Number(prod?.stock ?? 0) - stockDelta(mov.kind, Number(mov.quantity));
      await context.supabase.from("inv_products").update({ stock: reversed }).eq("id", mov.product_id);
    }
    return { ok: true };
  });

// ===== Purchase order (batch reorder from low-stock alerts) =====
const PurchaseOrderInput = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().positive(),
        unit_price: z.number().min(0).default(0),
      }),
    )
    .min(1),
  notes: z.string().optional().nullable(),
});

export const createPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PurchaseOrderInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const now = new Date().toISOString();
    let created = 0;
    for (const item of data.items) {
      const total = item.quantity * item.unit_price;
      const { error } = await context.supabase.from("inv_movements").insert({
        user_id: context.userId,
        org_id: orgId,
        product_id: item.product_id,
        kind: "purchase",
        quantity: item.quantity,
        unit_price: item.unit_price,
        total,
        occurred_at: now,
        notes: data.notes ?? "Reorder from low-stock alert",
      });
      if (error) throw new Error(error.message);

      const { data: cur } = await context.supabase
        .from("inv_products").select("stock").eq("id", item.product_id).single();
      await context.supabase
        .from("inv_products")
        .update({ stock: Number(cur?.stock ?? 0) + item.quantity })
        .eq("id", item.product_id);
      created++;
    }
    return { created };
  });

export const listMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const { data, error } = await context.supabase
      .from("inv_movements")
      .select("*, inv_products(name,sku,unit)")
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Stock history reconstructed from current stock and movements (backwards walk)
export const getStockHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ product_id: z.string().uuid(), days: z.number().int().min(7).max(365).default(90) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - (data.days - 1));
    const fromStr = from.toISOString().slice(0, 10);

    const [{ data: prod }, { data: movs }] = await Promise.all([
      context.supabase.from("inv_products").select("id,name,unit,stock,min_stock").eq("id", data.product_id).eq("org_id", orgId).single(),
      context.supabase
        .from("inv_movements")
        .select("kind,quantity,occurred_at")
        .eq("org_id", orgId)
        .eq("product_id", data.product_id)
        .order("occurred_at", { ascending: true }),
    ]);
    if (!prod) throw new Error("Product not found");

    // Build cumulative stock per day forward from oldest known point
    const todayStock = Number(prod.stock);
    const allDeltas: { date: string; delta: number }[] = (movs ?? []).map((m) => {
      let d = Number(m.quantity);
      if (m.kind === "sale") d = -d;
      if (m.kind === "transfer") d = 0;
      return { date: m.occurred_at.slice(0, 10), delta: d };
    });
    const totalApplied = allDeltas.reduce((s, x) => s + x.delta, 0);
    let running = todayStock - totalApplied; // starting stock before any recorded movement

    const dailyDelta = new Map<string, number>();
    for (const x of allDeltas) dailyDelta.set(x.date, (dailyDelta.get(x.date) ?? 0) + x.delta);

    // Walk from earliest movement (or `from`) to today
    const earliest = allDeltas[0]?.date && allDeltas[0].date < fromStr ? allDeltas[0].date : fromStr;
    const out: { date: string; stock: number }[] = [];
    const cursor = new Date(earliest + "T00:00:00Z");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      running += dailyDelta.get(key) ?? 0;
      if (key >= fromStr) out.push({ date: key, stock: running });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { product: prod, series: out };
  });

// ===== AI invoice scan =====
// OCR extraction + normalization live in ./invoice-ocr.server so the assistant
// accounting tool reuses the exact same Gemini prompt.

function scanError(error: ScanErrorCode) {
  return { ok: false as const, error };
}

const ScanInput = z.object({
  image_data_url: z.string().startsWith("data:"),
  mime: z.string(),
  commit: z.boolean().default(false),
  decimal_separator: z.enum(["auto", "comma", "dot"]).default("auto"),
});

export const scanInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const orgId = data.commit
      ? await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member")
      : await resolveActiveOrgId(context.supabase, context.userId);

    const extraction = await (await import("./invoice-ocr.server")).extractInvoiceData({
      image_data_url: data.image_data_url,
      mime: data.mime,
      decimal_separator: data.decimal_separator,
      apiKey: key,
    });
    if (!extraction.ok) return scanError(extraction.error);
    const parsed: ParsedInvoice = extraction.data;

    const { data: inv, error } = await context.supabase
      .from("inv_invoices")
      .insert({
        user_id: context.userId,
        org_id: orgId,
        invoice_number: parsed.invoice_number ?? null,
        invoice_date: parsed.invoice_date ?? null,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total,
        currency: parsed.currency || "EUR",
        raw_ai_json: JSON.parse(JSON.stringify(parsed)),
        status: data.commit ? "applied" : "preview",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    let created = 0;
    if (data.commit && parsed.items.length) {
      // Get all current products once
      const { data: prods } = await context.supabase
        .from("inv_products").select("id,name,sku,stock").eq("org_id", orgId);
      const byKey = new Map<string, { id: string; stock: number }>();
      for (const p of prods ?? []) {
        byKey.set(p.name.toLowerCase(), { id: p.id, stock: Number(p.stock) });
        if (p.sku) byKey.set(p.sku.toLowerCase(), { id: p.id, stock: Number(p.stock) });
      }

      for (const item of parsed.items) {
        let prodId: string | null = null;
        const lookup = byKey.get((item.sku ?? "").toLowerCase()) || byKey.get(item.description.toLowerCase());
        if (lookup) prodId = lookup.id;
        else {
          const { data: np } = await context.supabase
            .from("inv_products")
            .insert({
              user_id: context.userId,
              org_id: orgId,
              name: item.description,
              sku: item.sku ?? null,
              cost: item.unit_price,
              price: item.unit_price,
              stock: 0,
            })
            .select("id,stock")
            .single();
          if (np) prodId = np.id;
        }
        if (!prodId) continue;

        const qty = item.quantity || 1;
        await context.supabase.from("inv_movements").insert({
          user_id: context.userId,
          org_id: orgId,
          product_id: prodId,
          kind: "purchase",
          quantity: qty,
          unit_price: item.unit_price,
          total: item.total || qty * item.unit_price,
          source_invoice_id: inv.id,
          notes: `Invoice ${parsed.invoice_number ?? ""}`.trim(),
        });
        // Update stock
        const { data: cur } = await context.supabase
          .from("inv_products").select("stock").eq("id", prodId).eq("org_id", orgId).single();
        await context.supabase
          .from("inv_products")
          .update({ stock: Number(cur?.stock ?? 0) + qty })
          .eq("id", prodId);
        created++;
      }
    }

    return { ok: true as const, invoice: inv, parsed, created };
  });

// ===== Apply hand-edited invoice items (after preview) =====
const ApplyInvoiceInput = z.object({
  supplier_name: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  invoice_date: z.string().optional().nullable(),
  currency: z.string().default("EUR"),
  subtotal: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        sku: z.string().optional().nullable(),
        quantity: z.number().positive().default(1),
        unit_price: z.number().min(0).default(0),
        total: z.number().min(0).default(0),
        expense_category: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export const applyInvoiceItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplyInvoiceInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");

    const { data: inv, error } = await context.supabase
      .from("inv_invoices")
      .insert({
        user_id: context.userId,
        org_id: orgId,
        invoice_number: data.invoice_number ?? null,
        invoice_date: data.invoice_date ?? null,
        subtotal: data.subtotal,
        tax: data.tax,
        total: data.total,
        currency: data.currency || "EUR",
        raw_ai_json: JSON.parse(JSON.stringify({ edited: true, ...data })),
        status: "applied",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { data: prods } = await context.supabase
      .from("inv_products").select("id,name,sku,stock").eq("org_id", orgId);
    const byKey = new Map<string, { id: string; stock: number }>();
    for (const p of prods ?? []) {
      byKey.set(p.name.toLowerCase(), { id: p.id, stock: Number(p.stock) });
      if (p.sku) byKey.set(p.sku.toLowerCase(), { id: p.id, stock: Number(p.stock) });
    }

    const affected: Array<{ table: string; id: string; product_id?: string; stock_delta?: number; created?: boolean }> = [
      { table: "inv_invoices", id: inv.id },
    ];
    let created = 0;
    for (const item of data.items) {
      let prodId: string | null = null;
      let productWasCreated = false;
      const lookup = byKey.get((item.sku ?? "").toLowerCase()) || byKey.get(item.description.toLowerCase());
      if (lookup) prodId = lookup.id;
      else {
        const { data: np } = await context.supabase
          .from("inv_products")
          .insert({
            user_id: context.userId,
            org_id: orgId,
            name: item.description,
            sku: item.sku ?? null,
            cost: item.unit_price,
            price: item.unit_price,
            stock: 0,
            category: item.expense_category ?? null,
          })
          .select("id,stock")
          .single();
        if (np) {
          prodId = np.id;
          productWasCreated = true;
          affected.push({ table: "inv_products", id: np.id, created: true });
        }
      }
      if (!prodId) continue;

      const qty = item.quantity || 1;
      const total = item.total || qty * item.unit_price;
      const category = item.expense_category ?? suggestCategory(item.description);
      const { data: mov } = await context.supabase.from("inv_movements").insert({
        user_id: context.userId,
        org_id: orgId,
        product_id: prodId,
        kind: "purchase",
        quantity: qty,
        unit_price: item.unit_price,
        total,
        source_invoice_id: inv.id,
        notes: `Invoice ${data.invoice_number ?? ""}`.trim(),
        expense_category: category,
      }).select("id").single();
      if (mov) affected.push({ table: "inv_movements", id: mov.id, product_id: prodId, stock_delta: qty });
      const { data: cur } = await context.supabase
        .from("inv_products").select("stock").eq("id", prodId).eq("org_id", orgId).single();
      await context.supabase
        .from("inv_products")
        .update({ stock: Number(cur?.stock ?? 0) + qty })
        .eq("id", prodId);
      created++;
      void productWasCreated;
    }

    await context.supabase.from("scan_batches").insert({
      org_id: orgId,
      user_id: context.userId,
      kind: "invoice",
      source_name: data.supplier_name ?? data.invoice_number ?? "Invoice",
      summary: `${created} ${created === 1 ? "line" : "lines"} · ${(data.total || 0).toFixed(2)} ${data.currency || "EUR"}`,
      item_count: created,
      total: data.total,
      currency: data.currency || "EUR",
      affected,
    });
    return { ok: true as const, invoice: inv, created };
  });

// ===== Spending summary by expense category =====
export const getCategorySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(7).max(365).default(90) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/inventory", "member");
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - data.days);
    const fromIso = from.toISOString();
    const [{ data: movs }, { data: txs }] = await Promise.all([
      context.supabase
        .from("inv_movements")
        .select("total,expense_category,occurred_at,kind,product_id")
        .eq("org_id", orgId)
        .eq("kind", "purchase")
        .gte("occurred_at", fromIso),
      context.supabase
        .from("finance_transactions")
        .select("amount,expense_category,occurred_on")
        .eq("org_id", orgId)
        .gte("occurred_on", fromIso.slice(0, 10)),
    ]);

    // Build product -> current category map so manual edits to a product's
    // category are reflected immediately in the breakdown (movements keep a
    // historical snapshot of expense_category, the product is the source of
    // truth going forward).
    const productIds = Array.from(
      new Set((movs ?? []).map((m) => m.product_id).filter((x): x is string => !!x)),
    );
    const productCat = new Map<string, string | null>();
    if (productIds.length) {
      const { data: prods } = await context.supabase
        .from("inv_products")
        .select("id,category")
        .in("id", productIds);
      for (const p of prods ?? []) productCat.set(p.id as string, (p.category as string | null) ?? null);
    }

    const totals = new Map<string, { total: number; count: number }>();
    const bump = (cat: string | null, amount: number) => {
      const key = cat && (EXPENSE_CATEGORIES as readonly string[]).includes(cat) ? cat : "otros_gastos";
      const cur = totals.get(key) ?? { total: 0, count: 0 };
      cur.total += amount;
      cur.count += 1;
      totals.set(key, cur);
    };
    for (const m of movs ?? []) {
      const current = m.product_id ? productCat.get(m.product_id) ?? null : null;
      bump(current ?? m.expense_category, Math.abs(Number(m.total)));
    }
    for (const t of txs ?? []) {
      const amt = Number(t.amount);
      if (amt < 0) bump(t.expense_category, Math.abs(amt));
    }

    const items = (EXPENSE_CATEGORIES as readonly string[]).map((cat) => ({
      category: cat,
      total: totals.get(cat)?.total ?? 0,
      count: totals.get(cat)?.count ?? 0,
    }));
    const grand = items.reduce((s, x) => s + x.total, 0);
    return { items, total: grand, days: data.days };
  });