# Phase 1 Native Scope Matrix

Status: In progress
Date: 2026-04-19
Purpose: lock launch-scope behavior, deferred behavior, and web-preservation rules

## Launch-Scope Matrix

| Area | Native Launch | Web During Native Launch | Notes |
| --- | --- | --- | --- |
| Sign in with Apple | Yes, iOS required | N/A | Must be live for iOS submission |
| Google sign-in | No on iOS native launch surface | Keep unchanged | Do not remove from web unless later approved |
| Email/password auth | Yes if stable | Keep unchanged | Shared backend behavior should remain aligned |
| Passkey | Hidden by default | Keep existing behavior unless later changed | Only surface if user-enabled and fully verified safe |
| Premium / Gold / add-ons | Yes with native store billing | Keep current web monetization unless parity change required | Native digital goods must use store billing |
| Physical-service marketplace payment flows | Yes if store-allowed | Keep current allowed flows | Stripe stays only for allowed physical-service flows |
| Chats core | Yes | Keep unchanged | Launch-scope native feature |
| Discover inside Chats | Yes, within Chats launch surface | Keep current web behavior | In native launch scope as part of Chats, not as a standalone page |
| AI Vet | No for native launch | Keep current web behavior if still present | Deferred; must not block native launch |
| Map / location | Yes | Keep unchanged | Launch-scope native feature |
| Notifications | Yes | Keep unchanged | Native push required for launch |
| Report / block / support | Yes | Keep aligned | Reviewer-safe moderation path required |
| Delete account | Yes | Keep backend aligned | Native must use canonical backend deletion flow |
| Privacy / Terms / Support pages | Yes, public URLs required | Must be public on Vercel | Required for native submission |

## Deferred / Redundant Page Matrix

| Page | Native Launch | Web | Classification |
| --- | --- | --- | --- |
| `src/pages/Discover.tsx` | Hidden / excluded | Feature replaced by `/chats?tab=discover` route path | Redundant standalone page |
| `src/pages/AIVet.tsx` | Hidden / excluded | Deferred from native; web may still retain current route/history | Deferred native page |
| `src/pages/HazardScanner.tsx` | Hidden / excluded | No active route found | Redundant page-level candidate |
| `src/pages/Subscription.tsx` | Hidden / excluded | Superseded by `/premium`; direct route redirects | Redundant fallback page |
| `src/pages/signup/SignupEmailConfirmation.tsx` | Hidden / excluded | Superseded by `/signup/verify-email`; old route redirects | Redundant legacy page |

## Native Gating Rules

1. Deferred pages must not appear in native navigation.
2. Deferred pages must not appear in native screenshots, reviewer notes, or demo path.
3. Deferred pages must fail closed:
   - hidden
   - unreachable from launch-scope UI
   - not partially wired
4. Native launch surface must be limited to launch-scope tabs, stacks, and legal pages only.
5. Incomplete passkey surface must remain hidden by default.

## Web Preservation Rules

1. Do not change existing web routes unless strictly required for native submission.
2. Do not remove Google sign-in from web unless later explicitly approved.
3. Do not alter current web monetization behavior unless backend parity requires a shared change and it is explicitly called out.
4. Do not broaden web cleanup beyond:
   - public legal/support URLs
   - backend auth/billing/deletion parity
   - privacy/legal consistency
5. Native-only launch gating must be handled by:
   - native route exposure
   - native navigation exclusion
   - platform-aware gating
   - native-only config where needed

## Reviewer Demo Path Constraints

Reviewer/demo path must include launch-scope flows only:

This reviewer/demo path list is the single source of truth for Phase 4 native route gating.

- Auth
- Chats core
- Discover inside Chats
- Map
- Notifications
- Premium / Gold / add-ons through native billing
- Account settings
- Delete account
- Report / block / support
- Privacy / Terms

Reviewer/demo path must exclude:

- standalone `src/pages/Discover.tsx`
- AI Vet
- Hazard Scanner
- legacy signup email confirmation
- legacy subscription fallback

## Verification Split

### Web verification path

- Verify current Vercel app still works
- Verify public legal/support URLs
- Verify no regression to current web auth/monetization behavior

### Native verification path

- Simulator builds
- Local device builds
- Preview builds
- Internal beta builds

### Shared-system verification path

- Auth consistency
- Deletion consistency
- Entitlement consistency where shared
- Legal/privacy consistency
