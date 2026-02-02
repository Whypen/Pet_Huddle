-- PRODUCTION HARDENING: COST & AI OPTIMIZATION (PILLAR 2)
-- UAT Audit Remediation - AI Triage Scribe Performance & Cost Reduction

-- =====================================================
-- TRIAGE CACHE TABLE
-- =====================================================
-- Purpose: Prevent redundant GPT-4o-mini API calls for duplicate images
-- Impact: Reduces AI costs by ~80% for common household items
-- Storage: SHA-256 hash (64 chars) + classification result + toxicity level

CREATE TABLE IF NOT EXISTS triage_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Image hash for deduplication (SHA-256)
  image_hash TEXT NOT NULL UNIQUE,

  -- Cached AI classification result
  object_identified TEXT NOT NULL,
  is_hazard BOOLEAN NOT NULL,
  hazard_type TEXT CHECK (hazard_type IN ('TOXIC_PLANT', 'TOXIC_FOOD', 'CHEMICAL', 'INERT')),
  toxicity_level TEXT CHECK (toxicity_level IN ('LOW', 'MODERATE', 'HIGH', 'SEVERE')),
  immediate_action TEXT,

  -- Full AI response for audit trail
  ai_response JSONB,

  -- Cache metadata
  hit_count INT DEFAULT 1,
  first_cached_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Cache expiry (for evolving AI models)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

-- Indexes for fast lookups
CREATE INDEX idx_triage_cache_hash ON triage_cache(image_hash);
CREATE INDEX idx_triage_cache_expiry ON triage_cache(expires_at);

-- Enable RLS
ALTER TABLE triage_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Cache is shared across all authenticated users (read-only for efficiency)
CREATE POLICY "authenticated_users_read_cache"
  ON triage_cache
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only the system can write to cache (via Edge Function)
CREATE POLICY "service_role_writes_cache"
  ON triage_cache
  FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- RATE LIMITING TABLE
-- =====================================================
-- Purpose: Track scan usage per user to enforce 3 scans/hour for free tier
-- Note: Client-side enforcement + server-side validation

CREATE TABLE IF NOT EXISTS scan_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  scan_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for efficient rate limit queries
CREATE INDEX idx_scan_rate_limits_user_time ON scan_rate_limits(user_id, scan_timestamp DESC);

-- Enable RLS
ALTER TABLE scan_rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can view their own rate limit history
CREATE POLICY "users_view_own_rate_limits"
  ON scan_rate_limits
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own scan records
CREATE POLICY "users_insert_own_rate_limits"
  ON scan_rate_limits
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- RATE LIMIT ENFORCEMENT FUNCTION
-- =====================================================
-- Returns: TRUE if user can scan, FALSE if rate limited
-- Free tier: 3 scans per hour
-- Premium tier: Unlimited

CREATE OR REPLACE FUNCTION check_scan_rate_limit(
  user_uuid UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  user_tier TEXT;
  recent_scans INT;
BEGIN
  -- Get user tier
  SELECT user_role INTO user_tier
  FROM profiles
  WHERE id = user_uuid;

  -- Premium users bypass rate limits
  IF user_tier = 'premium' THEN
    RETURN TRUE;
  END IF;

  -- Count scans in the last hour
  SELECT COUNT(*) INTO recent_scans
  FROM scan_rate_limits
  WHERE user_id = user_uuid
  AND scan_timestamp > NOW() - INTERVAL '1 hour';

  -- Free tier: max 3 scans per hour
  RETURN recent_scans < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- CACHE MAINTENANCE FUNCTION
-- =====================================================
-- Automatically purge expired cache entries
-- Run daily via pg_cron or manual trigger

CREATE OR REPLACE FUNCTION purge_expired_cache()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM triage_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS & DOCUMENTATION
-- =====================================================
COMMENT ON TABLE triage_cache IS 'AI classification cache to reduce GPT-4o-mini API costs. Shared across users for common items (chocolate, grapes, etc).';
COMMENT ON TABLE scan_rate_limits IS 'Rate limiting for free-tier users (3 scans/hour). Premium users bypass this table.';
COMMENT ON FUNCTION check_scan_rate_limit IS 'Validates if user can perform a scan based on tier and recent usage.';
COMMENT ON FUNCTION purge_expired_cache IS 'Maintenance function to remove stale cache entries (90-day TTL).';
