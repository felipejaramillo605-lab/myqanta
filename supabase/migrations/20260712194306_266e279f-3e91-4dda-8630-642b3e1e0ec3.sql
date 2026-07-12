
-- === B4: RRHH ===
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS contract_type text,
  ADD COLUMN IF NOT EXISTS salary_base numeric(14,2),
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS vacation_days_available integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.hr_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'vacation',
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(6,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_org ON public.hr_leaves(org_id, start_date);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_member ON public.hr_leaves(member_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leaves TO authenticated;
GRANT ALL ON public.hr_leaves TO service_role;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_leaves_select" ON public.hr_leaves FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "hr_leaves_write" ON public.hr_leaves FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER trg_hr_leaves_updated_at BEFORE UPDATE ON public.hr_leaves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'draft',
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_net numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  finance_txn_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_runs TO authenticated;
GRANT ALL ON public.hr_payroll_runs TO service_role;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_select" ON public.hr_payroll_runs FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "hr_payroll_write" ON public.hr_payroll_runs FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER trg_hr_payroll_updated_at BEFORE UPDATE ON public.hr_payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === B5: Documentos ===
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  mime_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  entity_type text,
  entity_id uuid,
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_org ON public.documents(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON public.documents(entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "documents_write" ON public.documents FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS for the 'documents' bucket (bucket itself is created via the storage tool)
CREATE POLICY "documents_bucket_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = auth.uid()
        AND m.org_id::text = (storage.foldername(name))[1]
    )
  );
CREATE POLICY "documents_bucket_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND public.can_write_org(((storage.foldername(name))[1])::uuid, auth.uid())
  );
CREATE POLICY "documents_bucket_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.can_write_org(((storage.foldername(name))[1])::uuid, auth.uid())
  );
CREATE POLICY "documents_bucket_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.can_write_org(((storage.foldername(name))[1])::uuid, auth.uid())
  );
