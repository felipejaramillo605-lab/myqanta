
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS hidden_modules text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_view_mode_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_view_mode_check
  CHECK (view_mode IN ('business','personal'));

-- Harden custom_roles write policies: require admin+ strictly.
DROP POLICY IF EXISTS "custom_roles write" ON public.custom_roles;
CREATE POLICY "custom_roles insert admin" ON public.custom_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));
CREATE POLICY "custom_roles update admin" ON public.custom_roles
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));
CREATE POLICY "custom_roles delete admin" ON public.custom_roles
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));
