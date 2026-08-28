import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { convertToOrgCurrency, getExchangeRate, getOrgCurrency } from "./fx-rates.server";

type Client = SupabaseClient<Database>;

export type FxResult = {
  applied: boolean;
  base_currency?: string;
  tx_currency?: string;
  rate_at_date?: number;
  rate_latest?: number;
  rate_date?: string;
  difference?: number;
  entry_id?: string;
  warning?: string;
};

async function findAccount(supabase: Client, orgId: string, prefix: string) {
  const { data } = await supabase
    .from("fin_accounts" as never)
    .select("id, code, name")
    .eq("org_id", orgId)
    .like("code", `${prefix}%`)
    .order("code")
    .limit(1);
  const row = (data ?? [])[0] as any;
  return row ?? null;
}

/**
 * Computes the FX gain/loss of a foreign-currency bank movement between the
 * transaction date rate and the latest rate, and (when the PUC accounts exist)
 * records a draft journal entry:
 *   loss  -> debit 5305 (gasto financiero, diferencia en cambio)
 *   gain  -> credit 4210 (ingreso, diferencia en cambio)
 * counterpart: bank account in the PUC (11xx).
 * Never throws: any failure is returned as a warning so the movement is kept.
 */
export async function recordFxDifferenceForBankTx(
  supabase: Client,
  orgId: string,
  tx: { id: string; bank_account_id: string; occurred_on: string; amount: number; description?: string | null },
): Promise<FxResult> {
  try {
    const { data: acct } = await supabase
      .from("bank_accounts" as never)
      .select("currency, bank_name")
      .eq("id", tx.bank_account_id)
      .eq("org_id", orgId)
      .maybeSingle();
    const txCurrency = ((acct as any)?.currency ?? "").trim().toUpperCase();
    const base = await getOrgCurrency(supabase, orgId);
    if (!txCurrency || txCurrency === base) return { applied: false };

    const atDate = await getExchangeRate(txCurrency, base, tx.occurred_on, supabase);
    const latest = await getExchangeRate(txCurrency, base, undefined, supabase);
    const difference = Math.round(tx.amount * (latest.rate - atDate.rate) * 100) / 100;

    const common = {
      applied: false as boolean,
      base_currency: base,
      tx_currency: txCurrency,
      rate_at_date: atDate.rate,
      rate_latest: latest.rate,
      rate_date: atDate.rate_date,
      difference,
    };
    if (Math.abs(difference) < 0.01) return common;

    const isGain = difference > 0;
    const fxAccount = await findAccount(supabase, orgId, isGain ? "4210" : "5305");
    const bankAccount = await findAccount(supabase, orgId, "1110");
    if (!fxAccount || !bankAccount) {
      const missing = [!fxAccount ? (isGain ? "4210" : "5305") : null, !bankAccount ? "1110" : null]
        .filter(Boolean)
        .join(", ");
      return {
        ...common,
        warning: `Diferencia en cambio calculada pero no contabilizada: faltan cuentas PUC ${missing}.`,
      };
    }

    const { data: nRes } = await (supabase.rpc as any)("next_journal_entry_no", { _org_id: orgId });
    const { data: ins, error } = await supabase
      .from("fin_journal_entries" as never)
      .insert({
        org_id: orgId,
        entry_no: (nRes as number) ?? 1,
        entry_date: new Date().toISOString().slice(0, 10),
        description: `Diferencia en cambio · ${(acct as any)?.bank_name ?? ""} ${txCurrency}/${base}`,
        status: "draft",
      } as never)
      .select()
      .single();
    if (error) return { ...common, warning: error.message };

    const entryId = (ins as any).id as string;
    const abs = Math.abs(difference);
    const lines = isGain
      ? [
          { account_id: bankAccount.id, debit: abs, credit: 0 },
          { account_id: fxAccount.id, debit: 0, credit: abs },
        ]
      : [
          { account_id: fxAccount.id, debit: abs, credit: 0 },
          { account_id: bankAccount.id, debit: 0, credit: abs },
        ];
    const { error: lErr } = await supabase.from("fin_journal_lines" as never).insert(
      lines.map((l) => ({
        entry_id: entryId,
        org_id: orgId,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        description: `Ajuste FX mov. bancario ${tx.occurred_on}`,
        bank_account_id: tx.bank_account_id,
      })) as never,
    );
    if (lErr) return { ...common, warning: lErr.message };
    return { ...common, applied: true, entry_id: entryId };
  } catch (e: any) {
    return { applied: false, warning: e?.message ?? "No se pudo calcular la diferencia en cambio" };
  }
}

/** Bank balances converted to the org base currency (best effort per account). */
export async function bankBalancesInBaseCurrency(supabase: Client, orgId: string) {
  const base = await getOrgCurrency(supabase, orgId);
  const { data } = await supabase
    .from("bank_accounts" as never)
    .select("id, currency, current_balance")
    .eq("org_id", orgId);
  const rows = (data ?? []) as any[];
  const out: Record<string, { converted: number; rate: number; rate_date: string; base_currency: string } | null> = {};
  for (const r of rows) {
    const cur = (r.currency ?? "").trim().toUpperCase();
    if (!cur || cur === base) {
      out[r.id] = null;
      continue;
    }
    try {
      const c = await convertToOrgCurrency(supabase, orgId, Number(r.current_balance ?? 0), cur);
      out[r.id] = { converted: c.converted, rate: c.rate, rate_date: c.rate_date, base_currency: c.to };
    } catch {
      out[r.id] = null;
    }
  }
  return { base_currency: base, accounts: out };
}
