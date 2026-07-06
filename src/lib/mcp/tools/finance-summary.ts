import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "finance_summary",
  title: "Finance summary",
  description: "Return current-month EBITDA breakdown by bucket for the active organization.",
  inputSchema: {
    month: z.string().optional().describe("Month start ISO YYYY-MM-01. Defaults to current month."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = sb(ctx);
    const now = new Date();
    const start = month ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("finance_transactions")
      .select("amount,bucket")
      .gte("occurred_on", start);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const buckets: Record<string, number> = {};
    for (const r of data ?? []) buckets[r.bucket] = (buckets[r.bucket] ?? 0) + Number(r.amount);
    const ebitda = (buckets.revenue ?? 0) - (buckets.cogs ?? 0) - (buckets.opex ?? 0);
    return {
      content: [{ type: "text", text: JSON.stringify({ month: start, buckets, ebitda }) }],
      structuredContent: { month: start, buckets, ebitda },
    };
  },
});