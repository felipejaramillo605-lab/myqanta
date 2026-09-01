import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Shared double-entry aggregation primitives.
 *
 * The journal (`fin_journal_entries` + `fin_journal_lines`) is the single source
 * of truth for every financial report. Everything in this module reads POSTED
 * lines only and applies the same sign convention used by
 * `computeFinancialIndicators`:
 *   asset / expense  -> debit - credit
 *   liability / equity / income -> credit - debit
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type AccountMeta = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  is_current: boolean | null;
  parent_id: string | null;
  requires_third_party?: boolean;
};

export type PostedLine = {
  id: string;
  entry_id: string;
  entry_no: number | null;
  entry_date: string;
  account_id: string;
  account: AccountMeta | null;
  third_party_id: string | null;
  cost_center_id: string | null;
  description: string | null;
  debit: number;
  credit: number;
};

/** Natural balance of a line for the given account type. */
export function signedBalance(type: AccountType, debit: number, credit: number): number {
  if (type === "asset" || type === "expense") return debit - credit;
  return credit - debit;
}

export async function fetchAccountsMap(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<Map<string, AccountMeta>> {
  const { data, error } = await supabase
    .from("fin_accounts" as never)
    .select("id, code, name, type, is_current, parent_id, requires_third_party")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as unknown as AccountMeta[]).map((a) => [a.id, a]));
}

/** POSTED journal lines of an org, optionally bounded by entry_date. */
export async function fetchPostedLines(
  supabase: SupabaseClient<Database>,
  orgId: string,
  opts: { from?: string | null; to?: string | null; accountId?: string | null } = {},
): Promise<PostedLine[]> {
  let q = supabase
    .from("fin_journal_lines" as never)
    .select(
      "id, entry_id, account_id, third_party_id, cost_center_id, debit, credit, description, fin_journal_entries!inner(entry_no, entry_date, status)",
    )
    .eq("org_id", orgId)
    .eq("fin_journal_entries.status", "posted");
  if (opts.from) q = q.gte("fin_journal_entries.entry_date", opts.from);
  if (opts.to) q = q.lte("fin_journal_entries.entry_date", opts.to);
  if (opts.accountId) q = q.eq("account_id", opts.accountId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const accounts = await fetchAccountsMap(supabase, orgId);
  return ((data ?? []) as any[]).map((l) => {
    const e = Array.isArray(l.fin_journal_entries) ? l.fin_journal_entries[0] : l.fin_journal_entries;
    return {
      id: String(l.id),
      entry_id: String(l.entry_id),
      entry_no: e?.entry_no ?? null,
      entry_date: e?.entry_date ?? "",
      account_id: String(l.account_id),
      account: accounts.get(String(l.account_id)) ?? null,
      third_party_id: l.third_party_id ?? null,
      cost_center_id: l.cost_center_id ?? null,
      description: l.description ?? null,
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
    } satisfies PostedLine;
  });
}

// -------------------- P&L bucket classification --------------------

export type PnlBuckets = {
  revenue: number;
  other_income: number;
  cogs: number;
  opex: number;
  depreciation: number;
  amortization: number;
  interest: number;
  tax: number;
  other_expense: number;
};

export type PnlTotals = PnlBuckets & {
  costs: number;
  ebitda: number;
  net: number;
  margin: number;
};

export function emptyPnl(): PnlBuckets {
  return {
    revenue: 0, other_income: 0, cogs: 0, opex: 0,
    depreciation: 0, amortization: 0, interest: 0, tax: 0, other_expense: 0,
  };
}

/** Maps a PUC account to the EBITDA bucket it belongs to (Colombian PUC codes). */
export function bucketForAccount(acc: { type: AccountType; code: string }): keyof PnlBuckets | null {
  const code = String(acc.code ?? "");
  if (acc.type === "income") return code.startsWith("42") ? "other_income" : "revenue";
  if (acc.type !== "expense") return null;
  if (code.startsWith("6") || code.startsWith("7")) return "cogs";
  if (code.startsWith("5160") || code.startsWith("5260")) return "depreciation";
  if (code.startsWith("5165") || code.startsWith("5265")) return "amortization";
  if (code.startsWith("5305") || code.startsWith("5405")) return "interest";
  if (code.startsWith("5115") || code.startsWith("5215") || code.startsWith("54")) return "tax";
  if (code.startsWith("53")) return "other_expense";
  return "opex";
}

/** Aggregates posted lines into EBITDA buckets. */
export function aggregatePnl(lines: PostedLine[]): PnlBuckets {
  const out = emptyPnl();
  for (const l of lines) {
    const acc = l.account;
    if (!acc) continue;
    const bucket = bucketForAccount(acc);
    if (!bucket) continue;
    out[bucket] += signedBalance(acc.type, l.debit, l.credit);
  }
  return out;
}

export function pnlTotals(b: PnlBuckets): PnlTotals {
  const costs = b.cogs + b.opex;
  const ebitda = b.revenue - costs;
  const net =
    ebitda - b.depreciation - b.amortization - b.interest - b.tax + b.other_income - b.other_expense;
  return { ...b, costs, ebitda, net, margin: b.revenue ? (ebitda / b.revenue) * 100 : 0 };
}

// -------------------- date helpers --------------------

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const monthStartOf = (d: Date) => iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
export const monthEndOf = (d: Date) => iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
