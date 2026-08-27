import { z } from "zod";
import { tool } from "ai";
import { resolveOrgWithModuleAccess } from "../permissions";
import { audited, type AssistantToolCtx } from "./context.server";
import { matchNiifRules, NIIF_RULES } from "../niif-knowledge";

/**
 * Herramientas contables de Qanta. Solo PROPONEN asientos (nunca persisten):
 * el usuario confirma y registra en /finance/journal.
 */
export function accountingTools(ctx: AssistantToolCtx) {
  return {
    suggest_journal_entry: tool({
      description:
        "SUGGEST (never record) a journal entry for a described operation, citing the applicable NIIF/IFRS standard and matching the org's chart of accounts (PUC). Use when the user describes a transaction like 'compré un computador a crédito' or 'vendí servicios con IVA'.",
      inputSchema: z.object({
        description: z.string().min(3).max(500).describe("La operación como la describe el usuario."),
        amount: z.number().positive().optional().describe("Monto base de la operación, si el usuario lo dio."),
        vat_rate: z.number().min(0).max(1).optional().describe("Tarifa de IVA (p. ej. 0.19). Por defecto 0.19 si aplica."),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/finance/journal", "member");
        return audited(ctx, "suggest_journal_entry", input, orgId, async () => {
          const rules = matchNiifRules(input.description);
          const matched = rules.length ? rules : [];
          // Cargar el plan de cuentas de la org para validar códigos sugeridos.
          const { data: accounts } = await ctx.supabase
            .from("fin_accounts" as never)
            .select("id,code,name")
            .eq("org_id", orgId)
            .limit(500);
          const chart = new Map(
            ((accounts ?? []) as Array<{ id: string; code: string; name: string }>).map((a) => [a.code, a]),
          );

          const suggestions = matched.map((rule) => {
            const lines = rule.example.lines.map((l) => {
              const acc = chart.get(l.account);
              const scale = input.amount ? input.amount / 1000000 : 1;
              return {
                account_code: l.account,
                account_name: acc?.name ?? rule.accounts[l.account] ?? "(cuenta no existe en tu PUC — créala primero)",
                exists_in_chart: !!acc,
                debit: l.debit ? Math.round(l.debit * scale) : 0,
                credit: l.credit ? Math.round(l.credit * scale) : 0,
              };
            });
            return {
              standard: `${rule.code} — ${rule.name}`,
              rationale: rule.summary,
              example_scenario: rule.example.description,
              lines,
              balanced:
                lines.reduce((s, l) => s + l.debit, 0) === lines.reduce((s, l) => s + l.credit, 0),
            };
          });

          return {
            ok: true as const,
            result: {
              disclaimer:
                "Propuesta orientativa basada en NIIF para pymes. NO está registrada: revísala con tu contador y créala en Finanzas → Asientos contables.",
              matched_standards: matched.map((r) => `${r.code} ${r.name}`),
              ...(matched.length
                ? {}
                : { available_standards: NIIF_RULES.map((r) => `${r.code} ${r.name}`) }),
              suggestions,
            },
          };
        });
      },
    }),

    niif_lookup: tool({
      description:
        "Read-only: look up an IFRS/NIIF standard summary (recognition rule, typical PUC accounts, example entry) by code or topic. Use to answer accounting-treatment questions.",
      inputSchema: z.object({
        query: z.string().min(2).max(120).describe("Código (NIC 2, NIIF 15…) o tema (inventarios, nómina, arriendo…)."),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/finance/journal", "member");
        return audited(ctx, "niif_lookup", input, orgId, async () => {
          const q = input.query.toLowerCase();
          const byCode = NIIF_RULES.filter((r) => r.code.toLowerCase().includes(q));
          const byTopic = byCode.length ? [] : matchNiifRules(input.query);
          const rules = byCode.length ? byCode : byTopic;
          if (!rules.length) {
            return {
              ok: false as const,
              error: `No encontré una norma para "${input.query}". Disponibles: ${NIIF_RULES.map((r) => r.code).join(", ")}.`,
            };
          }
          return {
            ok: true as const,
            result: {
              standards: rules.map((r) => ({
                code: r.code,
                name: r.name,
                summary: r.summary,
                typical_accounts: r.accounts,
                example: r.example,
              })),
            },
          };
        });
      },
    }),
  };
}
