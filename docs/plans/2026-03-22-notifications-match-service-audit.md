# Notifications, Match & Service Audit — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate and fix all notification, match, and service flows across 8 phases using live SQL probes against the remote Supabase DB, with inline fixes applied per confirmed failure.

**Architecture:** Each phase runs SQL probes via MCP `execute_sql` to confirm functions, triggers, and crons exist and are correct on the remote DB, followed by a code review of the relevant frontend files. Any FAIL produces a migration file applied via MCP `apply_migration` and a code edit applied with the Edit tool. WARN items are documented but not blocked on.

**Tech Stack:** Supabase (PostgreSQL, pg_cron, pg_net), React/TypeScript, Vite, MCP execute_sql / apply_migration, supabase CLI (db diff)

---

## Pre-flight: DB Sync Check

**Files:**
- Read: `supabase/migrations/` (count local files)
- Run: `supabase db diff --schema public`

**Step 1: Count local migration files**

```bash
ls supabase/migrations/*.sql | wc -l
```

Expected: number of files matches what's applied on remote.

**Step 2: Check remote migration history via SQL probe**

```sql
SELECT COUNT(*) AS applied_count FROM supabase_migrations.schema_migrations;
```

Expected: count matches local file count. If lower → unapplied migrations exist.

**Step 3: List any unapplied migrations**

```sql
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;
```

Compare the most recent timestamps to the newest local migration filenames. Any local file with a timestamp not in this list is unapplied.

**Step 4: Apply any missing migrations**

For each unapplied migration, use MCP `apply_migration` with the file contents.

**Step 5: Confirm sync**

Re-run Step 2. Counts must match before proceeding.

---

## Task 1: Phase 1 — Notification Settings

**Files:**
- Read: `src/pages/Settings.tsx`
- Read: `supabase/migrations/20260320120000_notification_prefs_phase1_restructure.sql`
- Read: `supabase/migrations/20260321141000_enqueue_notification_type_canonical.sql`

### Step 1: Probe — `can_deliver_notification` exists

```sql
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'can_deliver_notification'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Expected: 1 row, args = `(uuid, text)`. FAIL if 0 rows.

### Step 2: Probe — `notifications` type check constraint

```sql
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'public.notifications'::regclass
  AND conname ILIKE '%type%';
```

Expected: constraint includes `social`, `chats`, `map`, `booking`, `system`. FAIL if `booking` is absent (service notifications use this type).

### Step 3: Probe — prefs columns on `profiles` or `settings` table

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'notification_preferences', 'settings')
  AND column_name IN ('pets', 'social', 'chats', 'map', 'services', 'systems', 'push_enabled', 'prefs')
ORDER BY table_name, column_name;
```

Expected: all 7 toggles are reachable. Document where they live (JSONB `prefs` column vs separate columns).

### Step 4: Code review — Settings.tsx prefs shape

Read `Settings.tsx`. Confirm:
- `NotificationPrefs` type has `services` (not `service`) and `systems` (not `system`).
- The toggle for group notifications maps to the `chats` category.
- The toggle for service notifications maps to `services`.

FAIL if any category name mismatches the DB column or the `can_deliver_notification` logic.

### Step 5: Probe — `can_deliver_notification` correctly reads `services` category

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'can_deliver_notification'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Scan the source for `'services'` and `'systems'`. FAIL if either is missing from the case/if logic.

### Step 6: Emit verdict + fix if FAIL

If type constraint missing `booking` → apply migration:
```sql
-- add booking to notifications type check
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('social','chats','map','booking','system','alert'));
```

**Step 7: Commit**

```bash
git add supabase/migrations/<new>.sql
git commit -m "fix: phase 1 — notifications type constraint includes booking"
```

---

## Task 2: Phase 2 — Discover & Match

**Files:**
- Read: `src/pages/Discover.tsx`
- SQL probe only (no migration expected)

### Step 1: Probe — `social_discovery` excludes matched pairs

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'social_discovery'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep the returned source for `NOT EXISTS` and `matches`. FAIL if the exclusion subquery is absent.

### Step 2: Probe — `matches` index for exclusion performance

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'matches'
  AND schemaname = 'public';
```

Expected: index on `(user1_id, user2_id)` or equivalent. WARN if missing (performance risk, not correctness).

### Step 3: Code review — Discover.tsx match popup fires once

Read `Discover.tsx`. Look for the match popup state. Confirm:
- State variable is local to the component or stored in `sessionStorage` / `useRef` — NOT `localStorage`.
- The popup is dismissed and does not re-appear during the same session without a new match event.
- The session queue exhaustion message contains no "Unlock" language (per copy doctrine: Plus/Gold, not Unlock).

FAIL if popup uses `localStorage` (persists across sessions) or if queue exhaustion copy says "Unlock".

### Step 4: Emit verdict

PASS or FAIL with specific line numbers.

---

## Task 3: Phase 3 — Social Likes/Comments Aggregation

**Files:**
- Read: `src/components/social/NoticeBoard.tsx` (already partially read — continue from line 80)
- Read: `supabase/migrations/20260320130000_social_aggregation_phase3.sql`

### Step 1: Probe — href allowlist includes `/social` and `/pets`

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'enqueue_notification'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep result for `/social` and `/pets` in the href regex. FAIL if absent (pet/social notifications would throw `invalid_href`).

### Step 2: Probe — social notification type maps to `'social'`

From the same source above, check the case statement:
```
when 'social' then v_type := 'social'
```
FAIL if missing.

### Step 3: Probe — aggregation function exists

```sql
SELECT proname FROM pg_proc
WHERE proname ILIKE '%social%aggregat%' OR proname ILIKE '%aggregate%social%'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Also check for a trigger on `thread_likes`, `thread_comments`, or `thread_interactions`:

```sql
SELECT trigger_name, event_object_table, action_timing, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('thread_likes','thread_comments','thread_interactions','social_interactions')
ORDER BY event_object_table;
```

Expected: trigger exists that calls a notification function. WARN if absent (notifications may not fire on likes/comments at all).

### Step 4: Code review — NoticeBoard notification routing

Read `NoticeBoard.tsx` lines 80–300. Confirm:
- Like action calls an RPC or inserts into `thread_likes` — that table has a trigger to enqueue a notification.
- Comment action similarly triggers a notification.
- The notification hub does NOT show individual like/comment rows as separate items if an aggregation window is specified — instead it shows "X people liked your post" style copy.

WARN if no aggregation window is present (each like fires a separate notification row).

### Step 5: Emit verdict

---

## Task 4: Phase 4 — Map Alert Report Threshold & Visibility Gate

**Files:**
- Read: `src/components/map/AlertMarkersOverlay.tsx`
- Read: `src/components/map/BroadcastModal.tsx`
- Modify: new migration file for the off-by-one fix

### Step 1: Probe — trigger is attached

```sql
SELECT trigger_name, event_object_table, action_timing, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'trg_broadcast_alert_report_notify';
```

Expected: 1 row, AFTER INSERT on `broadcast_alert_interactions`. FAIL if 0 rows.

### Step 2: Probe — confirm off-by-one in live function body

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'notify_broadcast_alert_hidden'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `= 9` or `= 10`.

- `= 9` → **FAIL** (fires at 9 reports, never at 10, because AFTER INSERT already includes new row in count).
- `= 10` → PASS.

### Step 3: Probe — visibility gate column

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'broadcast_alerts'
  AND column_name IN ('is_hidden','hide_from_map','hidden','report_count','is_visible','visibility');
```

**Three possible outcomes:**
- A `is_hidden` / `hide_from_map` column exists → proceed to Step 4.
- No such column → check if map query filters by report count dynamically (Step 5).
- Column exists but is never set when reports ≥ 10 → FAIL.

### Step 4: Probe — if visibility column exists, check it's set by trigger or query

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'notify_broadcast_alert_hidden'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `UPDATE broadcast_alerts SET` in the function body. FAIL if the trigger only enqueues a notification but never sets the visibility flag.

### Step 5: Probe — if no visibility column, check map query filters by report count

```sql
-- Check the get_broadcast_alerts or similar function
SELECT proname, prosrc
FROM pg_proc
WHERE proname ILIKE '%broadcast%alert%'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `report_count` or `interaction_type = 'report'` in the WHERE clause. FAIL if alerts with ≥ 10 reports are returned to clients unchanged.

### Step 6: Apply fix — off-by-one + visibility gate

Create migration `supabase/migrations/20260322100000_fix_broadcast_alert_hidden_threshold.sql`:

```sql
-- Fix 1: Correct off-by-one in report threshold (AFTER INSERT trigger already counts new row)
-- Fix 2: Ensure alert is marked hidden when threshold is crossed

create or replace function public.notify_broadcast_alert_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_count integer;
  v_creator_id uuid;
begin
  if new.interaction_type <> 'report' then
    return new;
  end if;

  select creator_id into v_creator_id
  from public.broadcast_alerts
  where id = new.alert_id;

  if v_creator_id is null then
    return new;
  end if;

  -- Count includes current row (AFTER INSERT trigger)
  select count(*) into v_report_count
  from public.broadcast_alert_interactions
  where alert_id = new.alert_id
    and interaction_type = 'report';

  -- Fire exactly when threshold reaches 10
  if v_report_count = 10 then
    -- Mark alert hidden so map queries exclude it
    update public.broadcast_alerts
    set is_hidden = true
    where id = new.alert_id;

    perform public.enqueue_notification(
      v_creator_id,
      'map',
      'broadcast_hidden',
      'Alert removed',
      'Your alert was removed after too many reports',
      '/map',
      jsonb_build_object('alert_id', new.alert_id)
    );
  end if;

  return new;
end;
$$;
```

Note: Only add `SET is_hidden = true` if the column confirmed to exist in Step 3. If no column, add it first:

```sql
ALTER TABLE public.broadcast_alerts
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
```

And update map query to filter `WHERE NOT is_hidden`.

**Apply via MCP `apply_migration`.**

### Step 7: Code review — AlertMarkersOverlay.tsx

Read `src/components/map/AlertMarkersOverlay.tsx`. Confirm:
- The query that fetches alerts either calls an RPC that filters hidden alerts, or adds `eq('is_hidden', false)` to the Supabase query.

FAIL if client fetches all alerts and only client-side filters — hidden alerts would still transmit over the wire.

### Step 8: Probe — expiry cleanup cron is scheduled

```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname ILIKE '%broadcast%' OR jobname ILIKE '%cleanup%alert%';
```

Expected: 1 row. WARN if missing (expired alerts never deleted, no expiry notification sent).

### Step 9: Commit fixes

```bash
git add supabase/migrations/20260322100000_fix_broadcast_alert_hidden_threshold.sql
git commit -m "fix: phase 4 — broadcast alert hidden threshold off-by-one, add visibility gate"
```

---

## Task 5: Phase 5 — Pet Reminders & Birthday Crons

**Files:**
- Read: `src/pages/PetDetails.tsx` (or `src/pages/EditPetProfile.tsx`)
- Read: `supabase/migrations/20260321110000_pet_reminders_birthday_notifications.sql` (already read)

### Step 1: Probe — both crons are registered at 08:00 UTC

```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname IN ('process-pet-reminders', 'process-pet-birthdays');
```

Expected: 2 rows, both with schedule `0 8 * * *`. FAIL if either is missing or wrong schedule.

### Step 2: Probe — both functions exist

```sql
SELECT proname FROM pg_proc
WHERE proname IN ('process_pet_reminders', 'process_pet_birthdays')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Expected: 2 rows. FAIL if either is missing.

### Step 3: Probe — reminders table has `due_date` column of type `date`

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reminders'
  AND column_name = 'due_date';
```

Expected: `date` type. FAIL if `timestamptz` (comparison `= current_date` would fail silently).

### Step 4: Probe — dedup gap audit

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'process_pet_reminders'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for any guard like `notification_nudge_log`, `sent_at`, or `NOT EXISTS`.

- If absent → **WARN**: reminder dedup gap. If cron fires twice same day, duplicate notifications go out.
- Document as WARN, do not block. Recommend: add `reminder_notified_date date` column to `reminders` table and skip if already notified today.

### Step 5: Emit verdict

PASS / WARN. No migration needed for WARN — log it.

---

## Task 6: Phase 6 — Stripe Webhooks, System Triggers & Nudge Crons

**Files:**
- Read: `supabase/functions/stripe-webhook/index.ts` (lines 80–250)
- Read: `supabase/migrations/20260321120000_system_notifications_phase6.sql` (already read)

### Step 1: Probe — three profile triggers are attached

```sql
SELECT trigger_name, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'trg_notify_profile_verified',
    'trg_notify_account_status',
    'trg_notify_no_stars'
  );
```

Expected: 3 rows. FAIL for any missing trigger.

### Step 2: Probe — nudge + expiry crons registered

```sql
SELECT jobname, schedule
FROM cron.job
WHERE jobname IN ('process-verification-nudges', 'process-subscription-expiring');
```

Expected: 2 rows at `0 9 * * *`. FAIL if either missing.

### Step 3: Probe — `notification_nudge_log` table exists

```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'notification_nudge_log';
```

Expected: 1. FAIL if 0.

### Step 4: Probe — `enqueue_notification` href allowlist includes `/verify` and `/settings`

From the function source probed in Task 1 Step 5 (or re-probe):

```sql
SELECT prosrc FROM pg_proc
WHERE proname = 'enqueue_notification'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `/verify` and `/settings` in the regex. FAIL if absent (verification nudge href `/verify` would throw `invalid_href`).

### Step 5: Code review — stripe-webhook tier mapping

Read `supabase/functions/stripe-webhook/index.ts` lines 80–250. Confirm:
- `customer.subscription.updated` or `customer.subscription.created` events update `profiles.tier` to `'plus'` or `'gold'`.
- `prod_TuEpCL4vGGwUpk` → `plus`, `prod_TuF4blxU2yHqBV` → `gold`.
- `invoice.payment_failed` event sets tier to `'free'` or triggers account status notification.

FAIL if tier downgrade on payment failure is not handled.

### Step 6: Emit verdict + fix if FAIL

If `/verify` missing from href allowlist → apply migration (update `enqueue_notification` regex).

**Step 7: Commit**

```bash
git add supabase/migrations/20260322110000_fix_enqueue_href_verify.sql
git commit -m "fix: phase 6 — add /verify to enqueue_notification href allowlist"
```

---

## Task 7: Phase 7 — Chat Push-Only (Not in Notification Hub)

**Files:**
- Grep for notification hub query across `src/`
- Read: notification hub component (wherever notifications are listed)

### Step 1: Probe — chat message trigger is attached

```sql
SELECT trigger_name, event_object_table, action_timing, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'trg_notify_new_chat_message';
```

Expected: 1 row, AFTER INSERT on `chat_messages`. FAIL if missing.

### Step 2: Probe — `enqueue_chat_notification` sets `skip_history = true`

```sql
SELECT prosrc FROM pg_proc
WHERE proname = 'enqueue_chat_notification'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `skip_history`. FAIL if absent.

### Step 3: Probe — sample chat notifications have `skip_history` in metadata

```sql
SELECT id, type, metadata
FROM public.notifications
WHERE type = 'chats'
  AND metadata->>'skip_history' = 'true'
LIMIT 5;
```

Expected: rows returned (assuming chat activity exists). WARN if 0 rows (may just mean no chat messages sent yet — not a FAIL).

### Step 4: Find notification hub frontend query

```bash
grep -r "skip_history\|notifications" src/ --include="*.tsx" --include="*.ts" -l
```

Read the file(s) that fetch from the `notifications` table. Confirm the query includes a filter like:

```typescript
.not('metadata->skip_history', 'eq', 'true')
// or
.or('metadata->>skip_history.is.null,metadata->>skip_history.neq.true')
```

FAIL if no such filter — chat notifications would pollute the notification hub.

### Step 5: Probe — service chat messages do NOT trigger chat notification

```sql
SELECT prosrc FROM pg_proc
WHERE proname = 'notify_new_chat_message'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for how `v_chat_type` is used. Check whether `type = 'service'` is excluded from the notification loop. WARN if service chat messages also trigger `enqueue_chat_notification` (they should use `service_notify` instead — double notification risk).

### Step 6: Apply fix — if hub query missing skip_history filter

Find the notification hub query file and add the filter.

```typescript
// In wherever notifications are fetched:
.neq("metadata->>skip_history", "true")
// or use the filter approach:
.not("metadata", "cs", '{"skip_history":true}')
```

**Step 7: Commit**

```bash
git add src/path/to/notification-hub-query-file.tsx
git commit -m "fix: phase 7 — exclude skip_history chat notifications from hub"
```

---

## Task 8: Phase 8 — Service E2E Audit

**Files:**
- Read: `src/pages/ServiceChat.tsx`
- Read: `supabase/migrations/20260321183000_service_chat_e2e_fixes.sql` (already read)
- Read: `supabase/migrations/20260321130100_service_chat_notifications.sql` (already read)

### Step 1: Probe — confirm all 9 service RPCs exist

```sql
SELECT proname
FROM pg_proc
WHERE proname IN (
  'create_service_chat',
  'send_service_request',
  'withdraw_service_request',
  'send_service_quote',
  'withdraw_service_quote',
  'start_service_now',
  'mark_service_finished',
  'file_service_dispute',
  'submit_service_review',
  'refresh_service_chat_status',
  'can_request_service_from_provider',
  'service_notify'
)
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;
```

Expected: 12 rows. FAIL for any missing function.

### Step 2: Probe — confirm 183000 version of `mark_service_finished` is live (has payout columns)

```sql
SELECT prosrc FROM pg_proc
WHERE proname = 'mark_service_finished'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `payout_release_requested_at`.
- Found → PASS (183000 version is live).
- Not found → FAIL (130100 version is live — provider never gets payout notification, payout release never triggered).

### Step 3: Probe — `service_chats` payout lock columns exist

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'service_chats'
  AND column_name IN (
    'payout_release_requested_at',
    'payout_release_attempted_at',
    'payout_release_lock_token',
    'payout_release_locked_at'
  );
```

Expected: 4 rows. FAIL if any missing.

### Step 4: Probe — `pet_care_profiles` review rollup columns exist

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pet_care_profiles'
  AND column_name IN ('rating_avg', 'review_count');
```

Expected: 2 rows. FAIL if missing.

### Step 5: Probe — service crons are live

```sql
SELECT jobname, schedule
FROM cron.job
WHERE jobname IN ('service-booking-reminders-hourly', 'service-payout-releases');
```

Expected: 2 rows — `*/10 * * * *` and `*/2 * * * *`. FAIL if either missing.

### Step 6: Probe — `service_disputes` table exists

```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'service_disputes';
```

Expected: 1. FAIL if missing.

### Step 7: Code review — ServiceChat.tsx lifecycle state machine

Read `src/pages/ServiceChat.tsx`. Confirm:
- UI reflects all 6 statuses: `pending`, `booked`, `in_progress`, `completed`, `disputed`, `cancelled`.
- `create_service_chat` is called with `p_provider_id` only — requester identity comes from `auth.uid()` server-side.
- "Start Now" button calls `start_service_now`, not a direct status update.
- Dispute button only visible in `booked`, `in_progress`, or `completed` (within 48h) states.

FAIL if any state transition bypasses the RPC and does a direct table update.

### Step 8: Probe — `can_request_service_from_provider` exists and checks `listed = true`

```sql
SELECT prosrc FROM pg_proc
WHERE proname = 'can_request_service_from_provider'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

Grep for `listed`. FAIL if the guard doesn't check `pet_care_profiles.listed = true`.

### Step 9: Apply any FAIL fixes

For each FAIL:
1. Create a migration in `supabase/migrations/20260322120000_<description>.sql`.
2. Apply via MCP `apply_migration`.
3. Edit affected frontend file if needed.

### Step 10: Commit all service fixes

```bash
git add supabase/migrations/20260322120000_*.sql src/pages/ServiceChat.tsx
git commit -m "fix: phase 8 — service E2E — confirm 183000 live, fix any missing columns/guards"
```

---

## Task 9: Final Summary Probe

### Step 1: All crons registered

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'process-pet-reminders',
  'process-pet-birthdays',
  'process-verification-nudges',
  'process-subscription-expiring',
  'service-booking-reminders-hourly',
  'service-payout-releases'
)
ORDER BY jobname;
```

Expected: 6 rows, all `active = true`.

### Step 2: All triggers attached

```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN (
    'trg_broadcast_alert_report_notify',
    'trg_notify_new_chat_message',
    'trg_notify_profile_verified',
    'trg_notify_account_status',
    'trg_notify_no_stars',
    'trg_notify_provider_listed_on_service'
  )
ORDER BY trigger_name;
```

Expected: 6 rows.

### Step 3: Build check

```bash
npm run lint && npm run build
```

Expected: 0 errors, 0 lint warnings on changed files.

### Step 4: Final commit

```bash
git add -p
git commit -m "audit: notifications/match/service 8-phase audit complete — all probes PASS"
```

---

## Verdict Ledger

Fill this in as each task completes:

| Phase | SQL Probes | Code Review | Status | Fix Applied |
|---|---|---|---|---|
| Pre-flight DB Sync | — | — | — | — |
| 1 Notification Settings | — | — | — | — |
| 2 Discover / Match | — | — | — | — |
| 3 Social Aggregation | — | — | — | — |
| 4 Map Alerts | — | — | — | — |
| 5 Pet Crons | — | — | — | — |
| 6 Stripe / System | — | — | — | — |
| 7 Chat Push-Only | — | — | — | — |
| 8 Service E2E | — | — | — | — |
