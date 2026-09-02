import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrgWithModuleAccess } from "./permissions";

/**
 * Phase 4 — Monthly close.
 *
 * 1. Bank reconciliation per account and month: book balance (POSTED journal
 *    lines on the bank account) vs. statement balance, listing unreconciled
 *    items so the month can only be closed once everything matches.
 * 2. Third-party reconciliation: movement + closing balance per third party
 *    from POSTED journal lines of the month.
 * 3. Accounting period lock: closing a month blocks new postings in it
 *    (enforced server-side by `assertPeriodOpen`).
 */

const MonthInput = z.object({
  period_month: z.string().regex(/^\d{4}-\d{2}$/, "Formato esperado YYYY-MM"),
});

function monthBounds(periodMonth: string) {
  const [y, m] = periodMonth.split("-").map(Number);
  const from = `${periodMonth}-01`;
  const to = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
  return { year: y!, month: m!, from, to, firstDay: `${periodMonth}-01` };
}

export type ReconItem = {
  id: string;
  occurred_on: string;
  description: string | null;
  reference: string | null;
  amount: number;
};

export type BankMonthSummary = {
  bank_account_id: string;
  bank_name: string;
  account_number_masked: string | null;
  currency: string | null;
  book_opening: number;
  book_movement: number;
  book_closing: number;
  statement_movement: number;
  statement_balance: number;
  difference: number;
  unreconciled: number;
  status: "open" | "closed";
  closed_at: string | null;
  notes: string | null;
  /** Partidas conciliatorias: movimientos del extracto sin asiento asociado. */
  items: ReconItem[];
};

export type ThirdPartyMonthSummary = {
  third_party_id: string;
  name: string;
  tax_id: string | null;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

export type PeriodCheck = {
  /** Suma de débitos de asientos publicados en el mes. */
  posted_debit: number;
  posted_credit: number;
  /** Asientos publicados cuyas líneas no cuadran. */
  unbalanced_entries: { id: string; entry_no: number | null; entry_date: string; diff: number }[];
  posted_entries: number;
  draft_entries: number;
  /** Cuentas bancarias con movimientos del mes sin cerrar su conciliación. */
  open_bank_reconciliations: number;
  /** Diferencia total libros vs extractos en bancos abiertos. */
  bank_difference: number;
  ready: boolean;
  issues: string[];
};

export type MonthlyReconciliation = {
  period_month: string;
  period_status: "open" | "closed";
  period_closed_at: string | null;
  banks: BankMonthSummary[];
  third_parties: ThirdPartyMonthSummary[];
  check: PeriodCheck;
};

/** Evalúa si un mes está listo para cerrarse (cuadre de asientos + bancos + borradores). */
async function computePeriodCheck(
  supabase: any,
  orgId: string,
  from: string,
  to: string,
  banks: Pick<BankMonthSummary, "status" | "difference" | "unreconciled" | "statement_movement" | "book_movement">[],
): Promise<PeriodCheck> {
  const { data: entries, error } = await supabase
    .from("fin_journal_entries")
    .select("id, entry_no, entry_date, status, fin_journal_lines(debit, credit)")
    .eq("org_id", orgId)
    .gte("entry_date", from)
    .lte("entry_date", to);
  if (error) throw new Error(error.message);
  let posted_debit = 0;
  let posted_credit = 0;
  let posted_entries = 0;
  let draft_entries = 0;
  const unbalanced: PeriodCheck["unbalanced_entries"] = [];
  for (const e of (entries ?? []) as any[]) {
    if (e.status !== "posted") { draft_entries++; continue; }
    posted_entries++;
    const d = (e.fin_journal_lines ?? []).reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0);
    const c = (e.fin_journal_lines ?? []).reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
    posted_debit += d;
    posted_credit += c;
    if (Math.abs(d - c) > 0.01) {
      unbalanced.push({ id: String(e.id), entry_no: e.entry_no ?? null, entry_date: String(e.entry_date), diff: d - c });
    }
  }
  const activeBanks = banks.filter(
    (b) => Math.abs(b.statement_movement) > 0.005 || Math.abs(b.book_movement) > 0.005 || b.unreconciled > 0,
  );
  const openBanks = activeBanks.filter((b) => b.status !== "closed");
  const bank_difference = openBanks.reduce((s, b) => s + Math.abs(b.difference), 0);

  const issues: string[] = [];
  if (draft_entries > 0) issues.push(`${draft_entries} asiento(s) en borrador sin publicar`);
  if (unbalanced.length > 0) issues.push(`${unbalanced.length} asiento(s) publicados con débito ≠ crédito`);
  if (Math.abs(posted_debit - posted_credit) > 0.01) {
    issues.push(`El libro diario no cuadra: débitos ${posted_debit.toFixed(2)} vs créditos ${posted_credit.toFixed(2)}`);
  }
  if (openBanks.length > 0) issues.push(`${openBanks.length} cuenta(s) bancaria(s) sin cerrar conciliación`);
  if (bank_difference > 0.01) issues.push(`Diferencia libros vs extracto de ${bank_difference.toFixed(2)}`);

  return {
    posted_debit,
    posted_credit,
    unbalanced_entries: unbalanced,
    posted_entries,
    draft_entries,
    open_bank_reconciliations: openBanks.length,
    bank_difference,
    ready: issues.length === 0,
    issues,
  };
}

async function postedBankLines(supabase: any, orgId: string, to: string) {
  const { data, error } = await supabase
    .from("fin_journal_lines" as never)
    .select("bank_account_id, debit, credit, fin_journal_entries!inner(entry_date, status)")
    .eq("org_id", orgId)
    .not("bank_account_id", "is", null)
    .eq("fin_journal_entries.status", "posted")
    .lte("fin_journal_entries.entry_date", to);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((l) => {
    const e = Array.isArray(l.fin_journal_entries) ? l.fin_journal_entries[0] : l.fin_journal_entries;
    return {
      bank_account_id: String(l.bank_account_id),
      entry_date: String(e?.entry_date ?? ""),
      amount: Number(l.debit ?? 0) - Number(l.credit ?? 0),
    };
  });
}

async function postedThirdPartyLines(supabase: any, orgId: string, to: string) {
  const { data, error } = await supabase
    .from("fin_journal_lines" as never)
    .select("third_party_id, debit, credit, fin_journal_entries!inner(entry_date, status)")
    .eq("org_id", orgId)
    .not("third_party_id", "is", null)
    .eq("fin_journal_entries.status", "posted")
    .lte("fin_journal_entries.entry_date", to);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((l) => {
    const e = Array.isArray(l.fin_journal_entries) ? l.fin_journal_entries[0] : l.fin_journal_entries;
    return {
      third_party_id: String(l.third_party_id),
      entry_date: String(e?.entry_date ?? ""),
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
    };
  });
}

export const getMonthlyReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MonthInput.parse(d))
  .handler(async ({ context, data }): Promise<MonthlyReconciliation> => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "member",
    );
    const { from, to, year, month, firstDay } = monthBounds(data.period_month);

    const [banksRes, txRes, periodRes, closesRes, partiesRes] = await Promise.all([
      context.supabase.from("bank_accounts" as never).select("*").eq("org_id", orgId).order("bank_name"),
      context.supabase.from("bank_transactions" as never)
        .select("id, bank_account_id, occurred_on, amount, description, reference, reconciled_entry_id")
        .eq("org_id", orgId).lte("occurred_on", to),
      context.supabase.from("accounting_periods" as never)
        .select("status, closed_at").eq("org_id", orgId).eq("year", year).eq("month", month).maybeSingle(),
      context.supabase.from("bank_reconciliation_periods" as never)
        .select("*").eq("org_id", orgId).eq("period_month", firstDay),
      context.supabase.from("third_parties" as never).select("id, name, tax_id").eq("org_id", orgId),
    ]);

    const bankLines = await postedBankLines(context.supabase, orgId, to);
    const tpLines = await postedThirdPartyLines(context.supabase, orgId, to);
    const closes = new Map(
      ((closesRes.data ?? []) as any[]).map((c) => [String(c.bank_account_id), c]),
    );

    const banks: BankMonthSummary[] = ((banksRes.data ?? []) as any[]).map((b) => {
      const id = String(b.id);
      const mine = bankLines.filter((l) => l.bank_account_id === id);
      const book_opening = mine.filter((l) => l.entry_date < from).reduce((s, l) => s + l.amount, 0);
      const book_movement = mine
        .filter((l) => l.entry_date >= from && l.entry_date <= to)
        .reduce((s, l) => s + l.amount, 0);
      const txs = ((txRes.data ?? []) as any[]).filter((t) => String(t.bank_account_id) === id);
      const inMonth = txs.filter((t) => t.occurred_on >= from && t.occurred_on <= to);
      const statement_movement = inMonth.reduce((s, t) => s + Number(t.amount ?? 0), 0);
      const close = closes.get(id);
      const book_closing = book_opening + book_movement;
      const statement_balance = close
        ? Number(close.statement_balance ?? 0)
        : Number(b.opening_balance ?? 0) + txs
            .filter((t) => t.occurred_on <= to)
            .reduce((s, t) => s + Number(t.amount ?? 0), 0);
      return {
        bank_account_id: id,
        bank_name: String(b.bank_name ?? ""),
        account_number_masked: b.account_number_masked ?? null,
        currency: b.currency ?? null,
        book_opening,
        book_movement,
        book_closing,
        statement_movement,
        statement_balance,
        difference: book_closing - statement_balance,
        unreconciled: inMonth.filter((t) => !t.reconciled_entry_id).length,
        items: inMonth
          .filter((t) => !t.reconciled_entry_id)
          .sort((x, y) => String(x.occurred_on).localeCompare(String(y.occurred_on)))
          .map((t) => ({
            id: String(t.id),
            occurred_on: String(t.occurred_on),
            description: t.description ?? null,
            reference: t.reference ?? null,
            amount: Number(t.amount ?? 0),
          })),
        status: close?.status === "closed" ? "closed" : "open",
        closed_at: close?.closed_at ?? null,
        notes: close?.notes ?? null,
      };
    });

    const tpMeta = new Map(((partiesRes.data ?? []) as any[]).map((p) => [String(p.id), p]));
    const tpMap = new Map<string, ThirdPartyMonthSummary>();
    for (const l of tpLines) {
      const meta = tpMeta.get(l.third_party_id);
      let row = tpMap.get(l.third_party_id);
      if (!row) {
        row = {
          third_party_id: l.third_party_id,
          name: String(meta?.name ?? "—"),
          tax_id: meta?.tax_id ?? null,
          opening: 0, debit: 0, credit: 0, closing: 0,
        };
        tpMap.set(l.third_party_id, row);
      }
      const signed = l.debit - l.credit;
      if (l.entry_date < from) row.opening += signed;
      else if (l.entry_date <= to) { row.debit += l.debit; row.credit += l.credit; }
    }
    const third_parties = [...tpMap.values()]
      .map((r) => ({ ...r, closing: r.opening + r.debit - r.credit }))
      .filter((r) => Math.abs(r.opening) > 0.005 || r.debit > 0 || r.credit > 0)
      .sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing));

    const period = periodRes.data as any;
    return {
      period_month: data.period_month,
      period_status: period?.status === "closed" ? "closed" : "open",
      period_closed_at: period?.closed_at ?? null,
      banks,
      third_parties,
    };
  });

export const closeBankReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    MonthInput.extend({
      bank_account_id: z.string().uuid(),
      statement_balance: z.number(),
      notes: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "admin",
    );
    const { from, to, firstDay } = monthBounds(data.period_month);

    const { data: bank } = await context.supabase
      .from("bank_accounts" as never)
      .select("id").eq("id", data.bank_account_id).eq("org_id", orgId).maybeSingle();
    if (!bank) throw new Error("Cuenta bancaria no encontrada en esta organización");

    const { data: txs } = await context.supabase
      .from("bank_transactions" as never)
      .select("id, reconciled_entry_id")
      .eq("org_id", orgId).eq("bank_account_id", data.bank_account_id)
      .gte("occurred_on", from).lte("occurred_on", to);
    const pending = ((txs ?? []) as any[]).filter((t) => !t.reconciled_entry_id).length;
    if (pending > 0) {
      throw new Error(`Quedan ${pending} movimientos sin conciliar en ${data.period_month}`);
    }

    const bankLines = await postedBankLines(context.supabase, orgId, to);
    const book_balance = bankLines
      .filter((l) => l.bank_account_id === data.bank_account_id)
      .reduce((s, l) => s + l.amount, 0);
    if (Math.abs(book_balance - data.statement_balance) > 0.01) {
      throw new Error(
        `El saldo en libros (${book_balance.toFixed(2)}) no coincide con el extracto (${data.statement_balance.toFixed(2)})`,
      );
    }

    const { error } = await context.supabase
      .from("bank_reconciliation_periods" as never)
      .upsert({
        org_id: orgId,
        bank_account_id: data.bank_account_id,
        period_month: firstDay,
        book_balance,
        statement_balance: data.statement_balance,
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: context.userId,
        notes: data.notes ?? null,
      } as never, { onConflict: "org_id,bank_account_id,period_month" } as never);
    if (error) throw new Error(error.message);
    return { ok: true, book_balance };
  });

export const reopenBankReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MonthInput.extend({ bank_account_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "admin",
    );
    const { firstDay } = monthBounds(data.period_month);
    const { error } = await context.supabase
      .from("bank_reconciliation_periods" as never)
      .update({ status: "open", closed_at: null, closed_by: null } as never)
      .eq("org_id", orgId)
      .eq("bank_account_id", data.bank_account_id)
      .eq("period_month", firstDay);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Accounting period lock --------------------

export type AccountingPeriodRow = {
  year: number;
  month: number;
  status: "open" | "closed";
  closed_at: string | null;
  entries: number;
  drafts: number;
};

export const listAccountingPeriods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int().min(2000).max(2200) }).parse(d))
  .handler(async ({ context, data }): Promise<AccountingPeriodRow[]> => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "member",
    );
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const [periodsRes, entriesRes] = await Promise.all([
      context.supabase.from("accounting_periods" as never)
        .select("year, month, status, closed_at").eq("org_id", orgId).eq("year", data.year),
      context.supabase.from("fin_journal_entries" as never)
        .select("entry_date, status").eq("org_id", orgId).gte("entry_date", from).lte("entry_date", to),
    ]);
    const byMonth = new Map(((periodsRes.data ?? []) as any[]).map((p) => [Number(p.month), p]));
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const p = byMonth.get(month);
      const rows = ((entriesRes.data ?? []) as any[]).filter(
        (e) => Number(String(e.entry_date).slice(5, 7)) === month,
      );
      return {
        year: data.year,
        month,
        status: p?.status === "closed" ? "closed" : "open",
        closed_at: p?.closed_at ?? null,
        entries: rows.filter((e) => e.status === "posted").length,
        drafts: rows.filter((e) => e.status !== "posted").length,
      } satisfies AccountingPeriodRow;
    });
  });

export const setAccountingPeriodStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2200),
      month: z.number().int().min(1).max(12),
      status: z.enum(["open", "closed"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "admin",
    );
    const periodMonth = `${data.year}-${String(data.month).padStart(2, "0")}`;
    const { from, to } = monthBounds(periodMonth);

    if (data.status === "closed") {
      const { data: drafts } = await context.supabase
        .from("fin_journal_entries" as never)
        .select("id").eq("org_id", orgId).neq("status", "posted")
        .gte("entry_date", from).lte("entry_date", to);
      if ((drafts ?? []).length > 0) {
        throw new Error(
          `Hay ${(drafts ?? []).length} asientos en borrador en ${periodMonth}; publícalos o elimínalos antes de cerrar`,
        );
      }
    }

    const { error } = await context.supabase
      .from("accounting_periods" as never)
      .upsert({
        org_id: orgId,
        year: data.year,
        month: data.month,
        status: data.status,
        closed_at: data.status === "closed" ? new Date().toISOString() : null,
        closed_by: data.status === "closed" ? context.userId : null,
      } as never, { onConflict: "org_id,year,month" } as never);
    if (error) throw new Error(error.message);
    return { ok: true, status: data.status };
  });
