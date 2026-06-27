
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_org(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_org(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_org(uuid) FROM authenticated;

-- Public-ish lookup for invite acceptance
CREATE OR REPLACE FUNCTION public.lookup_invite(_token text)
RETURNS TABLE (org_id uuid, org_name text, role public.org_role, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, invited_email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.org_id, o.name, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.invited_email
  FROM public.organization_invites i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE i.token = _token
$$;
REVOKE EXECUTE ON FUNCTION public.lookup_invite(text) FROM anon;

CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv record;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO inv FROM public.organization_invites WHERE token = _token;
  IF inv IS NULL THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite revoked'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invite already used'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'invite expired'; END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (inv.org_id, uid, inv.role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.organization_invites
    SET accepted_at = now(), accepted_by = uid
    WHERE id = inv.id;

  UPDATE public.profiles SET active_org_id = inv.org_id WHERE id = uid;

  RETURN inv.org_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_invite(text) FROM anon;
