import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, tool, stepCountIs } from "ai";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole, type OrgRole } from "./permissions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

function slugCode(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "emp";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
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

${contextBlock}

CURRENT MONTH (${monthStart}):
- Buckets: ${JSON.stringify(buckets)}
- EBITDA so far: ${ebitda.toFixed(2)}
- Recent transactions (latest 20): ${JSON.stringify((txRes.data ?? []).slice(0, 20))}

INVENTORY (${prodRes.data?.length ?? 0} products, ${lowStock.length} below min):
${JSON.stringify(lowStock.slice(0, 15))}

TASKS (open, next 30): ${JSON.stringify(taskRes.data ?? [])}

UPCOMING EVENTS: ${JSON.stringify(evRes.data ?? [])}

Be brief (max ~5 sentences). Use numbers when relevant. No markdown headings.`;

    const actions: ActionRecord[] = [];

    // Tools are only exposed to owner/admin. Every tool resolves its own
    // org_id server-side from the authenticated session — the model never
    // supplies an org identifier.
    const tools = canAct
      ? {
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
              "Add a new team member (employee) to the user's active organization. Only the resource fields are accepted — org is resolved server-side.",
            inputSchema: z.object({
              full_name: z.string().min(1).max(120),
              position: z.string().max(120).optional(),
              email: z.string().email().max(255).optional(),
              phone_e164: z.string().max(32).optional(),
              cedula: z.string().max(32).optional(),
              notes: z.string().max(500).optional(),
            }),
            execute: async (input) => {
              const scopedOrg = await resolveOrgWithRole(context.supabase, context.userId, "admin");
              const payload: Record<string, unknown> = {
                org_id: scopedOrg,
                created_by: context.userId,
                code: slugCode(input.full_name),
                full_name: input.full_name,
                position: input.position ?? null,
                email: input.email ?? null,
                phone_e164: input.phone_e164 ?? null,
                notes: input.notes ?? null,
              };
              if (input.cedula) payload.cedula = input.cedula;
              const { data: mem, error } = await context.supabase
                .from("team_members")
                .insert(payload as never)
                .select("id,full_name,position,email")
                .single();
              const rec: ActionRecord = error
                ? { tool: "create_employee", params: input, result: { error: error.message }, status: "error" }
                : { tool: "create_employee", params: input, result: mem, status: "ok" };
              actions.push(rec);
              await logAction(context.supabase, scopedOrg, context.userId, rec);
              if (error) return { ok: false, error: error.message };
              return { ok: true, member: mem };
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
        }
      : undefined;

    const toolsHint = canAct
      ? `\n\nYou can take actions on behalf of the user via tools: schedule_event, create_employee, adjust_stock. Only use them when the user clearly requests the action. After a tool runs, reply in natural language confirming what changed. Never invent identifiers. Never try to reference or access data from any other organization — you only know the active one.`
      : `\n\nYou are in read-only mode for this user role. Do not offer to perform actions.`;

    const { text } = await generateText({
      model: createLovableAiGatewayProvider(key)("google/gemini-2.5-flash"),
      system: system + toolsHint,
      messages: data.messages,
      tools,
      stopWhen: stepCountIs(5),
    });
    return { reply: text, actions };
  });