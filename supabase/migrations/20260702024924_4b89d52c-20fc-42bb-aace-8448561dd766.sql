
-- Security events audit log
CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,           -- e.g. rls_denied, login_failed, account_blocked, privileged_action
  severity text NOT NULL DEFAULT 'info', -- info | warn | critical
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  path text,
  message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX security_events_occurred_at_idx ON public.security_events (occurred_at DESC);
CREATE INDEX security_events_event_type_idx ON public.security_events (event_type);
CREATE INDEX security_events_user_id_idx ON public.security_events (user_id);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Only the platform owner can read the security log
CREATE POLICY "platform owner reads security_events"
  ON public.security_events FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));

-- Writes go through the SECURITY DEFINER RPC only (no direct INSERT policy).

-- RPC: allows any caller (including anon on failed login) to log an event.
-- SECURITY DEFINER bypasses RLS for the insert but ONLY writes into the log table.
CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type text,
  _severity   text DEFAULT 'info',
  _message    text DEFAULT NULL,
  _email      text DEFAULT NULL,
  _path       text DEFAULT NULL,
  _meta       jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  sev text := lower(coalesce(_severity, 'info'));
  et  text := left(coalesce(_event_type, 'unknown'), 64);
BEGIN
  IF sev NOT IN ('info','warn','critical') THEN sev := 'info'; END IF;
  INSERT INTO public.security_events (event_type, severity, user_id, email, path, message, meta)
  VALUES (
    et,
    sev,
    auth.uid(),
    left(_email, 255),
    left(_path, 255),
    left(_message, 2000),
    coalesce(_meta, '{}'::jsonb)
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.log_security_event(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- Instrument existing privileged RPCs to write to the log.
CREATE OR REPLACE FUNCTION public.platform_set_blocked(_user_id uuid, _blocked boolean, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    PERFORM public.log_security_event(
      'privileged_action_denied','warn',
      'platform_set_blocked without platform_owner role',
      NULL, NULL,
      jsonb_build_object('target_user_id', _user_id, 'blocked', _blocked)
    );
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.profiles
     SET is_blocked = _blocked,
         blocked_at = CASE WHEN _blocked THEN now() ELSE NULL END,
         blocked_reason = CASE WHEN _blocked THEN _reason ELSE NULL END
   WHERE id = _user_id;

  PERFORM public.log_security_event(
    CASE WHEN _blocked THEN 'account_blocked' ELSE 'account_reactivated' END,
    'warn',
    coalesce(_reason, ''),
    NULL, NULL,
    jsonb_build_object('target_user_id', _user_id)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.accept_invite(_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.log_security_event(
    'invite_accepted','info', NULL, NULL, NULL,
    jsonb_build_object('org_id', inv.org_id, 'role', inv.role)
  );
  RETURN inv.org_id;
END $function$;
