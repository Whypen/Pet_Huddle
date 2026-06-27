# Engagement / Trust Score System — Design Spec

Date: 2026-06-27

## Purpose

Identify and visually celebrate positive, engaged Huddle users (posting, caring for pets, helping the community) to build trust signals across the app. The system is purely positive/celebratory — there is no punitive visual state. Banned or restricted users simply look the same as a brand-new user, never singled out negatively.

This is distinct from the existing admin-only `trust_score` / `moderation_state` / `penalty_count` fields used in `view_admin_safety_users`, which remain a separate, admin-facing safety system. The new engagement score only *reads* `moderation_state` as a negative input — it does not replace, merge with, or get stored inside the safety system. (Confirmed: `trust_score`/`penalty_count`/`moderation_state` are not physical writable columns in `schema_public.sql` — they're admin-view-only fields. We can't repurpose them to store engagement-tier state; see "Cache table" below.)

**No tier names are ever shown to users.** "New / Active / Trusted / Pillar" are internal/code-only identifiers for engineering convenience. All user-facing copy and UI describes the sparkle visually or by percentage — never by a label that could be (mis)interpreted as a status judgment.

## Industry benchmark check

| Pattern borrowed from | What we took |
|---|---|
| Stack Overflow reputation | Transparent, fixed point values per action — no black-box scoring |
| eBay feedback stars | Coarse visual tiers (sparkle styles) over a precise number — status symbol, not a leaderboard |
| Duolingo / Headspace "we noticed..." nudges | Warm, lowercase, casual tone for the notification copy below |
| Airbnb Superhost | Status can fade with inactivity — keeps behavior sustained, not banked once |

This keeps the system "simple as possible": one computed view, one nightly job, one small cache table (see below — the only new table), and copy that never requires the user to understand a scoring scheme.

## Scoring model

Computed via a Postgres view aggregating existing tables — **no new tables** for the raw score itself (see "Cache table" below for the one table the system does need, for UI/notification purposes).

| Event | Who gets points | Points | Daily cap | Source table |
|---|---|---:|---|---|
| Completed care booking | Carer | +10 | max +20/day | `marketplace_bookings` |
| Completed care booking | Requester/owner | +5 | max +10/day | `marketplace_bookings` |
| Create map alert pin | Creator | +5 | max +15/day | `broadcast_alerts` |
| Create post | Author | +3 | max +9/day | `threads` |
| Comment / reply / share | Actor | +2 | max +10/day | `thread_comments` |
| Like / react | Actor | +1 | max +3/day | `social_interactions` |
| Wave sent / match accepted | Actor | +1 | max +2/day | `waves`, `matches` |
| Map pin view/click | Nobody | 0 | analytics only | `alert_interactions` |
| Raw report received | Nobody | 0 | no effect | `social_interactions` |
| Confirmed moderation action (admin-actioned warning/restriction — not a raw report) | Target | −10 | — | `penalty_count`/`moderation_state` (existing admin fields) |
| Banned | — | frozen at 0 | — | `moderation_state` |

**Raw reports received never affect the public tier.** Only a confirmed admin moderation action moves the score — this prevents bad-faith mass-reporting from being used to grief someone's public standing. Map pin views are analytics-only, not scored at all (dropped from the score entirely rather than capped, since they're too low-effort to mean anything).

In addition to the per-action daily caps above, an **overall daily positive cap of +50/day** applies on top — whichever limit binds first.

### Rules summary

| Rule | Decision |
|---|---|
| Score window | Rolling 90 days |
| Tier method | Fixed point thresholds + percentile gate (MVP) |
| Self-actions | Never count |
| Deleted/hidden/spam content | Never count |
| Blocked users | Interactions between blocked users never count |
| Same actor/target farming | Max 3 score-earning interactions per actor/target pair per day |
| Daily positive cap | +50/day total (on top of per-action caps above) |
| Demotion notification | None |
| Promotion notification | Yes |
| Public tier names | None — internal/code-only |
| Paid membership (Free/Plus/Gold subscription) effect | None — entirely independent of this system |
| Admin/carer manual boost | None for v1 (code path exists, disabled) |

### Scoring window: rolling 90 days

Score is **not lifetime-cumulative** — each source table is filtered to `created_at > now() - interval '90 days'` in the view. This is one extra WHERE clause per source, not meaningfully more complex than lifetime, and it's what makes "stay active or your sparkle fades" true rather than an empty threat (a lifetime score could never decrease from inactivity alone).

### Anti-gaming guardrails — an action only counts if ALL of:
- **Actor is not the target** (no self-likes, self-comments, self-reactions on your own content).
- **Content is not deleted/hidden** at time of scoring. Self-healing by construction: since the score is a live view over current table state, deleting a post/comment automatically drops its points on the next computation — no separate "retroactive removal" logic needed.
- **Actor and target are not blocked** from each other.
- **Diminishing returns per actor/target pair**: max 3 score-earning interactions per actor/target pair per day — this applies to **care bookings too**, not just social actions, since bookings are now the single highest-value action and the most attractive target for two colluding accounts ping-ponging fake completions. (Assumes `marketplace_bookings.status = 'completed'` already implies the booking's escrow/payment was genuinely captured, not a client-settable flag — confirm this at implementation time.)
- **Per-action and overall daily caps**, per the table above.
- **Banned users are explicitly zeroed**: the view's final step applies `WHERE moderation_state != 'banned'` (or equivalent `CASE` to force score to 0) — without this explicit clause, a banned user's historical actions would still mathematically sum to a nonzero score, since "banned" doesn't delete their past rows.

## Tiers (fixed point thresholds — primary driver of visuals, internal names only)

| Internal name | Score (90-day rolling) | Avatar corner sparkle | Username | Avatar |
|---|---|---|---|---|
| New | 0 | none | normal | default (today's look, incl. existing verification ring) |
| Active | 1–49 | outline-only sparkle | normal | default |
| Trusted | 50–149 | gradient-gold sparkle (filled) | normal | default |
| Pillar | 150+ | full solid-gold sparkle + shimmer sweep | Huddle Gold colored + shimmer sweep | shimmer sweep animation plays across the ring (never recolors it — verification blue/etc. underneath is untouched) |

Thresholds carried over from earlier drafts; worth re-checking against real 90-day distributions once the view is live, since point values per action changed since these were set (e.g. a single completed carer booking is now +20, well over a third of the way to "Active"). Tuning the threshold numbers later is a config change, not a re-architecture.

**Sparkle SVG — approved design:** a single 4-point sparkle/diamond-star shape (path: `M0,-16 C1,-5 5,-1 16,0 C5,1 1,5 0,16 C-1,5 -5,1 -16,0 C-5,-1 -1,-5 0,-16 Z`), consistent across all three tiers, positioned top-right overlapping the avatar's edge:
- **Active**: outline only, no fill, gold stroke (`#C8861A`).
- **Trusted**: filled, **smooth white-to-gold gradient** (soft blend, no hard stop — `#FFFFFF → #F6DFA0 → #E8B23D`), thin gold stroke.
- **Pillar**: filled, full gold gradient (`#FFE9A8 → #F2C14E → #C8861A`), plus an **animated shimmer sweep** — a soft diagonal highlight that periodically passes across the sparkle, the username text, and the avatar ring.

**The avatar ring is never touched at any tier** — no recoloring, no added glow/halo sitting behind it, nothing. A verified user's ring stays pixel-for-pixel its current blue at Active, Trusted, and Pillar alike. At Pillar, the shimmer sweep is purely an animated highlight that plays *across* the ring's existing color (same trick as a CSS shine-on-hover effect) — the ring's underlying color value is never modified, only momentarily overlaid by a moving light highlight. Username gold-tint at Pillar gets the same shimmer sweep treatment, layered over its base color.

Approval mockup (corrected version) shared during design review; the reference sparkle path/gradients are saved at [`assets/engagement-sparkle.svg`](assets/engagement-sparkle.svg). Source a free/CC-licensed sparkle asset matching this shape at implementation time (e.g. via Iconify/Flaticon) — do not embed the specific paid Magnific stock asset directly; the shape is generic/common enough to recreate freely.

### Percentile gate (secondary, nightly-computed)
- A nightly job computes each scoring user's percentile rank among all users with 90-day score > 0.
- **Reaching a tier requires BOTH**: (a) crossing the point threshold, AND (b) being within the percentile band for that tier at the last nightly computation. Bands: Active = bottom 40%, Trusted = middle 40%, Pillar = top 20%, computed only over users with score > 0 (zero-score/new users excluded from the ranking pool).
- Users never see exact percentile math live — the displayed tier only updates once nightly.
- A user can drop out of a tier on a nightly run if they fall below score or percentile — this happens silently in the UI (see notifications below: no demotion notification is sent).

### Role-based floors — built but disabled by default
- Code path exists for `effective_tier = MAX(computed_tier, role_floor)` (e.g. admin → Pillar floor, volunteer carer → Trusted floor), but **the floor is not applied for v1**. No account gets a tier it didn't earn through real activity — we don't want to fake engagement/trust signals before the system has real data behind it. The override is feature-flagged off; can be turned on later without code changes if desired.

## Notifications — promotion only, no demotion notification

Demotions are silent — no notification, no popup. Only crossing *up* into a new tier fires anything. This avoids ever sending a "you lost something" message, consistent with the celebration-only design.

### Cache table (the one new table this system needs)

A single small new table, not a single column — a bare column on `profiles` isn't enough because the UI also needs percentile text, a computed timestamp, and the raw score for debugging, and the notification logic needs to diff against yesterday's tier:

```
user_engagement_tier_cache
- user_id            (PK / FK to profiles)
- score_90d           int
- effective_tier      text   (internal: New/Active/Trusted/Pillar)
- percentile_rank     numeric, nullable
- previous_tier       text
- computed_at         timestamptz
- promoted_at         timestamptz, nullable
```

This is the only new persistent state in the entire system — everything else (raw score, anti-gaming filters) is computed live from existing tables in the view; this table just stores the *result* of the nightly computation so the client and the notification job both have something stable to read.

**Sparsity:** only upsert a row for a user who currently has score > 0 or already has an existing row (so a drop back to "New" can still be reflected by updating `effective_tier`). Users who have never scored never get a row — absence of a row means "New" by default on the client. Keeps the table from growing with rows for inactive accounts.

When the nightly job detects `effective_tier > previous_tier`:
- Insert a row into the existing `notifications` table.
- Trigger push notification + in-app popup.
- Set `promoted_at` to the run timestamp.
- **Anti-flapping guard:** skip firing the notification if the user was already promoted into this same tier within the last 14 days (check `promoted_at`). Prevents repeat "you just earned a sparkle!" pings if a score oscillates right at a threshold boundary across several nightly runs.

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

1. **Avatar corner sparkle** — top-right of the avatar, slightly overlapping the avatar ring. Renders on:
   - Profile modal
   - Discover card
   - Care booking profile preview
   - Social (post author / commenter avatars)
   - **Not** on map pin avatar icons — too small at typical map zoom (~24–32px) to render legibly, and would compete visually with pin-status colors, which need to stay the primary signal on the map. Could revisit if a tap-to-expand pin detail view with a larger avatar is ever added.

   Style (outline/gradient/filled/shimmer) per tier table above and the approved sparkle mockup.
2. **Info/explainer affordance** — a single tappable icon in the Profile modal (near the name/badge cluster). Tapping shows the 3-second auto-dismissing explainer popup above. This is the only explainer entry point — no duplicate indicator elsewhere.
3. **Percentile line** — cosmetic-only text in the membership-status area at the bottom of the Profile modal, with **no tier name attached**, e.g. "top 18% of active members this month." Sourced from `user_engagement_tier_cache.percentile_rank`. Purely descriptive flavor text; the tier itself already incorporates the percentile gate above — this line never independently drives color/star.

## Implementation approach (v1)

1. A Postgres `VIEW` (`view_user_engagement_score`) computing 90-day rolling point totals from existing tables, applying the anti-gaming filters and per-action/overall daily caps above.
2. The new `user_engagement_tier_cache` table (see schema above) — the system's only new persistent state.
3. A nightly scheduled job (Supabase `pg_cron` or equivalent) that:
   - Reads `view_user_engagement_score`.
   - Computes percentile rank among score > 0 users.
   - Determines computed tier (threshold AND percentile gate). Role-floor override exists in code but is disabled (see above).
   - Reads each user's current `effective_tier` from `user_engagement_tier_cache` as `previous_tier`, writes the new row (`score_90d`, `effective_tier`, `percentile_rank`, `previous_tier`, `computed_at`, `promoted_at` if applicable).
   - Inserts a `notifications` row + triggers push/popup for any user whose tier increased.
4. Client: profile/discover-card/social/care-booking-preview components read `user_engagement_tier_cache` (effective_tier + percentile_rank) and render sparkle/username/avatar styling accordingly.

## Explicitly out of scope for v1
- Groups (no `groups` table exists yet — excluded entirely until that feature ships).
- Any punitive/restricted visual state — does not exist in this system by design.
- Real-time/live percentile computation — nightly only.
- Role-based tier floors (admin/volunteer carer) — code path exists, disabled by default.
- Demotion notifications — demotions are always silent.
