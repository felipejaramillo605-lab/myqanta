ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv record;
  uid uuid := auth.uid();
  eff_custom_role uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO inv FROM public.organization_invites WHERE token = _token;
  IF inv IS NULL THEN RAISE EXCEPTION 'invite not found'; END IF;
  IF inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'invite revoked'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'invite already used'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'invite expired'; END IF;

  eff_custom_role := CASE
    WHEN inv.role IN ('member'::public.org_role, 'viewer'::public.org_role) THEN inv.custom_role_id
    ELSE NULL
  END;

  INSERT INTO public.organization_members (org_id, user_id, role, custom_role_id)
  VALUES (inv.org_id, uid, inv.role, eff_custom_role)
  ON CONFLICT (org_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        custom_role_id = COALESCE(EXCLUDED.custom_role_id, public.organization_members.custom_role_id);

  UPDATE public.organization_invites
    SET accepted_at = now(), accepted_by = uid
    WHERE id = inv.id;

  UPDATE public.profiles SET active_org_id = inv.org_id WHERE id = uid;

  PERFORM public.log_security_event(
    'invite_accepted','info', NULL, NULL, NULL,
    jsonb_build_object('org_id', inv.org_id, 'role', inv.role)
  );
  RETURN inv.org_id;
END $function$;