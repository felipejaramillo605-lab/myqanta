
-- 1. Add cedula to team_members
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS cedula TEXT;
CREATE INDEX IF NOT EXISTS team_members_org_cedula_idx ON public.team_members(org_id, cedula) WHERE cedula IS NOT NULL;

-- 2. org_nodes
CREATE TABLE IF NOT EXISTS public.org_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  position_title TEXT,
  parent_id UUID REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_nodes_org_idx ON public.org_nodes(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_nodes TO authenticated;
GRANT ALL ON public.org_nodes TO service_role;

ALTER TABLE public.org_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_nodes select members" ON public.org_nodes FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "org_nodes write members" ON public.org_nodes FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER update_org_nodes_updated_at BEFORE UPDATE ON public.org_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. attendance_marks
CREATE TABLE IF NOT EXISTS public.attendance_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('in','out')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cedula_used TEXT NOT NULL,
  ip_hash TEXT,
  day_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_marks_org_time_idx ON public.attendance_marks(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS attendance_marks_member_time_idx ON public.attendance_marks(member_id, occurred_at DESC);

GRANT SELECT ON public.attendance_marks TO authenticated;
GRANT ALL ON public.attendance_marks TO service_role;

ALTER TABLE public.attendance_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_marks select members" ON public.attendance_marks FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
-- No insert/update/delete policy for authenticated: writes go through service_role via public endpoint.
