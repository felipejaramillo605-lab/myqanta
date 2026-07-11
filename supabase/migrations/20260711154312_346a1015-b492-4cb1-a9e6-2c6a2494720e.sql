
-- 1) Restrict log_security_event: allowlist per role, no arbitrary event_type
CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type text,
  _severity text DEFAULT 'info',
  _message text DEFAULT NULL,
  _email text DEFAULT NULL,
  _path text DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
  sev text := lower(coalesce(_severity, 'info'));
  et  text := left(coalesce(_event_type, 'unknown'), 64);
  uid uuid := auth.uid();
  anon_allowed CONSTANT text[] := ARRAY['login_failed','signin_failed','signup_failed'];
  auth_allowed CONSTANT text[] := ARRAY[
    'login_failed','signin_failed','signup_failed',
    'rls_denied','invite_accepted','account_blocked','account_reactivated',
    'privileged_action_denied','suspicious_activity','client_error'
  ];
BEGIN
  IF sev NOT IN ('info','warn','critical') THEN sev := 'info'; END IF;

  -- Enforce allowlist by caller role. anon can only log pre-auth failures.
  IF uid IS NULL THEN
    IF NOT (et = ANY(anon_allowed)) THEN
      RETURN NULL;
    END IF;
    sev := 'info'; -- anon cannot escalate severity
  ELSE
    IF NOT (et = ANY(auth_allowed)) THEN
      -- Coerce unknown types instead of trusting the caller
      et := 'client_error';
      sev := 'info';
    END IF;
  END IF;

  INSERT INTO public.security_events (event_type, severity, user_id, email, path, message, meta)
  VALUES (
    et,
    sev,
    uid,
    left(_email, 255),
    left(_path, 255),
    left(_message, 2000),
    coalesce(_meta, '{}'::jsonb)
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END $function$;

-- 2) Lock down SECURITY DEFINER surface: revoke from PUBLIC, grant explicitly.
-- Helpers used by RLS policies — need authenticated EXECUTE.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_org_role(uuid, uuid, org_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, org_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_write_org(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_org(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.am_i_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_blocked() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_active_org(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_org(uuid) TO authenticated, service_role;

-- Invite lookup can be called by anon (invitee not yet signed up).
REVOKE ALL ON FUNCTION public.lookup_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invite(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(text) TO authenticated, service_role;

-- log_security_event: anon may call ONLY the allowlisted pre-auth events.
REVOKE ALL ON FUNCTION public.log_security_event(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated, service_role;

-- Platform owner-only RPCs. They perform an internal is_platform_owner check
-- and RAISE 'forbidden' otherwise, so authenticated EXECUTE is safe.
REVOKE ALL ON FUNCTION public.platform_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_list_users() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_set_blocked(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_blocked(uuid, boolean, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_traffic_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_traffic_summary(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_traffic_series(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_traffic_series(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_top_users(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_top_users(integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_top_ips(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_top_ips(integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_suspicious(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_suspicious(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_add_watch(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_add_watch(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_remove_watch(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_remove_watch(text) TO authenticated, service_role;

-- Trigger / cron / internal-only functions: no direct callers via API.
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_platform_owner_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_owner_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_and_log_suspicious() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_old_request_metrics() FROM PUBLIC, anon, authenticated;
