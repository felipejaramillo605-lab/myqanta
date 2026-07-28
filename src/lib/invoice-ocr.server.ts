// Shared invoice OCR extraction (Gemini vision).
// Used by inventory scanInvoice and by the assistant's accounting tool so the
// extraction prompt and normalization live in exactly one place.
import { z } from "zod";
import { parseNumberWithSeparator, type DecimalSeparator } from "./categories";

const InvoiceItem = z.object({
  description: z.string().default(""),
  sku: z.string().optional().nullable(),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
});

export const InvoiceSchema = z.object({
  supplier_name: z.string().optional().nullable(),
  supplier_tax_id: z.string().optional().nullable(),
  invoice_number: z.string().optional().nullable(),
  invoice_date: z.string().optional().nullable(),
  currency: z.string().default("EUR"),
  subtotal: z.coerce.number().default(0),
  tax: z.coerce.number().default(0),
  total: z.coerce.number().default(0),
  items: z.array(InvoiceItem).default([]),
  summary: z.string().default(""),
});

export type ParsedInvoice = z.infer<typeof InvoiceSchema>;

export type ScanErrorCode =
  | "SCAN_PARSE_FAILED"
  | "SCAN_TOO_LARGE"
  | "SCAN_UNSUPPORTED_FILE"
  | "SCAN_RATE_LIMITED"
  | "SCAN_NO_CREDITS"
  | "SCAN_FAILED";

export function scanError(error: ScanErrorCode) {
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

function numberOrZero(value: unknown, sep: DecimalSeparator = "auto"): number {
  return parseNumberWithSeparator(value, sep);
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
  } catch {
    return null;
  }
}

export function normalizeInvoice(value: unknown, sep: DecimalSeparator = "auto"): ParsedInvoice | null {
  const root = asRecord(value);
  const itemSource = firstDefined(root, ["items", "line_items", "lines", "productos", "concepts", "details"]);
  const rawItems = Array.isArray(itemSource) ? itemSource : [];
  const items = rawItems
    .map((entry) => {
      const item = asRecord(entry);
      const quantity = numberOrZero(firstDefined(item, ["quantity", "qty", "cantidad", "units", "unidades"]), sep) || 1;
      const unitPrice = numberOrZero(firstDefined(item, ["unit_price", "unitPrice", "price", "precio", "cost", "unit_cost"]), sep);
      const total = numberOrZero(firstDefined(item, ["total", "amount", "importe", "line_total"]), sep) || quantity * unitPrice;
      return {
        description: textOrEmpty(firstDefined(item, ["description", "name", "product", "producto", "concept", "concepto", "detalle"])),
        sku: textOrNull(firstDefined(item, ["sku", "code", "codigo", "reference", "referencia"])),
        quantity,
        unit_price: unitPrice,
        total,
      };
    })
    .filter((item) => item.description || item.total > 0);

  const subtotal = numberOrZero(firstDefined(root, ["subtotal", "sub_total", "base", "base_imponible"]), sep);
  const tax = numberOrZero(firstDefined(root, ["tax", "vat", "iva", "itbis", "sales_tax"]), sep);
  const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = numberOrZero(firstDefined(root, ["total", "grand_total", "amount", "importe_total"]), sep) || subtotal + tax || itemsTotal;
  const normalized = {
    supplier_name: textOrNull(firstDefined(root, ["supplier_name", "supplier", "vendor", "merchant", "proveedor", "empresa"])),
    supplier_tax_id: textOrNull(firstDefined(root, ["supplier_tax_id", "tax_id", "nit", "rut", "rfc", "cif", "nif"])),
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
  return safe.success ? safe.data : null;
}

export type ExtractInput = {
  image_data_url: string;
  mime: string;
  decimal_separator?: DecimalSeparator;
  apiKey: string;
};

/**
 * Single shared OCR entry point: sends the invoice/receipt to Gemini vision and
 * returns normalized invoice data, or a typed scan error code.
 */
export async function extractInvoiceData(
  input: ExtractInput,
): Promise<{ ok: true; data: ParsedInvoice } | { ok: false; error: ScanErrorCode }> {
  const sep: DecimalSeparator = input.decimal_separator ?? "auto";
  const sepHint =
    sep === "comma"
      ? "The source document uses COMMA as decimal separator and dot as thousand separator (e.g. 1.234,56 = 1234.56). Convert every numeric value to a plain decimal with a dot as decimal separator."
      : sep === "dot"
        ? "The source document uses DOT as decimal separator and comma as thousand separator (e.g. 1,234.56 = 1234.56). Convert every numeric value to a plain decimal with a dot as decimal separator."
        : "Detect the decimal separator (comma or dot) from context and convert every numeric value to a plain decimal with a dot as decimal separator.";

  const system = `You are an OCR + accounting assistant. Extract structured data from an invoice or receipt image and return ONLY valid JSON (no markdown, no commentary) matching exactly this shape:
{
  "supplier_name": string|null,
  "supplier_tax_id": string|null,
  "invoice_number": string|null,
  "invoice_date": "YYYY-MM-DD"|null,
  "currency": string,
  "subtotal": number,
  "tax": number,
  "total": number,
  "items": [{ "description": string, "sku": string|null, "quantity": number, "unit_price": number, "total": number }],
  "summary": string
}
Rules: numbers must be plain numbers (no currency symbols, no thousands separators). ${sepHint} "total" per line = quantity * unit_price. summary: 1-2 sentences in the document's language. If a field is unknown use null (or 0 for numeric totals, [] for items). Output JSON only.`;

  const isPdf = input.mime === "application/pdf";
  const userContent = isPdf
    ? [
        { type: "text" as const, text: "Extract every line item from this invoice/receipt." },
        { type: "file" as const, data: input.image_data_url, mediaType: input.mime, filename: "invoice.pdf" },
      ]
    : [
        { type: "text" as const, text: "Extract every line item from this invoice/receipt." },
        { type: "image" as const, image: input.image_data_url },
      ];

  // Reject obviously oversized payloads early (base64 ≈ 1.37x raw)
  const approxBytes = Math.floor((input.image_data_url.length * 3) / 4);
  if (approxBytes > 8 * 1024 * 1024) return scanError("SCAN_TOO_LARGE");

  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const { generateText } = await import("ai");
  const gateway = createLovableAiGatewayProvider(input.apiKey);

  try {
    const res = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const normalized = normalizeInvoice(extractJsonObject((res.text ?? "").trim()), sep);
    if (!normalized) return scanError("SCAN_PARSE_FAILED");
    return { ok: true, data: normalized };
  } catch (err: unknown) {
    const e = err as { message?: string; statusCode?: number; status?: number; cause?: { statusCode?: number } };
    const status = e?.statusCode ?? e?.status ?? e?.cause?.statusCode;
    const msg = String(e?.message ?? "");
    if (status === 429 || /rate.?limit/i.test(msg)) return scanError("SCAN_RATE_LIMITED");
    if (status === 402 || /credit|payment.required/i.test(msg)) return scanError("SCAN_NO_CREDITS");
    if (/unsupported|mime|document has no pages|invalid.*image/i.test(msg)) return scanError("SCAN_UNSUPPORTED_FILE");
    return scanError("SCAN_FAILED");
  }
}
