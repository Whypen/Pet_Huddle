# REBUILD_TASK_MATRIX

## Goal
Execution map from spec to implementation artifacts.

## Legend
- FE: Frontend
- BE: Supabase Edge Function
- DB: Migration/Schema
- QA: Tests/UAT

| Area | Deliverable | FE Files | BE/DB Files | Validation |
|---|---|---|---|---|
| Routing | All required routes + guards | `src/App.tsx`, route pages | DB roles for admin gate | Route smoke + auth guard tests |
| Auth | Email/password + phone | `src/pages/Auth.tsx`, `src/contexts/AuthContext.tsx` | RLS + profile trigger migrations | Invalid creds + required fields tests |
| Onboarding | 3-phase mandatory flow | `src/pages/Onboarding.tsx`, onboarding components | required field constraints | Incomplete signup blocked |
| Profile schema | Canonical profile fields | `src/types/database.ts` | migrations for missing columns | profile select/update integration tests |
| Verification | Upload + admin approve/reject | `src/pages/Settings.tsx`, `src/pages/Admin.tsx` | bucket policy + status/comment columns + audit logs | pending->approved->locked fields UAT |
| Social/match | Swipe + match popup + chat handoff | `src/pages/Social.tsx` | match tables/policies | match-to-chat E2E |
| Chat | Realtime + member RLS | `src/pages/Chats.tsx`, `src/pages/ChatDialogue.tsx`, hooks | `chat_room_members` policies | outsider denied test |
| Marketplace | Booking modal + Stripe handoff | `src/pages/ChatDialogue.tsx` booking modal | `create-marketplace-booking`, webhook, bookings table | booking success path + dispute path |
| Monetization | Upsell triggers + counters sync | premium/upsell components + hooks | `create-checkout-session`, webhook, protected fields trigger | trigger matrix + webhook fulfillment tests |
| Family invites | Slot-aware invite flow | `src/pages/Settings.tsx` | `family_invites`, slots checks | free upsell + paid invite tests |
| AI Vet | Pet-context prompting | `src/pages/AIVet.tsx`, API hooks | OpenAI proxy function if needed | prompt payload inspection tests |
| Hazard scanner | 3/24h limit | hazard UI | `hazard-scan`, `scan_rate_limits`, RPC | limit enforcement test |
| Map/alerts | Pin rules + geolocation checks | `src/pages/Map.tsx` | `map_alerts`, geolocation checks | pin color + accuracy reject tests |
| Notifications | Push + in-app logs | notification UI hooks | `mesh-alert`, `notification_logs` | event delivery checks |
| PWA | manifest + SW + offline queue | `public/manifest.json`, SW, NetworkContext | n/a | install + offline replay tests |
| Brand system | tokenized colors/typography | shared styles/components | n/a | visual regression snapshots |
| A11y | WCAG baseline | global components/forms/modals | n/a | axe + keyboard nav tests |
| CI/CD | automated gates | workflow config | migration checks | PR checks green |
| Observability | Sentry + alerts | app init + boundaries | edge logging + alerts | forced error telemetry check |
| Auto purge | test-data reset | scripts UI triggers optional | `scripts/cleanup-users.mjs` + DB safe deletes | dry-run + execute logs |

## Phase Plan
1. Foundation: routing, auth, schema parity, i18n baseline.
2. Core product loops: social/chat, pets, map, AI vet.
3. Fintech loops: premium/add-ons, marketplace booking, webhook idempotency.
4. Admin/verification + notifications + PWA polish.
5. Hardening: security, a11y, performance, CI/CD, full UAT matrix.
