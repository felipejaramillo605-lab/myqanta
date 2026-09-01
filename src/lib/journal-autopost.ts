import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Bridges the fast-capture layer (`finance_transactions`, incl. AI statement
 * imports) into the real double-entry journal.
 *
 * Each captured transaction becomes a DRAFT journal entry (cash/bank account vs.
 * the P&L account mapped from its bucket) so an accountant reviews and posts it.
 * When no mapping is possible we return a reason instead of failing the capture.
 */

const BUCKET_TO_CODE: Record<string, string[]> = {
  revenue: ["4135", "41", "4"],
  other_income: ["4210", "42", "4"],
  cogs: ["6135", "61", "6"],
  opex: ["5195", "5135", "51", "5"],
  depreciation: ["5160", "51", "5"],
  amortization: ["5165", "51", "5"],
  interest: ["5305", "53", "5"],
  tax: ["5115", "51", "5"],
  other_expense: ["5195", "53", "5"],
};

const CASH_CODES = ["1110", "1105", "11"];

const INCOME_BUCKETS = new Set(["revenue", "other_income"]);

export type CapturedTx = {
  occurred_on: string;
  description: string;
  amount: number;
  bucket: string;
};

export type AutopostResult = {
  created: number;
  skipped: number;
  reason?: string;
};

/**
 * Creates one draft journal entry per captured transaction.
 * Never throws: capture flows must keep working even without a complete PUC.
 */
export async function autopostTransactions(
  supabase: SupabaseClient<Database>,
  orgId: string,
  userId: string,
  txs: CapturedTx[],
): Promise<AutopostResult> {
  if (!txs.length) return { created: 0, skipped: 0 };
  try {
    const { data: accounts } = await supabase
      .from("fin_accounts" as never)
      .select("id, code, requires_third_party")
      .eq("org_id", orgId);
    const rows = (accounts ?? []) as unknown as Array<{ id: string; code: string; requires_third_party: boolean }>;
    if (!rows.length) {
      return { created: 0, skipped: txs.length, reason: "NO_CHART_OF_ACCOUNTS" };
    }
    const byCode = new Map(rows.map((a) => [String(a.code), a]));
    const pick = (codes: string[]) => {
      for (const c of codes) {
        const hit = byCode.get(c);
        if (hit && !hit.requires_third_party) return hit.id;
      }
      return null;
    };

    const cashId = pick(CASH_CODES);
    if (!cashId) return { created: 0, skipped: txs.length, reason: "NO_CASH_ACCOUNT" };

    let created = 0;
    let skipped = 0;
    let reason: string | undefined;

    for (const t of txs) {
      const target = pick(BUCKET_TO_CODE[t.bucket] ?? []);
      if (!target) {
        skipped++;
        reason = "NO_ACCOUNT_FOR_BUCKET";
        continue;
      }
      const amount = Math.abs(Number(t.amount) || 0);
      if (!amount) { skipped++; continue; }
      const isIncome = INCOME_BUCKETS.has(t.bucket);

      const { data: nextNo } = await (supabase.rpc as any)("next_journal_entry_no", { _org_id: orgId });
      const { data: entry, error: entryErr } = await supabase
        .from("fin_journal_entries" as never)
        .insert({
          org_id: orgId,
          entry_no: (nextNo as number) ?? null,
          entry_date: t.occurred_on,
          description: `[Captura rápida] ${t.description}`.slice(0, 400),
          status: "draft",
          created_by: userId,
        } as never)
        .select("id")
        .single();
      if (entryErr || !entry) { skipped++; reason = entryErr?.message ?? "ENTRY_INSERT_FAILED"; continue; }

      const entryId = (entry as any).id as string;
      const lines = isIncome
        ? [
            { account_id: cashId, debit: amount, credit: 0 },
            { account_id: target, debit: 0, credit: amount },
          ]
        : [
            { account_id: target, debit: amount, credit: 0 },
            { account_id: cashId, debit: 0, credit: amount },
          ];
      const { error: lineErr } = await supabase.from("fin_journal_lines" as never).insert(
        lines.map((l) => ({
          entry_id: entryId,
          org_id: orgId,
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          description: t.description.slice(0, 400),
        })) as never,
      );
      if (lineErr) {
        await supabase.from("fin_journal_entries" as never).delete().eq("id", entryId).eq("org_id", orgId);
        skipped++;
        reason = lineErr.message;
        continue;
      }
      created++;
    }
    return { created, skipped, reason };
  } catch (e) {
    return { created: 0, skipped: txs.length, reason: e instanceof Error ? e.message : "AUTOPOST_FAILED" };
  }
}
