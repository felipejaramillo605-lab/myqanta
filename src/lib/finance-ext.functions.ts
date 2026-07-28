import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";

// -------------------- Chart of accounts --------------------

export const listAccountsCoa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("fin_accounts" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("code");
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

const AccountInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(160),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  parent_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
});

export const upsertAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AccountInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("fin_accounts" as never).select("org_id").eq("id", data.id).single();
      if (!existing || (existing as any).org_id !== orgId) throw new Error("Cuenta no encontrada");
    }
    const payload = { ...data, org_id: orgId, parent_id: data.parent_id ?? null };
    const { data: out, error } = await context.supabase
      .from("fin_accounts" as never).upsert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("fin_accounts" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const seedStandardPuc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await (context.supabase.rpc as any)("seed_standard_puc", { _org_id: orgId });
    if (error) throw new Error(error.message);
    return { inserted: (data as number) ?? 0 };
  });

// -------------------- Journal entries --------------------

export const listJournalEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("fin_journal_entries" as never)
      .select("*, lines:fin_journal_lines(*)")
      .eq("org_id", orgId)
      .order("entry_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

const LineInput = z.object({
  account_id: z.string().uuid(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().max(400).nullable().optional(),
  third_party_id: z.string().uuid().nullable().optional(),
  bank_account_id: z.string().uuid().nullable().optional(),
});

const EntryInput = z.object({
  id: z.string().uuid().optional(),
  entry_date: z.string(),
  description: z.string().max(400).nullable().optional(),
  status: z.enum(["draft", "posted"]).default("draft"),
  receipt_document_id: z.string().uuid().nullable().optional(),
  related_invoice_id: z.string().uuid().nullable().optional(),
  lines: z.array(LineInput).min(2),
});

export const saveJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EntryInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");

    // Enforce balance debit == credit
    const totalD = data.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalC = data.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalD - totalC) > 0.01) throw new Error("El asiento no cuadra (débito ≠ crédito)");

    // Enforce receipt when posted
    if (data.status === "posted" && !data.receipt_document_id) {
      throw new Error("Un asiento publicado requiere comprobante adjunto");
    }

    let entryId = data.id;
    if (!entryId) {
      const { data: nRes, error: nErr } = await (context.supabase.rpc as any)("next_journal_entry_no", { _org_id: orgId });
      if (nErr) throw new Error(nErr.message);
      const { data: ins, error } = await context.supabase
        .from("fin_journal_entries" as never)
        .insert({
          org_id: orgId,
          entry_no: nRes as number,
          entry_date: data.entry_date,
          description: data.description ?? null,
          status: data.status,
          receipt_document_id: data.receipt_document_id ?? null,
          related_invoice_id: data.related_invoice_id ?? null,
          created_by: context.userId,
        } as never)
        .select().single();
      if (error) throw new Error(error.message);
      entryId = (ins as any).id;
    } else {
      const { error } = await context.supabase.from("fin_journal_entries" as never)
        .update({
          entry_date: data.entry_date,
          description: data.description ?? null,
          status: data.status,
          receipt_document_id: data.receipt_document_id ?? null,
          related_invoice_id: data.related_invoice_id ?? null,
        } as never)
        .eq("id", entryId).eq("org_id", orgId);
      if (error) throw new Error(error.message);
      await context.supabase.from("fin_journal_lines" as never)
        .delete().eq("entry_id", entryId).eq("org_id", orgId);
    }

    const rows = data.lines.map((l) => ({
      entry_id: entryId,
      org_id: orgId,
      account_id: l.account_id,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? null,
      third_party_id: l.third_party_id ?? null,
      bank_account_id: l.bank_account_id ?? null,
    }));
    const { error: lErr } = await context.supabase.from("fin_journal_lines" as never).insert(rows as never);
    if (lErr) throw new Error(lErr.message);
    return { id: entryId };
  });

export const deleteJournalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("fin_journal_entries" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Third parties --------------------

export const listThirdParties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase.from("third_parties" as never)
      .select("*").eq("org_id", orgId).order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

const ThirdPartyInput = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["customer", "supplier", "both"]),
  name: z.string().trim().min(1).max(200),
  tax_id: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  tax_regime: z.string().trim().max(80).nullable().optional(),
  applicable_taxes: z.record(z.string(), z.any()).default({}),
  contract_document_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertThirdParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ThirdPartyInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const payload: any = {
      ...data,
      email: data.email || null,
      org_id: orgId,
    };
    const { data: out, error } = await context.supabase.from("third_parties" as never)
      .upsert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteThirdParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("third_parties" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Bank accounts --------------------

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase.from("bank_accounts" as never)
      .select("*").eq("org_id", orgId).order("bank_name");
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

const BankInput = z.object({
  id: z.string().uuid().optional(),
  bank_name: z.string().trim().min(1).max(120),
  account_number_masked: z.string().trim().min(1).max(40),
  currency: z.string().trim().max(6).default("COP"),
  opening_balance: z.number().default(0),
  current_balance: z.number().default(0),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BankInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const payload = { ...data, org_id: orgId };
    const { data: out, error } = await context.supabase.from("bank_accounts" as never)
      .upsert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("bank_accounts" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Bank transactions --------------------

export const listBankTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bank_account_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    let q = context.supabase.from("bank_transactions" as never)
      .select("*").eq("org_id", orgId).order("occurred_on", { ascending: false }).limit(500);
    if (data.bank_account_id) q = q.eq("bank_account_id", data.bank_account_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

const BankTxInput = z.object({
  id: z.string().uuid().optional(),
  bank_account_id: z.string().uuid(),
  occurred_on: z.string(),
  description: z.string().max(400).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  amount: z.number(),
});

export const upsertBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BankTxInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const payload = { ...data, org_id: orgId };
    const { data: out, error } = await context.supabase.from("bank_transactions" as never)
      .upsert(payload as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("bank_transactions" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Tax drafts --------------------

export const listTaxDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase.from("tax_drafts" as never)
      .select("*").eq("org_id", orgId).order("period_start", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

const TaxDraftInput = z.object({
  id: z.string().uuid().optional(),
  period_start: z.string(),
  period_end: z.string(),
  tax_type: z.enum(["vat", "ica", "other_retention"]),
  status: z.enum(["draft", "reviewed"]).default("draft"),
  data: z.record(z.string(), z.any()).default({}),
  notes: z.string().max(1000).nullable().optional(),
});

export const generateTaxDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      period_start: z.string(),
      period_end: z.string(),
      tax_type: z.enum(["vat", "ica", "other_retention"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: org } = await context.supabase.from("organizations")
      .select("vat_responsible, ica_responsible, ica_rate, other_retentions")
      .eq("id", orgId).single();

    // Sum revenue/expense in the period from finance_transactions as a naive base
    const { data: tx } = await context.supabase.from("finance_transactions" as never)
      .select("bucket, amount, occurred_on").eq("org_id", orgId)
      .gte("occurred_on", data.period_start).lte("occurred_on", data.period_end);
    const revenue = (tx ?? []).filter((t: any) => t.bucket === "revenue")
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const expenses = (tx ?? []).filter((t: any) => ["cogs", "opex", "other_expense"].includes(t.bucket))
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

    let prefill: any = { revenue, expenses };
    const orgAny = org as any;
    if (data.tax_type === "vat") {
      prefill.responsible = orgAny?.vat_responsible ?? false;
      prefill.estimated = orgAny?.vat_responsible ? Math.round((revenue - expenses) * 0.19) : 0;
    } else if (data.tax_type === "ica") {
      const rate = Number(orgAny?.ica_rate ?? 0);
      prefill.responsible = orgAny?.ica_responsible ?? false;
      prefill.rate = rate;
      prefill.estimated = orgAny?.ica_responsible ? Math.round(revenue * (rate / 1000)) : 0;
    } else {
      prefill.retentions = orgAny?.other_retentions ?? {};
    }

    const { data: out, error } = await context.supabase.from("tax_drafts" as never)
      .insert({
        org_id: orgId,
        period_start: data.period_start,
        period_end: data.period_end,
        tax_type: data.tax_type,
        status: "draft",
        data: prefill,
      } as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const upsertTaxDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaxDraftInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: out, error } = await context.supabase.from("tax_drafts" as never)
      .upsert({ ...data, org_id: orgId } as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteTaxDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { error } = await context.supabase.from("tax_drafts" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Reconciliation --------------------

export const listReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: matches } = await context.supabase.from("reconciliation_matches" as never)
      .select("*").eq("org_id", orgId);
    const { data: txs } = await context.supabase.from("bank_transactions" as never)
      .select("*").eq("org_id", orgId).order("occurred_on", { ascending: false });
    const { data: entries } = await context.supabase.from("fin_journal_entries" as never)
      .select("*").eq("org_id", orgId).eq("status", "posted");
    return { matches: matches ?? [], txs: txs ?? [], entries: entries ?? [] };
  });

// Auto-match: same amount, within date tolerance, similar reference.
export const autoReconcile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      amount_tolerance: z.number().nonnegative().default(500),
      date_tolerance_days: z.number().int().nonnegative().default(3),
    }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data: txs } = await context.supabase.from("bank_transactions" as never)
      .select("*").eq("org_id", orgId).is("reconciled_entry_id", null);
    const { data: entries } = await context.supabase.from("fin_journal_entries" as never)
      .select("id, entry_date, entry_no, description, fin_journal_lines(debit, credit, bank_account_id)")
      .eq("org_id", orgId).eq("status", "posted");

    const usedEntries = new Set<string>();
    let matched = 0;
    for (const tx of (txs ?? []) as any[]) {
      const txAbs = Math.abs(Number(tx.amount));
      const txDate = new Date(tx.occurred_on).getTime();
      const candidate = ((entries ?? []) as any[]).find((e) => {
        if (usedEntries.has(e.id)) return false;
        const eDate = new Date(e.entry_date).getTime();
        if (Math.abs(eDate - txDate) > data.date_tolerance_days * 86400000) return false;
        const lineOnAcct = (e.fin_journal_lines || []).find(
          (l: any) => l.bank_account_id === tx.bank_account_id,
        );
        if (!lineOnAcct) return false;
        const amt = Math.abs(Number(lineOnAcct.debit || 0) - Number(lineOnAcct.credit || 0));
        return Math.abs(amt - txAbs) <= data.amount_tolerance;
      });
      if (candidate) {
        usedEntries.add(candidate.id);
        const line = (candidate.fin_journal_lines || []).find(
          (l: any) => l.bank_account_id === tx.bank_account_id,
        );
        const amt = Math.abs(Number(line.debit || 0) - Number(line.credit || 0));
        const diff = amt - txAbs;
        await context.supabase.from("reconciliation_matches" as never).insert({
          org_id: orgId,
          bank_transaction_id: tx.id,
          journal_entry_id: candidate.id,
          auto: true,
          diff,
          matched_by: context.userId,
        } as never);
        await context.supabase.from("bank_transactions" as never)
          .update({ reconciled_entry_id: candidate.id } as never).eq("id", tx.id);
        matched++;
      }
    }
    return { matched };
  });

export const manualReconcile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bank_transaction_id: z.string().uuid(), journal_entry_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    await context.supabase.from("reconciliation_matches" as never).upsert({
      org_id: orgId,
      bank_transaction_id: data.bank_transaction_id,
      journal_entry_id: data.journal_entry_id,
      auto: false,
      diff: 0,
      matched_by: context.userId,
    } as never);
    await context.supabase.from("bank_transactions" as never)
      .update({ reconciled_entry_id: data.journal_entry_id } as never)
      .eq("id", data.bank_transaction_id).eq("org_id", orgId);
    return { ok: true };
  });

export const unmatchReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bank_transaction_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    await context.supabase.from("reconciliation_matches" as never).delete()
      .eq("bank_transaction_id", data.bank_transaction_id).eq("org_id", orgId);
    await context.supabase.from("bank_transactions" as never)
      .update({ reconciled_entry_id: null } as never)
      .eq("id", data.bank_transaction_id).eq("org_id", orgId);
    return { ok: true };
  });
// -------------------- Ledger / Subledger / Third-party balances --------------------

export type LedgerRow = {
  id: string;
  entry_id: string;
  entry_no: number | null;
  entry_date: string;
  account_id: string;
  account_code: string | null;
  account_name: string | null;
  third_party_id: string | null;
  third_party_name: string | null;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
};

async function fetchPostedLines(
  supabase: any,
  orgId: string,
  opts: { accountId?: string | null; thirdPartyId?: string | null },
): Promise<LedgerRow[]> {
  let q = supabase
    .from("fin_journal_lines")
    .select(
      "id, account_id, third_party_id, debit, credit, description, entry_id, fin_journal_entries!inner(id, entry_no, entry_date, status, org_id)",
    )
    .eq("org_id", orgId)
    .eq("fin_journal_entries.status", "posted");
  if (opts.accountId) q = q.eq("account_id", opts.accountId);
  if (opts.thirdPartyId) q = q.eq("third_party_id", opts.thirdPartyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const [{ data: accounts }, { data: parties }] = await Promise.all([
    supabase.from("fin_accounts").select("id, code, name").eq("org_id", orgId),
    supabase.from("third_parties").select("id, name, tax_id").eq("org_id", orgId),
  ]);
  const accMap = new Map((accounts ?? []).map((a: any) => [a.id, a]));
  const tpMap = new Map((parties ?? []).map((p: any) => [p.id, p]));

  const rows: LedgerRow[] = ((data ?? []) as any[]).map((l: any) => {
    const acc: any = accMap.get(l.account_id);
    const tp: any = l.third_party_id ? tpMap.get(l.third_party_id) : null;
    return {
      id: l.id,
      entry_id: l.entry_id,
      entry_no: l.fin_journal_entries?.entry_no ?? null,
      entry_date: l.fin_journal_entries?.entry_date ?? "",
      account_id: l.account_id,
      account_code: acc?.code ?? null,
      account_name: acc?.name ?? null,
      third_party_id: l.third_party_id ?? null,
      third_party_name: tp?.name ?? null,
      description: l.description ?? null,
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
      balance: 0,
    } as LedgerRow;
  });

  // Chronological, then running balance per account.
  rows.sort((a: LedgerRow, b: LedgerRow) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
    return (a.entry_no ?? 0) - (b.entry_no ?? 0);
  });
  const running = new Map<string, number>();
  for (const r of rows) {
    const prev = running.get(r.account_id) ?? 0;
    const next = prev + r.debit - r.credit;
    running.set(r.account_id, next);
    r.balance = next;
  }
  return rows;
}

export const getLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }): Promise<LedgerRow[]> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    return fetchPostedLines(context.supabase, orgId, { accountId: data.account_id ?? null });
  });

export const getSubledger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ account_id: z.string().uuid(), third_party_id: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ context, data }): Promise<LedgerRow[]> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    return fetchPostedLines(context.supabase, orgId, {
      accountId: data.account_id,
      thirdPartyId: data.third_party_id ?? null,
    });
  });

export type ThirdPartyBalance = {
  third_party_id: string;
  name: string;
  tax_id: string | null;
  kind: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export const getThirdPartyBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ThirdPartyBalance[]> => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/finance", "member");
    const { data, error } = await context.supabase
      .from("fin_journal_lines" as never)
      .select("third_party_id, debit, credit, fin_journal_entries!inner(status)")
      .eq("org_id", orgId)
      .eq("fin_journal_entries.status", "posted")
      .not("third_party_id", "is", null);
    if (error) throw new Error(error.message);

    const { data: parties } = await context.supabase
      .from("third_parties" as never).select("id, name, tax_id, kind").eq("org_id", orgId);
    const tpMap = new Map((parties ?? []).map((p: any) => [p.id, p]));

    const acc = new Map<string, ThirdPartyBalance>();
    for (const l of (data ?? []) as any[]) {
      const id = l.third_party_id as string;
      const tp: any = tpMap.get(id);
      const cur = acc.get(id) ?? {
        third_party_id: id,
        name: tp?.name ?? "(desconocido)",
        tax_id: tp?.tax_id ?? null,
        kind: tp?.kind ?? null,
        debit: 0, credit: 0, balance: 0,
      };
      cur.debit += Number(l.debit ?? 0);
      cur.credit += Number(l.credit ?? 0);
      cur.balance = cur.debit - cur.credit;
      acc.set(id, cur);
    }
    return [...acc.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  });

// -------------------- Demo / test data --------------------

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const seedFinanceTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "owner");
    const sb = context.supabase;

    const { data: existing } = await sb.from("third_parties" as never)
      .select("id").eq("org_id", orgId).eq("name", "Proveedor Demo SAS").maybeSingle();
    if (existing) return { skipped: true as const };

    // Accounts by code
    const codes = ["1110", "3115", "1435", "2205", "4135", "5135"];
    const { data: accs, error: accErr } = await sb.from("fin_accounts" as never)
      .select("id, code").eq("org_id", orgId).in("code", codes);
    if (accErr) throw new Error(accErr.message);
    const accMap = new Map(((accs ?? []) as any[]).map((a) => [a.code as string, a.id as string]));
    const missing = codes.filter((c) => !accMap.has(c));
    if (missing.length) {
      throw new Error(`Faltan cuentas del PUC (${missing.join(", ")}). Carga primero el PUC estándar.`);
    }
    const A = (c: string) => accMap.get(c)!;

    // Third parties
    const { data: tps, error: tpErr } = await sb.from("third_parties" as never).insert([
      { org_id: orgId, kind: "supplier", name: "Proveedor Demo SAS", tax_id: "900123456-1", applicable_taxes: {} },
      { org_id: orgId, kind: "customer", name: "Cliente Demo Ltda", tax_id: "800987654-2", applicable_taxes: {} },
    ] as never).select("id, name");
    if (tpErr) throw new Error(tpErr.message);
    const supplierId = ((tps ?? []) as any[]).find((t) => t.name === "Proveedor Demo SAS")?.id as string;
    const customerId = ((tps ?? []) as any[]).find((t) => t.name === "Cliente Demo Ltda")?.id as string;

    // Bank account
    const { data: bank, error: bankErr } = await sb.from("bank_accounts" as never).insert({
      org_id: orgId,
      bank_name: "Bancolombia",
      account_number_masked: "****4521",
      currency: "COP",
      opening_balance: 5000000,
      current_balance: 5000000,
      active: true,
    } as never).select("id").single();
    if (bankErr) throw new Error(bankErr.message);
    const bankId = (bank as any).id as string;

    const dates = { capital: daysAgo(28), compra: daysAgo(20), venta: daysAgo(10), gasto: daysAgo(5) };

    const specs = [
      {
        date: dates.capital,
        description: "Aporte de capital inicial",
        lines: [
          { account_id: A("1110"), debit: 5000000, credit: 0, bank_account_id: bankId, description: "Ingreso a bancos" },
          { account_id: A("3115"), debit: 0, credit: 5000000, description: "Aportes sociales" },
        ],
      },
      {
        date: dates.compra,
        description: "Compra de mercancía a crédito - Proveedor Demo SAS",
        lines: [
          { account_id: A("1435"), debit: 1200000, credit: 0, description: "Mercancías no fabricadas" },
          { account_id: A("2205"), debit: 0, credit: 1200000, third_party_id: supplierId, description: "Proveedores nacionales" },
        ],
      },
      {
        date: dates.venta,
        description: "Venta de contado - Cliente Demo Ltda",
        lines: [
          { account_id: A("1110"), debit: 800000, credit: 0, bank_account_id: bankId, description: "Recaudo en banco" },
          { account_id: A("4135"), debit: 0, credit: 800000, third_party_id: customerId, description: "Ingreso por venta" },
        ],
      },
      {
        date: dates.gasto,
        description: "Pago de servicios públicos",
        lines: [
          { account_id: A("5135"), debit: 250000, credit: 0, description: "Servicios" },
          { account_id: A("1110"), debit: 0, credit: 250000, bank_account_id: bankId, description: "Salida de banco" },
        ],
      },
    ];

    let entries = 0;
    for (const spec of specs) {
      const totalD = spec.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const totalC = spec.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(totalD - totalC) > 0.01) throw new Error(`Asiento demo descuadrado: ${spec.description}`);

      const { data: nRes, error: nErr } = await (sb.rpc as any)("next_journal_entry_no", { _org_id: orgId });
      if (nErr) throw new Error(nErr.message);
      const { data: ins, error: eErr } = await sb.from("fin_journal_entries" as never).insert({
        org_id: orgId,
        entry_no: nRes as number,
        entry_date: spec.date,
        description: spec.description,
        status: "posted",
        created_by: context.userId,
      } as never).select("id").single();
      if (eErr) throw new Error(eErr.message);
      const entryId = (ins as any).id as string;
      const rows = spec.lines.map((l: any) => ({
        entry_id: entryId,
        org_id: orgId,
        account_id: l.account_id,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
        description: l.description ?? null,
        third_party_id: l.third_party_id ?? null,
        bank_account_id: l.bank_account_id ?? null,
      }));
      const { error: lErr } = await sb.from("fin_journal_lines" as never).insert(rows as never);
      if (lErr) throw new Error(lErr.message);
      entries++;
    }

    const { error: btErr } = await sb.from("bank_transactions" as never).insert([
      {
        org_id: orgId, bank_account_id: bankId, occurred_on: dates.venta,
        description: "Abono venta Cliente Demo Ltda", reference: "DEMO-VTA-001", amount: 800000,
      },
      {
        org_id: orgId, bank_account_id: bankId, occurred_on: dates.gasto,
        description: "Pago servicios públicos", reference: "DEMO-GTO-001", amount: -250000,
      },
    ] as never);
    if (btErr) throw new Error(btErr.message);

    return { skipped: false as const, entries, third_parties: 2, bank_accounts: 1, bank_transactions: 2 };
  });
