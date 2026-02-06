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
- **Admin Console:** only admin role may access `/admin/control-center`

---

## 3. AI & Payments Pillar (The Muscle)

### 3.1 Gemini AI Vet
- **Routing:** Gemini 1.5 Flash for text-only requests; Gemini 1.5 Pro for image input.
- **Context:** pet data (breed/age/weight/history) injected into prompt.
- **Rate Limiting:** token bucket in DB; return HTTP 429 on quota exceeded.

### 3.2 Stripe Escrow & Idempotency
- **Client Idempotency Key:** generated client‑side (e.g., `booking_{userId}_{timestamp}`) and passed to Edge Function header `idempotency-key`.
- **Escrow:** hold 100% upfront, release after 48h if no dispute.
- **Split:** 90% sitter payout, 10% platform fee.
- **Dispute Resolution:** admin-only release/refund via `process-dispute-resolution`.
- **Rule:** Platform fee is deducted **only** when sitter is paid (release action). Refund action sets platform fee to 0.

---

## 4. Social Pillar (The Huddle)

### 4.1 Discovery in Chat
- Discovery row is embedded at the top of **Chats**, no standalone Discover tab.
- Horizontal cards show Name, Age, Status, Pet Species.
- Overlay icons: Wave (match), Star (direct chat + quota), X (skip).
- Expand Search: shows button when stack ends → adds +15km, clears local `hiddenDiscoveryIds`.

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

### 4.3 Rich Social
- Thread replies support Markdown (bold, italic, lists).
- Inline quote format: `> @user: "First 50 chars..."` (pre-populated on Reply).
- 1000‑character limit for threads and replies.

---

## 5. UI/UX No‑Bullshit Rules

### 5.1 Red Error Rule
All validation failures must show **red error text below the field** and block submit. **Current implementation is inline red text in `EditPetProfile.tsx` and `EditProfile.tsx` (no shared ErrorLabel component yet).** Validations covered: DOB (human/pet), pet weight length, vaccination dates, microchip ID.

### 5.2 Grey Subtext Rule
Vaccination inputs must show: **"Input last vaccination dates for better tracking"** in pt12 grey.

### 5.3 Admin Hatch
**Current code state:** Admin Control Center route exists at `/admin/control-center`, but **long‑press gesture on version number is not implemented in UI yet**.

---

## 6. Admin Dispute Console
- Route: `/admin/control-center`
- Query: `marketplace_bookings` where `status = 'disputed'`
- Actions: **Release Funds** or **Refund Pet Parent**
- Security: RLS admin update policy enforced via `auth.jwt() ->> 'role' = 'admin'`
 - **Financial rule:** 10% platform fee is deducted only when **Release Funds** is executed. Refund action sets platform fee to 0.

---

## 7. Administrative Control & Disputes
- **Role Check:** `auth.jwt() ->> 'role' = 'admin'`
- **Dispute Workflow:** Admin opens `/admin/control-center` → selects booking → release/refund.
- **Manual Resolution:** Uses Edge Function `process-dispute-resolution`.

---

## 8. Release Verification (Minimum Bar)
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

---

**End of MASTER_SPEC v1.5**
