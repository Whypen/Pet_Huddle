-- UAT REMEDIATION: Add location geography column and update RLS policy
-- This migration adds a proper geography(POINT, 4326) column to profiles
-- and updates the Break-Glass Privacy RLS policy to use it

-- =====================================================
-- TASK 1: Add location geography column
-- =====================================================
-- Add the new location column as geography(POINT, 4326)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location geography(POINT, 4326);

-- Migrate existing latitude/longitude data to the new location column
UPDATE profiles
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NULL;

-- Create GIST index on the new location column
CREATE INDEX IF NOT EXISTS idx_profiles_location_geography
  ON profiles USING GIST (location);

-- =====================================================
-- TASK 2: Update Break-Glass RLS Policy
-- =====================================================
-- Drop the existing policy
DROP POLICY IF EXISTS "break_glass_location_access" ON profiles;
DROP POLICY IF EXISTS "location_private_by_default" ON profiles;

-- Create the updated policy using the new location column
CREATE POLICY "location_private_by_default"
  ON profiles
  FOR SELECT
  USING (
    -- Owner can always see their own profile
    auth.uid() = id
    OR
    -- Break-Glass Privacy: Emergency mode allows location sharing
    (
      emergency_mode = TRUE
      AND location IS NOT NULL
      AND (
        -- Care Circle members have access
        auth.uid() = ANY(care_circle)
        OR
        -- Users within alert radius can see location
        EXISTS (
          SELECT 1 FROM profiles requester
          WHERE requester.id = auth.uid()
          AND requester.location IS NOT NULL
          AND ST_DWithin(
            location,
            requester.location,
            CASE WHEN requester.user_role = 'premium' THEN 5000 ELSE 1000 END
          )
        )
      )
    )
  );

-- Keep the update and insert policies
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own_profile" ON profiles;
CREATE POLICY "users_insert_own_profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- TASK 3: Update find_nearby_users function
-- =====================================================
-- Update the function to use the new location column
CREATE OR REPLACE FUNCTION find_nearby_users(
  alert_lat DOUBLE PRECISION,
  alert_lng DOUBLE PRECISION,
  radius_meters INT DEFAULT 1000,
  min_vouch_score INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  fcm_token TEXT,
  vouch_score INT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.fcm_token,
    p.vouch_score,
    ST_Distance(
      p.location,
      ST_SetSRID(ST_MakePoint(alert_lng, alert_lat), 4326)::geography
    ) AS distance_meters
  FROM profiles p
  WHERE
    p.vouch_score >= min_vouch_score
    AND p.location IS NOT NULL
    AND p.fcm_token IS NOT NULL
    AND ST_DWithin(
      p.location,
      ST_SetSRID(ST_MakePoint(alert_lng, alert_lat), 4326)::geography,
      radius_meters
    )
  ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VERIFICATION & AUDIT
-- =====================================================
COMMENT ON COLUMN profiles.location IS 'User location as geography(POINT, 4326) for efficient spatial queries. Protected by Break-Glass Privacy RLS.';

-- Note: We keep latitude/longitude columns for backward compatibility
-- but new code should use the location column
