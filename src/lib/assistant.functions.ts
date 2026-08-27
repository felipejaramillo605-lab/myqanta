import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, tool, stepCountIs } from "ai";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole, resolveOrgWithModuleAccess, type OrgRole } from "./permissions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { suggestCategory } from "./categories";
import { crmTools } from "./assistant-tools/crm.server";
import { salesTools } from "./assistant-tools/sales.server";
import { opsTools } from "./assistant-tools/ops.server";
import { workflowTools } from "./assistant-tools/workflow.server";
import { accountingTools } from "./assistant-tools/accounting.server";
import { niifSummaryForPrompt } from "./niif-knowledge";
import type { AssistantToolCtx } from "./assistant-tools/context.server";


const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type ActionRecord = {
  tool: string;
  params: Record<string, JsonValue>;
  result: Record<string, JsonValue>;
  status: "ok" | "error";
};

async function logAction(
  supabase: SupabaseClient<Database>,
  orgId: string,
  userId: string,
  rec: ActionRecord,
) {
  await supabase.from("ai_actions").insert({
    org_id: orgId,
    user_id: userId,
    tool_name: rec.tool,
    params: rec.params as never,
    result: rec.result as never,
    status: rec.status,
  });
}

function makeCode() {
  return "EMP-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

/** Decode a `data:<mime>;base64,<payload>` URL into raw bytes. */
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const payload = m[3] ?? "";
  try {
    if (m[2]) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mime };
  } catch {
    return null;
  }
}

/** Find an account by exact `code` inside the org chart of accounts. */
async function insertEntry(
  supabase: SupabaseClient<Database>,
  orgId: string,
  userId: string,
  entry: {
    entry_date: string;
    description: string | null;
    status: "draft" | "posted";
    receipt_document_id: string | null;
    lines: Array<{
      account_id: string;
      debit: number;
      credit: number;
      description: string | null;
      third_party_id?: string | null;
      bank_account_id?: string | null;
    }>;
  },
): Promise<{ id: string } | { error: string }> {
  // Same invariants as saveJournalEntry: balanced entry, and a posted entry
  // always needs a receipt document.
  const totalD = entry.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = entry.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalD - totalC) > 0.01) return { error: "El asiento no cuadra (débito ≠ crédito)" };
  if (entry.status === "posted" && !entry.receipt_document_id) {
    return { error: "Un asiento publicado requiere comprobante adjunto" };
  }
  const { data: nRes, error: nErr } = await (supabase.rpc as never as (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "next_journal_entry_no",
    { _org_id: orgId },
  );
  if (nErr) return { error: nErr.message };
  const { data: ins, error } = await supabase
    .from("fin_journal_entries" as never)
    .insert({
      org_id: orgId,
      entry_no: nRes as number,
      entry_date: entry.entry_date,
      description: entry.description,
      status: entry.status,
      receipt_document_id: entry.receipt_document_id,
      created_by: userId,
    } as never)
    .select("id")
    .single();
  if (error || !ins) return { error: error?.message ?? "No se pudo crear el asiento" };
  const entryId = (ins as unknown as { id: string }).id;
  const { error: lErr } = await supabase.from("fin_journal_lines" as never).insert(
    entry.lines.map((l) => ({
      entry_id: entryId,
      org_id: orgId,
      account_id: l.account_id,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
      third_party_id: l.third_party_id ?? null,
      bank_account_id: l.bank_account_id ?? null,
    })) as never,
  );
  if (lErr) return { error: lErr.message };
  return { id: entryId };
}

/** Find an account by exact `code` inside the org chart of accounts. */
async function findAccountByCode(
  supabase: SupabaseClient<Database>,
  orgId: string,
  code: string,
): Promise<{ id: string; code: string; name: string } | null> {
  const { data } = await supabase
    .from("fin_accounts" as never)
    .select("id,code,name")
    .eq("org_id", orgId)
    .eq("code", code)
    .maybeSingle();
  return (data as unknown as { id: string; code: string; name: string } | null) ?? null;
}

async function getActiveRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<OrgRole | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as OrgRole | undefined) ?? null;
}

export const chatWithAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      messages: z.array(messageSchema).min(1).max(20),
      lang: z.enum(["es", "en"]).default("en"),
      // Optional invoice/receipt the user attached in the chat composer. Kept
      // out of the model's tool arguments (data URLs are far too large for a
      // tool call) — the accounting tool reads it from the request instead.
      attachment: z
        .object({
          data_url: z.string().startsWith("data:").max(12_000_000),
          mime: z.string().max(120),
          name: z.string().max(200).default("comprobante"),
        })
        .nullable()
        .optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const role = await getActiveRole(context.supabase, context.userId, orgId);
    const canAct = role === "owner" || role === "admin";
    // Build live context
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const [orgRes, txRes, prodRes, taskRes, evRes] = await Promise.all([
      context.supabase
        .from("organizations")
        .select("name,industry,business_type,description,goals,team_size,currency")
        .eq("id", orgId)
        .maybeSingle(),
      context.supabase
        .from("finance_transactions")
        .select("amount,bucket,description,occurred_on")
        .eq("org_id", orgId)
        .gte("occurred_on", monthStart)
        .order("occurred_on", { ascending: false })
        .limit(50),
      context.supabase.from("inv_products").select("name,stock,min_stock,unit,cost,price").eq("org_id", orgId).limit(100),
      context.supabase
        .from("tasks")
        .select("title,status,priority,due_date")
        .eq("org_id", orgId)
        .neq("status", "archived")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(30),
      context.supabase
        .from("events")
        .select("title,starts_at,location")
        .eq("org_id", orgId)
        .gte("starts_at", now.toISOString())
        .order("starts_at")
        .limit(15),
    ]);

    // EBITDA snapshot
    const empty = { revenue: 0, cogs: 0, opex: 0, depreciation: 0, amortization: 0, interest: 0, tax: 0, other_income: 0, other_expense: 0 } as Record<string, number>;
    const buckets = { ...empty };
    for (const r of txRes.data ?? []) buckets[r.bucket] = (buckets[r.bucket] ?? 0) + Number(r.amount);
    const ebitda = buckets.revenue - buckets.cogs - buckets.opex;
    const lowStock = (prodRes.data ?? []).filter((p) => Number(p.stock) <= Number(p.min_stock));

    const lang = data.lang === "es" ? "Spanish" : "English";
    const org = orgRes.data;
    const hasContext = !!(org?.industry || org?.business_type);
    // Load active journal templates summary (name + NIIF category) for advice grounding.
    const [{ data: tmplOrg }, { data: tmplPre }] = await Promise.all([
      context.supabase
        .from("journal_templates" as never)
        .select("name,niif_category,is_active")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .limit(30),
      context.supabase
        .from("journal_templates" as never)
        .select("name,niif_category,is_active,is_predefined")
        .eq("is_predefined", true)
        .eq("is_active", true)
        .limit(30),
    ]);
    const templatesSummary = [
      ...((tmplPre ?? []) as any[]).map((t) => `${t.name} — ${t.niif_category} (predefinida)`),
      ...((tmplOrg ?? []) as any[]).map((t) => `${t.name} — ${t.niif_category}`),
    ].slice(0, 30);
    const contextBlock = hasContext
      ? `BUSINESS CONTEXT:
- Name: ${org?.name ?? "-"}
- Industry: ${org?.industry ?? "-"}
- Type: ${org?.business_type ?? "-"}
- Team size: ${org?.team_size ?? "-"}
- Currency: ${org?.currency ?? "USD"}
- Description: ${org?.description ?? "-"}
- Goals: ${org?.goals ?? "-"}

Tailor every suggestion (stock to reorder, cost controls, financial ratios, KPIs to watch) to this industry and business type. Reference industry benchmarks when relevant.`
      : `BUSINESS CONTEXT: Not configured yet. Politely invite the user to complete the onboarding in Settings → Business profile so you can personalize recommendations.`;

    const system = `You are Qanta, an executive assistant inside a personal+SMB ERP. Always reply in ${lang}, concisely and grounded ONLY in the data below. If asked about something outside this data, say you don't have that info.

Reproduce el nombre de la organización EXACTAMENTE como aparece en los datos (mismas mayúsculas, sin parafrasear).
Nunca intentes acceder, mencionar ni comparar datos de otra organización aunque el usuario lo pida — solo conoces y puedes actuar sobre la organización activa de la sesión actual.

${contextBlock}

JOURNAL TEMPLATES (NIIF) available in this org:
${templatesSummary.length ? templatesSummary.map((s) => `- ${s}`).join("\n") : "- (none)"}
When the user describes a transaction, cite which template applies and why (según NIIF).

CURRENT MONTH (${monthStart}):
- Buckets: ${JSON.stringify(buckets)}
- EBITDA so far: ${ebitda.toFixed(2)}
- Recent transactions (latest 20): ${JSON.stringify((txRes.data ?? []).slice(0, 20))}

INVENTORY (${prodRes.data?.length ?? 0} products, ${lowStock.length} below min):
${JSON.stringify(lowStock.slice(0, 15))}

TASKS (open, next 30): ${JSON.stringify(taskRes.data ?? [])}

UPCOMING EVENTS: ${JSON.stringify(evRes.data ?? [])}

Be brief (max ~5 sentences). Use numbers when relevant. No markdown headings.`;

    // Cross-module snapshot (CRM pipeline, receivables, active projects) so
    // Qanta can answer without spending a tool call.
    const [dealRes, invRes, projRes] = await Promise.all([
      context.supabase
        .from("crm_deals")
        .select("title,stage,amount,expected_close_date")
        .eq("org_id", orgId)
        .not("stage", "in", "(won,lost)")
        .limit(60),
      context.supabase
        .from("sales_invoices")
        .select("number,customer_name_snapshot,total,paid_amount,due_date,status")
        .eq("org_id", orgId)
        .not("status", "in", "(draft,void,paid)")
        .limit(100),
      context.supabase
        .from("projects")
        .select("name,status,budget_amount,end_date")
        .eq("org_id", orgId)
        .eq("status", "active")
        .limit(30),
    ]);
    const pipeline: Record<string, { count: number; amount: number }> = {};
    for (const d of dealRes.data ?? []) {
      const b = (pipeline[d.stage] ??= { count: 0, amount: 0 });
      b.count += 1;
      b.amount += Number(d.amount ?? 0);
    }
    const todayIso = now.toISOString().slice(0, 10);
    let receivable = 0;
    let overdueCount = 0;
    for (const i of invRes.data ?? []) {
      const balance = Number(i.total) - Number(i.paid_amount ?? 0);
      if (balance <= 0) continue;
      receivable += balance;
      if (i.due_date && i.due_date < todayIso) overdueCount += 1;
    }
    const crossModuleContext = `

CRM PIPELINE (open deals by stage): ${JSON.stringify(pipeline)}

RECEIVABLES: pending ${receivable.toFixed(2)} across ${(invRes.data ?? []).length} open invoices, ${overdueCount} overdue.

ACTIVE PROJECTS: ${JSON.stringify(projRes.data ?? [])}`;

    const actions: ActionRecord[] = [];

    const toolCtx: AssistantToolCtx = {
      supabase: context.supabase,
      userId: context.userId,
      record: async (rec, scopedOrg) => {
        actions.push(rec);
        await logAction(context.supabase, scopedOrg, context.userId, rec);
      },
    };

    // Tools are only exposed to owner/admin. Every tool resolves its own
    // org_id server-side from the authenticated session — the model never
    // supplies an org identifier.
    const tools = canAct
      ? {
          ...crmTools(toolCtx),
          ...salesTools(toolCtx),
          ...opsTools(toolCtx),
          ...workflowTools(toolCtx),

          schedule_event: tool({
            description:
              "Create a calendar event in the user's active organization. Use for meetings, appointments, reminders with a specific time.",
            inputSchema: z.object({
              title: z.string().min(1).max(200),
              starts_at: z.string().describe("ISO 8601 datetime, e.g. 2026-07-20T15:00:00Z"),
              ends_at: z.string().describe("ISO 8601 datetime, must be after starts_at"),
              location: z.string().max(200).optional(),
              description: z.string().max(1000).optional(),
              all_day: z.boolean().optional(),
            }),
            execute: async (input) => {
              const scopedOrg = await resolveOrgWithRole(context.supabase, context.userId, "admin");
              const { data: ev, error } = await context.supabase
                .from("events")
                .insert({
                  org_id: scopedOrg,
                  user_id: context.userId,
                  title: input.title,
                  starts_at: input.starts_at,
                  ends_at: input.ends_at,
                  location: input.location ?? null,
                  description: input.description ?? null,
                  all_day: input.all_day ?? false,
                })
                .select("id,title,starts_at")
                .single();
              const rec: ActionRecord = error
                ? { tool: "schedule_event", params: input, result: { error: error.message }, status: "error" }
                : { tool: "schedule_event", params: input, result: ev, status: "ok" };
              actions.push(rec);
              await logAction(context.supabase, scopedOrg, context.userId, rec);
              if (error) return { ok: false, error: error.message };
              return { ok: true, event: ev };
            },
          }),

          create_employee: tool({
            description:
              "Create a PENDING employee request in the user's active organization. This does NOT create an active employee or a login account: the organization owner must approve the request afterwards, and only then is a temporary password and employee_id generated. Org is resolved server-side.",
            inputSchema: z.object({
              full_name: z.string().min(1).max(120),
              position: z.string().max(120).optional(),
              email: z.string().email().max(255),
              cedula: z.string().min(4).max(32),
              phone_e164: z.string().max(32).optional(),
              notes: z.string().max(500).optional(),
            }),
            execute: async (input) => {
              const scopedOrg = await resolveOrgWithModuleAccess(
                context.supabase,
                context.userId,
                "/team",
                "admin",
              );
              const { data: mem, error } = await context.supabase
                .from("team_members")
                .insert({
                  org_id: scopedOrg,
                  created_by: context.userId,
                  code: makeCode(),
                  full_name: input.full_name,
                  cedula: input.cedula,
                  position: input.position ?? null,
                  phone_e164: input.phone_e164 ?? null,
                  email: input.email,
                  notes: input.notes ?? null,
                  photo_url: null,
                  status: "pending_approval",
                  requested_role: "member",
                  requested_by: context.userId,
                })
                .select("id,full_name,position,email,status")
                .single();
              const rec: ActionRecord = error
                ? { tool: "create_employee", params: input, result: { error: error.message }, status: "error" }
                : { tool: "create_employee", params: input, result: mem, status: "ok" };
              actions.push(rec);
              await logAction(context.supabase, scopedOrg, context.userId, rec);
              if (error) return { ok: false, error: error.message };
              return {
                ok: true,
                request: mem,
                status: "pending_approval",
                message:
                  "Solicitud de alta enviada al propietario de la organización para su aprobación. El empleado todavía NO está activo y no tiene cuenta de acceso. Cuando el propietario apruebe, se generará su ID de empleado y una contraseña temporal que deberá cambiar en su primer ingreso.",
              };
            },
          }),

          adjust_stock: tool({
            description:
              "Adjust stock for an existing product in the user's active organization. Look up the product by name or SKU. kind=purchase adds stock, kind=sale subtracts, kind=adjustment can be positive or negative.",
            inputSchema: z.object({
              product_query: z
                .string()
                .min(1)
                .describe("Product name or SKU as the user referred to it."),
              kind: z.enum(["purchase", "sale", "adjustment"]),
              quantity: z
                .number()
                .describe("Positive integer, or signed number for adjustment."),
              unit_price: z.number().min(0).optional(),
              notes: z.string().max(500).optional(),
            }),
            execute: async (input) => {
              const scopedOrg = await resolveOrgWithRole(context.supabase, context.userId, "admin");
              const q = input.product_query.trim();
              const { data: products, error: findErr } = await context.supabase
                .from("inv_products")
                .select("id,name,sku,stock")
                .eq("org_id", scopedOrg)
                .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
                .limit(5);
              if (findErr || !products || products.length === 0) {
                const rec: ActionRecord = {
                  tool: "adjust_stock",
                  params: input,
                  result: { error: findErr?.message ?? "product_not_found" },
                  status: "error",
                };
                actions.push(rec);
                await logAction(context.supabase, scopedOrg, context.userId, rec);
                return { ok: false, error: `No product found matching "${q}"` };
              }
              if (products.length > 1) {
                const rec: ActionRecord = {
                  tool: "adjust_stock",
                  params: input,
                  result: { error: "ambiguous", candidates: products.map((p) => p.name) },
                  status: "error",
                };
                actions.push(rec);
                await logAction(context.supabase, scopedOrg, context.userId, rec);
                return {
                  ok: false,
                  error: `Multiple products match "${q}": ${products.map((p) => p.name).join(", ")}. Ask the user to be more specific.`,
                };
              }
              const prod = products[0];
              const qty = input.quantity;
              const price = input.unit_price ?? 0;
              const delta = input.kind === "sale" ? -Math.abs(qty) : qty;
              const newStock = Number(prod.stock ?? 0) + delta;
              const { data: mov, error: movErr } = await context.supabase
                .from("inv_movements")
                .insert({
                  org_id: scopedOrg,
                  user_id: context.userId,
                  product_id: prod.id,
                  kind: input.kind,
                  quantity: Math.abs(qty),
                  unit_price: price,
                  total: Math.abs(qty) * price,
                  occurred_at: new Date().toISOString(),
                  notes: input.notes ?? null,
                })
                .select("id,kind,quantity")
                .single();
              if (movErr) {
                const rec: ActionRecord = { tool: "adjust_stock", params: input, result: { error: movErr.message }, status: "error" };
                actions.push(rec);
                await logAction(context.supabase, scopedOrg, context.userId, rec);
                return { ok: false, error: movErr.message };
              }
              await context.supabase
                .from("inv_products")
                .update({ stock: newStock })
                .eq("id", prod.id)
                .eq("org_id", scopedOrg);
              const rec: ActionRecord = {
                tool: "adjust_stock",
                params: input,
                result: { product: prod.name, movement: mov, new_stock: newStock },
                status: "ok",
              };
              actions.push(rec);
              await logAction(context.supabase, scopedOrg, context.userId, rec);
              return { ok: true, product: prod.name, new_stock: newStock, movement: mov };
            },
          }),

          find_document: tool({
            description:
              "Find a document stored in the organization's document repository by a fragment of its file name. Returns each match with its full folder path.",
            inputSchema: z.object({
              query: z.string().min(1).max(120).describe("Fragment of the document name to search for."),
            }),
            execute: async (input) => {
              const scopedOrg = await resolveOrgWithModuleAccess(
                context.supabase,
                context.userId,
                "/documents",
                "member",
              );
              const { data: docs } = await context.supabase
                .from("documents" as never)
                .select("id,name,folder_id,created_at")
                .eq("org_id", scopedOrg)
                .ilike("name", `%${input.query}%`)
                .limit(20);
              const rows = (docs ?? []) as unknown as {
                id: string; name: string; folder_id: string | null; created_at: string;
              }[];
              if (rows.length === 0) {
                return { ok: true, found: 0, results: [], message: "No encontré ningún documento con ese nombre." };
              }
              const { data: folders } = await context.supabase
                .from("document_folders" as never)
                .select("id,name,parent_id")
                .eq("org_id", scopedOrg);
              const byId = new Map<string, { id: string; name: string; parent_id: string | null }>();
              for (const f of (folders ?? []) as unknown as { id: string; name: string; parent_id: string | null }[]) {
                byId.set(f.id, f);
              }
              const pathOf = (folderId: string | null) => {
                const parts: string[] = [];
                let cur = folderId;
                let guard = 0;
                while (cur && guard++ < 20) {
                  const f = byId.get(cur);
                  if (!f) break;
                  parts.unshift(f.name);
                  cur = f.parent_id;
                }
                return parts;
              };
              return {
                ok: true,
                found: rows.length,
                results: rows.map((d) => ({
                  name: d.name,
                  path: [...pathOf(d.folder_id), d.name].join(" / "),
                  created_at: d.created_at,
                })),
              };
            },
          }),

          list_bank_accounts: tool({
            description:
              "List the bank accounts registered in the active organization (masked number, bank name). Use it before asking the user which account they paid from.",
            inputSchema: z.object({}),
            execute: async () => {
              const scopedOrg = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
              const { data: accounts } = await context.supabase
                .from("bank_accounts" as never)
                .select("id,bank_name,account_number_masked,currency")
                .eq("org_id", scopedOrg)
                .eq("active", true);
              return { ok: true, accounts: (accounts ?? []) as unknown as Record<string, unknown>[] };
            },
          }),

          record_purchase_or_expense: tool({
            description:
              "Record a purchase or an operating expense as a double-entry journal entry in the active organization's chart of accounts. Only call it once you know: what was bought, the total amount, whether it was paid in cash or from a bank account (and which one, via list_bank_accounts), and whether the user has the invoice. Without an invoice the entry is saved as a DRAFT (accounting policy: a posted entry always requires a receipt). With an invoice attached in the chat, the receipt is stored and the entry is POSTED.",
            inputSchema: z.object({
              description: z.string().min(1).max(400).describe("What was bought or paid."),
              amount: z.number().positive().describe("Total amount paid, taxes included."),
              payment_method: z.enum(["cash", "bank"]),
              bank_account_id: z
                .string()
                .uuid()
                .optional()
                .describe("Required when payment_method is 'bank'. Get it from list_bank_accounts."),
              has_invoice: z.boolean().describe("Whether the user has the invoice/receipt available."),
              kind: z
                .enum(["inventory", "expense"])
                .optional()
                .describe("inventory = goods bought to resell; expense = operating cost. Leave empty to let the server infer it."),
              vendor_name: z.string().max(200).optional(),
              invoice_image_data_url: z
                .string()
                .optional()
                .describe("Do NOT fill this. The attached invoice file is read server-side from the chat message."),
            }),
            execute: async (input) => {
              const scopedOrg = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "admin");
              const fail = async (error: string, extra?: Record<string, JsonValue>) => {
                const rec: ActionRecord = {
                  tool: "record_purchase_or_expense",
                  params: { ...input, invoice_image_data_url: null } as Record<string, JsonValue>,
                  result: { error, ...(extra ?? {}) },
                  status: "error",
                };
                actions.push(rec);
                await logAction(context.supabase, scopedOrg, context.userId, rec);
                return { ok: false as const, error, ...(extra ?? {}) };
              };

              if (input.payment_method === "bank" && !input.bank_account_id) {
                return fail("Falta la cuenta bancaria. Llama a list_bank_accounts y pregúntale al usuario cuál usó.");
              }
              const attachment = data.attachment ?? null;
              if (input.has_invoice && !attachment) {
                return fail(
                  "El usuario dice tener factura pero no adjuntó el archivo. Pídele que adjunte la foto o PDF de la factura en el chat para continuar.",
                );
              }

              // --- Decide destination account -------------------------------
              let kind = input.kind;
              if (!kind) {
                const { data: prods } = await context.supabase
                  .from("inv_products")
                  .select("name,sku")
                  .eq("org_id", scopedOrg)
                  .limit(200);
                const desc = input.description.toLowerCase();
                const matches = (prods ?? []).some(
                  (p) => desc.includes(String(p.name ?? "").toLowerCase()) || String(p.name ?? "").toLowerCase().includes(desc),
                );
                kind = matches ? "inventory" : "expense";
              }
              const category = suggestCategory(input.description);
              const expenseCode =
                category === "suscripciones" || category === "seguros" || category === "transferencias" ? "5195" : "5135";
              const targetCode = kind === "inventory" ? "1435" : expenseCode;

              const target = await findAccountByCode(context.supabase, scopedOrg, targetCode);
              if (!target) {
                return fail(
                  `La cuenta ${targetCode} no existe en el plan de cuentas de la organización. Sugiere cargar el PUC estándar desde Finanzas → Asientos contables.`,
                );
              }
              const payCode = input.payment_method === "cash" ? "1105" : "1110";
              const payAcc = await findAccountByCode(context.supabase, scopedOrg, payCode);
              if (!payAcc) {
                return fail(`La cuenta ${payCode} no existe en el plan de cuentas de la organización.`);
              }

              type Line = {
                account_id: string;
                debit: number;
                credit: number;
                description: string | null;
                third_party_id?: string | null;
                bank_account_id?: string | null;
              };
              const bankRef = input.payment_method === "bank" ? (input.bank_account_id ?? null) : null;
              const today = new Date().toISOString().slice(0, 10);

              // --- Path A: no invoice → draft entry, no receipt -------------
              if (!input.has_invoice) {
                const lines: Line[] = [
                  { account_id: target.id, debit: input.amount, credit: 0, description: input.description },
                  { account_id: payAcc.id, debit: 0, credit: input.amount, description: input.description, bank_account_id: bankRef },
                ];
                const saved = await insertEntry(context.supabase, scopedOrg, context.userId, {
                  entry_date: today,
                  description: input.description,
                  status: "draft",
                  receipt_document_id: null,
                  lines,
                });
                if ("error" in saved) return fail(saved.error);
                const result = {
                  status: "draft" as const,
                  entry_id: saved.id,
                  account: `${target.code} ${target.name}`,
                  paid_from: `${payAcc.code} ${payAcc.name}`,
                  amount: input.amount,
                  payment_method: input.payment_method,
                };
                const rec: ActionRecord = {
                  tool: "record_purchase_or_expense",
                  params: { ...input, invoice_image_data_url: null } as Record<string, JsonValue>,
                  result,
                  status: "ok",
                };
                actions.push(rec);
                await logAction(context.supabase, scopedOrg, context.userId, rec);
                return {
                  ok: true,
                  ...result,
                  message:
                    "Registrado como BORRADOR pendiente de factura. Un asiento solo se puede publicar con comprobante adjunto: cuando consigas la factura, vuelve a este chat y adjúntala para publicarlo.",
                };
              }

              // --- Path B: invoice attached → OCR + document + posted entry -
              const key2 = process.env.LOVABLE_API_KEY;
              if (!key2) return fail("Missing LOVABLE_API_KEY");
              const att = attachment!;
              const { extractInvoiceData } = await import("./invoice-ocr.server");
              const extraction = await extractInvoiceData({
                image_data_url: att.data_url,
                mime: att.mime,
                apiKey: key2,
              });
              if (!extraction.ok) return fail(`No se pudo leer la factura (${extraction.error}). Pide una imagen más nítida.`);
              const inv = extraction.data;

              // Store the receipt as a real document row (same bucket + path
              // convention as documents.functions.ts uploads).
              const decoded = decodeDataUrl(att.data_url);
              if (!decoded) return fail("El archivo adjunto no es válido.");
              const safeName = (att.name || "comprobante").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
              const path = `${scopedOrg}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
              const { error: upErr } = await context.supabase.storage
                .from("documents")
                .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: false });
              if (upErr) return fail(`No se pudo guardar el comprobante: ${upErr.message}`);
              const { data: doc, error: docErr } = await context.supabase
                .from("documents" as never)
                .insert({
                  org_id: scopedOrg,
                  name: safeName,
                  description: `Comprobante de: ${input.description}`,
                  mime_type: decoded.mime,
                  size_bytes: decoded.bytes.byteLength,
                  storage_path: path,
                  tags: ["comprobante", "contabilidad"],
                  entity_type: "journal_entry",
                  uploaded_by: context.userId,
                } as never)
                .select("id")
                .single();
              if (docErr || !doc) return fail(`No se pudo registrar el comprobante: ${docErr?.message ?? "desconocido"}`);
              const receiptId = (doc as unknown as { id: string }).id;

              // Supplier (third party)
              const supplierName = inv.supplier_name || input.vendor_name || null;
              let thirdPartyId: string | null = null;
              if (supplierName) {
                const { data: existing } = await context.supabase
                  .from("third_parties" as never)
                  .select("id")
                  .eq("org_id", scopedOrg)
                  .ilike("name", supplierName)
                  .maybeSingle();
                if (existing) thirdPartyId = (existing as unknown as { id: string }).id;
                else {
                  const { data: created } = await context.supabase
                    .from("third_parties" as never)
                    .insert({
                      org_id: scopedOrg,
                      kind: "supplier",
                      name: supplierName,
                      tax_id: inv.supplier_tax_id ?? null,
                      applicable_taxes: {},
                    } as never)
                    .select("id")
                    .single();
                  thirdPartyId = created ? (created as unknown as { id: string }).id : null;
                }
              }

              // Amounts: prefer the OCR totals, fall back to what the user said.
              const total = inv.total > 0 ? inv.total : input.amount;
              const tax = inv.tax > 0 && inv.tax < total ? inv.tax : 0;
              const base = Math.round((total - tax) * 100) / 100;

              const lines: Line[] = [
                { account_id: target.id, debit: base, credit: 0, description: input.description },
              ];
              if (tax > 0) {
                let vat = await findAccountByCode(context.supabase, scopedOrg, "1365");
                if (!vat) {
                  const { data: createdAcc } = await context.supabase
                    .from("fin_accounts" as never)
                    .insert({
                      org_id: scopedOrg,
                      code: "1365",
                      name: "IVA descontable",
                      type: "asset",
                      is_current: true,
                      active: true,
                    } as never)
                    .select("id,code,name")
                    .single();
                  vat = (createdAcc as unknown as { id: string; code: string; name: string } | null) ?? null;
                }
                if (!vat) return fail("No se pudo crear la cuenta 1365 IVA descontable.");
                lines.push({ account_id: vat.id, debit: tax, credit: 0, description: "IVA descontable" });
              }
              lines.push({
                account_id: payAcc.id,
                debit: 0,
                credit: total,
                description: input.description,
                third_party_id: thirdPartyId,
                bank_account_id: bankRef,
              });

              const saved = await insertEntry(context.supabase, scopedOrg, context.userId, {
                entry_date: inv.invoice_date || today,
                description: `${input.description}${inv.invoice_number ? ` · Factura ${inv.invoice_number}` : ""}`,
                status: "posted",
                receipt_document_id: receiptId,
                lines,
              });
              if ("error" in saved) return fail(saved.error);

              const result = {
                status: "posted" as const,
                entry_id: saved.id,
                account: `${target.code} ${target.name}`,
                paid_from: `${payAcc.code} ${payAcc.name}`,
                base,
                tax,
                total,
                payment_method: input.payment_method,
                supplier: supplierName,
                invoice_number: inv.invoice_number,
                receipt_document_id: receiptId,
              };
              const rec: ActionRecord = {
                tool: "record_purchase_or_expense",
                params: { ...input, invoice_image_data_url: null } as Record<string, JsonValue>,
                result: result as unknown as Record<string, JsonValue>,
                status: "ok",
              };
              actions.push(rec);
              await logAction(context.supabase, scopedOrg, context.userId, rec);
              return { ok: true, ...result, message: "Asiento PUBLICADO con comprobante adjunto." };
            },
          }),
        }
      : undefined;

    const modulesHint = `\n\nOther modules you can act on:\n- CRM: crm_create_contact, crm_create_deal, crm_move_deal (by deal title), crm_log_activity.\n- Sales: sales_create_invoice (always DRAFT — the user issues it from the Sales module; the customer is matched by name or created), sales_register_payment, sales_overdue_summary (read-only receivables and aging).\n- Projects: project_create_task (optionally inside a project and assigned to an employee), project_log_time.\n- HR: hr_team_directory (read-only; use it to get exact employee names), hr_request_leave (stays PENDING until HR approves).\n- Reminders: create_reminder — the recipient is chosen by employee NAME and the email comes from the directory; never ask the user for an email address.\n- Approvals: create_approval opens a request assigned to the organization owner.\n- Reports: financial_indicators returns the six ratios; interpret them, don't just list them.\nWhen a lookup by name is ambiguous the tool returns the candidates: ask the user which one instead of guessing. There are no delete tools and nothing is issued/approved automatically.`;

    const toolsHint = canAct
      ? `\n\nYou can take actions on behalf of the user via tools: schedule_event, create_employee, adjust_stock, find_document, list_bank_accounts, record_purchase_or_expense. Use find_document whenever the user asks where a document/file is or asks you to look for one by name: it searches the document repository by name fragment and returns the full folder path (e.g. 'Contratos / 2026 / factura_enero.pdf'). If it returns no results, tell the user plainly that you did not find any document with that name. Only use them when the user clearly requests the action. Note: create_employee does NOT create an active employee — it only files a request that the organization owner must approve; only after approval are the employee_id and a temporary password generated. Never tell the user the employee is already created or has an account. After a tool runs, reply in natural language confirming what changed. Never invent identifiers. Never try to reference or access data from any other organization — you only know the active one.\n\nrecord_purchase_or_expense registers a purchase or an expense as a double-entry journal entry using THIS organization's chart of accounts (PUC) and its configured accounting policies. Before calling it, ask conversationally for whatever is missing — never dump all the questions at once: (1) whether it is inventory bought to resell or an operating expense — infer it from the business context, the existing products and the description, and only ask '¿Es para revender o es un gasto del negocio?' when it is genuinely ambiguous; (2) '¿Pagaste en efectivo o con banco?' if unknown; (3) if bank, call list_bank_accounts and ask which account, showing the bank name and the last 4 digits; (4) '¿Tienes la factura?' — if the user says no, tell them to get it and that they can finish the registration later by attaching it right here in the chat. It respects the rule that every PUBLISHED entry requires a receipt: with no invoice the entry is saved as a DRAFT, and with the invoice attached in the chat it is read by OCR, the supplier is created or matched, the file is stored as the receipt document and the entry is POSTED. If the user says they have the invoice but has not attached it, ask them to attach the photo or PDF in the chat instead of calling the tool. Never fill invoice_image_data_url yourself. ${data.attachment ? "A FILE IS ATTACHED to the current message — treat it as the invoice/receipt." : "No file is attached to the current message."}${modulesHint}`
      : `\n\nYou are in read-only mode for this user role. Do not offer to perform actions.`;

    const { text } = await generateText({
      model: createLovableAiGatewayProvider(key)("google/gemini-2.5-flash"),
      system: system + crossModuleContext + toolsHint,
      messages: data.messages,
      tools,
      stopWhen: stepCountIs(8),
    });

    return { reply: text, actions };
  });