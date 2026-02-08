# Sweep & UAT Log (v2.0)

Date: 2026-02-08

Repo: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle`

Baseline before this sweep:
- Git branch: `main`
- Last pushed commit: `0b9f297` (`v2.0 Full Override`)
- Supabase remote migration applied: `20260208160000_qms_v2_full_override.sql`

## Step 1: Code Review Sweep (Web + Mobile)

Environment notes:
- `rg` (ripgrep) is not installed. Sweep uses `grep -R`, `find`, and Node `fs.walk`.

Automated scan:
- Command: `node scripts/sweep_scan.mjs`
- Result: PASS (0 fails)

```json
{
  "ok": true,
  "results": [
    { "id": "web_chats_useMemo_import", "ok": true, "desc": "Web Chats imports useMemo (fixes runtime error)." },
    { "id": "qms_thread_post_used", "ok": true, "desc": "Thread posting consumes QMS via thread_post." },
    { "id": "qms_discovery_used", "ok": true, "desc": "Discovery consumes QMS via discovery_profile." },
    { "id": "qms_broadcast_used", "ok": true, "desc": "Broadcast consumes QMS via broadcast_alert." },
    { "id": "auth_consent_web", "ok": true, "desc": "Web signup blocks on consent checkbox." },
    { "id": "auth_consent_mobile", "ok": true, "desc": "Mobile signup blocks on consent." },
    { "id": "map_50km_rpc", "ok": true, "desc": "Web map uses get_map_alerts_nearby (50km cap)." },
    { "id": "map_friend_pins_rpc", "ok": true, "desc": "Map friends uses get_friend_pins_nearby (server-side 50km cap + map_visible gate)." },
    { "id": "notifications_hub_web", "ok": true, "desc": "Web has Notification Hub (header bell + /notifications route)." },
    { "id": "notifications_hub_mobile", "ok": true, "desc": "Mobile has Notification Hub screen and header bell routes to it." },
    { "id": "mobile_map_tab", "ok": true, "desc": "Mobile has Map tab registered in TabsNavigator." }
  ],
  "fails": []
}
```

Fixes completed during sweep:
- Web `/premium` checkout now opens returned Stripe Checkout URL (`src/pages/Premium.tsx`).
- Mobile `/premium` remodeled screen is now NativeWind-based + real checkout invoke (`mobile/src/screens/PremiumScreen.tsx`).
- Mobile NativeWind TS typing enabled (`mobile/nativewind.d.ts`).
- Mobile header/back converted to NativeWind (`mobile/src/components/Header.tsx`, `mobile/src/components/BackButton.tsx`).
- Edge checkout function hardened to bind `user_id` to JWT (prevents arbitrary userId checkout) (`supabase/functions/create-checkout-session/index.ts`).

## Step 2: Backend Wiring Verify (Supabase Schema/RLS/Edge/pg_cron)

Schema/migrations:
- Command: `supabase db push`
- Result: `Remote database is up to date.`

Edge functions (remote deploy):
- `stripe-pricing` deployed with `--no-verify-jwt` (public pricing fetch).
- `stripe-webhook` deployed with `--no-verify-jwt` (Stripe callback).
- `create-checkout-session` deployed (JWT required + server-side auth check).

## Step 3: UAT by Role (Free/Premium/Gold + Family)

Automated UAT (4 users):
- Command: `node scripts/uat_sweep.mjs`
- Creates users: Free, Premium, Gold, Family (linked to Gold via `family_members status=accepted`)
- Verifies buckets + QMS quotas + pooling.

Output (proof):
```json
{
  "tag": "20260208164252",
  "buckets": [
    "avatars",
    "pets",
    "alerts",
    "notices",
    "verification",
    "identity_verification",
    "social_album"
  ],
  "tables": {
    "user_quotas": { "ok": true },
    "consent_logs": { "ok": true },
    "notifications": { "ok": true },
    "family_members": { "ok": true },
    "reminders": { "ok": true }
  },
  "quota_results": {
    "free_thread": 3,
    "premium_thread": 15,
    "gold_thread": 20,
    "family_thread": 10,
    "free_discovery": 40,
    "premium_discovery": 200,
    "gold_discovery": 200,
    "free_ai_vet": 0,
    "premium_ai_vet": 10,
    "gold_ai_vet": 20,
    "gold_priority": 5,
    "gold_star": 10,
    "free_broadcast": 3
  }
}
```

Interpretation:
- Threads: Free 3/day; Premium 15/day; Gold pooled 30/day validated as 20 (Gold) + 10 (Family) = 30.
- Discovery: Free capped at 40/day; Premium/Gold unlimited (validated by 200 consecutive allow responses).
- AI Vet uploads: Free 0; Premium 10/day; Gold pooled 20/day.
- Gold priority analyses: 5/month; Stars: 10/month.
- Broadcast alerts: Free 3/week.

## Step 4: Bug/Security/Legal Checks

Bug fixes:
- Web Chats crash fixed: `useMemo` imported in `src/pages/Chats.tsx`.

Security/contract hardening:
- Checkout session creation now binds `user_id` to JWT (prevents spoofing `userId` in request body).
- Consent logging: `consent_logs` table exists and both web + mobile perform best-effort insert on signup.

## Step 5: Verification + Push

Web verification:
- `npm run lint`: PASS (warnings only, 0 errors)
- `npm run build`: PASS
- `npm test`: PASS (vitest)

Mobile verification:
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run ios` (`expo run:ios`): PASS (`Build Succeeded`, opened on iPhone simulator)

Known constraint:
- Android SDK not configured on this machine (`ANDROID_HOME` missing), so `expo run:android` currently cannot run.

---

## v1.9 Final Override Re-Sweep (2026-02-09)

Backend migration hardening:
- Fixed production `notifications` schema mismatch (`title`/`body` NOT NULL) and updated `notify_on_map_alert_insert` trigger to insert compatibly across schema variants.

Supabase UAT script proof:
- Ran `node scripts/uat_sweep.mjs` (tag `20260208191525`) and validated:
  - Buckets present: `identity_verification`, `social_album` (and core buckets)
  - Tables present: `user_quotas`, `consent_logs`, `notifications`, `family_members`, `reminders`
  - Quotas (v1.9): Free threads `1/day`, Premium `5/day`, Gold pooled `20/day`; Free discovery `40/day`, Premium/Gold unlimited; media `0/10/50` per day; stars `3/cycle`; broadcasts Free `5/week` (+1 with add-on token)

Raw output (excerpt):
```json
{
  "quota_results": {
    "free_thread": 1,
    "premium_thread": 5,
    "gold_thread": 15,
    "family_thread": 5,
    "free_discovery": 40,
    "premium_discovery": 80,
    "gold_discovery": 80,
    "free_media": 0,
    "premium_media": 10,
    "gold_media": 50,
    "gold_star": 3,
    "free_broadcast": 5,
    "free_broadcast_plus_addon": 6
  }
}
```

Frontend alignment:
- Web + Mobile `/premium` features updated to match v1.9 numbers and add-on ranges.
- Sticky upsell banner implemented (web + mobile) and wired into quota-deny paths for Threads + Map broadcasts.
