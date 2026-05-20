# CODEX / CLAUDE EXECUTION RULES

Read this before acting.

## Destructive Action Approval Gate

Any command or tool action that can reset, recreate, erase, overwrite, drop, prune, clean, rollback, checkout away, or otherwise destroy current local/remote progress requires explicit user approval immediately before running it.

This includes, without exception:

- `supabase db reset`, local database reset, remote database reset, migration repair that rewrites history, table drop/truncate, fixture reload that overwrites data, or any DB recreate/wipe operation.
- `git reset`, `git checkout --`, `git clean`, branch deletion, forced checkout, forced push, stash pop/drop, or any operation that can discard worktree, index, branch, or stash state.
- Docker volume removal, container volume reset, cache prune, package lock regeneration that rewrites dependency state, reinstall scripts that remove local state, or any "fresh start" command.
- File deletion, generated artifact cleanup, or bulk rewrite outside the exact touched scope.

If the action might have destructive impact, stop and ask first. Do not infer approval from a request to "sync", "verify", "make local match", "fix migrations", "continue", or "check". Use non-destructive inspection first. If approval is not explicit, do not run the command.

## Remote Schema Proof Gate

Before writing, applying, or marking any database migration complete, prove the real remote schema for every referenced table, column, enum, function, and extension.

- Query `information_schema.columns`, `pg_proc`, `pg_type`, or the relevant catalog on the target remote database before relying on a column or signature.
- Do not infer remote column names from local files, older migrations, TypeScript types, screenshots, or memory.
- After applying an RPC/function migration, execute the changed function against real representative users and report the runtime result. Migration-list sync or `supabase db push` success is not enough.
- If a migration references location/geog columns, prove the exact available geospatial columns first, including whether the column is `location`, `location_geog`, `geog`, or lat/lng-only.
- If source proof and remote schema disagree, the remote schema wins for runtime fixes; add a follow-up migration rather than pretending sync means runtime safety.

## Native Loading / Cache Contract Gate

Every new native feature, field, badge, count, status, or secondary enrichment must be designed into the existing loading/cache contract before implementation is called complete.

- Treat the server DB/RPC response as authority; local memory/AsyncStorage cache is only a last DB-confirmed mirror for fast paint.
- Do not add N+1 client fetches for card/list surfaces. If a list needs a badge/count/status for each row, return a safe compact summary from the list RPC or add a batch RPC; do not call one RPC per row.
- Reuse the owning surface cache key and freshness model. Service-card data belongs in the Service cards/detail RPC/cache, chat data in chat caches, profile summary data in the shared profile summary cache, and so on.
- Scope caches by user/sessionKey and relevant filters/location; block stale writes with the active surface guard where the route already has one.
- Cache-first UI must be followed by DB validation on active surfaces; never let a cache-only value become live truth.
- Use in-flight dedupe for repeated identical reads, but do not mistake dedupe for a fix to unique-row overfetch. If eight rows create eight endpoint calls, the data belongs in the parent RPC or a batch endpoint.
- Use `force: true` only for explicit refresh, foreground validation, or immediately after a mutation/check that can change the data. Normal mount/render paths should not bypass a fresh owning-surface cache.
- Failed DB refresh must keep the last safe cache/UI state; do not write fake empty/null values as if they were live truth.
- When adding a new backend-backed UI signal, report which owning cache surface it belongs to and why it cannot become stale.

## Phase 0 Repo Ownership Contract
The repo has three distinct product workspaces. Do not blur them.

- `src` = web product source of truth for `huddle.pet`
- `app` = new active native app build path for future phased native work
- `mobile` = fallback hybrid submission path only; preserve it, do not grow it by default

Rules:

- Do not work in `src` unless the instruction is explicitly about the web product or a repo-structure change requires it.
- Do not start new native feature work in `mobile`. `mobile` is fallback-only unless explicitly instructed because `app` failed hard.
- Do all new native implementation work in `app`.
- Treat `mobile/src_legacy_parity_baseline_c29abc8_20260420` and similar legacy native material as reference-only, not active runtime.
- Do not copy whole feature slices from `mobile` into `app` by default. Reuse only low-risk foundation files when explicitly justified.
- If a task touches both `app` and `mobile`, explain why. Default is: build in `app`, preserve `mobile`.
- If a task touches both `app` and `src`, state whether the change is native-architecture-only or a deliberate web product change.
- Prevent split-brain development: one active web path (`src`), one active native build path (`app`), one fallback native path (`mobile`).

## App native migration contract
The native app direction is phased, route-owned, and safety-first.

Intention:

- All consumer product pages go native over time.
- Admin and safety surfaces stay web unless there is a strong reason to migrate.
- Sensitive helper, verification, payment, auth callback, reset, and runtime routes stay web until the native foundation is very mature.

Rules:

- Before adding any route to the native roadmap or implementation scope, verify it is an active product route with `grep -Rni` in `src/routes`, `src/routes/ROUTE_MANIFEST.ts`, and the `/app` native route manifest/import surface.
- Native route ownership is direct-navigation-only. Do not add aliases, typo compatibility paths, redirect paths, dormant routes, or deep-link-only helper paths to the native route manifest unless the user explicitly approves that exact route as a product surface.
- Do not spend implementation time on dead, bypassed, redirect-only, legacy, or excluded routes unless the user explicitly revives that route and defines the owner.
- Do not migrate a route just because it is listed as a future native candidate.
- Do not start a new native page unless the user explicitly approves that route for the current pass.
- No route is approved for native implementation by default. Before naming a next route, prove it has a normal in-app navigation entry and explicit current-pass approval.
- Every route migration must preserve the web source-of-truth behavior, data model, action model, disabled/loading/error/success states, callbacks, and ownership.
- `/app` owns native visual treatment through the app design-system tokens; `src` remains the behavior/source-of-truth until each route is fully migrated and proven.
- A route is not fully native-owned until it has native content, route manifest ownership, simulator proof, and no split-brain web/native content ownership.
- For every native route/status pass, agents must include a short progress summary with each route bucket and mark each route as `COMPLETE`, `PARTIAL`, or `PENDING`. If `PARTIAL`, include one short explanation.

Current route status contract:

COMPLETE native-owned now:

- `/support`
- `/privacy-choices`
- `/privacy`
- `/terms`
- `/cookies`
- `/community-guidelines`
- `/service-provider-agreement`
- `/booking-terms`
- `/notifications`
- `/` - native-owned Home surface. Current pass completed profile summary loading/cache usage, Free/no-star two-row summary behavior, no-pet empty state asset/copy parity, pet carousel/read model, avatar-to-edit-profile navigation, and native route ownership proof in iOS simulator.
- `/settings` - native-owned functional settings surface. Tested native ownership includes account/profile summary, notification preference writes, profile privacy toggles, push preference/device registration path, logout, account deletion, and password change through the approved current-password + Turnstile `auth-change-password` model. Physical push delivery still requires device proof.
- `/settings/security` - native-owned Security surface for current authenticator-app TOTP MFA behavior, password change entry/flow, and Biometric Sign In UI/status for existing passkey factors. Passkey/biometric setup/sign-in is the only missing Security item and must not be claimed functional until the native credential bridge is implemented and physically proven.
- `/set-pet` - native-owned onboarding pet profile surface. Current pass completed native route ownership, shared pet-details view-mode code path, active tokenized styling cleanup, photo picker path, save/update/upload code wiring, reminders/medications/vet visit editors, and simulator rendering proof. Remaining remarks: unsigned onboarding draft restore parity from web is not mirrored natively, and end-to-end authenticated mutation proof was user-validated but not independently completed by the agent.
- `/edit-pet-profile` - native-owned add/edit pet profile surface. Current pass completed native route ownership, shared pet-details view-mode code path, pet load/save/update/upload wiring, status toggles, reminders/medications/vet visit editors, and simulator rendering proof. Remaining remarks: end-to-end authenticated mutation proof was user-validated but not independently completed by the agent.
- `/carerprofile` - native-owned pet carer profile surface. Current pass completed native route ownership, edit/view form, shared native carer view renderer for self view and future service-facing provider profile reuse, `pet_care_profiles` load/save/silent-save wiring, profile listing controls, wallet state display, native Stripe wallet onboarding entry, tokenized dropdown/toggle/form styling, and simulator rendering proof. Remaining remarks: native Stripe wallet onboarding was manually verified by the user; final backend mutation proof for every listing/wallet edge state was not independently repeated by the agent.
- `/set-profile` - native-owned profile setup/edit surface. Current pass completed native route ownership and implementation for the profile photo/editorial spread, profile form fields, native profile photo upload/crop/caption handling, profile save wiring, and preview/edit tab surface. Remaining remarks: runtime proof is still missing for the final current implementation.
- `/edit-profile` - native-owned profile edit surface. Current pass completed native route ownership through the shared native profile form, profile photo/editorial spread, phone OTP integration, OS location fill, draft save, preview/edit tab surface, and profile save wiring. Remaining remarks: runtime mutation proof remains required before release-complete wording.
- `/service` - native-owned Service marketplace surface. Current pass completed native route ownership and implementation for native browse/list, filters/search/date/sort controls, provider polaroid cards, profile image resolution, bookmark controls, provider detail/profile modal, explicit deferred request/service-chat handoff, native header/nav compatibility, duplicate web chrome suppression, and Service visual parity tuning. Remaining remarks: runtime proof is still missing for the final current implementation.
- `/social` - native-owned social feed/messaging entry surface. Ownership is approved complete for now under this pass, with route migration proof from manifest parity and direct shell parity review completed.
- `/map` - native-owned map surface. Ownership is approved complete for now under this pass, with route migration proof from manifest parity and direct shell parity review completed.
- Native signup journey - native-owned root-level signup mode through `app/src/screens/NativeSignupScreen.tsx`, including DOB, credentials, email confirmation/link handling, name/social ID, and verify-decision steps. Important route nuance: the web URL paths `/signup/dob`, `/signup/credentials`, `/signup/email-confirmation`, `/signup/verify-email`, `/signup/name`, and `/signup/verify` still exist in `src/routes/ROUTE_MANIFEST.ts` but are not direct `NATIVE_CHROME_ROUTE_MANIFEST` entries. Do not rebuild them as separate native pages unless product explicitly asks for direct URL route ownership.

PARTIAL native-owned read-only or summary:

- `/pet-details` - read-only native surface; edit/mutation behavior is not fully native-owned.
- `/premium` - read-only native membership surface; billing/store/purchase behavior is not fully native-owned unless separately wired and proven.

Native `/settings` mutation contract:

- Current native `/settings` owns notification preference writes, privacy toggle writes, logout plus native session cleanup, account deletion confirmation plus `delete-account` invocation, password change through current-password verification plus the approved `auth-change-password` model, and native confirmation flows.
- Physical push delivery and OS permission behavior still require physical-device proof before release wording can claim push is fully device-proven.
- `/settings/security` must not claim passkey/biometric setup or sign-in yet. The Biometric Sign In row is UI/status only until native has a WebAuthn/passkey credential bridge and physical-device proof.

NEXT native:

- No explicit next candidate is flagged in this pass. Primary remaining candidates remain `/chats`, `/chat-dialogue`, `/service-chat`, and `/verify-identity`, all still pending explicit current-pass approval due heavier realtime/payment/location/verification dependencies.

MUCH later:

- `/chats`
- `/chat-dialogue`
- `/service-chat`
- `/verify-identity`

Keep web longest:

- `/admin`
- `/admin/safety`
- `/admin/control-center`
- `/auth`
- `/auth/callback`
- `/reset-password`
- `/reset-password-direct`
- `/reset-password-inline`
- `/reset-password-inline-healthaction`
- `/update-password`
- `/verify`
- `/join/:code`
- `/turnstile-health`
- `/turnstile-health-resetaction`

Redirect and alias contract:

- `/subscription` and `/manage-subscription` are legacy aliases to `/premium`. Treat both as safe/noise in duplicate-load checks: load once through `/premium` in-app behavior.
- `/premium` is the direct native-owned membership surface today.
- Do not add more membership route names. Alias or typo membership paths are `EXCLUDED / DO NOT BUILD` unless product gives the exact route a real app entry.
- `/discover` is redirect-only today (`/discover` -> `/chats?tab=discover`) and must not be treated as a native page candidate unless explicitly revived.
- `src/pages/Discover.tsx` exists but is bypassed by the current router; do not rebuild or migrate it unless the route is explicitly revived.
- `/ai-vet` is excluded from the native roadmap unless explicitly revived.
- `/marketplace` is registered as a web route, but it has no normal in-app navigation entry today; do not keep it in the native route manifest or spend native implementation effort on it unless product explicitly revives the route and defines the entry point.
- `/threads` is a web Social alias route, not a direct native navigation target; do not keep it in the native route manifest or build it as a separate native page unless product explicitly gives it a direct in-app entry.
- `/managemembership` and `/managesubctiption` are legacy/typo compatibility paths, not direct native navigation targets; do not keep them in the native route manifest or build separate native pages for them.
- `/service-agreement` duplicates `/service-provider-agreement` for app legal information; treat it as `EXCLUDED / DO NOT BUILD` for native route ownership unless product explicitly revives it.
- `/signup/marketing-confirmed` is a marketing double-opt-in email helper, not a normal in-app signup step; treat it as `EXCLUDED / DO NOT BUILD` for native signup migration unless product explicitly revives native ownership for marketing email callbacks.
- `src/pages/Subscription.tsx` is legacy; `/subscription` and `/manage-subscription` now render the shared `/premium` component in-app so they are not separate membership surfaces. Do not rebuild or migrate `Subscription.tsx` as a production membership page unless explicitly revived.
- If a route exists in code but is excluded, redirect-only, or bypassed, mark it `EXCLUDED / DO NOT BUILD` in the progress summary instead of `PENDING`.

Required short progress summary format:

```text
NATIVE ROADMAP STATUS
- COMPLETE:
- PARTIAL:
- PENDING NEXT:
- PENDING LATER:
- WEB LONGEST:
- EXCLUDED / DO NOT BUILD:
- ROUTE STATUS CHANGED THIS PASS: yes/no
- WEB BEHAVIOR CHANGED: yes/no
```

## App-only design system rule
The `app/huddle Design System` package is strictly for `/app` native visual guidance only.

- Current `src` web app remains the source of truth for structure, routes, content, copy, behavior, and product ownership.
- `app/huddle Design System` is only a style/token/component-polish reference for `/app`.
- Use it for colors, typography, spacing, radii, shadows, motion, buttons, fields, chips, cards, native header, bottom nav, and approved native-owned visual polish.
- Do not copy and paste screens, nav labels, copy, route content, or product structure from the design system.
- Do not let the design system override the agreed phase plan, route ownership, auth/session architecture, billing/store logic, map/chat product structure, or current web behavior.
- Treat any older Expo app or UI kit inside the design system as reference-only; extract token values and styling rules, then apply them to current web-derived `/app` native screens/components.

## App design-system preview digest
Agents must treat `app/huddle Design System/preview/` as a contract, not inspiration. Before creating or editing any `/app` UI surface, inspect the relevant preview file(s), express the treatment through active `/app` shared tokens/primitives, and reuse the same component treatment everywhere. Different variants of the same component are UI drift.

Canonical preview contracts:

- `colors-brand.html`: Huddle Blue `#2145CF` is primary CTA/logo/active; Coral `#FF7F50` is warmth/display only; Lime `#BFFF00` is email/lifestyle accent only; Gold `#CFAB21` is verified/Gold tier only.
- `colors-neutrals.html`: primary text `#424965`, subtext `#4A4A4A`, muted surface `#F3F4F6`, blue soft `#EBF5FF`, gold soft `#FFF9E6`.
- `colors-semantic.html`: Emergency `#F97316` is only for lost-pet/hazard broadcasts; Validation `#EF4444` is form errors/destructive; Success `#22C55E`; Warning `#F59E0B`.
- `type-scale.html`: H1 32/700, H2 24/700, H3 20/700, body 16/400, helper 12/400, meta 10/500 uppercase with 0.08em tracking.
- `type-display.html`: display type uses Urbanist 800, uppercase, tight leading, coral for hero warmth. Do not use display treatment inside dense forms, list rows, or compact panels.
- `spacing.html`: use the 8pt scale only: 4, 8, 12, 16, 24, 32, 40, 48, 64. No one-off spacing in page styles unless a shared token cannot express a proven source need.
- `radii.html`: 8 buttons/inputs, 12 cards, 14 form fields, 16 glass cards, 20 glass L1, 24 sheets/nav glass, 28 modals, 9999 pills.
- `shadows.html`: neumorphic controls use neutral grey drop shadows; pressed states invert to inset shadows. Glass uses blue-tinted shadow only on glass surfaces. Never use blue-tinted shadows on neumorphic controls.
- `buttons.html`: exactly five button treatments: primary blue, secondary neumorphic grey, ghost blue outline, Gold tier, destructive red. Height 48, radius 14, label 15/600. Do not create page-local button variants.
- `form-fields.html`: editable form fields use white `#FFFFFF`; read-only form fields use muted `#F3F4F6`. Both use radius 14, padding 10/14, label 11/500, value 15/500, a subtle inset neutral shadow/border; focus adds a 2px Huddle Blue ring without changing label color; error adds a 2px validation red ring plus 12px error text. This applies to text inputs, textareas, phone fields, date fields, select triggers, and composite fields.
- `chips.html`: chips are 32px tall, pill radius, 13/600, gap 6, padding 0/14. Neutral chips use muted surface/border or inset neu shadow; blue/gold/emergency chips are semantic only. Active filter chip is blue with white text.
- `cards.html`: content card is white, radius 12, 1px `rgba(0,0,0,0.04)` border, soft E1 shadow, 14-16px padding. Glass card is translucent white, radius 20, white border, blue-tinted glass shadow. Pet card is 4:5 image/blue fallback with protection gradient and translucent chips.
- `bottom-nav.html`: bottom nav is glass L2, height 72, radius 24, white border, blue-tinted glass shadow, uppercase 10/600 labels, 22px stroke icons, active Huddle Blue with 20x3 indicator. Do not create alternate nav shapes.
- `app-preview.html`: app surfaces use white canvas, centered wordmark, muted inset rows, small blue distance/action accents. Treat it as the compact in-app composition reference, not as permission for new phone-frame decoration.
Implementation rules:

- If a touched `/app` screen contains a local style for a button, field, chip, card, nav item, modal, sheet, row, or typography treatment that duplicates one of the previews, replace it with a shared token/primitive contract before calling the UI complete.
- If the active `/app` primitive does not exist yet, create or extend the shared primitive/token first, then consume it. Do not keep raw per-screen variants.
- A route cannot be marked visually complete while it has component variants that conflict with the preview digest.

## Hard gate: no invented design systems
Agents must not invent a new design system, local visual language, one-off styling family, or ad-hoc token set for any UI work.

- Use shared tokens first for every visual value, including colors, typography, spacing, radii, shadows, opacity, motion, surfaces, controls, modal backdrops, popup backdrops, drawer backdrops, sheet backdrops, and scrims.
- The active `/app` shared token source is `app/src/theme/huddleDesignTokens.ts`. Add or reuse shared values there first; do not place new visual constants in page files when the value can be shared.
- `huddleColors.backdrop` is the only approved native app backdrop color for modal/popup/drawer/sheet dim layers: `rgba(20, 24, 38, 0.28)`. Every app-owned backdrop must reference this shared token directly or through `huddleModalTokens.color.modalBackdrop`; do not hardcode alternate `rgba(...)`, black opacity classes, or page-local backdrop colors.
- `huddleFormControls` is the shared token contract for plain native dropdown/select menus and date-picker columns/options. Every app-owned plain dropdown/date picker must use these tokens for menu radius, borders, padding, max height, option sizing, option radius, and check/selection slots; do not recreate dropdown/date-picker style constants in a screen.
- For native modal/input/button surfaces, use the active primitives and token contracts in:
  - `app/src/components/nativeModalPrimitives.tsx`
  - `app/src/components/nativeModalPrimitives.styles.ts`
  - `app/src/theme/huddleDesignTokens.ts`
  - `app/huddle Design System/native-modal-primitives.tsx`
  - `app/huddle Design System/native-modal-primitives.styles.ts`
  - `app/huddle Design System/native-modal-primitives.md`
- For broader native design-system reference, inspect only the relevant files in `app/huddle Design System/`, including `colors_and_type.css` and the applicable `preview/*.html` token examples, then express the result through active `/app` shared tokens/primitives.
- `app/huddle Design System/preview/form-fields.html` is the mandatory visual contract for every app-owned form field. Agents must inspect it before creating or editing any native input, textarea, phone field, date field, select trigger, composite input, or validation state. Do not invent page-local form field visuals.
- If `huddleModalTokens`, `nativeModalStyles`, or an existing primitive token covers the need, use it exactly. Do not re-create it locally under a different name.
- Do not create local button/input/card/sheet/modal/chip/list-row/header/bottom-nav/dropdown/date-picker style families when shared tokens or primitives exist.
- For non-modal form fields, use an active shared `/app` primitive or token contract that mirrors `preview/form-fields.html`. If the active shared primitive does not exist yet for the needed field type, create or extend the shared primitive/token first, then consume it from the screen. Do not style raw `TextInput` directly in a screen except as a thin wrapper inside that shared primitive.
- Raw `TextInput`, raw select trigger, raw date field, and raw composite input styles in screens are parity drift unless they are only wiring an approved shared primitive/token contract. Existing raw fields in the touched scope must be migrated before calling the UI complete.
- Do not introduce new colors, font sizes, weights, line heights, spacing values, radii, borders, shadows, opacity values, or motion timings unless no existing token can express the required source-of-truth behavior.
- Any new token must be justified in the report with:
  - the exact missing design-system need
  - why existing tokens/primitives cannot cover it
  - the source-of-truth behavior or visual requirement it supports
  - the shared file where the token was added
- If a style value is one-off, duplicated, or not traceable to the design system, treat it as drift and patch it before calling the UI complete.
- Local styles may compose existing tokens, but must not define a competing design language.

## App shared profile data contract
Native self-profile loading is shared infrastructure, not per-screen boilerplate.

- Use `app/src/lib/nativeProfileSummary.ts` for native pages that need the current user's profile summary, country, city, location label, DOB, age-derived display, Social ID, avatar, verification status, privacy flags, tier/family slots, pet experience, or quota snapshot.
- `NativeProfileSummary` is intentionally a broad typed record over the full `profiles` row. Do not create narrower duplicate profile loaders just because a new page needs another profile column; read it from this shared snapshot and extend the shared type only when useful.
- Prefer `readCachedNativeProfileSummary(userId)` for immediate cached UI, then `fetchNativeProfileSummary(userId, { force: true })` when the screen needs a fresh refresh. The helper already dedupes in-flight requests and persists a 6-hour cache in memory plus AsyncStorage.
- Use `subscribeNativeProfileSummary(userId, listener)` when multiple mounted native surfaces need to react to profile writes, and `writeNativeProfileSummaryCache(userId, snapshot)` after a profile mutation so other screens update without reloading.
- Use `clearNativeProfileSummaryCache(userId)` on sign-out/account deletion or when profile ownership changes. Do not leave stale self-profile data in native cache.
- Future native pages must not add new `supabase.from("profiles").select(...)` self-profile queries unless they have a scoped reason that `nativeProfileSummary.ts` cannot satisfy. If an exception is needed, explain why in the report.
- Future native user-profile popups/modals that expose pet cards must reuse `app/src/components/NativePetDetailsModal.tsx` for the nested pet profile popup. That modal already renders the shared `NativePetDetailsContent` used by `/pet-details`; do not create another pet preview body or style family inside the native user profile flow.

## Hard gate: code parity before screenshot proof
This is a blocking gate that every agent must follow. Screen proof is not a substitute for code parity. Before any `/app` screenshot, simulator, browser, or visual proof pass on a native route, agents must do a fresh source-to-native code comparison first.

## Strict native parity definition

For native route migration, parity means the native implementation is source-to-native identical to the active web source of truth for the approved scope, except where a difference is explicitly replaced by approved `/app` tokens or shared primitives without changing product behavior.

Parity requires all of the following:

- same user flow
- same visible UI structure
- same copy/state behavior
- same data/action side effects
- same error/loading/empty/disabled states
- same modal/sheet/card/control behavior
- same spacing/type/color/radius/shadow/motion, unless replaced by approved `/app` tokens/primitives

Before any implementation patch, agents must create a full UI/UX parity matrix with these columns:

```text
Area
Match %
Web behavior
Web UI
App behavior
App UI
Gap
Patch needed
```

Minimum matrix scope:

- route/header/nav behavior
- list/card rows
- primary actions
- secondary actions
- modals/sheets/drawers
- forms/inputs/buttons/chips
- loading/empty/error/success states
- permission/blocked/restricted states
- media/attachments
- notifications/side effects
- animations/motion
- typography/spacing/colors/radii/shadows
- local styles vs approved tokens/primitives

If any row is below 100%, the result is `PARITY BLOCKED`. Runtime, simulator, screenshot, or visual proof is forbidden until code parity is 100%.

No native route, phase, or migration slice may be called complete, parity-matched, safe, or done until this gate passes. If the gate cannot pass, the route/phase status is `PARTIAL` or `NOT VERIFIED`.

UI/UX parity is mandatory. After finishing each phase, agents must review UI/UX code parity against the source of truth before moving on. If any gap, issue, drift, or uncertainty is found, the agent is stuck in the review-and-fix loop for that phase: patch the gap, re-read the relevant source and native code, re-audit, and repeat until the approved scope is 100% code-accounted or an unsolvable blocker is proven. Do not proceed to the next phase, close the work, or call the phase complete while parity gaps remain.

Required order:

1. Read the active web source-of-truth route/component in `src` line by line for the full touched surface.
2. Read every active `/app` native file that owns or supports the same surface line by line.
3. Build a source-to-native parity matrix before editing. The matrix must include every source-of-truth item in these buckets:
   - route, navigation, deep link, push/notification, and return paths
   - data fields, derived fields, enum states, marker/display states, and hidden/expired/sensitive/demo/restricted states
   - read queries, RPC return shapes, direct table selects, cache keys, subscriptions, and refresh paths
   - mutations, RPCs, edge functions, storage uploads, deletes, notifications, social/thread side effects, and cleanup writes
   - UI surfaces, child drawers/sheets/modals, menus, profile/detail surfaces, report/support/share flows, and upsells/paywalls
   - disabled/loading/empty/error/success/cancel/retry states and optimistic/confirmed rollback behavior
   - form validation, field locks, default values, draft/persist behavior, dirty-state rules, media preview/upload/retry/remove behavior
   - auth/session handoff, blocked/restricted filtering, permissions, billing, camera, location, maps, Turnstile, email, verification, upload, and payment returns
   - primitives, icons, typography, padding, spacing, radii, borders, shadows, colors, safe areas, sticky/fixed areas, scroll owners, and touch targets
4. For each matrix row, mark exactly one status: `same`, `implemented differently but equivalent`, `missing`, `intentionally out of scope`, or `not verified`. Silent omissions are not allowed.
5. For every `implemented differently but equivalent` row, explain why the native implementation preserves the same product behavior. For every `intentionally out of scope` row, cite the approved phase/scope reason. If either explanation is missing, the route/phase is `PARTIAL`.
6. Audit backend and data contracts as their own gate. Compare the web source select/RPC/table fields to the native select/RPC/table fields and prove native receives every field needed by the matrix, including fields only used by child modals, notifications, social posting, support/report/share, marker states, sensitive media, and upsell/restriction logic. If the native RPC omits a web field, either extend the RPC/direct select or mark parity `PARTIAL`.
7. Compare behavior and UI contracts in code before opening screenshots:
   - route ownership and navigation entry/return paths
   - data reads, cache usage, subscriptions, and refresh behavior
   - mutations, RPCs, edge functions, storage uploads, deletes, and handoffs
   - disabled/loading/empty/error/success/cancel/retry states
   - child drawers, sheets, modals, disclosures, menus, and nested views
   - form validation, field locks, default values, draft/persist behavior, and dirty-state rules
   - external dependencies: auth, billing, push, camera, location, maps, Turnstile, email, verification, upload, and payment returns
   - primitives, icons, typography, padding, spacing, radii, borders, shadows, colors, safe areas, sticky/fixed areas, scroll owners, and touch targets
8. Patch only drift that the code comparison proves. Do not patch based on memory, screenshots alone, or a visual guess.
9. Re-read the touched web source and native code after every patch, then update the parity matrix. A patch is not complete until the matrix row that caused it is re-audited.
10. Audit again and again until code-proven parity drift is gone across behavior, backend fields, primitives, spacing, padding, visual tokens, and UI/UX states.
11. If a native surface intentionally differs from web because `/app` design-system tokens own native visual treatment, state that exact reason and prove it does not change product behavior.
12. If any behavior, backend field, side effect, child surface, or UI contract cannot be proven equivalent from code, mark it `PARTIAL` or `NOT VERIFIED`; do not call the route complete.
13. Only after this code parity pass may agents run screenshots/simulator checks to catch rendering, safe-area, layout, and runtime issues.
14. If screenshot/simulator proof shows even one drift, stop visual testing, patch the proven drift, then re-run the full code parity gate from step 1 before taking another screenshot or simulator proof.
15. Before proceeding to any next phase, explicitly answer:
   - `Code Parity: NN%`
   - `Safe to move to next Phase: Yes/No`
16. `Safe to move to next Phase` may be `Yes` only when code parity for the completed phase is 100% for the approved scope, all known UI/UX gaps are patched, and runtime proof is either complete or explicitly not required for that phase. If parity is below 100%, continue the review-and-fix loop.
17. Continue through all approved phases without stopping unless there is an unsolvable blocker or issue. If blocked, state the exact blocker and provide the closest-match solution options that preserve the source-of-truth behavior and design-system intent.

The expected standard is 100% code-accounted parity for the approved scope. "Looks right in the simulator" is not proof. "Close enough" is not proof. A screenshot may reveal rendering bugs, but it cannot replace the required code audit.

Every native route parity report must include:

- `WEB SOURCE FILES READ LINE-BY-LINE:`
- `NATIVE FILES READ LINE-BY-LINE:`
- `PARITY MATRIX COMPLETED: yes/no`
- `PARITY MATRIX GAPS: none/list`
- `BACKEND/RPC FIELD PARITY VERIFIED: yes/no`
- `MISSING BACKEND/RPC FIELDS: none/list`
- `CHILD SURFACES VERIFIED: yes/no`
- `SIDE EFFECTS VERIFIED: yes/no`
- `CODE PARITY: NN%`
- `SAFE TO MOVE TO NEXT PHASE: yes/no/not applicable`
- `CODE PARITY DRIFT FOUND: yes/no`
- `CODE PARITY DRIFT PATCHED: yes/no`
- `CODE PARITY RE-AUDIT PASSES:`
- `UNPATCHED PARITY GAPS:`
- `SCREENSHOT/SIMULATOR USED AFTER CODE PARITY: yes/no`

If an agent cannot list the exact web and native files read line by line, the pass is incomplete even if screenshots look correct.

## App simulator mirror gate
For all `/app` related changes, the simulator is the native runtime truth.

- Always reflect every `/app` change in the iOS/Android simulator before calling the pass safe.
- Use the simulator to confirm the native implementation mirrors the web source-of-truth ownership, data model, action model, and behavior.
- Web remains the truth for product structure, route ownership, data reads, mutations, state transitions, permissions, disabled/loading/error/success behavior, and child surfaces.
- `/app/huddle Design System` remains the truth for native visual treatment: tokens, spacing, typography, radii, shadows, controls, chrome, and native polish.
- Do not let simulator visuals override web behavior. Do not let web styling override `/app` design-system tokens.
- Simulator proof must not click, submit, swipe, confirm, delete, invite, remove, purchase, upload, verify, sign out, or otherwise trigger a real mutation unless that exact mutation is the approved scope of the pass.
- When proving a mutating control exists in a read-only or UI-only pass, use non-mutating evidence: source inspection, disabled-state proof, mock/test data, screenshots before activation, or explicitly mark the mutating runtime step `NOT VERIFIED`.
- If a runtime check accidentally mutates user, backend, billing, entitlement, family, profile, notification, upload, verification, or account state, stop immediately, report the exact action and visible result, and do not repair or mutate again without explicit user approval.
- If a simulator check cannot be run, mark `/app` runtime proof as `NOT VERIFIED`, say exactly why, and do not claim the native change is complete.

## Web-to-native release gate
Native deployment must verify the web source of truth without casually editing it.

- For native deployment work, treat `src` as read-only by default. Do not touch `/src` unless the user explicitly asks for a web product change or a repo-structure bridge change is strictly required and approved.
- Native clean commits must not change web product behavior. For `/app` native deployment work, `/src` is evidence/source-of-truth only.
- Do not stage or edit `/src/pages`, `/src/components`, `/src/hooks`, `/src/lib`, web styles, web UI, or web behavior files during a native-only pass.
- The only `/src` exception allowed in a native-only commit is an explicitly approved shared contract file used by `/app`, such as `src/routes/ROUTE_MANIFEST.ts`.
- Any `/src` shared-contract change in a native-only pass must be metadata/ownership only. It must not change rendered web UI, data fetching, mutations, auth behavior, billing behavior, redirects, or standalone browser behavior.
- If a native fix appears to require a web behavior change, stop and report it separately as a web-source issue. Do not patch it inside the native pass without explicit approval.
- Verify `src` and the live deployed web app to understand ownership, data, actions, routes, callbacks, and behavior. Verification is not permission to edit.
- If native work reveals a web defect, report it separately as a web-source issue. Do not patch `/src` inside the native deployment pass unless the user approves that separate scope.
- Before any native release/build/submission, prove the WebView-backed routes point at the expected live web version and that `huddle.pet` is serving the expected asset/build.
- Confirm the native route allowlist separates native-owned routes from web-backed routes. Native-only routes must have native content; web-backed routes must keep web content ownership.
- Confirm web chrome is suppressed only inside native shell and remains normal on standalone web.
- Confirm auth/session handoff works for fresh install, login, web signup handoff, relaunch, token refresh, and sign out before claiming the native release safe.
- Confirm deep links, push taps, notification routes, external links, mail links, payment returns, auth callbacks, and app resume route to the correct native or web owner.
- Confirm production native config before release: bundle/package IDs, scheme, associated domains/deep links, notification permissions, Apple Sign-In, environment variables, Supabase URL/key, and EAS project ID.
- Simulator proof is required for `/app`; physical device proof is also required for push notifications, camera, payment app/browser returns, biometrics/passkeys, and any OS permission behavior that the simulator cannot prove.
- Before final native release wording, report: `WEB SRC TOUCHED: yes/no`, `WEB LIVE VERSION VERIFIED: yes/no`, `NATIVE BUILD CONFIG VERIFIED: yes/no`, `ROUTE OWNERSHIP VERIFIED: yes/no`, `AUTH HANDOFF VERIFIED: yes/no`, `DEEP LINK / PUSH ROUTING VERIFIED: yes/no`, `SIMULATOR PROOF: pass/fail/not verified`, `PHYSICAL DEVICE PROOF: pass/fail/not required`, `SAFE FOR TESTFLIGHT / INTERNAL BUILD: yes/no`, and `SAFE FOR STORE SUBMISSION: yes/no`.
- Final native-only reports must also say: `WEB BEHAVIOR CHANGED: yes/no`. For native-only commits this must be `no`.

## Clean commit boundary gate
Native deployment commits must be reproducible from Git without polluting web ownership.

- Never use `git add .` or broad path staging in a dirty repo.
- Stage only the exact files required for the approved pass.
- For `/app` work, include every required `/app` dependency imported by touched native files: screens, components, theme/tokens, native helpers, native assets, app config, and package/lockfile changes when new native packages are imported.
- Do not leave imported `/app` files untracked. A simulator pass is not enough if CI, EAS, or TestFlight cannot reproduce the same app from Git.
- Do not include `/src/pages`, `/src/components`, `/src/hooks`, `/src/lib`, backend, Supabase, or `mobile` files in a native commit unless the user explicitly approves that exact cross-layer change.
- After staging, run `git diff --cached --name-only`, `git diff --cached --check`, and targeted app typecheck/build/lint.
- If a touched `/app` file imports an untracked local file, either stage that dependency or remove the import. Do not commit a state that only works on the current simulator because of untracked local files.
- Final reports for non-trivial native commits must include: `STAGED FILES`, `WEB PRODUCT FILES STAGED: yes/no`, `WHY ANY /src FILE IS STAGED`, `UNTRACKED IMPORTS LEFT: yes/no`, and `CI/EAS REPRODUCIBLE FROM GIT: yes/no`.

## App modal/input UI contract
For `/app` native modals, consistency is a hard contract, not polish.

Broadcast Alert modal is the approved native bottom-sheet safe-padding reference for `/app`.

- All app-owned bottom sheets must use the shared `AppBottomSheet`, `AppBottomSheetHeader`, `AppBottomSheetScroll`, and `AppBottomSheetFooter` primitives from `app/src/components/nativeModalPrimitives.tsx`.
- Safe padding means top, bottom, side, and scroll safety together; a sheet is not safe if only one edge is padded.
- Sheet bodies scroll by default with `keyboardShouldPersistTaps="handled"` unless the surface is a tiny confirm modal.
- Fixed footers must use the shared Broadcast Alert-derived footer tokens from `huddleMapBroadcastFooter`.
- Do not add page-local sheet padding, footer padding, scroll padding, or close-position styles unless product explicitly approves that exception.

Before editing any `/app` native modal, inspect and reuse or port:
- `app/huddle Design System/native-modal-primitives.tsx`
- `app/huddle Design System/native-modal-primitives.md`
- Active `/app` implementation lives at `app/src/components/nativeModalPrimitives.tsx` with styles/tokens in `app/src/components/nativeModalPrimitives.styles.ts`. Import active app code from `../components/nativeModalPrimitives`; do not import runtime screens directly from `app/huddle Design System`.

- These primitives are mandatory contracts for app-owned modal sub-controls, not optional inspiration and not a partial reference.
- If an active `/app` shared primitive exists or can be ported, every modal sub-control in the touched modal must use that primitive or its exact token/style contract:
  - close control
  - text input
  - textarea / multiline input
  - checkbox / toggle
  - select / segmented control
  - helper text
  - error text
  - primary/secondary/destructive buttons
  - action row
  - modal card/island
- Do not create local one-off modal sub-control styles because using the primitive is inconvenient.
- Do not say "use the design system as a reference" for modal controls. The correct standard is: enforce the primitive contract.
- Any exception requires explicit user approval, the exact reason the primitive cannot be used or ported, and a screenshot/runtime proof that the exception still matches the contract.
- Standard modal wiring: `Modal` -> `nativeModalStyles.appModalBackdrop` -> `nativeModalStyles.appModalSafeArea` -> `AppModalCard` -> optional `AppModalCloseButton` -> `AppModalScroll` -> content -> `AppModalActionRow` with `AppModalButton`.
- Standard field wiring: use `AppModalField` for single-line and multiline inputs, pass `focused` and `error`, and render validation with `AppModalError`. Use `AppModalCard fullHeight` only for legal/document-length modals.
- Use one shared modal close placement/style: `styles.appModalClose` or its shared replacement.
- Use one shared modal input style family for all app-owned modal fields:
  - rest
  - focus
  - error
  - placeholder typography
  - inner padding
- Use one shared modal card/island style family for all app-owned modals:
  - outer edge/border treatment
  - radius
  - shadow/elevation
  - side padding
  - top/bottom padding
  - content gap
- Use one shared modal button style family:
  - button height
  - button radius
  - inner padding
  - primary/secondary colors
  - disabled state
  - loading state
  - side-by-side action layout when two peer actions are present
- Use the same subtext spacing, error line spacing, and field-to-error spacing across all modal fields and verification widgets.
- Modal content must always be scroll-safe. Long text input must not expand the layout or push primary actions off-screen.
- Top/bottom padding and side padding must be consistent across app-owned modals unless explicitly approved.
- Do not add modal-specific close buttons, input padding, placeholder typography, focus states, error states, or error spacing without an explicit design reason.
- Do not open app-owned flows through web route WebViews. Build app-owned flows in `/app`; use WebView only for embedded web-origin requirements such as third-party widgets, hosted documents, or legally required web content.
- Native Turnstile is a shared component. Use `app/src/components/NativeTurnstile.tsx` plus `app/src/lib/nativeTurnstile.ts` for all `/app` Turnstile surfaces (`support_ticket`, `reset_password`, `change_password`, or future approved actions). Do not create per-screen Turnstile WebViews, duplicate message handlers, or add an extra native border/background around the Cloudflare widget.

## Native shell contract
Global shell controls are product contracts. Do not repurpose them during route migration or page repair.

- The native global header has exactly three fixed controls:
  - notification icon opens notifications
  - huddle logo navigates Home
  - settings icon opens the settings drawer
- Do not route a shell-owned control directly to a content page when its source-of-truth behavior opens a drawer, sheet, modal, menu, or another shell surface.
- Page routes and shell controls must keep separate ownership. Fix route content in the route owner; fix shell behavior in the shell owner.
- Do not make global header behavior route-dependent unless the source web shell already does so and the user explicitly approves the native difference.
- Do not delete, bypass, or replace a shell drawer/sheet to solve a route-content issue.
- Before changing any global header, bottom nav, drawer, or sheet owner, inspect the web source line by line and write down:
  - trigger owner
  - open/close state owner
  - geometry: drawer, sheet, modal, full screen, side, bottom, centered
  - nested subviews
  - return/reopen behavior
  - read paths
  - mutation paths
  - checkout/billing paths
- If the native pass is read-only, preserve the read-only shell/UI shape but do not invent replacement behavior for blocked mutations. Mark blocked actions as deferred in the report.

## No-permission change gate
No-permission changes are regressions even when the code compiles.

- Do not change a component's behavior, geometry, ownership, or data contract unless the user asked for that exact change or it is strictly required by the scoped fix.
- Do not replace a drawer with a popup, a sheet with a modal, a route with a drawer, or a native surface with a web route unless explicitly approved.
- Do not simplify a feature by removing rows, subviews, data loading, return behavior, or child modals and then call it restored.
- Do not implement placeholder behavior that looks functional when the real web behavior performs mutation, checkout, entitlement, invite, delete, upload, or verification work. Either implement the approved real behavior or explicitly defer it.
- Before editing an existing component, grep the current implementation and the web source of truth, then list what must remain unchanged.
- After editing an existing component, grep for removed imports, removed state, removed rows, removed subviews, and removed data calls before declaring completion.

## Simplify-before-adding gate
Agents must make the codebase lighter when safely possible. Do not stack new code on top of bad code by default.

- Before adding a new component, helper, route, bridge, style block, dependency, or state layer, inspect whether the existing code should be corrected, replaced, or deleted instead.
- Prefer revising the wrong owner over adding a parallel owner.
- Prefer removing dead, duplicate, unreachable, or superseded code in the touched scope over leaving both old and new paths active.
- Keep the deployment payload minimal: no new package, build step, asset copy, bridge, environment variable, native plugin, or web change unless it is required by the scoped fix.
- Do not preserve bad code just because another layer can mask it. Fix the root owner when it is inside the approved scope.
- Do not refactor unrelated files for cleanliness. Simplification must stay inside the touched scope and must preserve behavior proven from the source of truth.
- If simplifying would change product behavior, data ownership, route ownership, or visual parity, stop and ask instead of deciding alone.
- Final reports for non-trivial changes must include: `CODE REMOVED/SIMPLIFIED: yes/no`, `DUPLICATE PATHS LEFT: yes/no`, and `NEW DEPLOYMENT WEIGHT ADDED: yes/no`.

## Layer ownership diagnosis gate
Never fix in a layer until ownership is proven.

- Before any `/app` fix, study the current web behavior first. Inspect the source file in `/src` and, when behavior/UX matters, inspect the rendered web route.
- Identify the true owner before editing:
  - web product behavior owner (`src`)
  - native shell/chrome owner (`app`)
  - native route/content owner (`app`)
  - backend/database/function owner (`supabase`)
  - fallback/reference owner (`mobile`, normally read-only)
- Patch only the owning layer. Do not fix a web data/action issue with native masking. Do not fix native chrome by changing web route behavior. Do not fix backend schema/API drift with UI conditionals unless explicitly approved.
- During native work, `/src` is source-of-truth evidence, not an edit target, unless the user explicitly approves a web change.
- If the root cause spans layers, report the split and ask before crossing ownership boundaries, unless the user already scoped a cross-layer fix.
- Before editing, write the layer decision in the working notes/report: `ROOT OWNER: web/native-shell/native-content/backend/config`, `LAYERS INSPECTED`, and `LAYERS TOUCHED`.
- If owner cannot be proven, mark `NOT VERIFIED` and do not patch.

## 1. Core rule
Execute tightly. Do not drift. Do not widen scope unless required to fully close the requested flow.

## 2. No partial fixes
If a flow is broken, fix the whole related flow in one pass.
Do not stop at the first patch if any related runtime, UI, DB, auth, callback, CORS, deploy, or state issue remains.

## 3. Separate state clearly
Always distinguish and report separately:

- LOCAL CODE CHANGED
- PUSHED TO MAIN
- BACKEND DEPLOYED
- FRONTEND DEPLOYED
- ACTUALLY LIVE
- WHAT CAN BE TESTED RIGHT NOW

Never blur local, deployed, and live state.

## 4. Dirty repo discipline
Assume the repo may already be dirty.

- Do not touch unrelated dirty files
- Do not include unrelated local changes in commit
- Do not “clean up” unrelated things unless explicitly asked
- Commit only intended files for the pass

## 5. Upload / deploy scope rule
Always keep upload and deploy scope minimal.

- NEVER upload or deploy the whole repo when only related files are needed
- ONLY upload/deploy changed files, changed functions, changed artifacts, or required build output for the pass
- Do not bulk overwrite untouched runtime
- If a platform requires a full build artifact for frontend deployment, state that explicitly before doing it
- Do not use full-archive upload unless explicitly approved

## 6. Deploy discipline
### Backend / functions
- Deploy only changed functions
- Apply only required migrations
- Never bulk deploy unrelated backend scope

### Frontend
- Prefer Git-backed production deploy from pushed commit
- Do not claim a frontend fix is live unless the target deployment is ready
- If frontend deploy inherently rebuilds the app, state that clearly and keep all other scope minimal

## 7. Migration discipline
Whenever DB or backend schema may be affected, always prove migration sync.

Required commands unless explicitly not applicable:
```bash
supabase migration list
supabase db push
supabase migration list
```

Rules:
- local and remote migration history must match before calling anything safe
- local and remote migration history must match after push too
- if mismatch exists, stop and explain exactly what is mismatched
- do not hand-wave migration drift
- do not claim schema is live without migration proof

## 8. Browser-called route rule
For every browser-called endpoint or function, prove all of these:

- function exists remotely
- `OPTIONS` preflight returns `200`
- success path keeps correct CORS headers
- error path keeps correct CORS headers
- browser request hits intended wrapper/function
- no remaining direct bypass path exists

## 9. UI rule
If UI is touched:

- follow the requested placement exactly
- match the referenced UI exactly when parity is requested
- do not invent a near match
- do not leave duplicate visible controls for the same state
- do not leave hidden or contradictory UI states

## 10. Sensitive flow rule
For auth, payments, map, service, notifications, or other sensitive flows, code proof is not enough.

You must explicitly separate:
- code proof only
- backend proof only
- live runtime proof
- blocked by environment

Do not call anything fixed without runtime proof when runtime proof is required.

## 11. Search rule
Use:
```bash
grep -Rni
```

Do not use `rg` unless explicitly allowed.

## 12. Front-load proof
Proof is part of the task, not a later follow-up.

Before calling anything safe, include the full proof bundle in the same reply.

## 13. Required proof bundle
Return all of these whenever relevant:

- FILES AUDITED
- ROUTE SEARCH OUTPUT
- WHAT BROKE
- WHY IT BROKE
- FILES CHANGED
- PATCH DIFFS
- EXACT COMMANDS RUN
- GIT STATUS BEFORE
- GIT STATUS AFTER
- PUSHED TO MAIN: yes/no
- BACKEND DEPLOYED: yes/no
- FRONTEND DEPLOYED: yes/no
- ACTUALLY LIVE: yes/no
- WHAT CAN BE TESTED RIGHT NOW
- DATABASE / MIGRATION SYNC PROOF
- HEADER/TOKEN TRACE PROOF (if auth/browser route involved)
- LOCAL RUNTIME PROOF
- LIVE RUNTIME PROOF
- FUNCTION DEPLOY OUTPUT
- FRONTEND DEPLOY STATUS
- TEST RESULTS
  - npm run lint
  - npm run build
- MANUAL VERIFICATION STEPS
- SAFE TO PUSH: yes/no
- SAFE TO DEPLOY LIVE: yes/no

## 14. Failure rule
If any required proof is missing, or any targeted flow is still broken, mark:

- SAFE TO PUSH: no
- SAFE TO DEPLOY LIVE: no

Do not make the user ask for missing proof later.

## 15. Runtime-first honesty
If something cannot be verified:

- say exactly what cannot be verified
- say why
- give the exact command or manual step to verify it

Do not fake certainty.

## 16. Every-pass prevention gate
Before calling any pass safe, run the applicable gates below and report what passed, failed, or was not applicable:

1. Scope gate: list touched files and confirm unrelated dirty files are not included.
2. Code gate: run `git diff --check` plus targeted lint/type/build for the touched surface.
3. Import gate: verify every new local import is tracked and every new package is committed in `package.json` and lockfile.
4. TDZ gate: run a production-preview browser smoke for every touched route.
5. Behavior gate: test the exact user action that changed, not just route load.
6. Failure-state gate: verify loading, empty, error, retry, and success states for any changed async UI.
7. Persistence gate: for writes, refresh/reopen and confirm data still appears.
8. Copy gate: inspect visible copy for huddle tone, correct capitalization, no debug text, and no unwanted ellipses.
9. Performance gate: do not add background fetches for hidden UI; expensive data loads must be user-triggered or explicitly justified.
10. Deploy gate: after push, verify Git remote hash, Vercel Ready, live asset, and live smoke before saying live.

## 17. Execution order
Follow this order unless explicitly told otherwise:

1. audit exact in-scope files and routes
2. identify root cause
3. fix all related code paths in one pass
4. run local proof
5. push only intended files
6. deploy only intended backend changes
7. verify frontend production deploy if frontend changed
8. run live proof
9. return full proof bundle in one reply

## 18. Default constraints
Unless explicitly approved:

- no broad refactors
- no unrelated cleanup
- no full-repo uploads
- no full-archive deploys
- no architecture changes beyond the requested pass
- no “looks fine” without evidence

## 19. Final rule
Do not drift.
Do not leave hidden errors behind.
Do not return with partial proof.
