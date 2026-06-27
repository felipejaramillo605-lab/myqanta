import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText } from "ai";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

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

    // Build live context
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const [txRes, prodRes, taskRes, evRes] = await Promise.all([
      context.supabase
        .from("finance_transactions")
        .select("amount,bucket,description,occurred_on")
        .gte("occurred_on", monthStart)
        .order("occurred_on", { ascending: false })
        .limit(50),
      context.supabase.from("inv_products").select("name,stock,min_stock,unit,cost,price").limit(100),
      context.supabase
        .from("tasks")
        .select("title,status,priority,due_date")
        .neq("status", "archived")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(30),
      context.supabase
        .from("events")
        .select("title,starts_at,location")
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
    const system = `You are Qanta, an executive assistant inside a personal+SMB ERP. Always reply in ${lang}, concisely and grounded ONLY in the data below. If asked about something outside this data, say you don't have that info.

CURRENT MONTH (${monthStart}):
- Buckets: ${JSON.stringify(buckets)}
- EBITDA so far: ${ebitda.toFixed(2)}
- Recent transactions (latest 20): ${JSON.stringify((txRes.data ?? []).slice(0, 20))}

INVENTORY (${prodRes.data?.length ?? 0} products, ${lowStock.length} below min):
${JSON.stringify(lowStock.slice(0, 15))}

TASKS (open, next 30): ${JSON.stringify(taskRes.data ?? [])}

UPCOMING EVENTS: ${JSON.stringify(evRes.data ?? [])}

Be brief (max ~5 sentences). Use numbers when relevant. No markdown headings.`;

    const { text } = await generateText({
      model: createLovableAiGatewayProvider(key)("google/gemini-2.5-flash"),
      system,
      messages: data.messages,
    });
    return { reply: text };
  });