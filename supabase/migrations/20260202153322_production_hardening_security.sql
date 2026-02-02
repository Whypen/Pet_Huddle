-- PRODUCTION HARDENING: DATABASE & SECURITY (PILLAR 3)
-- UAT Audit Remediation - Critical Security Fixes

-- =====================================================
-- TASK 1: Enable RLS on profiles table
-- =====================================================
-- CRITICAL: The profiles table was missing RLS protection
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing location policy if exists (will be recreated with enhanced Break-Glass logic)
DROP POLICY IF EXISTS "location_private_by_default" ON profiles;

-- =====================================================
-- TASK 2: Enhanced Break-Glass RLS Policy
-- =====================================================
-- Users can only see another user's location IF:
--   (a) They are the owner, OR
--   (b) The target user has emergency_mode = TRUE AND
--       the requester is within the alert radius (1km free, 5km premium)
--
-- SECURITY IMPROVEMENT: This policy now properly enforces Break-Glass Privacy
-- at the database level, preventing unauthorized location access even if
-- application logic is bypassed.

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
-- VERIFICATION & AUDIT
-- =====================================================
-- Log that RLS is now enabled on profiles
COMMENT ON TABLE profiles IS 'User profiles with RLS enabled. Location data protected by Break-Glass Privacy policy.';

-- Verify spatial index exists (should already exist from previous migration)
-- This index is critical for efficient proximity queries in Break-Glass policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'profiles'
    AND indexname = 'idx_profiles_location'
  ) THEN
    CREATE INDEX idx_profiles_location
      ON profiles USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
  END IF;
END $$;
