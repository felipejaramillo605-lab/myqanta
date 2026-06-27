import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";

// ===== Products =====
export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
const InvoiceItem = z.object({
  description: z.string(),
  sku: z.string().optional().nullable(),
  quantity: z.number().default(1),
  unit_price: z.number().default(0),
  total: z.number().default(0),
});
const InvoiceSchema = z.object({
  supplier_name: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  invoice_date: z.string().optional().nullable(),
  currency: z.string().default("EUR"),
  subtotal: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  items: z.array(InvoiceItem),
  summary: z.string(),
});

const ScanInput = z.object({
  image_data_url: z.string().startsWith("data:"),
  mime: z.string(),
  commit: z.boolean().default(false),
});

export const scanInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateObject } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are an OCR + accounting assistant. Extract structured data from an invoice or receipt image.
- Dates must be YYYY-MM-DD when possible.
- Quantities and prices are numbers (no currency symbols).
- "total" per line = quantity * unit_price.
- summary: 1-2 sentences in the document's language.`;

    const isPdf = data.mime === "application/pdf";
    const userContent = isPdf
      ? [
          { type: "text" as const, text: "Extract every line item from this invoice/receipt." },
          { type: "file" as const, data: data.image_data_url, mediaType: data.mime, filename: "invoice.pdf" },
        ]
      : [
          { type: "text" as const, text: "Extract every line item from this invoice/receipt." },
          { type: "image" as const, image: data.image_data_url },
        ];

    const { object: parsed } = await generateObject({
      model: gateway("google/gemini-2.5-flash"),
      schema: InvoiceSchema,
      system,
      messages: [{ role: "user", content: userContent }],
    });

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

    return { invoice: inv, parsed, created };
  });