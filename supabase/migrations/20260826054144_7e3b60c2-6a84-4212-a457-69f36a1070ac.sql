CREATE TABLE public.notification_reads (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  notification_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id, notification_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reads select" ON public.notification_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id, auth.uid()));

CREATE POLICY "own reads insert" ON public.notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id, auth.uid()));

CREATE POLICY "own reads update" ON public.notification_reads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id, auth.uid()));

CREATE POLICY "own reads delete" ON public.notification_reads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id, auth.uid()));

CREATE INDEX idx_notification_reads_user ON public.notification_reads (org_id, user_id);