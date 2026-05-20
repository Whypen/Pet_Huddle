-- =============================================================================
-- Link-preview durable per-minute rate limits
-- =============================================================================
-- Keeps existing in-memory guards as a secondary safety layer while preventing
-- cross-worker/process bypass for the link-preview edge function.

CREATE TABLE IF NOT EXISTS public.link_preview_rate_limits (
  bucket_start timestamptz NOT NULL,
  key_type text NOT NULL CHECK (key_type IN ('ip', 'user')),
  key_value text NOT NULL,
  request_count int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket_start, key_type, key_value)
);

CREATE INDEX IF NOT EXISTS idx_link_preview_rate_limits_lookup
  ON public.link_preview_rate_limits (key_type, key_value, bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_link_preview_rate_limits_created_at
  ON public.link_preview_rate_limits (created_at DESC);

CREATE OR REPLACE FUNCTION public.check_link_preview_rate_limit(
  p_client_ip text,
  p_user_id uuid DEFAULT NULL,
  p_ip_limit int DEFAULT 60,
  p_user_limit int DEFAULT 20
)
RETURNS TABLE(
  is_limited boolean,
  reason text,
  ip_count int,
  user_count int,
  ip_reset_at timestamptz,
  user_reset_at timestamptz,
  retry_after_seconds int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_start timestamptz := date_trunc('minute', NOW());
  v_bucket_end timestamptz := date_trunc('minute', NOW()) + INTERVAL '1 minute';
  v_ip_count int := 0;
  v_user_count int := 0;
  v_retry_after int := 1;
BEGIN
  -- Keep the table bounded for the per-minute schema.
  DELETE FROM public.link_preview_rate_limits
  WHERE bucket_start < NOW() - INTERVAL '2 hours';

  -- Normalize client IP bucket key.
  p_client_ip := NULLIF(trim(COALESCE(p_client_ip, '')), 'unknown');
  IF p_client_ip IS NULL THEN
    p_client_ip := 'unknown';
  END IF;

  -- Per-IP bucket counter.
  INSERT INTO public.link_preview_rate_limits AS lr (
    bucket_start,
    key_type,
    key_value,
    request_count
  )
  VALUES (
    v_bucket_start,
    'ip',
    p_client_ip,
    1
  )
  ON CONFLICT (bucket_start, key_type, key_value)
  DO UPDATE SET request_count = lr.request_count + 1
  RETURNING request_count INTO v_ip_count;

  IF v_ip_count > p_ip_limit THEN
    v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_bucket_end - NOW()))::int);
    RETURN QUERY SELECT
      TRUE,
      'ip',
      v_ip_count,
      0,
      v_bucket_end,
      NULL::timestamptz,
      v_retry_after;
    RETURN;
  END IF;

  -- Per-user bucket counter (only when auth exists).
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.link_preview_rate_limits AS lr (
      bucket_start,
      key_type,
      key_value,
      request_count
    )
    VALUES (
      v_bucket_start,
      'user',
      p_user_id::text,
      1
    )
    ON CONFLICT (bucket_start, key_type, key_value)
    DO UPDATE SET request_count = lr.request_count + 1
    RETURNING request_count INTO v_user_count;

    IF v_user_count > p_user_limit THEN
      v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_bucket_end - NOW()))::int);
      RETURN QUERY SELECT
        TRUE,
        'user',
        v_ip_count,
        v_user_count,
        NULL::timestamptz,
        v_bucket_end,
        v_retry_after;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT
    FALSE,
    NULL::text,
    v_ip_count,
    v_user_count,
    NULL::timestamptz,
    NULL::timestamptz,
    0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_link_preview_rate_limit(text, uuid, int, int) TO service_role;
