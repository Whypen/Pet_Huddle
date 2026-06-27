# Engagement / Trust Score System — Design Spec

Date: 2026-06-27

## Purpose

Identify and visually celebrate positive, engaged Huddle users (posting, caring for pets, helping the community) to build trust signals across the app. The system is purely positive/celebratory — there is no punitive visual state. Banned or restricted users simply look the same as a brand-new user, never singled out negatively.

This is distinct from the existing admin-only `trust_score` / `moderation_state` / `penalty_count` fields used in `view_admin_safety_users`, which remain a separate, admin-facing safety system. The new engagement score only *reads* `moderation_state` as a negative input — it does not replace, merge with, or get stored inside the safety system. (Confirmed: `trust_score`/`penalty_count`/`moderation_state` are not physical writable columns in `schema_public.sql` — they're admin-view-only fields. We can't repurpose them to store engagement-tier state; see "Minimal new state" below.)

**No tier names are ever shown to users.** "New / Active / Trusted / Pillar" are internal/code-only identifiers for engineering convenience. All user-facing copy and UI describes the sparkle visually or by percentage — never by a label that could be (mis)interpreted as a status judgment.

## Industry benchmark check

| Pattern borrowed from | What we took |
|---|---|
| Stack Overflow reputation | Transparent, fixed point values per action — no black-box scoring |
| eBay feedback stars | Coarse visual tiers (sparkle styles) over a precise number — status symbol, not a leaderboard |
| Duolingo / Headspace "we noticed..." nudges | Warm, lowercase, casual tone for the notification copy below |
| Airbnb Superhost | Status can fade with inactivity — keeps behavior sustained, not banked once |

This keeps the system "simple as possible": one computed view, one nightly job, no new tables except the one minimal field noted below, and copy that never requires the user to understand a scoring scheme.

## Scoring model

Computed via a Postgres view aggregating existing tables — **no new tables** for the score itself.

| Action | Points | Source table |
|---|---|---|
| Like/react, comment, reply | +2 | `social_interactions`, `thread_comments` |
| Wave sent/match accepted | +2 | `waves`, `matches` |
| Map pin view/click | +1 (capped ~5/day) | `alert_interactions` |
| Create a post | +5 | `threads` |
| Create a map alert pin | +5 | `broadcast_alerts` |
| Stray/caution pin resolved | +10 bonus | `broadcast_alerts` |
| Care booking completed (carer AND owner, both get points) | +10 each | `marketplace_bookings` (status = completed) |
| Confirmed moderation action (warning/restriction — admin-actioned, not a raw report) | −10 | `penalty_count` / `moderation_state` (existing admin fields) |
| Banned | frozen at 0 | `moderation_state` |

**Raw reports received do NOT affect the public engagement tier.** A report is just an allegation; only a confirmed admin moderation action moves the score. This prevents bad-faith mass-reporting from being used to grief another user's public standing.

### Scoring window: rolling 90 days

Score is **not lifetime-cumulative** — each source table is filtered to `created_at > now() - interval '90 days'` in the view. This is one extra WHERE clause per source, not meaningfully more complex than lifetime, and it's what makes "stay active or your sparkle fades" true rather than an empty threat (a lifetime score could never decrease from inactivity alone).

### Anti-gaming guardrails — an action only counts if ALL of:
- **Actor is not the target** (no self-likes, self-comments, self-reactions on your own content).
- **Content is not deleted/hidden** at time of scoring (deleted posts/comments don't retroactively earn points).
- **Actor and target are not blocked** from each other.
- **Diminishing returns per actor/target pair**: same-pair interactions stop earning points after the 3rd time per day (e.g. liking the same person's posts repeatedly).
- **Low-effort action daily caps**: pin views capped at ~5/day; total positive accrual capped at roughly +50/day overall, so the score reflects sustained behavior, not single-session farming.

## Tiers (fixed point thresholds — primary driver of visuals, internal names only)

| Internal name | Score (90-day rolling) | Avatar corner sparkle | Username | Avatar |
|---|---|---|---|---|
| New | 0 | none | normal | default (today's look, incl. existing verification ring) |
| Active | 1–49 | outline-only sparkle | normal | default |
| Trusted | 50–149 | gradient-gold sparkle (filled) | normal | default |
| Pillar | 150+ | full solid-gold sparkle | Huddle Gold colored + shimmer text effect | shimmer overlay animation (verification ring stays untouched underneath — shimmer is additive, never replaces it) |

Sparkle SVG: source a free/CC-licensed sparkle-star asset matching a 4-point gradient sparkle look (e.g. via Iconify/Flaticon) at implementation time — do not embed the specific paid Magnific stock asset directly.

### Percentile gate (secondary, nightly-computed)
- A nightly job computes each scoring user's percentile rank among all users with 90-day score > 0.
- **Reaching a tier requires BOTH**: (a) crossing the point threshold, AND (b) being within the percentile band for that tier at the last nightly computation. Bands: Active = bottom 40%, Trusted = middle 40%, Pillar = top 20%, computed only over users with score > 0 (zero-score/new users excluded from the ranking pool).
- Users never see exact percentile math live — the displayed tier only updates once nightly.
- A user can drop out of a tier on a nightly run if they fall below score or percentile — this happens silently in the UI (see notifications below: no demotion notification is sent).

### Role-based floors — built but disabled by default
- Code path exists for `effective_tier = MAX(computed_tier, role_floor)` (e.g. admin → Pillar floor, volunteer carer → Trusted floor), but **the floor is not applied for v1**. No account gets a tier it didn't earn through real activity — we don't want to fake engagement/trust signals before the system has real data behind it. The override is feature-flagged off; can be turned on later without code changes if desired.

## Notifications — promotion only, no demotion notification

Demotions are silent — no notification, no popup. Only crossing *up* into a new tier fires anything. This avoids ever sending a "you lost something" message, consistent with the celebration-only design.

**Mechanism:** the nightly job needs to know "what tier was this user at yesterday" to detect a promotion. This is the one piece of state that can't be reused from anything existing (`trust_score` etc. are admin-only view fields, not writable, and intentionally kept separate from this system). **Minimal new state required:** one small new column (e.g. `last_known_engagement_tier` on `profiles`, or an equally small dedicated lookup) updated by the nightly job after each run. This is the smallest possible footprint — a single column, not a new table or history log.

When the nightly job detects `today's tier > yesterday's tier`:
- Insert a row into the existing `notifications` table.
- Trigger push notification + in-app popup.

### Notification copy (lowercase "huddle", warm/casual tone, no tier names)

- **First sparkle (internal: Active):**
  > "we noticed you've been showing up for the huddle community 🐾 you just earned a little sparkle on your profile — keep going to watch it grow."

- **Brighter sparkle (internal: Trusted):**
  > "we noticed how active and helpful you've been in huddle lately ✨ your sparkle just got brighter."

- **Full gold sparkle (internal: Pillar):**
  > "we noticed you're one of the most active, caring members in huddle right now ✨ your profile just went full sparkle — thank you for showing up for the community."

- **Explainer popup (info tap, auto-dismiss after 3s):**
  > "this sparkle reflects how active and helpful you've been in huddle ✨"

No "you might lose this" language anywhere — loss-aversion stays implicit (a sparkle that can fade), never stated, so it reads as encouragement, not a threat.

## UI surfaces

1. **Avatar corner sparkle** — top-right of the avatar, slightly overlapping the avatar ring. Renders wherever a tiered user's avatar appears with tier styling: `ProfileModal` and Discover Card. Style (outline/gradient/filled/shimmer) per tier table above.
2. **Info/explainer affordance** — a single tappable icon in the Profile modal (near the name/badge cluster). Tapping shows the 3-second auto-dismissing explainer popup above. This is the only explainer entry point — no duplicate indicator elsewhere.
3. **Percentile line** — cosmetic-only text in the membership-status area at the bottom of the Profile modal, with **no tier name attached**, e.g. "top 18% of active members this month." Sourced from the nightly job's output. Purely descriptive flavor text; the tier itself already incorporates the percentile gate above — this line never independently drives color/star.

## Implementation approach (v1)

1. A Postgres `VIEW` (`view_user_engagement_score`) computing 90-day rolling point totals from existing tables, applying the anti-gaming filters above.
2. A nightly scheduled job (Supabase `pg_cron` or equivalent) that:
   - Reads `view_user_engagement_score`.
   - Computes percentile rank among score > 0 users.
   - Determines computed tier (threshold AND percentile gate). Role-floor override exists in code but is disabled (see above).
   - Compares to `last_known_engagement_tier` (the one new column) to detect promotions only.
   - Inserts a `notifications` row + triggers push/popup for any user who was promoted.
   - Updates `last_known_engagement_tier` to the new computed tier for every user (used for next night's comparison; also what the client reads to render the sparkle).
3. Client: profile/discover-card components read `last_known_engagement_tier` (+ percentile text) and render sparkle/username/avatar styling accordingly.

## Explicitly out of scope for v1
- Groups (no `groups` table exists yet — excluded entirely until that feature ships).
- Any punitive/restricted visual state — does not exist in this system by design.
- Real-time/live percentile computation — nightly only.
- Role-based tier floors (admin/volunteer carer) — code path exists, disabled by default.
- Demotion notifications — demotions are always silent.
