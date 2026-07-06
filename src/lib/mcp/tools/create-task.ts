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
  name: "create_task",
  title: "Create task",
  description: "Create a new task in the signed-in user's active organization.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Task title"),
    description: z.string().optional().describe("Optional details"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    due_date: z.string().optional().describe("Due date ISO YYYY-MM-DD"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, description, priority, due_date }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = sb(ctx);
    const { data: prof } = await supabase.from("profiles").select("active_org_id").eq("id", ctx.getUserId()).maybeSingle();
    const orgId = prof?.active_org_id;
    if (!orgId) return { content: [{ type: "text", text: "No active organization" }], isError: true };
    const { data, error } = await supabase
      .from("tasks")
      .insert({ org_id: orgId, title, description: description ?? null, priority, due_date: due_date ?? null, status: "todo", created_by: ctx.getUserId() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Task created: ${data.id}` }], structuredContent: { task: data } };
  },
});