
-- Chart of accounts
CREATE TABLE public.fin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);
CREATE INDEX idx_fin_accounts_org ON public.fin_accounts(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_accounts TO authenticated;
GRANT ALL ON public.fin_accounts TO service_role;
ALTER TABLE public.fin_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_accounts_select" ON public.fin_accounts FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fin_accounts_write" ON public.fin_accounts FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_fin_accounts_updated BEFORE UPDATE ON public.fin_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Third parties (clientes/proveedores fiscales)
CREATE TABLE public.third_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('customer','supplier','both')),
  name text NOT NULL,
  tax_id text,
  email text,
  phone text,
  address text,
  tax_regime text,
  applicable_taxes jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_document_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_third_parties_org ON public.third_parties(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.third_parties TO authenticated;
GRANT ALL ON public.third_parties TO service_role;
ALTER TABLE public.third_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "third_parties_select" ON public.third_parties FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "third_parties_write" ON public.third_parties FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_third_parties_updated BEFORE UPDATE ON public.third_parties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bank accounts
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number_masked text NOT NULL,
  currency text NOT NULL DEFAULT 'COP',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  current_balance numeric(18,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_accounts_org ON public.bank_accounts(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_accounts_select" ON public.bank_accounts FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "bank_accounts_write" ON public.bank_accounts FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Journal entries (asientos)
CREATE TABLE public.fin_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_no integer NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  receipt_document_id uuid,
  related_invoice_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, entry_no)
);
CREATE INDEX idx_fin_journal_entries_org ON public.fin_journal_entries(org_id, entry_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_journal_entries TO authenticated;
GRANT ALL ON public.fin_journal_entries TO service_role;
ALTER TABLE public.fin_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_journal_entries_select" ON public.fin_journal_entries FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fin_journal_entries_write" ON public.fin_journal_entries FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_fin_journal_entries_updated BEFORE UPDATE ON public.fin_journal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Journal lines
CREATE TABLE public.fin_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fin_journal_entries(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.fin_accounts(id) ON DELETE RESTRICT,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  description text,
  third_party_id uuid REFERENCES public.third_parties(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fin_journal_lines_entry ON public.fin_journal_lines(entry_id);
CREATE INDEX idx_fin_journal_lines_org ON public.fin_journal_lines(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_journal_lines TO authenticated;
GRANT ALL ON public.fin_journal_lines TO service_role;
ALTER TABLE public.fin_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fin_journal_lines_select" ON public.fin_journal_lines FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fin_journal_lines_write" ON public.fin_journal_lines FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));

-- Bank transactions (movimientos importados/manuales)
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  occurred_on date NOT NULL,
  description text,
  reference text,
  amount numeric(18,2) NOT NULL,
  reconciled_entry_id uuid REFERENCES public.fin_journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_transactions_org_date ON public.bank_transactions(org_id, occurred_on DESC);
CREATE INDEX idx_bank_transactions_acct ON public.bank_transactions(bank_account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_transactions_select" ON public.bank_transactions FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "bank_transactions_write" ON public.bank_transactions FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_bank_transactions_updated BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tax drafts
CREATE TABLE public.tax_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  tax_type text NOT NULL CHECK (tax_type IN ('vat','ica','other_retention')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tax_drafts_org ON public.tax_drafts(org_id, period_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_drafts TO authenticated;
GRANT ALL ON public.tax_drafts TO service_role;
ALTER TABLE public.tax_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_drafts_select" ON public.tax_drafts FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "tax_drafts_write" ON public.tax_drafts FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_tax_drafts_updated BEFORE UPDATE ON public.tax_drafts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reconciliation matches
CREATE TABLE public.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES public.fin_journal_entries(id) ON DELETE CASCADE,
  auto boolean NOT NULL DEFAULT false,
  diff numeric(18,2) NOT NULL DEFAULT 0,
  matched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bank_transaction_id)
);
CREATE INDEX idx_recon_matches_org ON public.reconciliation_matches(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_matches TO authenticated;
GRANT ALL ON public.reconciliation_matches TO service_role;
ALTER TABLE public.reconciliation_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reconciliation_matches_select" ON public.reconciliation_matches FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "reconciliation_matches_write" ON public.reconciliation_matches FOR ALL TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));

-- Next journal entry number helper
CREATE OR REPLACE FUNCTION public.next_journal_entry_no(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  IF NOT public.can_write_org(_org_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(MAX(entry_no), 0) + 1 INTO n FROM public.fin_journal_entries WHERE org_id = _org_id;
  RETURN n;
END $$;
