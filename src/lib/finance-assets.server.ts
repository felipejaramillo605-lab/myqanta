import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SB = SupabaseClient<Database>;

export type FixedAsset = {
  id: string;
  name: string;
  category: string | null;
  acquisition_date: string;
  cost: number;
  residual_value: number;
  useful_life_months: number;
  method: string;
  status: string;
  asset_account_id: string | null;
  depreciation_expense_account_id: string | null;
  accumulated_depreciation_account_id: string | null;
  notes: string | null;
};

export function monthlyDepreciation(a: {
  cost: number;
  residual_value: number;
  useful_life_months: number;
}): number {
  const base = Number(a.cost || 0) - Number(a.residual_value || 0);
  const life = Math.max(Number(a.useful_life_months || 0), 1);
  if (base <= 0) return 0;
  return base / life;
}

/** First day of the month for a YYYY-MM-DD date string. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

/** Number of monthly periods already elapsed for an asset at `period` (inclusive). */
export function periodsElapsed(acquisitionDate: string, period: string): number {
  return monthIndex(period.slice(0, 7)) - monthIndex(acquisitionDate.slice(0, 7)) + 1;
}

export type DepreciationRunResult = {
  period: string;
  posted: { asset: string; amount: number; entry_id: string | null }[];
  skipped: { asset: string; reason: string }[];
  total: number;
};

/**
 * Straight-line (NIC 16) monthly depreciation for every active asset of the org.
 * Creates one DRAFT journal entry per asset (expense debit / accumulated credit)
 * when both accounts are configured; otherwise records the schedule row only.
 */
export async function runMonthlyDepreciation(
  supabase: SB,
  orgId: string,
  userId: string,
  period: string,
): Promise<DepreciationRunResult> {
  const periodMonth = monthStart(period);
  const out: DepreciationRunResult = { period: periodMonth, posted: [], skipped: [], total: 0 };

  const { data: assets, error } = await supabase
    .from("fin_fixed_assets" as never)
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "active");
  if (error) throw new Error(error.message);

  const { data: existing } = await supabase
    .from("fin_depreciation_entries" as never)
    .select("asset_id")
    .eq("org_id", orgId)
    .eq("period_month", periodMonth);
  const done = new Set(((existing ?? []) as any[]).map((r) => r.asset_id as string));

  for (const raw of (assets ?? []) as any[]) {
    const a = raw as FixedAsset;
    if (done.has(a.id)) {
      out.skipped.push({ asset: a.name, reason: "ya depreciado en el periodo" });
      continue;
    }
    const elapsed = periodsElapsed(a.acquisition_date, periodMonth);
    if (elapsed <= 0) {
      out.skipped.push({ asset: a.name, reason: "aún no adquirido" });
      continue;
    }
    if (elapsed > Number(a.useful_life_months || 0)) {
      out.skipped.push({ asset: a.name, reason: "vida útil terminada" });
      continue;
    }
    const amount = Math.round(monthlyDepreciation(a) * 100) / 100;
    if (amount <= 0) {
      out.skipped.push({ asset: a.name, reason: "depreciación cero" });
      continue;
    }

    let entryId: string | null = null;
    if (a.depreciation_expense_account_id && a.accumulated_depreciation_account_id) {
      const { data: nRes, error: nErr } = await (supabase.rpc as any)("next_journal_entry_no", { _org_id: orgId });
      if (nErr) throw new Error(nErr.message);
      const { data: ins, error: eErr } = await supabase
        .from("fin_journal_entries" as never)
        .insert({
          org_id: orgId,
          entry_no: nRes as number,
          entry_date: periodMonth,
          description: `Depreciación ${a.name} (${periodMonth.slice(0, 7)})`,
          status: "draft",
          created_by: userId,
        } as never)
        .select()
        .single();
      if (eErr) throw new Error(eErr.message);
      entryId = (ins as any).id as string;
      const { error: lErr } = await supabase.from("fin_journal_lines" as never).insert([
        {
          entry_id: entryId,
          org_id: orgId,
          account_id: a.depreciation_expense_account_id,
          debit: amount,
          credit: 0,
          description: `Depreciación ${a.name}`,
        },
        {
          entry_id: entryId,
          org_id: orgId,
          account_id: a.accumulated_depreciation_account_id,
          debit: 0,
          credit: amount,
          description: `Depreciación acumulada ${a.name}`,
        },
      ] as never);
      if (lErr) throw new Error(lErr.message);
    } else {
      out.skipped.push({ asset: a.name, reason: "sin cuentas contables: solo se registró el cálculo" });
    }

    const { error: dErr } = await supabase.from("fin_depreciation_entries" as never).insert({
      org_id: orgId,
      asset_id: a.id,
      period_month: periodMonth,
      amount,
      journal_entry_id: entryId,
    } as never);
    if (dErr) throw new Error(dErr.message);

    out.posted.push({ asset: a.name, amount, entry_id: entryId });
    out.total += amount;
  }
  return out;
}

// -------------------- posted-lines helpers --------------------

type LineRow = {
  debit: number;
  credit: number;
  third_party_id: string | null;
  cost_center_id: string | null;
  fin_accounts: any;
  fin_journal_entries: any;
};

async function fetchPostedLines(supabase: SB, orgId: string, to?: string): Promise<LineRow[]> {
  let q = supabase
    .from("fin_journal_lines" as never)
    .select(
      "debit, credit, third_party_id, cost_center_id, account_id, fin_accounts!inner(code, type, is_current, name), fin_journal_entries!inner(entry_date, status)",
    )
    .eq("org_id", orgId)
    .eq("fin_journal_entries.status", "posted");
  if (to) q = q.lte("fin_journal_entries.entry_date", to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((l) => ({
    ...l,
    fin_accounts: Array.isArray(l.fin_accounts) ? l.fin_accounts[0] : l.fin_accounts,
    fin_journal_entries: Array.isArray(l.fin_journal_entries) ? l.fin_journal_entries[0] : l.fin_journal_entries,
  })) as LineRow[];
}

export type IndirectCashFlow = {
  from: string;
  to: string;
  net_income: number;
  depreciation: number;
  working_capital_change: number;
  operating: number;
  cash_start: number;
  cash_end: number;
  cash_change: number;
  investing_financing: number;
};

/** Indirect-method cash flow statement for a period, from posted journal lines. */
export async function indirectCashFlow(
  supabase: SB,
  orgId: string,
  from: string,
  to: string,
): Promise<IndirectCashFlow> {
  const lines = await fetchPostedLines(supabase, orgId, to);
  const inPeriod = (d: string) => d >= from && d <= to;
  const isCash = (code: string) => code.startsWith("11");

  let income = 0, expense = 0;
  let cashStart = 0, cashEnd = 0;
  let wcAssetsStart = 0, wcAssetsEnd = 0;
  let wcLiabStart = 0, wcLiabEnd = 0;
  let depreciation = 0;

  for (const l of lines) {
    const acc = l.fin_accounts;
    if (!acc) continue;
    const date = String(l.fin_journal_entries?.entry_date ?? "");
    const debit = Number(l.debit ?? 0);
    const credit = Number(l.credit ?? 0);
    const code = String(acc.code ?? "");
    const before = date < from;

    if (acc.type === "income" && inPeriod(date)) income += credit - debit;
    if (acc.type === "expense" && inPeriod(date)) expense += debit - credit;

    if (acc.type === "asset" && isCash(code)) {
      const bal = debit - credit;
      if (before) cashStart += bal;
      cashEnd += bal;
    } else if (acc.type === "asset" && acc.is_current === true) {
      const bal = debit - credit;
      if (before) wcAssetsStart += bal;
      wcAssetsEnd += bal;
    } else if (acc.type === "liability" && acc.is_current === true) {
      const bal = credit - debit;
      if (before) wcLiabStart += bal;
      wcLiabEnd += bal;
    }
  }

  const { data: dep } = await supabase
    .from("fin_depreciation_entries" as never)
    .select("amount, period_month")
    .eq("org_id", orgId)
    .gte("period_month", monthStart(from))
    .lte("period_month", to);
  for (const d of (dep ?? []) as any[]) depreciation += Number(d.amount ?? 0);

  const netIncome = income - expense;
  const wcChange = -(wcAssetsEnd - wcAssetsStart) + (wcLiabEnd - wcLiabStart);
  const operating = netIncome + depreciation + wcChange;
  const cashChange = cashEnd - cashStart;

  return {
    from,
    to,
    net_income: netIncome,
    depreciation,
    working_capital_change: wcChange,
    operating,
    cash_start: cashStart,
    cash_end: cashEnd,
    cash_change: cashChange,
    investing_financing: cashChange - operating,
  };
}

export type BudgetVsActualRow = {
  account_id: string;
  code: string;
  name: string;
  type: string;
  budget: number;
  actual: number;
  variance: number;
  variance_pct: number | null;
};

/** Budget vs. actual for a year (optionally a single month and/or cost center). */
export async function budgetVsActual(
  supabase: SB,
  orgId: string,
  year: number,
  month?: number | null,
  costCenterId?: string | null,
): Promise<{ rows: BudgetVsActualRow[]; totals: { budget: number; actual: number; variance: number } }> {
  const from = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
  const to = month
    ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    : `${year}-12-31`;

  let bq = supabase
    .from("fin_budgets" as never)
    .select("amount, account_id, month, cost_center_id, fin_accounts!inner(code, name, type)")
    .eq("org_id", orgId)
    .eq("year", year);
  if (month) bq = bq.eq("month", month);
  if (costCenterId) bq = bq.eq("cost_center_id", costCenterId);
  const { data: budgets, error: bErr } = await bq;
  if (bErr) throw new Error(bErr.message);

  const map = new Map<string, BudgetVsActualRow>();
  const ensure = (id: string, acc: any) => {
    let row = map.get(id);
    if (!row) {
      row = {
        account_id: id,
        code: String(acc?.code ?? ""),
        name: String(acc?.name ?? ""),
        type: String(acc?.type ?? ""),
        budget: 0,
        actual: 0,
        variance: 0,
        variance_pct: null,
      };
      map.set(id, row);
    }
    return row;
  };

  for (const b of (budgets ?? []) as any[]) {
    const acc = Array.isArray(b.fin_accounts) ? b.fin_accounts[0] : b.fin_accounts;
    ensure(b.account_id as string, acc).budget += Number(b.amount ?? 0);
  }

  let lq = supabase
    .from("fin_journal_lines" as never)
    .select("debit, credit, account_id, cost_center_id, fin_accounts!inner(code, name, type), fin_journal_entries!inner(entry_date, status)")
    .eq("org_id", orgId)
    .eq("fin_journal_entries.status", "posted")
    .gte("fin_journal_entries.entry_date", from)
    .lte("fin_journal_entries.entry_date", to);
  if (costCenterId) lq = lq.eq("cost_center_id", costCenterId);
  const { data: lines, error: lErr } = await lq;
  if (lErr) throw new Error(lErr.message);

  for (const l of (lines ?? []) as any[]) {
    const acc = Array.isArray(l.fin_accounts) ? l.fin_accounts[0] : l.fin_accounts;
    if (!acc) continue;
    if (acc.type !== "income" && acc.type !== "expense") continue;
    const debit = Number(l.debit ?? 0);
    const credit = Number(l.credit ?? 0);
    const row = ensure(l.account_id as string, acc);
    row.actual += acc.type === "income" ? credit - debit : debit - credit;
  }

  const rows = [...map.values()].map((r) => {
    r.variance = r.actual - r.budget;
    r.variance_pct = r.budget === 0 ? null : (r.variance / Math.abs(r.budget)) * 100;
    return r;
  }).sort((a, b) => a.code.localeCompare(b.code));

  const totals = rows.reduce(
    (s, r) => ({ budget: s.budget + r.budget, actual: s.actual + r.actual, variance: s.variance + r.variance }),
    { budget: 0, actual: 0, variance: 0 },
  );
  return { rows, totals };
}

export type AgingRow = {
  third_party_id: string;
  name: string;
  kind: string;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
};

/**
 * Aging 30/60/90/90+ per third party, from posted journal lines on receivable
 * (asset codes 13xx) and payable (liability codes 22xx/23xx) accounts.
 */
export async function partyAging(
  supabase: SB,
  orgId: string,
  asOf: string,
): Promise<{ as_of: string; receivables: AgingRow[]; payables: AgingRow[] }> {
  const { data: parties, error: pErr } = await supabase
    .from("third_parties" as never)
    .select("id, name, kind")
    .eq("org_id", orgId);
  if (pErr) throw new Error(pErr.message);
  const names = new Map<string, { name: string; kind: string }>();
  for (const p of (parties ?? []) as any[]) names.set(p.id as string, { name: p.name, kind: p.kind });

  const lines = await fetchPostedLines(supabase, orgId, asOf);
  const asOfMs = Date.parse(asOf);

  const buckets = new Map<string, { rec: AgingRow; pay: AgingRow }>();
  const blank = (id: string, kind: string): AgingRow => ({
    third_party_id: id,
    name: names.get(id)?.name ?? "Sin tercero",
    kind,
    d0_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90_plus: 0,
    total: 0,
  });

  for (const l of lines) {
    const acc = l.fin_accounts;
    if (!acc || !l.third_party_id) continue;
    const code = String(acc.code ?? "");
    const isRec = acc.type === "asset" && code.startsWith("13");
    const isPay = acc.type === "liability" && (code.startsWith("22") || code.startsWith("23"));
    if (!isRec && !isPay) continue;

    const debit = Number(l.debit ?? 0);
    const credit = Number(l.credit ?? 0);
    const amount = isRec ? debit - credit : credit - debit;
    if (!amount) continue;

    const date = String(l.fin_journal_entries?.entry_date ?? asOf);
    const days = Math.max(Math.floor((asOfMs - Date.parse(date)) / 86400000), 0);

    let pair = buckets.get(l.third_party_id);
    if (!pair) {
      pair = { rec: blank(l.third_party_id, "customer"), pay: blank(l.third_party_id, "supplier") };
      buckets.set(l.third_party_id, pair);
    }
    const row = isRec ? pair.rec : pair.pay;
    if (days <= 30) row.d0_30 += amount;
    else if (days <= 60) row.d31_60 += amount;
    else if (days <= 90) row.d61_90 += amount;
    else row.d90_plus += amount;
    row.total += amount;
  }

  const nonZero = (r: AgingRow) => Math.abs(r.total) > 0.009;
  return {
    as_of: asOf,
    receivables: [...buckets.values()].map((b) => b.rec).filter(nonZero).sort((a, b) => b.total - a.total),
    payables: [...buckets.values()].map((b) => b.pay).filter(nonZero).sort((a, b) => b.total - a.total),
  };
}
