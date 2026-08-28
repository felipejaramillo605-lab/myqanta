-- ============ Payroll settings ============
CREATE TABLE public.hr_payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  minimum_wage numeric NOT NULL DEFAULT 1423500,
  transport_allowance numeric NOT NULL DEFAULT 200000,
  transport_allowance_max_smmlv numeric NOT NULL DEFAULT 2,
  health_employee_rate numeric NOT NULL DEFAULT 0.04,
  pension_employee_rate numeric NOT NULL DEFAULT 0.04,
  solidarity_threshold_smmlv numeric NOT NULL DEFAULT 4,
  solidarity_rate numeric NOT NULL DEFAULT 0.01,
  health_employer_rate numeric NOT NULL DEFAULT 0.085,
  pension_employer_rate numeric NOT NULL DEFAULT 0.12,
  arl_rate numeric NOT NULL DEFAULT 0.00522,
  caja_rate numeric NOT NULL DEFAULT 0.04,
  sena_rate numeric NOT NULL DEFAULT 0.02,
  icbf_rate numeric NOT NULL DEFAULT 0.03,
  cesantias_rate numeric NOT NULL DEFAULT 0.0833,
  intereses_cesantias_rate numeric NOT NULL DEFAULT 0.01,
  prima_rate numeric NOT NULL DEFAULT 0.0833,
  vacaciones_rate numeric NOT NULL DEFAULT 0.0417,
  salary_expense_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  employer_expense_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  provisions_expense_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  payroll_payable_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  withholdings_payable_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  provisions_payable_account_id uuid REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_settings TO authenticated;
GRANT ALL ON public.hr_payroll_settings TO service_role;
ALTER TABLE public.hr_payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_settings_select" ON public.hr_payroll_settings
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "payroll_settings_write" ON public.hr_payroll_settings
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TRIGGER update_hr_payroll_settings_updated_at
  BEFORE UPDATE ON public.hr_payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Payroll items (per member detail) ============
CREATE TABLE public.hr_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  worked_days integer NOT NULL DEFAULT 30,
  base_salary numeric NOT NULL DEFAULT 0,
  transport_allowance numeric NOT NULL DEFAULT 0,
  gross numeric NOT NULL DEFAULT 0,
  health_employee numeric NOT NULL DEFAULT 0,
  pension_employee numeric NOT NULL DEFAULT 0,
  solidarity_fund numeric NOT NULL DEFAULT 0,
  other_deductions numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  employer_health numeric NOT NULL DEFAULT 0,
  employer_pension numeric NOT NULL DEFAULT 0,
  employer_arl numeric NOT NULL DEFAULT 0,
  employer_caja numeric NOT NULL DEFAULT 0,
  employer_sena numeric NOT NULL DEFAULT 0,
  employer_icbf numeric NOT NULL DEFAULT 0,
  total_employer numeric NOT NULL DEFAULT 0,
  prov_cesantias numeric NOT NULL DEFAULT 0,
  prov_intereses_cesantias numeric NOT NULL DEFAULT 0,
  prov_prima numeric NOT NULL DEFAULT 0,
  prov_vacaciones numeric NOT NULL DEFAULT 0,
  total_provisions numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hr_payroll_items_run_idx ON public.hr_payroll_items(run_id);
CREATE INDEX hr_payroll_items_org_idx ON public.hr_payroll_items(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_items TO authenticated;
GRANT ALL ON public.hr_payroll_items TO service_role;
ALTER TABLE public.hr_payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_items_select" ON public.hr_payroll_items
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "payroll_items_write" ON public.hr_payroll_items
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TRIGGER update_hr_payroll_items_updated_at
  BEFORE UPDATE ON public.hr_payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Run totals ============
ALTER TABLE public.hr_payroll_runs
  ADD COLUMN IF NOT EXISTS total_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_employer numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_provisions numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.fin_journal_entries(id) ON DELETE SET NULL;