-- FIX: Allow authenticated users to write to triage_cache
-- UAT Issue: Client-side cache writes were failing due to restrictive RLS policy

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "service_role_writes_cache" ON triage_cache;

-- Create new policy that allows authenticated users to insert cache entries
-- This enables client-side cache population after AI scans
CREATE POLICY "authenticated_users_write_cache"
  ON triage_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update cache hit counts
CREATE POLICY "authenticated_users_update_cache_hits"
  ON triage_cache
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Keep service role full access for maintenance
CREATE POLICY "service_role_full_access_cache"
  ON triage_cache
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON POLICY "authenticated_users_write_cache" ON triage_cache IS
  'Allows client-side cache population after AI scans to reduce API costs';
