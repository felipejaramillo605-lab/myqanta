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

const round2 = (n: number) => Math.round(n * 100) / 100;


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
    const check = await computePeriodCheck(context.supabase, orgId, from, to, banks);
    return {
      period_month: data.period_month,
      period_status: period?.status === "closed" ? "closed" : "open",
      period_closed_at: period?.closed_at ?? null,
      banks,
      third_parties,
      check,
    };
  });

/** Carga masiva del extracto bancario (filas pegadas o CSV) para un mes. */
export const importBankStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    MonthInput.extend({
      bank_account_id: z.string().uuid(),
      rows: z.array(z.object({
        occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().trim().max(400).optional().nullable(),
        reference: z.string().trim().max(120).optional().nullable(),
        amount: z.number().finite(),
      })).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "member",
    );
    const { from, to } = monthBounds(data.period_month);
    const { data: bank } = await context.supabase
      .from("bank_accounts" as never)
      .select("id").eq("id", data.bank_account_id).eq("org_id", orgId).maybeSingle();
    if (!bank) throw new Error("Cuenta bancaria no encontrada en esta organización");
    const outside = data.rows.filter((r) => r.occurred_on < from || r.occurred_on > to);
    if (outside.length) {
      throw new Error(`${outside.length} fila(s) tienen fecha fuera de ${data.period_month}`);
    }
    // Evita duplicar filas idénticas ya cargadas (misma fecha, referencia y valor).
    const { data: existing } = await context.supabase
      .from("bank_transactions" as never)
      .select("occurred_on, reference, amount")
      .eq("org_id", orgId).eq("bank_account_id", data.bank_account_id)
      .gte("occurred_on", from).lte("occurred_on", to);
    const seen = new Set(
      ((existing ?? []) as any[]).map((t) => `${t.occurred_on}|${t.reference ?? ""}|${Number(t.amount).toFixed(2)}`),
    );
    const fresh = data.rows.filter(
      (r) => !seen.has(`${r.occurred_on}|${r.reference ?? ""}|${r.amount.toFixed(2)}`),
    );
    if (!fresh.length) return { inserted: 0, skipped: data.rows.length };
    const { error } = await context.supabase.from("bank_transactions" as never).insert(
      fresh.map((r) => ({
        org_id: orgId,
        bank_account_id: data.bank_account_id,
        occurred_on: r.occurred_on,
        description: r.description ?? null,
        reference: r.reference ?? null,
        amount: r.amount,
      })) as never,
    );
    if (error) throw new Error(error.message);
    return { inserted: fresh.length, skipped: data.rows.length - fresh.length };
  });

export type PeriodEntry = {
  id: string;
  entry_no: number | null;
  entry_date: string;
  description: string | null;
  status: "draft" | "posted" | string;
  debit: number;
  credit: number;
  lines: number;
  balanced: boolean;
  created_at: string | null;
  updated_at: string | null;
};

/** Asientos de un mes, con estado y totales, para revisar qué se contabilizó. */
export const listJournalEntriesByMonth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    MonthInput.extend({ status: z.enum(["all", "posted", "draft"]).optional() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance/journal", "member");
    const { from, to, year, month } = monthBounds(data.period_month);
    const [entriesRes, periodRes] = await Promise.all([
      context.supabase.from("fin_journal_entries" as never)
        .select("id, entry_no, entry_date, description, status, created_at, updated_at, fin_journal_lines(debit, credit)")
        .eq("org_id", orgId).gte("entry_date", from).lte("entry_date", to)
        .order("entry_date", { ascending: true }).order("entry_no", { ascending: true }),
      context.supabase.from("accounting_periods" as never)
        .select("status, closed_at").eq("org_id", orgId).eq("year", year).eq("month", month).maybeSingle(),
    ]);
    if (entriesRes.error) throw new Error(entriesRes.error.message);
    const entries: PeriodEntry[] = ((entriesRes.data ?? []) as any[]).map((e) => {
      const debit = (e.fin_journal_lines ?? []).reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0);
      const credit = (e.fin_journal_lines ?? []).reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
      return {
        id: String(e.id),
        entry_no: e.entry_no ?? null,
        entry_date: String(e.entry_date),
        description: e.description ?? null,
        status: String(e.status ?? "draft"),
        debit, credit,
        lines: (e.fin_journal_lines ?? []).length,
        balanced: Math.abs(debit - credit) <= 0.01,
        created_at: e.created_at ?? null,
        updated_at: e.updated_at ?? null,
      };
    }).filter((e) =>
      !data.status || data.status === "all" ? true : data.status === "posted" ? e.status === "posted" : e.status !== "posted",
    );
    const period = periodRes.data as any;
    const posted = entries.filter((e) => e.status === "posted");
    return {
      period_month: data.period_month,
      period_status: (period?.status === "closed" ? "closed" : "open") as "open" | "closed",
      period_closed_at: period?.closed_at ?? null,
      entries,
      totals: {
        posted: posted.length,
        drafts: entries.length - posted.length,
        posted_debit: posted.reduce((s, e) => s + e.debit, 0),
        posted_credit: posted.reduce((s, e) => s + e.credit, 0),
      },
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
      // Reutiliza el mismo chequeo que muestra la UI para que el mensaje coincida.
      const recon = await getMonthlyReconciliation({ data: { period_month: periodMonth } });
      if (!recon.check.ready) {
        throw new Error(`No se puede cerrar ${periodMonth}: ${recon.check.issues.join(" · ")}`);
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

// -------------------- Period audit trail --------------------

export type PeriodAuditRow = {
  id: string;
  year: number;
  month: number | null;
  action: string;
  reason: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

async function logPeriodAudit(
  supabase: any,
  orgId: string,
  userId: string,
  entry: { year: number; month?: number | null; action: string; reason?: string | null; meta?: Record<string, unknown> },
) {
  await supabase.from("accounting_period_audit" as never).insert({
    org_id: orgId,
    year: entry.year,
    month: entry.month ?? null,
    action: entry.action,
    reason: entry.reason ?? null,
    actor_id: userId,
    meta: entry.meta ?? {},
  } as never);
}

/** Historial de cierres/reaperturas de periodo (opcionalmente filtrado por año/mes). */
export const listPeriodAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2200).optional(),
      month: z.number().int().min(1).max(12).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<PeriodAuditRow[]> => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "member",
    );
    let q = context.supabase.from("accounting_period_audit" as never)
      .select("id, year, month, action, reason, actor_id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 60);
    if (data.year !== undefined) q = q.eq("year", data.year);
    if (data.month !== undefined) q = q.eq("month", data.month);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const actorIds = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles" as never).select("id, full_name").in("id", actorIds);
      for (const p of (profs ?? []) as any[]) names.set(String(p.id), String(p.full_name ?? ""));
    }
    return list.map((r) => ({
      id: String(r.id),
      year: Number(r.year),
      month: r.month === null || r.month === undefined ? null : Number(r.month),
      action: String(r.action),
      reason: r.reason ?? null,
      actor_id: r.actor_id ?? null,
      actor_name: r.actor_id ? (names.get(String(r.actor_id)) || null) : null,
      created_at: String(r.created_at),
    }));
  });

// -------------------- Year-end closing entry --------------------

const RETAINED_CODE = "3705";
const RETAINED_NAME = "Resultados de ejercicios anteriores";

export type YearEndAccount = {
  account_id: string;
  code: string;
  name: string;
  type: string;
  /** Saldo natural: ingresos positivo = ingreso, gastos positivo = gasto. */
  balance: number;
};

export type YearEndPreview = {
  year: number;
  income_total: number;
  expense_total: number;
  result: number;
  accounts: YearEndAccount[];
  retained_account: { id: string | null; code: string; name: string };
  existing_closing: { id: string; entry_no: number | null; entry_date: string; status: string } | null;
  issues: string[];
  ready: boolean;
};

async function yearEndData(supabase: any, orgId: string, year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [linesRes, accountsRes, entriesRes, periodsRes, closingRes] = await Promise.all([
    supabase.from("fin_journal_lines")
      .select("account_id, debit, credit, fin_journal_entries!inner(entry_date, status, is_closing)")
      .eq("org_id", orgId)
      .eq("fin_journal_entries.status", "posted")
      .eq("fin_journal_entries.is_closing", false)
      .gte("fin_journal_entries.entry_date", from)
      .lte("fin_journal_entries.entry_date", to),
    supabase.from("fin_accounts").select("id, code, name, type").eq("org_id", orgId),
    supabase.from("fin_journal_entries").select("id, status, is_closing")
      .eq("org_id", orgId).gte("entry_date", from).lte("entry_date", to),
    supabase.from("accounting_periods").select("month, status").eq("org_id", orgId).eq("year", year),
    supabase.from("fin_journal_entries").select("id, entry_no, entry_date, status")
      .eq("org_id", orgId).eq("is_closing", true).eq("closing_year", year).maybeSingle(),
  ]);

  const accById = new Map(((accountsRes.data ?? []) as any[]).map((a) => [String(a.id), a]));
  const byAccount = new Map<string, YearEndAccount>();
  for (const l of (linesRes.data ?? []) as any[]) {
    const acc = accById.get(String(l.account_id));
    if (!acc || (acc.type !== "income" && acc.type !== "expense")) continue;
    const id = String(l.account_id);
    let row = byAccount.get(id);
    if (!row) {
      row = { account_id: id, code: String(acc.code), name: String(acc.name), type: String(acc.type), balance: 0 };
      byAccount.set(id, row);
    }
    const signed = Number(l.debit ?? 0) - Number(l.credit ?? 0);
    // Ingresos: saldo crédito. Gastos: saldo débito. Se guarda en positivo natural.
    row.balance += acc.type === "income" ? -signed : signed;
  }
  const accounts = [...byAccount.values()]
    .filter((a) => Math.abs(a.balance) > 0.005)
    .sort((a, b) => a.code.localeCompare(b.code));

  const income_total = accounts.filter((a) => a.type === "income").reduce((s, a) => s + a.balance, 0);
  const expense_total = accounts.filter((a) => a.type === "expense").reduce((s, a) => s + a.balance, 0);

  const retained = ((accountsRes.data ?? []) as any[]).find((a) => String(a.code) === RETAINED_CODE) ?? null;
  const drafts = ((entriesRes.data ?? []) as any[]).filter((e) => e.status !== "posted" && !e.is_closing).length;
  const openMonths = ((periodsRes.data ?? []) as any[]).filter((p) => p.status === "closed").map((p) => Number(p.month));
  const decemberClosed = openMonths.includes(12);

  const issues: string[] = [];
  if (drafts > 0) issues.push(`${drafts} asiento(s) del ${year} siguen en borrador`);
  if (!accounts.length) issues.push(`No hay movimientos de resultado publicados en ${year}`);
  if (decemberClosed) issues.push(`Diciembre ${year} está cerrado; reábrelo para generar el cierre anual`);

  return {
    from, to, accounts, income_total, expense_total, retained, drafts, decemberClosed, issues,
    existing: (closingRes.data ?? null) as any,
  };
}

export const getYearEndPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int().min(2000).max(2200) }).parse(d))
  .handler(async ({ context, data }): Promise<YearEndPreview> => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "member",
    );
    const r = await yearEndData(context.supabase, orgId, data.year);
    const existing = r.existing
      ? {
          id: String(r.existing.id),
          entry_no: r.existing.entry_no ?? null,
          entry_date: String(r.existing.entry_date),
          status: String(r.existing.status ?? "posted"),
        }
      : null;
    const issues = [...r.issues];
    if (existing) issues.push(`Ya existe un asiento de cierre para ${data.year}`);
    return {
      year: data.year,
      income_total: r.income_total,
      expense_total: r.expense_total,
      result: r.income_total - r.expense_total,
      accounts: r.accounts,
      retained_account: {
        id: r.retained ? String(r.retained.id) : null,
        code: RETAINED_CODE,
        name: r.retained ? String(r.retained.name) : RETAINED_NAME,
      },
      existing_closing: existing,
      issues,
      ready: issues.length === 0,
    };
  });

/** Genera el asiento de cierre anual: cancela resultados contra utilidades acumuladas. */
export const postYearEndClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2200),
      reason: z.string().trim().max(400).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "admin",
    );
    const r = await yearEndData(context.supabase, orgId, data.year);
    if (r.existing) throw new Error(`Ya existe un asiento de cierre para ${data.year}`);
    if (r.issues.length) throw new Error(`No se puede cerrar el año: ${r.issues.join(" · ")}`);

    // Cuenta de resultados acumulados (se crea si la organización no la tiene).
    let retainedId = r.retained ? String(r.retained.id) : null;
    if (!retainedId) {
      const { data: parent } = await context.supabase
        .from("fin_accounts" as never).select("id").eq("org_id", orgId).eq("code", "3").maybeSingle();
      const { data: ins, error: insErr } = await context.supabase
        .from("fin_accounts" as never)
        .insert({
          org_id: orgId,
          code: RETAINED_CODE,
          name: RETAINED_NAME,
          type: "equity",
          parent_id: parent ? (parent as any).id : null,
          active: true,
          requires_third_party: false,
        } as never)
        .select("id").single();
      if (insErr) throw new Error(insErr.message);
      retainedId = String((ins as any).id);
    }

    const result = r.income_total - r.expense_total;
    const lines: Array<Record<string, unknown>> = [];
    for (const a of r.accounts) {
      // Se invierte el saldo natural de cada cuenta de resultado.
      if (a.type === "income") {
        lines.push({ account_id: a.account_id, debit: round2(a.balance), credit: 0 });
      } else {
        lines.push({ account_id: a.account_id, debit: 0, credit: round2(a.balance) });
      }
    }
    if (Math.abs(result) > 0.005) {
      lines.push(
        result > 0
          ? { account_id: retainedId, debit: 0, credit: round2(result) }
          : { account_id: retainedId, debit: round2(-result), credit: 0 },
      );
    }
    const totalD = lines.reduce((s, l) => s + Number(l["debit"] ?? 0), 0);
    const totalC = lines.reduce((s, l) => s + Number(l["credit"] ?? 0), 0);
    if (Math.abs(totalD - totalC) > 0.01) {
      // Ajuste por redondeo contra resultados acumulados.
      lines.push(
        totalD > totalC
          ? { account_id: retainedId, debit: 0, credit: round2(totalD - totalC) }
          : { account_id: retainedId, debit: round2(totalC - totalD), credit: 0 },
      );
    }
    if (lines.length < 2) throw new Error("No hay saldos de resultado por cancelar");

    const { data: nRes, error: nErr } = await (context.supabase.rpc as any)("next_journal_entry_no", { _org_id: orgId });
    if (nErr) throw new Error(nErr.message);
    const { data: entry, error: eErr } = await context.supabase
      .from("fin_journal_entries" as never)
      .insert({
        org_id: orgId,
        entry_no: nRes as number,
        entry_date: `${data.year}-12-31`,
        description: `Cierre anual ${data.year} — traslado del resultado a resultados acumulados`,
        status: "posted",
        is_closing: true,
        closing_year: data.year,
        created_by: context.userId,
      } as never)
      .select("id, entry_no").single();
    if (eErr) throw new Error(eErr.message);
    const entryId = String((entry as any).id);

    const { error: lErr } = await context.supabase.from("fin_journal_lines" as never).insert(
      lines.map((l) => ({
        entry_id: entryId,
        org_id: orgId,
        account_id: l["account_id"],
        debit: l["debit"] ?? 0,
        credit: l["credit"] ?? 0,
        description: `Cierre anual ${data.year}`,
      })) as never,
    );
    if (lErr) {
      await context.supabase.from("fin_journal_entries" as never).delete().eq("id", entryId).eq("org_id", orgId);
      throw new Error(lErr.message);
    }

    await logPeriodAudit(context.supabase, orgId, context.userId, {
      year: data.year,
      month: 12,
      action: "year_end_closed",
      reason: data.reason ?? null,
      meta: { entry_id: entryId, result, income: r.income_total, expense: r.expense_total },
    });

    return { id: entryId, entry_no: (entry as any).entry_no ?? null, result, lines: lines.length };
  });

/** Anula el asiento de cierre anual (solo si diciembre sigue abierto). */
export const revertYearEndClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      year: z.number().int().min(2000).max(2200),
      reason: z.string().trim().min(3, "Indica el motivo").max(400),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(
      context.supabase, context.userId, "/finance/reconciliation", "admin",
    );
    const { data: period } = await context.supabase
      .from("accounting_periods" as never)
      .select("status").eq("org_id", orgId).eq("year", data.year).eq("month", 12).maybeSingle();
    if ((period as any)?.status === "closed") {
      throw new Error(`Diciembre ${data.year} está cerrado; reábrelo antes de anular el cierre anual`);
    }
    const { data: entry } = await context.supabase
      .from("fin_journal_entries" as never)
      .select("id").eq("org_id", orgId).eq("is_closing", true).eq("closing_year", data.year).maybeSingle();
    if (!entry) throw new Error(`No hay asiento de cierre para ${data.year}`);
    const entryId = String((entry as any).id);
    await context.supabase.from("fin_journal_lines" as never).delete().eq("entry_id", entryId).eq("org_id", orgId);
    const { error } = await context.supabase
      .from("fin_journal_entries" as never).delete().eq("id", entryId).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    await logPeriodAudit(context.supabase, orgId, context.userId, {
      year: data.year, month: 12, action: "year_end_reverted", reason: data.reason,
      meta: { entry_id: entryId },
    });
    return { ok: true };
  });
