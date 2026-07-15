
DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM ('pending', 'in_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  entity_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  status public.approval_status NOT NULL DEFAULT 'pending',
  assigned_to UUID NOT NULL,
  requested_by UUID NOT NULL,
  rejection_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_org ON public.approvals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_assignee ON public.approvals(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_approvals_module_entity ON public.approvals(module, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read approvals"
  ON public.approvals FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org members create approvals"
  ON public.approvals FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND requested_by = auth.uid());

CREATE POLICY "assignee or requester update approvals"
  ON public.approvals FOR UPDATE TO authenticated
  USING (
    public.is_org_member(org_id, auth.uid())
    AND (assigned_to = auth.uid() OR requested_by = auth.uid() OR public.can_write_org(org_id, auth.uid()))
  )
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "assignee requester or manager delete approvals"
  ON public.approvals FOR DELETE TO authenticated
  USING (
    public.is_org_member(org_id, auth.uid())
    AND (assigned_to = auth.uid() OR requested_by = auth.uid() OR public.can_write_org(org_id, auth.uid()))
  );

CREATE TRIGGER trg_approvals_updated_at
  BEFORE UPDATE ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.approval_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_comments_approval ON public.approval_comments(approval_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.approval_comments TO authenticated;
GRANT ALL ON public.approval_comments TO service_role;
ALTER TABLE public.approval_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read approval comments"
  ON public.approval_comments FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org members create approval comments"
  ON public.approval_comments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()) AND author_id = auth.uid());

CREATE POLICY "author or manager delete comments"
  ON public.approval_comments FOR DELETE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND (author_id = auth.uid() OR public.can_write_org(org_id, auth.uid())));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES public.approvals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_module TEXT,
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_approval ON public.tasks(approval_id);
