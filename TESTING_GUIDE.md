# Testing Guide - UAT Remediation

## Quick Start

To verify the UAT remediation was successful, follow these test scenarios:

---

## Test 1: PILLAR 2 - AI Triage Cache ($0 Cost)

### Objective
Verify that duplicate image scans use the community cache and save API costs.

### Steps

1. **First Scan (Cache Miss)**
   ```
   - Open HazardScanner in the app
   - Take/upload a photo of chocolate
   - Click "Scan for Hazards"
   - Expected: Normal AI processing (~2 seconds)
   - Result stored in database
   ```

2. **Second Scan (Cache Hit)**
   ```
   - Delete the photo and take/upload the SAME chocolate image
   - Click "Scan for Hazards"
   - Expected: Instant result (<500ms)
   - Toast shows: "🎯 Found in community cache - $0 cost!"
   - Toast description shows hit count
   ```

3. **Verify in Database**
   ```sql
   SELECT
     image_hash,
     object_identified,
     hit_count,
     last_accessed_at,
     first_cached_at
   FROM triage_cache
   WHERE object_identified ILIKE '%chocolate%'
   ORDER BY last_accessed_at DESC
   LIMIT 5;
   ```

   Expected output:
   ```
   image_hash | object_identified | hit_count | last_accessed_at    | first_cached_at
   -----------|-------------------|-----------|---------------------|------------------
   abc123...  | Chocolate bar     | 2         | 2026-02-02 17:30:00 | 2026-02-02 17:25:00
   ```

### Success Criteria
- ✅ Cache hit shows instant result
- ✅ Toast notification displays "$0 cost"
- ✅ `hit_count` increments in database
- ✅ No API call made on second scan

---

## Test 2: Rate Limiting (3 scans/hour free tier)

### Objective
Verify that free-tier users are limited to 3 scans per hour.

### Steps

1. **Scan 3 different images**
   ```
   - Scan image 1 (chocolate)
   - Scan image 2 (grapes)
   - Scan image 3 (onion)
   - All should succeed
   ```

2. **Attempt 4th scan within same hour**
   ```
   - Scan image 4 (any new item)
   - Expected: Error toast appears
   - Message: "Rate limit exceeded. Free tier: 3 scans per hour..."
   ```

3. **Verify in Database**
   ```sql
   SELECT
     user_id,
     scan_timestamp,
     COUNT(*) OVER (
       PARTITION BY user_id
       ORDER BY scan_timestamp
       RANGE BETWEEN INTERVAL '1 hour' PRECEDING AND CURRENT ROW
     ) as scans_last_hour
   FROM scan_rate_limits
   WHERE user_id = '<YOUR_USER_ID>'
   ORDER BY scan_timestamp DESC
   LIMIT 10;
   ```

4. **Test Premium Bypass**
   ```sql
   -- Upgrade user to premium
   UPDATE profiles
   SET user_role = 'premium'
   WHERE id = '<YOUR_USER_ID>';

   -- Now attempt unlimited scans
   -- Should all succeed
   ```

### Success Criteria
- ✅ Free users blocked after 3 scans
- ✅ Premium users have unlimited scans
- ✅ Rate limit resets after 1 hour
- ✅ Toast shows upgrade prompt

---

## Test 3: PILLAR 1 - Mesh-Alert with Owner Filtering

### Objective
Verify that lost pet alerts exclude the owner from notifications and log to emergency_logs.

### Steps

1. **Create Test Users**
   ```sql
   -- Ensure you have at least 2 test users with locations
   SELECT id, display_name, latitude, longitude, vouch_score, fcm_token
   FROM profiles
   WHERE latitude IS NOT NULL
   LIMIT 5;
   ```

2. **Create Lost Pet Alert**
   ```
   - Log in as User A
   - Navigate to Mesh-Alert page
   - Create a lost pet alert
   - Note the alert_id from response
   ```

3. **Check Emergency Logs**
   ```sql
   SELECT
     alert_id,
     event_type,
     status,
     recipients_count,
     success_count,
     failure_count,
     error_message,
     metadata
   FROM emergency_logs
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   Expected output:
   ```
   event_type    | MOCK_SENT (if no FCM keys) or FCM_SENT
   status        | SUCCESS
   recipients_count | N (should NOT include alert owner)
   metadata      | { "filtered_owner": true, "batches_sent": 1 }
   ```

4. **Verify Owner Exclusion**
   ```sql
   -- Get alert owner
   SELECT owner_id FROM lost_pet_alerts WHERE id = '<ALERT_ID>';

   -- Verify this owner_id is NOT in the notification recipients
   -- Check mesh-alert function logs or emergency_logs metadata
   ```

5. **Test with 50+ Neighbors (Batching)**
   ```sql
   -- Create 60 test users with FCM tokens near alert location
   -- (This would be in a test environment)

   -- Create alert
   -- Expected in emergency_logs:
   -- recipients_count: 60
   -- metadata.batches_sent: 1 (500 tokens per batch, so 60 fits in 1)
   ```

### Success Criteria
- ✅ Alert owner NOT included in recipients_count
- ✅ emergency_logs entry created (even without FCM keys)
- ✅ Event type is MOCK_SENT when FCM keys missing
- ✅ Event type is FCM_SENT when FCM keys present
- ✅ Batching works for 50+ neighbors

---

## Test 4: PILLAR 3 - Break-Glass Privacy with Geography Column

### Objective
Verify that location data is protected by RLS and the new geography column works correctly.

### Steps

1. **Test Own Location Access**
   ```sql
   -- As authenticated user
   SELECT id, display_name, location, emergency_mode
   FROM profiles
   WHERE id = auth.uid();

   -- Expected: Should return your own profile
   ```

2. **Test Unauthorized Access**
   ```sql
   -- Try to access another user's location (emergency_mode = false)
   SELECT id, display_name, location
   FROM profiles
   WHERE id != auth.uid()
   AND emergency_mode = false;

   -- Expected: Returns 0 rows (RLS blocks it)
   ```

3. **Test Emergency Mode Access**
   ```sql
   -- User B enables emergency mode
   UPDATE profiles
   SET emergency_mode = true
   WHERE id = '<USER_B_ID>';

   -- User A (within 1km of User B) queries
   SELECT id, display_name, location, emergency_mode
   FROM profiles
   WHERE id = '<USER_B_ID>';

   -- Expected: Should return User B's profile
   ```

4. **Test Care Circle Access**
   ```sql
   -- User B adds User A to care circle
   UPDATE profiles
   SET care_circle = ARRAY['<USER_A_ID>']::UUID[]
   WHERE id = '<USER_B_ID>';

   -- User A queries User B's location
   SELECT id, display_name, location
   FROM profiles
   WHERE id = '<USER_B_ID>';

   -- Expected: Should return User B's profile (even if out of radius)
   ```

5. **Verify Geography Column Performance**
   ```sql
   -- Check that GIST index is being used
   EXPLAIN ANALYZE
   SELECT id, display_name, ST_AsText(location)
   FROM profiles
   WHERE ST_DWithin(
     location,
     ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
     1000
   )
   LIMIT 10;

   -- Expected output should show:
   -- "Index Scan using idx_profiles_location_geography"
   ```

### Success Criteria
- ✅ Users can ONLY see their own location by default
- ✅ Emergency mode grants access to Care Circle
- ✅ Emergency mode grants access to users within radius
- ✅ Proximity queries use GIST index (not sequential scan)
- ✅ Location column uses geography(POINT, 4326) type

---

## Test 5: Migration Verification

### Objective
Run automated verification to ensure all database changes are correct.

### Steps

1. **Run Verification Script**
   ```bash
   supabase db execute -f supabase/migrations/20260202170001_verify_rls_policies.sql
   ```

   Expected output:
   ```
   NOTICE:  SUCCESS: RLS is enabled on profiles table
   NOTICE:  SUCCESS: location column has correct type: geography
   NOTICE:  SUCCESS: GIST index exists for location queries
   NOTICE:  SUCCESS: vouch_score column exists
   NOTICE:  SUCCESS: emergency_mode column exists
   NOTICE:  SUCCESS: triage_cache table exists
   NOTICE:  SUCCESS: scan_rate_limits table exists
   NOTICE:  SUCCESS: notification_logs table exists
   NOTICE:  SUCCESS: emergency_logs table exists
   ```

2. **Check for FAILURE or WARNING Messages**
   ```
   If any FAILURE messages appear:
   - Check the migration was applied correctly
   - Verify the table/column exists
   - Check RLS is enabled

   If WARNING messages appear:
   - These are non-critical but should be reviewed
   - May indicate optional features not configured
   ```

### Success Criteria
- ✅ All checks show SUCCESS
- ✅ No FAILURE messages
- ✅ WARNINGs (if any) are acceptable

---

## Test 6: End-to-End User Flow

### Objective
Simulate a real user journey through all three pillars.

### Scenario
"Pet owner finds their dog ate chocolate and needs help from neighbors"

### Steps

1. **Phase 1: Hazard Identification (PILLAR 2)**
   ```
   - User opens HazardScanner
   - Takes photo of chocolate wrapper
   - Scans image
   - Result: "Chocolate bar" - HIGH toxicity
   - Selects "Ingested!" option
   - Sees emergency action advice
   ```

2. **Phase 2: Emergency Mode Activation (PILLAR 3)**
   ```
   - User navigates to Profile
   - Enables "Emergency Mode" toggle
   - Location becomes visible to Care Circle + nearby users
   ```

3. **Phase 3: Mesh-Alert Notification (PILLAR 1)**
   ```
   - User creates lost pet alert (if dog ran away in panic)
   - OR requests help from neighbors via community
   - Mesh-alert sends notifications to nearby verified users
   - Alert owner excluded from notifications
   - Emergency log created with MOCK_SENT status
   ```

4. **Phase 4: Verification**
   ```sql
   -- Check hazard scan was cached
   SELECT * FROM triage_cache
   WHERE object_identified ILIKE '%chocolate%';

   -- Check emergency mode is active
   SELECT emergency_mode, location FROM profiles
   WHERE id = '<USER_ID>';

   -- Check alert was logged
   SELECT * FROM emergency_logs
   WHERE alert_id = '<ALERT_ID>';
   ```

### Success Criteria
- ✅ Hazard scan completes successfully
- ✅ Emergency mode enables location sharing
- ✅ Mesh-alert sends to correct recipients
- ✅ All events logged to database
- ✅ Cache hit on duplicate scan

---

## Database Queries for Quick Checks

### Check Cache Performance
```sql
SELECT
  COUNT(*) as total_cache_entries,
  SUM(hit_count) as total_cache_hits,
  ROUND(AVG(hit_count), 2) as avg_hits_per_entry,
  ROUND((SUM(hit_count)::FLOAT / COUNT(*)::FLOAT - 1) * 100, 2) as cache_efficiency_pct
FROM triage_cache;

-- Good performance: avg_hits_per_entry > 1.5
-- Great performance: cache_efficiency_pct > 50%
```

### Check Alert Activity
```sql
SELECT
  DATE(created_at) as date,
  event_type,
  COUNT(*) as event_count,
  AVG(recipients_count) as avg_recipients,
  SUM(success_count) as total_success,
  SUM(failure_count) as total_failures
FROM emergency_logs
GROUP BY DATE(created_at), event_type
ORDER BY date DESC, event_type;
```

### Check Rate Limit Usage
```sql
SELECT
  p.display_name,
  p.user_role,
  COUNT(*) as scans_today,
  MAX(srl.scan_timestamp) as last_scan
FROM scan_rate_limits srl
JOIN profiles p ON p.id = srl.user_id
WHERE srl.scan_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY p.id, p.display_name, p.user_role
ORDER BY scans_today DESC;
```

### Check Emergency Mode Users
```sql
SELECT
  id,
  display_name,
  emergency_mode,
  ARRAY_LENGTH(care_circle, 1) as care_circle_size,
  ST_AsText(location) as location_point,
  updated_at
FROM profiles
WHERE emergency_mode = true
ORDER BY updated_at DESC;
```

---

## Performance Benchmarks

### Expected Query Times (with GIST index)

| Query Type | Expected Time | Notes |
|------------|---------------|-------|
| Cache lookup by hash | < 10ms | Uses unique index |
| Proximity search (1km) | < 50ms | Uses GIST index |
| Rate limit check | < 20ms | Uses composite index |
| RLS policy evaluation | < 30ms | Cached per session |

### Test Query Performance
```sql
-- Proximity query (should be fast with GIST index)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, display_name
FROM profiles
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
  1000
)
LIMIT 10;

-- Look for:
-- "Index Scan using idx_profiles_location_geography"
-- Execution time < 50ms
```

---

## Rollback Testing

If issues are found, verify rollback works:

```sql
-- Simulate rollback
BEGIN;

-- Drop new objects
DROP TABLE IF EXISTS emergency_logs CASCADE;
DROP INDEX IF EXISTS idx_profiles_location_geography;

-- Verify app still functions (with reduced features)

ROLLBACK;  -- Don't actually commit this
```

---

## Success Metrics

### System Health
- ✅ All migrations applied without errors
- ✅ All RLS policies active
- ✅ All indexes present and used
- ✅ No performance degradation

### Feature Functionality
- ✅ Cache hit rate > 30% within 1 week
- ✅ 0 alert owners receive self-notifications
- ✅ Emergency mode properly gates location access
- ✅ Rate limits prevent abuse

### Cost Savings
- ✅ AI API costs reduced by ~80%
- ✅ Database queries optimized (GIST index)
- ✅ No unnecessary FCM calls

---

## Troubleshooting Common Issues

### Issue: Cache not hitting
**Cause:** Image compression changing hash
**Solution:** Ensure same compression settings on all scans

### Issue: RLS denying access
**Cause:** User not authenticated or emergency_mode = false
**Solution:** Check auth.uid() and emergency_mode status

### Issue: Emergency logs not appearing
**Cause:** Service role key not set
**Solution:** Set SUPABASE_SERVICE_ROLE_KEY in Edge Function

### Issue: Slow proximity queries
**Cause:** GIST index not being used
**Solution:** Run ANALYZE on profiles table, check index exists

---

**Last Updated:** 2026-02-02
**Status:** Ready for Testing
