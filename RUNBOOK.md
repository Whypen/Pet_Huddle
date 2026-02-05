# RUNBOOK.md — huddle Operations Guide
**FINAL EDITION — LOCKED**
**Audience:** DevOps + new full-stack developers
**Purpose:** End-to-end operating playbook for setup, migration sync, deploy, monitoring, incident response, and rollback.

## Traceability
- Master map: `TRACEABILITY_MAP.md`
- Primary spec links:
  - `APP_MASTER_SPEC.md#3-environment--connectivity`
  - `APP_MASTER_SPEC.md#11-cicd--deployment`
  - `APP_MASTER_SPEC.md#12-operations--maintenance`
  - `APP_MASTER_SPEC.md#13-release-verification-gate-all-yes-required`

## 1. Quick Start (Day-1)
1. `git clone https://github.com/Whypen/Pet_Huddle.git`
2. `cd Pet_Huddle`
3. `npm ci`
4. Create `.env` from template and fill required vars.
5. `npm run dev -- --host`
6. Validate with `npm run build`

## 2. Environment Baseline
### 2.1 Required Frontend Vars
- `VITE_API_URL`
- `VITE_WS_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`

### 2.2 Required Backend/Function Vars
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `FCM_SERVER_KEY`

### 2.3 Rules
- No hardcoded localhost API/WS in `src/`.
- Missing env must degrade gracefully (warn + fail-safe UX).
- Environment profiles:
  - `.env.local`: `ALLOW_STRIPE_FALLBACK=true`, `ALLOW_WEBHOOK_TEST_BYPASS=true` (local testing only).
  - `.env.production`: both flags must be `false` or unset.
  - Never deploy with bypass flags enabled.

## 3. Supabase Operations
1. Install CLI (example macOS): `brew install supabase/tap/supabase`
2. Authenticate: `supabase login`
3. Link project: `supabase link --project-ref <project-ref>`
4. Push migrations: `npx supabase db push --linked`
5. Deploy functions:
   - `npx supabase functions deploy create-checkout-session --project-ref <ref>`
   - `npx supabase functions deploy create-portal-session --project-ref <ref>`
   - `npx supabase functions deploy create-connect-account --project-ref <ref>`
   - `npx supabase functions deploy create-marketplace-booking --project-ref <ref>`
   - `npx supabase functions deploy stripe-webhook --project-ref <ref>`
   - `npx supabase functions deploy hazard-scan --project-ref <ref>`
   - `npx supabase functions deploy mesh-alert --project-ref <ref>`
6. Sync secrets: `npx supabase secrets set --env-file Backend.env.md --project-ref <ref>`
7. Verify:
   - `npx supabase migration list --linked`
   - `npx supabase functions list --project-ref <ref>`
   - `npx supabase secrets list --project-ref <ref>`

## 4. Local QA + UAT Commands
- Dev server: `npm run dev -- --host`
- Build: `npm run build`
- Unit/integration: `npm run test --if-present`
- E2E: `npm run test:e2e --if-present`
- Purge test records: `node scripts/cleanup-users.mjs --dry-run` then `node scripts/cleanup-users.mjs`

## 5. Deployment (Vercel / Netlify)
### 5.1 Vercel
- Build command: `npm run build`
- Output dir: `dist`
- Add all required env vars in project settings.

### 5.2 Netlify
- Build command: `npm run build`
- Publish dir: `dist`
- Add env vars for each environment.

## 6. Monitoring and Alerting
- Sentry for frontend + edge function exceptions.
- Supabase function logs for runtime failures.
- Stripe webhook dashboard + CLI (`stripe listen --forward-to <webhook-url>`) for integration diagnostics.
- Core web vitals monitored in release review.

## 7. Incident Response
### 7.1 Severity
- SEV-1: payments/auth/data exposure
- SEV-2: core feature outage
- SEV-3: non-critical regressions

### 7.2 First 15 Minutes
1. Freeze deploy.
2. Identify affected flows/users.
3. Inspect Sentry + Supabase logs + Stripe events.
4. Mitigate via rollback or feature flag.
5. Communicate status/ETA.

## 8. Rollback
1. Revert to last stable commit/tag.
2. Re-deploy frontend.
3. Re-deploy prior edge function versions.
4. Apply forward-fix migration if schema issue caused outage.
5. Re-run smoke tests.

## 9. Release Gate
All must pass before production:
- Build/typecheck/lint/tests (where scripts exist)
- Migration sanity + localhost hardcode scan
- UAT persona pass (free/premium/gold/admin)
- Security checks (RLS/idempotency/protected fields)

## 10. Ownership and Change Control
- Founder approval required for production deploy/rollback.
- Any operational change must update `SPEC_CHANGELOG.md`.

---
## Legacy Logs (Preserved)
The full previous RUNBOOK content is preserved below unchanged:

# RUNBOOK — huddle

## 1. Purpose
Operational guide for local development, staging checks, production readiness, incident response, and rollback.

## 2. Environments
- Local: Vite frontend + Supabase Cloud backend.
- Preview: PR-based deployment environment.
- Production: main branch protected deploy.

## 3. Required Secrets
- Frontend: `VITE_API_URL`, `VITE_WS_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MAPBOX_TOKEN`.
- Backend: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `FCM_SERVER_KEY`.

## 4. Local Startup
1. Install deps: `npm install`
2. Start app: `npm run dev`
3. Build validation: `npm run build`
4. Optional tests: `npm test`

## 5. DB + Edge Sync
1. Apply migrations: `npx supabase db push --linked`
2. Deploy functions:
   - `npx supabase functions deploy create-checkout-session --project-ref <ref>`
   - `npx supabase functions deploy create-portal-session --project-ref <ref>`
   - `npx supabase functions deploy create-connect-account --project-ref <ref>`
   - `npx supabase functions deploy create-marketplace-booking --project-ref <ref>`
   - `npx supabase functions deploy stripe-webhook --project-ref <ref>`
   - `npx supabase functions deploy hazard-scan --project-ref <ref>`
   - `npx supabase functions deploy mesh-alert --project-ref <ref>`
3. Set secrets: `npx supabase secrets set --env-file Backend.env.md --project-ref <ref>`
4. Verify:
   - `npx supabase migration list --linked`
   - `npx supabase functions list --project-ref <ref>`

## 6. Release Checklist (Mandatory)
- Build passes with zero TypeScript errors.
- No hardcoded localhost API/WS strings in `src/`.
- Critical routes load and are guarded correctly.
- Monetization triggers and protected fields verified.
- Webhook idempotency verified by duplicate event simulation.
- Chat RLS outsider-deny check passes.
- Mobile layout check at <=430px passes.
- i18n audit passes for user-facing strings.

## 7. Incident Response
### 7.1 Severity Levels
- SEV-1: payments, auth, or data exposure outage.
- SEV-2: major feature degradation (chat/map/booking unavailable).
- SEV-3: partial UX issues or non-critical failures.

### 7.2 First 15 Minutes
1. Freeze deploys.
2. Confirm scope and blast radius.
3. Check logs (frontend Sentry, Supabase function logs, DB errors).
4. Apply mitigation (feature flag or rollback).
5. Post status update with ETA.

## 8. Rollback Procedure
1. Revert to last known good git tag/commit.
2. Re-deploy frontend.
3. Re-deploy previous function versions.
4. If migration caused breakage, apply forward-fix migration (do not drop data blindly).
5. Re-run smoke checks.

## 9. Data Purge (Test Reset)
- Dry run first: `node scripts/cleanup-users.mjs --dry-run`
- Execute: `node scripts/cleanup-users.mjs`
- Preserve storage buckets unless explicitly approved.

## 10. Ownership
- Founder approval required for production deploy and rollback.
- Any spec-impacting changes must update `SPEC_CHANGELOG.md`.
