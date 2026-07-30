CREATE OR REPLACE FUNCTION public.log_security_event(
  _event_type text,
  _severity text DEFAULT 'info'::text,
  _message text DEFAULT NULL::text,
  _email text DEFAULT NULL::text,
  _path text DEFAULT NULL::text,
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
  hdrs json;
  raw_ip text;
  ip_h text;
  norm_email text := lower(nullif(btrim(coalesce(_email, '')), ''));
  recent int;
  anon_allowed CONSTANT text[] := ARRAY['login_failed','signin_failed','signup_failed'];
  auth_allowed CONSTANT text[] := ARRAY[
    'login_failed','signin_failed','signup_failed',
    'rls_denied','invite_accepted','account_blocked','account_reactivated',
    'privileged_action_denied','suspicious_activity','client_error',
    'blocked_access_attempt'
  ];
BEGIN
  IF sev NOT IN ('info','warn','critical') THEN sev := 'info'; END IF;

  IF uid IS NULL THEN
    IF NOT (et = ANY(anon_allowed)) THEN
      RETURN NULL;
    END IF;
    sev := 'info';
  ELSE
    IF NOT (et = ANY(auth_allowed)) THEN
      et := 'client_error';
      sev := 'info';
    END IF;
  END IF;

  IF et = 'blocked_access_attempt' THEN
    sev := 'warn';
  END IF;

  BEGIN
    hdrs := current_setting('request.headers', true)::json;
  EXCEPTION WHEN others THEN
    hdrs := NULL;
  END;
  IF hdrs IS NOT NULL THEN
    raw_ip := coalesce(
      nullif(btrim(coalesce(hdrs->>'cf-connecting-ip','')), ''),
      nullif(btrim(split_part(coalesce(hdrs->>'x-forwarded-for',''), ',', 1)), '')
    );
  END IF;
  IF raw_ip IS NOT NULL THEN
    ip_h := md5(raw_ip);
  END IF;

  IF norm_email IS NOT NULL THEN
    SELECT count(*) INTO recent
      FROM public.security_events
     WHERE occurred_at >= now() - interval '60 seconds'
       AND lower(email) = norm_email;
  ELSIF ip_h IS NOT NULL THEN
    SELECT count(*) INTO recent
      FROM public.security_events
     WHERE occurred_at >= now() - interval '60 seconds'
       AND meta->>'ip_hash' = ip_h;
  ELSIF uid IS NOT NULL THEN
    SELECT count(*) INTO recent
      FROM public.security_events
     WHERE occurred_at >= now() - interval '60 seconds'
       AND user_id = uid;
  ELSE
    recent := 0;
  END IF;

  IF recent >= 8 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.security_events (event_type, severity, user_id, email, path, message, meta)
  VALUES (
    et,
    sev,
    uid,
    left(_email, 255),
    left(_path, 255),
    left(_message, 2000),
    coalesce(_meta, '{}'::jsonb) || CASE WHEN ip_h IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('ip_hash', ip_h) END
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END $function$;