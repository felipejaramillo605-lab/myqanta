
CREATE TABLE public.ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_actions TO authenticated;
GRANT ALL ON public.ai_actions TO service_role;

ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_actions_select_org_member"
  ON public.ai_actions FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "ai_actions_insert_self"
  ON public.ai_actions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(org_id, auth.uid())
    AND user_id = auth.uid()
  );

CREATE INDEX ai_actions_org_created_idx ON public.ai_actions (org_id, created_at DESC);
