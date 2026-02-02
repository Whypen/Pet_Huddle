# UAT TESTING GUIDE - HUDDLE APP
**Production Hardening & RLS Fixes**

---

## 🔧 RECENT FIXES APPLIED

### **1. Triage Cache RLS Policy Fix** ✅
**Issue:** Client-side cache writes failing with 403 Forbidden
**Root Cause:** RLS policy only allowed `service_role` to write, but client needs to populate cache
**Fix Applied:** `20260202160000_fix_triage_cache_rls.sql`
- Allows authenticated users to INSERT cache entries
- Allows authenticated users to UPDATE hit counts
- Service role retains full access for maintenance

### **2. Notification Logs Table Missing** ✅
**Issue:** mesh-alert Edge Function referencing non-existent table
**Fix Applied:** `20260202160100_add_notification_logs.sql`
- Created `notification_logs` table with proper RLS
- Added indexes for performance
- Allows users to view logs for their own alerts

---

## 🧪 TESTING CHECKLIST

### **Pre-Test Setup**

1. **Apply Database Migrations:**
   ```bash
   cd supabase
   npx supabase db reset  # Development only
   # OR
   npx supabase db push   # Production
   ```

2. **Verify Tables Created:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('triage_cache', 'scan_rate_limits', 'notification_logs');
   ```

3. **Start Dev Server:**
   ```bash
   npm run dev
   ```

4. **Open Browser Console:**
   - Chrome/Edge: F12 → Console tab
   - Firefox: F12 → Console tab
   - Safari: Cmd+Option+C

---

## 📋 TEST SCENARIOS

### **Test 1: HazardScanner - Cache Flow** 🎯

**Objective:** Verify triage_cache is queried BEFORE OpenAI API call

**Steps:**
1. Navigate to `/hazard-scanner` (you may need to add route)
2. Open Network tab in DevTools
3. Upload an image (any image, e.g., chocolate bar photo)
4. Click "Scan for Hazards"

**Expected Behavior:**
✅ Console shows: `"Cache checking..."`
✅ Network tab shows query to `triage_cache` table
✅ If cache miss: Shows "Calling AI..." + API delay
✅ If cache hit: Instant result + "Found in cache - instant result!" toast
✅ NO 403 Forbidden errors in console

**Verification:**
```javascript
// Check console for:
[HazardScanner] Checking cache for hash: abc123...
[HazardScanner] Cache MISS - calling AI
// OR
[HazardScanner] Cache HIT - using cached result
```

**RLS Check:**
- Network tab → `triage_cache` query → Response should be `200 OK`
- No `403 Forbidden` or `401 Unauthorized` errors

---

### **Test 2: HazardScanner - Rate Limiting** 🚦

**Objective:** Verify free tier rate limiting (3 scans/hour)

**Steps:**
1. Create a new free-tier user (or use existing non-premium user)
2. Upload and scan 3 different images (1st, 2nd, 3rd scan)
3. Attempt 4th scan within 1 hour

**Expected Behavior:**
✅ Scans 1-3: Successful with normal flow
✅ Scan 4: Toast error: "Rate limit exceeded. Free tier: 3 scans per hour..."
✅ Scan button disabled or shows rate limit message

**Database Verification:**
```sql
-- Check rate limit table
SELECT COUNT(*) FROM scan_rate_limits
WHERE user_id = '<your-user-id>'
AND scan_timestamp > NOW() - INTERVAL '1 hour';
-- Should return 3
```

**Premium User Test:**
- Set `user_role = 'premium'` in profiles table
- Verify unlimited scans (no rate limiting)

---

### **Test 3: Cache Persistence & Deduplication** 🔄

**Objective:** Verify same image uses cache on second upload

**Steps:**
1. Upload image A (e.g., chocolate.jpg)
2. Scan image A → Cache MISS (1st time)
3. Wait for scan to complete
4. Delete the image preview
5. Upload THE SAME image A again
6. Scan again

**Expected Behavior:**
✅ 1st scan: "Calling AI..." (cache miss)
✅ 2nd scan: "Found in cache - instant result!" (cache hit)
✅ Result appears instantly (no 2-second AI delay)
✅ Network tab shows only database query, NO AI API call

**Cache Entry Verification:**
```sql
SELECT
  object_identified,
  hit_count,
  first_cached_at,
  last_accessed_at
FROM triage_cache
ORDER BY last_accessed_at DESC
LIMIT 5;
```

Expected:
- `hit_count` increments to 2 after 2nd scan
- `last_accessed_at` updates to current timestamp

---

### **Test 4: Mesh-Alert Notification Logs** 📲

**Objective:** Verify notification logs are created when alert is broadcast

**Steps:**
1. Navigate to Map page
2. Create a "Lost Pet" alert
3. Observe Edge Function invocation (if configured)

**Expected Behavior:**
✅ Alert created in `lost_pet_alerts` table
✅ Edge Function called (check Edge Function logs in Supabase)
✅ `notification_logs` table has new entry

**Database Verification:**
```sql
SELECT
  nl.notification_type,
  nl.recipients_count,
  nl.success_count,
  nl.failure_count,
  lpa.description
FROM notification_logs nl
JOIN lost_pet_alerts lpa ON nl.alert_id = lpa.id
ORDER BY nl.created_at DESC
LIMIT 5;
```

**Edge Function Test (Mock Mode):**
- With mock implementation, should return:
  ```json
  {
    "success": true,
    "notified": <number>,
    "message": "Mock notifications sent"
  }
  ```

---

### **Test 5: RLS Security Audit** 🔒

**Objective:** Verify users can't access other users' data

**Steps:**
1. Create User A and User B
2. User A uploads and scans an image
3. User B logs in
4. Check if User B can see User A's scan records

**Expected Behavior:**
✅ User B CANNOT see User A's entries in:
  - `hazard_identifications` (personal scans)
  - `scan_rate_limits` (personal rate limit history)
✅ User B CAN see shared cache in `triage_cache` (optimization)
✅ User B CANNOT see User A's `notification_logs`

**SQL Security Test:**
```sql
-- Run as User B (via Supabase client with User B's JWT)
SELECT * FROM hazard_identifications
WHERE user_id != auth.uid();
-- Should return 0 rows (RLS blocks)

SELECT * FROM triage_cache;
-- Should return all cached results (shared optimization)
```

---

## 🐛 COMMON ISSUES & FIXES

### **Issue: 403 Forbidden on triage_cache INSERT**
**Symptom:** Console error: `Failed to write to cache: 403`
**Fix:** Apply migration `20260202160000_fix_triage_cache_rls.sql`
**Verification:** Run `SELECT * FROM triage_cache` in Supabase SQL Editor

### **Issue: notification_logs table not found**
**Symptom:** Edge Function error: `relation "notification_logs" does not exist`
**Fix:** Apply migration `20260202160100_add_notification_logs.sql`
**Verification:** Check table exists in Supabase Dashboard → Database

### **Issue: Rate limit function not found**
**Symptom:** Error: `function check_scan_rate_limit does not exist`
**Fix:** Apply migration `20260202153400_production_hardening_ai_optimization.sql`
**Verification:** Run `SELECT check_scan_rate_limit('<uuid>')` in SQL Editor

### **Issue: Image compression fails**
**Symptom:** Console error: `imageCompression is not a function`
**Fix:** Install missing package:
```bash
npm install browser-image-compression
```

---

## 📊 PERFORMANCE METRICS TO TRACK

### **Cache Hit Rate:**
```sql
SELECT
  COUNT(*) as total_scans,
  SUM(CASE WHEN hit_count > 1 THEN 1 ELSE 0 END) as cache_hits,
  ROUND(100.0 * SUM(CASE WHEN hit_count > 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as hit_rate_percent
FROM triage_cache;
```

**Target:** >50% hit rate after 1 week of usage

### **Rate Limit Effectiveness:**
```sql
SELECT
  DATE(scan_timestamp) as scan_date,
  user_id,
  COUNT(*) as daily_scans
FROM scan_rate_limits
GROUP BY DATE(scan_timestamp), user_id
HAVING COUNT(*) > 3
ORDER BY daily_scans DESC;
```

**Target:** <1% of free users exceeding limit

### **Cost Savings:**
```sql
-- Estimate API cost savings from cache
SELECT
  COUNT(*) as total_requests,
  SUM(hit_count - 1) as cached_requests,
  ROUND(SUM(hit_count - 1) * 0.002, 2) as estimated_savings_usd
FROM triage_cache;
```

**Assumption:** $0.002 per GPT-4o-mini Vision API call

---

## ✅ SIGN-OFF CHECKLIST

Before marking UAT as complete:

- [ ] All migrations applied successfully
- [ ] No 403 Forbidden errors in console
- [ ] Cache flow works (check before AI call)
- [ ] Rate limiting enforces 3 scans/hour for free tier
- [ ] Cache hit increases hit_count
- [ ] Same image returns instant result on 2nd upload
- [ ] Premium users bypass rate limits
- [ ] Notification logs table exists and RLS works
- [ ] Users cannot access other users' scan history
- [ ] Users CAN access shared triage_cache
- [ ] Image compression reduces file size
- [ ] No console errors during normal flow

---

## 🚀 PRODUCTION DEPLOYMENT CHECKLIST

1. **Apply Migrations in Order:**
   ```bash
   # 1. Core pillars
   20260202000002_three_core_pillars.sql

   # 2. Production hardening
   20260202153400_production_hardening_ai_optimization.sql

   # 3. RLS fixes
   20260202160000_fix_triage_cache_rls.sql
   20260202160100_add_notification_logs.sql
   ```

2. **Set Environment Variables:**
   - `OPENAI_API_KEY` (for production AI)
   - `FCM_SERVICE_ACCOUNT_KEY` (for push notifications)

3. **Enable pg_cron for Cache Cleanup:**
   ```sql
   -- Run daily at 3 AM
   SELECT cron.schedule(
     'purge-expired-cache',
     '0 3 * * *',
     'SELECT purge_expired_cache();'
   );
   ```

4. **Monitor Edge Function Logs:**
   - Check Supabase Dashboard → Edge Functions → mesh-alert
   - Look for errors or performance issues

5. **Track Metrics:**
   - Cache hit rate
   - Rate limit violations
   - API cost reduction

---

## 📞 SUPPORT

**Issues or Questions?**
- Check `IMPLEMENTATION_SUMMARY.md` for detailed feature docs
- Review `supabase/migrations/` for database schema
- Check Edge Function logs in Supabase Dashboard

**Performance Issues?**
- Verify indexes exist: `\di` in psql
- Check RLS policy performance
- Monitor Edge Function execution time

---

**Last Updated:** February 2, 2026
**Version:** 2.1 (Production Hardening + RLS Fixes)
