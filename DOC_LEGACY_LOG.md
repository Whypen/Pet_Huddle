# DOC_LEGACY_LOG

This file preserves founder-provided draft logs and prior documentation snippets exactly for traceability.

## Founder Draft — RUNBOOK.md (excerpt)
- FINAL EDITION – LOCKED
- Setup, local dev, deployment (Vercel/Netlify), monitoring (Sentry), recovery, and scale notes.
- Commands include: `npm ci`, `supabase db push`, `supabase functions deploy --all`, `npm run purge-db`, `stripe listen --forward-to ...`

## Founder Draft — SECURITY.md (excerpt)
- FINAL EDITION – LOCKED
- Threat model and kill list: amount tampering, webhook idempotency, chat privacy, RLS bypass, map spoofing, vouch abuse, CSRF/XSS, logging.

## Founder Draft — TEST_PLAN.md (excerpt)
- FINAL EDITION – LOCKED
- Mandatory test matrix: auth, onboarding, pets, social/chat, bookings, upsells, family invites, AI vet, map, verification, offline, mobile/PWA.

## Founder Draft — BRANCH_PROTECTION.md (excerpt)
- FINAL EDITION – LOCKED
- Main branch protections and required CI checks.

## Founder Draft — CI snippet (preserved intent)
- Workflow name: `CI`
- Triggers on PR/main push
- Includes install/typecheck/lint/test/build/e2e, migration sanity check, localhost hardcode guard.

## Note
The fully integrated and expanded versions are now the canonical docs:
- `RUNBOOK.md`
- `SECURITY.md`
- `TEST_PLAN.md`
- `BRANCH_PROTECTION.md`
- `.github/workflows/ci.yml`
