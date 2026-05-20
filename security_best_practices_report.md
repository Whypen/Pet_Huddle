# Security Best Practices Report
Date: 2026-03-11
Scope: Supabase + React/TypeScript app security posture, with focus on secret exposure, websocket auth handling, RLS/policies, storage, migrations, and operational checks.

## Executive Summary
- Critical exposure paths reported by Supabase were remediated in local code/schema:
  - Secret `.env` files under `supabase/functions/**` removed.
  - WebSocket query-parameter token usage removed.
  - RLS enabled on previously unprotected queue tables.
  - Missing policies backfilled on key RLS-enabled tables.
- Remaining high-priority posture item: many `SECURITY DEFINER` functions are executable by `anon` and need explicit allowlist hardening to minimize attack surface.
- Migration state is currently in sync locally.

## Critical Findings

### [SEC-001] Secrets committed in repo tree (Fixed)
- Severity: Critical
- Location:
  - `supabase/functions/.env` (deleted)
  - `supabase/functions/ai-vet/.env` (deleted)
  - `supabase/functions/create-checkout-session/.env` (deleted)
  - `supabase/functions/stripe-webhook/.env` (deleted)
  - `.gitignore` (function env ignore rules)
- Evidence:
  - Function env files existed and were removed.
  - `.gitignore` now blocks:
    - `supabase/functions/**/.env`
    - `supabase/functions/**/.env.*`
- Impact:
  - Leaked service keys and third-party secrets can allow unauthorized data access and account abuse.
- Fix:
  - Deleted function env files.
  - Enforced ignore rules.
  - Added `.env.example` template for non-secret defaults.

### [SEC-002] Access token exposed in WebSocket URL (Fixed)
- Severity: Critical
- Location: `src/hooks/useWebSocket.ts:56`
- Evidence:
  - WebSocket connection now uses `new WebSocket(wsUrl)` with no token in query.
  - Token is sent after open in auth message payload.
- Impact:
  - Query-string tokens can leak via logs/proxies/history.
- Fix:
  - Removed `?token=...` usage.
  - Shifted to post-connect auth message.

## High Findings

### [SEC-003] Public queue tables lacked RLS (Fixed)
- Severity: High
- Location:
  - `public.identity_verification_cleanup_queue`
  - `public.map_alert_notification_queue`
  - Migration: `supabase/migrations/20260311190000_security_rls_backfill.sql`
- Evidence:
  - Prior audit showed `relrowsecurity = false`.
  - Current state shows `rls_enabled = true`, policy count > 0.
- Impact:
  - Internal queue metadata could be exposed if grants/policies drift.
- Fix:
  - Enabled RLS.
  - Revoked anon/authenticated table grants.
  - Added explicit deny-all policies for authenticated.

### [SEC-004] RLS enabled but policyless tables (Fixed for listed set)
- Severity: High
- Location: same migration as above.
- Tables covered:
  - `ai_vet_usage`, `location_reviews`, `map_checkins`, `match_preferences`, `message_reads`,
    `payments`, `push_tokens`, `social_interactions`, `typing_indicators`,
    `verification_audit_log`, `verification_requests`
- Evidence:
  - Previously policy count was `0`.
  - Current policy counts are non-zero for each covered table.
- Impact:
  - Policyless RLS can produce broken behavior and unclear access guarantees.
- Fix:
  - Added scoped user policies (`user_id/reviewer_id/target_id` constraints via `auth.uid()`).
  - Added explicit deny policy for `verification_audit_log`.
  - Added supporting policy-column indexes.

## Medium Findings

### [SEC-005] SECURITY DEFINER functions executable by `anon` (Open)
- Severity: Medium-High
- Location: database functions in `public` schema (see `npm run audit:security` output).
- Evidence:
  - Baseline audit still reports many `public.*` security-definer functions executable by `anon`.
- Impact:
  - Increases attack surface for privileged logic; function-internal checks must be perfect.
- Recommended fix:
  - Introduce explicit execute-grant allowlist:
    - Revoke `EXECUTE` from `anon` globally for `SECURITY DEFINER` functions.
    - Re-grant only for intentionally public RPCs.
  - Perform staged rollout with compatibility testing to avoid breaking pre-auth flows.

### [SEC-006] Realtime transport pattern still uses `postgres_changes` (Open)
- Severity: Medium
- Location:
  - `src/pages/ChatDialogue.tsx:403`
  - `src/pages/Map.tsx:1038`
  - `src/pages/Chats.tsx:2092`
  - `src/components/layout/BottomNav.tsx:151`
  - `src/components/layout/GlobalHeader.tsx:180`
- Evidence:
  - Client subscriptions currently use `postgres_changes`.
- Impact:
  - Broader event surface and less explicit channel security posture vs private broadcast setup.
- Recommended fix:
  - Move high-sensitivity realtime flows to private channels + `broadcast_changes` triggers.

## Informational

### [SEC-007] Storage security review snapshot
- Buckets:
  - Public: `alerts`, `avatars`, `notices`, `pets`
  - Private: `chat_attachments`, `identity_verification`, `social_album`, `verification`
- Notes:
  - Current policies on private buckets are path/owner constrained.
  - Public buckets are intentionally world-readable by policy.

### [SEC-008] Migration status
- `supabase migration list --local` reports Local == Remote for all applied migrations including:
  - `20260311061000_enqueue_notification_allow_chats_href`
  - `20260311190000_security_rls_backfill`

## Verification Commands
- `npm run audit:security`
- `npx supabase migration list --local`
- `npx supabase db push --local`
- `npm run build`

## Remaining Mandatory Ops Actions (outside app code)
1. Rotate any previously exposed keys (Supabase service role, Stripe, Gemini, etc.).
2. Set runtime secrets via secret manager / `supabase secrets set ...`.
3. Confirm production envs no longer use checked-in plaintext key files.
