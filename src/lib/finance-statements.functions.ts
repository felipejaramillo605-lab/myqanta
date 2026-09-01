import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithModuleAccess } from "./permissions";
import {
  aggregatePnl,
  fetchAccountsMap,
  fetchPostedLines,
  pnlTotals,
  signedBalance,
  type AccountType,
  type PnlTotals,
} from "./accounting-core";

/**
 * Phase 3 — Formal financial statements.
 *
 * Every figure here is derived exclusively from POSTED journal lines
 * (`fin_journal_entries` + `fin_journal_lines`), keeping the journal as the
 * single source of truth: chart of accounts -> journal -> ledger ->
 * trial balance -> financial statements.
 */

const RangeInput = z.object({
  from: z.string().min(10),
  to: z.string().min(10),
});

export type TrialBalanceRow = {
  account_id: string;
  code: string;
  name: string;
  type: AccountType;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

export type TrialBalance = {
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  balanced: boolean;
};

/** Balance de comprobación: saldo inicial, movimientos del periodo y saldo final. */
export const getTrialBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d))
  .handler(async ({ context, data }): Promise<TrialBalance> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const [accounts, priorLines, periodLines] = await Promise.all([
      fetchAccountsMap(context.supabase, orgId),
      fetchPostedLines(context.supabase, orgId, { to: shiftDay(data.from, -1) }),
      fetchPostedLines(context.supabase, orgId, { from: data.from, to: data.to }),
    ]);

    const rows = new Map<string, TrialBalanceRow>();
    const rowFor = (accountId: string): TrialBalanceRow | null => {
      const acc = accounts.get(accountId);
      if (!acc) return null;
      let r = rows.get(accountId);
      if (!r) {
        r = {
          account_id: accountId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        };
        rows.set(accountId, r);
      }
      return r;
    };

    for (const l of priorLines) {
      const r = rowFor(l.account_id);
      if (!r) continue;
      r.opening += signedBalance(r.type, l.debit, l.credit);
    }
    for (const l of periodLines) {
      const r = rowFor(l.account_id);
      if (!r) continue;
      r.debit += l.debit;
      r.credit += l.credit;
    }

    let total_debit = 0;
    let total_credit = 0;
    for (const r of rows.values()) {
      r.closing = r.opening + signedBalance(r.type, r.debit, r.credit);
      total_debit += r.debit;
      total_credit += r.credit;
    }

    const list = [...rows.values()]
      .filter((r) => r.opening !== 0 || r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));

    return {
      from: data.from,
      to: data.to,
      rows: list,
      total_debit,
      total_credit,
      balanced: Math.abs(total_debit - total_credit) < 0.01,
    };
  });

export type StatementLine = { code: string; name: string; amount: number };

export type IncomeStatement = {
  from: string;
  to: string;
  revenue: StatementLine[];
  cogs: StatementLine[];
  opex: StatementLine[];
  other: StatementLine[];
  totals: PnlTotals;
};

/** Estado de Resultados (P&G) por cuenta, agrupado en buckets EBITDA. */
export const getIncomeStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d))
  .handler(async ({ context, data }): Promise<IncomeStatement> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const lines = await fetchPostedLines(context.supabase, orgId, { from: data.from, to: data.to });

    const perAccount = new Map<string, StatementLine & { type: AccountType }>();
    for (const l of lines) {
      const acc = l.account;
      if (!acc || (acc.type !== "income" && acc.type !== "expense")) continue;
      const cur =
        perAccount.get(acc.id) ?? { code: acc.code, name: acc.name, amount: 0, type: acc.type };
      cur.amount += signedBalance(acc.type, l.debit, l.credit);
      perAccount.set(acc.id, cur);
    }

    const sorted = [...perAccount.values()]
      .filter((r) => Math.abs(r.amount) > 0.004)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));

    const revenue = sorted.filter((r) => r.type === "income" && !r.code.startsWith("42"));
    const cogs = sorted.filter((r) => r.type === "expense" && (r.code.startsWith("6") || r.code.startsWith("7")));
    const opex = sorted.filter(
      (r) => r.type === "expense" && (r.code.startsWith("51") || r.code.startsWith("52")),
    );
    const other = sorted.filter(
      (r) => !revenue.includes(r) && !cogs.includes(r) && !opex.includes(r),
    );

    return {
      from: data.from,
      to: data.to,
      revenue: revenue.map(strip),
      cogs: cogs.map(strip),
      opex: opex.map(strip),
      other: other.map(strip),
      totals: pnlTotals(aggregatePnl(lines)),
    };
  });

export type BalanceSheet = {
  as_of: string;
  assets_current: StatementLine[];
  assets_non_current: StatementLine[];
  liabilities_current: StatementLine[];
  liabilities_non_current: StatementLine[];
  equity: StatementLine[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  result_of_period: number;
  balanced: boolean;
};

/** Estado de Situación Financiera acumulado hasta la fecha de corte. */
export const getBalanceSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ as_of: z.string().min(10) }).parse(d))
  .handler(async ({ context, data }): Promise<BalanceSheet> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const lines = await fetchPostedLines(context.supabase, orgId, { to: data.as_of });

    type Row = StatementLine & { type: AccountType; is_current: boolean };
    const perAccount = new Map<string, Row>();
    let result_of_period = 0;

    for (const l of lines) {
      const acc = l.account;
      if (!acc) continue;
      const amount = signedBalance(acc.type, l.debit, l.credit);
      if (acc.type === "income" || acc.type === "expense") {
        result_of_period += acc.type === "income" ? amount : -amount;
        continue;
      }
      const cur =
        perAccount.get(acc.id) ??
        { code: acc.code, name: acc.name, amount: 0, type: acc.type, is_current: acc.is_current !== false };
      cur.amount += amount;
      perAccount.set(acc.id, cur);
    }

    const all = [...perAccount.values()]
      .filter((r) => Math.abs(r.amount) > 0.004)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));

    const pick = (type: AccountType, current: boolean) =>
      all.filter((r) => r.type === type && r.is_current === current).map(strip);
    const sum = (rows: StatementLine[]) => rows.reduce((s, r) => s + r.amount, 0);

    const assets_current = pick("asset", true);
    const assets_non_current = pick("asset", false);
    const liabilities_current = pick("liability", true);
    const liabilities_non_current = pick("liability", false);
    const equity = all.filter((r) => r.type === "equity").map(strip);

    const total_assets = sum(assets_current) + sum(assets_non_current);
    const total_liabilities = sum(liabilities_current) + sum(liabilities_non_current);
    const total_equity = sum(equity) + result_of_period;

    return {
      as_of: data.as_of,
      assets_current,
      assets_non_current,
      liabilities_current,
      liabilities_non_current,
      equity,
      total_assets,
      total_liabilities,
      total_equity,
      result_of_period,
      balanced: Math.abs(total_assets - (total_liabilities + total_equity)) < 0.01,
    };
  });

function strip(r: StatementLine & { type?: AccountType; is_current?: boolean }): StatementLine {
  return { code: r.code, name: r.name, amount: r.amount };
}

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// -------------------- Cash flow (indirect) --------------------

export type CashFlowSection = { code: string; name: string; amount: number };

export type CashFlowStatement = {
  from: string;
  to: string;
  net_income: number;
  depreciation: number;
  amortization: number;
  working_capital: CashFlowSection[];
  operating: number;
  investing_items: CashFlowSection[];
  investing: number;
  financing_items: CashFlowSection[];
  financing: number;
  net_change: number;
  cash_opening: number;
  cash_closing: number;
  cash_movement: number;
  reconciled: boolean;
};

const isCash = (code: string) => code.startsWith("11");
const isFinancialDebt = (code: string) => code.startsWith("21") || code.startsWith("2305");

/** Flujo de efectivo por método indirecto, derivado de asientos contabilizados. */
export const getCashFlowStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d))
  .handler(async ({ context, data }): Promise<CashFlowStatement> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const [priorLines, periodLines] = await Promise.all([
      fetchPostedLines(context.supabase, orgId, { to: shiftDay(data.from, -1) }),
      fetchPostedLines(context.supabase, orgId, { from: data.from, to: data.to }),
    ]);

    const totals = pnlTotals(aggregatePnl(periodLines));

    // Signed deltas per balance-sheet account within the period.
    type Delta = { code: string; name: string; type: AccountType; is_current: boolean; amount: number };
    const deltas = new Map<string, Delta>();
    let cash_movement = 0;
    for (const l of periodLines) {
      const acc = l.account;
      if (!acc || acc.type === "income" || acc.type === "expense") continue;
      const amount = signedBalance(acc.type, l.debit, l.credit);
      if (acc.type === "asset" && isCash(acc.code)) {
        cash_movement += amount;
        continue;
      }
      const cur =
        deltas.get(acc.id) ??
        { code: acc.code, name: acc.name, type: acc.type, is_current: acc.is_current !== false, amount: 0 };
      cur.amount += amount;
      deltas.set(acc.id, cur);
    }

    let cash_opening = 0;
    for (const l of priorLines) {
      const acc = l.account;
      if (acc?.type === "asset" && isCash(acc.code)) {
        cash_opening += signedBalance(acc.type, l.debit, l.credit);
      }
    }

    const rows = [...deltas.values()].filter((r) => Math.abs(r.amount) > 0.004);
    // Cash effect: asset increase consumes cash; liability/equity increase provides cash.
    const effect = (r: Delta) => (r.type === "asset" ? -r.amount : r.amount);

    const working_capital: CashFlowSection[] = [];
    const investing_items: CashFlowSection[] = [];
    const financing_items: CashFlowSection[] = [];

    for (const r of rows) {
      const item = { code: r.code, name: r.name, amount: effect(r) };
      if (r.type === "equity" || isFinancialDebt(r.code) || (r.type === "liability" && !r.is_current)) {
        financing_items.push(item);
      } else if (r.type === "asset" && !r.is_current) {
        investing_items.push(item);
      } else {
        working_capital.push(item);
      }
    }
    const sum = (xs: CashFlowSection[]) => xs.reduce((s, x) => s + x.amount, 0);
    const byCode = (a: CashFlowSection, b: CashFlowSection) =>
      String(a.code).localeCompare(String(b.code), undefined, { numeric: true });
    working_capital.sort(byCode);
    investing_items.sort(byCode);
    financing_items.sort(byCode);

    const operating =
      totals.net + totals.depreciation + totals.amortization + sum(working_capital);
    const investing = sum(investing_items);
    const financing = sum(financing_items);
    const net_change = operating + investing + financing;

    return {
      from: data.from,
      to: data.to,
      net_income: totals.net,
      depreciation: totals.depreciation,
      amortization: totals.amortization,
      working_capital,
      operating,
      investing_items,
      investing,
      financing_items,
      financing,
      net_change,
      cash_opening,
      cash_closing: cash_opening + cash_movement,
      cash_movement,
      reconciled: Math.abs(net_change - cash_movement) < 0.01,
    };
  });

// -------------------- Changes in equity --------------------

export type EquityRow = {
  code: string;
  name: string;
  opening: number;
  increase: number;
  decrease: number;
  closing: number;
};

export type EquityStatement = {
  from: string;
  to: string;
  rows: EquityRow[];
  opening_total: number;
  result_of_period: number;
  closing_total: number;
};

/** Estado de cambios en el patrimonio del periodo. */
export const getEquityStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d))
  .handler(async ({ context, data }): Promise<EquityStatement> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const [priorLines, periodLines] = await Promise.all([
      fetchPostedLines(context.supabase, orgId, { to: shiftDay(data.from, -1) }),
      fetchPostedLines(context.supabase, orgId, { from: data.from, to: data.to }),
    ]);

    const rows = new Map<string, EquityRow>();
    const rowFor = (id: string, code: string, name: string) => {
      let r = rows.get(id);
      if (!r) {
        r = { code, name, opening: 0, increase: 0, decrease: 0, closing: 0 };
        rows.set(id, r);
      }
      return r;
    };

    for (const l of priorLines) {
      const acc = l.account;
      if (acc?.type !== "equity") continue;
      rowFor(acc.id, acc.code, acc.name).opening += signedBalance("equity", l.debit, l.credit);
    }
    for (const l of periodLines) {
      const acc = l.account;
      if (acc?.type !== "equity") continue;
      const r = rowFor(acc.id, acc.code, acc.name);
      r.increase += l.credit;
      r.decrease += l.debit;
    }

    const list = [...rows.values()]
      .map((r) => ({ ...r, closing: r.opening + r.increase - r.decrease }))
      .filter((r) => Math.abs(r.opening) > 0.004 || r.increase > 0 || r.decrease > 0)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));

    const opening_total = list.reduce((s, r) => s + r.opening, 0);
    const result_of_period = pnlTotals(aggregatePnl(periodLines)).net;
    const closing_total = list.reduce((s, r) => s + r.closing, 0) + result_of_period;

    return { from: data.from, to: data.to, rows: list, opening_total, result_of_period, closing_total };
  });
