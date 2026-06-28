import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";
import { EXPENSE_CATEGORIES, parseNumberWithSeparator, suggestCategory, type DecimalSeparator } from "./categories";

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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
  description: z.string().default(""),
  sku: z.string().optional().nullable(),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
});
const InvoiceSchema = z.object({
  supplier_name: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  invoice_date: z.string().optional().nullable(),
  currency: z.string().default("EUR"),
  subtotal: z.coerce.number().default(0),
  tax: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
  items: z.array(InvoiceItem).default([]),
  summary: z.string().default(""),
});

type ScanErrorCode =
  | "SCAN_PARSE_FAILED"
  | "SCAN_TOO_LARGE"
  | "SCAN_UNSUPPORTED_FILE"
  | "SCAN_RATE_LIMITED"
  | "SCAN_NO_CREDITS"
  | "SCAN_FAILED";

function scanError(error: ScanErrorCode) {
  return { ok: false as const, error };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstDefined(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function textOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && trimmed.toLowerCase() !== "null" ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function textOrEmpty(value: unknown): string {
  return textOrNull(value) ?? "";
}

function numberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  let cleaned = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/(?!^)-/g, "")
    .trim();
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(",", ".");
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractJsonObject(raw: string): unknown | null {
  const withoutFences = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const jsonText = withoutFences
    .slice(start, end + 1)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn("Invoice scan JSON parse failed", error);
    return null;
  }
}

function normalizeInvoice(value: unknown): z.infer<typeof InvoiceSchema> | null {
  const root = asRecord(value);
  const itemSource = firstDefined(root, ["items", "line_items", "lines", "productos", "concepts", "details"]);
  const rawItems = Array.isArray(itemSource) ? itemSource : [];
  const items = rawItems
    .map((entry) => {
      const item = asRecord(entry);
      const quantity = numberOrZero(firstDefined(item, ["quantity", "qty", "cantidad", "units", "unidades"])) || 1;
      const unitPrice = numberOrZero(firstDefined(item, ["unit_price", "unitPrice", "price", "precio", "cost", "unit_cost"]));
      const total = numberOrZero(firstDefined(item, ["total", "amount", "importe", "line_total"])) || quantity * unitPrice;
      return {
        description: textOrEmpty(firstDefined(item, ["description", "name", "product", "producto", "concept", "concepto", "detalle"])),
        sku: textOrNull(firstDefined(item, ["sku", "code", "codigo", "reference", "referencia"])),
        quantity,
        unit_price: unitPrice,
        total,
      };
    })
    .filter((item) => item.description || item.total > 0);

  const subtotal = numberOrZero(firstDefined(root, ["subtotal", "sub_total", "base", "base_imponible"]));
  const tax = numberOrZero(firstDefined(root, ["tax", "vat", "iva", "itbis", "sales_tax"]));
  const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = numberOrZero(firstDefined(root, ["total", "grand_total", "amount", "importe_total"])) || subtotal + tax || itemsTotal;
  const normalized = {
    supplier_name: textOrNull(firstDefined(root, ["supplier_name", "supplier", "vendor", "merchant", "proveedor", "empresa"])),
    invoice_number: textOrNull(firstDefined(root, ["invoice_number", "invoiceNo", "number", "numero", "ncf", "receipt_number"])),
    invoice_date: textOrNull(firstDefined(root, ["invoice_date", "date", "fecha", "issued_at"])),
    currency: textOrEmpty(firstDefined(root, ["currency", "moneda"])) || "EUR",
    subtotal: subtotal || Math.max(total - tax, 0),
    tax,
    total,
    items,
    summary: textOrEmpty(firstDefined(root, ["summary", "resumen", "description"])) || "Invoice scanned successfully.",
  };
  const safe = InvoiceSchema.safeParse(normalized);
  if (!safe.success) {
    console.warn("Invoice scan schema normalization failed", safe.error.flatten());
    return null;
  }
  return safe.data;
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
      ? await resolveOrgWithRole(context.supabase, context.userId, "member")
      : await resolveActiveOrgId(context.supabase, context.userId);

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const aiMod = await import("ai");
    const { generateText } = aiMod;
    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are an OCR + accounting assistant. Extract structured data from an invoice or receipt image and return ONLY valid JSON (no markdown, no commentary) matching exactly this shape:
{
  "supplier_name": string|null,
  "invoice_number": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "currency": string,
  "subtotal": number,
  "tax": number,
  "total": number,
  "items": [{ "description": string, "sku": string|null, "quantity": number, "unit_price": number, "total": number }],
  "summary": string
}
Rules: numbers must be plain numbers (no currency symbols, no thousands separators). "total" per line = quantity * unit_price. summary: 1-2 sentences in the document's language. If a field is unknown use null (or 0 for numeric totals, [] for items). Output JSON only.`;

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

    // Reject obviously oversized payloads early (base64 ≈ 1.37x raw)
    const approxBytes = Math.floor((data.image_data_url.length * 3) / 4);
    if (approxBytes > 8 * 1024 * 1024) {
      return scanError("SCAN_TOO_LARGE");
    }

    let parsed: z.infer<typeof InvoiceSchema>;
    try {
      const res = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        system,
        messages: [{ role: "user", content: userContent }],
      });
      const raw = (res.text ?? "").trim();
      const json = extractJsonObject(raw);
      const normalized = normalizeInvoice(json);
      if (!normalized) return scanError("SCAN_PARSE_FAILED");
      parsed = normalized;
    } catch (err: unknown) {
      const e = err as { message?: string; statusCode?: number; status?: number; cause?: { statusCode?: number } };
      const status = e?.statusCode ?? e?.status ?? e?.cause?.statusCode;
      const msg = String(e?.message ?? "");
      if (status === 429 || /rate.?limit/i.test(msg)) {
        return scanError("SCAN_RATE_LIMITED");
      }
      if (status === 402 || /credit|payment.required/i.test(msg)) {
        return scanError("SCAN_NO_CREDITS");
      }
      if (/unsupported|mime|document has no pages|invalid.*image/i.test(msg)) {
        return scanError("SCAN_UNSUPPORTED_FILE");
      }
      return scanError("SCAN_FAILED");
    }

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