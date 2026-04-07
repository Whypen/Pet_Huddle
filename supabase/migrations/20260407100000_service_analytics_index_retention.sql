-- ─── service_analytics: index + retention ────────────────────────────────────
--
-- 1. Index on created_at for efficient time-range queries and purge sweeps.
-- 2. Purge function + pg_cron job: delete rows older than 90 days, runs daily.
--    This prevents unbounded table growth without losing recent signal.

CREATE INDEX IF NOT EXISTS idx_service_analytics_created_at
  ON public.service_analytics (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_analytics_user_event
  ON public.service_analytics (user_id, event, created_at DESC);

-- Purge function: deletes rows older than retention_days (default 90).
CREATE OR REPLACE FUNCTION public.purge_service_analytics(retention_days integer DEFAULT 90)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.service_analytics
  WHERE created_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Daily purge via pg_cron at 03:00 UTC.
SELECT cron.schedule(
  'service-analytics-daily-purge',
  '0 3 * * *',
  $$SELECT public.purge_service_analytics(90)$$
);
