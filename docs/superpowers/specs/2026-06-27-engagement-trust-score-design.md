# Engagement / Trust Score System — Design Spec

Date: 2026-06-27

## Purpose

Identify and visually celebrate positive, engaged Huddle users (posting, caring for pets, helping the community) to build trust signals across the app. The system is visually positive/celebratory — there is no punitive visual state. Suspended, removed, or restricted users simply look the same as a brand-new user, never singled out negatively.

This is distinct from the existing admin-only `trust_score` / `moderation_state` / `penalty_count` fields used in `view_admin_safety_users`, which remain a separate, admin-facing safety system. The new engagement score only reads canonical, confirmed moderation outcomes as negative inputs — it does not replace, merge with, or get stored inside the safety system. (Confirmed: `trust_score`/`penalty_count`/`moderation_state` are not physical writable columns in `schema_public.sql` — they're admin-view-only fields. We can't repurpose them to store engagement-tier state; see "Cache table" below.)

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
| Completed Care session | Carer | +5 | max +10/day | `service_chats` canonical completion state |
| Completed Care session | Requester/owner | +5 | max +10/day | `service_chats` canonical completion state |
| Create Stray / Caution map alert pin | Creator | +4 | shared map-pin cap max +10/day | `broadcast_alerts` |
| Create Lost / Others map alert pin | Creator | +2 | shared map-pin cap max +10/day | `broadcast_alerts` |
| Create post | Author | +3 | max +6/day | `threads` |
| Comment / reply | Actor | +2 | max +6/day | `thread_comments` |
| Like / react / support | Actor | +1 | max +3/day | canonical support tables behind `set_native_social_support` / `set_native_social_comment_support` |
| Wave sent / match accepted | Actor | +1 | max +2/day | `waves`, `matches` |
| Map pin view/click | Nobody | 0 | analytics only | `alert_interactions` |
| Share | Nobody in v1 | 0 | analytics only until actor-level durable share events are confirmed | `threads.clicks` / share counters |
| Raw report received | Nobody | 0 | no effect | `social_interactions` |
| Confirmed moderation action (admin-actioned warning/restriction — not a raw report) | Target | −5 | — | canonical admin moderation action / restriction source |
| Suspended / removed account | — | display forced to New; displayed score 0 while active | — | `profiles.account_status` / canonical moderation source |

**Raw reports received and raw blocks never affect the public tier.** Only a confirmed admin moderation action moves the score — this prevents bad-faith mass-reporting or block brigading from being used to grief someone's public standing. Map pin views and shares are analytics-only in v1, not scored at all, since they are too low-effort or not yet actor-durable enough to mean reputation.

In addition to the per-action daily caps above, an **overall daily positive cap of +20/day** applies on top — whichever limit binds first. This keeps the sparkle earned over sustained behavior rather than reachable in a few high-volume days.

### Rules summary

| Rule | Decision |
|---|---|
| Score window | Rolling 90 days |
| Tier method | Fixed point thresholds + percentile gate (MVP) |
| Self-actions | Never count |
| Deleted/hidden/spam content | Never count |
| Blocks | Raw blocks do not subtract points; interactions between blocked users never count |
| Same actor/target farming | Max 3 score-earning interactions per actor/target pair per day |
| Daily positive cap | +20/day total (on top of per-action caps above) |
| Confirmed moderation action | −5 per confirmed admin action |
| Suspended / removed account | Displayed as New, score displayed as 0 while active |
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
- **Raw blocks do not subtract points.** Blocks are too easy to misuse as a reputation weapon, so they are only an exclusion signal: once two users are blocked from each other, interactions between them no longer count.
- **Diminishing returns per actor/target pair**: max 3 score-earning interactions per actor/target pair per day — this applies to **Care completions too**, not just social actions, since bookings are high-value and attractive for two colluding accounts ping-ponging fake completions. Care points only count when the canonical Care chat reaches completed state (`service_chats.status = 'completed'` and `service_chats.care_status = 'completed'`) after both sides have marked completion through the server flow; payment/agreement state can be used as an extra guard, but it is not the completion proof by itself.
- **Per-action and overall daily caps**, per the table above.
- **Suspended/removed users are explicitly zeroed for display**: the final tier computation forces active suspended or removed accounts to New with displayed score 0. Historical activity is not deleted; if the account is restored, the normal 90-day score can be recomputed on the next nightly run.

## Tiers (fixed point thresholds — primary driver of visuals, internal names only)

| Internal name | Score (90-day rolling) | Avatar corner sparkle | Username | Avatar |
|---|---|---|---|---|
| New | 0 | none | normal | default (today's look, incl. existing verification ring) |
| Active | 1–49 | outline-only sparkle | normal | default |
| Trusted | 50–149 | white→gold blend sparkle (filled) | normal | default |
| Pillar | 150+ | full solid-gold sparkle + shimmer sweep | Huddle Gold colored + shimmer sweep | shimmer sweep animation plays across the ring (never recolors it — verification blue/etc. underneath is untouched) |

Thresholds carried over from earlier drafts; worth re-checking against real 90-day distributions once the view is live, since point values per action changed since these were set. Tuning the threshold numbers later is a config change, not a re-architecture.

**Sparkle SVG — approved design:** a single 4-point sparkle/diamond-star shape (path: `M0,-16 C1,-5 5,-1 16,0 C5,1 1,5 0,16 C-1,5 -5,1 -16,0 C-5,-1 -1,-5 0,-16 Z`), consistent across all three tiers, positioned top-right overlapping the avatar's edge:
- **Active**: outline only, no fill, gold stroke (`#C8861A`).
- **Trusted**: filled, diagonal gradient — **white covers the first 50%** (top-left), a short blend from 50–62%, then **flat solid gold (`#E8B23D`) fills the remaining ~38%** (bottom-right tip), no further gradient past that point. Thin gold stroke (`#C8861A`).
- **Pillar**: filled, full gold gradient (`#FFE9A8 → #F2C14E → #C8861A`), plus an **animated shimmer sweep** — a soft diagonal highlight that periodically passes across the sparkle, the username text, and the avatar ring.

**The avatar ring is never touched at any tier** — no recoloring, no added glow/halo sitting behind it, nothing. A verified user's ring stays pixel-for-pixel its current blue at Active, Trusted, and Pillar alike. At Pillar, the shimmer sweep is purely an animated highlight that plays *across* the ring's existing color (same trick as a CSS shine-on-hover effect) — the ring's underlying color value is never modified, only momentarily overlaid by a moving light highlight. Username gold-tint at Pillar gets the same shimmer sweep treatment, layered over its base color.

Approval mockup (corrected version) shared during design review; the reference sparkle path/gradients are saved at [`assets/engagement-sparkle.svg`](assets/engagement-sparkle.svg). Source a free/CC-licensed sparkle asset matching this shape at implementation time (e.g. via Iconify/Flaticon) — do not embed the specific paid Magnific stock asset directly; the shape is generic/common enough to recreate freely.

### Percentile gate (secondary, nightly-computed)
- A nightly job computes each scoring user's percentile rank among all users with 90-day score > 0.
- **Reaching a tier requires BOTH**: (a) crossing the point threshold, AND (b) passing the percentile gate for that tier at the last nightly computation. Active requires only score > 0. Trusted requires the user not to be in the bottom 40% of scoring users. Pillar requires the user to be in the top 20% of scoring users. Percentiles are computed only over users with score > 0; zero-score/new users are excluded from the ranking pool.
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
- effective_tier      text   (internal: new/active/trusted/pillar)
- percentile_rank     numeric, nullable
- previous_tier       text
- computed_at         timestamptz
- last_promoted_tier  text, nullable
- last_promoted_at    timestamptz, nullable
```

This is the only new persistent state in the entire system — everything else (raw score, anti-gaming filters) is computed live from existing tables in the view; this table just stores the *result* of the nightly computation so the client and the notification job both have something stable to read.

**Sparsity:** only upsert a row for a user who currently has score > 0 or already has an existing row (so a drop back to "New" can still be reflected by updating `effective_tier`). Users who have never scored never get a row — absence of a row means "New" by default on the client. Keeps the table from growing with rows for inactive accounts.

When the nightly job detects `effective_tier > previous_tier`:
- Insert a row into the existing `notifications` table.
- Trigger push notification + in-app popup.
- Set `last_promoted_tier` and `last_promoted_at` to the promoted tier and run timestamp.
- **Anti-flapping guard:** skip firing the notification if the user was already promoted into this same tier within the last 14 days (check `last_promoted_tier` + `last_promoted_at`). Prevents repeat "you just earned a sparkle!" pings if a score oscillates right at a threshold boundary across several nightly runs.

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
   - Determines computed tier (threshold AND percentile gate), then applies moderation display suppression for active suspended/removed users. Role-floor override exists in code but is disabled (see above).
   - Reads each user's current `effective_tier` from `user_engagement_tier_cache` as `previous_tier`, writes the new row (`score_90d`, `effective_tier`, `percentile_rank`, `previous_tier`, `computed_at`, `last_promoted_tier`, `last_promoted_at` if applicable).
   - Inserts a `notifications` row + triggers push/popup for any user whose tier increased.
4. Client: profile/discover-card/social/care-booking-preview components receive compact engagement fields from their existing owning RPC/list payloads and render sparkle/username/avatar styling accordingly. Do not add per-avatar cache reads.

### Implementation plan — existing schema reuse

The implementation should reuse existing canonical server tables/RPC-backed sources wherever possible. The only new table should be `user_engagement_tier_cache`; do not add raw score/event tables for v1 unless a required source is missing on the real remote schema.

| Score item | Existing source to reuse | How to read it | Implementation notes |
|---|---|---|---|
| Completed Care session | `service_chats` canonical completion state | Count rows where the user is `provider_id` or `requester_id`, inside the rolling 90-day window, with `status = 'completed'` and `care_status = 'completed'` | Award `+5` to each side only after the server completion flow marks the Care session complete. The completion function requires valid check-in/hard-completion conditions and both `requester_mark_finished` and `provider_mark_finished` before setting completed state. Payment/agreement state may be joined as an additional safety guard, but `service_care_agreements.payment_status = 'succeeded'` alone is not completion proof. Exclude cancelled/disputed/recovery states. |
| Stray / Caution map pin created | `broadcast_alerts` | Count creator rows where `type in ('Stray', 'Caution')`, inside the rolling 90-day window | Award `+4` each, under the shared map-pin create cap of `+10/day`. Count only pins that still pass current map visibility/moderation rules; hidden/restricted/deleted/abuse-hidden pins do not count. |
| Lost / Others map pin created | `broadcast_alerts` | Count creator rows where `type in ('Lost', 'Others')`, inside the rolling 90-day window | Award `+2` each, under the same shared map-pin create cap of `+10/day`. If legacy data lacks `Caution`, implementation should support it only if the current remote enum/check allows it. |
| Map pin views/clicks | `alert_interactions`, `broadcast_alert_interactions`, `broadcast_alerts.share_count`, social thread `clicks` where applicable | Analytics only | Do not score in v1. These are useful for ranking/analytics, but too low-effort for public reputation. |
| Social post created | `threads` via `create_native_social_thread` | Count author rows inside the rolling 90-day window | Award `+3`, max `+6/day`. Count only public/visible posts that pass the same visibility constraints as the social feed: not hidden, not deleted/spam, not from social-hidden/suspended/removed users. |
| Comment / reply created | `thread_comments` via `create_native_social_comment` | Count comment author rows inside the rolling 90-day window | Award `+2`, max `+6/day`. The parent thread must still be visible, and self-comments on the actor's own post do not score. |
| Post like/support given | `thread_supports` behind `set_native_social_support` | Count support rows by `user_id`, joined to visible parent `threads` | Award `+1`, max `+3/day`. Do not use `social_interactions` for likes; that table is for pass/hide/block/report-style social actions. Verify `thread_supports` exists on the real remote schema before implementation because it is referenced by migrations/RPCs but must be catalog-proven. |
| Comment like/support given | `thread_comment_supports` behind `set_native_social_comment_support` | Count support rows by `user_id`, joined to `thread_comments` and visible parent `threads` | Award `+1`, shares the same like/support cap of `+3/day`. Self-support on own comment does not score. |
| Social share | `record_thread_share_click`, `threads.clicks`, `social_feed_events.event_type = 'share'` | Analytics only for v1 | Do not score until an actor-level, durable, abuse-resistant share source is confirmed as product-canonical. `threads.clicks` is a counter, not enough by itself for reputation. |
| Wave / match activity | `waves`, `matches` | Count sent waves / accepted matches inside the rolling 90-day window | Award `+1`, max `+2/day`. Avoid double-counting the same social connection; implementation should prefer one canonical event per actor/day/target. |
| Confirmed moderation action | canonical admin moderation action / restriction source, including `user_reports`, `user_moderation_restrictions`, and admin safety outcomes as applicable | Count confirmed admin-actioned warnings/restrictions, not raw reports | Apply `-5` per confirmed action. Raw reports and raw blocks never subtract points. Implementation must prove the exact remote source for confirmed actions before writing SQL. |
| Suspended / removed account | `profiles.account_status` and current moderation helpers | Final display suppression step | Active suspended/removed accounts display as New and score displays as `0`. Historical rows remain; if restored, the normal rolling score can return on the next nightly computation. |
| Blocked users | `is_user_blocked(...)` / block relationship tables used by existing RPCs | Exclusion filter only | Raw blocks do not subtract points. Interactions between blocked users do not score. |

### Implementation plan — cache table schema

Use one cache table with strict constraints so app code does not have to run live scoring queries:

```sql
create table public.user_engagement_tier_cache (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  score_90d integer not null default 0 check (score_90d >= 0),
  effective_tier text not null default 'new' check (effective_tier in ('new', 'active', 'trusted', 'pillar')),
  percentile_rank numeric null check (percentile_rank is null or (percentile_rank >= 0 and percentile_rank <= 100)),
  previous_tier text not null default 'new' check (previous_tier in ('new', 'active', 'trusted', 'pillar')),
  computed_at timestamptz not null default now(),
  last_promoted_tier text null check (last_promoted_tier is null or last_promoted_tier in ('active', 'trusted', 'pillar')),
  last_promoted_at timestamptz null
);
```

RLS/grants:
- Authenticated clients can read only the display-safe fields needed by profile/card RPCs: `user_id`, `effective_tier`, `percentile_rank`, `computed_at`.
- Direct client writes are forbidden.
- The nightly refresh function writes with service-role/definer privileges.

Sparsity:
- Upsert rows for users with score > 0 or existing cache rows.
- Absence of a row means `new` on the client.

### Implementation plan — score computation order

1. Build source CTEs for each scored action with common columns: `user_id`, `target_user_id`, `event_date`, `points`, `source`, `source_id`.
2. Apply source-specific visibility filters before scoring: hidden/deleted/spam/restricted content does not enter the score set.
3. Remove self-actions where actor equals target.
4. Remove interactions between blocked users.
5. Apply per-actor/target/day farming cap: max 3 score-earning interactions per actor/target pair per day.
6. Apply per-action daily caps.
7. Apply overall daily positive cap of `+20/day`.
8. Add confirmed moderation penalties (`-5` each) after positive caps.
9. Sum the rolling 90-day score, clamped at minimum 0 for stored/display score.
10. Compute percentile rank among users with `score_90d > 0`.
11. Determine tier:
    - `new`: score `0`, or active suspended/removed display suppression
    - `active`: score `1-49`
    - `trusted`: score `50-149` and not bottom 40% of scoring users
    - `pillar`: score `150+` and top 20% of scoring users
12. Upsert `user_engagement_tier_cache`.
13. Insert promotion notification only when tier increases and the same tier was not promoted within the anti-flapping window.

### Implementation plan — app integration

Do not add one-off client reads per avatar. Add engagement fields to the existing owning server payloads/RPCs:
- Public profile modal/profile summary: include `engagement_tier`, `engagement_percentile_rank`, `engagement_computed_at`.
- Social feed post authors and comment authors: include the same compact fields from the parent feed/comment RPC.
- Care provider cards/profile preview: include the same compact fields from the provider-card/detail RPC.
- Discover/profile cards, if active in the current product path: include the same compact fields in that card RPC.

Client rendering should use one shared sparkle component and treat missing cache data as `new`.

## Explicitly out of scope for v1
- Groups (no `groups` table exists yet — excluded entirely until that feature ships).
- Any punitive/restricted visual state — does not exist in this system by design.
- Real-time/live percentile computation — nightly only.
- Role-based tier floors (admin/volunteer carer) — code path exists, disabled by default.
- Demotion notifications — demotions are always silent.

## Implementation review notes (post-ship, 2026-06-28)

Codex's first implementation pass (migrations `20260627120000`–`20260627130000`) correctly grounded the score in real schema (`service_chats`, `thread_supports`, `thread_comment_supports`, `user_moderation_restrictions`) and matched the anti-gaming/cap/notification logic precisely. A review against this spec found and fixed:

- **Trusted sparkle gradient was a continuous fade, not the locked two-tone split.** Fixed in `NativeProfileAvatar.tsx`: gradient stops now go white→white→flat solid gold (no intermediate `#F5D984` step), matching "white 0–50%, blend 50–62%, flat solid gold 62–100%."
- **Pillar shimmer was a static, non-animated rect confined to the sparkle icon's own viewbox.** Replaced with `NativeAvatarShimmer`, a Reanimated translateX sweep (same technique as `NativeShimmerSkeleton`/`NameShine`) clipped to the avatar circle, so it animates across the avatar and ring without ever touching the ring's `borderColor`.
- **Pillar username gold + shimmer was entirely unimplemented.** Added: `NativeProfileHero.tsx` now applies a solid gold text color and reuses the existing `NameShine` sweep component (previously gated only on Plus/Gold subscription) when `engagement.tier === "pillar"`. Social feed author names get a solid gold tint (no animated sweep, to avoid running multiple loops per feed row) via `NativeSocialFeedPrimitives.tsx`.
- **The info/explainer popup was missing.** Added `EngagementExplainer` in `NativeProfileHero.tsx` — a small tappable icon next to the sparkle that shows the 3-second auto-dismissing note.
- **The percentile line was missing.** Added to `NativeProfileHero.tsx`, rendered from `engagement.percentileRank` as "top N% of active members this month" with no tier name attached.
- **Notification copy had dropped the 🐾/✨ emojis** from the locked spec text. Restored via a follow-up migration (`20260627132000`) that re-applies the same function logic with the original copy.
- **`view_user_engagement_score` was grants `SELECT` to `authenticated`,** which bypasses the suspended/removed zeroing that only happens inside the refresh function. Locked down to `service_role` only via `20260627131500`, since clients should only ever read through the cache table / `get_user_engagement_tiers` RPC.
- **Operational note, not a code bug:** the very first refresh run promoted and notified all 47 then-active-tier users at once, since no prior cache rows existed to diff against. Working as coded, but worth a conscious decision on whether future cold-start backfills should seed silently instead of firing a promotion notification to everyone simultaneously.
- **Discover card surface could not be located** in the current codebase under that name — flagged for Codex/product to confirm what that maps to, or whether it's not yet built.
