# APP_MASTER_SPEC — huddle

## I. CORE ARCHITECTURE & SYSTEM STATE

### Frontend Framework & Global State
Huddle is built on **React + TypeScript + Vite**.  
Routing is **strictly defined** using React Router with these exact paths:

- `/` (home/dashboard)
- `/social` (discovery/swipe)
- `/chats` (chat list)
- `/chat-dialogue?id=` (single chat room)
- `/ai-vet` (AI veterinary assistant)
- `/map` (Mapbox map view)
- `/auth` (login/signup)
- `/onboarding` (3-phase onboarding)
- `/edit-profile`, `/edit-pet-profile`, `/pet-details?id=`
- `/settings` (gear icon → account/family/privacy)
- `/subscription`, `/premium` (monetization center)

**State management** is centralized through three React Contexts:
- `AuthContext`: handles user/session/profile, tier, monetization counters, sign in/up/out, profile refresh.
- `LanguageContext`: manages i18n with `t(key)` wrapper.
- `NetworkContext`: detects online/offline, queues offline actions.

**Realtime** is powered by **Supabase Realtime** (Postgres Changes) for `chat_messages` and `map_alerts`.  
Optional external WebSocket server referenced via `VITE_WS_URL` for chat presence/online status.

### Backend & Database Integrity
**Single source of truth**: Supabase PostgreSQL database with **Row Level Security (RLS)** enabled on every core table.

**Edge Functions (Deno)** are the only server-side logic:
- `create-checkout-session` → Stripe Checkout (subs + add-ons)
- `create-portal-session` → Stripe Billing Portal
- `create-connect-account` → Stripe Connect Express onboarding
- `create-marketplace-booking` → destination charge + escrow
- `stripe-webhook` → idempotent fulfillment (subscriptions, add-ons, bookings)
- `mesh-alert` → batch FCM notifications + logs

**Service Role Key** (`SUPABASE_SERVICE_ROLE_KEY`) must be used inside Edge Functions to bypass RLS for administrative operations (tier upgrades, credit increments, escrow releases).

**Audit Trail**: All Stripe events must be persisted to a `transactions` table (unique `stripe_event_id`) to guarantee idempotent fulfillment and traceability.

### Stripe Fintech Integration (V16 Locked)
**Product IDs (must never be hardcoded in client — always fetched dynamically or stored server-side):**

- Premium: `prod_TuEpCL4vGGwUpk`
- Gold: `prod_TuF4blxU2yHqBV`
- Verified Badge: `prod_TuFRNkLiOOKuHZ`
- Star/Booster Pack: `prod_TuFPF3zjXiWiK8`
- Emergency Alert: `prod_TuFKa021SiFK58`
- Vet Media Upload: `prod_TuFLRWYZGrItCP`
- Family Slot: `prod_TuFNGDVKRYPPsG`
- 5-Media Pack: `prod_TuFQ8x2UN7yYjm`
- 7-Day Extension: `prod_TuFIj3NC2W7TvV`

**Metadata contract**: Every Checkout Session must include:
- `metadata.user_id`
- `metadata.type` (premium, gold, star_pack, family_slot, etc.)
- Booking-specific: `metadata.client_id`, `metadata.sitter_id`, `metadata.service_start`, `metadata.service_end`

**Pricing model**: Subscription prices are server-side only. One-time add-ons must be validated server-side against fixed product metadata.

**Idempotency (required)**: Edge functions must generate Stripe idempotency keys on session creation; webhook handlers must short-circuit if `stripe_event_id` already exists in `transactions`.

## II. REVENUE ENGINE & MARKETPLACE LOGIC

### Nanny Booking & Escrow Management
**Flow (must be enforced exactly):**
1. User clicks **Blue $ icon** in chat → opens `BookingModal`
2. Modal collects: Service Date (Calendar), Start/End Time (Time Picker), Pet Selection (Dropdown from user’s pets), Location (auto-fill from profile.lat/lng)
3. Client calls `create-marketplace-booking` Edge Function
4. Function creates Stripe Checkout Session with **destination charge**
5. `application_fee_amount` = **exactly 10%** of total (hardcoded server-side)
6. Booking inserted into `marketplace_bookings` with status `pending`, `escrow_release_date`, `escrow_status`
7. Stripe webhook (`checkout.session.completed`) marks `paid`, records transaction
8. `release_escrow_funds()` pg_cron job runs **hourly**, releases funds 48 hours after `service_end_time` if `dispute_flag = false`

**Dispute handling**: MVP button in booking detail → calls `file_booking_dispute()` RPC → sets `dispute_flag = true` → holds escrow until admin review.

**Vouch system data source**: `vouch_score` increments must be derived from `marketplace_bookings` only (no manual increments from client).

### Monetization Protection & Triggers
**Trigger logic (must be enforced in UI + hooks):**
- Stars: if `stars_count === 0` on boost click → open upsell modal
- Mesh Alert: if `mesh_alert_count === 0` → open upsell modal
- AI Vet / Camera: if `media_credits === 0` and tier = 'free' → slide up Premium footer
- Family: if current family count ≥ `2 + family_slots` → open Family Slot upsell

**Family sync**: After purchase, `family_slots` increments → **enable Invite UI** in `/settings` (missing today)

**Protect_monetized_fields** trigger must block any client-side UPDATE to `tier`, `stars_count`, `mesh_alert_count`, `media_credits`, `family_slots`, `verified`

**Credit counters (authoritative)**: UI must always refetch from `profiles` before consuming credits to prevent stale local state.

## III. BRAND IDENTITY & VISUAL STANDARDS

**Color Hierarchy (non-negotiable):**
- **Royal Blue (#2563EB)**: All primary actions, Car safety icon, Chat send buttons, Mapbox pins
- **Huddle Green (#22C55E)**: Home dashboard icon, Huddle Wisdom icon, success states only
- **Grey (#94A3B8)**: Secondary helper text, captions, deactivated states
- **Gold Gradient** (linear-gradient 135deg #FBBF24 → #F59E0B → #D97706): Stars badges + Gold Tier UI only

**Header Cleanup (mandatory purge):**
- Remove **"pet care & social"** text (including pseudo-elements)
- Remove pet head icon (SVG or rendered)
- Right side must contain **only Gear (settings) icon**

**Modal & Z-Index**: All modals (chat, booking, add pet, upsell) **must** use `z-[50+]` to prevent overlap by nav bars or map.

**Mobile Validation**: Every screen must be tested at ≤430px width. Fix any overlapping fixed elements, inconsistent padding/margins, or broken layouts.

## IV. VULNERABILITY MITIGATION (THE KILL LIST – MUST BE ELIMINATED)

**Fintech & Security**
1. **Amount tampering**: Edge functions must validate booking/add-on amounts against sitter_profiles.hourly_rate or fixed product metadata.
2. **Webhook idempotency**: `stripe_event_id` must be unique in `transactions` table. Duplicate events return 200 but do nothing.
3. **Chat privacy**: Update RLS on `chat_messages` → only allow SELECT/INSERT where user is member (via room_members or conversations table).
4. **RLS bypass**: Only service_role key in Edge Functions can modify monetized fields.
5. **Map spoofing**: Reject geolocation accuracy > 500m before saving to `profiles.last_lat/lng`.

**Operational & Logic**
6. **Vouch integrity**: `vouch_score` can only increment after booking `completed` AND dispute window passed.
7. **I18N gaps**: Audit entire `src/` with grep for hardcoded strings; wrap all in `t()`.
8. **Stale local storage**: Clear stale pet-management records on logout or onboarding complete.
9. **No pagination**: Add infinite scroll or pagination to notice board and chat lists.
10. **Mock FCM risk**: If FCM keys missing, log warning and disable mesh-alert send.
11. **Hazard scan throttling**: enforce 3 scans per 24 hours for free tier using `scan_rate_limits` RPC; do not rely on client-only gating.
12. **Triage cache integrity**: `triage_cache` writes must be server-authoritative to prevent spoofed hazard results.

## V. DATA FLOW & SYNCHRONIZATION (CRITICAL HANDOFFS)

**Webhook-to-UI Handshake**
- After Stripe redirect, `Premium.tsx` must poll `profiles.tier` every 2s (max 30s) with loading state until webhook fulfillment is confirmed.

**Family Slot Invite Flow**
- Purchase → increment `family_slots`
- Settings → show “Invite” button only if `family_slots > 0` and slots available
- Invite must validate against current family count

**Hazard Scan Flow**
- Compress image → compute hash → check `triage_cache` → if miss, upload + AI classify → write cache → log rate limit in `scan_rate_limits`

## VI. ZERO-DEFECT VERIFICATION CHECKLIST (MUST ALL PASS BEFORE FINAL)

1. Every **Car icon**, **Chat action icon**, **primary UI trigger** is **Royal Blue (#2563EB)**
2. **Nanny Booking Modal** contains DatePicker, TimeRangePicker, Pet Dropdown, Location auto-fill
3. `stripe-webhook` Edge Function deployed with current **PRICE_IDS** and idempotency logic
4. `npm run build` passes with **zero TypeScript errors** in `types/supabase.ts`
5. **Header** has no “pet care & social” text, no pet head icon, only Gear icon on right
6. All modals have `z-[50+]` and work on mobile (≤430px)
7. Upsell triggers fire on **all** defined conditions (stars=0, alerts=0, media=0 free, family slots full)
8. `protect_monetized_fields` trigger blocks client-side updates to tier/credits
9. Every user-facing string is wrapped in `t()` (audit complete)
10. Vouch increment only possible after completed booking + dispute window
11. Free tier hazard scans hard-limited to **3 per 24h** (server enforced)
12. `transactions` table contains Stripe events for all fulfilled payments

This document is now **locked**. No further changes unless a major product pivot occurs.  
All future development, audits, and refactors must align 100% with this spec.
