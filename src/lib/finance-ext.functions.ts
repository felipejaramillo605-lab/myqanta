import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";

// -------------------- Chart of accounts --------------------

export const listAccountsCoa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("fin_accounts" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Journal entries --------------------

export const listJournalEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");

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
      await context.supabase.from("fin_journal_lines" as never).delete().eq("entry_id", entryId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("fin_journal_entries" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Third parties --------------------

export const listThirdParties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("third_parties" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Bank accounts --------------------

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("bank_transactions" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Tax drafts --------------------

export const listTaxDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { data: out, error } = await context.supabase.from("tax_drafts" as never)
      .upsert({ ...data, org_id: orgId } as never).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteTaxDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    const { error } = await context.supabase.from("tax_drafts" as never)
      .delete().eq("id", data.id).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Reconciliation --------------------

export const listReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
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
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");
    await context.supabase.from("reconciliation_matches" as never).delete()
      .eq("bank_transaction_id", data.bank_transaction_id).eq("org_id", orgId);
    await context.supabase.from("bank_transactions" as never)
      .update({ reconciled_entry_id: null } as never)
      .eq("id", data.bank_transaction_id).eq("org_id", orgId);
    return { ok: true };
  });