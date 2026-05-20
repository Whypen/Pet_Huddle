# Native-First Launch Execution Breakdown

Status: Locked execution baseline
Date: 2026-04-19
Primary goal: ship iOS + Android launch scope without breaking the current Vercel web app

## Execution Rules

- Native first, web cleanup later.
- Do not break the current Vercel web app.
- Shared backend, auth, deletion, legal, and entitlement behavior must stay aligned.
- Native billing is an early hard-gate track.
- Public privacy / terms / support URL work starts in parallel now.
- Critical tracks must include mini verification gates before the next dependent track can start.
- Deferred pages must be hidden, not broken.
- Passkey stays hidden by default unless fully tested and production-safe.
- Google sign-in is removed from iOS native launch scope only. Web Google sign-in stays unchanged unless explicitly approved for removal later.
- Store screenshots, reviewer notes, and demo path must include launch-scope flows only.

## Locked Launch Scope

### Native launch scope

- Auth
  - Sign in with Apple on iOS
  - stable email/password if already supported
  - passkey hidden unless fully verified and user-enabled
- Core product
  - chats core
  - map/location flows already in native scope
  - settings/account/profile
  - notifications
  - Premium / Gold / add-ons with Apple IAP + Google Play Billing
  - allowed physical-service marketplace/payment flows
  - moderation basics: report, block, support, delete account
- Compliance
  - privacy
  - terms
  - support/contact
  - deletion/privacy consistency

### Deferred from native launch

- standalone Discover page
- AI Vet
- Hazard Scanner
- legacy signup email confirmation page
- legacy subscription page

### Web work allowed during native launch

- public privacy / terms / support URLs
- shared backend auth / billing / deletion parity
- privacy/legal consistency

## Deferred / Redundant Pages

These are out of native launch scope and must not block launch readiness:

- [src/pages/Discover.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/src/pages/Discover.tsx)
- [src/pages/AIVet.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/src/pages/AIVet.tsx)
- [src/pages/HazardScanner.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/src/pages/HazardScanner.tsx)
- [src/pages/Subscription.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/src/pages/Subscription.tsx)
- [src/pages/signup/SignupEmailConfirmation.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/src/pages/signup/SignupEmailConfirmation.tsx)

Rules:

- keep code if needed for history or future work
- do not expose in native navigation
- do not include in native QA scope
- do not include in screenshots, reviewer notes, or demo path
- do not let them block native launch

## Parallel Tracks

These start early and run alongside the main implementation phases:

- Organization enrollment / D-U-N-S / legal entity verification
- Public privacy / terms / support URL work
- Store asset production
- Push infrastructure setup
- Observability setup

## Hard Submission Gates

1. Apple Developer Organization enrollment complete
2. D-U-N-S validation complete
3. Legal entity alignment complete
4. Google Play organization verification complete
5. Final app identity approved
6. Final bundle/package naming approved
7. Final public support/privacy/terms URLs live
8. Sign in with Apple live on iOS
9. Native account deletion live and correct
10. Apple IAP + Google Play Billing live for digital entitlements
11. Push notifications live
12. Public legal/support content matches shipped native behavior
13. Deferred pages hidden from native launch scope
14. No placeholders remain in shipped builds
15. Observability is live before beta

## Mini Verification Gates

### Auth verification gate

- Sign in with Apple works on iOS
- email/password works if still in scope
- passkey hidden by default
- session restore works
- Google sign-in remains unchanged on web unless later explicitly approved for removal
- web unaffected otherwise unless explicitly changed

Current gate status:

- Sign in with Apple code started
- build-clean
- runtime-unproven
- Supabase Apple provider not yet enabled
- auth mini gate remains open
- explicitly deferred to return later

### Deletion verification gate

- native delete account works end to end
- backend canonical deletion path used
- retention/support messaging correct
- web unaffected except shared backend parity

### Billing verification gate

- native digital purchase works through store billing only
- RevenueCat-first path is implemented by default
- direct StoreKit / Play Billing is used only if a clear blocker appears
- no native external Stripe digital checkout remains
- entitlement sync works
- physical-service Stripe flows still valid
- web unaffected unless parity change was required

### Push verification gate

- token registration works
- push arrives on real device
- notification tap routing works
- no fake toggle-only surface remains

### Deep-link verification gate

- auth callbacks work
- reset/verify flows work
- notification links work
- supported launch pages resolve correctly
- deferred pages not required

## Current Native Stack Confirmation

Confirmed from the repo before implementation assumptions:

- Expo-managed app config exists at [mobile/app.json](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/app.json)
- Expo app package exists at [mobile/package.json](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/package.json)
- committed iOS native project exists under [mobile/ios](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/ios)
- committed Android native project exists under [mobile/android](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/android)
- `mobile/eas.json` exists for build-profile scaffolding only
- current native identity is placeholder and must not ship

## Phase-by-Phase Execution Breakdown

### Phase 0: Organization Enrollment and Launch Setup

Status: Start now
Type: Hard gate

#### Objective

Unblock the right to submit and establish launch ownership, legal identity, and support readiness.

#### Tasks

- Create Apple Developer Organization enrollment checklist
- Create D-U-N-S validation checklist
- Create legal entity alignment checklist
- Create org-domain email ownership checklist
- Create Google Play organization verification checklist
- Create launch gate tracker covering all hard submission gates
- Assign owners for engineering, legal/policy, support, and store ops
- Define support mailbox ownership and escalation path
- Start public privacy / terms / support URL workstream
- Start push setup planning workstream
- Start observability planning workstream

#### Inputs

- legal entity details
- D-U-N-S details
- org domain ownership
- support email decision

#### Outputs

- organization enrollment tracker
- hard-gate tracker
- owner map
- support/contact ownership definition
- kickoff for legal/support URL parallel track

#### Dependencies

- none

#### Verification

- trackers created
- owners assigned
- blocker list explicit

#### Start-Now Work

- open Apple org enrollment work item
- open Google Play org verification work item
- open D-U-N-S/legal entity work item
- open support mailbox/domain ownership work item

### Phase 1: Scope Lock and Native Isolation Strategy

Status: Start now
Type: Hard gate

#### Objective

Define exactly what native ships, what is deferred, and how native changes remain isolated from current web behavior.

#### Tasks

- freeze native launch scope list
- freeze deferred page list
- define native-only route exposure rules
- define native-only navigation gating rules
- define feature-flag/platform-gate rules where needed
- define web preservation rules
- define reviewer-safe native demo path
- define separate verification paths for web and native
- define shared-system verification boundaries

#### Inputs

- locked launch decisions
- current route tree
- deferred page list

#### Outputs

- native launch scope matrix
- deferred page matrix
- native gating strategy
- web preservation rules
- separate verification strategy

#### Dependencies

- Phase 0 kickoff only for ownership clarity

#### Verification

- native launch scope documented
- deferred pages documented
- web preservation rules documented
- reviewer path excludes deferred pages

#### Start-Now Work

- write scope matrix
- write deferred page matrix
- write native gating rules
- write web preservation rules

### Phase 2: Current-State Audit

Status: Start now
Type: Hard gate

#### Objective

Map the current repo and runtime behavior to the locked launch scope before implementation broadens.

#### Tasks

- confirm actual native stack / wrapper / build path in repo before assuming implementation details
- audit native auth paths
- audit native settings/account/deletion surface
- audit native premium flows
- audit native notifications surface
- audit native map/location/device features
- audit native moderation surface
- audit shared backend contracts:
  - auth/session
  - deletion
  - entitlements
  - legal/support
- audit web-only dependencies native must avoid:
  - Turnstile/browser-only checks
  - external Stripe digital checkout
- create feature disposition table:
  - ship
  - hide
  - defer
  - replace
- create native/web preservation matrix
- continue legal/support content inventory in parallel

#### Inputs

- current repo state
- locked launch plan
- current route tree
- mobile project config

#### Outputs

- audited feature matrix
- native stack/build-path confirmation
- shared backend contract map
- native/web preservation matrix
- legal/privacy/support content inventory

#### Dependencies

- Phase 1 scope/gating rules

#### Verification

- actual native stack confirmed from repo
- feature disposition table created
- backend shared-system boundaries documented
- web-only dependencies that must not leak into native identified

#### Start-Now Work

- confirm Expo + committed native projects + current build path
- audit current native auth/deletion/premium/push/map/moderation surface
- audit shared backend contracts
- create ship/hide/defer/replace table

### Phase 3: Native Identity and Release Configuration

Status: Can begin after audit
Type: Hard gate at submission

#### Objective

Make the native build/release structure real while keeping final identity values gated until branding is approved.

#### Tasks

- prepare app name / slug / scheme / bundle ID / Android package for final substitution
- add `eas.json`
- define versioning strategy
- define runtime/update policy
- define production signing path
- remove technical placeholders where possible
- continue public legal/support route scaffolding in parallel
- continue store asset prep in parallel

#### Dependencies

- Phase 2 audit

#### Verification

- production build path documented
- unresolved identity blockers explicit

### Phase 4: Native Route and Navigation Gating

Status: Depends on audit
Type: Hard gate

#### Objective

Ensure only launch-scope pages are exposed natively.

#### Tasks

- remove/hide deferred pages from native nav and entry points
- validate hidden features fail closed
- keep current web routes stable

#### Dependencies

- Phase 1 scope lock
- Phase 2 audit

### Phase 5: Auth and Session Implementation

Status: In progress; code started, build-clean, runtime-unproven, deferred to return later
Type: Hard gate

#### Objective

Make native auth launch-safe and iOS-compliant.

#### Tasks

- implement Sign in with Apple for iOS
- remove Google sign-in from iOS launch surface
- keep passkey hidden by default
- only expose passkey if enabled by user and fully verified safe
- verify login/logout/session restore/callback flows

#### Current status

- Sign in with Apple code path exists in native auth
- native builds are clean
- runtime proof is not complete
- Supabase Apple provider is not yet enabled
- passkey remains hidden and unchanged
- web remains untouched
- Apple Sign In runtime/provider closure is explicitly deferred to return later

#### Return-later checklist

- enable Apple provider in Supabase
- add/confirm Apple Sign In capability and config
- verify working JS runtime on iOS
- run first-sign-in runtime proof
- run repeat-sign-in runtime proof
- verify session creation and restore

#### Dependencies

- Phase 2 audit
- Phase 4 route gating

#### Mini verification gate

- Auth verification gate

### Phase 6: Account Deletion and Privacy Rights

Status: Depends on auth + audit
Type: Hard gate

#### Objective

Satisfy store deletion requirements correctly.

#### Tasks

- replace native profile-only deletion with canonical backend deletion
- add native Settings deletion UX
- add retention/support messaging
- verify success/expired-session/error cases

#### Dependencies

- Phase 2 audit
- Phase 5 auth

#### Mini verification gate

- Deletion verification gate

### Phase 7: Native Billing and Entitlements

Status: Early hard gate
Type: Hard gate

#### Objective

Implement store-compliant digital monetization early.

#### Tasks

- implement Apple IAP + Google Play Billing
- use RevenueCat-first as the default path
- use direct StoreKit / Play Billing only if a clear blocker appears
- remove native external Stripe checkout for digital goods
- preserve Stripe only for physical-service marketplace/payment flows
- implement entitlement sync between store billing and backend tiers

#### Dependencies

- Phase 2 audit
- Phase 5 auth where purchase identity ties to account

#### Mini verification gate

- Billing verification gate

### Phase 8: Native Trust / Anti-Abuse Model

Status: Hard gate for launch-sensitive native flows
Type: Hard gate

#### Objective

Remove native dependence on browser-only trust checks without turning this into a broad backend rewrite.

#### Tasks

- audit launch-scope native-sensitive endpoints only
- remove native reliance on browser-only CAPTCHA/Turnstile flows for those endpoints
- add native-safe trust model for those launch-scope critical flows only
- preserve web protections where possible
- do not allow this phase to expand into a broad backend rewrite before submission

#### Dependencies

- Phase 2 audit

### Phase 9: Push Notifications

Status: Hard gate
Type: Hard gate

#### Objective

Ship real push, not preference-only UI.

#### Tasks

- configure APNs and FCM
- register and persist native push tokens
- add launch-scope notification categories only
- add permission request UX and denied-state fallback
- add notification tap routing

#### Dependencies

- Phase 2 audit
- parallel push setup workstream

#### Mini verification gate

- Push verification gate

### Phase 10: Deep Links and App Links

Status: Hard gate
Type: Hard gate

#### Objective

Complete native entry flows without breaking current web routes.

#### Tasks

- add app scheme
- add iOS universal links
- add Android app links
- host required association files on web
- wire native handling for auth callbacks, reset flows, notifications, and supported launch pages only

#### Dependencies

- Phase 3 identity/build config
- Phase 5 auth
- public URL scaffolding

#### Mini verification gate

- Deep-link verification gate

### Phase 11: Permissions and Device Feature Scope

Status: Hard gate
Type: Hard gate

#### Objective

Keep permission surface limited to native launch scope only.

#### Tasks

- audit launch-scope permissions
- add real purpose strings
- remove unused permissions
- verify denied-state UX

#### Dependencies

- Phase 2 audit

### Phase 12: Public Legal / Support Surface

Status: In progress; /privacy and /terms are public, /support route added
Type: Hard gate

#### Objective

Create and align the minimal public web surface required for native submission.

#### Tasks

- publish public privacy / terms / support pages
- ensure public unauthenticated access on Vercel
- align content with shipped native behavior
- keep scope limited to native submission needs

#### Current status

- `/privacy` is public
- `/terms` is public
- `/support` route has been added as a public support URL
- support/legal surface still needs final URL/content review before submission

#### Dependencies

- parallel legal/support URL track
- shared auth/deletion/billing definitions

### Phase 13: Moderation and Safety Completeness

Status: Hard gate
Type: Hard gate

#### Objective

Make native UGC/social surface reviewer-safe.

#### Tasks

- confirm native report-user works
- confirm native block-user works
- confirm support escalation path works
- confirm community guidelines access where required

#### Dependencies

- Phase 2 audit

### Phase 14: Launch Surface Cleanup

Status: Hard gate
Type: Hard gate

#### Objective

Remove draft-grade native UX.

#### Tasks

- remove dead buttons and no-op CTAs
- hide incomplete passkey UI
- hide/remove incomplete premium/manage-subscription paths until ready
- ensure deferred pages are hidden, not reachable-broken
- remove debug-only user-facing artifacts

#### Dependencies

- route gating
- auth
- billing
- push

### Phase 15: Observability and Release Safety

Status: Starts early in parallel, hard gate before beta
Type: Hard gate before beta

#### Objective

Launch with visibility and diagnostics.

#### Tasks

- begin observability setup in parallel early
- add native crash reporting
- add diagnostics for auth, deletion, billing, push, map/location failures
- upload symbols/source maps
- create beta monitoring runbook

#### Dependencies

- parallel observability workstream

### Phase 16: Final Verification Paths

Status: Hard gate
Type: Hard gate

#### Objective

Keep web and native verification distinct and complete.

#### Tasks

- run web QA path on Vercel
- run native QA path on simulator, device, preview, beta, submission candidates
- run shared-system QA path for auth, deletion, privacy/legal, entitlements

### Phase 17: Store Metadata and Submission Package

Status: Hard gate
Type: Hard gate

#### Objective

Complete store package only when final identity is known.

#### Tasks

- finalize identity-dependent fields
- produce screenshots for launch-scope flows only
- ensure deferred pages do not appear in screenshots, reviewer notes, or demo path
- complete Apple Privacy Nutrition Labels
- complete Google Play Data Safety form
- write reviewer notes for launch-scope flows only

### Phase 18: Beta, Final QA, and Submission

Status: Hard gate
Type: Hard gate

#### Objective

Submit only when every gate is closed.

#### Tasks

- run internal beta
- validate all launch-scope flows on real devices
- keep deferred pages hidden throughout beta
- verify web remains stable
- close all hard gates
- submit iOS and Android builds

### Phase 19: Launch Monitoring

Status: Post-release hard follow-through
Type: Release monitoring gate

#### Objective

Actively monitor the first 24-72 hours after release.

#### Tasks

- monitor crash reporting and error rates
- monitor auth failures
- monitor deletion failures
- monitor purchase/entitlement sync failures
- monitor push/token failures
- monitor deep-link failures
- monitor support inbox and store review feedback
- triage launch-critical issues first
- keep deferred pages out of emergency scope unless they unexpectedly leak into launch behavior

## Start-Now Summary

Supporting execution artifacts:

- [Phase 0 Launch Blocker Tracker](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/docs/plans/2026-04-19-phase0-launch-blocker-tracker.md)
- [Phase 1 Native Scope Matrix](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/docs/plans/2026-04-19-phase1-native-scope-matrix.md)
- [Phase 2 Current-State Audit](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/docs/plans/2026-04-19-phase2-current-state-audit.md)
- [Phase 3 Native Identity and Build Config](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/docs/plans/2026-04-19-phase3-native-identity-build-config.md)
- [Phase 4 Native Route Gating](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/docs/plans/2026-04-19-phase4-native-route-gating.md)

### Phase 0 active now

- Apple org enrollment tracker
- Google Play organization verification tracker
- D-U-N-S / legal entity tracker
- org-domain email ownership tracker
- hard-gate tracker

### Phase 1 active now

- native launch scope matrix
- deferred page matrix
- native route gating rules
- web preservation rules
- separate web vs native verification rules

### Phase 2 active now

- native stack/build-path confirmation
- audit native auth/deletion/premium/push/map/moderation surface
- audit shared backend contracts
- create ship/hide/defer/replace matrix
- identify web-only dependencies native must avoid

## Working Board: Phase 0-2

This section is the immediate execution board for the first three phases.

### Phase 0 Working Board

Owner group: Store ops + legal/policy + engineering
Status: In progress

- [ ] Create Apple Developer Organization enrollment tracker
- [ ] Create Google Play organization verification tracker
- [ ] Create D-U-N-S validation tracker
- [ ] Create legal entity alignment checklist
- [ ] Create org-domain email ownership checklist
- [ ] Confirm support mailbox owner
- [ ] Confirm support escalation owner
- [ ] Create hard-gate tracker with all submission gates
- [ ] Record unresolved final identity fields as explicit blockers

### Phase 1 Working Board

Owner group: Product + engineering
Status: In progress

- [ ] Write native launch-scope matrix
- [ ] Write deferred-page matrix
- [ ] Write native route exposure rules
- [ ] Write native navigation gating rules
- [ ] Write web preservation rules
- [ ] Write separate web verification path
- [ ] Write separate native verification path
- [ ] Write shared-system verification path
- [ ] Write reviewer-safe native demo path limited to launch-scope flows

### Phase 2 Working Board

Owner group: Engineering
Status: In progress

- [ ] Confirm actual native stack/build path from repo artifacts
- [ ] Audit native auth surface
- [ ] Audit native account/settings/deletion surface
- [ ] Audit native premium/add-on/payment surface
- [ ] Audit native push surface
- [ ] Audit native deep-link surface
- [ ] Audit native map/location/device-permission surface
- [ ] Audit native moderation/report/block surface
- [ ] Audit shared backend contracts for auth/deletion/entitlements/legal
- [ ] Audit web-only dependencies native must avoid
- [ ] Create ship/hide/defer/replace matrix
- [ ] Create native/web preservation matrix
- [ ] Create legal/privacy/support content inventory

### Phase 0-2 Exit Conditions

Do not start Phase 3 implementation work until:

- Phase 0 trackers exist and owners are assigned
- Phase 1 scope/gating rules are written
- Phase 2 native stack confirmation and audit matrix are complete

## Critical Path

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Auth mini gate
8. Phase 6
9. Deletion mini gate
10. Phase 7
11. Billing mini gate
12. Phase 8
13. Phase 9
14. Push mini gate
15. Phase 10
16. Deep-link mini gate
17. Phase 11
18. Phase 12
19. Phase 13
20. Phase 14
21. Phase 15
22. Phase 16
23. Phase 17
24. Phase 18
25. Phase 19
