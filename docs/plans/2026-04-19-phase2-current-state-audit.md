# Phase 2 Current-State Audit

Status: In progress
Date: 2026-04-19
Purpose: ground the native-first plan in the repo's actual current state

## Native Stack Confirmation

Confirmed from the repo:

- Expo config exists at [mobile/app.json](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/app.json)
- Expo package exists at [mobile/package.json](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/package.json)
- committed iOS native project exists under [mobile/ios](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/ios)
- committed Android native project exists under [mobile/android](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/android)
- `mobile/eas.json` now exists for build-profile scaffolding, but native identity is not hardened yet
- current native identity is placeholder (`mobile`, `com.anonymous.mobile`)

## Native Navigation / Launch Surface Audit

Current native root stack in [mobile/src/navigation/RootNavigator.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/navigation/RootNavigator.tsx):

- `Auth`
- `RootTabs`
- `Terms`
- `Privacy`
- `PremiumPage`
- `Notifications`
- `AccountSettings`
- `PetProfile`
- `UserProfile`
- `CreateThread`

Current native tabs in [mobile/src/navigation/types.ts](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/navigation/types.ts):

- `Pet`
- `Chats`
- `Map`
- `Premium`
- `Settings`

Current native tab exposure in [mobile/src/navigation/TabsNavigator.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/navigation/TabsNavigator.tsx):

- `HomeScreen`
- `ChatsScreen`
- `MapScreen`
- `PremiumScreen`
- `SettingsScreen`

Launch-scope implication:

- Native already has a narrower surface than web.
- AI Vet is not in native tab/root navigation now.
- Discover standalone page is not in native navigation now.

## Auth Surface Audit

Current native auth in [mobile/src/screens/AuthScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/AuthScreen.tsx):

- email/password sign-in
- email/password sign-up
- phone field on sign-up
- terms/privacy consent checkbox
- Sign in with Apple code started
- no Google sign-in in current native screen
- no passkey surface in current native screen

Current Sign in with Apple state:

- code started
- build-clean
- runtime-unproven
- Supabase Apple provider not yet enabled
- auth mini gate still open
- explicitly deferred to return later

Disposition:

- Ship: email/password auth if stable
- Replace/add: Sign in with Apple on iOS
- Hide by default: passkey unless fully safe
- Preserve on web: Google sign-in remains unchanged unless later approved for removal

Return-later checklist:

- enable Apple provider in Supabase
- add/confirm Apple Sign In capability and config
- verify working JS runtime on iOS
- run first-sign-in runtime proof
- run repeat-sign-in runtime proof
- verify session creation and restore

## Account / Settings / Deletion Audit

Current native settings surface in [mobile/src/screens/SettingsScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/SettingsScreen.tsx):

- user profile entry
- account settings entry
- manage subscription entry
- terms/privacy links
- contact support button exists but is a no-op
- logout exists

Current native account settings in [mobile/src/screens/AccountSettingsScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/AccountSettingsScreen.tsx):

- identity verification status stub
- personal info/password stubs
- family upsell stub
- biometric toggle
- push/email prefs toggles writing to `profiles.prefs`
- delete account currently deletes only `profiles` row, then signs out

Disposition:

- Ship: settings/account shell, biometric toggle if stable
- Replace: native deletion must call canonical backend delete flow
- Replace: contact support no-op must become real support path
- Replace or complete: password/personal info stubs if exposed in launch path

## Billing / Entitlement Audit

Current native premium surface in [mobile/src/screens/PremiumScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/PremiumScreen.tsx):

- Premium / Gold / Add-on tabs
- pricing pulled from `stripe-pricing`
- checkout uses `create-checkout-session`
- digital purchases open external URLs with placeholder success/cancel callbacks
- current flow is not store-compliant for native digital entitlements

Disposition:

- Replace: native digital checkout with Apple IAP + Google Play Billing
- Preserve separately: Stripe only for allowed physical-service flows
- Verify: add-on modeling after billing implementation

## Push / Notifications Audit

Current native notifications screen in [mobile/src/screens/NotificationsScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/NotificationsScreen.tsx):

- reads Supabase `notifications`
- subscribes to realtime updates
- marks notifications read

Current native account settings push surface in [mobile/src/screens/AccountSettingsScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/AccountSettingsScreen.tsx):

- push toggle only writes prefs to `profiles`
- no native APNs/FCM registration confirmed
- no `expo-notifications` dependency confirmed

Disposition:

- Replace/complete: real native push registration and transport
- Preserve: notifications list UI as downstream consumer if push transport is added

## Deep Link / Link Handling Audit

Current native stack:

- no explicit linking config found in current root navigator
- no `scheme` in `mobile/app.json`
- no `associatedDomains` or Android app link intent filters in `mobile/app.json`

Disposition:

- Add: app scheme, universal links, app links, callback routing

## Map / Location / Device Feature Audit

Current native map in [mobile/src/screens/MapScreen.tsx](/Users/hyphen/Documents/Whypen/Huddle%20App/Pet_Huddle/mobile/src/screens/MapScreen.tsx):

- uses `react-native-maps`
- uses `expo-location`
- requests foreground location permission
- supports map alerts and friend pins
- supports create broadcast flow
- premium gating present in map/broadcast behavior

Current device features elsewhere:

- image picker exists in user profile flow
- local authentication / biometrics exists

Disposition:

- Ship: map/location within launch scope
- Verify: permission metadata and denied-state UX
- Verify: map provider/release config requirements

## Moderation / Safety Audit

Current native map surface includes abuse reporting affordance in map flow.
Current native launch surface does not yet show a clearly verified end-to-end report/block/support contract for reviewer-safe moderation.

Disposition:

- Ship/complete: report, block, support path for native launch scope
- Verify: user-facing moderation flow completeness

## Web-Only Dependencies Native Must Avoid

From current repo behavior:

- browser-only Turnstile/human verification flows exist in web stack
- web digital checkout paths rely on Stripe checkout
- web contains broader route surface than native

Disposition:

- Native must not rely on browser-only Turnstile for launch-sensitive flows
- Native digital purchases must not use external Stripe checkout

## Public Legal / Support Surface Audit

Current public web surface:

- `/privacy` exists
- `/terms` exists
- `/support` now exists as a public support URL

Current state:

- public legal/support route surface is started
- final content and submission-url review still remain open

## Feature Disposition Table

| Area | Disposition | Reason |
| --- | --- | --- |
| Native email/password auth | Ship | Already implemented |
| Sign in with Apple | Add | Required for iOS launch |
| Google sign-in on web | Preserve | Explicitly unchanged unless later approved |
| Passkey | Hide by default | Not hard launch blocker |
| Native delete account | Replace | Current behavior is profile-only delete |
| Native digital billing | Replace | Current Stripe checkout is not store-compliant |
| Native push toggles | Replace/complete | Current prefs-only behavior is incomplete |
| Native notifications list | Ship | UI exists and fits launch scope |
| Native map/location | Ship with hardening | In launch scope |
| Native support CTA | Replace | Current button is no-op |
| AI Vet | Defer/hide | Out of native launch scope |
| Discover standalone page | Defer/hide | Out of native launch scope |
| Hazard Scanner | Defer/hide | Out of native launch scope |
| Legacy signup email confirmation page | Defer/hide | Out of native launch scope |
| Legacy subscription page | Defer/hide | Out of native launch scope |

## Native / Web Preservation Matrix

| System | Native Needs | Web Preservation Requirement |
| --- | --- | --- |
| Auth | SIWA + stable email/password + hidden passkey policy | Do not change current web Google sign-in unless later approved |
| Deletion | canonical backend delete flow | preserve shared backend parity without breaking current web |
| Billing | store billing for digital entitlements | do not break current web monetization during native-first launch |
| Legal/support | public URLs for native submission | add public pages without breaking current web app |
| Deferred pages | hidden in native | leave current web behavior/history intact unless later instructed |

## Audit Exit

Phase 2 can be considered executed at planning level because:

- native stack/build path has been confirmed from the repo
- launch-scope native surfaces have been audited
- the major replace/ship/defer decisions are explicit
- the web-preservation constraints are documented

Phase 3 should use this audit as the source of truth.
