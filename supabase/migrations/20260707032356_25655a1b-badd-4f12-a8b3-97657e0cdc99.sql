-- team_members directory
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  code text NOT NULL,
  full_name text NOT NULL,
  position text,
  phone_e164 text,
  email text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members select" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "team_members insert" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_org(org_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "team_members update" ON public.team_members
  FOR UPDATE TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE POLICY "team_members delete" ON public.team_members
  FOR DELETE TO authenticated
  USING (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX team_members_org_idx ON public.team_members(org_id) WHERE archived = false;

-- reminders: add channel + email + team member link
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

ALTER TABLE public.reminders
  ALTER COLUMN phone_e164 DROP NOT NULL;
