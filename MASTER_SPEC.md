# MASTER_SPEC.md — huddle Engineering Bible

**Version:** 3.2 Canonical  
**Last Updated:** 2026-02-18  
**Status:** Authoritative Architecture

---

## 1. Product Definition

huddle is a mobile-first pet safety super-app comprising:

1. **Emergency Mesh Network:** Proximity broadcast alerts for lost/found pets
2. **Nanny Marketplace:** Vetted pet care bookings with escrow payments
3. **Social Discovery:** Swipe-based matching for pet parents and animal lovers
4. **AI Veterinary Assistant:** Multi-modal pet health consultation

**Design Target:** Instagram/TikTok smoothness, minimal UI, Huddle Blue (#2D37C8) primary, Gold (#CFAB21) premium accent.

**Technical Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL + PostGIS + Auth + Storage + Edge Functions), Stripe, Gemini AI.

**Platform:** PWA-first for iOS/Android/Web with native-like install and offline behavior.

---

## 2. Security & Identity

### 2.1 Social ID System

**Field:** `social_id`  
**Format:** 6-20 characters, lowercase letters + numbers + dot + underscore  
**Uniqueness:** Enforced via unique constraint  
**UI Display:** "@" prefix (e.g., "@alice_92")  
**Validation:** Real-time availability check with 400ms debounce

**Signup Flow:**
1. Age gate (18+ required)
2. Display Name + Social ID (both required)
3. Location (country + district dropdown)
4. Identity verification trigger (KYC)

### 2.2 Identity Verification (KYC)

**Purpose:** Age verification (18+) and trust badges.

**Flow:**
1. User uploads government-issued ID (Passport, Driver's License, National ID)
2. User captures selfie via device camera
3. Images stored in `identity_verification` bucket (Supabase Storage)
4. Admin reviews and sets `verification_status` (approved/rejected/pending)
5. Images auto-deleted 7 days post-decision via cron job

**Status Field:** `verification_status` in `profiles` table  
**Values:** `pending`, `approved`, `rejected`

**Badge:** Only `verification_status = approved` renders the verified badge.
- `pending`: user is in-review (badge not shown to others)
- `rejected`: treated as unverified for all gating; user may resubmit

### 2.3 PII Auto-Delete

**Cron Job:** `pii_purge_daily` runs daily at 02:15 UTC  
**Action:** Deletes identity verification images 7 days after status becomes `approved` or `rejected`

### 2.4 PostGIS & Geospatial

**Extension:** `postgis` enabled  
**Location Column:** `geography(Point, 4326)` on `profiles` table  
**Index:** GIST index on `location` column for ST_DWithin queries

**Broadcast Radius Enforcement:**
```sql
ST_DWithin(
  recipient.location,
  broadcast.location,
  radius_in_meters
)
```

### 2.5 Row-Level Security (RLS)

**Policies:**

**Profile Visibility:**
- Own profile: Full access
- Other profiles: Read-only, requires mutual visibility rules
- Location data: Hidden except during emergency broadcasts within radius

**Chat Privacy:**
- Messages visible only to sender and recipient
- Deleted chats remove all messages for deleting user

**Broadcast Alerts:**
- Visible to users within geographic radius during active window
- Creator can delete own broadcasts

---

## 3. Membership Economy

### 3.1 Pricing

| Tier | Monthly | Annual | Effective/mo |
|------|---------|--------|--------------|
| Free | $0 | $0 | $0 |
| Plus | US$5.99 (HK$46) | US$59.99 (HK$468) | US$4.99 |
| Gold | US$11.99 (HK$94) | US$109.99 (HK$858) | US$9.16 |

### 3.2 User-Facing Perks

| Feature | Free | Plus | Gold |
|---------|------|------|------|
| AI Vet Photo Uploads | 5/day | 20/day | 40/day |
| Discovery Profiles | Limited | ×2 Discovery | Unlimited |
| Discovery Priority | – | – | 3× visibility |
| Stars | – | 4/month | 10/month |
| Advanced Filters | No | Yes | Yes + Active Now + Same Energy |
| Video Upload | No | No | Yes |
| Link Family | Yes | Yes | Yes |
| Share Perks Add-On | No | $4.99/mo | $7.99/mo |

**Display Rules:**
- AI Vet uploads: Show numeric daily quota
- Discovery: Show qualitative language ("Limited", "×2 Discovery", "Unlimited")
- Stars: Show numeric monthly allocation
- Threads/Broadcast quotas: Never expose numeric caps publicly

### 3.3 Backend Caps

**Discovery:**
- Free: 100/day
- Plus: 250/day
- Gold: Unlimited

**Threads:**
- Free: 10/day
- Plus: 30/day
- Gold: 60/day

**Broadcast Alerts:**

| Tier | Monthly Quota | Max Active Slots | Duration | Radius |
|------|---------------|------------------|----------|--------|
| Free | 10 | 7 | 12h | 10km |
| Plus | 40 | 7 | 24h | 25km |
| Gold | 80 | 7 | 48h | 50km |

**Constraint Definitions:**
1. **Monthly Quota:** Total broadcast creations allowed per billing cycle
2. **Max Active Slots:** Concurrent broadcasts visible on map simultaneously
3. **Duration:** Per-broadcast lifetime from `created_at` timestamp
4. **Radius:** Geographic reach enforced via PostGIS ST_DWithin

**Enforcement:**
- Monthly quota check: `broadcast_quota_remaining > 0` before creation
- Active slots check: `COUNT(*) WHERE expires_at > NOW() < tier_max_active` before creation
- Creation blocked when active cap exceeded
- Existing active broadcasts expire naturally (no forced deletion on downgrade)

**Visibility Rules:**
- Users see: "8 broadcasts left this month"
- Users NEVER see: "8 of 10" or numeric cap totals
- Active broadcasts: "Active broadcasts: 5" (no limit number shown)

**Stars:**
- Free: 0
- Plus: 4/month
- Gold: 10/month

**Star Mechanics:**
1. User attempts to send Star
2. Star deducted ONLY when conversation successfully opens
3. If conversation open fails (network error, deleted account): NO deduction, retry allowed
4. Once deducted, Star is permanently consumed
5. Receiver replying does NOT grant Star back
6. Star is lost if no reply
7. Block/report actions do NOT refund Stars

**Wallet Cap:** Plus=4, Gold=10 (cannot accumulate beyond base allocation)

**AI Vet Uploads:**
- Free: 5/day
- Plus: 20/day
- Gold: 40/day

**Video Upload:**
- Free: No
- Plus: No
- Gold: Yes (unlimited, <500MB compressed)

### 3.4 Add-Ons

**Boost:** US$2.99
- 3× Discovery ranking weight for 24 hours
- Limit: 1 active Boost at a time
- Implementation: `boost_multiplier` = 3.0, `expires_at` = NOW() + 24h

**Super Broadcast:** US$4.99
- Grants: 1 `super_broadcast_credit` upon purchase
- Credit persists until used (no time expiry)
- On use:
  - Duration: 72h
  - Radius: 150km
  - Active slot bypass: +1 for this broadcast only
- Credit deducted ONLY upon successful broadcast creation
- Failed creation: Credit retained, retry allowed
- Does NOT permanently increase max active slot cap
- Survives tier upgrades/downgrades

**Share Perks:** Share Plus $4.99/mo, Share Gold $7.99/mo
- Max: 2 additional family members (3 total household)
- Effect: Members gain primary account's tier benefits (filters, features, video upload access)
- NO quota pooling of any kind

### 3.5 Family System

**Linking:** Available to all tiers  
**Max Household:** 3 accounts (1 primary + 2 members)  
**Login:** Separate credentials per account (no profile switching)  
**Quota Pooling:** Prohibited  
**Shared Badge:** "Family Member" badge displayed on all linked profiles

**Share Perks Add-On Effect:**
- Members gain primary's tier benefits (advanced filters, video upload, priority ranking)
- Discovery caps: Each account enforces own tier cap
- Thread quotas: Each account enforces own tier quota
- Star wallets: Separate allocations
- Broadcast quotas: Separate quotas
- Active slots: Separate slot limits
- AI Vet uploads: Separate quotas

### 3.6 Reset Logic

**Subscription Anniversary Reset:**
- Stars monthly allocation
- Broadcast monthly quota

**Local Midnight Reset (user timezone):**
- Threads daily quota
- Discovery daily quota
- AI Vet daily uploads

**Real-Time Expiration:**
- Active broadcast slots (expire when `expires_at` reached)
- Boost timers
- Super Broadcast duration

### 3.7 Upgrade / Downgrade

**Upgrade (Free→Plus, Plus→Gold):**
- Recalculate entitlement immediately
- New quota = new tier allocation − already consumed this cycle
- Example: Free user consumed 5 broadcasts (10/month quota), upgrades to Plus (40/month quota) → Remaining = 40 − 5 = 35

**Downgrade (Gold→Plus, Plus→Free):**
- Do NOT auto-delete active broadcasts
- Allow existing broadcasts to expire naturally
- Block new broadcast creation if current active count ≥ new tier limit
- Example: User has 10 active broadcasts, downgrades to Free (7 max active) → Cannot create new broadcasts until active count drops below 7

**Quota Recalculation:**
- Monthly quotas (Stars, Broadcasts): Adjust remaining = new allocation − consumed this cycle
- Daily quotas (Threads, Discovery, AI Vet): Reset at next local midnight with new tier caps

### 3.8 AI Vet Upload Edge Cases

**Quota Deduction:**
- Deduct quota ONLY on successful upload completion
- Failed upload (network error, file >10MB, API timeout): NO deduction
- Retry allowed after failure

**Concurrency:**
- Max concurrent uploads = remaining daily quota

**Error Handling:**
- Network failure: Display "Upload failed. Retry?" — quota NOT deducted
- File validation failure: Display error before upload attempt — quota NOT deducted
- API timeout: Display "Upload timed out. Retry?" — quota NOT deducted
- Silent drops are prohibited — user must be informed of failure state

---

## 4. AI & Payments

### 4.1 Gemini AI Vet

**Routing:**
- Text-only requests: Gemini 1.5 Flash
- Image/video requests: Gemini 1.5 Pro

**Context Enrichment:**
- Fetch pet data (breed, age, weight, medical history) from `pets` table
- Include vaccination records, medication history

**Response Characteristics:**
- Empathetic, calm, jargon-free
- Pet-centric language
- Actionable guidance
- Emergency triage keywords trigger map redirect

**Rate Limiting:**
- Token bucket algorithm enforced in Edge Functions
- Quota check before API call: `ai_vet_uploads_remaining > 0`
- HTTP 429 "Quota Exceeded" on breach

### 4.2 Nanny Marketplace Escrow

**Payment Flow:**

1. **Booking Creation:**
   - Provider sets rate (e.g., $100)
   - Client pays $100 via Stripe PaymentIntent (held in escrow)
   - Booking status: `pending`

2. **Service Delivery:**
   - Service occurs between `service_start_date` and `service_end_date`

3. **48-Hour Dispute Window:**
   - Window begins after `service_end_date`
   - Client may initiate dispute within 48h
   - No dispute filed → Automatic payout

4. **Automatic Payout (No Dispute):**
   - Transfer $90 to provider's Stripe Connected Account
   - Platform retains $10 (10% fee)
   - Booking status: `completed`

5. **Dispute Flow (Dispute Filed):**
   - Booking status: `disputed`
   - Admin review required
   - Admin options:
     - Release $100 to provider (platform absorbs $10 loss)
     - Refund $100 to client (provider gets $0, platform gets $0)
     - Partial split via manual Transfer adjustments

**Platform Fee:** 10% deducted ONLY when provider is paid  
**Refund Rule:** Platform fee = $0 on full refund

**Stripe Implementation:**
- Idempotency Key: `booking_{userId}_{timestamp}` in Edge Function header
- Metadata: `client_id`, `sitter_id`, `service_start_date`, `service_end_date`, `pet_id`, `location_name`, `safe_harbor_accepted`
- Webhooks: `payment_intent.succeeded` → update `marketplace_bookings` status
- Cron Job: Daily check for `current_date > service_end_date + 48h` AND status `pending` → trigger Transfer

**Safe Harbor:**
- Booking MUST include `safeHarborAccepted = true` (checkbox in UI)
- Metadata includes `safe_harbor_accepted=true`

**Edge Cases:**
- Cancellation before `service_start_date`: Full refund, status `cancelled`
- Cancellation after `service_start_date`: Dispute required
- Provider no-show: Client initiates dispute within 48h

---

## 5. Social Discovery

### 5.1 Discovery Algorithm

**Filtering:**

**Basic Filters (Free):**
- Age
- Gender
- Pet species
- Distance
- Role (Pet Parent, Animal Lover, Pet Nanny)

**Advanced Filters (Plus/Gold):**
- Verification status
- Compatibility (shared interests)
- Activity level
- Logistics/skills (grooming, training, vet tech)

**Scoring:**
```
score = species_match * 100
      + verification_badge * 50
      + gold_tier * 30
      + compatibility * 30
      + logistics_skills * 30
      + activity_level * 20
      + connection_strength * 20
```

**Prioritization:**
- Plus/Gold users occupy top 20% of Discovery queue
- Free users fill remaining 80%

**Implementation:**
- PostGIS ST_DWithin for geofence
- WHERE clauses for tier-gated filters
- ORDER BY score DESC, membership_priority DESC

### 5.2 Stars (Instant Chat)

**Purpose:** Bypass mutual wave requirement, open chat immediately

**Mechanics:** See § 3.3 Backend Caps

### 5.3 Waves & Matches

**Wave:** User A sends wave to User B  
**Match:** User B waves back  
**Chat Unlock:** Mutual wave opens chat thread

---

## 6. Broadcast Mesh Network

**Table:** `map_alerts`

**Fields:**
- `creator_id`
- `location` (geography)
- `radius_in_meters`
- `message`
- `alert_type` (lost/found/stray)
- `pet_id`
- `created_at`
- `expires_at` (computed: `created_at + duration`)

**Enforcement:** See § 3.3 Backend Caps — Broadcast Alerts

**Recipient Visibility:**
```sql
SELECT * FROM map_alerts
WHERE ST_DWithin(location, user_location, radius_in_meters)
  AND expires_at > NOW()
  AND creator_id != current_user_id
```

**Upsell Triggers:**
- Quota exhausted: Modal "You've reached your broadcast limit. Upgrade to Plus for more alerts."
- Active slots full: Modal "You have too many active broadcasts. Wait for one to expire or upgrade."

---

## 7. Threads (Community Forum)

**Quota:** See § 3.3 Backend Caps — Threads

**Scoring Algorithm:**
```
score = time_factor + relationship_bonus + badge_bonus + engagement_score - decay_penalty

time_factor = (NOW() - created_at) / '1 day'::interval * 10
relationship_bonus = CASE WHEN in_family OR in_care_circle THEN 20 ELSE 0 END
badge_bonus = CASE 
  WHEN verified AND gold THEN 80
  WHEN verified THEN 50
  WHEN gold THEN 30
  ELSE 0 END
engagement_score = replies * 5 + likes * 3 + views * 1
decay_penalty = LOG(age_days + 1) * 5
```

**Sorting:**
- Trending: ORDER BY score DESC
- Latest: ORDER BY created_at DESC

**Filtering:**
- Keyword: ILIKE on title/content
- Topic: IN (Dog, Cat, News, Social, Others)

**Update Frequency:**
- Score recomputed hourly via pg_cron job

---

## 8. Chat Safety & Moderation

### 8.1 Tables

**`user_blocks`:**
- `blocker_id` UUID (references profiles.id)
- `blocked_id` UUID (references profiles.id)
- `created_at` TIMESTAMP

**Unique Constraint:** `(blocker_id, blocked_id)`

**`user_reports`:**
- `id` UUID PRIMARY KEY
- `reporter_id` UUID (references profiles.id)
- `reported_id` UUID (references profiles.id)
- `category` TEXT (harassment, spam, inappropriate_content, underage, other)
- `message_id` UUID NULLABLE (references messages.id if reporting specific message)
- `description` TEXT NULLABLE
- `created_at` TIMESTAMP
- `status` TEXT (pending, reviewed, actioned, dismissed)

### 8.2 Block Enforcement

**Effect:**
- Blocker cannot see blocked user in Discovery
- Blocker cannot see blocked user in Map pins
- Blocker cannot see blocked user's Threads posts
- Blocked user cannot send messages to blocker
- Blocked user cannot open chat with blocker
- Existing chat thread hidden from blocker's chat list

**Star Refund:** Prohibited — If Star was used to open conversation, blocking does NOT refund Star

**Implementation (Bidirectional, Authoritative):**
- **Definition:** A and B are considered blocked if **either** (A blocked B) **or** (B blocked A).
- Query filter MUST exclude users where a block exists in either direction:
  - SQL pattern:
    - `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = auth.uid() AND b.blocked_id = target_user_id) OR (b.blocker_id = target_user_id AND b.blocked_id = auth.uid()))`
- Chat send / open MUST gate on bidirectional block:
  - `IF EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = sender_id AND b.blocked_id = recipient_id) OR (b.blocker_id = recipient_id AND b.blocked_id = sender_id)) THEN RAISE 'user_blocked'`
- Do NOT use one-direction `NOT IN (...)` filters; they miss the reverse-block case.

### 8.3 Report Flow

**User Action:**
1. User taps "Report" on profile/message
2. Selects category from dropdown
3. Optionally adds description
4. Submits report

**System Action:**
- Insert row into `user_reports` with status `pending`
- Does NOT hide reported user from reporter (use Block for that)
- Does NOT deduct quotas or refund Stars

**Admin Review:**
- Admin views pending reports via admin panel
- Admin options:
  - Mark as `reviewed` (no action)
  - Mark as `actioned` (content removed, user warned/suspended)
  - Mark as `dismissed` (false report)

**Auto-Hide / Suspension (Not Implemented in v3.0):**
- A report submission **never** hides a user immediately.
- Any auto-hide / suspension threshold is a **separate moderation system** and MUST NOT be implemented unless explicitly scoped and built (schema + admin workflow + visibility enforcement).

### 8.4 Moderation Layers

**Layer 1: User-Initiated**
- Block (immediate self-protection)
- Report (flag for admin review)

**Layer 2: System Moderation**
- Auto-hide threshold (aggregate report count)
- Keyword detection (profanity filter)

**Layer 3: Admin Enforcement**
- Manual review of reports
- Account suspension
- Content removal
- Report dismissal

**Separation Rule:** User actions (Block/Report) are distinct from system moderation and admin enforcement. User cannot trigger auto-suspend directly.

---

## 9. Data Schema

### 9.1 Core Tables

**`profiles`:**
- `id` UUID PRIMARY KEY
- `user_id` UUID (references auth.users)
- `social_id` TEXT UNIQUE
- `display_name` TEXT
- `location` GEOGRAPHY(Point, 4326)
- `location_country` TEXT
- `location_district` TEXT
- `verification_status` TEXT
- `membership_tier` TEXT **(allowed values: `free`, `plus`, `gold`; stored lowercase; UI labels use Title Case)**
- `subscription_id` TEXT (Stripe)
- `subscription_anniversary` DATE

**`pets`:**
- `id` UUID PRIMARY KEY
- `owner_id` UUID (references profiles.id)
- `name` TEXT
- `species` TEXT
- `breed` TEXT
- `age` INTEGER
- `weight` NUMERIC
- `vaccinations` JSONB
- `medications` JSONB

**`user_quotas`:**
- `user_id` UUID PRIMARY KEY
- `threads_today` INTEGER
- `discovery_today` INTEGER
- `ai_vet_today` INTEGER
- `stars_remaining` INTEGER
- `broadcasts_remaining` INTEGER
- `boost_active` BOOLEAN
- `boost_expires_at` TIMESTAMP
- `super_broadcast_credits` INTEGER

**`map_alerts`:**
- `id` UUID PRIMARY KEY
- `creator_id` UUID
- `location` GEOGRAPHY(Point, 4326)
- `radius_in_meters` INTEGER
- `message` TEXT
- `alert_type` TEXT
- `pet_id` UUID
- `created_at` TIMESTAMP
- `expires_at` TIMESTAMP

**`marketplace_bookings`:**
- `id` UUID PRIMARY KEY
- `client_id` UUID
- `sitter_id` UUID
- `pet_id` UUID
- `service_start_date` DATE
- `service_end_date` DATE
- `amount` NUMERIC
- `status` TEXT (pending/completed/disputed/cancelled)
- `stripe_payment_intent_id` TEXT
- `created_at` TIMESTAMP

**`user_blocks`:**
- See § 8.1

**`user_reports`:**
- See § 8.1

### 9.2 Indexes

**GIST Indexes (PostGIS):**
```sql
CREATE INDEX idx_profiles_location ON profiles USING GIST(location);
CREATE INDEX idx_map_alerts_location ON map_alerts USING GIST(location);
```

**B-Tree Indexes:**
```sql
CREATE INDEX idx_profiles_social_id ON profiles(social_id);
CREATE INDEX idx_profiles_membership_tier ON profiles(membership_tier);
CREATE INDEX idx_map_alerts_expires_at ON map_alerts(expires_at);
CREATE INDEX idx_marketplace_bookings_status ON marketplace_bookings(status);
```

---

## 10. Edge Functions

**`create-marketplace-booking`:**
- Creates Stripe PaymentIntent
- Inserts `marketplace_bookings` row
- Returns Stripe Checkout URL

**`check-and-increment-quota`:**
- Security definer function
- Checks quota before action
- Increments counter if allowed
- Returns boolean

**`process-dispute-resolution`:**
- Admin-only
- Executes Stripe Transfer or Refund
- Updates booking status

**`stripe-webhook`:**
- Listens for `payment_intent.succeeded`
- Updates `marketplace_bookings` status
- Verifies webhook signature

---

## 11. Cron Jobs

**`pii_purge_daily`:**
- Runs: Daily at 02:15 UTC
- Action: Delete identity verification images 7+ days old

**`quota_reset_local_midnight`:**
- Runs: Every hour
- Action: Reset daily quotas (Threads, Discovery, AI Vet) for users whose local midnight has passed

**`broadcast_expiry_cleanup`:**
- Runs: Every 15 minutes
- Action: Delete broadcasts where `expires_at < NOW()` **(post-expiry cleanup only; never deletes active broadcasts)**

**`marketplace_auto_payout`:**
- Runs: Daily at 03:00 UTC
- Action: Trigger Stripe Transfer for bookings where `service_end_date + 48h < NOW()` AND status = `pending`

**`threads_scoring_update`:**
- Runs: Hourly
- Action: Recalculate score for all threads

---

## 12. Upsell Logic

**Trigger Points:**
- Discovery exhausted: Show upsell modal "Upgrade to Plus for ×2 daily discovery"
- Threads exhausted: Show upsell modal "Upgrade to Plus to post more"
- Broadcast quota exhausted: Show upsell modal "You've reached your broadcast limit. Upgrade to Plus."
- Active slots full: Show upsell modal "You have too many active broadcasts. Wait or upgrade."
- Stars depleted: Show upsell modal "Upgrade to Plus for 4 Stars per month or Gold for 10"
- AI Vet exhausted: Show upsell modal "Upgrade to Plus for 20 uploads per day"

**CTA:** Redirect to `/premium` route with tier preselected

**Prohibited:**
- Raw backend errors shown to user
- Numeric cap totals exposed in UI copy (except AI Vet and Stars)

---

END OF MASTER_SPEC.md
