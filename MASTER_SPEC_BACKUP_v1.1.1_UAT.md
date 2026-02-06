# APP_MASTER_SPEC — huddle
**Version:** v1.1.1-alignment-pass  
**Audience:** New full-stack developer rebuilding from scratch  
**Status:** Locked (Canonical)  
**Source of Truth Rule:** This document overrides all prior specs. Any change requires explicit version bump and `SPEC_CHANGELOG.md` entry.

---

## 0. Product DNA

huddle is a mobile-first pet-care super-app blending:
- Family mesh safety (emergency broadcasts)
- Nanny marketplace (escrow bookings, platform fee)
- Social discovery (swipes, matching, realtime chat)
- Fintech monetization (subscriptions, add-ons, webhook-driven fulfillment)
- AI support (AI Vet + hazard scanning)

**Experience target:**  
Instagram/TikTok smoothness + Balenciaga-minimal polish.  
No dead ends, no lag spikes, no broken flows.

**Cost-priority principles:**
- Offline-first map behavior where possible
- Pinned/static location interactions over continuous live tracking
- Image compression before upload
- Rule-based social filtering (no expensive custom ML infra)
- OpenAI API integration (no model training/fine-tuning infra)
- Supabase serverless-first architecture

---

## 1. Workspace & Output Rules

### 1.1 Mandatory Workspace Path
All generated files, migrations, scripts, reports, and artifacts must be saved under:  
`/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle`

### 1.2 Repository Contracts
- Frontend: React + TypeScript + Vite
- Backend: Supabase Cloud (Postgres + Edge Functions + Storage + Realtime)
- No hardcoded `localhost` API/WS endpoints in source files
- Config must be environment-driven

### 1.3 Documentation Contracts
- Required docs:
  - `APP_MASTER_SPEC.md` (this file)
  - `SPEC_CHANGELOG.md`
  - `RUNBOOK.md` (dev + prod operations)
  - `SECURITY.md` (security controls and incident response)
  - `TEST_PLAN.md` (UAT + E2E definitions)

---

## 2. System Architecture

## 2.1 Frontend Stack
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui + Framer Motion
- React Router with v7 future flags:
  - `v7_startTransition: true`
  - `v7_relativeSplatPath: true`
- Query/data layer: React Query (or equivalent) for network state, retries, stale caching
- Form handling: schema-driven validation (Zod/Yup recommended)

### 2.1.1 Vite Requirements
- HMR enabled
- Split chunks for large routes
- Build target optimized for modern mobile browsers
- Environment variables loaded from `.env`, `.env.local`, deployment env

---

## 2.2 Required Routes

- `/` (home/dashboard)
- `/social`
- `/chats`
- `/chat-dialogue?id=`
- `/ai-vet`
- `/map`
- `/auth`
- `/onboarding`
- `/edit-profile`
- `/edit-pet-profile`
- `/pet-details?id=`
- `/settings`
- `/subscription`
- `/premium`
- `/manage-subscription`
- `/verify-identity`
- `/admin`
- `/privacy`
- `/terms`
- `*` (not found)

### 2.2.1 Route Access Control
- Public: `/auth`, `/privacy`, `/terms`
- Auth-required: all user app routes
- Admin-only: `/admin`
- Verified-only actions: identity-locked flows and sensitive marketplace actions (where specified)
- Age-gated routes:
  - `/social` and `/chats` are blocked for users under 16 using a non-interactive overlay.

---

## 2.3 Global State & Providers

### 2.3.1 AuthContext
Manages:
- session + user
- profile snapshot
- tier and counters (`stars_count`, `mesh_alert_count`, `media_credits`, `family_slots`)
- auth actions:
  - email/password sign-in
  - phone auth
  - sign-out
  - refresh profile

### 2.3.2 LanguageContext
- `t(key)` translation wrapper
- Fallback order: selected locale -> `en`
- No hardcoded user-facing strings

### 2.3.3 NetworkContext
- Online/offline detection
- Offline action queue + replay
- No UX-blocking false negatives for cloud mode

### 2.3.4 Error Boundary
- App-level crash fallback
- Recovery CTA: Retry + Go Home
- Error telemetry sent to monitoring

---

## 2.4 Backend Stack (Supabase)

### 2.4.1 Supabase Services
- Postgres
- Realtime
- Auth
- Storage
- Edge Functions
- pg_cron (for scheduled releases/maintenance)

### 2.4.2 Required Edge Functions
- `create-checkout-session`
- `create-portal-session`
- `create-connect-account`
- `create-marketplace-booking`
- `stripe-webhook`
- `mesh-alert`
- `hazard-scan`

### 2.4.3 Service Role Usage
`SUPABASE_SERVICE_ROLE_KEY` allowed only in server-side/Edge code paths for privileged operations.

---

## 2.5 PWA Requirements

- `manifest.json`:
  - app name/short name
  - icons (192, 512)
  - `display: standalone`
  - theme/background colors
- Service Worker:
  - app shell cache
  - offline fallback route
  - stale-while-revalidate for non-critical assets
- Install prompts:
  - Android + iOS guided UX
- Must not cache sensitive auth responses insecurely

---

## 3. Environment & Connectivity

## 3.1 Required Environment Variables

### Frontend
- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`
- `VITE_OPENAI_BASE_URL` (if proxied, optional)

### Backend / Edge
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `FCM_SERVER_KEY` (or provider equivalent)

## 3.2 Connectivity Rules
- No hardcoded API/WS localhost strings in app source
- Missing env var:
  - log clear warning
  - fail gracefully without crashing
- Cloud mode should not show false “unreachable server” banners

## 3.3 Environment Profiles & Safety
- Development / localhost:
  - Use `.env.local` with `ALLOW_STRIPE_FALLBACK=true` and `ALLOW_WEBHOOK_TEST_BYPASS=true` for local Stripe-less testing.
- Production:
  - Use `.env.production` with both flags set to `false` or unset.
  - Never ship test bypass mode enabled.
- Hosted platforms:
  - Configure env vars separately per environment in Vercel/Netlify dashboards.
- CI guardrail:
  - CI must fail if bypass flags are enabled in production env files.

---

## 4. Data Model (Canonical Contracts)

## 4.1 `public.profiles` Required Columns

- `id`
- `display_name`
- `legal_name`
- `phone`
- `avatar_url`
- `bio`
- `gender_genre`
- `orientation`
- `dob`
- `height`
- `weight`
- `weight_unit`
- `degree`
- `school`
- `major`
- `affiliation`
- `occupation`
- `pet_experience`
- `experience_years`
- `relationship_status`
- `has_car`
- `languages`
- `location_name`
- `is_verified`
- `user_role`
- `tier`
- `subscription_status`
- `stars_count`
- `mesh_alert_count`
- `media_credits`
- `family_slots`
- `onboarding_completed`
- `owns_pets`
- `social_availability`
- `availability_status`
- `show_gender`
- `show_orientation`
- `show_age`
- `show_height`
- `show_weight`
- `show_academic`
- `show_affiliation`
- `show_occupation`
- `show_bio`
- `last_lat`
- `last_lng`
- `care_circle`
- `verification_status`
- `verification_comment`
- `verification_document_url` (required for verification workflow)

## 4.2 Verification Enums
- `verification_status` values: `pending | approved | rejected`

## 4.3 Additional Required Tables
- `pets`
- `chat_rooms` / `chat_room_members` / `chat_messages`
- `marketplace_bookings`
- `transactions` (unique `stripe_event_id`)
- `scan_rate_limits`
- `triage_cache`
- `map_alerts`
- `family_invites`
- `notification_logs`
- `admin_audit_logs`

## 4.4 Required Constraints/Policies
- RLS on all user data tables
- Chat visibility only for room members
- Unique constraint for Stripe webhook idempotency
- Trigger/protection for monetized fields (client cannot tamper)
- Explicit unauthenticated denial: `REVOKE SELECT ON public.profiles FROM anon;` (forces 403 on unauth SELECT)
## 4.5 Schema Alignment (Mandatory)
- `public.profiles` must include (at minimum) the 49 canonical profile fields listed in section 4.1.
- Explicit required profile columns for schema-cache stability:
  - `occupation TEXT`
  - `verification_status TEXT`
  - `verification_comment TEXT`
- `public.pets` must include:
  - `neutered_spayed BOOLEAN`
  - `clinic_name TEXT`
  - `preferred_vet TEXT`
  - `phone_no TEXT`
  - `next_vaccination_reminder DATE` with validation `> CURRENT_DATE`
- Identity verification storage bucket must exist:
  - `identity_verification` (private by default, admin-readable).

---

## 5. Feature Requirements (End-to-End)

## 5.1 Auth & Onboarding
- Auth methods:
  - email/password (`signInWithPassword`)
  - phone auth
- Login mode:
  - Default to email login.
  - Allow instant toggle to phone login (`Use phone instead` / `Use email instead`).
- Signup identity contract:
  - Email and phone are both mandatory on sign-up.
  - Missing email/phone must hard-block submit and show localized popup error.
- Mandatory signup fields:
  - legal name
  - display name
  - phone (+country code format)
- Remember-me behavior:
  - Persist chosen login method + identifier in `localStorage`.
  - Session persistence uses secure browser storage through Supabase auth client config.
- Validation errors localized
- Onboarding cannot proceed with missing required identity fields
- DOB is mandatory and must be captured at registration/onboarding for age enforcement.

## 5.2 Identity Verification + Admin Review
Flow:
1. User starts `/verify-identity`.
2. Screen 1: select country + document type (`ID`, `Passport`, `Driver's License`).
3. Screen 2: legal disclaimer for biometric processing and deletion policy; continue only after explicit consent.
4. Screen 3: selfie capture (`I am ready`).
5. Screen 4: ID document capture (`I am ready`).
6. Upload artifacts to `identity_verification` bucket and set `verification_status = pending`.
7. Screen 5: success state — `Social access granted pending review`.
8. Admin reviews from `/admin` queue and approves/rejects with comment.
9. Approved user gets verified state + gold badge treatment.
10. Rejected user receives explicit rejection reason in UI.
11. Verified users cannot edit locked identity fields:
   - legal_name
   - display_name
   - phone

## 5.2.1 Age Gating
- Users under 16 are blocked from Social/Chat interactivity.
- UI implementation requirement:
  - Add a transparent `pointer-events-none` overlay on `/social` and `/chats`.
  - Show notice: `Social features restricted for users under 16.`
- Age calculation must use `dob` from `profiles`.

## 5.3 Pet Management
- Add/Edit/New screens share one canonical layout and field set
- Breed dropdowns must be available for all species.
- Vaccination dates must use date pickers (same style/format as DOB pickers).
- `next_vaccination_reminder` must be a future date.
- Vet contact split fields: `clinic_name`, `preferred_vet`, `phone_no` (country code selector + validation).
- Ownership toggle:
  - if `pets_profile_count > 0`: `currently_owned_pets = YES`; block `Animal Friend (No Pet)`.
  - if `pets_profile_count == 0`: default `currently_owned_pets = NO` and preselect `Animal Friend (No Pet)`.
- Changes persist immediately and reflect in UI

## 5.4 Social + Match + Chat
- Swipe cards with expandable profile modal
- Match event must trigger modal and route to chat
- Realtime messaging with optimistic UI + reconciliation
- No dead buttons or broken handlers

## 5.5 Nanny Marketplace + Escrow
Flow:
1. Green `$` icon opens booking modal
2. Required fields:
   - date
   - start/end time
   - pet
   - location
   - currency/price display
3. Create checkout via Edge function
4. Stripe checkout (USD default)
5. On success webhook marks payment + logs transaction
6. Escrow release cron enforces wait window
7. Dispute flow pauses release and requires admin review

**Fee rule:** `application_fee_amount = Math.round(total * 0.1)`

## 5.6 Revenue & Upsells
Trigger logic:
- `stars_count === 0` -> stars upsell
- `mesh_alert_count === 0` -> alert upsell
- `media_credits === 0` + free tier -> media/premium upsell
- family count >= base + slots -> family upsell

Post-purchase:
- webhook updates profile counters/tier
- UI polls/refetches to sync state

## 5.7 Invite Family
- Free tier: upsell path
- Gold/purchased slots: invite link/share page
- Invite consume/limit enforced by backend

## 5.8 AI Vet + Hazard Scanner
- AI prompt includes active pet context:
  - name, species, breed, weight
- Hazard scan free tier limit:
  - 3 scans per rolling 24h
- Caching and repeated image dedupe allowed to reduce cost

## 5.9 Map & Alerts
- Pin types/colors:
  - Lost red
  - Stray blue
  - Friend green
  - Found grey
  - Vet hospital emoji
- Reject low-quality geolocation accuracy thresholds
- Mesh alerts routed to nearby users and logged
- Manual pin mode:
  - `Pin Location` display window: 2 hours
  - `Lost/Stray` display window: 12 hours

## 5.10 Notifications
- Event types:
  - match
  - message
  - booking status
  - dispute
  - verification decision
- Push + in-app notification model
- Missing push creds must degrade safely with logging

## 5.11 Settings / Navigation UX
- Rename gear menu entry to `Settings`.
- Side menu must include:
  - `Report a Bug`
  - `Privacy & Safety Policy`
  - `Terms`
- `Logout` must remain outside side menu groupings.
- Family invite upsell banner must be centered, gold-themed, with copy:
  - `Upgrade to Gold for Family Sharing.`
  - link target: `/manage-subscription`

---

## 6. Brand & Visual System

## 6.1 Color Tokens
- Blue: `#3283ff`
- Green: `#a6d539`
- Grey: `#a1a4a9`
- Gold gradient: restricted to premium/verified/gold contexts

## 6.2 Typography
- Brand string always lowercase: `huddle`
- Calibri for key brand wordmark usage

## 6.3 Header Rules
- No “pet care & social” subtitle
- No extra pet-head icon artifacts
- Single gear icon in expected placement

## 6.4 Modal Rules
- z-index `z-[50+]` minimum
- Critical overlays may use higher stacking (`z-[9999]`)

## 6.5 Mobile Rules
- Support <= 430px width
- No overlap with fixed nav/footer
- Touch target minimum 44x44px
- Smooth native-like interactions

---

## 7. Security & Vulnerability Mitigation (Zero Tolerance)

1. Server-side amount validation for all payments/bookings  
2. Stripe webhook idempotency by unique event ID  
3. RLS hardening for chat, profile, bookings, verification  
4. Service role only in trusted server contexts  
5. Geolocation spoofing checks  
6. Verification self-claim blocked  
7. Protected monetization fields trigger/policy  
8. CSRF/XSS-safe form and rendering patterns  
9. Audit logs for admin actions and monetization changes  
10. Secret management and no leakage to client bundles
11. Age assurance enforcement and account termination rights for false age/verification data
12. Zero tolerance moderation: harassment, hate speech, sexual exploitation
13. KYC artifact handling with least-privilege bucket policies and auditable admin actions

---

## 8. Performance Requirements

- Route-level lazy loading for heavy pages
- Pagination/virtualization for chat/feed
- Image compression + responsive loading
- Debounced map/filter/search interactions
- Minimize bundle size and chunk warnings
- Background retries with capped exponential backoff

---

## 9. Accessibility (a11y) Standards

- WCAG 2.2 AA baseline
- Keyboard navigation across interactive components
- Focus trap and return-focus on modals
- Proper labels/aria semantics
- Error states readable via screen readers
- Color contrast >= required thresholds

---

## 10. Testing Strategy

## 10.1 Automated
- Unit: hooks, validators, utilities
- Integration: auth/profile/chat/bookings/webhook logic
- E2E: critical user journeys and admin review flow

## 10.2 Required Persona UAT
- Free new user
- Premium user
- Gold verified user
- Sitter
- Matched social user
- Admin reviewer

## 10.3 Must-pass Scenarios
- Incomplete signup blocked
- Profile + pet persistence
- Chat outsider denied by RLS
- Booking + checkout handoff
- Webhook fulfillment idempotency
- Verification approval lock behavior
- Upsell trigger + post-purchase unlock

---

## 11. CI/CD & Deployment

## 11.1 CI Pipeline (GitHub Actions)
- install
- typecheck
- lint
- unit/integration tests
- build
- migration validation
- optional preview deployment

## 11.2 CD Pipeline
- Protected `main` branch
- Required status checks
- Environment-scoped secrets
- Rollback plan required before production push

## 11.3 Observability
- Sentry (frontend + edge)
- Supabase logs and alerts
- Webhook failure alerting
- Booking/payment anomaly alerts

---

## 12. Operations & Maintenance

## 12.1 Auto-Purge Script
- Purge test auth users, profiles, pets, optional relational records
- Preserve storage bucket objects when in “preserve-media” mode
- Dry-run + execution logs required

## 12.2 Data Migration Discipline
- Every schema change via migration file
- Never manual drift without migration backfill
- Migration naming timestamped and descriptive

---

## 13. Release Verification Gate (All YES Required)

1. Primary action/icon color rules compliant  
2. Booking modal complete and functional  
3. Webhook deployed with idempotency  
4. Build passes with zero TS errors  
5. Header cleanup compliant  
6. Modals layered correctly on mobile  
7. Upsell triggers wired for all defined conditions  
8. Monetized field protection active  
9. i18n coverage complete  
10. Vouch logic constrained correctly  
11. Invite family logic slot/tier-safe  
12. No dead links/buttons/routes  
13. Admin verification flow operational end-to-end
14. Age-gating under-16 overlay active on Social/Chat
15. Identity verification `/verify-identity` 5-step KYC flow functional
16. Stripe checkout currency defaults to USD
17. Map pin TTL rules enforced (2h pin / 12h lost-stray)

---

## Final Lock Statement
This is the canonical rebuild guide for huddle.  
No change is valid unless:
1. version bump is made, and  
2. `SPEC_CHANGELOG.md` is updated with rationale, scope, migration impact, and rollback notes.

---

# v1.2 UPGRADE ADDENDUM (MANDATORY OVERRIDES)
This addendum is **authoritative** and overrides any conflicting text above.

## CRITICAL ADDITION: Efficiency Mandate
- Codex must prioritize **Serverless Logic (Supabase Edge Functions)** and **Database Constraints** over client-side logic to minimize bugs and prevent unauthorized API usage.
- All external API calls (Gemini, Stripe) must include **error handling for "Quota Exceeded"** to ensure the app doesn't crash when limits are hit.
- Include all suggested error-handling patterns above.

## Backup Fallback Plan (Pre-Change Protocol)
Before any changes:
1. Duplicate the current spec as `MASTER_SPEC_BACKUP_v1.1.1.md` in repo root.
2. All Supabase schema changes must be via **timestamped migrations** (e.g., `20260205_add_dob_location.sql`).
3. Git branch: create `upgrade-v1.2` from main (branch name in repo is `codex/upgrade-v1.2` per tooling policy).
4. Commit incrementally with revert points (e.g., `git commit -m "Pre-KYC schema backup"`).
5. If failures occur (schema cache errors, API wiring breaks):
   - rollback: `git checkout main`
   - apply backup migrations **in reverse**
   - restore SPEC from backup
6. Test rollback in staging first.

## Version Bump Rationale (SPEC_CHANGELOG.md Entry Required)
Massive structural overhaul: UI/UX consistency, KYC/age gating, social/chats restructure, subscription algo, family invites, pet/user profile enhancements, real AI Vet via Gemini, escrow bookings, threads system, map refinements.  
Impact: heavy Supabase (new buckets, columns, RLS, triggers), Stripe Connect/escrow, Gemini API.  
Rollback: revert to v1.1.1 backup if UAT fails >20% scenarios.

## Incorporate All User Changes (Word-for-Word with Typos Fixed)
Fix wording:
- "boarder" → "border"
- "huddles" → "huddlers"
- "comepleted" → "completed"
- "fill in slot" → "input slot"
- "Pet Drivers with Car" → "Has Car"
- "PET ALBUM" → "Social Album"
- "stimulate" → "simulate"
Technical refinements:
- use `pointer-events-none` as CSS class
- use `onClick/onPress` as event handlers
- "escrow" via Stripe holds/manual payouts

---

## 0. Product DNA (UPDATED)
Add: **Real AI Vet via Gemini**
- Gemini 1.5 Flash for text chat (low latency/cost)
- Gemini 1.5 Pro only for multi-modal (image/video)
- **Context caching on server** to reduce token costs for long chats

---

## 1. Workspace & Output Rules (UPDATED)
- All changes must use migrations for Supabase schema to avoid cache errors.
- **MANDATORY GLOBAL THEMING**: Implement strict Design Tokens (e.g., `theme.ts` or `tailwind.config.js`) for:
  - Colors
  - Fonts (pt14/pt12)
  - Spacing
  - Borders  
All UI components must reference tokens to prevent CSS drift.

---

## 2. System Architecture (UPDATED)
### 2.2 Required Routes (Add)
- `/verify-identity` (KYC flow)
- `/threads` (alias for Social if restructured)

### 2.2.1 Route Access Control (Update)
- Age-gated: `/social`, `/chats`, `/discover` blocked for <16 with `pointer-events-none` overlay + notice:
  - `Social features restricted for users under 16.`
- Verified-only:
  - Social album uploads
  - Group creation
  - Ratings

---

## 4. Data Model (UPDATED)
### 4.1 `public.profiles` (Add Columns)
- `dob DATE` (mandatory)
- `location_country TEXT`
- `location_district TEXT`
- `user_id TEXT` (unique 10-digit random string, immutable)
- `verification_status TEXT` (pending/approved/rejected)
- `verification_comment TEXT`
- `verification_document_url TEXT`
- `has_car BOOLEAN` (visible toggle)
- `languages TEXT[]` (visible toggle)
- `relationship_status TEXT` (visible toggle)
- `social_album TEXT[]` (URLs to 5 compressed images)

### 4.3 Additional Tables (Add)
- `threads` (id, user_id, title, tags TEXT[], hashtags TEXT[], content TEXT, images TEXT[])
- `thread_comments` (id, thread_id, user_id, text, images TEXT[])
- `family_members` (id, inviter_user_id, invitee_user_id, status pending/accepted/declined)
- `transactions` add:
  - `escrow_status` (pending/released/disputed)
  - `idempotency_key TEXT UNIQUE`

### 4.4 Constraints/Policies (Update)
- RLS on profiles/pets/threads: owner-only edit, verified-only ratings/groups.
- Trigger `user_id`: post-insert generate unique 10-digit random string (function `generate_uid(10)`).
- Age constraint: `dob < CURRENT_DATE - INTERVAL '16 years'`.
- Pet weight `< 100`.
- Vaccination date `<= CURRENT_DATE`.
- Next vaccination reminder `> CURRENT_DATE`.
- New bucket: `identity_verification` (private, admin-readable).
- **PII SECURITY**: identity_verification bucket with strict RLS (only owner or admin).
- **Auto-delete**: pg_cron to delete identity images **7 days** after verification_status = Approved/Rejected.

### 4.5 Schema Alignment
- Fix schema cache errors by adding missing columns (e.g., `clinic_name` in `pets`) via migrations, then refresh cache.

---

## 5. Feature Requirements (UPDATED)

### 5.1 Auth & Onboarding (Update)
- Auth page fields:
  - Display/User Name
  - Email
  - Phone number (with border)
  - Password
  - No legal name on Auth
- Name text-only (no numbers).
- Email must be valid format.
- Onboarding required:
  - Legal name*
  - Phone*
  - DOB*
  - Location* (Country + District)
- Preload phone from auth.
- Phone icon next to Phone Number.
- Full background color on phone slot.
- Trigger KYC on image submit.
- Generate immutable `user_id` (10-digit) post-onboarding, show under Basic Info.

### 5.2 Identity Verification + Admin Review (Update Full Flow)
**/verify-identity flow**
1. Doc Type screen: ID/Passport/Driver’s License + legal subtext:
   - “We collect your selfie and ID document image to verify your age and identity... [legal text]”
2. Legal disclaimer (biometric usage/deletion) + “Agree & Continue”.
3. Selfie (rear camera) → “I am ready.”
4. ID Doc (main camera) → “I am ready.”
5. Success: “Social access granted pending review.”
**Compression mandate**: max 500KB, max width 1024px before upload.  
Storage: Supabase bucket `identity_verification`.  
Admin: toggle verification_status Approved/Rejected.

### 5.3 Pet Management (Update)
- Weight <100kg.
- Pet name + breed mandatory.
- Vaccination record <= current date (real-time error).
- Next reminder > current date (real-time error).
- No background color on vet phone slot.
- Ensure schema cache fix for `clinic_name`.

### 5.4 Social + Match + Chat (Restructure)
- Discover is moved under Chats tab (above chat list).
- Social tab becomes Threads only.
- Filters apply real-time (fix non-application).
- Pet Height → Pet Size.
- Distance: “See further” subtext:
  - “Extend search if run out of profiles” with +5km increments.
- Profile View: onClick/onPress opens full view with scroll, social album previews (lazy load), 2-hour pinned location map.
- Discover backend: must use Edge Function `social-discovery` + PostGIS RPC (`social_discovery`) for filtering/ordering.
- Remove Huddle Nearby.
- Chats: Fail-safe messaging; nanny remark always top:
  - “Book verified Pet Nannies for safety...”
- Nanny view pin: “A verified badge increases trust...”
- Media send deducts quota (compression <500KB mandatory).
- Swipe left delete: Unmatch/remove convo (except transactions).
- Verified badge only on head icon.
- Groups: verified premium only create, all can join.
- Book Nanny: multi-day date range, pet dropdown, district input, currency select next to amount, button text “Proceed Booking Payment”.
- Escrow: hold full amount, release post-48h confirmation/no dispute ($90 provider, $10 platform via separate charges/transfers).
- Dispute: admin review, hold/release/refund.

### 5.5 Nanny Marketplace + Escrow (Update)
- All Stripe API calls must include **Idempotency-Key** (UUID v4).
- Webhooks on `payment_intent.succeeded` to update DB (do not rely on client-only success).
- Booking UI must include **currency selector** next to amount and **multi-day range** (start date/time + end date/time).

### 5.6 Revenue & Upsells (Update Table/Algo)
Sequence + limits:
- Family Slot: Free/Prem “-”, Gold “1 Extra Member”
- Thread limits: Free 1, Prem 5, Gold 30 (per 30-day cycle)
- Discovery Filters: Free basic, Prem/Gold advanced
- Visibility: Free “-”, Prem/Gold priority
- Star: Free/Prem “-”, Gold 3 (chat without mutual wave)
- Media: Free “-”, Prem 10, Gold 50
- Alert: Free 5, Prem 20, Gold Unlimited
- Broadcast range: Free 1km, Prem 5km, Gold 20km
- Ad-free: Gold only
+Add-ons:
+- 3 Star Pack: “Superpower to trigger chats immediately”
+- Broadcast Alert: “Additional broadcast alert”
+- Additional 10 media: “Additional 10 media usage across Social, Chats and AI Vet.”
+Remove verified badge purchase.
+Dynamic pricing from Stripe (USD default).
+Add-on cart below buttons, Stripe payment, past transactions demo.
+
+### 5.7 Invite Family (Update)
+- Non-Gold: Grey/blocked.
+- Gold: Green Invite → popup for 10-digit user_id input + Invite.
+- Error if invalid.
+- Receiver: notification popup “(Display/User Name fetched from user_id) has invited you to join their family!”
+- Accept: Add to sender’s expandable Family section.
+
+### 5.8 AI Vet + Hazard Scanner (Real)
+- Gemini 1.5 Flash text, Gemini 1.5 Pro for image.
+- Token Bucket rate limit in Edge Functions (e.g., 50/day Free).
+- Return HTTP 429 “Quota Exceeded”.
+- Context: pet name/species/breed/weight/history.
+- Emergency triage: keywords trigger map.
+- Gold: Unlimited; Nanny summary button.
+- Log to Firestore.
+
+### 5.9 Map & Alerts (Update)
+- Remove search/visible toggle → “Pin my Location” with subtext:
+  - “Available on map for 2 hours and stay in system for 24 hours to receive broadcast alert. If you want to mute alerts, please go to Account Settings.”
+- Auto-load real HK vets (address/hours/mobile). White icon with green/red dot (open/closed).
+- Subtext: “Timely reflection of any changes of operations of the Vet Clinic is not guaranteed”.
+- Ratings: verified users only; non-verified popup “Available to verified users only”.
+- Friends pin: opens profile, close top-right.
+- Tap map/manual input for location (fix localhost).
+- **Performance**: PostGIS `ST_DWithin(geography, geography, meters)` + GIST index.
+
+### 5.11 Settings / Navigation UX (Update)
+- Gear sidebar order: “Profile”, “Account Settings”, “huddle Premium”, “Help & Support”, “Privacy Policy”, “Terms of Service”.
+- Logout above footer.
+- Account Settings: Gold users manage subscription under Gold Crown.
+- Remove Help & Support for all.
+
+---
+
+## 6. Global UI/UX (Additions)
+- “Display Name” → “Display/User Name”
+- pt14 font default, pt12 for subtext
+- Toggles label: “Visible to others” (Relationship Status, Has Car, Languages, Location)
+- “Pet Parents” → “Pet Parent”
+- Upsells: expand from footer (never block), return button top-left
+- “New huddles” → “New huddlers”
+- Pet icon border blue → green
+- Remove Huddle Wisdom links/lightbulb
+- “Notice Board” → “Threads”
+- Auth/Onboarding updates as above
+- User Profile:
+  - preload legal/name/location/phone
+  - logos next to titles
+  - “Your legal name” → “Legal Name”
+  - “Your Display name” → “Legal Name”
+- Pet Nanny: Generate Stripe Connect Account Link
+- Social Album: 5 compressed images, bottom section, preview grid
+- Premium popup (gold tone) ticks:
+  - “Meet verified pet friends”
+  - “Advance filtering”
+  - “Meet more friends”
+  - “Instant Booster”
+- Chats header: “Chats” → “Discover” section above list
+- Threads: search + tags dropdown (Dog/Cat/Pet News/Social/Others)
+- Threads display: icon/name/badge/tag/title/hashtag
+- Start Thread popup: title <20 chars, tag dropdown, 3 hashtags, content (text/image)
+- Comments: text/image
+- Media usage deducts quota, upsell at 0
+
+---
+
+## Protocols & Execution (Mandatory)
+
+### Protocol 1: Tribunal Verification
+1) **DBA**
+   - Run: `npx supabase gen types typescript --local > types/supabase.ts`
+   - If generator fails or produces any types, task is incomplete.
+   - Show `supabase migration list` output.
+
+2) **SecOps**
+   - Attempt query of `identity_verification` bucket or profiles as unauth user or <16 user.
+   - Must fail with RLS Policy Violation.
+   - Show active RLS SQL policy block.
+
+3) **DevOps**
+   - Ensure all changed files staged.
+   - Run `git status` (no modified files).
+   - Push: `git push origin upgrade-v1.2` (branch in repo is `codex/upgrade-v1.2`).
+   - Show commit hash.
+
+### Protocol 2: One-Shot Execution Plan
+Phase 1: Backup & Foundations  
+Phase 2: Global Theming  
+Phase 3: Logic & API (Gemini/Stripe)  
+Phase 4: Feature Rollout  
+Phase 5: UAT Simulation  
+
+Execution Mandate: 1000% precision. Output exact diffs/SQL.  
+Always ask: “Tribunal Verification complete. Ready for next phase?”
+
+---
+
+## Algorithms & Logics (Mandatory)
+Discovery Filter/Prioritization:
+- Free: Age/Gender/Height/Distance/Species/Role (+100 for species)
+- Prem/Gold: +Verification (+50), Compatibility (+30), Logistics/Skills (+30), Activity (+20), Connection (+20)
+- Score = sum(weights), order DESC, membership_priority (1 Free, 2 Prem/Gold)
+- Implement in Edge Function `social_discovery` using PostGIS `ST_DWithin`
+
+Membership Perks:
+- Threads limit by 30-day window (1/5/30)
+- Media/Alert decrement on use
+- Star triggers chat without mutual
+
+Broadcast Range:
+- Free 1km, Prem 5km, Gold 20km with geofence
+- Use `ST_DWithin(location, user_location, radius_in_meters)`
+
+---
+
+## Post-Enhancement Checklist (After UAT)
+Localhost Proof:
+- flutter run (if applicable)
+- KYC flow (camera + compression <500KB)
+- Media quota deduction
+- Book nanny (escrow + idempotency)
+- AI chat (Gemini Flash + 429 Quota test)
+- Threads limit enforced
+- Family invite flow
+
+Supabase Proof:
+- `SELECT user_id,dob,verification_status FROM profiles`
+- Bucket `identity_verification` exists + private RLS
+- Trigger logs (user_id gen, PII deletion schedule)
+
+GitHub Proof:
+- `upgrade-v1.2` (actual branch `codex/upgrade-v1.2`) shows migrations + PR merged.
+
+UAT:
+- 10 fake users; 100% pass
+- No cache errors
+- AI responses empathetic
