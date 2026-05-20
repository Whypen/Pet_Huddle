# Phase 3 Native Identity and Build Config

Status: Started, not identity-hardened yet
Date: 2026-04-19
Scope: non-blocked native build scaffolding only

Current constraint: identity drift is partially hardened, but Phase 3 is still not final because production branding, public URLs, and signing/release metadata are not fully locked.

## What started in repo

- Added `mobile/eas.json` with `development`, `preview`, and `production` profiles.
- Locked `appVersionSource` to remote and `production.autoIncrement` so release numbering can be managed without broad local regeneration.
- Replaced placeholder Expo/native identity values with the repo's stronger current launch-candidate identity:
  - app name `Huddle`
  - slug `huddle`
  - scheme `huddle`
  - bundle/package `com.whypen.huddle`
  - native display label `Huddle`

## Intentionally not done yet

- Final app name
- Final slug
- Final bundle identifier
- Final Android package name
- Final URL scheme
- Final public support/privacy/terms URLs

These remain hard submission gates and should not be guessed before brand/identity approval.

## Follow-on Phase 3 work

1. Finalize production identity values.
2. Patch `mobile/app.json` with final name, slug, scheme, bundle/package, and versioning metadata.
3. Add iOS/Android release metadata once final identity is approved.
4. Validate `eas build --profile preview` after identity fields are finalized.
