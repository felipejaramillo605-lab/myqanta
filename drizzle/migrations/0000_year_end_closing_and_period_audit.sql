ALTER TABLE public.fin_journal_entries
  ADD COLUMN IF NOT EXISTS is_closing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closing_year integer;

CREATE INDEX IF NOT EXISTS fin_journal_entries_closing_idx
  ON public.fin_journal_entries (org_id, closing_year)
  WHERE is_closing;

CREATE TABLE IF NOT EXISTS public.accounting_period_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer,
  action text NOT NULL,
  reason text,
  actor_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.accounting_period_audit TO authenticated;
GRANT ALL ON public.accounting_period_audit TO service_role;

ALTER TABLE public.accounting_period_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read period audit"
  ON public.accounting_period_audit FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "writers insert period audit"
  ON public.accounting_period_audit FOR INSERT
  TO authenticated
  WITH CHECK (public.can_write_org(org_id, auth.uid()) AND actor_id = auth.uid());

CREATE INDEX IF NOT EXISTS accounting_period_audit_org_idx
  ON public.accounting_period_audit (org_id, year DESC, month DESC, created_at DESC);