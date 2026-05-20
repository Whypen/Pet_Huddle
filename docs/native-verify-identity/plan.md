# Native Verify Identity Migration Plan

Status: planning artifact only. No implementation approved.
Date locked: 2026-05-05

## Locked Decision

`/verify-identity` remains web-owned.

This plan does not approve native route ownership. The current decision explicitly requires:

- no native `/verify-identity` implementation
- no native route ownership
- no route manifest change
- no production flag
- no database migration
- no signup flow change

The web route remains the source of truth for behavior, data contracts, state transitions, error handling, and signup handoff until every blocker below is resolved and physical-device proof is complete.

## Decision Log

- 2026-05-05: `/verify-identity` remains web-owned.
- 2026-05-05: Web Contract Matrix completed.
- 2026-05-05: `app/src/lib/nativePhoneOtp.ts` audited against the phone OTP contract.
- 2026-05-05: Only OTP lib parity gap found: non-OK error details drop top-level reason fields.
- 2026-05-05: Approved next patch is a one-line `nativePhoneOtp.ts` details fallback.
- 2026-05-05: No UI, prototype, route, signup, or DB/migration work is approved yet.
- 2026-05-05: Phase 1 app-only native verify identity clients added in `app/src/lib/nativeVerifyIdentity.ts`; proof run: `git diff --check` passed, `npm --prefix app run typecheck` is blocked by pre-existing `app/src/screens/NativeChatDialogueScreen.tsx:255` await syntax error; next gate remains native liveness, native device fingerprint policy, and native Stripe 3DS physical-device proof.
- 2026-05-05: Phase 1 client compile isolated for `nativeVerifyIdentity.ts` and `nativePhoneOtp.ts`; proof run: isolated `tsc --noEmit` passed and full app typecheck still only reports the pre-existing native chat await blocker; next gate is fixing that blocker outside verify-identity or starting the approved prototype slice.
- 2026-05-05: Phase 2 native phone OTP isolation added `app/src/lib/nativeVerifyIdentityPhoneOtpModel.ts` and typed OTP failure kinds in `nativePhoneOtp.ts`; proof run: `npm --prefix app run typecheck -- --pretty false`, isolated Phase 2 `tsc --noEmit`, and `git diff --check` passed; next gate is runtime proof for send/resend/wrong-code/expired/rate-limit/country-unavailable states.
- 2026-05-05: Phase 3 native Stripe card/3DS model added in `app/src/lib/nativeVerifyIdentityCardModel.ts`; proof run: `npm --prefix app run typecheck -- --pretty false`, isolated Phase 3 `tsc --noEmit`, and `git diff --check` passed; next gate is human/liveness model code parity, with no runtime proof or route ownership yet.
- 2026-05-05: Phase 3 retry patched to preserve only legal name and postal code while resetting Stripe runtime state; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; next gate is Phase 4 human/liveness model code parity.
- 2026-05-05: Phase 4 native human/liveness model added in `app/src/lib/nativeVerifyIdentityHumanModel.ts`; proof run: isolated Phase 4 `tsc --noEmit` and `git diff --check` passed, while full app typecheck is blocked by unrelated native chat errors; next gate is device fingerprint model and snapshot orchestration code parity.
- 2026-05-05: Phase 2-4 parity patch fixed optional card postal code, protected card status reconciliation, detailed liveness failure mapping, and OTP provider-vs-country unavailable classification; state decision: liveness interruption causes remain failure reasons under `failed`, not separate top-level states; proof run: isolated verify-identity `tsc --noEmit` and `git diff --check` passed, full app typecheck remains blocked by unrelated native chat errors.
- 2026-05-05: Verify-identity code parity closure added native profile-status snapshot support, verification-updated subscription/cache hooks, blocked-identity support intent, explicit device-fingerprint placeholder policy, and card pending polling constants; proof run: `npm --prefix app run typecheck -- --pretty false`, isolated verify-identity `tsc --noEmit`, and `git diff --check` passed; remaining gaps are orchestration/UI prototype and physical-device proof, not model/client parity.
- 2026-05-05: Phase 5 native device fingerprint policy set an install-scoped ID stored in Expo SecureStore, submitted to `verify-device-fingerprint` with native metadata and `ownershipReady=false`; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; next gate is non-production native verify-identity orchestration/UI prototype.
- 2026-05-05: Phase 6 non-production native verify-identity prototype added in `app/src/screens/NativeVerifyIdentityPrototypeScreen.tsx` behind `EXPO_PUBLIC_ENABLE_NATIVE_VERIFY_IDENTITY_PROTOTYPE` and non-production env guard; it wires snapshot/profile refresh, phone OTP, card, human, device fingerprint, update/cache hooks, and blocked-card support intent without route ownership; proof run: isolated Phase 6 `tsc --noEmit` and `git diff --check` passed, while full app typecheck is blocked by unrelated native chats errors.
- 2026-05-05: Phase 6 prototype blocker patch confirmed card model parity for optional postal code, retry reset, and protected status reconciliation, and removed internal setup intent/policy/probe strings from prototype display; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed.
- 2026-05-05: Phase 6 enhancement patch replaced manual test controls with a single phone → human → card → final refresh step flow, added app resume refresh, wired card pending polling, added blocked-card support handoff, and removed implementation-facing copy from the non-production prototype; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check`; remaining blocker is controlled runtime proof on non-production access.
- 2026-05-05: Phase 6 web-parity patch restored expandable phone/human/card cards with ordered completion guidance, replaced raw state labels with user-facing copy, added OTP resend countdown behavior, and added a basic face-check shell while keeping Stripe and liveness runtime proof unclaimed; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; next gate is controlled model proof only.
- 2026-05-05: Phase 6 current-file parity check confirmed the actual non-production prototype file contains active card expand/collapse, app resume refresh, card pending polling, OTP cooldown resend lockout, human-facing visible copy, and the face-check shell; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; controlled model proof remains the next safe gate.
- 2026-05-05: Controlled model proof for the non-production native verify-identity prototype passed by code inspection for expand/collapse cards, ordered phone → human → card → final guidance, OTP cooldown/resend state, app resume refresh, card pending polling/check-status, blocked-card support handoff, human-facing visible copy, and non-production gate; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; next runtime slice must still exclude Stripe and liveness runtime claims until separately approved.
- 2026-05-05: Native phone OTP non-production shortcut proof covered send, cooldown/resend lockout, wrong-code, verified, country-unavailable, expired-code model, and rate-limit model states without Stripe, liveness, route ownership, signup, DB, or migration changes; proof run: shortcut harness plus `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; live SMS expiry/rate-limit proof remains practical only with approved test phone/backend setup.
- 2026-05-05: Native Stripe card non-production model proof covered mocked SetupIntent creation, legal-name required, optional postal code, incomplete/complete card states, secure bank check state, checking-card state, pending polling/check-status copy, failed/cancelled states, and blocked-card support metadata without charge, liveness, route ownership, signup, DB, or migration changes; proof run: card model harness plus `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; real Stripe SDK/3DS app-return proof remains blocked until separately approved with a non-production authenticated device session.
- 2026-05-05: Native liveness model/shell proof covered mocked challenge start, capture/checking, pass, permission denied, no camera, no face, poor lighting, movement failed, timeout, retry, and human-facing copy; patch fixed failure-copy priority so no-face and retry copy are not masked by movement prompts; proof run: liveness model harness plus `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; real camera/liveness proof remains blocked until separately approved on physical devices.
- 2026-05-05: Native device fingerprint non-production proof covered install-scoped ID creation, SecureStore persistence/reuse, legacy AsyncStorage migration/removal, `verify-device-fingerprint` submit path, native metadata, `ownershipReady=false`, and separate profile/status refresh hook; proof run: device fingerprint harness plus `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; backend contribution and physical-device stability remain blocked until separately approved.
- 2026-05-05: Combined non-production orchestration proof covered mocked snapshot refresh, device fingerprint submit, phone verified model, human passed model, card passed model, verification-updated event/cache refresh, blocked-card support handoff, and final verified status refresh without route ownership, signup, DB, migration, or production rollout changes; proof run: combined orchestration harness plus `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; physical-device proof is the next blocker.
- 2026-05-05: Final Phase 6 UI parity closure patched the non-production prototype card headers/copy/status, phone helper and masked-number copy, card entry/no-charge/verified-summary/pending/support UI, invisible background device check, and premium face-check shell; proof run: `npm --prefix app run typecheck -- --pretty false` and `git diff --check` passed; next blocker is physical-device proof for real SMS, Stripe 3DS return, camera/liveness, and device fingerprint stability.
- 2026-05-05: Physical-device proof planning matrix added for live SMS OTP, Stripe SetupIntent/3DS return, real camera/liveness, device fingerprint persistence, and final verified status refresh; proof run: planning artifact only, no implementation or runtime proof; next gate is explicit approval plus test accounts/devices before physical proof starts.
- 2026-05-05: Gate 1 physical-device runtime proof was approved but could not be executed in this Codex environment because real iOS/Android devices, non-production authenticated device sessions, SMS numbers, Stripe 3DS app-return setup, and camera access are not available to the agent; proof run: not executed; next gate is running the matrix on supplied physical devices/test accounts.
- 2026-05-05: Simulator-only proof attempted with the installed iOS simulator build and Metro; proof run: `npm --prefix app run typecheck -- --pretty false`, `git diff --check`, `xcrun simctl launch booted pet.huddle`, `npm --prefix app run ios -- --device "iPhone 17 Pro" --no-bundler`, and screenshot smoke of the running app shell passed, but the verify-identity prototype is not route-mounted by design, so simulator proof for prototype card interactions remains blocked without a temporary non-production harness or explicit route-mount approval.
- 2026-05-05: App internal native-first verify-identity harness added for non-production `EXPO_PUBLIC_ENABLE_NATIVE_VERIFY_IDENTITY_PROTOTYPE=true`; production remains web-owned, signup verify handoff remains web unless explicitly testing the prototype, and prototype errors fall back to the existing web `/verify-identity` WebShell; proof run: `npm --prefix app run typecheck -- --pretty false`, `git diff --check`, iOS simulator native-first deep link smoke, and iOS simulator fallback WebShell smoke passed.
- 2026-05-05: Native prototype parity audit patch removed visible status-dashboard treatment, removed simulated human pass/no-face product controls, made the human card an app-native face-check shell without claiming live-camera proof, removed fake secure card fields/3DS controls until Stripe native entry is actually wired, wired Turnstile errors into the phone card, and preserved device fingerprint as invisible background work; production `/verify-identity` remains web-owned.

## Current Web-Owned Contract

The current web-owned identity flow requires four verification signals before a user can be treated as fully verified:

1. Device fingerprint
   - Web source: FingerprintJS visitor ID.
   - Backend function: `verify-device-fingerprint`.
   - Backend state: row in `device_fingerprint_history`.

2. Phone OTP
   - Web source: phone OTP UI and Turnstile challenge.
   - Backend functions: `send-phone-otp` and `verify-phone-otp`.
   - Backend state: `phone_otp_challenges`, `phone_otp_attempts`, `profiles.phone_verification_status`, `profiles.phone_verified_at`.

3. Human liveness
   - Web source: live camera and MediaPipe face movement challenge.
   - Backend function: `verify-human-challenge`.
   - Backend state: `human_verification_attempts`, `profiles.human_verification_status`, `profiles.human_verified_at`.

4. Stripe card SetupIntent
   - Web source: Stripe.js card Elements and `confirmCardSetup`.
   - Backend function: `create-identity-setup-intent`.
   - Backend state: `identity_card_verifications`, masked profile card fields, Stripe customer/setup intent IDs, blocked identity checks.

`refresh_identity_verification_status` is the final backend arbiter. Native must not claim ownership until it can satisfy all four signals with the same backend truth model.

## Web Contract Matrix

Source-of-truth file: `src/pages/VerifyIdentity.tsx`, read line by line on 2026-05-05. Supporting web API contracts are in `src/lib/verifyIdentityApi.ts`, `src/lib/phoneOtp.ts`, and `src/lib/deviceFingerprint.ts`.

| Contract area | Current web contract | Native migration implication |
| --- | --- | --- |
| Route ownership | `/verify-identity` is a protected web page with `PageHeader`, three verification cards, support dialog, and signup return handling. | Keep production web-owned. Native prototype must not claim route ownership or alter manifest/signup routes. |
| Top-level UI state names | `overallVerificationStatus`: `unverified`, `pending`, `verified`. `activeCard`: `phone`, `human`, `card`, `null`. | Native prototype must preserve the same global status and independent card expansion model before parity can be discussed. |
| Phone state names | `phoneVerificationState`: `idle`, `sent`, `verified`, `failed`, `unavailable`; plus `phoneVerificationLoading`, `phoneVerificationError`, `phoneSentMaskedHint`, `phoneOtpCooldownSeconds`, `phoneOtpCooldownVersion`. | Reusable from native OTP, but not enough for ownership. Native must preserve cooldown, unavailable, masked hint, and failure semantics. |
| Human state names | `humanVerificationState`: `idle`, `ready`, `capturing`, `pending`, `passed`, `failed`; plus `humanAttemptId`, `humanChallenge`, `humanErrorMessage`, `previewStream`. | Native liveness must reproduce the backend state mapping and local capture-preservation behavior before it can replace web. |
| Card state names | `cardVerificationState`: `idle`, `collecting`, `submitting`, `pending`, `passed`, `failed`; plus Stripe runtime refs, field readiness/completion booleans, legal name, postal code, setup intent ID, client secret, blocked identity, and card metadata. | Native Stripe wrapper must distinguish setup creation, field readiness, submit, pending reconciliation, passed, failed, and blocked identity. |
| Snapshot backend functions | `fetchVerifyIdentitySnapshot()` calls `verify-human-challenge` with `{ action: "get" }` and `create-identity-setup-intent` with `{ action: "status", stripeMode }`; transient 503 has one retry. | Native snapshot client must preserve both calls and combine results exactly; profile fallback on card status failure is part of web behavior. |
| Human backend functions | `startHumanChallenge()` calls `verify-human-challenge` with `{ action: "start" }`. `completeHumanChallenge()` calls `verify-human-challenge` with `{ action: "complete", attemptId, status, score, resultPayload, evidencePath }`. | Native liveness payload must match this complete contract, including score/result payload semantics and optional evidence path. |
| Card backend functions | `createCardSetupIntent(attemptId)` calls `create-identity-setup-intent` with `{ action: "create", stripeMode, attemptId }`. `fetchCardStatus()` calls `{ action: "status", stripeMode }`. | Native SetupIntent flow can reuse backend, but must send attempt IDs and poll status the same way. |
| Phone backend functions | `requestPhoneOtp(phone, turnstileToken)` calls `send-phone-otp` with `{ phone, device_id, turnstile_token, turnstile_action: "send_pre_signup_verify" }`. `verifyPhoneOtp(phone, token)` calls `verify-phone-otp` with `{ phone, token, otp_type: "sms", challenge_id, device_id }`. | Native OTP already has a similar client; prototype must keep challenge storage, `x-huddle-access-token`, and Turnstile action aligned. |
| Device fingerprint backend | Bootstrap calls `trackDeviceFingerprint("verify_identity_entry")`, which gets a FingerprintJS visitor ID and calls `verify-device-fingerprint` with `{ visitorId, source, userAgent }`. | Native has no equivalent yet. Native needs an install/device identity policy and a compatible submit path before ownership. |
| Required payloads | Human complete requires `attemptId`, `status`, optional `score`, `resultPayload`, optional `evidencePath`. Card create requires `attemptId`; card confirm uses Stripe client secret and billing details. OTP send requires phone, device ID, Turnstile token/action; OTP verify requires phone, code, challenge ID, device ID. | Native prototype must define typed payloads before UI work; missing payload parity blocks phase advancement. |
| Profile fields read | Web reads `profile.phone`, `phone_verification_status`, `phone_verified_at`, `legal_name`, `verification_status`, `human_verification_status`, `card_verification_status`, `card_verified`, `card_brand`, `card_last4`, `verification_rejection_code`; sync polling directly selects `is_verified`, `verification_status`, `legal_name`, `card_verification_status`. | Native profile reads should use shared profile summary where possible, but any prototype matrix must prove every field is available. |
| Profile fields touched by backend | Edge functions/service-role update `profiles.verification_status`, `is_verified`, `phone`, `phone_verification_status`, `phone_verified_at`, `human_verification_status`, `human_verified_at`, `card_verification_status`, `card_verified`, `card_verified_at`, `card_brand`, `card_last4`, `stripe_customer_id`, `stripe_setup_intent_id`, `legal_name`, `verification_rejection_code`. | Native must never client-write sensitive verification fields; it must trust backend state and refresh. |
| Session contract | Every user action calls `ensureAuthForVerification()`. If auth is loading, web sets human/card “Loading your session” errors. If no session, signup flow routes back to `/signup/verify`; non-signup routes to `/auth` with `{ from: "/verify-identity" }`. | Native prototype must not silently mutate or call verification without a valid session; session recovery must be explicit. |
| Redirect/return storage | Web stores `{ backTo, returnTo, from }` in `sessionStorage` key `huddle_vi_nav` to survive Stripe full-page redirects. `allowVerifiedReturnRef` gates verified return behavior. | Native route handoff must preserve equivalent state only in prototype. Production signup/web ownership remains unchanged. |
| Verified return behavior | If verified and `allowVerifiedReturnRef` is true, signup verify entry sets `isSignupVerifyEntry` and waits for explicit Continue; non-signup returns to `returnTo` or `backTo`, reopening settings drawer when appropriate. | Native should not auto-continue signup until this behavior is deliberately mirrored and approved. |
| Back behavior | Header back removes `huddle_vi_status`, navigates to stored `backTo`, returns signup users to `/signup/verify`, falls back to `/settings` with drawer if history is empty, otherwise `navigate(-1)`. | Native prototype must map back behavior separately from ownership. |
| Signup handoff | `activeSignupFlow = flowState !== "idle" && !registeredProfile`. Initial phone/legal name may come from signup data. OTP success updates signup data `{ phone, otp_verified: true }`. Verified signup entry renders a `Continue` button that sets flow to `signup` and navigates to `/set-profile`. | No signup flow change is allowed. Prototype can document but not alter this handoff. |
| Card SetupIntent create states | On Add Card: guard in-flight, reset runtime, clear blocked state, set `collecting`, generate `crypto.randomUUID()` attempt ID, race `createCardSetupIntent()` against 12s timeout, store `clientSecret` and `setupIntentId`, load Stripe, create card number/expiry/CVC Elements, mount after DOM target wait. | Native wrapper should split these into `creating_setup_intent`, `collecting`, and `ready` states, while preserving timeout/failure semantics. |
| Card field states | Web tracks ready and complete for number, expiry, CVC. Submit disabled until all three complete, legal name present, client secret and setup intent ID present, and not submitting. | Native `CardField` may collapse field readiness, but must provide equivalent disabled/error behavior. |
| Card submit states | Submit guards not-ready, incomplete, missing legal name. Then sets `submitting`, calls `stripe.confirmCardSetup(clientSecret, { payment_method: { card, billing_details: { name, address.postal_code }}})`. | Native must use official Stripe React Native SetupIntent/3DS capability only; custom 3DS UI is prohibited. |
| Card SetupIntent result states | If Stripe returns error, set `failed`; surface Stripe test-mode message or user-friendly `card_error`, otherwise generic. If setup intent status is `succeeded` or `processing`, set `pending`, then force-poll card status. | Native wrapper should use “Opening secure bank check…”, “Checking your card…”, pending wait, retry, blocked support, and success states without replacing issuer UI. |
| Card backend status states | `syncCardUiFromResolvedStatus()` maps backend `not_started` to `idle`, `pending` to `pending`, `failed` to `failed`, `passed` or `cardVerified` to `passed`. Active attempts, different setup intent IDs, and local failed states protect UI from passive polling unless backend passed or blocked. | Native polling must not collapse local retry/error UI with stale backend pending/failed data. |
| Card blocked identity | `verification_rejection_code === "blocked_identity"` maps to `{ blocked: true, message: "Card is already used by another account." }`; UI shows top warning and card-level Help & Support path. | Native must provide support path and avoid infinite retry encouragement for blocked cards. |
| Card retry/cancel states | `onRetryCard()` calls `onAddCard()` again. Mount load error auto-retries once after 1s, then surfaces “Card form failed to mount. Please retry.” Pending users can tap Check Status. | Native retry should reset only the Stripe attempt runtime, not unrelated completed signals. Cancelled 3DS should map to failed/cancelled retry state. |
| Human start states | Start requires auth, clears error, best-effort prewarms MediaPipe, calls `startHumanChallenge()`, stores attempt/challenge, sets overall status, moves to `ready`; errors move to `failed`. | Native liveness start must keep challenge issuance separate from capture. |
| Human capture states | Begin requires auth, sets verified-return allowed, starts challenge if missing, sets `capturing`, runs `runHumanVerificationChallenge(challenge, { minDurationMs: 4000, onPreviewStream })`, optionally uploads evidence only in prod, then calls complete. | Native must use live camera, not still image, and produce the same challenge result payload. |
| Human result states | Backend completion sets local state to `passed` or `failed`. Passed refreshes snapshot/profile and toasts success. Failed uses `describeHumanFailure()` based on verifier, reason, detected frames, movement metrics, and challenge type. | Native liveness UI should map no-face, movement, permission, detector unsupported, and retry states to equivalent failure reasons. |
| Human error/cancel states | Permission errors show camera-access message; missing camera shows no-camera message; `native_camera_still_image_only` explicitly fails; exceptions attempt to mark backend challenge failed. Retry starts a new challenge. | Native prototype must explicitly handle permission denial, no camera, timeout, still-image fallback prohibition, and backend failure marking. |
| Device fingerprint states | No visible UI state. It is a bootstrap background signal. Failure is logged but not hard-fatal in the UI; backend status is refreshed afterward. | Native must decide whether device fingerprint failure is invisible, blocking, or warning; current web treats it as best-effort UI-wise but required for final verified backend status. |
| Phone send states | Send requires auth, non-empty phone, allowed country, usable Turnstile token. Sets loading, calls request, then either `sent` with cooldown/masked hint or `failed`/`unavailable` with mapped message. | Native OTP prototype can start here safely because it is already closest to parity. |
| Phone verify states | Verify requires auth, phone and code. Calls verify, then `verified`, clears code, updates signup data, refreshes profile/snapshot, waits for backend sync, and resolves phone state. Errors stay `failed` with mapped message. | Native must keep local challenge ID ownership and clear challenge on terminal expired/session/code-used errors. |
| Phone input change states | Changing phone clears OTP code, masked hint, cooldown version. Empty resets to `idle`. Disallowed country sets `unavailable`. Sent/failed/unavailable reset to `idle` when a valid new phone is entered. | Native phone field must preserve this reset behavior. |
| Snapshot refresh behavior | Bootstrap waits for session, resolves phone state, tracks device fingerprint, refreshes full runtime. Window focus/visibility refreshes runtime unless human capture is active. Pending human/card starts polling every 1s, slowing to 2s near cap, and stops after enough pending card polls with a check-status message. | Native prototype needs app-state resume refresh and must not interrupt live capture. |
| Error mapping | `verifyIdentityApi` maps auth, Stripe key/config, visitor ID, profile readiness, challenge expiry, invalid transition/result, detector unsupported, attempt missing, card timeout, 503, permission, unauthorized, and unknown errors to user-safe messages. Phone OTP maps provider, country, rate limit, duplicate phone, invalid phone, session, expired, used, mismatch, and network failures. | Native clients should reuse the same error vocabulary before UI polish. |
| Support path | `HelpSupportDialog` opens with subject “Identity verification support”; blocked identity pre-fills message “I need help with identity verification.” | Native blocked-card/support path must preserve subject/intent if implemented later. |
| Event side effects | Verification refresh dispatches `huddle:verification-updated`. Profile refresh occurs after verified status and after card/phone/human status changes. | Native prototype must define equivalent event/cache invalidation for native screens before ownership. |

## Reusable Native-Ready Parts

These parts can be reused later, but they are not enough to transfer ownership:

- Phone OTP backend contract is reusable from native.
- Native already has a reusable OTP client surface in `app/src/lib/nativePhoneOtp.ts`.
- Native Turnstile WebView support exists for challenge-token collection.
- Stripe identity SetupIntent backend is client-agnostic and can be called from native.
- Native app already includes `@stripe/stripe-react-native`.
- Existing authed function header pattern with `x-huddle-access-token` is reusable.

## Blockers

Native ownership is blocked by:

- native liveness is missing
- native device fingerprint is missing
- native Stripe SetupIntent plus 3DS return flow is unproven
- phone OTP is reusable but not enough for native ownership

Additional risks to prove before ownership:

- native session refresh and WebView/native handoff must not split identity state
- Stripe pending, failed, blocked-identity, and 3DS return states must match web behavior
- native liveness must use live camera evidence, not still-image fallback
- native device identity policy must be stable enough for verification status
- signup verify return path must remain unchanged until native ownership is explicitly approved

## Phase Order

Phase 0: keep production web-owned.

- Keep `/verify-identity` rendered by the web route.
- Do not add it to native route ownership.
- Do not add a production feature flag.
- Do not change signup flow.

Phase 1: extract native-safe identity clients.

- Add native clients for snapshot, human challenge, card setup/status, and device fingerprint only after separately approved.
- Reuse existing edge functions.
- Keep web behavior as the comparison baseline.

Phase 2: prove phone OTP in native isolation.

- Reuse `nativePhoneOtp`.
- Keep Turnstile action and edge-function payloads aligned with web.
- Confirm rate limit, wrong-code, expired-code, resend, and verified states.

Phase 3: prove native Stripe card setup.

- Use native Stripe SDK against `create-identity-setup-intent`.
- Confirm SetupIntent with legal name and postal code.
- Prove 3DS return to app.
- Poll backend status and reconcile profile state.
- Prove blocked identity and failed card states.

Phase 4: build and prove native liveness.

- Implement live-camera liveness with the same challenge/result contract expected by `verify-human-challenge`.
- Do not rely on photo picker or still-image capture.
- Prove pass and fail states on physical devices.

Phase 5: build and prove native device fingerprint.

- Define native install/device identity policy.
- Persist the identifier safely.
- Submit it through `verify-device-fingerprint`.
- Confirm it contributes to `refresh_identity_verification_status`.

Phase 6: shadow native verification behind non-production test access only.

- Compare native results against web-owned backend state.
- Keep production users on the web route.
- Do not change route manifest or signup flow during shadow proof.

Phase 7: explicit ownership review.

- Only after all proof gates pass, request explicit approval to change route ownership.
- Route manifest change, production flag, signup flow change, or DB migration require a separate approval.

## Physical Device Proof Required

Native `/verify-identity` cannot become owned by `/app` until physical-device proof exists for both iOS and Android.

Required proof:

- existing verified user loads as verified
- new user completes phone OTP
- OTP resend, rate-limit, expired-code, wrong-code, and success states work
- native liveness passes with valid live-camera movement
- native liveness fails cleanly for invalid movement or permission denial
- native device fingerprint writes and refreshes verification status
- Stripe test SetupIntent succeeds
- Stripe 3DS return path returns to the app and reconciles status
- failed card and blocked identity states match web behavior
- final profile status becomes `verified` only after all four signals are complete
- signup handoff remains web-owned and unchanged until separately approved

## Native Phase Code Parity Gate

Standing rule for every native phase: before any runtime, simulator, browser, or physical-device proof, code parity must be 100%.

Required process:

1. Re-read the web source line by line.
2. Re-read the native source line by line.
3. Build a web-vs-native parity matrix before patching.
4. Identify every behavior, data, state, child surface, modal, sheet, control, copy, route, and UI gap.
5. Patch all gaps in one pass.
6. Re-audit line by line after patching.
7. Only then run simulator/runtime proof.

UI rule:

- No self-created UI style.
- Either match web structure exactly, or use the approved `/app` design tokens/primitives.
- No local one-off button/input/modal/card/sheet styles.
- Raw inputs in touched scope must be migrated to shared primitives.
- Modal/sheet/dialog controls must use shared native modal primitives.
- Any non-token visual value is drift unless proven required by web parity.

Blocked-state report:

If code parity is below 100%, return:

- `PARITY BLOCKED`
- exact gaps
- exact files/lines
- exact patch plan
- no runtime claim

Required output for each native phase:

- web files read line by line
- native files read line by line
- parity matrix
- files changed
- patch diff
- `grep -Rni` proof
- hardcoded/local style audit
- remaining gaps
- `CODE PARITY %`
- `UI PARITY %`
- `SAFE TO RUN RUNTIME PROOF: yes/no`

## Physical Device Test Matrix

Planning only. This matrix does not approve implementation, production route ownership, signup changes, DB/migrations, or real-user verification mutations outside approved test accounts.

| Slice | Device coverage | Preconditions | Steps | Expected proof | Blocked by |
| --- | --- | --- | --- | --- | --- |
| Live SMS OTP: send | iOS physical device and Android physical device | Non-production build with prototype access, authenticated unverified test account, allowed-country real phone number, Turnstile token available, clean OTP challenge state. | Open non-production prototype, expand phone card, enter mobile number, request OTP. | SMS arrives on the device/phone, UI enters code-sent state, resend countdown starts, masked-number accepted copy appears, backend stores active challenge for the account/device. | Real phone number, SMS provider availability, Turnstile production/test configuration. |
| Live SMS OTP: resend/cooldown | iOS and Android | OTP sent and cooldown active. | Try resend during cooldown, wait for cooldown, resend after cooldown. | Resend disabled during countdown, copy shows `Resend in Ns`, resend succeeds only after countdown, new challenge remains tied to same phone/device path. | Time-boxed cooldown, SMS rate limits. |
| Live SMS OTP: wrong code | iOS and Android | Active OTP challenge. | Enter an invalid six-digit code and submit. | UI shows human-facing wrong-code copy only, state remains retryable, challenge handling remains valid until terminal failure/expiry. | Backend attempt limit may move to rate-limit terminal state. |
| Live SMS OTP: expired code | One physical platform minimum if practical, both preferred | Active OTP challenge with known expiry window. | Wait beyond expiry, submit the old code. | UI shows human-facing expired-code copy, challenge ID is cleared where terminal, user can request a new OTP. | OTP expiry duration may be too long for manual proof. |
| Live SMS OTP: rate limit | One physical platform minimum if practical, both preferred | Test phone/account allowed to hit non-production rate limits. | Request/resend enough times to trigger rate limit. | UI shows human-facing rate-limit copy and retry-after/cooldown behavior; no raw provider details shown. | Risk of provider/account throttling beyond test window. |
| Live SMS OTP: country unavailable | iOS and Android | Test input for disallowed SMS country. | Enter disallowed-country number and request/send. | UI enters unavailable state with human-facing unavailable copy; no SMS request should be sent if blocked locally, or backend returns country-unavailable mapped safely. | Allowed-country config must be known for test inputs. |
| Live SMS OTP: verified refresh | iOS and Android | Active OTP challenge and received valid code. | Submit valid code, wait for refresh. | Phone card shows complete, profile/snapshot refresh reads `phone_verification_status=verified`, verification-updated/cache hook fires, next card opens/guides to human. | Backend sync delay, test account profile readiness. |
| Stripe SetupIntent create | iOS physical device and Android physical device | Non-production authenticated test account, Stripe test mode, Stripe publishable key configured, official Stripe React Native SDK initialized, no real charge path. | Expand card card, enter legal name, leave postal code blank, start card check. | `create-identity-setup-intent` succeeds, legal name is required, postal code is optional, secure card entry becomes ready without custom 3DS UI. | Stripe native config, return URL scheme, test account Stripe customer setup. |
| Stripe card completeness | iOS and Android | SetupIntent ready. | Try submit with incomplete card details, then complete Stripe card field. | Submit disabled or blocked until official card field is complete and legal name present; human-facing incomplete-card copy only. | Native Stripe CardField behavior differs by platform. |
| Stripe 3DS return | iOS and Android | SetupIntent ready, Stripe test 3DS card available, app return URL configured. | Submit 3DS test card, complete issuer/bank challenge, return to app. | App shows opening secure bank check, returns to checking-card state, no custom issuer UI, status polling begins after return. | Physical device only, deep-link/app-return config, Stripe test card behavior. |
| Stripe pending/check status | iOS and Android | SetupIntent returns processing/pending or mocked test pending if Stripe allows. | Observe polling; tap Check Status after max pending wait. | Normal then slow polling cadence is respected, check-status copy appears, stale backend status does not override active/local failed/cancelled unless passed/blocked. | Hard to force long pending with Stripe test cards. |
| Stripe failed/cancelled | iOS and Android | SetupIntent ready. | Cancel issuer flow or use failing test card. | UI shows failed/cancelled retry copy, retry resets Stripe runtime state while preserving legal name/postal code only. | Test card/issuer cancel path availability. |
| Stripe blocked support handoff | One physical platform minimum if practical | Test backend/account/card state that returns `blocked_identity`. | Check card status for blocked identity. | Card shows support-needed state, Help & Support path uses identity verification subject/message, no infinite retry loop. | Requires controlled blocked-identity fixture. |
| Real camera/liveness permission denied | iOS and Android | Prototype camera path implemented in non-production build. | Deny camera permission and start face check. | UI shows camera-access human-facing copy, no crash, retry/settings path remains clear. | OS permission reset/setup per device. |
| Real camera/liveness no camera/unavailable | Android emulator is not enough; physical no-camera may be unavailable, so use permission/device capability simulation only if supported. | Device or OS state can make camera unavailable. | Start face check when camera unavailable. | UI shows no-camera human-facing copy and remains retryable. | Modern physical devices usually have cameras; true no-camera may be impractical. |
| Real camera/liveness no face | iOS and Android | Camera permission granted, challenge started. | Point camera away/no face until failure. | UI shows no-face copy, backend challenge completes or marks failed with expected `resultPayload`, retry starts a new challenge. | Detector thresholds and lighting. |
| Real camera/liveness poor lighting | iOS and Android | Camera permission granted, challenge started. | Run challenge in poor lighting. | UI shows lighting hint/failure copy, no raw detector details. | Lighting reproducibility. |
| Real camera/liveness movement failed | iOS and Android | Camera permission granted, challenge started. | Keep face still or move opposite prompt. | UI shows movement prompt failure, result payload contains challenge type and movement metrics. | Detector sensitivity. |
| Real camera/liveness timeout | iOS and Android | Camera permission granted, challenge started. | Do not complete required movement until timeout. | UI shows timeout/retry copy, backend attempt does not remain stuck pending. | Timeout duration may need test patience. |
| Real camera/liveness pass | iOS and Android | Good lighting, camera permission granted, authenticated test account. | Complete prompted live movement. | Human card passes, backend `human_verification_status=passed`, snapshot/profile refresh updates without interrupting capture. | Native live detector implementation and evidence upload policy. |
| Device fingerprint first install | iOS and Android | Fresh install or cleared SecureStore, authenticated test account. | Open prototype and let background device check run. | Install-scoped ID is created in SecureStore, submitted to `verify-device-fingerprint` with native metadata, UI does not expose the device signal. | SecureStore access, backend logging visibility. |
| Device fingerprint relaunch persistence | iOS and Android | Device fingerprint already created. | Force quit/relaunch app and refresh verification status. | Same install-scoped ID is reused, no duplicate reset occurs, status refresh remains separate. | App reinstall/clear-data semantics differ by platform. |
| Device fingerprint legacy migration | One platform minimum if fixture can be seeded | Legacy AsyncStorage ID fixture exists before launch. | Launch prototype with legacy ID present. | Legacy ID migrates into SecureStore and legacy storage is removed. | Requires controlled fixture seeding on device. |
| Device fingerprint reinstall/reset | iOS and Android | Existing install-scoped ID recorded. | Delete app/reinstall or clear app data, then reopen prototype. | New install-scoped ID is created; plan records reset/reinstall behavior as expected, ownership remains not ready until policy accepted. | iOS keychain/SecureStore persistence behavior may vary after uninstall. |
| Final verified status refresh | iOS and Android | Same test account has passed phone, human, card, and device signals. | Trigger final refresh, background/resume app, compare with web-owned `/verify-identity` snapshot. | Native prototype and web source agree on `verified`; profile cache refresh and verification-updated hook update dependent native surfaces; signup handoff remains unchanged. | All previous slices must pass first; backend `refresh_identity_verification_status` is final arbiter. |

### Test Accounts/Data Needed

- Two fresh non-production authenticated accounts per platform: one for happy-path verification and one for failure/rate-limit/blocked-state testing.
- One already verified account to prove verified snapshot load without mutating its verification state.
- Real allowed-country phone numbers that can receive SMS on physical devices; avoid personal production numbers unless explicitly approved.
- One disallowed-country phone number input for country-unavailable proof.
- Stripe test-mode cards for success, 3DS required, failure, cancellation if available, and blocked-identity fixture if backend can seed it.
- Stripe native return URL/scheme configured for the non-production app build.
- Physical iOS and Android devices with camera access and the non-production prototype flag enabled.
- A way to inspect non-production backend rows/logs for `phone_otp_challenges`, `phone_otp_attempts`, `human_verification_attempts`, `identity_card_verifications`, `device_fingerprint_history`, and `profiles` verification fields.
- Clean install/reinstall or secure storage reset procedure for device fingerprint persistence tests.

## Non-Goals For This Artifact

- no code implementation
- no UI implementation
- no native route manifest changes
- no Supabase migrations
- no Stripe configuration changes
- no signup or onboarding flow changes
- no production rollout switch
