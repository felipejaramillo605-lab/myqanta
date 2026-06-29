
-- Backfill: si el usuario ya existe y confirmó email, otorgar admin_manager
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin_manager'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'felipejaramillo605@gmail.com'
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Asegurar rol 'owner' en todas las organizaciones donde sea miembro
UPDATE public.organization_members m
SET role = 'owner'::public.org_role
FROM auth.users u
WHERE m.user_id = u.id
  AND lower(u.email) = 'felipejaramillo605@gmail.com';

-- Trigger: al crear/confirmar la cuenta del owner, asignar admin_manager
CREATE OR REPLACE FUNCTION public.grant_owner_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'felipejaramillo605@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin_manager'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.organization_members
       SET role = 'owner'::public.org_role
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_owner
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_admin_role();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_owner
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_owner_admin_role();
