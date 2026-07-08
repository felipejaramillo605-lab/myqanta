
-- ============ request_metrics ============
CREATE TABLE public.request_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  email text,
  path text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status int NOT NULL DEFAULT 200,
  duration_ms int NOT NULL DEFAULT 0,
  ip_hash text,
  ua_hash text,
  country text
);
CREATE INDEX idx_request_metrics_occurred ON public.request_metrics(occurred_at DESC);
CREATE INDEX idx_request_metrics_user ON public.request_metrics(user_id, occurred_at DESC);
CREATE INDEX idx_request_metrics_ip ON public.request_metrics(ip_hash, occurred_at DESC);
CREATE INDEX idx_request_metrics_status ON public.request_metrics(status, occurred_at DESC);

GRANT SELECT ON public.request_metrics TO authenticated;
GRANT ALL ON public.request_metrics TO service_role;
ALTER TABLE public.request_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner reads all metrics"
  ON public.request_metrics FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));

-- ============ ip_watchlist ============
CREATE TABLE public.ip_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL UNIQUE,
  reason text,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_watchlist TO authenticated;
GRANT ALL ON public.ip_watchlist TO service_role;
ALTER TABLE public.ip_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner manages watchlist"
  ON public.ip_watchlist FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

-- ============ RPCs ============

CREATE OR REPLACE FUNCTION public.platform_traffic_summary(_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  since timestamptz := now() - make_interval(hours => _hours);
  result jsonb;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'requests', (SELECT count(*) FROM request_metrics WHERE occurred_at >= since),
    'unique_users', (SELECT count(DISTINCT user_id) FROM request_metrics WHERE occurred_at >= since AND user_id IS NOT NULL),
    'unique_ips', (SELECT count(DISTINCT ip_hash) FROM request_metrics WHERE occurred_at >= since AND ip_hash IS NOT NULL),
    'errors_4xx', (SELECT count(*) FROM request_metrics WHERE occurred_at >= since AND status BETWEEN 400 AND 499),
    'errors_5xx', (SELECT count(*) FROM request_metrics WHERE occurred_at >= since AND status >= 500),
    'avg_ms', (SELECT COALESCE(round(avg(duration_ms))::int,0) FROM request_metrics WHERE occurred_at >= since),
    'failed_logins', (SELECT count(*) FROM security_events WHERE occurred_at >= since AND event_type IN ('login_failed','signin_failed')),
    'blocked_users', (SELECT count(*) FROM profiles WHERE is_blocked = true),
    'watchlist', (SELECT count(*) FROM ip_watchlist)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.platform_traffic_series(_hours int DEFAULT 24)
RETURNS TABLE(bucket timestamptz, requests bigint, errors bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    date_trunc('hour', occurred_at) AS bucket,
    count(*)::bigint AS requests,
    count(*) FILTER (WHERE status >= 400)::bigint AS errors
  FROM request_metrics
  WHERE occurred_at >= now() - make_interval(hours => _hours)
  GROUP BY 1 ORDER BY 1;
END $$;

CREATE OR REPLACE FUNCTION public.platform_top_users(_hours int DEFAULT 24, _limit int DEFAULT 20)
RETURNS TABLE(user_id uuid, email text, requests bigint, errors bigint, avg_ms int, last_seen timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    rm.user_id,
    max(rm.email) AS email,
    count(*)::bigint AS requests,
    count(*) FILTER (WHERE rm.status >= 400)::bigint AS errors,
    COALESCE(round(avg(rm.duration_ms))::int, 0) AS avg_ms,
    max(rm.occurred_at) AS last_seen
  FROM request_metrics rm
  WHERE rm.occurred_at >= now() - make_interval(hours => _hours)
    AND rm.user_id IS NOT NULL
  GROUP BY rm.user_id
  ORDER BY requests DESC
  LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.platform_top_ips(_hours int DEFAULT 24, _limit int DEFAULT 20)
RETURNS TABLE(ip_hash text, requests bigint, errors bigint, unique_users bigint, watched boolean, last_seen timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT
    rm.ip_hash,
    count(*)::bigint AS requests,
    count(*) FILTER (WHERE rm.status >= 400)::bigint AS errors,
    count(DISTINCT rm.user_id)::bigint AS unique_users,
    EXISTS(SELECT 1 FROM ip_watchlist w WHERE w.ip_hash = rm.ip_hash) AS watched,
    max(rm.occurred_at) AS last_seen
  FROM request_metrics rm
  WHERE rm.occurred_at >= now() - make_interval(hours => _hours)
    AND rm.ip_hash IS NOT NULL
  GROUP BY rm.ip_hash
  ORDER BY requests DESC
  LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.platform_suspicious(_hours int DEFAULT 24)
RETURNS TABLE(kind text, subject text, score int, detail jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  -- IPs with high 4xx ratio
  SELECT 'ip_error_burst'::text, rm.ip_hash,
    least(100, (count(*) FILTER (WHERE rm.status >= 400) * 100 / GREATEST(count(*),1))::int) AS score,
    jsonb_build_object('requests', count(*), 'errors', count(*) FILTER (WHERE rm.status >= 400))
  FROM request_metrics rm
  WHERE rm.occurred_at >= now() - make_interval(hours => _hours)
    AND rm.ip_hash IS NOT NULL
  GROUP BY rm.ip_hash
  HAVING count(*) >= 20 AND count(*) FILTER (WHERE rm.status >= 400) * 2 > count(*)

  UNION ALL

  -- Failed logins from same email
  SELECT 'failed_login_burst'::text, se.email,
    least(100, count(*)::int * 10) AS score,
    jsonb_build_object('failed_logins', count(*))
  FROM security_events se
  WHERE se.occurred_at >= now() - make_interval(hours => _hours)
    AND se.event_type IN ('login_failed','signin_failed')
    AND se.email IS NOT NULL
  GROUP BY se.email
  HAVING count(*) >= 5

  UNION ALL

  -- Users hitting from many IPs
  SELECT 'user_multi_ip'::text, COALESCE(max(rm.email), rm.user_id::text),
    least(100, count(DISTINCT rm.ip_hash)::int * 15) AS score,
    jsonb_build_object('ips', count(DISTINCT rm.ip_hash), 'requests', count(*))
  FROM request_metrics rm
  WHERE rm.occurred_at >= now() - make_interval(hours => 1)
    AND rm.user_id IS NOT NULL AND rm.ip_hash IS NOT NULL
  GROUP BY rm.user_id
  HAVING count(DISTINCT rm.ip_hash) >= 3

  ORDER BY score DESC
  LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.platform_add_watch(_ip_hash text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO ip_watchlist(ip_hash, reason, added_by)
  VALUES (_ip_hash, _reason, auth.uid())
  ON CONFLICT (ip_hash) DO UPDATE SET reason = EXCLUDED.reason;
END $$;

CREATE OR REPLACE FUNCTION public.platform_remove_watch(_ip_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM ip_watchlist WHERE ip_hash = _ip_hash;
END $$;

-- ============ auto-suspicious cron ============
CREATE OR REPLACE FUNCTION public.detect_and_log_suspicious()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'ip_error_burst' AS kind, ip_hash AS subject,
      count(*) AS req, count(*) FILTER (WHERE status >= 400) AS err
    FROM request_metrics
    WHERE occurred_at >= now() - interval '5 minutes'
      AND ip_hash IS NOT NULL
    GROUP BY ip_hash
    HAVING count(*) >= 30 AND count(*) FILTER (WHERE status >= 400) * 2 > count(*)
  LOOP
    INSERT INTO security_events (event_type, severity, message, meta)
    VALUES ('suspicious_activity', 'warn',
      format('IP %s con %s peticiones, %s errores en 5 min', r.subject, r.req, r.err),
      jsonb_build_object('ip_hash', r.subject, 'requests', r.req, 'errors', r.err, 'kind', r.kind));
  END LOOP;
END $$;

-- ============ retention ============
CREATE OR REPLACE FUNCTION public.purge_old_request_metrics()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM request_metrics WHERE occurred_at < now() - interval '30 days';
$$;

-- ============ pg_cron jobs ============
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('detect-suspicious-5m', '*/5 * * * *',
  $$SELECT public.detect_and_log_suspicious();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'detect-suspicious-5m');

SELECT cron.schedule('purge-request-metrics-daily', '17 3 * * *',
  $$SELECT public.purge_old_request_metrics();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-request-metrics-daily');
