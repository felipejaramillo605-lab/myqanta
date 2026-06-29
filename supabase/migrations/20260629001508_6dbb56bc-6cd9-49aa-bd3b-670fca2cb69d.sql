
CREATE TABLE public.scan_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoice','statement')),
  source_name text,
  summary text,
  item_count int NOT NULL DEFAULT 0,
  total numeric,
  currency text,
  affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_batches TO authenticated;
GRANT ALL ON public.scan_batches TO service_role;

ALTER TABLE public.scan_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_batches read members" ON public.scan_batches
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "scan_batches insert writers" ON public.scan_batches
  FOR INSERT TO authenticated WITH CHECK (public.can_write_org(org_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "scan_batches update writers" ON public.scan_batches
  FOR UPDATE TO authenticated USING (public.can_write_org(org_id, auth.uid()));
CREATE POLICY "scan_batches delete writers" ON public.scan_batches
  FOR DELETE TO authenticated USING (public.can_write_org(org_id, auth.uid()));

CREATE INDEX scan_batches_org_created_idx ON public.scan_batches(org_id, created_at DESC);
