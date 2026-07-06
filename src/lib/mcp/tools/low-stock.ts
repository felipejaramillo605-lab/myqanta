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
  name: "low_stock_products",
  title: "Low stock products",
  description: "List inventory products at or below their minimum stock level.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = sb(ctx);
    const { data, error } = await supabase.from("inv_products").select("id,name,stock,min_stock,unit,cost,price").limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const low = (data ?? []).filter((p) => Number(p.stock) <= Number(p.min_stock));
    return {
      content: [{ type: "text", text: JSON.stringify(low) }],
      structuredContent: { products: low },
    };
  },
});