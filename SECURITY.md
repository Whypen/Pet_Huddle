# SECURITY.md — huddle Security Guide
**FINAL EDITION — LOCKED**
**Audience:** Engineers, auditors, incident responders
**Purpose:** Mandatory controls, verification steps, and response runbooks for secure-by-default operation.

## Traceability
- Master map: `TRACEABILITY_MAP.md`
- Primary spec links:
  - `APP_MASTER_SPEC.md#4-data-model-canonical-contracts`
  - `APP_MASTER_SPEC.md#7-security--vulnerability-mitigation-zero-tolerance`
  - `APP_MASTER_SPEC.md#9-accessibility-a11y-standards`
  - `APP_MASTER_SPEC.md#11-cicd--deployment`

## 1. Threat Model
### 1.1 Primary Assets
- Identity and profile PII
- Chat content and metadata
- Location/map alerts
- Payment and subscription state
- Verification documents

### 1.2 High-Risk Surfaces
- Auth/session management
- RLS policy gaps
- Stripe webhook replay/tampering
- Admin review actions
- Storage bucket leakage

## 2. Mandatory Security Controls
1. Server-side validation for all booking/add-on amounts.
2. Webhook idempotency via unique `stripe_event_id` in `transactions`.
3. RLS enforced on all user-facing tables.
4. Chat policies restricted to room membership.
5. Service-role key used only in trusted server contexts.
6. Protected monetization fields blocked from client mutation.
7. Verification self-claim blocked; admin approval required.
8. Geolocation sanity checks (reject spoofed/low quality coordinates).
9. Input validation + sanitization (XSS/abuse prevention).
10. Secret hygiene (no server secrets in client bundle).

## 3. Application Security Baselines
- CSRF protections on sensitive mutations.
- CSP in production.
- Rate limits for abuse-prone endpoints (hazard scans/auth attempts).
- Dependency scanning (`npm audit`) in CI.
- Secure defaults for storage and signed URL usage on sensitive documents.

## 4. Logging, Monitoring, and Alerting
- Sentry for FE and function-level exception tracking.
- Structured function logs with correlation IDs.
- Alerts for webhook failures, auth spikes, unusual charge patterns.
- Admin action audit logging for verification decisions.

## 5. Security Testing Requirements
- RLS allow/deny tests for each sensitive table.
- Webhook replay test proves duplicate-event no-op.
- AuthZ tests for admin-only routes/APIs.
- Secret scanning on PR and main.

## 6. Incident Response
1. Detect and classify severity.
2. Contain affected surface (disable endpoint/feature flag).
3. Eradicate root cause with audited patch.
4. Recover and validate all gates.
5. Publish postmortem with preventive actions.

## 7. Compliance and Data Governance
- Data minimization for PII.
- Defined retention/deletion policy.
- Legal links and disclosures must remain accessible.

---
## Legacy Logs (Preserved)
The full previous SECURITY content is preserved below unchanged:

# SECURITY — huddle

## 1. Scope
Security controls for frontend, Supabase backend, Stripe integrations, storage, and operational workflows.

## 2. Threat Model Summary
- Assets: user identity, chats, location data, payment state, verification artifacts.
- Actors: authenticated users, malicious users, token thieves, webhook spoofers.
- High-risk surfaces: auth/session handling, RLS gaps, webhook processing, admin actions.

## 3. Core Security Controls
### 3.1 Auth
- Use Supabase Auth only.
- Email auth uses password flow.
- Enforce required identity fields and validation.
- Verified users have immutable identity fields (legal name, display name, phone).

### 3.2 Authorization (RLS)
- RLS enabled for all user tables.
- Chat reads/writes limited to room members.
- Admin endpoints/pages role-gated.
- Service role key used only server-side.

### 3.3 Payments & Webhooks
- All amount calculations server-side.
- Stripe event idempotency enforced via unique `stripe_event_id` in `transactions`.
- Duplicate events return success without reapplying side effects.
- Store audit metadata for every payment mutation.

### 3.4 Monetization Field Protection
- Trigger/policies block client-side updates to protected fields:
  - `tier`, `stars_count`, `mesh_alert_count`, `media_credits`, `family_slots`, verification flags.

### 3.5 Input Validation
- Validate all edge function payloads using strict schemas.
- Sanitize and length-limit user-generated text.
- Reject malformed geolocation and booking payloads.

### 3.6 Storage Security
- Bucket policies by owner/admin role.
- Verification docs not publicly listable.
- Signed URLs for sensitive retrieval.

### 3.7 Secrets Management
- Never expose server secrets in frontend bundle.
- Rotate compromised keys immediately.
- Keep secrets in environment vault or Supabase secrets.

## 4. AppSec Baselines
- CSRF protections for form mutations.
- XSS-safe rendering (no unsafe HTML without sanitization).
- Content Security Policy for production.
- Rate limiting for hazard scans and abuse-prone endpoints.
- Anti-automation controls on auth and contact flows.

## 5. Logging & Monitoring
- Sentry for frontend and function exceptions.
- Structured logs for edge functions with request correlation IDs.
- Alerting for auth spikes, webhook failures, abnormal charge activity.

## 6. Incident Response
1. Detect and classify severity.
2. Contain (disable feature/endpoint if needed).
3. Eradicate root cause.
4. Recover safely with verification checks.
5. Publish postmortem with action items.

## 7. Security Testing Requirements
- Static checks for secret leaks and unsafe patterns.
- RLS policy tests (allow + deny cases).
- Webhook replay tests for idempotency.
- Authorization tests for admin-only paths.

## 8. Compliance Notes
- Minimize retained PII.
- Document data retention and deletion process.
- Ensure legal pages are accessible and linked in auth/settings.
