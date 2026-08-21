import { z } from "zod";
import { tool } from "ai";
import { resolveOrgWithModuleAccess } from "../permissions";
import { ambiguous, audited, resolveOne, type AssistantToolCtx } from "./context.server";

export function opsTools(ctx: AssistantToolCtx) {
  return {
    project_create_task: tool({
      description:
        "Create a task in the active organization, optionally inside a project (matched by name) and assigned to an employee (matched by name).",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        due_date: z.string().optional().describe("ISO date or datetime."),
        project_query: z.string().max(160).optional().describe("Project name as the user said it."),
        assignee_query: z.string().max(160).optional().describe("Employee full name to assign the task to."),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/projects", "admin");
        return audited(ctx, "project_create_task", input, orgId, async () => {
          let projectId: string | null = null;
          if (input.project_query) {
            const { data } = await ctx.supabase
              .from("projects")
              .select("id,name,status")
              .eq("org_id", orgId)
              .ilike("name", `%${input.project_query}%`)
              .limit(5);
            const m = resolveOne(data, (p) => `${p.name} (${p.status})`);
            if (m.kind === "none") return { ok: false as const, error: `Proyecto no encontrado: "${input.project_query}".` };
            if (m.kind === "many") return { ok: false as const, error: ambiguous(input.project_query, m.labels) };
            projectId = m.row.id;
          }
          let assignedTo: string | null = null;
          let assigneeName: string | null = null;
          if (input.assignee_query) {
            const { data } = await ctx.supabase
              .from("team_members")
              .select("id,full_name,user_id,position")
              .eq("org_id", orgId)
              .eq("archived", false)
              .ilike("full_name", `%${input.assignee_query}%`)
              .limit(5);
            const m = resolveOne(data, (t) => `${t.full_name}${t.position ? ` — ${t.position}` : ""}`);
            if (m.kind === "none") return { ok: false as const, error: `Empleado no encontrado: "${input.assignee_query}".` };
            if (m.kind === "many") return { ok: false as const, error: ambiguous(input.assignee_query, m.labels) };
            if (!m.row.user_id) {
              return {
                ok: false as const,
                error: `${m.row.full_name} todavía no tiene cuenta de acceso, así que no se le puede asignar la tarea.`,
              };
            }
            assignedTo = m.row.user_id;
            assigneeName = m.row.full_name;
          }
          const { data: task, error } = await ctx.supabase
            .from("tasks")
            .insert({
              org_id: orgId,
              user_id: ctx.userId,
              title: input.title,
              description: input.description ?? null,
              priority: input.priority,
              due_date: input.due_date ?? null,
              project_id: projectId,
              assigned_to: assignedTo,
            })
            .select("id,title,status,priority,due_date")
            .single();
          if (error || !task) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { task, assignee: assigneeName } };
        });
      },
    }),

    project_log_time: tool({
      description: "Log worked hours on a project (matched by name) for the signed-in user.",
      inputSchema: z.object({
        project_query: z.string().min(1).max(160),
        hours: z.number().positive().max(24),
        entry_date: z.string().optional().describe("ISO date YYYY-MM-DD; defaults to today."),
        billable: z.boolean().default(true),
        note: z.string().max(400).optional(),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/projects", "member");
        return audited(ctx, "project_log_time", input, orgId, async () => {
          const { data } = await ctx.supabase
            .from("projects")
            .select("id,name,status")
            .eq("org_id", orgId)
            .ilike("name", `%${input.project_query}%`)
            .limit(5);
          const m = resolveOne(data, (p) => `${p.name} (${p.status})`);
          if (m.kind === "none") return { ok: false as const, error: `Proyecto no encontrado: "${input.project_query}".` };
          if (m.kind === "many") return { ok: false as const, error: ambiguous(input.project_query, m.labels) };
          const { data: entry, error } = await ctx.supabase
            .from("time_entries")
            .insert({
              org_id: orgId,
              project_id: m.row.id,
              user_id: ctx.userId,
              hours: input.hours,
              entry_date: input.entry_date ?? new Date().toISOString().slice(0, 10),
              billable: input.billable,
              note: input.note ?? null,
            })
            .select("id,hours,entry_date,billable")
            .single();
          if (error || !entry) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { project: m.row.name, entry } };
        });
      },
    }),

    hr_request_leave: tool({
      description:
        "File a PENDING leave request for an employee (matched by name). It is not approved automatically: HR must approve it in the RRHH module.",
      inputSchema: z.object({
        employee_query: z.string().min(1).max(160),
        kind: z.enum(["vacation", "sick", "permission", "unpaid"]),
        start_date: z.string().describe("ISO date YYYY-MM-DD"),
        end_date: z.string().describe("ISO date YYYY-MM-DD"),
        reason: z.string().max(500).optional(),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/hr", "admin");
        return audited(ctx, "hr_request_leave", input, orgId, async () => {
          const { data } = await ctx.supabase
            .from("team_members")
            .select("id,full_name,position,vacation_days_available")
            .eq("org_id", orgId)
            .eq("archived", false)
            .ilike("full_name", `%${input.employee_query}%`)
            .limit(5);
          const m = resolveOne(data, (t) => `${t.full_name}${t.position ? ` — ${t.position}` : ""}`);
          if (m.kind === "none") return { ok: false as const, error: `Empleado no encontrado: "${input.employee_query}".` };
          if (m.kind === "many") return { ok: false as const, error: ambiguous(input.employee_query, m.labels) };
          const start = new Date(input.start_date);
          const end = new Date(input.end_date);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            return { ok: false as const, error: "Rango de fechas inválido." };
          }
          const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
          const { data: leave, error } = await ctx.supabase
            .from("hr_leaves")
            .insert({
              org_id: orgId,
              member_id: m.row.id,
              created_by: ctx.userId,
              kind: input.kind,
              start_date: input.start_date,
              end_date: input.end_date,
              days,
              status: "pending",
              reason: input.reason ?? null,
            })
            .select("id,kind,start_date,end_date,days,status")
            .single();
          if (error || !leave) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return {
            ok: true as const,
            result: {
              employee: m.row.full_name,
              leave,
              vacation_days_available: m.row.vacation_days_available ?? null,
              status: "pending",
            },
          };
        });
      },
    }),

    hr_team_directory: tool({
      description:
        "Read-only: active employee directory of the organization (name, position, employee id, email, status). Use it before assigning tasks, leaves or reminders to a person.",
      inputSchema: z.object({
        query: z.string().max(160).optional().describe("Optional name filter."),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/hr", "member");
        let q = ctx.supabase
          .from("team_members")
          .select("full_name,position,employee_id,email,status,phone_e164")
          .eq("org_id", orgId)
          .eq("archived", false);
        if (input.query) q = q.ilike("full_name", `%${input.query}%`);
        const { data } = await q.order("full_name").limit(100);
        return { ok: true, count: (data ?? []).length, members: data ?? [] };
      },
    }),
  };
}
