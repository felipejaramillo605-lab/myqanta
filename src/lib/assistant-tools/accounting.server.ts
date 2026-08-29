import { z } from "zod";
import { tool } from "ai";
import { resolveOrgWithModuleAccess } from "../permissions";
import { audited, type AssistantToolCtx } from "./context.server";
import { matchNiifRules, NIIF_RULES } from "../niif-knowledge";

/**
 * Herramientas contables de Qanta. Solo PROPONEN asientos (nunca persisten):
 * el usuario confirma y registra en /finance/journal.
 */

/** Naturaleza estándar del PUC colombiano según el primer dígito del código. */
function natureForCode(code: string): "debit" | "credit" {
  const g = code.trim()[0];
  return g === "1" || g === "5" || g === "6" || g === "7" || g === "8" ? "debit" : "credit";
}

/** Clasificación contable a partir del código PUC (con la naturaleza como respaldo). */
function typeForCode(
  code: string,
  nature?: "debit" | "credit",
): "asset" | "liability" | "equity" | "income" | "expense" {
  switch (code.trim()[0]) {
    case "1":
      return "asset";
    case "2":
      return "liability";
    case "3":
      return "equity";
    case "4":
      return "income";
    case "5":
    case "6":
    case "7":
      return "expense";
    default:
      return nature === "credit" ? "income" : "expense";
  }
}

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

    check_missing_accounts_and_parties: tool({
      description:
        "Read-only pre-validation before creating a journal entry from a file or description: given the referenced PUC account codes (with the name you would give them) and supplier/third-party names, returns which ones DO NOT exist yet in the org. Always call this BEFORE create_draft_journal_entry when the data comes from an attached file. If something is missing, show the user the list and ASK for confirmation before calling create_puc_accounts / create_third_parties.",
      inputSchema: z.object({
        accounts: z
          .array(
            z.object({
              code: z.string().min(1).max(20),
              name: z.string().min(2).max(160).describe("Nombre sugerido para la cuenta si hay que crearla."),
              nature: z.enum(["debit", "credit"]).optional(),
            }),
          )
          .max(60)
          .default([]),
        suppliers: z
          .array(z.object({ name: z.string().min(2).max(200), tax_id: z.string().max(40).optional() }))
          .max(40)
          .default([]),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/finance/journal", "member");
        return audited(ctx, "check_missing_accounts_and_parties", input as never, orgId, async () => {
          const codes = [...new Set(input.accounts.map((a) => a.code))];
          const existingCodes = new Set<string>();
          if (codes.length) {
            const { data, error } = await ctx.supabase
              .from("fin_accounts" as never)
              .select("code")
              .eq("org_id", orgId)
              .in("code", codes);
            if (error) return { ok: false as const, error: `No pude leer el plan de cuentas: ${error.message}` };
            for (const a of (data ?? []) as Array<{ code: string }>) existingCodes.add(a.code);
          }
          const { data: parties, error: pErr } = await ctx.supabase
            .from("third_parties" as never)
            .select("name,tax_id")
            .eq("org_id", orgId);
          if (pErr) return { ok: false as const, error: `No pude leer los terceros: ${pErr.message}` };
          const rows = (parties ?? []) as Array<{ name: string; tax_id: string | null }>;
          const missingSuppliers = input.suppliers.filter(
            (s) =>
              !rows.some(
                (r) =>
                  r.name.trim().toLowerCase() === s.name.trim().toLowerCase() ||
                  (!!s.tax_id && !!r.tax_id && r.tax_id.replace(/\D/g, "") === s.tax_id.replace(/\D/g, "")),
              ),
          );
          const missingAccounts = input.accounts
            .filter((a) => !existingCodes.has(a.code))
            .map((a) => ({ code: a.code, name: a.name, nature: a.nature ?? natureForCode(a.code) }));
          return {
            ok: true as const,
            result: {
              missing_accounts: missingAccounts,
              missing_suppliers: missingSuppliers.map((s) => ({ name: s.name, tax_id: s.tax_id ?? null })),
              needs_confirmation: missingAccounts.length > 0 || missingSuppliers.length > 0,
              message:
                missingAccounts.length || missingSuppliers.length
                  ? "Faltan elementos: muéstralos al usuario y pregunta si desea crearlos ahora (Sí, crear todas / No, cancelar)."
                  : "Todo existe: puedes continuar con create_draft_journal_entry.",
            },
          };
        });
      },
    }),

    create_puc_accounts: tool({
      description:
        "Create one or more accounts in the org's chart of accounts (PUC). ONLY call after the user explicitly confirmed creating them (set confirmed=true). Existing codes are skipped, not duplicated. After it succeeds, retry create_draft_journal_entry with the same data.",
      inputSchema: z.object({
        confirmed: z.boolean().describe("Debe ser true: el usuario confirmó explícitamente crear las cuentas."),
        accounts: z
          .array(
            z.object({
              code: z.string().min(1).max(20),
              name: z.string().min(2).max(160),
              nature: z.enum(["debit", "credit"]).optional(),
            }),
          )
          .min(1)
          .max(60),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/finance", "admin");
        return audited(ctx, "create_puc_accounts", input as never, orgId, async () => {
          if (!input.confirmed) {
            return {
              ok: false as const,
              error: "Necesito la confirmación explícita del usuario antes de crear cuentas en el PUC.",
            };
          }
          const codes = [...new Set(input.accounts.map((a) => a.code))];
          const { data: existing, error: exErr } = await ctx.supabase
            .from("fin_accounts" as never)
            .select("code")
            .eq("org_id", orgId)
            .in("code", codes);
          if (exErr) return { ok: false as const, error: `No pude leer el plan de cuentas: ${exErr.message}` };
          const have = new Set(((existing ?? []) as Array<{ code: string }>).map((a) => a.code));
          const toCreate = input.accounts.filter((a) => !have.has(a.code));
          if (!toCreate.length) {
            return { ok: true as const, result: { created: [], skipped: [...have], message: "Todas las cuentas ya existían." } };
          }
          const { data: ins, error: insErr } = await ctx.supabase
            .from("fin_accounts" as never)
            .insert(
              toCreate.map((a) => ({
                org_id: orgId,
                code: a.code,
                name: a.name,
                type: typeForCode(a.code, a.nature),
                active: true,
              })) as never,
            )
            .select("id,code,name,type");
          if (insErr) return { ok: false as const, error: `No pude crear las cuentas: ${insErr.message}` };
          return {
            ok: true as const,
            result: {
              created: (ins ?? []) as never,
              skipped: [...have],
              message: "Cuentas creadas en el PUC. Ahora reintento el asiento con los mismos datos.",
            },
          };
        });
      },
    }),

    create_third_parties: tool({
      description:
        "Create one or more suppliers/customers (third parties) in the org. ONLY call after the user explicitly confirmed (confirmed=true). Existing names/NIT are skipped. After it succeeds, retry the pending operation.",
      inputSchema: z.object({
        confirmed: z.boolean().describe("Debe ser true: el usuario confirmó explícitamente crear los terceros."),
        parties: z
          .array(
            z.object({
              name: z.string().min(2).max(200),
              tax_id: z.string().max(40).optional(),
              kind: z.enum(["supplier", "customer", "both"]).default("supplier"),
              email: z.string().email().max(200).optional(),
              phone: z.string().max(60).optional(),
            }),
          )
          .min(1)
          .max(40),
      }),
      execute: async (input) => {
        const orgId = await resolveOrgWithModuleAccess(ctx.supabase, ctx.userId, "/finance", "admin");
        return audited(ctx, "create_third_parties", input as never, orgId, async () => {
          if (!input.confirmed) {
            return {
              ok: false as const,
              error: "Necesito la confirmación explícita del usuario antes de crear proveedores.",
            };
          }
          const { data: parties, error: pErr } = await ctx.supabase
            .from("third_parties" as never)
            .select("name,tax_id")
            .eq("org_id", orgId);
          if (pErr) return { ok: false as const, error: `No pude leer los terceros: ${pErr.message}` };
          const rows = (parties ?? []) as Array<{ name: string; tax_id: string | null }>;
          const toCreate = input.parties.filter(
            (s) =>
              !rows.some(
                (r) =>
                  r.name.trim().toLowerCase() === s.name.trim().toLowerCase() ||
                  (!!s.tax_id && !!r.tax_id && r.tax_id.replace(/\D/g, "") === s.tax_id.replace(/\D/g, "")),
              ),
          );
          if (!toCreate.length) {
            return { ok: true as const, result: { created: [], message: "Todos los terceros ya existían." } };
          }
          const { data: ins, error: insErr } = await ctx.supabase
            .from("third_parties" as never)
            .insert(
              toCreate.map((s) => ({
                org_id: orgId,
                kind: s.kind,
                name: s.name,
                tax_id: s.tax_id ?? null,
                email: s.email ?? null,
                phone: s.phone ?? null,
                applicable_taxes: {},
              })) as never,
            )
            .select("id,name,tax_id,kind");
          if (insErr) return { ok: false as const, error: `No pude crear los terceros: ${insErr.message}` };
          return {
            ok: true as const,
            result: { created: (ins ?? []) as never, message: "Terceros creados. Reintento la operación pendiente." },
          };
        });
      },
    }),

    create_draft_journal_entry: tool({
      description:
        "Create a DRAFT journal entry (never posted) in the org's books from a described operation or from an attached financial statement (Excel/Markdown). Every line must reference an EXISTING account code of the org's PUC — call check_missing_accounts_and_parties first when the data comes from a file. The entry must be balanced (total debit = total credit). If accounts are missing, this tool returns them in missing_accounts: ask the user for confirmation, call create_puc_accounts and then retry this tool with the same data.",
      inputSchema: z.object({
        entry_date: z.string().describe("Fecha del asiento en formato YYYY-MM-DD."),
        description: z.string().min(3).max(300),
        lines: z
          .array(
            z.object({
              account_code: z.string().min(1).max(20),
              account_name: z
                .string()
                .max(160)
                .optional()
                .describe("Nombre de la cuenta según el archivo: se usa si hay que crearla."),
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
            const detail = missing.map((code) => {
              const line = input.lines.find((l) => l.account_code === code);
              const name = line?.account_name?.trim() || line?.description?.trim() || `Cuenta ${code}`;
              return {
                code,
                name,
                nature: (Number(line?.debit || 0) > 0 ? "debit" : "credit") as "debit" | "credit",
              };
            });
            return {
              ok: false as const,
              error: `Estas cuentas no existen en tu PUC: ${detail.map((d) => `${d.code} - ${d.name}`).join(", ")}. Pregunta al usuario si desea crearlas ahora; si acepta, usa create_puc_accounts con confirmed=true y luego reintenta este asiento con los mismos datos.`,
              extra: { missing_accounts: detail, needs_confirmation: true },
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
