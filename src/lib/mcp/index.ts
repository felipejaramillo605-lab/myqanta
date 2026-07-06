import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasks from "./tools/list-tasks";
import createTask from "./tools/create-task";
import financeSummary from "./tools/finance-summary";
import lowStock from "./tools/low-stock";
import upcomingEvents from "./tools/upcoming-events";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "qanta-mcp",
  title: "Qanta ERP MCP",
  version: "0.1.0",
  instructions:
    "Tools to interact with the signed-in user's Qanta ERP data: tasks, finance, inventory, and agenda events. Each tool acts as the authenticated user under Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTasks, createTask, financeSummary, lowStock, upcomingEvents],
});