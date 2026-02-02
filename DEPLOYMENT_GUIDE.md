# Deployment Guide - UAT Remediation

## Prerequisites
- Supabase CLI installed (`npm install -g supabase`)
- Supabase project: `odxzuymckzalelypqnhk`

## Migration Files to Deploy

The following migrations need to be applied in order:

### 1. Location Geography Column (NEW)
**File:** `supabase/migrations/20260202170000_uat_remediation_location_geography.sql`
- Adds `location geography(POINT, 4326)` column to profiles
- Creates GIST index for spatial queries
- Updates RLS policy to use new location column
- Migrates existing latitude/longitude data

### 2. Emergency Logs Table (NEW)
**File:** `supabase/migrations/20260202170100_create_emergency_logs.sql`
- Creates `emergency_logs` table for tracking mesh-alert events
- Supports MOCK_SENT logging when FCM keys are missing
- Enables testing without Firebase configuration

### 3. Verification Script (NEW)
**File:** `supabase/migrations/20260202170001_verify_rls_policies.sql`
- Verifies all security policies are in place
- Checks required columns and indexes exist
- Provides SUCCESS/FAILURE/WARNING feedback

## Deployment Steps

### Option 1: Supabase CLI (Recommended)

```bash
# Navigate to project directory
cd "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle"

# Link to your Supabase project (if not already linked)
supabase link --project-ref odxzuymckzalelypqnhk

# Push migrations to database
supabase db push

# Verify deployment
supabase db execute -f supabase/migrations/20260202170001_verify_rls_policies.sql
```

### Option 2: Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/odxzuymckzalelypqnhk/editor
2. Navigate to SQL Editor
3. Execute migrations in order:
   - `20260202170000_uat_remediation_location_geography.sql`
   - `20260202170100_create_emergency_logs.sql`
   - `20260202170001_verify_rls_policies.sql`

### Option 3: Direct SQL (for quick deployment)

```bash
# Using psql (replace with your connection string)
psql -h db.odxzuymckzalelypqnhk.supabase.co -U postgres -d postgres \
  -f supabase/migrations/20260202170000_uat_remediation_location_geography.sql

psql -h db.odxzuymckzalelypqnhk.supabase.co -U postgres -d postgres \
  -f supabase/migrations/20260202170100_create_emergency_logs.sql

# Run verification
psql -h db.odxzuymckzalelypqnhk.supabase.co -U postgres -d postgres \
  -f supabase/migrations/20260202170001_verify_rls_policies.sql
```

## Post-Deployment Verification

### 1. Check RLS Policies
```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('profiles', 'emergency_logs', 'triage_cache', 'scan_rate_limits')
ORDER BY tablename, policyname;
```

Expected output:
- `profiles.location_private_by_default` (SELECT)
- `profiles.users_update_own_profile` (UPDATE)
- `profiles.users_insert_own_profile` (INSERT)
- `emergency_logs.users_view_own_emergency_logs` (SELECT)
- `emergency_logs.service_role_insert_emergency_logs` (INSERT)
- `triage_cache.authenticated_users_read_cache` (SELECT)
- `scan_rate_limits.users_view_own_rate_limits` (SELECT)

### 2. Verify Location Column
```sql
SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name IN ('location', 'latitude', 'longitude');
```

Expected output:
- `location` → `USER-DEFINED` (geography)
- `latitude` → `double precision`
- `longitude` → `double precision`

### 3. Check Indexes
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'profiles' AND indexname LIKE '%location%';
```

Expected output:
- `idx_profiles_location_geography` (GIST index on location)
- `idx_profiles_location` (GIST index on lat/lng - legacy)

### 4. Test Cache Query
```sql
-- This should work if triage_cache has data
SELECT image_hash, object_identified, hit_count
FROM triage_cache
LIMIT 5;
```

### 5. Test Emergency Logs
```sql
-- Check if table exists and is accessible
SELECT COUNT(*) FROM emergency_logs;
```

## Edge Function Deployment

### Deploy mesh-alert function:
```bash
# Deploy the updated mesh-alert function
supabase functions deploy mesh-alert

# Or manually via dashboard:
# 1. Go to Edge Functions in dashboard
# 2. Create/update 'mesh-alert' function
# 3. Copy contents of supabase/functions/mesh-alert/index.ts
```

## Frontend Build & Deploy

```bash
# Install dependencies if needed
npm install

# Build for production
npm run build

# Test locally first
npm run dev
```

## Testing Checklist

### Test PILLAR 1: Mesh-Alert
- [ ] Create a lost pet alert
- [ ] Check `emergency_logs` table for MOCK_SENT entry
- [ ] Verify `recipients_count` excludes the alert owner
- [ ] Verify `batches_sent` is calculated correctly

```sql
SELECT * FROM emergency_logs ORDER BY created_at DESC LIMIT 5;
```

### Test PILLAR 2: AI Triage Cache
- [ ] Scan an image (e.g., chocolate)
- [ ] Verify toast shows "🎯 Found in community cache - $0 cost!"
- [ ] Check cache hit count increments
- [ ] Scan the SAME image again
- [ ] Should see cache hit immediately

```sql
SELECT image_hash, object_identified, hit_count, last_accessed_at
FROM triage_cache
ORDER BY last_accessed_at DESC
LIMIT 10;
```

### Test PILLAR 3: Break-Glass Privacy
- [ ] Enable emergency mode on a profile
- [ ] Verify other users within radius can see location
- [ ] Disable emergency mode
- [ ] Verify location is now private

```sql
-- Test query (replace USER_ID with actual ID)
SELECT id, display_name, emergency_mode, location
FROM profiles
WHERE id = 'USER_ID';
```

## Rollback Plan

If issues occur, migrations can be rolled back:

```bash
# Rollback last migration
supabase db reset

# Or manually drop objects:
```

```sql
-- Rollback emergency_logs
DROP TABLE IF EXISTS emergency_logs CASCADE;

-- Rollback location column (keep for now, just drop index)
DROP INDEX IF EXISTS idx_profiles_location_geography;
ALTER TABLE profiles DROP COLUMN IF EXISTS location;

-- Re-enable old policy
CREATE POLICY "break_glass_location_access" ON profiles FOR SELECT USING (...);
```

## Environment Variables

Ensure these are set in Supabase Edge Functions:

```bash
# Required
SUPABASE_URL=https://odxzuymckzalelypqnhk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Optional (for production FCM)
FCM_SERVICE_ACCOUNT_KEY=<firebase-service-account-json>
```

## Cost Monitoring

After deployment, monitor:
- **AI API costs:** Should see 80% reduction due to cache
- **Database size:** triage_cache table growth
- **Query performance:** ST_DWithin queries should be fast with GIST index

```sql
-- Check cache effectiveness
SELECT
  COUNT(*) as total_entries,
  SUM(hit_count) as total_hits,
  AVG(hit_count) as avg_hits_per_entry
FROM triage_cache;

-- Expected: avg_hits_per_entry > 1.5 indicates good cache performance
```

## Troubleshooting

### Issue: RLS policy denies access
**Solution:** Check if user is authenticated and has correct role
```sql
SELECT auth.uid(), auth.role();
```

### Issue: Location queries are slow
**Solution:** Verify GIST index exists
```sql
EXPLAIN ANALYZE
SELECT * FROM profiles
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography, 1000);

-- Should show "Index Scan using idx_profiles_location_geography"
```

### Issue: Emergency logs not appearing
**Solution:** Check service role key is set in Edge Function
```bash
supabase secrets list
```

### Issue: Cache not hitting
**Solution:** Check image hash generation
```typescript
// In browser console after scan:
console.log("Image hash:", imageHash);
```

## Success Criteria

✅ All migrations applied without errors
✅ Verification script shows all SUCCESS messages
✅ Cache hit shows toast with "$0 cost"
✅ Mesh-alert creates emergency_logs entry
✅ Alert owner excluded from recipients
✅ Location queries use GIST index

---

**Last Updated:** 2026-02-02
**Status:** Ready for Deployment
