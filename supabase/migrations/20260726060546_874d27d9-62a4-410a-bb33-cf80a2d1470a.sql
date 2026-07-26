ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS cedula text,
  ADD COLUMN IF NOT EXISTS employee_id text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS requested_role public.org_role,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_members_status_check'
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_status_check
      CHECK (status IN ('pending_approval','active','rejected'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS team_members_org_employee_id_key
  ON public.team_members (org_id, employee_id)
  WHERE employee_id IS NOT NULL;

DROP POLICY IF EXISTS "team_members select" ON public.team_members;
CREATE POLICY "team_members select" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id, auth.uid())
    AND (
      status <> 'pending_approval'
      OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role)
    )
  );

DROP POLICY IF EXISTS "team_members update" ON public.team_members;
CREATE POLICY "team_members update" ON public.team_members
  FOR UPDATE TO authenticated
  USING (
    public.can_write_org(org_id, auth.uid())
    AND (
      status <> 'pending_approval'
      OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role)
    )
  )
  WITH CHECK (
    public.can_write_org(org_id, auth.uid())
    AND (
      status <> 'pending_approval'
      OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role)
    )
  );

DROP POLICY IF EXISTS "team_members delete" ON public.team_members;
CREATE POLICY "team_members delete" ON public.team_members
  FOR DELETE TO authenticated
  USING (
    public.can_write_org(org_id, auth.uid())
    AND (
      status <> 'pending_approval'
      OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role)
    )
  );
