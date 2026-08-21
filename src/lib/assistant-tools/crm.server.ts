import { z } from "zod";
import { tool } from "ai";
import { resolveOrgWithModuleAccess } from "../permissions";
import { ambiguous, audited, resolveOne, type AssistantToolCtx } from "./context.server";

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export function crmTools(ctx: AssistantToolCtx) {
  const scope = (min: "member" | "admin") =>
    resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/crm", min);

  return {
    crm_create_contact: tool({
      description:
        "Create a CRM contact (lead) in the active organization. Use when the user mentions a new prospect, client or person to follow up.",
      inputSchema: z.object({
        name: z.string().min(1).max(160),
        company: z.string().max(160).optional(),
        email: z.string().email().max(255).optional(),
        phone: z.string().max(40).optional(),
        title: z.string().max(120).optional().describe("Job title of the contact."),
        source: z.string().max(80).optional().describe("Where the lead came from."),
        notes: z.string().max(1000).optional(),
      }),
      execute: async (input) => {
        const orgId = await scope("admin");
        return audited(ctx, "crm_create_contact", input, orgId, async () => {
          const { data, error } = await ctx.supabase
            .from("crm_contacts")
            .insert({
              org_id: orgId,
              created_by: ctx.userId,
              name: input.name,
              company: input.company ?? null,
              email: input.email ?? null,
              phone: input.phone ?? null,
              title: input.title ?? null,
              source: input.source ?? null,
              notes: input.notes ?? null,
            })
            .select("id,name,company,email")
            .single();
          if (error || !data) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { contact: data } };
        });
      },
    }),

    crm_create_deal: tool({
      description:
        "Create a CRM deal / opportunity in the active organization. Optionally link it to an existing contact by name.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        amount: z.number().min(0).default(0),
        stage: z.enum(STAGES).default("lead"),
        contact_query: z.string().max(160).optional().describe("Contact name to link, as the user said it."),
        expected_close_date: z.string().optional().describe("ISO date YYYY-MM-DD"),
        probability: z.number().min(0).max(100).optional(),
        notes: z.string().max(1000).optional(),
      }),
      execute: async (input) => {
        const orgId = await scope("admin");
        return audited(ctx, "crm_create_deal", input, orgId, async () => {
          let contactId: string | null = null;
          if (input.contact_query) {
            const { data: cands } = await ctx.supabase
              .from("crm_contacts")
              .select("id,name,company")
              .eq("org_id", orgId)
              .eq("archived", false)
              .ilike("name", `%${input.contact_query}%`)
              .limit(5);
            const m = resolveOne(cands, (c) => `${c.name}${c.company ? ` (${c.company})` : ""}`);
            if (m.kind === "many") {
              return { ok: false as const, error: ambiguous(input.contact_query, m.labels) };
            }
            if (m.kind === "none") {
              return {
                ok: false as const,
                error: `No encontré ningún contacto que coincida con "${input.contact_query}". Puedes crearlo primero con crm_create_contact.`,
              };
            }
            contactId = m.row.id;
          }
          const { data, error } = await ctx.supabase
            .from("crm_deals")
            .insert({
              org_id: orgId,
              created_by: ctx.userId,
              owner_user_id: ctx.userId,
              title: input.title,
              stage: input.stage,
              amount: input.amount,
              contact_id: contactId,
              expected_close_date: input.expected_close_date ?? null,
              ...(input.probability !== undefined ? { probability: input.probability } : {}),
              notes: input.notes ?? null,
            })
            .select("id,title,stage,amount,expected_close_date")
            .single();
          if (error || !data) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { deal: data } };
        });
      },
    }),

    crm_move_deal: tool({
      description:
        "Move an existing CRM deal to another pipeline stage, looking the deal up by a fragment of its title.",
      inputSchema: z.object({
        deal_query: z.string().min(1).max(200),
        stage: z.enum(STAGES),
        lost_reason: z.string().max(400).optional().describe("Only when stage is 'lost'."),
      }),
      execute: async (input) => {
        const orgId = await scope("admin");
        return audited(ctx, "crm_move_deal", input, orgId, async () => {
          const { data: cands } = await ctx.supabase
            .from("crm_deals")
            .select("id,title,stage,amount")
            .eq("org_id", orgId)
            .ilike("title", `%${input.deal_query}%`)
            .limit(5);
          const m = resolveOne(cands, (d) => `${d.title} (${d.stage})`);
          if (m.kind === "none") {
            return { ok: false as const, error: `No encontré ningún negocio que coincida con "${input.deal_query}".` };
          }
          if (m.kind === "many") return { ok: false as const, error: ambiguous(input.deal_query, m.labels) };
          const closed = input.stage === "won" || input.stage === "lost";
          const { data, error } = await ctx.supabase
            .from("crm_deals")
            .update({
              stage: input.stage,
              closed_at: closed ? new Date().toISOString() : null,
              lost_reason: input.stage === "lost" ? (input.lost_reason ?? null) : null,
            })
            .eq("id", m.row.id)
            .eq("org_id", orgId)
            .select("id,title,stage,amount")
            .single();
          if (error || !data) return { ok: false as const, error: error?.message ?? "update_failed" };
          return { ok: true as const, result: { deal: data, previous_stage: m.row.stage } };
        });
      },
    }),

    crm_log_activity: tool({
      description:
        "Log a CRM activity (note, call, email, meeting or task) against a contact or a deal, found by name fragment.",
      inputSchema: z.object({
        kind: z.enum(["note", "call", "email", "meeting", "task"]),
        subject: z.string().max(200).optional(),
        body: z.string().max(2000).optional(),
        contact_query: z.string().max(160).optional(),
        deal_query: z.string().max(200).optional(),
        occurred_at: z.string().optional().describe("ISO datetime; defaults to now."),
      }),
      execute: async (input) => {
        const orgId = await scope("admin");
        return audited(ctx, "crm_log_activity", input, orgId, async () => {
          if (!input.contact_query && !input.deal_query) {
            return { ok: false as const, error: "Indica el contacto o el negocio al que pertenece la actividad." };
          }
          let contactId: string | null = null;
          let dealId: string | null = null;
          if (input.contact_query) {
            const { data } = await ctx.supabase
              .from("crm_contacts")
              .select("id,name,company")
              .eq("org_id", orgId)
              .ilike("name", `%${input.contact_query}%`)
              .limit(5);
            const m = resolveOne(data, (c) => `${c.name}${c.company ? ` (${c.company})` : ""}`);
            if (m.kind === "none") return { ok: false as const, error: `Contacto no encontrado: "${input.contact_query}".` };
            if (m.kind === "many") return { ok: false as const, error: ambiguous(input.contact_query, m.labels) };
            contactId = m.row.id;
          }
          if (input.deal_query) {
            const { data } = await ctx.supabase
              .from("crm_deals")
              .select("id,title,stage")
              .eq("org_id", orgId)
              .ilike("title", `%${input.deal_query}%`)
              .limit(5);
            const m = resolveOne(data, (d) => `${d.title} (${d.stage})`);
            if (m.kind === "none") return { ok: false as const, error: `Negocio no encontrado: "${input.deal_query}".` };
            if (m.kind === "many") return { ok: false as const, error: ambiguous(input.deal_query, m.labels) };
            dealId = m.row.id;
          }
          const { data, error } = await ctx.supabase
            .from("crm_activities")
            .insert({
              org_id: orgId,
              created_by: ctx.userId,
              kind: input.kind,
              subject: input.subject ?? null,
              body: input.body ?? null,
              contact_id: contactId,
              deal_id: dealId,
              occurred_at: input.occurred_at ?? new Date().toISOString(),
            })
            .select("id,kind,subject,occurred_at")
            .single();
          if (error || !data) return { ok: false as const, error: error?.message ?? "insert_failed" };
          return { ok: true as const, result: { activity: data } };
        });
      },
    }),
  };
}
