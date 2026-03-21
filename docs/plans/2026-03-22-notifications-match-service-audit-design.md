# Notifications, Match & Service Audit — Design

**Date:** 2026-03-22
**Method:** SQL probe (MCP execute_sql) + frontend code review
**Scope:** 8 phases covering notification settings, discover/match, social aggregation, map alerts, pet crons, Stripe webhooks, chat push-only, and service E2E.

---

## Pre-flight: DB Sync Check

Before any phase runs, confirm local migrations match what's deployed on the remote Supabase project:

- Run `supabase db diff --schema public` (or equivalent MCP) to surface any unapplied or diverged migrations.
- Confirm `supabase/migrations/` count matches `cron.job` and `pg_proc` snapshots from the remote.
- If drift is found, apply missing migrations via MCP `apply_migration` before proceeding.

---

## Phase 1 — Notification Settings

**Goal:** Confirm all 7 preference categories are correctly wired from Settings.tsx → DB → `can_deliver_notification`.

### SQL probes
- `can_deliver_notification(uuid, text)` exists and returns correct boolean for each category: `pets`, `social`, `chats`, `map`, `services`, `systems`.
- `notifications` table `type` check constraint includes all mapped values: `social`, `chats`, `map`, `booking`, `system`.
- Settings table / profile JSONB prefs columns exist for all 7 toggles.

### Code checks
- `Settings.tsx`: `NotificationPrefs` shape matches DB column names — specifically `services` (not `service`) and `systems` (not `system`).
- Group notifications (group_message) respect the `chats` toggle.
- Service notifications (`service_notify`) respect the `services` toggle via `can_deliver_notification`.

---

## Phase 2 — Discover & Match

**Goal:** Confirm `social_discovery` never returns matched pairs; match popup fires only once per session.

### SQL probes
- `social_discovery` function definition includes `NOT EXISTS (SELECT 1 FROM public.matches ...)` clause.
- `matches` table has an index on `(user1_id, user2_id)` for the exclusion subquery performance.

### Code checks
- `Discover.tsx`: match popup state is session-scoped (not shown again after first dismiss).
- Queue exhaustion copy is correct (no "Unlock" language).
- No client-side re-injection of matched users into the queue.

---

## Phase 3 — Social Likes/Comments (Aggregation Window)

**Goal:** Confirm social interactions route through `enqueue_notification` correctly and the notification hub shows aggregated counts, not individual rows.

### SQL probes
- `enqueue_notification` href allowlist regex includes `/social`, `/pets`, `/threads` paths.
- Social notification `type` maps to `'social'` in the case statement.
- Check for any social-specific aggregation function or trigger (likes/comments) that batches within a time window.

### Code checks
- `NoticeBoard.tsx`: like/comment actions call `enqueue_notification` (directly or via RPC) with `p_category = 'social'`.
- Notification hub query groups or dedups social events from the same actor within a window.

---

## Phase 4 — Map Alert Support & Broadcast Expiry

**Goal:** Confirm report-based hiding works correctly (10 reports → hidden), expiry notifications fire before delete, and remote DB has the triggers attached.

### SQL probes
- `trg_broadcast_alert_report_notify` trigger is attached to `broadcast_alert_interactions` (AFTER INSERT).
- **Off-by-one audit**: Confirm whether `notify_broadcast_alert_hidden` checks `= 9` or `= 10`. Since this is an AFTER INSERT trigger, count already includes the new row — so `= 9` fires after 9 reports, never at 10. Expected: `= 10`.
- **Visibility gate**: Confirm `broadcast_alerts` table has a column (`is_hidden`, `hide_from_map`, or `hidden`) that gets set to true when report count reaches threshold — or confirm the map query filters by report count directly.
- If a `is_hidden` / `hide_from_map` column exists: confirm there is an UPDATE trigger or the report trigger sets it when `count = 10`.
- If no such column: confirm `VetMarkersOverlay.tsx` / `AlertMarkersOverlay.tsx` filter alerts by report count at query time.
- `cleanup_expired_broadcast_alerts` is scheduled as a cron job (check `cron.job` table).

### Code checks
- `AlertMarkersOverlay.tsx` / `BroadcastModal.tsx`: support_count rendering; does the UI hide alerts that cross the report threshold locally?
- `PinDetailModal.tsx`: confirm expired alerts are not rendered.

---

## Phase 5 — Pet Reminders & Birthday Crons

**Goal:** Confirm both crons fire at 08:00 UTC daily; identify deduplication gap in reminders.

### SQL probes
- `cron.job` contains `process-pet-reminders` scheduled at `0 8 * * *`.
- `cron.job` contains `process-pet-birthdays` scheduled at `0 8 * * *`.
- `process_pet_reminders()` function exists with correct signature.
- `process_pet_birthdays()` function exists with correct signature.
- **Dedup gap**: `process_pet_reminders` has no sent-today guard (unlike birthday logic). If cron fires twice on same day, duplicate notifications are sent. Document as WARN; recommend adding a `reminders_notification_sent_at` column or using `notification_nudge_log`.

### Code checks
- Reminder UI in `PetDetails.tsx` / `EditPetProfile.tsx`: `due_date` field is stored as `current_date`-comparable value.

---

## Phase 6 — Stripe Webhooks, Verification Nudges & Account Status

**Goal:** Confirm DB triggers for verification/account/stars; confirm Stripe webhook maps tier events correctly; confirm nudge/expiry crons run.

### SQL probes
- `trg_notify_profile_verified` trigger attached to `profiles` (AFTER UPDATE OF verification_status).
- `trg_notify_account_status` trigger attached to `profiles` (AFTER UPDATE OF account_status).
- `trg_notify_no_stars` trigger attached to `profiles` (AFTER UPDATE OF stars_count).
- `cron.job` contains `process-verification-nudges` at `0 9 * * *`.
- `cron.job` contains `process-subscription-expiring` at `0 9 * * *`.
- `notification_nudge_log` table exists with `(user_id, kind)` PK.

### Code checks
- `stripe-webhook/index.ts`: `customer.subscription.updated` and `invoice.paid` events update `tier` on `profiles`.
- Webhook maps `prod_TuEpCL4vGGwUpk` → `plus`, `prod_TuF4blxU2yHqBV` → `gold`.
- Tier update triggers `trg_notify_profile_verified` chain correctly (verified badge notification).
- `enqueue_notification` href `/settings` and `/verify` are in the canonical allowlist (confirmed in 20260321141000).

---

## Phase 7 — Chat Push-Only (Not in Notification Hub)

**Goal:** Confirm chat notifications insert with `skip_history=true` and the notification hub excludes them.

### SQL probes
- `trg_notify_new_chat_message` trigger attached to `chat_messages` (AFTER INSERT).
- `enqueue_chat_notification` function exists and sets `metadata->>'skip_history' = 'true'`.
- Confirm `notifications` table has no constraint that rejects the `skip_history` metadata key.
- Probe: count of `notifications` rows where `metadata->>'skip_history' = 'true'` and `type = 'chats'` — should be > 0 if any chats have occurred.

### Code checks
- Notification hub query (wherever notifications are read in the frontend): confirm it filters `WHERE metadata->>'skip_history' IS DISTINCT FROM 'true'` or equivalent.
- Group message path: `notify_new_chat_message` covers `chat_type = 'group'` as well as direct.
- Service chat messages: confirm `service` chat type does NOT trigger `notify_new_chat_message` (service notifications go through `service_notify` instead).

---

## Phase 8 — Service E2E Audit

**Goal:** Confirm all 8 service RPCs exist in their final form (183000 wins over 130100), crons are live, payout lock columns exist, review rollup works.

### SQL probes
- All 8 RPCs exist: `create_service_chat`, `send_service_request`, `withdraw_service_request`, `send_service_quote`, `withdraw_service_quote`, `start_service_now`, `mark_service_finished`, `file_service_dispute`, `submit_service_review`.
- Confirm `mark_service_finished` body includes `payout_release_requested_at = now()` — i.e., 183000 version is live (not 130100).
- `service_chats` table has columns: `payout_release_requested_at`, `payout_release_attempted_at`, `payout_release_lock_token`, `payout_release_locked_at`.
- `pet_care_profiles` has `rating_avg` and `review_count` columns (added in 183000).
- `cron.job` contains `service-booking-reminders-hourly` at `*/10 * * * *`.
- `cron.job` contains `service-payout-releases` at `*/2 * * * *`.
- `can_request_service_from_provider(uuid)` function exists.
- `service_disputes` table exists with correct columns.

### Code checks
- `ServiceChat.tsx`: lifecycle state machine matches DB states (`pending → booked → in_progress → completed / disputed`).
- `create_service_chat` guard: requester must be verified (`is_verified = true`).
- Provider listed guard: `can_request_service_from_provider` checked before chat creation.

---

## Known Bugs (Pre-confirmed by Code Review)

| # | Phase | Bug | Severity | Fix |
|---|---|---|---|---|
| 1 | 4 | `notify_broadcast_alert_hidden` checks `= 9` in AFTER INSERT trigger — fires at 9 reports, never at 10 | HIGH | Change `= 9` to `= 10` in trigger function |
| 2 | 4 | No column/mechanism confirmed to actually hide the alert from map — notification fires but alert may stay visible | HIGH | Confirm or add `is_hidden` flag set when reports ≥ 10 |
| 3 | 5 | `process_pet_reminders` has no dedup guard — double-fire on same day sends duplicate notifications | WARN | Add sent-today check or `notification_nudge_log` entry |
| 4 | 7 | `skip_history` in metadata must be filtered in notification hub query — not yet confirmed | HIGH | Verify frontend hub query excludes `skip_history = true` rows |
| 5 | 8 | `mark_service_finished` in 130100 omits provider payout notification and payout columns — must confirm 183000 is live | HIGH | SQL probe: check for `payout_release_requested_at` in function body |

---

## Output Format

Each phase returns:
- **PASS** — probe confirmed, no action needed.
- **WARN** — works but has a gap or fragility to document.
- **FAIL** — confirmed bug; fix steps listed with exact SQL or code change.

Fixes are applied in the same session, migration-per-bug, using `apply_migration` for DB changes and direct file edits for frontend.
