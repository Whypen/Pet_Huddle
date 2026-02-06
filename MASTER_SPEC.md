# MASTER_SPEC.md — huddle v1.5 (Definitive)

**Audience:** New full‑stack developer rebuilding from scratch

**Source of Truth:** This document overrides all prior specs. Any change requires explicit version bump and changelog entry.

---

## 0. Product DNA
huddle is a mobile‑first pet‑care super‑app blending family mesh safety (emergency broadcasts), nanny marketplace (escrow bookings with 10% cut), social discovery (swipes/matches with pop‑ups), and fintech (subscriptions/add‑ons with webhooks). Experience target: Instagram/TikTok smoothness, minimal UI with Huddle Blue accents, gold gradient for premium. PWA required for native‑like install and offline behavior. No dead ends, no lag.

---

## 1. Architecture & Stack

### 1.1 Frontend
- React + TypeScript + Vite
- Tailwind CSS (design tokens in tailwind config) + shadcn/ui + Framer Motion
- React Router with v7 flags
- Global providers: AuthContext, LanguageContext, NetworkContext, ErrorBoundary
- PWA: manifest + service worker

### 1.2 Backend
- Supabase (Postgres + RLS + Storage + Realtime + Edge Functions)
- pg_cron for scheduled jobs
- Stripe (Checkout + Connect + Webhooks)
- Mapbox

---

## 2. Security & Data Pillar (The Brain)

### 2.1 Identity System
- **User ID:** 10‑digit random string (immutable)
- **DB Trigger:** `generate_uid()` + `set_profiles_user_id()` BEFORE INSERT on profiles
- **Roles:** `user`, `admin`, `sitter` (admin-only routes enforced in UI + RLS)
- **Profiles.role column:** `role TEXT DEFAULT 'user'` used for admin authorization.

### 2.2 PII Auto‑Delete
- **Cron Job:** `pii_purge_daily` runs daily at **02:15**, deletes identity_verification images **7 days** after verification status becomes `approved` or `rejected`.

### 2.3 PostGIS & Radius Search
- **Radius Range:** 0‑150km
- **Index:** GIST index on `profiles.location` (geography)
- **Expansion:** UI button expands radius by **+15km** per click up to 150km max.
- **Discovery Hidden IDs:** stored in local state `hiddenDiscoveryIds` in `src/pages/Chats.tsx` (cleared when **Expand Search** triggers).

### 2.4 RLS Policies (Explicit)
- **Profiles:** owner read/write only
- **Pets:** owner read/write only
- **Threads:** read public, write owner only
- **Thread Comments:** read public, write owner only
- **Marketplace Bookings:** client + sitter read, admin update only
- **Identity Verification Bucket:** private, owner + admin read, owner insert/delete
- **Restrictive Identity Policy:** `Strict Identity Access` on `storage.objects` for `identity_verification`
- **Admin Console:** only admin role may access `/admin/control-center`

### 2.5 Post‑Identity Flow (KYC Submit Wiring)
When the user taps **Submit** in `/verify-identity`:
1. **Status → Pending:** `profiles.verification_status` is set to `pending`.
2. **Image → Bucket:** selfie + ID are uploaded to `identity_verification` bucket (owner = auth.uid()).
3. **Badge → Show:** UI updates avatar badge to **Pending (grey)** via local profile refresh.
4. **Redirect:** Success animation → redirect to `/chats`.

### 2.6 Quota Management System (QMS)
- **Table:** `user_quotas` with daily counters: `ai_images`, `chat_images`, `thread_posts`
- **Function:** `check_and_increment_quota(action_type TEXT)`
- **Free limits:** `ai_vision = 1/day`, `chat_image = 5/day`, `thread_post = 1/day`
- **Premium/Gold:** unlimited for these actions
- **Enforcement points:** ai-vet (image), chat image uploads, thread posts, booking edge function gate

---

## 3. AI & Payments Pillar (The Muscle)

### 3.1 Gemini AI Vet
- **Routing:** Gemini 1.5 Flash for text-only requests; Gemini 1.5 Pro for image input.
- **Context:** pet data (breed/age/weight/history) injected into prompt.
- **Rate Limiting:** token bucket in DB; return HTTP 429 on quota exceeded.
- **QMS Gate:** `check_and_increment_quota('ai_vision')` must succeed before vision analysis.

### 3.2 Stripe Escrow & Idempotency
- **Client Idempotency Key:** generated client‑side (e.g., `booking_{userId}_{timestamp}`) and passed to Edge Function header `idempotency-key`.
- **Escrow:** hold 100% upfront, release after 48h if no dispute.
- **Split:** 90% sitter payout, 10% platform fee.
- **Dispute Resolution:** admin-only release/refund via `process-dispute-resolution`.
- **Rule:** Platform fee is deducted **only** when sitter is paid (release action). Refund action sets platform fee to 0.
- **Safe Harbor:** booking request must include `safeHarborAccepted = true` (checkbox in UI). Metadata includes `safe_harbor_accepted=true`.
- **Hidden Wiring (Frontend → Edge → Stripe → DB):**
  - Frontend `Chats.tsx` invokes `create-marketplace-booking` with `idempotency-key` header.
  - Edge Function calls Stripe Checkout Session → creates `payment_intent`.
  - Stripe metadata includes: `client_id`, `sitter_id`, `service_start_date`, `service_end_date`, `pet_id`, `location_name`, `safe_harbor_accepted`.
  - Edge Function inserts `marketplace_bookings` row as `pending`.
  - `stripe-webhook` updates booking status on `payment_intent.succeeded`.

---

## 4. Social Pillar (The Huddle)

### 4.1 Discovery in Chat
- Discovery row is embedded at the top of **Chats**, no standalone Discover tab.
- Horizontal cards show Name, Age, Status, Pet Species.
- Overlay icons: Wave (match), Star (direct chat + quota), X (skip).
- Expand Search: shows button when stack ends → adds +15km, clears local `hiddenDiscoveryIds`.

**Discovery State Machine (Invisible Logic):**
- `hiddenDiscoveryIds` is a Set in `Chats.tsx` storing skipped IDs.
- Wave/Star/X updates this set on interaction.
- When stack is empty, **Expand Search** increases radius +15km and clears the set to re-surface profiles.

### 4.2 Weighted Threads
- Score = Time + Relationship + Badge + Engagement − Decay.
- Stored in `threads.score`, updated hourly by `update_threads_scores()`.
- Sorting: `ORDER BY score DESC`.

**Exact SQL formula in `update_threads_scores()`:**
```
score = (
  (extract(epoch from (now() - t.created_at)) / 86400.0) * 10
  + case when p.care_circle is not null and array_length(p.care_circle, 1) > 0 then 20 else 0 end
  + case when p.is_verified then 50 else 0 end
  + case when p.tier = 'gold' then 30 else 0 end
  + ((select count(*) from public.thread_comments c where c.thread_id = t.id) * 5)
  + (coalesce(t.likes, 0) * 3)
  + (coalesce(t.clicks, 0) * 1)
  - (ln(extract(day from (now() - t.created_at)) + 1) * 5)
)
```

**Algorithm Math Summary:** Engagement (replies * 5, likes * 3, clicks * 1) + Relationship (+20 if in care_circle) + Badge (+50 verified, +30 gold) − Decay (log(age_days+1)*5) with time boost (age in days * 10).

### 4.3 Rich Social
- Thread replies support Markdown (bold, italic, lists).
- Inline quote format: `> @user: "First 20 chars..."` (pre-populated on Reply).
- 1000‑character limit for threads and replies.

---

## 5. UI/UX No‑Bullshit Rules

### 5.1 Red Error Rule
All validation failures must show **red error text below the field** and block submit. **Current implementation uses `ErrorLabel` in `EditPetProfile.tsx` and `EditProfile.tsx`.** Validations covered: DOB (human/pet), pet weight length, vaccination dates, microchip ID.

### 5.2 Grey Subtext Rule
Vaccination inputs must show: **"Input last vaccination dates for better tracking"** in pt12 grey.

### 5.3 Admin Hatch
**Implemented:** Long‑press (3s) on version text in Settings navigates admin to `/admin/control-center` or copies version to clipboard for non-admins.

### 5.4 UI Bible — Red Errors & Grey Subtext
**Red Error Validations (must render below field):**
- Human DOB → “Human DOB cannot be in the future”
- Pet DOB → “Pet DOB cannot be in the future”
- Pet weight > 4 digits → “Pet weight must be 4 digits or less”
- Vaccination date in future → “Vaccination date cannot be in the future”
- Next vaccination reminder in past → “Next vaccination must be in the future”
- Microchip ID not 15 digits → “Microchip ID must be 15 digits”

**Grey Subtext (pt12, below field):**
- Vaccination input: “Input last vaccination dates for better tracking”

### 5.5 Legal Guardrails
- **AI Vet Footer:** pt10 grey disclaimer: “huddle AI provides informational content, not veterinary diagnosis. In emergencies, seek professional care immediately.”
- **KYC Safe Harbor Checkbox:** required in `/verify-identity` step 2.
- **Booking Safe Harbor Checkbox:** required before booking checkout.

---

## 6. Admin Dispute Console
- Route: `/admin/control-center`
- Query: `marketplace_bookings` where `status = 'disputed'`
- Actions: **Release Funds** or **Refund Pet Parent**
- Security: RLS admin update policy enforced via `auth.jwt() ->> 'role' = 'admin'`
- **Financial rule:** 10% platform fee is deducted only when **Release Funds** is executed. Refund action sets platform fee to 0.

---

## 7. Health & Maintenance
- **Edge Function:** `/health-check` pings Stripe + Supabase.
- **Maintenance Banner:** shown when health-check fails (OfflineBanner shows “Maintenance mode”).

---

## 8. Administrative Control & Disputes
- **Role Check:** `auth.jwt() ->> 'role' = 'admin'`
- **Dispute Workflow:** Admin opens `/admin/control-center` → selects booking → release/refund.
- **Manual Resolution:** Uses Edge Function `process-dispute-resolution`.
- **UI Gate:** Admin buttons render only when `profile.user_role === 'admin'`.

---

## 9. Release Verification (Minimum Bar)
- User ID trigger active
- PII auto‑delete cron active
- PostGIS index + radius query working
- Identity bucket private + owner/admin access only
- Gemini Flash/Pro routing confirmed
- 429 returned on quota exceeded
- Client idempotency passed to Stripe
- Discovery embedded in Chats
- Threads score ordering + reply + quote + 1000 char limit
- Red errors + grey subtext validated
- Admin hatch works
- QMS enforced for ai_vision/chat_image/thread_post
- Safe Harbor checkbox enforced in KYC + booking
- Maintenance banner active when /health-check fails

---

**End of MASTER_SPEC v1.5**
