-- =============================================================================
-- SMS OTP Cost Control: Attempt Logging + Rate Limiting
-- =============================================================================
-- Hard caps enforced server-side (no client bypass path):
--   5  send attempts per phone    per 24 h
--   10 send attempts per user_id  per 24 h
--   20 send attempts per IP       per 24 h
--   3  verify attempts per phone  per 24 h
--
-- Resend cooldown ladder (cooldown seconds between consecutive sends):
--   After 1st send: 60 s
--   After 2nd send: 120 s
--   After 3rd+ send: 300 s
--
-- Privacy: raw phone number is NEVER stored in this table.
--          Only a SHA-256 hex digest (p_phone_hash) is written.
--          Hashing is performed in the edge function before any DB call.
--
-- ip_address is NOT NULL — edge function must pass 'unknown' if header absent.
-- user_id, device_id, session_id are nullable; missing values narrow coverage
-- but cannot bypass the phone+IP caps (both always enforced).
-- =============================================================================

-- ── 1. Attempt log table ─────────────────────────────────────────────────────

CREATE TABLE public.phone_otp_attempts (
  id                        BIGSERIAL      PRIMARY KEY,
  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Identifiers (used for rate-limit counting)
  user_id                   UUID,                      -- nullable: absent for unauthenticated
  phone_hash                TEXT           NOT NULL,   -- SHA-256(E.164 phone), never raw
  ip_address                TEXT           NOT NULL,   -- 'unknown' if header absent, never NULL
  device_id                 TEXT,                      -- FingerprintJS visitorId, nullable
  session_id                TEXT,                      -- nullable

  -- Attempt metadata
  attempt_type              TEXT           NOT NULL
    CHECK (attempt_type IN ('request', 'verify', 'resend')),
  status                    TEXT           NOT NULL
    CHECK (status IN ('success', 'failed', 'invalid_otp', 'rate_limited', 'suspicious')),
  reason                    TEXT,
  suspicious_flags          TEXT[]         NOT NULL DEFAULT '{}',
  error_message             TEXT,

  -- Snapshot counts at time of log (for monitoring, not enforcement)
  request_count_today       INT            NOT NULL DEFAULT 0,
  verify_count_today        INT            NOT NULL DEFAULT 0,
  seconds_since_last_request INT           NOT NULL DEFAULT 0
);

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX idx_otp_phone_hash
  ON public.phone_otp_attempts (phone_hash, created_at DESC);

CREATE INDEX idx_otp_user_id
  ON public.phone_otp_attempts (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX idx_otp_ip_address
  ON public.phone_otp_attempts (ip_address, created_at DESC);

CREATE INDEX idx_otp_created_at
  ON public.phone_otp_attempts (created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- Edge functions use the service_role key which bypasses RLS → writes are
-- unrestricted from the function side.
-- Authenticated users may read ONLY their own rows (by user_id).
-- The daily summary view is restricted to service_role only (admin monitoring).

ALTER TABLE public.phone_otp_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "otp_attempts_read_own"
  ON public.phone_otp_attempts
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Service-role key bypasses RLS entirely for all edge-function writes.

-- ── 4. get_otp_resend_cooldown ───────────────────────────────────────────────
-- Returns the required wait (seconds) before the next send for a given
-- cumulative request count within the 24-h window.
--   count 0   → 0 s   (first ever send, no cooldown)
--   count 1   → 60 s  (must wait 60 s after first send before resending)
--   count 2   → 120 s
--   count ≥ 3 → 300 s (cap is 5/day, so this fires on 4th and 5th sends)

CREATE OR REPLACE FUNCTION public.get_otp_resend_cooldown(p_request_count INT)
RETURNS INT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_request_count <= 0 THEN 0
    WHEN p_request_count =  1 THEN 60
    WHEN p_request_count =  2 THEN 120
    ELSE 300
  END;
$$;

-- ── 5. get_phone_otp_request_count ──────────────────────────────────────────
-- Counts non-rate-limited send attempts in the last p_hours for ONE identifier.
-- Call once per identifier with only that param set; the others must be NULL.
--
-- NULL safety:
--   All three identifier params default to NULL.
--   If all are NULL the WHERE clause is universally false → returns (0, NULL).
--   This is intentional: a NULL identifier contributes 0 to its cap,
--   meaning a missing user_id still faces the phone+IP caps.
--
-- 'rate_limited' attempts are excluded so blocked requests do not inflate
-- the count and cause permanent lockout from a single burst.

CREATE OR REPLACE FUNCTION public.get_phone_otp_request_count(
  p_phone_hash TEXT    DEFAULT NULL,
  p_user_id    UUID    DEFAULT NULL,
  p_ip         TEXT    DEFAULT NULL,
  p_hours      INT     DEFAULT 24
)
RETURNS TABLE(cnt INT, earliest_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::INT,
    MIN(created_at)
  FROM public.phone_otp_attempts
  WHERE attempt_type IN ('request', 'resend')
    AND status        <> 'rate_limited'
    AND created_at     > NOW() - (p_hours || ' hours')::INTERVAL
    AND (
      (p_phone_hash IS NOT NULL AND phone_hash  = p_phone_hash)
      OR (p_user_id  IS NOT NULL AND user_id    = p_user_id)
      OR (p_ip       IS NOT NULL AND ip_address = p_ip)
    );
$$;

-- ── 6. check_phone_otp_rate_limit ───────────────────────────────────────────
-- Central gate: call before every OTP send from the edge function.
-- Returns a single row:
--   is_limited          BOOLEAN  — true = block this request
--   reason              TEXT     — 'phone_daily_cap' | 'user_daily_cap' |
--                                  'ip_daily_cap'    | 'resend_cooldown' | NULL
--   phone_cnt           INT
--   user_cnt            INT
--   ip_cnt              INT
--   seconds_until_allow INT      — 0 when not limited
--
-- NULL safety:
--   p_user_id = NULL  → user cap check is skipped (correct: anon requests
--     only face phone + IP caps, which are always enforced).
--   p_ip must never be NULL; edge fn passes 'unknown' as fallback so all
--     unknown-IP traffic accumulates under one bucket.
--   seconds_until_allow uses COALESCE on the extracted epoch so a NULL
--     earliest_at (theoretically unreachable when count ≥ cap) cannot
--     produce a NULL return value.

CREATE OR REPLACE FUNCTION public.check_phone_otp_rate_limit(
  p_phone_hash TEXT,
  p_user_id    UUID,    -- pass NULL for unauthenticated requests
  p_ip         TEXT     -- pass 'unknown' if header absent, never NULL
)
RETURNS TABLE(
  is_limited          BOOLEAN,
  reason              TEXT,
  phone_cnt           INT,
  user_cnt            INT,
  ip_cnt              INT,
  seconds_until_allow INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_phone_cnt   INT; v_phone_earliest TIMESTAMPTZ;
  v_user_cnt    INT; v_user_earliest  TIMESTAMPTZ;
  v_ip_cnt      INT; v_ip_earliest    TIMESTAMPTZ;
  v_cooldown    INT;
  v_secs_since  INT;
  v_secs_remain INT;
BEGIN
  -- Count per identifier (separate calls so OR logic doesn't cross-count)
  SELECT cnt, earliest_at INTO v_phone_cnt, v_phone_earliest
    FROM public.get_phone_otp_request_count(p_phone_hash => p_phone_hash);

  SELECT cnt, earliest_at INTO v_user_cnt, v_user_earliest
    FROM public.get_phone_otp_request_count(p_user_id => p_user_id);

  SELECT cnt, earliest_at INTO v_ip_cnt, v_ip_earliest
    FROM public.get_phone_otp_request_count(p_ip => p_ip);

  -- Normalise NULLs (SELECT INTO leaves variable NULL if no row returned)
  v_phone_cnt := COALESCE(v_phone_cnt, 0);
  v_user_cnt  := COALESCE(v_user_cnt,  0);
  v_ip_cnt    := COALESCE(v_ip_cnt,    0);

  -- ── Hard cap: per phone ────────────────────────────────────────────────
  IF v_phone_cnt >= 5 THEN
    v_secs_remain := GREATEST(0,
      86400 - COALESCE(EXTRACT(EPOCH FROM (NOW() - v_phone_earliest))::INT, 0));
    RETURN QUERY SELECT TRUE, 'phone_daily_cap',
      v_phone_cnt, v_user_cnt, v_ip_cnt, v_secs_remain;
    RETURN;
  END IF;

  -- ── Hard cap: per user (skipped when user_id is NULL) ─────────────────
  IF p_user_id IS NOT NULL AND v_user_cnt >= 10 THEN
    v_secs_remain := GREATEST(0,
      86400 - COALESCE(EXTRACT(EPOCH FROM (NOW() - v_user_earliest))::INT, 0));
    RETURN QUERY SELECT TRUE, 'user_daily_cap',
      v_phone_cnt, v_user_cnt, v_ip_cnt, v_secs_remain;
    RETURN;
  END IF;

  -- ── Hard cap: per IP ───────────────────────────────────────────────────
  IF v_ip_cnt >= 20 THEN
    v_secs_remain := GREATEST(0,
      86400 - COALESCE(EXTRACT(EPOCH FROM (NOW() - v_ip_earliest))::INT, 0));
    RETURN QUERY SELECT TRUE, 'ip_daily_cap',
      v_phone_cnt, v_user_cnt, v_ip_cnt, v_secs_remain;
    RETURN;
  END IF;

  -- ── Resend cooldown: same phone (only when prior sends exist) ──────────
  IF v_phone_cnt > 0 THEN
    v_cooldown := public.get_otp_resend_cooldown(v_phone_cnt);

    SELECT COALESCE(
        EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::INT,
        99999
      )
      INTO v_secs_since
      FROM public.phone_otp_attempts
      WHERE phone_hash   = p_phone_hash
        AND attempt_type IN ('request', 'resend')
        AND status        <> 'rate_limited'
        AND created_at    > NOW() - '24 hours'::INTERVAL;

    v_secs_since := COALESCE(v_secs_since, 99999);

    IF v_secs_since < v_cooldown THEN
      RETURN QUERY SELECT TRUE, 'resend_cooldown',
        v_phone_cnt, v_user_cnt, v_ip_cnt,
        (v_cooldown - v_secs_since);
      RETURN;
    END IF;
  END IF;

  -- ── Not limited ────────────────────────────────────────────────────────
  RETURN QUERY SELECT FALSE, NULL::TEXT,
    v_phone_cnt, v_user_cnt, v_ip_cnt, 0;
END;
$$;

-- ── 7. log_phone_otp_attempt ─────────────────────────────────────────────────
-- Inserts one row and returns its id.
-- Called by edge function after every send or verify, regardless of outcome.
-- phone_hash must already be a SHA-256 hex string — no hashing done here.

CREATE OR REPLACE FUNCTION public.log_phone_otp_attempt(
  p_phone_hash   TEXT,
  p_ip           TEXT,
  p_attempt_type TEXT,
  p_status       TEXT,
  p_user_id      UUID    DEFAULT NULL,
  p_device_id    TEXT    DEFAULT NULL,
  p_session_id   TEXT    DEFAULT NULL,
  p_reason       TEXT    DEFAULT NULL,
  p_flags        TEXT[]  DEFAULT '{}',
  p_error        TEXT    DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_req_cnt  INT  := 0;
  v_ver_cnt  INT  := 0;
  v_secs_ago INT  := 0;
  v_id       BIGINT;
BEGIN
  -- Snapshot request count for this phone (before this insert)
  SELECT COALESCE(cnt, 0) INTO v_req_cnt
    FROM public.get_phone_otp_request_count(p_phone_hash => p_phone_hash);

  -- Snapshot verify count for this phone in last 24 h
  SELECT COALESCE(COUNT(*), 0)::INT INTO v_ver_cnt
    FROM public.phone_otp_attempts
    WHERE phone_hash   = p_phone_hash
      AND attempt_type = 'verify'
      AND created_at   > NOW() - '24 hours'::INTERVAL;

  -- Seconds since the most recent send for this phone
  SELECT COALESCE(
      EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))::INT,
      0
    )
    INTO v_secs_ago
    FROM public.phone_otp_attempts
    WHERE phone_hash   = p_phone_hash
      AND attempt_type IN ('request', 'resend')
      AND status        <> 'rate_limited'
      AND created_at    > NOW() - '24 hours'::INTERVAL;

  INSERT INTO public.phone_otp_attempts (
    user_id, phone_hash, ip_address, device_id, session_id,
    attempt_type, status, reason, suspicious_flags, error_message,
    request_count_today, verify_count_today, seconds_since_last_request
  ) VALUES (
    p_user_id, p_phone_hash, p_ip, p_device_id, p_session_id,
    p_attempt_type, p_status, p_reason, COALESCE(p_flags, '{}'), p_error,
    v_req_cnt, v_ver_cnt, v_secs_ago
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── 8. Daily summary view ────────────────────────────────────────────────────
-- Admin/ops monitoring only. NOT granted to authenticated or anon roles.
-- Access via: Supabase dashboard (service_role) or an admin edge function
-- that verifies profiles.is_admin = true before proxying results.

CREATE OR REPLACE VIEW public.phone_otp_daily_summary AS
SELECT
  (created_at AT TIME ZONE 'UTC')::DATE                              AS date,
  COUNT(*)::INT                                                      AS total_attempts,
  COUNT(*) FILTER (WHERE attempt_type IN ('request','resend'))::INT  AS send_count,
  COUNT(*) FILTER (WHERE attempt_type = 'verify')::INT               AS verify_count,
  COUNT(*) FILTER (WHERE status = 'success')::INT                    AS successful,
  COUNT(*) FILTER (WHERE status = 'rate_limited')::INT               AS rate_limited,
  COUNT(*) FILTER (WHERE status = 'suspicious')::INT                 AS suspicious,
  COUNT(*) FILTER (WHERE status IN ('failed','invalid_otp'))::INT    AS failed,
  COUNT(DISTINCT phone_hash)::INT                                    AS unique_phones,
  COUNT(DISTINCT user_id)::INT                                       AS unique_users,
  COUNT(DISTINCT ip_address)::INT                                    AS unique_ips
FROM public.phone_otp_attempts
GROUP BY (created_at AT TIME ZONE 'UTC')::DATE
ORDER BY 1 DESC;

-- Intentionally NO grant to 'authenticated' or 'anon'.
-- service_role has unrestricted access via Supabase internals.
-- Any authenticated admin query must go through a security-definer RPC
-- that validates profiles.is_admin = true.

-- ── 9. Function grants ───────────────────────────────────────────────────────
-- Edge functions call these via service_role key; explicit grants are
-- belt-and-suspenders documentation. service_role is a superuser equivalent
-- in Supabase and does not require GRANT, but stating it is intentional.

GRANT EXECUTE ON FUNCTION public.get_otp_resend_cooldown(INT)              TO service_role;
GRANT EXECUTE ON FUNCTION public.get_phone_otp_request_count(TEXT,UUID,TEXT,INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_phone_otp_rate_limit(TEXT,UUID,TEXT)      TO service_role;
GRANT EXECUTE ON FUNCTION public.log_phone_otp_attempt(TEXT,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT,TEXT[],TEXT) TO service_role;
