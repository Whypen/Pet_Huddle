# TEST_PLAN.md — huddle Test Plan
**FINAL EDITION — LOCKED**
**Audience:** QA, devs, release managers
**Purpose:** Define release-blocking tests with required evidence for all critical flows.

## Traceability
- Master map: `TRACEABILITY_MAP.md`
- Primary spec links:
  - `APP_MASTER_SPEC.md#5-feature-requirements-end-to-end`
  - `APP_MASTER_SPEC.md#8-performance-requirements`
  - `APP_MASTER_SPEC.md#9-accessibility-a11y-standards`
  - `APP_MASTER_SPEC.md#10-testing-strategy`
  - `APP_MASTER_SPEC.md#13-release-verification-gate-all-yes-required`

## 1. Test Strategy
- Unit tests: hooks, reducers/state logic, validators.
- Integration tests: API hooks, context interactions, DB-wired flows.
- E2E tests: real user journeys across personas.
- Non-functional: accessibility, mobile responsiveness, performance, PWA behavior.

## 2. Tooling
- Unit/Integration: Vitest/Jest + Testing Library.
- E2E: Playwright/Cypress.
- Optional device cloud: BrowserStack for iOS/Android verification.

## 3. Persona Matrix
- User A: Free tier new user.
- User B: Premium user.
- User C: Gold verified user.
- User D: Sitter.
- User E: Matched social user.
- User F: Admin reviewer.

## 4. Mandatory Functional Scenarios
1. Auth/signup required fields and localized error handling.
2. Onboarding step gating with required identity info.
3. Pet add/edit parity and breed dependency logic.
4. Social card expansion + match popup + chat handoff.
5. Chat realtime delivery + outsider RLS deny proof.
6. Booking modal completeness + checkout initiation + webhook fulfillment.
7. Upsell trigger matrix (stars/alerts/media/family) + counter sync.
8. Family invite behavior by tier/slot rules.
9. AI Vet prompt context includes current pet profile.
10. Hazard scan free limit enforcement (3/24h).
11. Map pin rules, geolocation constraints, mesh alerts.
12. Verification flow (upload -> pending -> admin approve/deny -> field lock).
13. Offline queue replay on reconnect.
14. Mobile <=430px pass and PWA installability checks.

## 5. Non-Functional Requirements
- Accessibility: WCAG 2.2 AA checks and keyboard navigation.
- Performance: route load budgets, list virtualization, no major jank.
- Reliability: retry behavior and graceful failure states.

## 6. CI Gates
- Build must pass.
- Typecheck/lint/tests run if scripts exist.
- Migration filename sanity check must pass.
- No hardcoded localhost API/WS in `src/`.

## 7. Evidence Requirements
- CI logs
- Screenshots/videos for critical E2E paths
- DB evidence for state transitions (bookings, verification, counters)
- Release gate YES/NO checklist with exact proof references

## 8. Exit Criteria
Release approval requires all critical scenarios passing with evidence and no unresolved security blockers.

---
## Legacy Logs (Preserved)
The full previous TEST_PLAN content is preserved below unchanged:

# TEST_PLAN — huddle

## 1. Objective
Define required test coverage to certify release readiness against `APP_MASTER_SPEC.md`.

## 2. Test Levels
- Unit: hooks, utils, validators, trigger logic.
- Integration: auth/profile/chat/booking/webhook/data sync.
- E2E: complete user journeys per persona.

## 3. Tooling
- Unit/Integration: Vitest/Jest + Testing Library.
- E2E: Playwright/Cypress.
- API checks: scripted edge function tests.
- DB checks: SQL assertions for schema and policy behavior.

## 4. Persona UAT Matrix
- User A: Free new user.
- User B: Premium user.
- User C: Gold verified user.
- User D: Sitter.
- User E: Matched social user.
- User F: Admin reviewer.

## 5. Critical Test Scenarios
### 5.1 Auth & Onboarding
- Signup missing required fields -> blocked with localized error.
- Email login with valid credentials -> success.
- Invalid login -> localized invalid credentials error.

### 5.2 Profile & Pet
- Add pet, edit pet, view pet -> DB persistence verified.
- Breed dependency logic: Cat list shown; Other hides breed.
- Verified user cannot edit locked identity fields.

### 5.3 Social & Chat
- Card expand works.
- Match popup appears and routes to chat.
- Send message realtime appears in partner session.
- Outsider user denied by RLS.

### 5.4 Marketplace
- Booking modal fields complete.
- Checkout session creation succeeds.
- Stripe webhook event updates booking and transactions.
- Duplicate webhook event has no duplicate side effects.
- Dispute blocks escrow release.

### 5.5 Monetization & Upsells
- stars_count, mesh_alert_count, media_credits, family slot conditions trigger correct upsell UX.
- Purchase fulfillment updates counters/tier and UI syncs.

### 5.6 AI Vet & Hazard
- AI prompt contains pet context fields.
- Hazard scan rate limit enforced at 3/24h for free tier.

### 5.7 Map & Alerts
- Pin colors/types match spec.
- Bad geolocation accuracy rejected.
- Mesh alerts logged and delivered (or gracefully degraded if keys missing).

### 5.8 Admin
- Verification queue loads pending records.
- Approve/reject updates status and stores admin comment.
- Audit trail records actions.

## 6. Non-Functional Testing
- Performance: route load budgets, large list behavior, no UI jank on mobile.
- Accessibility: keyboard nav, focus handling, ARIA, contrast, screen-reader checks.
- PWA: installability, offline shell behavior, queue replay on reconnect.

## 7. Regression Gate (Must Pass)
1. Build/typecheck pass.
2. Unit + integration pass.
3. E2E critical journeys pass.
4. Security checks pass (RLS/webhook/idempotency/protected fields).
5. Mobile <=430px smoke pass.

## 8. Evidence Artifacts
- CI logs and test reports.
- Screenshots/videos for key E2E passes.
- DB query evidence for policy and webhook state transitions.
- Release checklist with explicit YES/NO per gate item.

## 9. Exit Criteria
Release is approved only when all critical and high-priority scenarios pass with evidence and no unresolved security blocker.
