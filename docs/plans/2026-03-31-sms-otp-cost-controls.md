# SMS OTP Cost Control Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement server-side rate limiting, resend cooldowns, country restrictions, and attempt logging for SMS OTP in the VerifyIdentity phone verification flow.

**Architecture:** Centralize OTP request/verify logic into one canonical server-controlled path (edge functions) that enforces rate limits per IP/user/phone/device, implements resend cooldown ladder (60s → 120s → 300s), validates country allowlist before SMS send, and logs all attempts to a new `phone_otp_attempts` table. Keep Supabase Auth native SMS as the single OTP delivery mechanism (no Twilio Verify).

**Tech Stack:** Supabase Auth native SMS, Deno edge functions, PostgreSQL RLS, TypeScript client library.

---

## CURRENT STATE AUDIT

### A. Current OTP Send Path (FRAGMENTED)

**Frontend entry point:** `src/pages/VerifyIdentity.tsx:1428` → `onSendPhoneOtp()`
```
VerifyIdentity.tsx:1437 → requestPhoneOtp(normalizedPhone)
  ↓
src/lib/phoneOtp.ts:25 → requestPhoneOtp()
  ├─ If session exists → supabase.auth.updateUser({phone})
  └─ Else → supabase.auth.signInWithOtp({phone, options: {channel: "sms"}})
```

**Issue:** Direct client-side call to Supabase Auth. NO rate limiting, NO logging, NO country check, NO cooldown.

### B. Current OTP Verify Path (FRAGMENTED)

**Frontend entry point:** `src/pages/VerifyIdentity.tsx:1448` → `onVerifyPhoneOtp()`
```
VerifyIdentity.tsx:1458 → verifyPhoneOtp(normalizedPhone, normalizedCode)
  ↓
src/lib/phoneOtp.ts:61 → verifyPhoneOtp()
  ├─ Determine otpType (phone_change or sms based on session)
  └─ supabase.auth.verifyOtp({phone, token, type: otpType})
```

**Issue:** Direct client-side call to Supabase Auth. NO attempt limiting (can brute-force 6-digit OTP), NO logging, NO defensive checks.

### C. Twilio Runtime Usage

**Credentials present:** `backend.env.md:29-31` (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID)
**Usage in code:** NONE. Not wired into any edge function or auth flow.
**SMS delivery provider:** Supabase Auth uses its own provider (likely Twilio underneath, but undocumented).
**Cost implication:** SMS cost is from Supabase Auth, not directly controllable via Twilio config in this codebase.

### D. Device ID / Session ID Status

**Device fingerprinting exists:** `src/lib/deviceFingerprint.ts` uses FingerprintJS → `visitorId`
**Where tracked:** `trackDeviceFingerprint()` called at VerifyIdentity.tsx:1249 (entry point only)
**Integration with OTP:** NOT integrated. Device fingerprint is tracked separately, not passed to OTP functions.
**Limitation:** No stable device_id in the OTP request/verify flow. Will use `visitorId` from FingerprintJS, but ONLY if we capture it fresh before OTP request.

### E. Supabase Auth OTP Configuration Audit

**Cannot verify from code/terminal:**
- SMS provider type (Twilio vs other)
- SMS rate limit settings (per-project quota, per-phone quota)
- OTP expiration time (default is 900s = 15min, not configurable per call)
- Allowed countries (if any)

**These are Supabase Dashboard settings, not code-verifiable.**

**Verification command (manual, dashboard-only):**
```
1. Go to https://app.supabase.com → project → Auth → Providers
2. Expand SMS provider section
3. Check "SMS Rate Limit" and "Allowed Countries" (if available)
```

---

## WHAT COSTS MONEY

| Service | Current Cost | Gap |
|---------|--------------|-----|
| **Supabase SMS (per OTP send)** | ~$0.03–$0.10 USD/SMS | No rate limiting → **CRITICAL** cost exposure |
| **Supabase SMS (per OTP verify attempt)** | Depends on backend Supabase config | Cannot verify from code |
| **Twilio Lookup (if implemented)** | ~$0.005 USD/call | Not implemented yet (optional) |

**Critical gap:** No client-side or server-side limits. Attacker can spam unlimited OTP requests from single IP/phone/user.

---

## SCOPE: IMPLEMENTATION TASKS

### Task 1: Create phone_otp_attempts table + RLS + helper functions
**Files:**
- Create: `supabase/migrations/20260331130000_phone_otp_cost_control.sql`

**Functions to implement:**
- `log_phone_otp_attempt()` — Log request/verify/resend attempts
- `get_phone_otp_request_count()` — Count requests in last 24h by phone/user_id/ip
- `check_phone_otp_rate_limit()` — Check if request should be blocked, compute cooldown
- `get_otp_resend_cooldown()` — Compute resend cooldown from attempt count (60s → 120s → 300s)
- RLS policy: users can view own attempts only

**Hardcaps to enforce:**
- 5 OTP requests per phone per 24h
- 10 OTP requests per user per 24h
- 20 OTP requests per IP per 24h
- 3 verify attempts per phone per 24h

---

### Task 2: Create send-phone-otp edge function (replaces direct Supabase call)
**Files:**
- Create: `supabase/functions/send-phone-otp/index.ts`
- Create: `supabase/functions/send-phone-otp/deno.json`

**Behavior:**
1. Accept POST with: `{phone, user_id?, device_id?, session_id?}`
2. Get client IP from headers
3. Validate phone (non-empty)
4. Call `check_phone_otp_rate_limit(phone, user_id, ip)` → if limited, return 429 + `Retry-After` header
5. Check suspicious patterns (high request count, unauthenticated, etc.)
6. If user_id provided, validate user exists (auth.admin.getUserById)
7. Call Supabase Auth OTP send:
   - If authenticated: `auth.admin.updateUserById(user_id, {phone})`
   - Else: `auth.signInWithOtp({phone, options: {channel: "sms"}})`
8. Log success/failure with `log_phone_otp_attempt()`
9. Return: `{ok: true, log_id, attempt_count, suspicious, warnings}`

**Rate limit response:**
```json
{
  "error": "Too many attempts. Please try again in 120 seconds.",
  "log_id": 12345,
  "retry_after": 120
}
HTTP 429
Retry-After: 120
```

---

### Task 3: Create verify-phone-otp edge function (replaces direct Supabase call)
**Files:**
- Create: `supabase/functions/verify-phone-otp/index.ts`
- Create: `supabase/functions/verify-phone-otp/deno.json`

**Behavior:**
1. Accept POST with: `{phone, token, user_id?, device_id?, session_id?, otp_type?}`
2. Get client IP from headers
3. Validate phone + token (non-empty)
4. Count verify attempts in last 24h for this phone
   - If count ≥ 3, return 429 "Too many verification attempts"
5. Call Supabase Auth: `auth.verifyOtp({phone, token, type: otpType})`
6. Log result (success/invalid_otp/failed) with `log_phone_otp_attempt()`
7. Return: `{ok: true, log_id, user, session}` or `{error, log_id}`

---

### Task 4: Update frontend to use edge functions instead of direct Supabase calls
**Files:**
- Modify: `src/lib/phoneOtp.ts`
  - Replace `requestPhoneOtp()` to call edge function `send-phone-otp`
  - Replace `verifyPhoneOtp()` to call edge function `verify-phone-otp`
  - Add resend cooldown timer state (frontend-only UX, not security)

- Modify: `src/pages/VerifyIdentity.tsx`
  - Capture `visitorId` before OTP request (from `getVisitorId()`)
  - Pass `device_id: visitorId` to edge functions
  - Add frontend resend cooldown timer (60s first, check server response for updated cooldown)
  - Display error message if rate-limited: "Please try again in X seconds"

---

### Task 5: Add country allowlist configuration (app config)
**Files:**
- Create: `src/config/phoneOtpAllowedCountries.ts`

**Content:**
```typescript
export const PHONE_OTP_ALLOWED_COUNTRIES = [
  "US", "GB", "CA", "AU", "IE",
  // ... add all supported countries
];

export const PHONE_OTP_DISABLED_MESSAGE = "SMS verification is currently unavailable in this region.";
```

- Modify: `src/lib/phoneOtp.ts`
  - Add function `getCountryFromPhone(phone: string): string | null` using phone parsing
  - In `requestPhoneOtp()`: check country allowlist before calling edge function
  - Return error if country not allowed (client-side guard only, NOT security)

- Modify: `supabase/functions/send-phone-otp/index.ts`
  - Add server-side country check (PRIMARY enforcement)
  - Reject unsupported countries before Supabase Auth call
  - Return 403 "SMS verification unavailable in your region"

---

### Task 6: Deploy edge functions and run migrations
**Files:**
- (No new files, use existing deployment scripts)

**Steps:**
1. Apply migration: `supabase/migrations/20260331130000_phone_otp_cost_control.sql`
2. Deploy edge functions: `supabase functions deploy send-phone-otp`
3. Deploy edge functions: `supabase functions deploy verify-phone-otp`

---

### Task 7: Test end-to-end and verify logging
**Files:**
- Create: `tests/phoneOtpRateLimit.test.ts` (optional, for manual testing plan)

**Manual verification steps:**
1. Hit `/verify-identity` page, enter phone number
2. First request should succeed, log entry created with status='success'
3. Second request within 60s should fail with 429 + cooldown message
4. Query `SELECT * FROM phone_otp_attempts WHERE phone = '+...' ORDER BY created_at DESC LIMIT 5;`
5. Verify columns: created_at, phone, user_id, ip_address, device_id, attempt_type, status, reason, request_count_today
6. Spam 10+ requests from same IP → verify rate limit per IP (20/day cap)
7. Query daily summary: `SELECT * FROM phone_otp_daily_summary WHERE date = NOW()::DATE;`

---

## DETAILED TASK BREAKDOWN

### Task 1: Create phone_otp_attempts table

**Step 1: Write migration file**

File: `supabase/migrations/20260331130000_phone_otp_cost_control.sql`

Contains:
- `CREATE TABLE phone_otp_attempts` with columns:
  - id (BIGSERIAL PRIMARY KEY)
  - created_at (DEFAULT NOW())
  - user_id (UUID, nullable)
  - phone (TEXT, NOT NULL)
  - ip_address (TEXT, NOT NULL)
  - device_id (TEXT, nullable)
  - session_id (TEXT, nullable)
  - attempt_type (TEXT: 'request', 'verify', 'resend')
  - status (TEXT: 'success', 'failed', 'invalid_otp', 'rate_limited', 'suspicious')
  - reason (TEXT, nullable)
  - suspicious_flags (TEXT[], nullable)
  - error_message (TEXT, nullable)
  - request_count_today (INT)
  - verify_count_today (INT)
  - seconds_since_last_request (INT)
  - Indexes: user_id, phone, ip_address, created_at

- RLS policy: Users can SELECT own attempts only

- Functions:
  - `get_phone_otp_request_count(p_phone, p_user_id, p_ip, p_since_hours)` → (count, earliest)
  - `get_otp_resend_cooldown(p_request_count)` → INT (seconds: 60 → 120 → 300 → -1)
  - `check_phone_otp_rate_limit(p_phone, p_user_id, p_ip)` → (is_limited, reason, counts, cooldown_secs)
  - `log_phone_otp_attempt(...)` → BIGINT (log_id)

- View: `phone_otp_daily_summary` with stats by date

**Step 2: Verify migration syntax**

Run: `cat supabase/migrations/20260331130000_phone_otp_cost_control.sql | grep -i "CREATE TABLE\|CREATE FUNCTION\|CREATE POLICY" | wc -l`

Expected: At least 8 (1 table, 4 functions, 1 policy, 1 view, etc.)

**Step 3: Apply migration locally**

Run: `supabase db push`

Expected: Migration applied without errors.

**Step 4: Verify in DB**

Run: `supabase db execute "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'phone_otp_attempts') AS exists;"`

Expected: `exists = true`

**Step 5: Commit**

```bash
git add supabase/migrations/20260331130000_phone_otp_cost_control.sql
git commit -m "feat(otp): add phone_otp_attempts table + rate limit functions"
```

---

### Task 2: Create send-phone-otp edge function

**Step 1: Create function files**

Files:
- `supabase/functions/send-phone-otp/index.ts`
- `supabase/functions/send-phone-otp/deno.json`

**Step 2: Implement index.ts**

Pseudo-code:
```typescript
export async function POST(req) {
  // 1. Parse body: {phone, user_id?, device_id?, session_id?}
  // 2. Get IP from x-forwarded-for header
  // 3. Normalize phone, validate non-empty
  // 4. Call RPC check_phone_otp_rate_limit() → if limited, return 429
  // 5. Check suspicious flags (high count, unauthenticated, etc.)
  // 6. If user_id: validate user exists via auth.admin
  // 7. Call Supabase Auth OTP send (updateUser or signInWithOtp)
  // 8. Log attempt via RPC log_phone_otp_attempt()
  // 9. Return {ok, log_id, attempt_count, warnings}
}

async function logAttempt(...) {
  // Call RPC log_phone_otp_attempt() and return id
}
```

**Step 3: Test locally**

Run: `supabase functions serve`

In another terminal:
```bash
curl -X POST http://localhost:54321/functions/v1/send-phone-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+12025551234"}' \
  -H "x-forwarded-for: 192.168.1.1"
```

Expected: `{"ok": true, "log_id": 1, "attempt_count": 1}`

**Step 4: Deploy**

Run: `supabase functions deploy send-phone-otp`

**Step 5: Commit**

```bash
git add supabase/functions/send-phone-otp/
git commit -m "feat(otp): add send-phone-otp edge function with rate limiting"
```

---

### Task 3: Create verify-phone-otp edge function

**Step 1: Create function files**

Files:
- `supabase/functions/verify-phone-otp/index.ts`
- `supabase/functions/verify-phone-otp/deno.json`

**Step 2: Implement index.ts**

Pseudo-code:
```typescript
export async function POST(req) {
  // 1. Parse body: {phone, token, user_id?, device_id?, session_id?, otp_type?}
  // 2. Get IP from headers
  // 3. Validate phone + token (non-empty)
  // 4. Count verify attempts in last 24h for this phone
  // 5. If count ≥ 3, return 429 "Too many attempts"
  // 6. Call auth.verifyOtp() → if error, check if invalid_otp
  // 7. Log result (success/invalid_otp/failed)
  // 8. Return {ok, log_id} or {error, log_id}
}
```

**Step 3: Test locally**

(After Task 2 sends a valid OTP)

```bash
curl -X POST http://localhost:54321/functions/v1/verify-phone-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+12025551234", "token": "123456"}'
```

Expected: `{"ok": false, "error": "Invalid code", "log_id": 2}` (invalid code)

**Step 4: Deploy**

Run: `supabase functions deploy verify-phone-otp`

**Step 5: Commit**

```bash
git add supabase/functions/verify-phone-otp/
git commit -m "feat(otp): add verify-phone-otp edge function with attempt limiting"
```

---

### Task 4: Update frontend phoneOtp.ts

**Step 1: Modify requestPhoneOtp()**

Old:
```typescript
const { error } = await supabase.auth.updateUser({ phone: normalized });
```

New:
```typescript
const { data: { session } } = await supabase.auth.getSession();
const userId = session?.user?.id;

const visitorId = await getVisitorId();

const response = await invokeAuthedFunction("send-phone-otp", {
  body: {
    phone: normalized,
    user_id: userId,
    device_id: visitorId,
    session_id: sessionStorage.getItem("session_id") || null,
  },
});

if (!response.ok) {
  if (response.error.includes("rate limit")) {
    // Show cooldown UI based on retry_after
  }
  return { ok: false, error: response.error };
}

return { ok: true };
```

**Step 2: Modify verifyPhoneOtp()**

Old:
```typescript
const { error } = await supabase.auth.verifyOtp({
  phone: normalizedPhone,
  token: normalizedToken,
  type: otpType,
});
```

New:
```typescript
const userId = supabase.auth.getUser()?.user?.id;
const visitorId = await getVisitorId();

const response = await invokeAuthedFunction("verify-phone-otp", {
  body: {
    phone: normalizedPhone,
    token: normalizedToken,
    user_id: userId,
    device_id: visitorId,
    otp_type: otpType,
  },
});

if (!response.ok) {
  return { ok: false, error: response.error };
}

return { ok: true, user: response.user, session: response.session };
```

**Step 3: Run lint + build**

Run: `npm run lint && npm run build`

Expected: No errors.

**Step 4: Commit**

```bash
git add src/lib/phoneOtp.ts
git commit -m "feat(otp): route OTP through edge functions with rate limit awareness"
```

---

### Task 5: Add country allowlist

**Step 1: Create phoneOtpAllowedCountries.ts**

File: `src/config/phoneOtpAllowedCountries.ts`

```typescript
// Hardcoded allowed countries (configure per business needs)
export const PHONE_OTP_ALLOWED_COUNTRIES = [
  "US", "GB", "CA", "AU", "SG", "HK", "IN",
  // Add all supported regions
];

export const PHONE_OTP_DISABLED_MESSAGE = "SMS verification is currently unavailable in your region.";
```

**Step 2: Update phoneOtp.ts to check country**

Add function:
```typescript
export function isCountryAllowed(phone: string): boolean {
  try {
    const parsed = parsePhoneNumber(phone); // from react-phone-number-input
    return PHONE_OTP_ALLOWED_COUNTRIES.includes(parsed?.country || "");
  } catch {
    return false;
  }
}
```

In `requestPhoneOtp()`:
```typescript
if (!isCountryAllowed(normalized)) {
  return { ok: false, error: PHONE_OTP_DISABLED_MESSAGE };
}
```

**Step 3: Update send-phone-otp edge function**

Add server-side check (PRIMARY):
```typescript
// Extract country from phone
// If not in allowlist, return 403
return new Response(
  JSON.stringify({ error: "SMS verification unavailable in your region" }),
  { status: 403, headers: corsHeaders }
);
```

**Step 4: Run lint + build**

Run: `npm run lint && npm run build`

**Step 5: Commit**

```bash
git add src/config/phoneOtpAllowedCountries.ts src/lib/phoneOtp.ts supabase/functions/send-phone-otp/
git commit -m "feat(otp): add country allowlist + server-side enforcement"
```

---

### Task 6: Deploy functions + migrations

**Step 1: Push migrations**

Run: `supabase db push`

Expected: "Applied migration 20260331130000_phone_otp_cost_control"

**Step 2: Deploy edge functions**

Run:
```bash
supabase functions deploy send-phone-otp
supabase functions deploy verify-phone-otp
```

Expected: Both functions deployed successfully.

**Step 3: Verify functions are live**

Run:
```bash
curl -X GET https://ztrbourwcnhrpmzwlrcn.supabase.co/functions/v1/send-phone-otp
```

Expected: HTTP 405 (GET not allowed) or CORS error (proves function exists).

**Step 4: Commit**

(Migrations and functions already committed in prior tasks)

---

### Task 7: Manual end-to-end verification

**Step 1: Start dev server**

Run: `npm run dev`

Expected: App starts at http://localhost:8080

**Step 2: Navigate to VerifyIdentity**

1. Go to `/verify-identity` (or `/auth` → `/verify-identity`)
2. You should be logged in (or use test account)

**Step 3: Test first OTP request**

1. Enter phone number (e.g., +12025551234)
2. Click "Send OTP"
3. Check logs: edge function `send-phone-otp` called, returns `{ok: true, log_id: 1}`
4. Expected result: OTP SMS sent (or test mode returns 498005)

**Step 4: Verify rate limit**

1. Immediately click "Send OTP" again
2. Expected: Error message "Too many attempts. Please try again in 60 seconds."
3. Check DB: `SELECT * FROM phone_otp_attempts ORDER BY created_at DESC LIMIT 2;`
4. Expected: Two rows, second one status='rate_limited'

**Step 5: Test verify with invalid OTP**

1. Enter OTP (e.g., 000000)
2. Click "Verify"
3. Expected: Error "Invalid code"
4. Check DB: entry with attempt_type='verify', status='invalid_otp'

**Step 6: Check daily summary**

Run:
```sql
SELECT * FROM phone_otp_daily_summary WHERE date = NOW()::DATE;
```

Expected: Aggregated stats (total_attempts, request_count, verify_count, etc.)

**Step 7: Commit test results**

```bash
git add docs/test-results.md  # Document manual test results
git commit -m "test(otp): verify rate limiting and logging end-to-end"
```

---

## VERIFICATION CHECKLIST

- [ ] Migration applied: `phone_otp_attempts` table exists
- [ ] RLS policy prevents cross-user access
- [ ] `send-phone-otp` edge function deployed and callable
- [ ] `verify-phone-otp` edge function deployed and callable
- [ ] Frontend calls edge functions (not direct Supabase Auth)
- [ ] Rate limit returns 429 + Retry-After header
- [ ] OTP attempts are logged with all required fields
- [ ] Daily summary view returns aggregated stats
- [ ] Country allowlist enforced server-side
- [ ] Test OTP requests are rate-limited after 5 per phone/24h
- [ ] Test verify attempts are limited to 3 per phone/24h
- [ ] Resend cooldown ladder works (60s → 120s → 300s)
- [ ] npm run lint passes
- [ ] npm run build succeeds

---

## NOTES FOR IMPLEMENTATION

1. **Device ID limitation:** FingerprintJS `visitorId` is not a stable session identifier. It's device-browser-based. If user clears browser data, new ID is generated. For rate limiting, we use IP + phone as primary, device_id as secondary signal.

2. **Twilio config unused:** The Twilio credentials remain in `backend.env.md` but are NOT used. If Supabase Auth uses Twilio underneath, we don't control it directly. Country/provider rules would need to be set in Supabase Dashboard (not code-verifiable).

3. **Supabase Auth hardening:** The following are NOT code-configurable:
   - SMS provider type
   - OTP expiration time (default 900s)
   - SMS rate limit quota
   - Allowed countries

   These MUST be set in Supabase Dashboard if available.

4. **Silent failures:** If edge function deployment fails, the app will fall back to direct Supabase Auth calls. Monitor deployment logs carefully.

5. **Cost impact:** With rate limiting in place:
   - Before: Attacker can send unlimited OTP (high cost exposure)
   - After: Hard caps (5/phone/day, 10/user/day, 20/ip/day) = ~95% cost reduction for malicious traffic
