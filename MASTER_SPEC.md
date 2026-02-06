# MASTER_SPEC.md — huddle v1.7 (Definitive, Single Source of Truth)

**Audience:** New full‑stack developer rebuilding from scratch.

**Source of Truth:** This document supersedes all previous specs. No other spec files exist in repo. Any change requires version bump and changelog entry in this file.

---

## 0. Product DNA
huddle is a mobile‑first pet‑care super‑app blending family mesh safety (emergency broadcasts), nanny marketplace (escrow bookings with 10% platform fee), social discovery (swipes/matches with pop‑ups), and fintech (subscriptions/add‑ons with webhooks). Experience target: Instagram/TikTok smoothness, minimal UI with Huddle Blue accents, gold gradient for premium. PWA required for native‑like install and offline behavior. No dead ends, no lag.

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
- **Roles:** `user`, `admin`, `sitter`
- **profiles.role:** `TEXT DEFAULT 'user'` used for admin authorization (separate from `user_role`)

### 2.2 PII Auto‑Delete
- **Cron Job:** `pii_purge_daily` runs daily at **02:15**. Deletes identity_verification images **7 days** after verification status becomes `approved` or `rejected`.

### 2.3 PostGIS & Radius Search
- **Radius Range:** 0‑150km
- **Index:** GIST index on `profiles.location` (geography)
- **Expansion:** UI button expands radius by **+15km** per click up to 150km max
- **Hidden IDs:** stored in local state `hiddenDiscoveryIds` in `src/pages/Chats.tsx` (cleared when Expand Search triggers)

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
1. **Status → Pending:** `profiles.verification_status = 'pending'`.
2. **Image → Bucket:** selfie + ID uploaded to `identity_verification` bucket (owner = auth.uid()).
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
- **Routing:** Gemini 1.5 Flash for text-only requests; Gemini 1.5 Pro for image input
- **Context:** pet data (breed/age/weight/history) injected into prompt
- **Rate Limiting:** token bucket in DB; return HTTP 429 on quota exceeded
- **QMS Gate:** `check_and_increment_quota('ai_vision')` must succeed before vision analysis

### 3.2 Stripe Escrow & Idempotency
- **Client Idempotency Key:** generated client‑side (e.g., `booking_{userId}_{timestamp}`) and passed to Edge Function header `idempotency-key`
- **Escrow:** hold 100% upfront, release after 48h if no dispute
- **Split:** 90% sitter payout, 10% platform fee
- **Dispute Resolution:** admin-only release/refund via `process-dispute-resolution`
- **Rule:** Platform fee is deducted only when sitter is paid (release action). Refund action sets platform fee to 0
- **Safe Harbor:** booking request must include `safeHarborAccepted = true` (checkbox in UI). Metadata includes `safe_harbor_accepted=true`
- **Hidden Wiring (Frontend → Edge → Stripe → DB):**
  - Frontend `Chats.tsx` invokes `create-marketplace-booking` with `idempotency-key` header
  - Edge Function calls Stripe Checkout Session → creates `payment_intent`
  - Stripe metadata includes: `client_id`, `sitter_id`, `service_start_date`, `service_end_date`, `pet_id`, `location_name`, `safe_harbor_accepted`
  - Edge Function inserts `marketplace_bookings` row as `pending`
  - `stripe-webhook` updates booking status on `payment_intent.succeeded`

---

## 4. Social Pillar (The Huddle)

### 4.1 Discovery in Chat
- Discovery row is embedded at the top of **Chats**, no standalone Discover tab
- Horizontal cards show Name, Age, Status, Pet Species
- Overlay icons: Wave (match), Star (direct chat + quota), X (skip)
- Expand Search: shows button when stack ends → adds +15km, clears local `hiddenDiscoveryIds`

**Discovery State Machine (Invisible Logic):**
- `hiddenDiscoveryIds` is a Set in `Chats.tsx` storing skipped IDs
- Wave/Star/X updates this set on interaction
- When stack is empty, **Expand Search** increases radius +15km and clears the set to re-surface profiles

### 4.2 Weighted Threads
- Score = Time + Relationship + Badge + Engagement − Decay
- Stored in `threads.score`, updated hourly by `update_threads_scores()`
- Sorting: `ORDER BY score DESC`

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

**Algorithm Math Summary:** Engagement (replies * 5, likes * 3, clicks * 1) + Relationship (+20 if in care_circle) + Badge (+50 verified, +30 gold) − Decay (log(age_days+1)*5) with time boost (age in days * 10)

### 4.3 Rich Social
- Thread replies support Markdown (bold, italic, lists)
- Inline quote format: `> @user: "First 20 chars..."` (pre-populated on Reply)
- 1000‑character limit for threads and replies

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
- **KYC Safe Harbor Checkbox:** required in `/verify-identity` step 2, includes: “I am 18+ and agree to the Terms of Service and Privacy Policy.”
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

# FULL FEATURE INVENTORY — EVERY PAGE IN /src/pages

> This section lists **every page** and documents UI elements (buttons/inputs/labels), local state, global context usage, and user flows. Use this as a rebuild blueprint.

## 1) `Auth.tsx`
**UI Elements:**
- Inputs: Email, Phone, Password, Confirm Password (signup)
- Buttons: Login, Sign Up, Remember Me, Forgot Password, Use Email / Use Phone toggle, Reset Password, Google login (if present)
- Links: Terms (`/terms`), Privacy (`/privacy`)
- Errors: Inline red errors for invalid login, missing fields

**State:**
- Local state for email/phone/password/confirm, login mode
- Uses `AuthContext` for signIn/signUp

**Flow:**
- Sign up requires email+phone+password
- Login defaults to email, can switch to phone
- Forgot password sends reset email

## 2) `Onboarding.tsx`
**UI Elements:**
- Steps: Profile → Pet → Verification
- Inputs: Legal name, display name, phone, DOB, location
- Buttons: Next, Back, Submit
- Errors: Red error text on missing required fields

**State:**
- Step index, form state
- Uses `AuthContext` for profile save

**Flow:**
- Block Next until required fields complete
- Saves to profiles and pets

## 3) `Index.tsx` (Home)
**UI Elements:**
- Header, pet cards
- Buttons: Add Pet, Edit Pet (gear)

**State:**
- Pets fetched, real‑time subscription

**Flow:**
- Add Pet navigates to `/edit-pet-profile`
- Pet card opens details

## 4) `Chats.tsx`
**UI Elements:**
- Discovery row (cards, Wave/Star/X)
- Search, filters, Create Group (premium+verified)
- Chat list tabs
- Booking modal with Safe Harbor modal

**State:**
- `hiddenDiscoveryIds`, `discoveryDistance`, `booking*` states
- Uses `AuthContext`, `useUpsell`

**Flow:**
- Wave → match
- Star → direct chat + quota
- X → skip + add to hiddenDiscoveryIds
- Expand Search → +15km, clears hiddenDiscoveryIds
- Booking → Safe Harbor modal → booking modal → Stripe checkout

## 5) `ChatDialogue.tsx`
**UI Elements:**
- Messages list
- Input text, send button
- Media upload button

**State:**
- Messages array

**Flow:**
- Send message → insert into chat_messages
- Media upload → QMS check `chat_image` → upload → insert message

## 6) `Social.tsx` (Threads)
**UI Elements:**
- Thread list, Post button
- Search input, topic dropdown

**Flow:**
- Sorted by score
- Post opens editor

## 7) `NoticeBoard.tsx` (Threads component)
**UI Elements:**
- Post modal with title, tags, content, hashtags, image
- Reply button, reply textarea with quote prefill
- Character counters (1000)

**State:**
- `threadsRemaining`, `replyFor`, `replyContent`

**Flow:**
- Post → QMS check `thread_post` → insert
- Reply → insert comment

## 8) `EditPetProfile.tsx`
**UI Elements:**
- Inputs: name, species, breed, dob, weight, microchip, vaccinations, reminders
- Buttons: Save, Back
- Errors: Red ErrorLabel for pet DOB/weight/vaccinations/microchip

**Flow:**
- Validate inputs → save to pets
- Invalidate pets query on success

## 9) `EditProfile.tsx`
**UI Elements:**
- Inputs: legal name, display name, phone, DOB, etc
- Errors: Red ErrorLabel for human DOB

## 10) `VerifyIdentity.tsx`
**UI Elements:**
- Step 1: doc type
- Step 2: Safe Harbor modal + checkbox
- Step 3: selfie capture
- Step 4: ID capture
- Step 5: success

**Flow:**
- Upload to identity_verification bucket
- Update profile verification_status

## 11) `AIVet.tsx`
**UI Elements:**
- Chat input, send button
- Footer disclaimer (pt10 grey)

**Flow:**
- Text → Gemini Flash
- Image → QMS check `ai_vision` → Gemini Pro

## 12) `Map.tsx`
**UI Elements:**
- Map with pins

## 13) `Settings.tsx`
**UI Elements:**
- Account settings, toggles
- Version text (long‑press admin hatch)

## 14) `Admin.tsx`
**UI Elements:**
- Admin verification queue

## 15) `AdminDisputes.tsx`
**UI Elements:**
- Dispute list
- Release Funds / Refund buttons

## 16) `Privacy.tsx`, `Terms.tsx`
- Static legal content

## 17) `NotFound.tsx`
- 404 screen

## 18) `Premium.tsx`
- Subscription UI, add‑ons

## 19) `Subscription.tsx`
- Redirects to Premium

## 20) `PetDetails.tsx`
- Pet detail view

## 21) `HazardScanner.tsx`
- Hazard scan UI

---

## 10. Edge Functions (API Map)
- `create-marketplace-booking`: Stripe Checkout + escrow insert
- `stripe-webhook`: idempotent fulfillment
- `process-dispute-resolution`: admin-only release/refund
- `ai-vet`: Gemini Flash/Pro routing + QMS
- `mesh-alert`: disabled (returns 410)
- `health-check`: Stripe + Supabase ping

---

---

## 11. Contract Requirements (Verbatim, UAT One-Shot Upgrade)

This section is incorporated word-for-word from the final one-shot upgrade prompt. It is a legal-style contract between spec and implementation. If any item below is present in code, it must be documented here. If it is documented here, it must exist in code. Expand only for technical clarity and never shorten or delete the original content.

Before you touch any code:
1. Review the full SPEC five separate times and confirm in your reply that nothing is missing (especially social_album bucket, family quota sharing/inheritance, KYC close button, dynamic Stripe pricing, weighted Threads scoring, Gemini rate limiting, idempotency/webhooks, GIST index on location, red error remarks for validations, subtext for vaccinations, pet add dashboard refresh, upsell banner positioning, Home icons removal, Discovery UIUX details, User Profile mandatory fields and toggles, Threads UI/algorithm/filtering/sorting, Identity Verification flow details, Discover filters and profile view, Nanny Marketplace escrow and Stripe reliability, Revenue table/algo, Invite Family, AI Vet details, Map updates, Always go to top on new page, align colour/border/text, disable notification, Add Pet exactly match Edit Pet Profile). If anything is missing from the SPEC, add it explicitly before proceeding.
2. Plan ahead on how to do this by phase and one-shot with the least chance to forget or miss any point.
3. Self-audit checklist before push: "social_album bucket & compression", "family quota sharing/inheritance", "KYC close button", "dynamic Stripe pricing", "weighted Threads scoring", "Gemini rate limiting", "idempotency/webhooks", "GIST index on location", "mandatory fields enforcement", "red error remarks for validations", "subtext for vaccinations", "pet add dashboard refresh", "upsell banner positioning", "Home icons removal", "Discovery UIUX details", "User Profile mandatory fields and toggles", "Threads UI/algorithm/filtering/sorting", "Identity Verification flow details", "Discover filters and profile view", "Nanny Marketplace escrow and Stripe reliability", "Revenue table/algo", "Invite Family", "AI Vet details", "Map updates", "Always go to top on new page", "align colour/border/text", "disable notification", "Add Pet exactly match Edit Pet Profile" — confirm all are in SPEC.

Now implement every single item below

I. Global UX/UI & Validation Infrastructure
[ ] 1. UX: Always go to top when entering new page;

Enhancement: Use window.scrollTo(0, 0) or useNavigate with { replace: true, state: { scrollToTop: true } } in React Router hooks on every page componentDidMount/lifecycle. Enforce in global layout component.

[ ] 2. All validation failures must immediately show red error text below the field as well as change the border colour of that info in RED and block submit.

Enhancement: Use React Hook Form with resolver (e.g., Zod schema), on error set border-color: red; position absolute red text pt12 below field, disable submit button until isValid = true.

[ ] 3. UI: Align use of colour, border and text style as much as possible. Disable notification function.

Enhancement: Use Tailwind classes consistently (e.g., border-gray-300 rounded-md text-gray-700 pt14), disable all notification functions by commenting out FCM/Push code, remove from SPEC routes.

II. Pet Profile & Dashboard Management
[ ] 4. - Add a Pet page should exactly match Edit Pet Profile

Enhancement: Use same JSX component for both (AddPet/EditPet), pass mode prop ('add'/'edit'), reuse form fields/validation schema.

[ ] 5. - Vaccination inputs must show: "Input last vaccination dates for better tracking" in pt12 grey right below 'Vaccination'

Enhancement: Add "Input last vaccination dates for better tracking" directly under vaccination input JSX.

[ ] 6. - Unable to add pet profile under home dashboard

Enhancement: Fix insert mutation in Edge Function (INSERT INTO pets (...) VALUES (...) RETURNING *), refresh dashboard with useQuery invalidate on success, check RLS allows auth.uid() = owner_id.

[ ] 7. - Many fake pet profile existed in my account (which should be error, no pre-load pet profiles)

Enhancement: On onboarding/profile load, SELECT FROM pets WHERE owner_id = auth.uid() LIMIT 0 (no pre-load), delete any fake rows via migration TRUNCATE pets, enforce no default/fake inserts.

III. Onboarding & Identity Verification (KYC)
[ ] 8. On-Boarding: Missing whole KYC slows under the Identity Verification under /onboarding

Enhancement: Add /onboarding route with KYC flow trigger on image submit, use React Router Maps to /verify-identity.

[ ] 9. Identity Verification + Admin Review (Update Full Flow): New /verify-identity route. Header "Identity Verification", with close button at top right corner to allow exit anytime. Screen 1: Country is pre-selected with the user's location selected during registration & blocked for adjustment, only upload Doc Type (ID, Passport, Driver's License) with subtext “We collect your selfie and ID document image to verify your age and identity and to protect our users from fraud and underage access. We generate biometric templates or age estimates from these images solely for this verification. We do not use your biometric data for general facial recognition or any purpose other than verification. Images are deleted after the check; we keep only the outcome (e.g. ‘age verified 18+’) and minimal metadata.” Screen 2: Legal Disclaimer (Biometric data usage/deletion policy). "Agree & Continue" button. Screen 3 (Selfie): Trigger rear camera. Capture image on "I am ready." Screen 4 (ID Doc): Trigger main camera. Capture image on "I am ready." Screen 5: Success page with "Social access granted pending review" notice: "Thanks for completing verification. You can use the Social features for now while we finish our checks. If we later find that you are below the minimum age required for our Social or Chat features, your account may be blocked from these features or from the app entirely, in line with our Terms and Safety Policy." Storage: Save images to new Supabase bucket identity_verification. Fix "bucket not found" error. Admin: Create an admin flag in Supabase to toggle verification_status (Approved/Rejected) (expand: route with 5 screens, close button z-index 9999, pre-selected country from profiles.location_country blocked, rear camera for selfie, main for ID, delete images post-check, bucket create with private RLS, admin UI with toggle button + comment field, RLS admin only).

Enhancement: Use react-webcam for camera, Supabase storage.upload for bucket, admin route /admin/verifications with toggle onClick update verification_status trigger email notification.

IV. User Profile & Social Settings
[ ] 10. - User Profile: Relationship Status: Missing visible toggle

Enhancement: Add <Toggle name="show_relationship_status" label="Visible to others" /> in profile JSX, update profiles table with show_relationship_status BOOLEAN DEFAULT true.

[ ] 11. Edit Profile: Location format align with onboarding page, which is auto-filled by loading on-boarding data

Enhancement: Fetch location_country/district from profiles on load, use same dropdown component as onboarding.

[ ] 12. - All previously filled data should be auto filled under edit profile

Enhancement: useEffect fetch profiles data by auth.uid(), setValue in React Hook Form for all fields.

[ ] 13. - User ID not generated and shown on profile

Enhancement: Trigger CREATE TRIGGER gen_user_id BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION generate_uid(10), show User ID: {user_id} below BASIC INFO.

[ ] 14. - → Add social_album ARRAY[TEXT] column + bucket + upload UI (max 5, <500KB compression) (expand: migration ADD COLUMN social_album TEXT[] DEFAULT '{}', bucket 'social_album' with RLS, browser-image-compression lib client-side)

Enhancement: Upload handler with compression.reduceSize({ maxSizeMB: 0.5 }), Supabase storage.upload to 'social_album', limit array length <=5.

[ ] 15. - → Location: dropdown country + district only (pre-fill from onboarding), no geolocation tag (expand: no navigator.geolocation calls)

Enhancement: Remove any geolocation code, use dropdown from onboarding data fetch.

V. Threads & Community Social
[ ] 16. Threads: Reply: no need to quote > @XX: "Just adopted this ad..."\n\n, but tag (autocomplete) the user name "@XXX" is enough. Reply allows max 200 chars, and insert image.

Enhancement: Reply form with @ autocomplete from user names, maxLength=200, image upload deduct quota.

[ ] 17. - cannot post reply "could not find the content column of thread comment in the schema cache"

Enhancement: Migration ADD COLUMN content TEXT NOT NULL to thread_comments, fix schema cache refresh.

[ ] 18. - "Post Reply" change to "Send"

Enhancement: Find/replace button text in JSX.

[ ] 19. - If reply is clicked open, click again to close/ collapse

Enhancement: Use state toggle for reply form visibility on click.

[ ] 20. - Create Threads > Topic should be "Dog" "Cat" "News" "Social" "Others" with relevant icons

Enhancement: Dropdown with values + icons (SVG or emoji).

[ ] 21. - (Thread title) change to (Title) with Max. characters within the width of the box, no hard number limits.

Enhancement: Input maxLength auto based on width calc, no hard limit.

[ ] 22. - (Hastags (comma seperated, max 3)) change (Up to 3 #Hashtags), change to auto generate create #Hashtag after user "input word and press space", max. allow 3 hashtags

Enhancement: Input onKeyDown detect space → prepend #, limit array length <=3.

[ ] 23. - The "Create Thread" bottom part is blocked by navigation bar, It is never duplicated or overlapped with the expanded box. It should be expanded from navigation bar

Enhancement: Position fixed bottom above nav bar, z-index 9999, no duplicate (single instance).

[ ] 24. - Filtering (Keyword search by text input and topic models are used to match text to a query or user interest) & Sorting (Allow "Trending" "Latest") not available and not found in MASTER SPEC

Enhancement: Add search input + topic models (simple ILIKE for now), sorting dropdown "Trending" score DESC, "Latest" created_at DESC.

VI. Algorithms & Logic (Backend Engine)
[ ] 25. - → Algorithm: COUNT(*) FROM threads WHERE user_id = auth.uid() AND created_at > NOW() - '30 days'::interval < tier_limit, link quota from profiles (expand: frontend fetch quota from profiles, show "Quota: X remaining")

Enhancement: Edge Function query COUNT, frontend Quota: {quota_remaining} remaining.

[ ] 26. - → Weighted Scoring: score = time (NOW() - created_at) / '1 day'::interval * 10 + relationship (if in family/care_circle +20) + badge (verified +50, gold +30) + engagement (replies * 5 + likes * 3 + clicks * 1) - decay (log(age_days + 1) * 5) (expand: threads column score FLOAT, pg_cron hourly update)

Enhancement: Migration ADD COLUMN score FLOAT DEFAULT 0, cron job UPDATE threads SET score = ....

[ ] 27. - → Update frequency: cache score, recompute cron (expand: pg_cron job CALL update_threads_scores())

Enhancement: Install pg_cron extension, CREATE FUNCTION update_threads_scores().

[ ] 28. - → Filtering: keyword ILIKE title/content, topic IN selected (expand: WHERE clause in Edge)

Enhancement: Edge WHERE title ILIKE '%' || keyword || '%'.

[ ] 29. - → Sorting: Trending = score DESC, Latest = created_at DESC (expand: ORDER BY in Edge)

Enhancement: Edge ORDER BY CASE WHEN sort = 'Trending' THEN score DESC ELSE created_at DESC END.

[ ] 30. - → 1. Search input + topic dropdown + sorting select at top (expand: flex row JSX)

Enhancement: <select /> <select /> <select />.

VII. Under Chats & Discovery
[ ] Warning: Button is not defined

Enhancement: Fix undefined button reference in JSX, add if (!button) return null.

[ ] Bug footer: If this issue persists, please contact help & support through the Settings page.

Enhancement: Remove bug footer, replace with standard error handler.

[ ] Stationed within Chat session without having to click further to Discovery page. Filtering choice condensed in one row. Profile preview: Profiles show Name, age, social status and owned pet species; with action icons: Wave , Star (Direct Conversation), X (Not Interested) appear overlay profile preview. Tapping lets you scroll through details without leaving the swipe flow. Tapping the profile on the swipe stack expands it into a full‑screen view with multiple photos (swipeable carousel) the users uploaded on the album, name, age, location, bio, pet info and job/school info (which users have chose to display). Discover: Filters apply real-time (fix non-application). Pet Height → Pet Size. Distance: ranging from 0-150km (max). Lazy Loading required for all album images, 2-hour pinned location map. Simulate fake users for real-life. Remove Huddle Nearby. Chats: Fail-safe messaging.

Enhancement: Chats tab embed Discovery top, filters row, profile card with overlay icons, tap modal scroll, full-screen carousel with lazy [image], filters mutate query, Pet Size dropdown, distance slider, album lazy, 2h pin map, 20 fake users insert, remove Huddle Nearby JSX, chats try/catch messaging.

VIII. Nanny Marketplace & Escrow
[ ] Nanny remarks always top: "Book verified Pet Nannies for safety. We offer secure payments but are not liable for service disputes or losses." Nanny view pin: "A verified badge increases trust and helps secure more bookings.” Media send deducts quota (Mandatory Compression <500KB). Swipe left delete: Unmatch, remove convo (except transactions). Verified badge only on head icon. Groups: Verified premium only create, all join. Book Nanny: Multi-day dates (start/end), pet dropdown, district input, currency select next to amount, button "Proceed Booking Payment". Escrow: Hold full amount, release post-48h confirmation/no dispute ($90 to provider, $10 platform via separate charges/transfers). Dispute: Admin review, hold/release/refund.

Enhancement: Remarks pinned div top, media compression, swipe delete trigger unmatch delete, badge overlay, groups gate tier verified, book form date-range, dropdown, input, select, button, escrow Stripe hold webhook release, admin UI toggle hold/refund.

[ ] Nanny Marketplace + Escrow (Update): As above escrow logic. STRIPE RELIABILITY: All Stripe API calls (PaymentIntent, Transfer) must include an Idempotency-Key (e.g., UUID v4) in the header to prevent duplicate charges on network retries. Implement Stripe Webhooks (listening for payment_intent.succeeded) to update the database state reliably, rather than relying solely on client-side success callbacks.

Enhancement: Stripe calls with idempotency-key UUID, webhooks endpoint update status.

[ ] 3.1. "Booking.end_date" change to "Service End Date"

[ ] 3.2. Service location allows user input, remove the minimun $10 in subtext, while input 0 dollar is not allowed.

[ ] 3.3. Cannot proceed payment - unable to verify Stripe

Enhancement: Fix end_date to service_end_date, location input, remove $10 subtext, validate amount >0, fix Stripe verification test keys.

IX. AI Vet Assistant
[ ] Under AI Vet: It's now sending default reply - whatever i type it answered the same shit, please make sure it connected to real AI. No default answer. Replace dummy with real Gemini API integration. IMPLEMENTATION DETAIL: Use Gemini 1.5 Flash for text queries. Use Gemini 1.5 Pro only if an image is attached. Rate Limiting: Implement a Token Bucket algorithm in Supabase Edge Functions to cap requests based on their quota and return HTTP 429 "Quota Exceeded" if breached. Contextual: Read pet data (breed/age/weight/history). Multi-modal: Text/symptoms + photo/video analysis. Empathetic/calm/jargon-free/pet-centric/actionable. Emergency triage: Keywords trigger map.

Enhancement: Remove default reply, connect Gemini API keys, Flash for text, Pro for image, token bucket rate_limits table refill cron, context from pets, multi-modal prompt, empathetic template, keywords 'emergency' trigger map link.

X. Sidebar, Settings & Maps
[ ] Setting side bar: Logout always pinned above navigation bar; Add "Help & Support" which links to a form to submit enquiries to admin (= send email to kuriocollectives)

Enhancement: Logout fixed above nav, "Help & Support" link to form submit Edge email to kuriocollectives.

[ ] Map Set up. Simply not updated and completely missing from MASTER SPEC. Remove search/visible toggle → "Pin my Location" subtext "Available on map for 2 hours and stay in system for 24 hours to receive broadcast alert. If you want to mute alerts, please go to Account Settings." Auto-load real HK vets: Address, hours, mobile; white icon with green/red dot (open/closed); subtext "Timely reflection of any changes of operations of the Vet Clinic is not guaranteed". 5-star rating (base from Google Maps, verified users only; non-verified popup "Available to verified users only"). Stray blue, lost red. Friends pin: Open profile (cross close top-right). Tap map/manual input for location (fix localhost). PERFORMANCE UPDATE: Migrate all radius queries to PostGIS. Use ST_DWithin(geography, geography, meters) for lightning-fast queries. Create a GIST index on the location column.

Enhancement: Remove search/toggle, "Pin my Location" button with subtext, Google Places API for HK vets, icon with dot, subtext, rating gate popup, pin colors, friend pin modal cross, tap/manual fix, PostGIS ST_DWithin, GIST index migration.

XI. Premium Tier & Family Logic
[ ] "/Premium" is not reflected/ updated and missing from master spec: VERY IMPORTANT Strictly follow this as it always go back to the entitled functionality/features of the users, and split bewteen Family account; the exact no. of quota refreshed on the 1st day of the subscription cycle) Revenue & Upsells (Update Table/Algo): Sequence: Family Slot (Free/Prem "-", Gold "1 Extra Member"), Thread (Free 1, Prem 5, Gold 30; algo: Count starts per 30-day cycle). Discovery Filters (Free Basic, Prem/Gold Advanced). Visibility (Free "-", Prem/Gold Priority; algo: Prioritize in social queue). Star (Free/Prem "-", Gold 3; algo: Trigger chat without mutual wave). Media (Free "-", Prem 10, Gold 50). Alert (Free 5, Prem 20, Gold Unlimited). Broadcast Range (Free 1km, Prem 5km, Gold 20km; algo: Geofence queries expand by membership). Ad-free (Free/Prem "-", Gold tick). Add-ons: 3 Star Pack "Superpower to trigger chats immediately", Broadcast Alert "Additional broadcast alert", Additional 10 media "Additional 10 media usage across Social, Chats and AI Vet." Remove verified badge purchase. Dynamic pricing from Stripe (US$X.XX default). Add-on cart below buttons, Payment to Stripe, past transactions demo.

Enhancement: /premium page table sequence, family split quota for extra member, pg_cron refresh quotas on 1st day, priority ORDER BY tier DESC, star chat insert, media/alert decrement, broadcast ST_DWithin by tier, ad-free hide, add-ons cart Stripe, remove verified, dynamic Stripe prices fetch, past transactions view.

[ ] FAMILY IS not updated and missing from MASTER SPEC: Invite Family in Setting Side Bar, under User Profile: Grey/blocked for non-Gold. Gold: Green Invite, popup for 10-digit user_id input + Invite. Error if invalid. Receiver: Notification popup "(Display/User Name fetched from user_id) has invited you to join their family!" with accept/decline. Accept: Add to sender's collapsible/expandable Family session.

Enhancement: Settings sidebar under Profile, gate tier, popup input validation, error popup, receiver notification with fetch display, accept insert family_members, sender accordion with names.

XII. Discovery & Membership Algorithms
[ ] Algorithms & Logics - not implemented and not found in MASTER SPEC. Discovery Filter/Prioritization: Basic (Free): Age/Gender/Height/Distance/Species/Role (critical/high weights: +100 for species). Advanced (Prem/Gold): +Verification (+50), Compatibility (+30), Logistics/Skills (+30), Activity (+20), Connection (+20). Algo: Score = sum(weights), sort descending. Prioritize Prem/Gold in queue (top 20% slots). Code: In Edge Function social_discovery: Query profiles with geofence (PostGIS ST_DWithin), apply filters as WHERE clauses, ORDER BY score DESC + membership_priority (1 for Free, 2 for Prem/Gold).

[ ] Membership Perks: Quota checks in triggers/Edge: e.g., threads: SELECT COUNT(*) FROM threads WHERE user_id = $1 AND created_at > NOW() - '30 days'::interval < limit (1 Free,5 Prem,30 Gold). Media/Alert: Similar counter decrement on use, upsell if 0. Star: Deduct on use, trigger chat without mutual.

[ ] Broadcast Range/Filtering by Membership: Range: Geofence query radius = 1km Free,5km Prem,20km Gold (Use ST_DWithin(location, user_location, radius_in_meters)). Filtering: Basic/Advanced as above, strict gate: If !premium, exclude advanced clauses. Code: In mesh_alert: Filter recipients by membership_radius.

[ ] Under profile set up, if user toggled owned pets, "Animal Friend (No Pet)" will be blocked; If user did not toggle / not having pets, "Pet Parent" is blocked; If Pet Parent is choen, Animal Friend (No Pet) is blocked, vice versa.

Enhancement: social_discovery logic, quota check logic, mesh_alert radius logic, owned_pets onChange mutual exclusive checkboxes.

Safeguards & Enforcement

- Review the updated SPEC five separate times for completeness before coding anything.
- Self-audit checklist before push: "social_album bucket & compression", "family quota sharing/inheritance", "KYC close button", "dynamic Stripe pricing", "weighted Threads scoring", "Gemini rate limiting", "idempotency/webhooks", "GIST index on location", "mandatory fields enforcement", "red error remarks for validations", "subtext for vaccinations", "pet add dashboard refresh", "upsell banner positioning", "Home icons removal", "Discovery UIUX details", "User Profile mandatory fields and toggles", "Threads UI/algorithm/filtering/sorting", "Identity Verification flow details", "Discover filters and profile view", "Nanny Marketplace escrow and Stripe reliability", "Revenue table/algo", "Invite Family", "AI Vet details", "Map updates", "Always go to top on new page", "align colour/border/text", "disable notification", "Add Pet exactly match Edit Pet Profile" — confirm all are in SPEC.
- Five self-check per phase: backend wiring test (e.g., curl Edge Functions, unit tests for quotas/escrow), UI verification (screenshots, manual clicks, console logs, Postman API calls).
- Do not push to GitHub / live host / Supabase until all items pass 100% on the fifth check.
- Before final push, run:
  - Full backend wiring test (curl / unit tests for quotas, escrow, scoring, filters)
  - UI smoke test (manual clicks on localhost:8080)
  - Verify live UI (screenshots of every flow, console no errors)
- Confirm in reply: "All items implemented. Five-checked. No missing pieces. Ready for your final UAT round."

---

**End of MASTER_SPEC v1.7**
