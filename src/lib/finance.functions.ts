import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";
import { parseNumberWithSeparator } from "./categories";

const BUCKETS = [
  "revenue",
  "cogs",
  "opex",
  "depreciation",
  "amortization",
  "interest",
  "tax",
  "other_income",
  "other_expense",
] as const;

const BucketEnum = z.enum(BUCKETS);

// Buckets that represent outflows. Amounts here are always treated as
// magnitudes (absolute value) so an accidental negative sign cannot flip the
// math and "add" costs to revenue.
const COST_BUCKETS = new Set(["cogs", "opex", "depreciation", "amortization", "interest", "tax", "other_expense"]);
const INCOME_BUCKETS = new Set(["revenue", "other_income"]);

function signedAmount(bucket: string, amount: number): number {
  const v = Math.abs(Number(amount) || 0);
  if (COST_BUCKETS.has(bucket)) return v;       // stored as positive magnitude
  if (INCOME_BUCKETS.has(bucket)) return v;     // stored as positive magnitude
  return Number(amount) || 0;
}

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("finance_transactions")
      .select("*")
      .eq("org_id", orgId)
      .order("occurred_on", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("finance_accounts")
      .select("id, name, currency, kind")
      .eq("org_id", orgId)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const now = data.month ? new Date(data.month + "-01") : new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: rows, error } = await context.supabase
      .from("finance_transactions")
      .select("amount,bucket,occurred_on")
      .eq("org_id", orgId)
      .gte("occurred_on", prevStart)
      .lt("occurred_on", end);
    if (error) throw new Error(error.message);

    const empty = { revenue: 0, cogs: 0, opex: 0, depreciation: 0, amortization: 0, interest: 0, tax: 0, other_income: 0, other_expense: 0 };
    const cur = { ...empty } as Record<string, number>;
    const prev = { ...empty } as Record<string, number>;
    for (const r of rows ?? []) {
      const target = r.occurred_on >= start ? cur : prev;
      target[r.bucket] = (target[r.bucket] ?? 0) + signedAmount(r.bucket, Number(r.amount));
    }
    const compute = (b: Record<string, number>) => {
      const revenue = b.revenue;
      const costs = b.cogs + b.opex;
      const ebitda = revenue - costs;
      const net = ebitda - b.depreciation - b.amortization - b.interest - b.tax + b.other_income - b.other_expense;
      return { revenue, costs, ebitda, net };
    };
    const c = compute(cur);
    const p = compute(prev);
    const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / Math.abs(b)) * 100);
    return {
      month: start,
      current: c,
      previous: p,
      deltas: {
        revenue: delta(c.revenue, p.revenue),
        costs: delta(c.costs, p.costs),
        ebitda: delta(c.ebitda, p.ebitda),
        net: delta(c.net, p.net),
      },
      byBucket: cur,
    };
  });

// 12-month EBITDA time series
export const getEbitdaSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ months: z.number().int().min(3).max(36).default(12) }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (data.months - 1), 1);
    const startStr = start.toISOString().slice(0, 10);
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: rows, error } = await context.supabase
      .from("finance_transactions")
      .select("amount,bucket,occurred_on")
      .eq("org_id", orgId)
      .gte("occurred_on", startStr);
    if (error) throw new Error(error.message);

    const buckets = ["revenue", "cogs", "opex", "depreciation", "amortization", "interest", "tax", "other_income", "other_expense"] as const;
    const months: { key: string; label: string; agg: Record<string, number> }[] = [];
    for (let i = 0; i < data.months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const agg: Record<string, number> = {};
      for (const b of buckets) agg[b] = 0;
      months.push({ key, label: key, agg });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const r of rows ?? []) {
      const key = r.occurred_on.slice(0, 7);
      const i = idx.get(key);
      if (i === undefined) continue;
      months[i].agg[r.bucket] = (months[i].agg[r.bucket] ?? 0) + signedAmount(r.bucket, Number(r.amount));
    }
    return months.map((m) => {
      const a = m.agg;
      const revenue = a.revenue;
      const costs = a.cogs + a.opex;
      const ebitda = revenue - costs;
      const net = ebitda - a.depreciation - a.amortization - a.interest - a.tax + a.other_income - a.other_expense;
      return { month: m.label, revenue, costs, ebitda, net };
    });
  });

// Monthly closing report — AI executive summary
export const monthlyClosingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month: z.string().optional(), lang: z.enum(["es", "en"]).default("en") }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const now = data.month ? new Date(data.month + "-01") : new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: rows } = await context.supabase
      .from("finance_transactions")
      .select("amount,bucket,description,occurred_on")
      .eq("org_id", orgId)
      .gte("occurred_on", prevStart)
      .lt("occurred_on", end);

    const empty = { revenue: 0, cogs: 0, opex: 0, depreciation: 0, amortization: 0, interest: 0, tax: 0, other_income: 0, other_expense: 0 } as Record<string, number>;
    const cur = { ...empty };
    const prev = { ...empty };
    for (const r of rows ?? []) {
      const target = r.occurred_on >= start ? cur : prev;
      target[r.bucket] = (target[r.bucket] ?? 0) + signedAmount(r.bucket, Number(r.amount));
    }
    const stats = (b: Record<string, number>) => {
      const revenue = b.revenue;
      const costs = b.cogs + b.opex;
      const ebitda = revenue - costs;
      const net = ebitda - b.depreciation - b.amortization - b.interest - b.tax + b.other_income - b.other_expense;
      return { revenue, costs, ebitda, net, margin: revenue ? (ebitda / revenue) * 100 : 0 };
    };

    const c = stats(cur);
    const p = stats(prev);

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);

    const lang = data.lang === "es" ? "Spanish" : "English";
    const prompt = `You are a senior financial controller. Write a concise executive summary (3-5 sentences, no bullet points) in ${lang} for month ${start}.

Current month KPIs:
- Revenue: ${c.revenue.toFixed(2)}
- Costs (COGS + OpEx): ${c.costs.toFixed(2)}
- EBITDA: ${c.ebitda.toFixed(2)} (margin ${c.margin.toFixed(1)}%)
- Net income: ${c.net.toFixed(2)}

Previous month KPIs:
- Revenue: ${p.revenue.toFixed(2)}
- Costs: ${p.costs.toFixed(2)}
- EBITDA: ${p.ebitda.toFixed(2)} (margin ${p.margin.toFixed(1)}%)
- Net: ${p.net.toFixed(2)}

Bucket breakdown (current month): ${JSON.stringify(cur)}

Focus on EBITDA evolution, margin, and the largest cost drivers. Be specific with numbers but human and direct.`;

    const { text } = await generateText({ model: gateway("google/gemini-2.5-flash"), prompt });
    return { month: start, summary: text, current: c, previous: p, byBucket: cur };
  });

const TxInput = z.object({
  occurred_on: z.string(),
  description: z.string().min(1),
  amount: z.number(),
  bucket: BucketEnum,
  currency: z.string().default("USD"),
  expense_category: z.string().optional().nullable(),
});

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TxInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error, data: row } = await context.supabase
      .from("finance_transactions")
      .insert({ ...data, user_id: context.userId, org_id: orgId, source: "manual" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("finance_transactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const TxUpdateInput = z.object({
  id: z.string().uuid(),
  occurred_on: z.string(),
  description: z.string().min(1),
  amount: z.number(),
  bucket: BucketEnum,
  currency: z.string().default("USD"),
  expense_category: z.string().optional().nullable(),
});

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TxUpdateInput.parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { id, ...patch } = data;
    const { error, data: row } = await context.supabase
      .from("finance_transactions")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// AI: analyze pasted bank statement text -> structured tx list
const AnalyzeInput = z.object({
  source_name: z.string().min(1),
  text: z.string().min(20),
  currency: z.string().default("USD"),
  commit: z.boolean().default(false),
  decimal_separator: z.enum(["auto", "comma", "dot"]).default("auto"),
});

const ExtractedTx = z.object({
  occurred_on: z.string().describe("ISO date YYYY-MM-DD"),
  description: z.string(),
  amount: z.number().describe("Positive for income, negative for expense"),
  bucket: BucketEnum,
  confidence: z.number().nullable().describe("0..1 confidence, or null if unknown"),
});

const ExtractionSchema = z.object({
  summary: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  transactions: z.array(ExtractedTx),
});

export const analyzeStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    // Anyone (incl. viewers) can preview the analysis; writes require member+
    const orgId = data.commit
      ? await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member")
      : await resolveActiveOrgId(context.supabase, context.userId);

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateObject, NoObjectGeneratedError } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are a financial analyst. Classify each bank-statement line into an EBITDA bucket.
Buckets:
- revenue: sales / service income
- cogs: cost of goods sold, direct materials
- opex: operating expenses (rent, salaries, utilities, marketing, software, fees)
- depreciation, amortization
- interest: interest paid / received on debt
- tax: taxes paid
- other_income, other_expense: anything else
Amount sign convention: income positive, expense negative.
Dates must be YYYY-MM-DD. ${
  data.decimal_separator === "comma"
    ? "The statement uses COMMA as decimal separator and dot as thousand separator (e.g. 1.234,56 = 1234.56). Convert numbers to plain decimals with dot separator."
    : data.decimal_separator === "dot"
      ? "The statement uses DOT as decimal separator and comma as thousand separator (e.g. 1,234.56 = 1234.56). Convert numbers to plain decimals with dot separator."
      : "Detect the decimal separator (comma or dot) and convert numbers to plain decimals with dot separator."
} Output a concise summary in the user's likely language.`;

    const { object: parsed } = await generateObject({
      model: gateway("google/gemini-2.5-flash"),
      schema: ExtractionSchema,
      system,
      prompt: `Parse this bank statement and extract every transaction.\n\n${data.text}`,
    });

    // Re-parse amounts respecting the decimal-separator hint as a safety net.
    if (data.decimal_separator !== "auto") {
      for (const t of parsed.transactions) {
        if (typeof t.amount === "string") {
          t.amount = parseNumberWithSeparator(t.amount, data.decimal_separator);
        }
      }
    }

    const { data: stmt, error: stmtErr } = await context.supabase
      .from("finance_statements")
      .insert({
        user_id: context.userId,
        org_id: orgId,
        source_name: data.source_name,
        period_start: parsed.period_start ?? null,
        period_end: parsed.period_end ?? null,
        status: data.commit ? "applied" : "preview",
        ai_summary: parsed.summary,
        raw_text: data.text.slice(0, 50_000),
        transactions_count: parsed.transactions.length,
      })
      .select()
      .single();
    if (stmtErr) throw new Error(stmtErr.message);

    let inserted = 0;
    if (data.commit && parsed.transactions.length) {
      const rows = parsed.transactions.map((t) => ({
        user_id: context.userId,
        org_id: orgId,
        statement_id: stmt.id,
        occurred_on: t.occurred_on,
        description: t.description,
        amount: t.amount,
        bucket: t.bucket,
        currency: data.currency,
        ai_confidence: t.confidence,
        source: "ai_statement",
      }));
      const { error: txErr, count } = await context.supabase
        .from("finance_transactions")
        .insert(rows, { count: "exact" });
      if (txErr) throw new Error(txErr.message);
      inserted = count ?? rows.length;
    }

    return {
      statement: stmt,
      summary: parsed.summary,
      transactions: parsed.transactions,
      inserted,
    };
  });

// ===== AI: scan bank-statement image / PDF -> structured tx list =====
const ScanStatementInput = z.object({
  source_name: z.string().min(1),
  image_data_url: z.string().startsWith("data:"),
  mime: z.string(),
  currency: z.string().default("USD"),
  decimal_separator: z.enum(["auto", "comma", "dot"]).default("auto"),
});

export const scanStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScanStatementInput.parse(d))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");

    // Reject obviously oversized payloads early (base64 ≈ 1.37x raw)
    const approxBytes = Math.floor((data.image_data_url.length * 3) / 4);
    if (approxBytes > 8 * 1024 * 1024) throw new Error("SCAN_TOO_LARGE");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateObject, NoObjectGeneratedError } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);

    const sepHint =
      data.decimal_separator === "comma"
        ? "The statement uses COMMA as decimal separator and dot as thousand separator (e.g. 1.234,56 = 1234.56). Convert numbers to plain decimals with dot separator."
        : data.decimal_separator === "dot"
          ? "The statement uses DOT as decimal separator and comma as thousand separator (e.g. 1,234.56 = 1234.56). Convert numbers to plain decimals with dot separator."
          : "Detect the decimal separator (comma or dot) and convert numbers to plain decimals with dot separator.";

    const system = `You are an OCR + financial analyst. Extract every transaction from a bank-statement image or PDF and classify each line into an EBITDA bucket.
Buckets:
- revenue: sales / service income
- cogs: cost of goods sold, direct materials
- opex: operating expenses (rent, salaries, utilities, marketing, software, fees)
- depreciation, amortization
- interest: interest paid / received on debt
- tax: taxes paid
- other_income, other_expense: anything else
Amount sign convention: income positive, expense negative.
Dates must be YYYY-MM-DD. ${sepHint} Output a concise summary in the document's language.`;

    const isPdf = data.mime === "application/pdf";
    const userContent = isPdf
      ? [
          { type: "text" as const, text: "Extract every transaction from this bank statement." },
          { type: "file" as const, data: data.image_data_url, mediaType: data.mime, filename: "statement.pdf" },
        ]
      : [
          { type: "text" as const, text: "Extract every transaction from this bank statement." },
          { type: "image" as const, image: data.image_data_url },
        ];

    let parsed: z.infer<typeof ExtractionSchema>;
    try {
      const res = await generateObject({
        model: gateway("google/gemini-2.5-flash"),
        schema: ExtractionSchema,
        system,
        messages: [{ role: "user", content: userContent }],
      });
      parsed = res.object;
    } catch (err: unknown) {
      // Try to salvage a slightly-off object from the raw text before failing.
      if (NoObjectGeneratedError.isInstance(err)) {
        const raw = (err as { text?: string }).text ?? "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const candidate = JSON.parse(jsonMatch[0]);
            parsed = ExtractionSchema.parse({
              summary: candidate.summary ?? "",
              period_start: candidate.period_start ?? null,
              period_end: candidate.period_end ?? null,
              transactions: (candidate.transactions ?? []).map((t: Record<string, unknown>) => ({
                occurred_on: String(t.occurred_on ?? ""),
                description: String(t.description ?? ""),
                amount: Number(t.amount ?? 0),
                bucket: t.bucket ?? "other_expense",
                confidence: typeof t.confidence === "number" ? t.confidence : null,
              })),
            });
            // fall through to normal post-processing below
            // eslint-disable-next-line no-console
            console.warn("[scanStatement] recovered from NoObjectGeneratedError");
            // continue outside the catch
            // (parsed is assigned)
            // eslint-disable-next-line no-empty
          } catch {}
        }
      }
      // If we still don't have a parsed value, translate the error.
      // @ts-expect-error narrowing across try/catch salvage branch
      if (!parsed) {
      const e = err as { message?: string; statusCode?: number; status?: number; cause?: { statusCode?: number } };
      const status = e?.statusCode ?? e?.status ?? e?.cause?.statusCode;
      const msg = String(e?.message ?? "");
      // eslint-disable-next-line no-console
      console.error("[scanStatement] AI gateway failure", { status, msg, mime: data.mime, err });
      if (status === 429 || /rate.?limit/i.test(msg)) throw new Error("SCAN_RATE_LIMITED");
      if (status === 402 || /credit|payment.required/i.test(msg)) throw new Error("SCAN_NO_CREDITS");
      if (/unsupported|mime|document has no pages|invalid.*image/i.test(msg)) throw new Error("SCAN_UNSUPPORTED_FILE");
      throw new Error(`SCAN_FAILED: ${msg || "unknown"}`);
      }
    }

    if (data.decimal_separator !== "auto") {
      for (const t of parsed.transactions) {
        if (typeof t.amount === "string") {
          t.amount = parseNumberWithSeparator(t.amount, data.decimal_separator);
        }
      }
    }

    const { data: stmt, error: stmtErr } = await context.supabase
      .from("finance_statements")
      .insert({
        user_id: context.userId,
        org_id: orgId,
        source_name: data.source_name,
        period_start: parsed.period_start ?? null,
        period_end: parsed.period_end ?? null,
        status: "preview",
        ai_summary: parsed.summary,
        raw_text: `[${isPdf ? "PDF" : "IMAGE"}] ${data.source_name}`,
        transactions_count: parsed.transactions.length,
      })
      .select()
      .single();
    if (stmtErr) throw new Error(stmtErr.message);

    return {
      statement: stmt,
      summary: parsed.summary,
      transactions: parsed.transactions,
      inserted: 0,
    };
  });

// ===== Apply hand-edited statement transactions (after preview) =====
const ApplyExtractedInput = z.object({
  source_name: z.string().min(1),
  currency: z.string().default("USD"),
  transactions: z
    .array(
      z.object({
        occurred_on: z.string(),
        description: z.string().min(1),
        amount: z.number(),
        bucket: BucketEnum,
        expense_category: z.string().optional().nullable(),
      }),
    )
    .min(1),
});

export const applyExtractedTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplyExtractedInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const rows = data.transactions.map((t) => ({
      user_id: context.userId,
      org_id: orgId,
      occurred_on: t.occurred_on,
      description: t.description,
      amount: t.amount,
      bucket: t.bucket,
      currency: data.currency,
      expense_category: t.expense_category ?? null,
      source: "ai_statement_edited",
    }));
    const { error, data: inserted } = await context.supabase
      .from("finance_transactions")
      .insert(rows)
      .select("id,amount");
    if (error) throw new Error(error.message);

    const affected = (inserted ?? []).map((r) => ({ table: "finance_transactions", id: r.id as string }));
    const sumIn = (inserted ?? []).reduce((s, r) => s + Number(r.amount), 0);
    await context.supabase.from("scan_batches").insert({
      org_id: orgId,
      user_id: context.userId,
      kind: "statement",
      source_name: data.source_name,
      summary: `${affected.length} ${affected.length === 1 ? "transaction" : "transactions"} · net ${sumIn.toFixed(2)} ${data.currency}`,
      item_count: affected.length,
      total: sumIn,
      currency: data.currency,
      affected,
    });
    return { inserted: affected.length };
  });