# Huddle Growth Agent — codebase audit and implementation plan

Date: 2026-07-28

## Executive result

Huddle is a Vite/React web application backed by Supabase (Postgres, Auth,
Storage, Realtime, and Edge Functions), with a separate Expo/React Native app
under `app/`. The web application already has the correct primitives for this
product: authenticated sessions, an admin role, security-definer admin RPCs,
an audit-log pattern, Edge Functions for server-side integrations, and Vercel
SPA routing. There is no existing business social-account connector or Meta
execution layer. The Growth Agent therefore belongs in the existing Supabase
server boundary and the existing `/admin` surface; it must not be implemented
as a user-facing social-account feature.

This first build phase adds the production control plane and a real Meta API
execution boundary. It is deliberately fail-closed until Huddle supplies the
Meta app secret, encryption key, redirect URLs, and a user-authorised token with
the permissions Meta actually grants. The granted scopes are stored and checked
at runtime; requested permissions are never treated as approved permissions.

## Existing architecture

### Frontend

- Vite + React 18 + TypeScript + React Router 6.
- Shared design system in `src/components/ui`, Tailwind tokens, and the global
  Huddle gradient/noise canvas in `AppBackground`.
- `src/App.tsx` mounts `AuthProvider`, routing, error boundaries, and toasters.
- `src/routes/FullAppRoutes.tsx` wraps authenticated screens in `ProtectedRoute`
  and `AppShell`; `/admin`, `/admin/safety`, and `/admin/support` are existing
  protected routes.
- `src/pages/Admin.tsx` uses `profile.is_admin === true` or
  `profile.user_role === 'admin'` as the UI gate. The server remains the
  authority.
- `src/integrations/supabase/client.ts` exposes the publishable client key only.
- `src/lib/invokeAuthedFunction.ts` resolves and refreshes the current user JWT
  before calling protected Edge Functions.

### Authentication and authorization

- Supabase Auth sessions are persisted and auto-refreshed in the browser.
- The profile row is hydrated by `AuthContext`; the existing admin convention is
  `is_admin` or `user_role = 'admin'`.
- Existing admin SQL uses security-definer functions with an explicit admin
  helper and revokes direct table access. The Growth Agent follows that model.
- No ordinary Huddle user personal social connection is added. Every Growth
  Agent operation is admin-only and scoped to Huddle-owned business assets.

### Backend and data

- Supabase has approximately 890 migrations, extensive RLS, and 60+ Edge
  Functions under `supabase/functions`.
- Existing functions use Deno, `@supabase/supabase-js`, explicit CORS, service
  role clients, request JWT validation, idempotent writes, retry/error handling,
  and server-side third-party secrets.
- Existing `admin_audit_logs`, `admin_cases`, and CARE operations provide the
  audit and high-risk workflow precedent. Growth Agent data uses dedicated
  tables so social data never mixes with ordinary-user records.
- `pg_cron` is already used by migrations when available. The Growth Agent
  queues work in Postgres and exposes a service-role scheduler/worker action;
  hosted scheduling can invoke that function without putting secrets in the
  browser.

### Deployment and environment

- Web deploys through Vercel (`vercel.json`) with SPA rewrites for `/admin/**`.
- Supabase project ID is `ztrbourwcnhrpmzwlrcn`; Auth site URL is `https://huddle.pet`.
- Client env contains only `VITE_*` public values. Function secrets are configured
  separately through Supabase secrets. No Meta secrets are committed.
- `Read First.md` governs release preflight for the Expo native archive; this
  web/admin work does not alter native modules.

## Existing integration points

1. Admin route and `Profile` admin fields: `src/routes/FullAppRoutes.tsx`,
   `src/pages/Admin.tsx`, `src/contexts/AuthContext.tsx`.
2. Authenticated function invocation and token refresh:
   `src/lib/invokeAuthedFunction.ts`.
3. Supabase generated client: `src/integrations/supabase/client.ts` and
   `src/integrations/supabase/types.ts`.
4. Edge Function shared helpers: `supabase/functions/_shared/`.
5. Existing scheduled SQL/cron conventions in the Huddle reward and operations
   migrations.
6. Vercel admin SPA rewrite in `vercel.json`.

## Missing infrastructure found

- Meta OAuth connection and business-asset discovery.
- Encrypted server-side token storage and refresh.
- A capability-aware Meta Graph/Threads/WhatsApp API client with retry and
  rate-limit handling.
- A durable action queue with idempotency, approval gates, retry state, and an
  emergency stop.
- Content, campaign, lead, performance, webhook, and report storage isolated
  from personal Huddle user data.
- Webhook verification and deduplication.
- Admin UI for connections, granted permissions, assets, content, actions,
  approvals, policy/budgets, logs, and reports.
- Environment/deployment runbook for Meta app settings and unavoidable OAuth
  approval steps.

## Meta verification status and constraints

The App ID and Threads App ID supplied by the user identify the intended Meta
apps, but a live permission grant cannot be verified without a user-authorised
Meta token or App Dashboard access. The implementation therefore records the
`granted_scopes` returned by OAuth and blocks unsupported actions with a clear
`missing_scope` error.

The official Meta API surface requires business-owned assets and account types:

- Instagram publishing/engagement is for Professional accounts linked to a
  Facebook Page; consumer Instagram accounts are not supported by the Graph
  API publishing flow.
- Marketing API read/manage operations use `ads_read` and `ads_management`;
  access level and app review still depend on the target account and Meta app
  configuration.
- Threads uses its own OAuth/Graph host and scopes, separate from the Facebook
  Login flow.
- WhatsApp Cloud API requires a Business Portfolio/WABA, phone number ID, and
  webhook subscription; message sending is constrained by WhatsApp policy and
  template/session rules.

The requested permission list is treated as a target capability matrix, not as
proof of approval. The admin connection screen displays the actual scopes.

## Phased implementation plan

### Phase 1 — control plane and safe execution boundary (implemented here)

- Dedicated Supabase tables, indexes, constraints, RLS, admin RPCs, and default
  policy for connection, asset, content, action, approval, budget, lead,
  performance, webhook, and audit state.
- Encrypted Meta token storage with no token exposure to the browser or logs.
- Facebook/Meta and Threads OAuth start/callback, asset discovery, and granted
  scope capture.
- Meta Graph, Threads Graph, Marketing API, and WhatsApp request helpers with
  bounded retries, idempotency, and rate-limit handling.
- Action policy enforcing emergency stop, budget ceilings, approval for
  high-risk actions, and automatic pause limits.
- Webhook verification and dedupe for Meta/WhatsApp events.

### Phase 2 — admin operating surface (implemented here)

- A Huddle-styled `/admin/growth` screen for connections, assets, queue,
  approvals, budgets, and audit history.
- Content/action composer is backed by the same queue and policy, so UI actions
  cannot bypass server checks.

### Phase 3 — remaining platform operation coverage

- The current boundary already includes text publishing, routine replies,
  Messenger responses, WhatsApp text, ad pausing, campaign creation (forced
  high-risk approval), lead retrieval, and insights reads. Enable each only as
  the corresponding granted scopes/assets become available.
- Add media upload/creative management, ad-set/ad creation, persisted insight
  snapshots, and lead qualification/routing behind explicit approval and spend
  policies.

### Phase 4 — learning and scheduled optimisation

- Scheduled sync of insights and leads, signal-over-noise reports, local London
  opportunity detection, and bounded creative/budget iteration.
- Retention jobs remove expired inbound personal data and stale token material.

## Required user-authorised actions after this build

1. Add Meta App Secret and `META_TOKEN_ENCRYPTION_KEY` to Supabase Function
   secrets; do not paste them into chat or commit them.
2. Add the exact production and local OAuth redirect URLs to both Meta apps.
3. Complete any Meta App Review/Advanced Access steps shown for the scopes
   actually needed by Huddle.
4. Authorise the Huddle-owned Page, Professional Instagram account, Threads
   profile, ad account, WABA, and phone number through the admin connection
   flow.
5. Configure a scheduler (Supabase `pg_cron`, Vercel Cron, or an equivalent
   protected invocation) for queue processing and insights sync.

No ordinary Huddle user should ever be asked to connect a personal Meta account.
