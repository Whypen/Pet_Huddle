-- =====================================================
-- PRODUCTION HARDENING MIGRATION
-- Pet Huddle UAT Audit Remediation
-- =====================================================
-- This migration consolidates all production-readiness fixes
-- for moving from prototype to production-ready system.
--
-- Generated: 2026-02-02
-- Author: Systems Engineering Team
-- Status: Ready for deployment
-- =====================================================

-- =====================================================
-- PILLAR 3: DATABASE & SECURITY
-- =====================================================

-- Enable PostGIS extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Ensure spatial index exists on profiles (should already exist from previous migrations)
CREATE INDEX IF NOT EXISTS idx_profiles_location
  ON profiles USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));

-- CRITICAL SECURITY FIX: Enable Row Level Security on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing location policy if exists (will be recreated with enhanced Break-Glass logic)
DROP POLICY IF EXISTS "location_private_by_default" ON profiles;

-- Enhanced Break-Glass RLS Policy
-- Users can only see another user's location IF:
--   (a) They are the owner, OR
--   (b) The target user has emergency_mode = TRUE AND
--       the requester is within the alert radius (1km free, 5km premium)
CREATE POLICY "break_glass_location_access"
  ON profiles
  FOR SELECT
  USING (
    -- Owner can always see their own profile
    auth.uid() = id
    OR
    -- Break-Glass Privacy: Emergency mode allows location sharing
    (
      emergency_mode = TRUE
      AND (
        -- Care Circle members have access
        auth.uid() = ANY(care_circle)
        OR
        -- Users within alert radius can see location
        (
          latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM profiles requester
            WHERE requester.id = auth.uid()
            AND requester.latitude IS NOT NULL
            AND requester.longitude IS NOT NULL
            AND ST_DWithin(
              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
              ST_SetSRID(ST_MakePoint(requester.longitude, requester.latitude), 4326)::geography,
              CASE WHEN requester.user_role = 'premium' THEN 5000 ELSE 1000 END
            )
          )
        )
      )
    )
  );

-- Allow users to update their own profiles
CREATE POLICY "users_update_own_profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow users to insert their own profile (registration)
CREATE POLICY "users_insert_own_profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- PILLAR 2: COST & AI OPTIMIZATION
-- =====================================================

-- Triage Cache Table (prevents redundant GPT-4o-mini calls)
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
CREATE INDEX IF NOT EXISTS idx_triage_cache_hash ON triage_cache(image_hash);
CREATE INDEX IF NOT EXISTS idx_triage_cache_expiry ON triage_cache(expires_at) WHERE expires_at > NOW();

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

-- Rate Limiting Table
CREATE TABLE IF NOT EXISTS scan_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  scan_timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_scan_rate_limits_user_time ON scan_rate_limits(user_id, scan_timestamp DESC);

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

-- Rate Limit Enforcement Function
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

-- Cache Maintenance Function
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
-- PILLAR 1: LOGISTICS & SCALE (Database Components)
-- =====================================================
-- NOTE: The mesh-alert Edge Function has been refactored with:
-- - Production-grade error handling
-- - FCM batching (500 tokens per batch) to prevent timeouts
-- - SUPABASE_SERVICE_ROLE_KEY for database queries
-- - FCM_SERVICE_ACCOUNT_KEY placeholder for Firebase integration
--
-- The find_nearby_users() function already integrates vouch_score
-- and emergency_mode from the three_core_pillars migration.

-- =====================================================
-- COMMENTS & DOCUMENTATION
-- =====================================================
COMMENT ON TABLE profiles IS 'User profiles with RLS enabled. Location data protected by Break-Glass Privacy policy.';
COMMENT ON TABLE triage_cache IS 'AI classification cache to reduce GPT-4o-mini API costs. Shared across users for common items (chocolate, grapes, etc).';
COMMENT ON TABLE scan_rate_limits IS 'Rate limiting for free-tier users (3 scans/hour). Premium users bypass this table.';
COMMENT ON FUNCTION check_scan_rate_limit IS 'Validates if user can perform a scan based on tier and recent usage.';
COMMENT ON FUNCTION purge_expired_cache IS 'Maintenance function to remove stale cache entries (90-day TTL).';

-- =====================================================
-- DEPLOYMENT VERIFICATION
-- =====================================================
-- After applying this migration, verify:
-- 1. RLS is enabled on profiles: SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'profiles';
-- 2. Break-Glass policy exists: SELECT * FROM pg_policies WHERE tablename = 'profiles';
-- 3. Triage cache is created: SELECT COUNT(*) FROM triage_cache;
-- 4. Rate limit function works: SELECT check_scan_rate_limit('test-uuid');
-- 5. Spatial indexes exist: SELECT indexname FROM pg_indexes WHERE tablename = 'profiles' AND indexname LIKE '%location%';

-- =====================================================
-- ROLLBACK PLAN (if needed)
-- =====================================================
-- To rollback this migration:
-- 1. DROP TABLE triage_cache CASCADE;
-- 2. DROP TABLE scan_rate_limits CASCADE;
-- 3. DROP FUNCTION check_scan_rate_limit(UUID);
-- 4. DROP FUNCTION purge_expired_cache();
-- 5. DROP POLICY break_glass_location_access ON profiles;
-- 6. DROP POLICY users_update_own_profile ON profiles;
-- 7. DROP POLICY users_insert_own_profile ON profiles;
-- 8. ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
