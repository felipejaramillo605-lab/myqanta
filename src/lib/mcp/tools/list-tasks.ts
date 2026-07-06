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
  name: "list_tasks",
  title: "List tasks",
  description: "List open tasks for the signed-in user's active organization.",
  inputSchema: {
    status: z.enum(["todo", "in_progress", "done", "archived"]).optional().describe("Filter by status"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max rows to return"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = sb(ctx);
    let q = supabase.from("tasks").select("id,title,description,status,priority,due_date").order("due_date", { ascending: true, nullsFirst: false }).limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});