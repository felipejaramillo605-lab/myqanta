
-- Blocking fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

-- Platform owner helpers
CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_owner'::public.app_role
  )
$$;

-- Grant platform_owner to fjaramill28@alumno.uned.es on email confirmation.
CREATE OR REPLACE FUNCTION public.grant_platform_owner_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'fjaramill28@alumno.uned.es' THEN
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'platform_owner'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'admin_manager'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS grant_platform_owner_role_trg ON auth.users;
CREATE TRIGGER grant_platform_owner_role_trg
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_platform_owner_role();

-- Backfill if user already exists
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'fjaramill28@alumno.uned.es' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'platform_owner') ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles(user_id, role) VALUES (uid, 'admin_manager') ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Platform-owner RLS: allow read/update of all profiles and read of all orgs/members
CREATE POLICY "Platform owner can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_platform_owner(auth.uid()));

CREATE POLICY "Platform owner can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.is_platform_owner(auth.uid()))
WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE POLICY "Platform owner can view all organizations"
ON public.organizations FOR SELECT TO authenticated
USING (public.is_platform_owner(auth.uid()));

CREATE POLICY "Platform owner can view all members"
ON public.organization_members FOR SELECT TO authenticated
USING (public.is_platform_owner(auth.uid()));

-- Auth-users listing RPC (email + created_at) restricted to platform owners
CREATE OR REPLACE FUNCTION public.platform_list_users()
RETURNS TABLE(
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  full_name text,
  is_blocked boolean,
  blocked_at timestamptz,
  blocked_reason text,
  org_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT
    u.id, u.email::text, u.created_at, u.last_sign_in_at,
    p.full_name, COALESCE(p.is_blocked,false), p.blocked_at, p.blocked_reason,
    (SELECT count(*) FROM public.organization_members m WHERE m.user_id = u.id)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE public.is_platform_owner(auth.uid())
  ORDER BY u.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.platform_list_users() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_blocked(_user_id uuid, _blocked boolean, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
     SET is_blocked = _blocked,
         blocked_at = CASE WHEN _blocked THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _blocked THEN _reason ELSE NULL END
   WHERE id = _user_id;
END $$;

REVOKE ALL ON FUNCTION public.platform_set_blocked(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_blocked(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.am_i_blocked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_blocked FROM public.profiles WHERE id = auth.uid()), false)
$$;

REVOKE ALL ON FUNCTION public.am_i_blocked() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.am_i_blocked() TO authenticated;
