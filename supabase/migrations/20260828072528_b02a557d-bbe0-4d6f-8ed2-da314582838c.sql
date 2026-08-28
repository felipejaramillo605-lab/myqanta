-- ============ Fixed assets (NIC 16) ============
CREATE TABLE public.fin_fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  acquisition_date date NOT NULL DEFAULT CURRENT_DATE,
  cost numeric NOT NULL DEFAULT 0,
  residual_value numeric NOT NULL DEFAULT 0,
  useful_life_months integer NOT NULL DEFAULT 60,
  method text NOT NULL DEFAULT 'straight_line',
  asset_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  depreciation_expense_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  accumulated_depreciation_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  disposed_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_fixed_assets TO authenticated;
GRANT ALL ON public.fin_fixed_assets TO service_role;
ALTER TABLE public.fin_fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read fixed assets" ON public.fin_fixed_assets
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "writers manage fixed assets" ON public.fin_fixed_assets
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_fin_fixed_assets_updated BEFORE UPDATE ON public.fin_fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_fin_fixed_assets_org ON public.fin_fixed_assets(org_id);

-- ============ Depreciation schedule / postings ============
CREATE TABLE public.fin_depreciation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.fin_fixed_assets(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid REFERENCES public.fin_journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_depreciation_entries TO authenticated;
GRANT ALL ON public.fin_depreciation_entries TO service_role;
ALTER TABLE public.fin_depreciation_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read depreciation" ON public.fin_depreciation_entries
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "writers manage depreciation" ON public.fin_depreciation_entries
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE INDEX idx_fin_depreciation_org ON public.fin_depreciation_entries(org_id, period_month);

-- ============ Cost centers ============
CREATE TABLE public.fin_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_cost_centers TO authenticated;
GRANT ALL ON public.fin_cost_centers TO service_role;
ALTER TABLE public.fin_cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read cost centers" ON public.fin_cost_centers
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "writers manage cost centers" ON public.fin_cost_centers
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_fin_cost_centers_updated BEFORE UPDATE ON public.fin_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fin_journal_lines
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.fin_cost_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fin_journal_lines_cost_center ON public.fin_journal_lines(cost_center_id);

-- ============ Budgets ============
CREATE TABLE public.fin_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  account_id uuid NOT NULL REFERENCES public.fin_accounts(id) ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.fin_cost_centers(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_fin_budgets_unique
  ON public.fin_budgets(org_id, year, month, account_id, COALESCE(cost_center_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_budgets TO authenticated;
GRANT ALL ON public.fin_budgets TO service_role;
ALTER TABLE public.fin_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read budgets" ON public.fin_budgets
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "writers manage budgets" ON public.fin_budgets
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));
CREATE TRIGGER trg_fin_budgets_updated BEFORE UPDATE ON public.fin_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_fin_budgets_org ON public.fin_budgets(org_id, year, month);