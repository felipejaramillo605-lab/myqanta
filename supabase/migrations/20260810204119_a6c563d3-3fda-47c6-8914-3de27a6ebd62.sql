CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.bootstrap_admins (
  email text PRIMARY KEY,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.bootstrap_admins FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_owner_admin_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT NEW.id, b.role
    FROM private.bootstrap_admins b
    WHERE b.email = lower(NEW.email)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.organization_members
       SET role = 'owner'::public.org_role
     WHERE user_id = NEW.id
       AND EXISTS (
         SELECT 1 FROM private.bootstrap_admins b
         WHERE b.email = lower(NEW.email) AND b.role = 'admin_manager'
       );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_platform_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM private.bootstrap_admins b
       WHERE b.email = lower(NEW.email) AND b.role = 'platform_owner'
     ) THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'platform_owner'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'admin_manager'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_owner_admin_role() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_platform_owner_role() FROM anon, authenticated;