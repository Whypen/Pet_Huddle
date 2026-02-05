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
