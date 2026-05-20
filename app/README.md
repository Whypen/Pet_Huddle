# App Workspace

`/app` is the active native app workspace.

Current native foundation status:

- this workspace is the active native build path
- native shell chrome and a limited set of native-owned content surfaces exist
- no new native route should be added unless `src/routes/ROUTE_MANIFEST.ts` marks the ownership and runtime proof exists

Ownership:

- `src` owns the live web product at `huddle.pet`
- `app` owns all new native implementation work going forward
- `mobile` remains fallback-only and must stay usable, but it is not the default place for new native work
- `src/routes/ROUTE_MANIFEST.ts` owns the native shell route manifest imported by `/app`

Route ownership notes:

- `nativeContentOnly: true` means `/app` renders real native content and hides the WebView.
- `nativeContentOnly: false` with native chrome means the web route remains the content owner.
- `/support` is native-owned in `/app`; the native support form hides the WebView and requires Turnstile before submit.
- `/privacy-choices` is native-owned in `/app`; the native legal page content hides the WebView and uses the internal content key `/nativeprivacychoices`.
- `/settings` is native-owned for account summary, notification preference writes, profile privacy toggles, push preference/device registration path, logout, account deletion, and password change through current-password verification plus Turnstile-backed `auth-change-password`. Physical push delivery still requires device proof.
- `/settings/security` is native-owned for the current authenticator-app TOTP MFA behavior, password change entry/flow, and Biometric Sign In UI/status for existing passkey factors. Passkey/biometric setup and sign-in remain blocked until they have native-safe equivalents and physical-device proof.

Phase 0 copy policy:

- safe to copy: low-risk tooling and workspace foundation such as Expo entry/config templates
- do not copy: old screens, auth flows, navigation trees, hybrid shells, legacy parity baselines, or product feature logic

Identifiers in this scaffold are placeholders on purpose.
They should be finalized in a later native identity/build-config phase, not in Phase 0.
