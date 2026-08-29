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

    create_draft_journal_entry: tool({
      description:
        "Create a DRAFT journal entry (never posted) in the org's books from a described operation or from an attached financial statement (Excel/Markdown). Every line must reference an EXISTING account code of the org's PUC — call niif_lookup/suggest_journal_entry first if unsure. The entry must be balanced (total debit = total credit). The user reviews and posts it from Finanzas → Asientos contables.",
      inputSchema: z.object({
        entry_date: z.string().describe("Fecha del asiento en formato YYYY-MM-DD."),
        description: z.string().min(3).max(300),
        lines: z
          .array(
            z.object({
              account_code: z.string().min(1).max(20),
              debit: z.number().min(0).default(0),
              credit: z.number().min(0).default(0),
              description: z.string().max(200).optional(),
            }),
          )
          .min(2)
          .max(40),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/finance/journal", "admin");
        return audited(ctx, "create_draft_journal_entry", input as never, orgId, async () => {
          const totalD = input.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
          const totalC = input.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
          if (Math.abs(totalD - totalC) > 0.01) {
            return {
              ok: false as const,
              error: `El asiento no cuadra: débitos ${totalD.toFixed(2)} vs créditos ${totalC.toFixed(2)}. Corrige las líneas antes de crearlo.`,
            };
          }
          const codes = [...new Set(input.lines.map((l) => l.account_code))];
          const { data: accounts, error: accErr } = await ctx.supabase
            .from("fin_accounts" as never)
            .select("id,code,name")
            .eq("org_id", orgId)
            .in("code", codes);
          if (accErr) return { ok: false as const, error: `No pude leer el plan de cuentas: ${accErr.message}` };
          const map = new Map(
            ((accounts ?? []) as Array<{ id: string; code: string; name: string }>).map((a) => [a.code, a]),
          );
          const missing = codes.filter((c) => !map.has(c));
          if (missing.length) {
            return {
              ok: false as const,
              error: `Estas cuentas no existen en tu PUC: ${missing.join(", ")}. Créalas en Finanzas → Plan de cuentas (o dime qué cuentas equivalentes usar) y lo intento de nuevo.`,
            };
          }
          const { data: nRes, error: nErr } = await (
            ctx.supabase.rpc as never as (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }>
          )("next_journal_entry_no", { _org_id: orgId });
          if (nErr) return { ok: false as const, error: `No pude reservar el número de asiento: ${nErr.message}` };
          const { data: ins, error: insErr } = await ctx.supabase
            .from("fin_journal_entries" as never)
            .insert({
              org_id: orgId,
              entry_no: nRes as number,
              entry_date: input.entry_date,
              description: input.description,
              status: "draft",
              created_by: ctx.userId,
            } as never)
            .select("id,entry_no")
            .single();
          if (insErr || !ins) {
            return { ok: false as const, error: `No pude crear el asiento borrador: ${insErr?.message ?? "error desconocido"}` };
          }
          const entry = ins as unknown as { id: string; entry_no: number };
          const { error: lErr } = await ctx.supabase.from("fin_journal_lines" as never).insert(
            input.lines.map((l) => ({
              entry_id: entry.id,
              org_id: orgId,
              account_id: map.get(l.account_code)!.id,
              debit: Number(l.debit || 0),
              credit: Number(l.credit || 0),
              description: l.description ?? null,
            })) as never,
          );
          if (lErr) return { ok: false as const, error: `No pude guardar las líneas: ${lErr.message}` };
          return {
            ok: true as const,
            result: {
              status: "draft",
              entry_id: entry.id,
              entry_no: entry.entry_no,
              entry_date: input.entry_date,
              total: totalD,
              lines: input.lines.map((l) => ({
                account: `${l.account_code} ${map.get(l.account_code)!.name}`,
                debit: Number(l.debit || 0),
                credit: Number(l.credit || 0),
              })),
              message: "Asiento creado como BORRADOR. Revísalo y publícalo en Finanzas → Asientos contables.",
            },
          };
        });
      },
    }),
  };
}
