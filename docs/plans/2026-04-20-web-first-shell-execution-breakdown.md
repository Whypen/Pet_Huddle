# 2026-04-20 Web-First Shell Execution Breakdown

Status: Architecture locked
Date: 2026-04-20
Source-of-truth web commit: `c29abc8c56a23c280783ec7b35f58a46264f2222`

## Decision

- Huddle ships as a single web-first mobile shell for `huddle.pet`.
- Product UI remains 100% web.
- Native owns only container, device, and runtime responsibilities.
- No store submission happens until Phase 6 native billing is fully wired.

## Locked Architecture

### Web stays web

- Product routes and protected app shell in `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/App.tsx`
- Shell-owned entry points in `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/layout/GlobalHeader.tsx`
- Native bridge hooks in:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/native/NativeRuntimeBridge.tsx`
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/lib/nativeShell.ts`
- Chats, discover, social, settings, premium, legal, support, moderation, delete-account, and marketplace UI all remain web-rendered

### Native must exist for

- App identity, bundle IDs, package IDs, icons, splash
- Web container runtime
- Safe-area handling
- Loading, retry, offline, and deterministic back behavior
- Auth/session handoff
- Sign in with Apple on iOS
- Deep links, universal links, app links
- Push permission and token registration
- Store-safe gating of digital billing paths

### Frozen

- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/screens/AuthScreen.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/screens/ShellScreen.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/navigation/RootNavigator.tsx` as native page-rebuild logic only; it may be repointed to the shell container, but not expanded into page rebuild again
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src_legacy_parity_baseline_c29abc8_20260420`

### Deferred

- Any resumed native page rebuild
- Any duplicate native auth or settings UI
- Any duplicate native chats, discover, social, map, notifications, premium, support, legal, or marketplace pages

## Repo Evidence Snapshot

- Native bridge is already wired on web:
  - `src/App.tsx:55`
  - `src/App.tsx:168`
  - `src/lib/nativeShell.ts:17`
  - `src/lib/nativeShell.ts:330`
  - `src/lib/nativeShell.ts:375`
- Digital billing is currently Stripe-backed and must not stay exposed in app launch:
  - `src/App.tsx:385`
  - `src/App.tsx:393`
  - `src/App.tsx:403`
  - `src/pages/Premium.tsx:274`
  - `src/pages/Premium.tsx:388`
  - `src/pages/Premium.tsx:441`
  - `src/pages/Premium.tsx:468`
  - `src/pages/Premium.tsx:499`
  - `src/pages/Premium.tsx:535`
  - `src/pages/Premium.tsx:573`
  - `src/pages/Premium.tsx:714`
  - `src/pages/Premium.tsx:805`
  - `src/pages/Premium.tsx:866`
  - `src/components/monetization/SharePerksModal.tsx:92`
  - `src/components/monetization/SharePerksModal.tsx:161`
  - `src/components/subscription/PaywallModal.tsx:68`
  - `src/components/subscription/PricingCard.tsx:112`
  - `src/components/layout/GlobalHeader.tsx:767`
  - `src/components/layout/GlobalHeader.tsx:785`
- Reviewer-safe routes already exist on web:
  - `src/App.tsx:176`
  - `src/App.tsx:451`
  - `src/App.tsx:455`
  - `src/App.tsx:459`
  - `src/components/layout/GlobalHeader.tsx:851`
  - `src/components/layout/GlobalHeader.tsx:898`
  - `src/components/layout/GlobalHeader.tsx:907`
  - `src/components/layout/GlobalHeader.tsx:916`
  - `src/pages/Settings.tsx:396`
  - `src/pages/Settings.tsx:607`
- iOS associated domains are not configured yet:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/ios/mobile/mobile.entitlements` exists and is empty
- Android app links are not configured yet:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/android/app/src/main/AndroidManifest.xml` has launcher only, no `VIEW` host filter for `huddle.pet`

## Phase 1: App Shell & Bridge

### Goal

- Replace the active native page runtime with one native web shell container
- Initialize safe-area handling and native loading states
- Establish the minimal native bridge contract needed for the web-first app shell

### Files/components likely affected

- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/App.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/index.ts`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/navigation/RootNavigator.tsx`
- New shell container files under `mobile/src`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/package.json`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/package-lock.json`

### Exact success criteria

- App launches into one shell container, not native rebuilt pages
- `huddle.pet` renders as the main in-app surface
- Safe-area insets are handled natively
- Native loading state is explicit and does not fork web UI
- Native retry/error state is explicit
- Back behavior is deterministic on Android
- No new product UI is introduced natively

### What must NOT change

- No new native product pages
- No mobile-only redesign
- No fork of web auth or shell UI
- No second runtime path beside the shell container

### Blockers / dependencies

- Existing native runtime still points at `AuthScreen` and `ShellScreen`
- Web bridge messages must be honored by the container, not by fake native pages

### Proof commands

```bash
grep -Rni 'RootNavigator\|AuthScreen\|ShellScreen' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src'
grep -Rni 'NativeRuntimeBridge\|huddle-open-external-url\|huddle-auth-state' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src'
grep -Rni 'SafeAreaProvider\|StatusBar\|react-native-webview\|WebView' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile'
```

### Test commands

```bash
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && npm run lint
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && ./node_modules/.bin/tsc --noEmit --pretty false
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/ios' && xcodebuild -workspace mobile.xcworkspace -scheme mobile -configuration Debug -sdk iphonesimulator build
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/android' && ./gradlew assembleDebug
```

## Phase 2: Auth & Push (P0)

### Goal

- Keep web auth as the product surface while finishing native auth/session plumbing
- Add Sign in with Apple on iOS
- Implement native push permission and token registration end to end
- Add iOS associated domains and Android app links

### Files/components likely affected

- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/app.json`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/ios/mobile/Info.plist`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/ios/mobile/mobile.entitlements`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/android/app/src/main/AndroidManifest.xml`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/contexts/AuthContext.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/src/lib/supabase.ts`
- Shell container bridge files
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/lib/nativeShell.ts`

### Exact success criteria

- `huddle://auth/callback` returns correctly into app runtime
- Universal links and app links for `huddle.pet` open the app
- Sign in with Apple works on iOS
- Web auth state and native runtime state stay aligned
- Push permission prompt, token retrieval, and `push_tokens` upsert path work
- Push is launch-ready, not deferred

### What must NOT change

- No duplicate native email/password auth screen
- No hidden parallel auth flow
- No removal of web auth callback route

### Blockers / dependencies

- Empty iOS entitlements file
- No Android `VIEW` + `BROWSABLE` host filter yet
- No audited native push responder yet for `huddle-native-push-registration`

### Proof commands

```bash
grep -Rni 'auth/callback' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile'
grep -Rni 'CFBundleURLSchemes\|applinks:\|associated domains' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/ios'
grep -Rni 'android.intent.action.VIEW\|android.intent.category.BROWSABLE\|autoVerify\|assetlinks' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile/android'
grep -Rni 'huddle-request-push-registration\|huddle-native-push-registration\|push_tokens' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile'
```

### Test commands

```bash
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && npm run lint
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && ./node_modules/.bin/tsc --noEmit --pretty false
xcrun simctl openurl booted 'huddle://auth/callback'
adb shell am start -a android.intent.action.VIEW -d 'huddle://auth/callback'
```

## Phase 3: Compliance Reachability

### Goal

- Ensure Support, Privacy, Terms, moderation/report, and Delete Account are reachable from the launch shell

### Files/components likely affected

- Shell container files in `mobile/src`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/App.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/layout/GlobalHeader.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Settings.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/support/HelpSupportDialog.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/support/SupportRequestForm.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/moderation/ReportModal.tsx`

### Exact success criteria

- Reviewer can reach support, privacy, terms, moderation/report flows, and delete-account from the shipped shell
- Reachability does not depend on frozen placeholder native screens
- Back/offline/retry behavior remains stable in these flows

### What must NOT change

- No native copies of support/legal/delete pages
- No reviewer-only alternate app mode

### Blockers / dependencies

- Signed-out support uses Turnstile and must remain reachable through the web-first shell path

### Proof commands

```bash
grep -Rni 'Help & Support\|Privacy Policy\|Terms of Service\|Community Guidelines\|Delete account\|delete-account\|process_user_report\|Report User\|Block User' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src'
grep -Rni 'path=\"/support\"\|path=\"/privacy\"\|path=\"/terms\"\|path=\"/settings\"' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/App.tsx'
```

### Test commands

```bash
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && npm run lint
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && ./node_modules/.bin/tsc --noEmit --pretty false
```

## Phase 4: Core Interactions

### Goal

- Ship Chats, Discover, and Social as 100% web-rendered surfaces inside the web-first shell

### Files/components likely affected

- Shell container files in `mobile/src`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/App.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Chats.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/ChatDialogue.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Social.tsx`

### Exact success criteria

- Chats, Discover, and Social are presented through the container with no duplicate native rendering
- Native shell only contributes device/runtime behavior
- Web rendering remains identical to `huddle.pet`

### What must NOT change

- No resumed native chats or social rebuild
- No forked unread behavior outside the web product

### Blockers / dependencies

- Phase 1 container and Phase 2 auth/session wiring must already be stable

### Proof commands

```bash
grep -Rni 'path=\"/chats\"\|path=\"/social\"\|discover' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src'
```

### Test commands

```bash
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && npm run lint
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && ./node_modules/.bin/tsc --noEmit --pretty false
```

## Phase 5: Billing Audit

### Goal

- Identify and isolate every digital Stripe checkout path before app launch

### Files/components likely affected

- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/pages/Premium.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/layout/GlobalHeader.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/subscription/PaywallModal.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/subscription/PricingCard.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/social/PremiumUpsell.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/monetization/SharePerksModal.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/monetization/ManageFamilySheet.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/map/BroadcastModal.tsx`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src/components/profile/PublicProfileSheet.tsx`

### Exact success criteria

- All digital Stripe purchase entry points are isolated behind a launch gate
- Real-world marketplace service bookings remain on Stripe
- No digital purchase CTA remains exposed in the mobile shell

### What must NOT change

- No hand-waving around store policy
- No digital Stripe checkout exposed in shipping app

### Blockers / dependencies

- Clear distinction between digital entitlements and real-world service payments

### Proof commands

```bash
grep -Rni 'create-checkout-session\|cancel-subscription\|Get Huddle+\|Get Huddle Gold\|Purchase Add-ons\|Purchase Member Slot\|Upgrade to Gold\|Manage Membership\|Family Account' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src'
```

### Test commands

```bash
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle' && npm run lint
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle' && npm run build
```

## Phase 6: Native Billing Wiring

### Goal

- Replace digital Stripe purchase paths with RevenueCat-backed Apple IAP / Google Play Billing before store submission

### Files/components likely affected

- Launch gating in web premium surfaces
- Native shell billing bridge files in `mobile/src`
- Native purchase SDK wiring in `mobile`
- Shared entitlement reconciliation paths where required

### Exact success criteria

- Huddle+, Huddle Gold, Super Broadcast, Profile Booster, and Family/Share Perks digital purchase paths use native store billing
- No digital Stripe checkout remains in shipping app
- Submission can proceed only after this phase is proven

### What must NOT change

- Real-world marketplace service bookings stay on Stripe
- No dual billing exposure for the same digital entitlement

### Blockers / dependencies

- RevenueCat project setup
- Apple IAP products
- Google Play Billing products
- entitlement mapping parity with existing web/backend state

### Proof commands

```bash
grep -Rni 'create-checkout-session\|cancel-subscription\|RevenueCat\|Purchases' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/src' '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile'
```

### Test commands

```bash
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && npm run lint
cd '/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/mobile' && ./node_modules/.bin/tsc --noEmit --pretty false
```

## Mistake Prevention Ledger

- [Rule 1] No duplicate UI; web is the source of truth.
- [Rule 2] No resumed native page rebuild.
- [Rule 3] No second app runtime path beside the web-first shell.
- [Rule 4] Native owns only container/device/runtime behavior.
- [Rule 5] Do not claim parity from approximated native screens when the product surface is supposed to stay web.
- [Rule 6] Before every pass, read:
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/Read First.md`
  - `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/No Mistake Codex.md`
  - this breakdown file
- [Rule 7] Use repo evidence only and confirm routes/CTAs with `grep -Rni`.
- [Rule 8] Do not leave digital Stripe purchase CTAs visible in the shipping shell.
- [Rule 9] Do not submit any store build before native billing is complete.
- [Rule 10] When a flow stays on web, keep it on web; do not rebuild it natively by habit.
