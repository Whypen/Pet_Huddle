# Engagement / Trust Score System — Design Spec

Date: 2026-06-27

## Purpose

Identify and visually celebrate positive, engaged Huddle users (posting, caring for pets, helping the community) to build trust signals across the app. The system is purely positive/celebratory — there is no punitive visual state. Banned or restricted users simply look the same as a brand-new user ("New" tier), never singled out negatively.

This is distinct from the existing admin-only `trust_score` / `moderation_state` / `penalty_count` fields in `view_admin_safety_users`, which remain a separate, admin-facing safety system. The new engagement score only *reads* `moderation_state`/`penalty_count` as negative inputs — it does not replace or merge with the safety system.

## Scoring model

Computed live via a Postgres view aggregating existing tables — **no new tables**.

| Action | Points | Source table |
|---|---|---|
| Like/react, comment, reply | +2 | `social_interactions`, `thread_comments` |
| Wave sent/match accepted | +2 | `waves`, `matches` |
| Map pin view/click | +1 (capped ~5/day) | `alert_interactions` |
| Create a post | +5 | `threads` |
| Create a map alert pin | +5 | `broadcast_alerts` |
| Stray/caution pin resolved | +10 bonus | `broadcast_alerts` |
| Care booking completed (carer AND owner, both get points) | +10 each | `marketplace_bookings` (status = completed) |
| Receive a report against you | −2 | `social_interactions` (type = report) |
| Moderation warning/restriction | −10 | `penalty_count` / `moderation_state` (existing admin fields) |
| Banned | frozen at 0 | `moderation_state` |

### Anti-gaming guardrails
- **Diminishing returns per actor/target pair**: same-pair interactions (e.g. liking the same person repeatedly) stop earning points after the 3rd time per day.
- **Daily ceiling**: total positive accrual capped at roughly +50/day, so the score reflects sustained behavior, not single-session farming.
- **Low-effort action caps**: pin views capped at ~5/day.

## Tiers (fixed point thresholds — primary driver of visuals)

| Tier | Score | Avatar corner sparkle | Username | Avatar |
|---|---|---|---|---|
| New | 0 | none | normal | default (today's look, incl. existing verification ring) |
| Active | 1–49 | outline-only sparkle | normal | default |
| Trusted | 50–149 | gradient-gold sparkle (filled) | normal | default |
| Pillar | 150+ | full solid-gold sparkle | Huddle Gold colored + shimmer text effect | shimmer overlay animation (verification ring stays untouched underneath — shimmer is additive, never replaces it) |

Sparkle SVG: source a free/CC-licensed sparkle-star asset matching a 4-point gradient sparkle look (e.g. via Iconify/Flaticon) at implementation time — do not embed the specific paid Magnific stock asset directly.

### Percentile gate (secondary, nightly-computed)
- A nightly job computes each scoring user's percentile rank among all users with score > 0.
- **Promotion to a tier requires BOTH**: (a) crossing the point threshold, AND (b) being within the percentile band for that tier at last nightly computation. Bands: Active = bottom 40%, Trusted = middle 40%, Pillar = top 20%, computed only over users with score > 0 (zero-score/new users excluded from the ranking pool, default to "New").
- Users never see exact percentile math in real time — the displayed tier only updates once nightly, so no live recompute or population scan is needed on page load.
- Demotion: if a user falls below their tier's percentile band on a nightly run, their tier visually drops to match.

### Role-based floors (override)
- **Admin accounts**: always rendered at Pillar visuals, regardless of computed score/percentile.
- **Volunteer carer accounts**: always rendered at minimum Trusted visuals, regardless of computed score/percentile.
- Effective tier = `MAX(computed_tier, role_floor)`.

## Promotion/demotion notifications

When the nightly job changes a user's effective tier (promotion or demotion):
- Insert a row into the existing `notifications` table.
- Push notification + in-app popup explaining the change. Promotion copy should explain why they earned it and hint that inactivity could cause it to drop (loss-aversion framing, no punitive tone). Demotion copy stays encouraging, not shaming.

## UI surfaces

1. **Avatar corner sparkle** — top-right of the avatar, slightly overlapping the avatar ring. Renders wherever a tiered user's avatar appears with tier styling: `ProfileModal` and Discover Card. Style (outline/gradient/filled/shimmer) per tier table above.
2. **Info/explainer affordance** — a single tappable icon in the Profile modal (near the name/badge cluster). Tapping shows a short auto-dismissing (3s) popup: *"This indicates your participation in Huddle ✨"*. This is the only explainer entry point — no duplicate indicator elsewhere.
3. **Percentile line** — cosmetic-only text in the membership-status area at the bottom of the Profile modal, e.g. "Trusted · top 18% of active members this month." Sourced from the nightly job's output. Never affects color/star/tier directly (the tier itself already incorporates percentile via the gate above — this line is purely descriptive flavor text, refreshed nightly along with the tier).

## Implementation approach (v1, no new tables)

1. A Postgres `VIEW` (`view_user_engagement_score`) computing raw point totals live from existing tables.
2. A nightly scheduled job (Supabase `pg_cron` or equivalent) that:
   - Reads `view_user_engagement_score`.
   - Computes percentile rank among score > 0 users.
   - Determines effective tier (threshold AND percentile gate, then role floor override).
   - Persists the *previous* effective tier somewhere comparison-able (smallest viable option: a single small cache, e.g. a materialized view or a lightweight per-user last-known-tier column) so the job can detect tier changes and fire notifications. Exact storage mechanism (materialized view vs. minimal new column) to be decided in the implementation plan — this is the one place a tiny bit of new persistent state may be unavoidable, since "did the tier change since yesterday" requires remembering yesterday's tier.
   - Inserts `notifications` rows for any user whose effective tier changed.
3. Client: profile/discover-card components fetch the latest computed tier + percentile text (from the nightly-refreshed source) and render sparkle/username/ring styling accordingly.

## Explicitly out of scope for v1
- Groups (no `groups` table exists yet — excluded entirely until that feature ships).
- Any punitive/restricted visual state — does not exist in this system by design.
- Real-time/live percentile computation — nightly only.
