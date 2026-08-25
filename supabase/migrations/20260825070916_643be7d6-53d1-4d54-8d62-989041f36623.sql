-- project type enum
DO $$ BEGIN
  CREATE TYPE public.project_type AS ENUM ('video','design','social_media','campaign','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type public.project_type NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS platform text;

ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(14,2);

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_invoices_project_id_idx ON public.sales_invoices(project_id);

CREATE TABLE IF NOT EXISTS public.project_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  expense_date date NOT NULL DEFAULT current_date,
  category text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_expenses TO authenticated;
GRANT ALL ON public.project_expenses TO service_role;

ALTER TABLE public.project_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_expenses_read" ON public.project_expenses
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "project_expenses_write" ON public.project_expenses
  FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS project_expenses_project_idx ON public.project_expenses(project_id);
CREATE INDEX IF NOT EXISTS project_expenses_org_idx ON public.project_expenses(org_id);

CREATE TRIGGER trg_project_expenses_updated
  BEFORE UPDATE ON public.project_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();