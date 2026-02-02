-- UAT REMEDIATION VERIFICATION: Check RLS policies on profiles table
-- This is a verification script to ensure all required security policies are in place

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check if RLS is enabled on profiles table
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = 'profiles';

  IF rls_enabled THEN
    RAISE NOTICE 'SUCCESS: RLS is enabled on profiles table';
  ELSE
    RAISE EXCEPTION 'FAILURE: RLS is NOT enabled on profiles table';
  END IF;
END $$;

-- List all policies on profiles table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Verify location column exists and has correct type
DO $$
DECLARE
  location_type TEXT;
BEGIN
  SELECT
    format_type(atttypid, atttypmod)
  INTO location_type
  FROM pg_attribute
  WHERE attrelid = 'profiles'::regclass
  AND attname = 'location';

  IF location_type IS NULL THEN
    RAISE WARNING 'OPTIONAL: location column does not exist (using latitude/longitude instead)';
  ELSIF location_type = 'geography' THEN
    RAISE NOTICE 'SUCCESS: location column has correct type: %', location_type;
  ELSE
    RAISE WARNING 'WARNING: location column has unexpected type: %', location_type;
  END IF;
END $$;

-- Verify GIST index exists for location
DO $$
DECLARE
  index_count INT;
BEGIN
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'profiles'
  AND indexname LIKE '%location%'
  AND indexdef LIKE '%GIST%';

  IF index_count > 0 THEN
    RAISE NOTICE 'SUCCESS: GIST index exists for location queries';
  ELSE
    RAISE WARNING 'WARNING: No GIST index found for location (may impact performance)';
  END IF;
END $$;

-- Verify required columns exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'profiles'::regclass AND attname = 'vouch_score') THEN
    RAISE NOTICE 'SUCCESS: vouch_score column exists';
  ELSE
    RAISE EXCEPTION 'FAILURE: vouch_score column is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'profiles'::regclass AND attname = 'emergency_mode') THEN
    RAISE NOTICE 'SUCCESS: emergency_mode column exists';
  ELSE
    RAISE EXCEPTION 'FAILURE: emergency_mode column is missing';
  END IF;
END $$;

-- Verify triage_cache table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'triage_cache') THEN
    RAISE NOTICE 'SUCCESS: triage_cache table exists';
  ELSE
    RAISE EXCEPTION 'FAILURE: triage_cache table is missing';
  END IF;
END $$;

-- Verify scan_rate_limits table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'scan_rate_limits') THEN
    RAISE NOTICE 'SUCCESS: scan_rate_limits table exists';
  ELSE
    RAISE EXCEPTION 'FAILURE: scan_rate_limits table is missing';
  END IF;
END $$;

-- Verify notification_logs table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'notification_logs') THEN
    RAISE NOTICE 'SUCCESS: notification_logs table exists';
  ELSE
    RAISE EXCEPTION 'FAILURE: notification_logs table is missing';
  END IF;
END $$;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'UAT REMEDIATION VERIFICATION COMPLETE';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'Check the output above for any FAILURE or WARNING messages';
  RAISE NOTICE 'All security-critical features should show SUCCESS';
END $$;
