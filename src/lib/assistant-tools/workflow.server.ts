import { z } from "zod";
import { tool } from "ai";
import { resolveOrgWithModuleAccess } from "../permissions";
import { computeFinancialIndicators } from "../financial-indicators";
import { ambiguous, audited, resolveOne, type AssistantToolCtx } from "./context.server";

export function workflowTools(ctx: AssistantToolCtx) {
  return {
    create_reminder: tool({
      description:
        "Schedule a reminder. When an employee is named, the reminder is sent by email to that employee's registered address (the user never provides the address). Use hr_team_directory first if unsure about the name.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(1000),
        scheduled_at: z.string().describe("ISO 8601 datetime in the future."),
        employee_query: z
          .string()
          .max(160)
          .optional()
          .describe("Employee full name. Omit to remind the signed-in user by email."),
        recurrence: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/agenda", "admin");
        return audited(ctx, "create_reminder", input, orgId, async () => {
          const when = new Date(input.scheduled_at);
          if (Number.isNaN(when.getTime())) return { ok: false as const, error: "Fecha/hora inválida." };
          let email: string | null = null;
          let memberId: string | null = null;
          let target = "tú";
          if (input.employee_query) {
            const { data } = await ctx.supabase
              .from("team_members")
              .select("id,full_name,email,position")
              .eq("org_id", orgId)
              .eq("archived", false)
              .ilike("full_name", `%${input.employee_query}%`)
              .limit(5);
            const m = resolveOne(data, (t) => `${t.full_name}${t.position ? ` — ${t.position}` : ""}`);
            if (m.kind === "none") return { ok: false as const, error: `Empleado no encontrado: "${input.employee_query}".` };
            if (m.kind === "many") return { ok: false as const, error: ambiguous(input.employee_query, m.labels) };
            if (!m.row.email) {
              return { ok: false as const, error: `${m.row.full_name} no tiene correo registrado en el directorio.` };
            }
            email = m.row.email;
            memberId = m.row.id;
            target = m.row.full_name;
          } else {
            const { data: self } = await ctx.supabase
              .from("team_members")
              .select("email,full_name")
              .eq("org_id", orgId)
              .eq("user_id", ctx.userId)
              .maybeSingle();
            email = self?.email ?? null;
            if (!email) {
              return {
                ok: false as const,
                error:
                  "No hay correo registrado para enviarte el recordatorio. Indica a qué empleado del directorio debe llegar.",
              };
            }
            target = self?.full_name ?? "tú";
          }

          const { data: rem, error } = await ctx.supabase
            .from("reminders")
            .insert({
              org_id: orgId,
              user_id: ctx.userId,
              source_type: "custom",
              title: input.title,
              message: input.message,
              scheduled_at: when.toISOString(),
              channel: "email",
              email,
              team_member_id: memberId,
              recurrence: input.recurrence,
            })
            .select("id,title,scheduled_at,channel,recurrence,status")
            .single();
          if (error || !rem) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { reminder: rem, recipient: target } };
        });
      },
    }),

    create_approval: tool({
      description:
        "Open an approval request assigned to the organization owner. Use it when the user needs a decision recorded (a purchase, a discount, a hire, a payment).",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        module: z
          .enum(["finance", "inventory", "sales", "hr", "projects", "crm", "other"])
          .default("other")
          .describe("Which module the request belongs to."),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/approvals", "member");
        return audited(ctx, "create_approval", input, orgId, async () => {
          const { data: owner } = await ctx.supabase
            .from("organization_members")
            .select("user_id")
            .eq("org_id", orgId)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();
          const assignee = owner?.user_id ?? ctx.userId;
          const { data: ap, error } = await ctx.supabase
            .from("approvals")
            .insert({
              org_id: orgId,
              module: input.module,
              title: input.title,
              description: input.description ?? null,
              assigned_to: assignee,
              requested_by: ctx.userId,
            })
            .select("id,title,module,status,created_at")
            .single();
          if (error || !ap) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { approval: ap, assigned_to_owner: assignee !== ctx.userId } };
        });
      },
    }),

    financial_indicators: tool({
      description:
        "Read-only: the organization's six financial ratios (razón corriente, prueba ácida, endeudamiento, autonomía, ROI, ROE) plus balance totals, computed from posted journal entries. Use it to interpret financial health.",
      inputSchema: z.object({}),
      execute: async () => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/reports", "member");
        const res = await computeFinancialIndicators(ctx.supabase, orgId);
        return { ok: true, ...res };
      },
    }),
  };
}
