# No Mistake Codex

Read this before every rebuild, repair, parity, shell, route, UI, deploy, or audit pass.

This file is not an incident log. It is a generic prevention gate. Every agent must apply these rules to every page and flow, not only to the page that caused a previous mistake.

## Core Rule

- Mirror the current source of truth exactly.
- Do not interpret, redesign, simplify, or approximate unless the user explicitly asks for that.
- Do not keep native, legacy, or previous-pass styling just because it already exists.
- Do not call a flow complete from code inspection alone when runtime proof is required.
- Do not turn a specific previous bug into a narrow special case. Extract the rule and apply it everywhere.

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

## Source Of Truth Gate

Before editing any page, route, modal, drawer, sheet, shell control, or flow:

1. Identify the source-of-truth file or rendered product surface.
2. Read the exact source file line by line for the area being changed.
3. Inspect the actual rendered source surface when visual or interaction parity matters.
4. List what must remain unchanged:
   - route ownership
   - shell ownership
   - surface type
   - data reads
   - mutations
   - child surfaces
   - external callbacks
   - checkout, auth, upload, notification, map, or verification dependencies
5. If the source of truth is unclear, stop and say what is missing. Do not invent.

## App Simulator Truth Gate

For all `/app` related changes:

1. Treat the iOS/Android simulator as the native runtime truth.
2. Run the changed `/app` surface in the simulator before calling it safe.
3. Use simulator proof to confirm the native implementation mirrors the web source-of-truth:
   - route ownership
   - data model
   - read paths
   - mutation/action model
   - state transitions
   - permissions
   - loading, disabled, empty, error, success, cancel, and retry behavior
   - child surfaces and return/reopen behavior
4. Keep `/app` visual treatment on `/app` design-system tokens:
   - colors
   - typography
   - spacing
   - radii
   - shadows
   - native controls
   - native chrome
5. Do not use simulator appearance to justify behavior drift from web.
6. Do not copy web styling when `/app` design-system tokens define the native treatment.
7. If simulator proof is missing, status is `NOT VERIFIED`; do not call the `/app` change complete.

## Web-To-Native Release Gate

Native deployment must verify the web source of truth without casually editing it.

1. Treat `src` as read-only by default during native deployment work.
2. Do not edit `/src` unless the user explicitly asks for a web product change or explicitly approves a required repo-structure bridge change.
3. Use `src` and the live deployed web app to verify:
   - product ownership
   - route ownership
   - data model
   - read paths
   - mutation/action model
   - callbacks
   - disabled/loading/error/success behavior
   - child surfaces
4. Verification is not permission to edit. If native work reveals a web defect, report it separately as a web-source issue.
5. Before native release/build/submission, prove the WebView-backed routes point at the expected live web version.
6. Prove `huddle.pet` is serving the expected asset/build before relying on it inside the native app.
7. Confirm the native route allowlist separates native-owned and web-backed routes:
   - native-only routes have native content
   - web-backed routes keep web content ownership
   - route aliases and redirects are intentional
   - no route has split-brain ownership
8. Confirm web chrome suppression applies only inside native shell and standalone web remains normal.
9. Confirm auth/session handoff for:
   - fresh install
   - login
   - web signup handoff
   - relaunch
   - token refresh
   - sign out
10. Confirm routing for:
   - deep links
   - push taps
   - notification destinations
   - external links
   - mail links
   - payment returns
   - auth callbacks
   - app resume
11. Confirm production native config:
   - bundle/package IDs
   - scheme
   - associated domains/deep links
   - notification permissions
   - Apple Sign-In
   - environment variables
   - Supabase URL/key
   - EAS project ID
12. Simulator proof is required for `/app`; physical device proof is required for push, camera, payment app/browser returns, biometrics/passkeys, and OS permission behavior that the simulator cannot prove.
13. Native release completion must report:
   - `WEB SRC TOUCHED: yes/no`
   - `WEB LIVE VERSION VERIFIED: yes/no`
   - `NATIVE BUILD CONFIG VERIFIED: yes/no`
   - `ROUTE OWNERSHIP VERIFIED: yes/no`
   - `AUTH HANDOFF VERIFIED: yes/no`
   - `DEEP LINK / PUSH ROUTING VERIFIED: yes/no`
   - `SIMULATOR PROOF: pass/fail/not verified`
   - `PHYSICAL DEVICE PROOF: pass/fail/not required`
   - `SAFE FOR TESTFLIGHT / INTERNAL BUILD: yes/no`
   - `SAFE FOR STORE SUBMISSION: yes/no`

## Visual Parity Gate

For every page or component that claims parity:

1. Capture or inspect the current rendered baseline first.
2. Copy exact assets before layout work.
3. Copy exact visual tokens before behavior work:
   - spacing
   - radii
   - font sizes
   - font weights
   - colors
   - borders
   - shadows
   - icon family, icon size, and stroke weight
4. Build the layout to match the baseline, not memory.
5. Compare same viewport/device screenshots.
6. If any obvious mismatch remains, status is `PARTIAL` or `MISMATCH`, not complete.
7. Never claim parity from route wiring, static screenshots, or "close enough" visual similarity.

## Shared Native Surface Gate

When a native screen contains a view mode, preview mode, summary mode, or read-only body that mirrors another approved native route:

1. Check whether `/app` already has the correct native body for that surface.
2. If the correct native body already exists, extract and reuse the same shared render code.
3. Do not patch toward parity by copying styles, matching icons one by one, or rebuilding a second near-identical body inside another screen.
4. Parity is not acceptable when two native surfaces look similar but are rendered by separate duplicate implementations.
5. If shared extraction is blocked, mark the surface `PARTIAL` and state the exact blocker.

## Dead UI Code Gate

After replacing a duplicated surface with a shared native component:

1. Remove obsolete preview, summary, mirror, or fallback UI code from the old owner.
2. Remove obsolete styles, helper functions, and local visual constants that only served the deleted duplicate path.
3. Do not leave dead parallel UI code in place "just in case".
4. Dead UI code counts as parity risk because future edits may accidentally patch the wrong implementation.
5. Before calling the pass complete, grep the touched file for the removed surface names and confirm the old path is gone.

## Token Audit Gate

Token compliance must be proven after edits, not assumed.

1. After every touched `/app` screen or component, run a targeted grep sweep for leftover hardcoded visual values in the active path:
   - `rgba(`
   - hex fills
   - page-local `backgroundColor`
   - page-local `borderColor`
   - one-off shadow values
2. Distinguish active styles from dead code before deciding whether a token addition is needed.
3. Replace active hardcoded values with shared tokens or shared primitives.
4. Delete dead local style blocks instead of tokenizing them.
5. Do not call a screen tokenized or design-system-clean until this sweep is done.

## Target Surface Proof Gate

Screenshot or simulator proof must confirm the intended app surface before it is used as evidence.

1. Before capturing proof, verify the app is on the intended route, state, and owner surface.
2. If the simulator is showing a system picker, permission sheet, browser handoff, background state, stale route, or unrelated modal, stop and re-establish the target surface first.
3. Do not use screenshots from non-target surfaces as route proof.
4. Route proof must state whether the screenshot was taken:
   - on the target route
   - inside a child/system surface
   - before or after the intended interaction
5. If the target route cannot be proven on-screen, mark screenshot proof `NOT VERIFIED`.

## Media Flow Proof Gate

Media flow proof has separate checkpoints. Do not collapse them into one claim.

1. Prove picker reachability separately from upload success.
2. Prove upload success separately from persisted data success.
3. For image/file/media flows, distinguish:
   - picker opened
   - item selected
   - upload request executed
   - remote URL/storage object created
   - saved record updated with the uploaded reference
   - downstream screen reflects the persisted asset
4. Seeing a system picker or a visible `Choose` action is not upload proof.
5. If only picker reachability is proven, report exactly that and no more.

## Shared Token Addition Gate

Adding tokens is allowed only for live product needs.

1. Add a new shared token only when an active rendered path needs a value that existing tokens or primitives cannot express.
2. Do not add shared tokens only to support dead styles, removed preview paths, or unused local code.
3. Before adding a token, confirm the value belongs to a live touched surface after duplicate UI code has been removed.
4. If the need disappears after dead code cleanup, do not add the token.
5. Every new token should map to a live current surface, not a speculative future one.

## Asset And Icon Gate

Before replacing or adding any visual asset:

1. Verify the exact asset filename and source chain.
2. Use the real product asset when it exists.
3. Do not substitute icons, logos, illustrations, placeholder images, or fallback media without explicit approval.
4. If an exact asset is missing, state that it is missing and mark the surface partial.

## Behavior Proof Gate

For every changed flow:

1. Test the exact user action, not only page load.
2. Prove the state before the action, during the action, and after the action.
3. Verify disabled, loading, error, empty, success, back/close, and retry states when the flow owns them.
4. If the flow depends on auth, payments, map, services, notifications, uploads, camera, email, push, CORS, callbacks, or database state, separate:
   - code proof
   - backend proof
   - local runtime proof
   - live runtime proof
   - blocked by environment
5. Runtime proof must not mutate real user, backend, billing, entitlement, family, profile, notification, upload, verification, or account state unless that exact mutation is the approved scope of the pass.
6. For read-only, UI-only, or audit-only passes, do not click submit/confirm/delete/invite/remove/purchase/upload/verify/sign-out controls on real data. Prove them with source inspection, disabled-state proof, mock/test data, screenshots before activation, or mark the mutating step `NOT VERIFIED`.
7. If runtime proof accidentally triggers a mutation, stop immediately, report the exact action and visible result, and do not perform a compensating mutation or repair without explicit user approval.
8. If runtime proof is missing, say `NOT VERIFIED`.

## Third-Party And Widget Gate

Before claiming any route with third-party, browser, security, iframe, payment, upload, map, camera, notification, auth callback, email, or native bridge behavior works:

1. List every external or backend-dependent widget on the route.
2. Prove the widget loaded with network evidence.
3. Prove the widget completed with DOM/state/app evidence.
4. Prove submit or callback reached the intended endpoint or handler.
5. Prove success and error paths keep the expected headers, state, and UI behavior.
6. Do not infer success from iframe visibility, partial `200` asset loads, screenshots, or absence of console errors.

## UI Contract Gate

Before shipping UI route parity:

1. Inspect the route against `UI_CONTRACT.md`, `APP_MASTER_SPEC.md`, `ui_design_system.md`, and the applicable design-system files.
2. Use shared primitives for controls when they exist.
3. Do not introduce raw controls where the product has approved primitives.
4. Check for:
   - raw inputs/selects/textareas where primitives are required
   - wrong typography
   - wrong spacing
   - wrong color tokens
   - duplicate controls
   - hidden contradictory states
   - non-token styling that should be shared
5. Run a targeted grep for raw controls on changed web UI:
   `grep -Rni "<input\\|<select\\|<textarea" src/ --include="*.tsx" --include="*.jsx" | grep -v "FormField\\|NeuControl\\|NeuCheckbox\\|NeuToggle\\|NeuSlider\\|NeuDropdown\\|NeuSegmented\\|UploadZone"`
6. Mark any unresolved contract mismatch as `PARTIAL` or `BROKEN`.

## Modal, Drawer, Sheet, And Route Surface Gate

Surface type is product behavior, not styling.

Before editing any modal, drawer, sheet, page, route, or popup:

1. Classify the exact source surface type:
   - right drawer
   - left drawer
   - bottom sheet
   - centered modal
   - full-screen modal
   - inline panel
   - route/page
2. Record exact source geometry:
   - width and max width
   - height
   - side or anchor
   - top/bottom offsets
   - safe-area handling
   - backdrop
   - scroll owner
   - close behavior
3. Preserve nested views, return/reopen behavior, and state resets.
4. Do not convert one surface type into another without explicit user approval.
5. A screenshot showing "something opens" is not proof that the correct surface was restored.

## Native Modal/Input Gate

For `/app` native modals:

1. Inspect and reuse or port the shared modal primitives before editing:
   - `app/huddle Design System/native-modal-primitives.tsx`
   - `app/huddle Design System/native-modal-primitives.md`
2. Treat these primitives as mandatory contracts for app-owned modal sub-controls, not optional inspiration and not a partial reference.
3. If an active `/app` shared primitive exists or can be ported, every touched modal sub-control must use that primitive or its exact token/style contract:
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
4. Do not create local one-off modal sub-control styles because using the primitive is inconvenient.
5. Do not downgrade the design system to a "reference" for modal controls. The standard is: enforce the primitive contract.
6. Any exception requires explicit user approval, the exact reason the primitive cannot be used or ported, and screenshot/runtime proof that the exception still matches the contract.
7. Use one shared close placement/style.
8. Use one shared input style family:
   - rest
   - focus
   - error
   - placeholder typography
   - inner padding
9. Use one shared modal card/island style family:
   - edge and border
   - radius
   - shadow/elevation
   - side padding
   - top/bottom padding
   - content gap
10. Use one shared button style family:
   - height
   - radius
   - padding
   - primary/secondary colors
   - disabled/loading states
   - side-by-side peer action layout
11. Keep field errors, helper text, and subtext spacing consistent.
12. Ensure long content is scroll-safe and cannot push primary actions off-screen.
13. Do not create modal-specific styles unless the design exception is explicit.

## Shell And Chrome Gate

Global shell controls are product contracts.

Before changing headers, bottom nav, native chrome, drawers, shell-owned sheets, or route suppression:

1. Identify whether the change is shell-owned or route-owned.
2. Do not fix route content by changing shell controls.
3. Do not fix shell controls by changing route content.
4. Preserve global control behavior unless the user explicitly approves a new shell contract.
5. Verify each shell control from at least two routes when touched:
   - notification control
   - logo/home control
   - settings or menu control
   - bottom nav item
   - back/close behavior
6. Prove web chrome suppression and native chrome visibility on every affected route.
7. If only grep/static proof exists, say `NOT VERIFIED`.

## Bottom Sheet And Nav Overlap Gate

For every bottom sheet, modal, drawer, footer, native-nav, or web-nav interaction:

1. Do not change shared design tokens unless explicitly approved.
2. List every target sheet/modal owner with file and selector.
3. Verify markers/selectors are on the visible panel, not the overlay/backdrop.
4. Separate:
   - nav visibility
   - z-index/layering
   - bottom padding
   - safe-area padding
   - footer/action-row spacing
5. Prove real reachable runtime behavior:
   - screenshot before opening
   - screenshot with surface open
   - screenshot after closing when relevant
   - computed style on the actual visible panel/footer when possible
6. Do not use a synthetic harness as final proof. A harness can validate mechanics only.
7. If automation misses the real trigger, retry with a reachable click or state the exact blocker.

## Feature Ownership Gate

Before touching a feature-owned sheet, drawer, popup, page, or route:

1. List every child surface and action in the source:
   - search drawers
   - nested legal/help views
   - purchase/checkout modals
   - invite/remove/delete/quit actions
   - insert/update/delete mutations
   - RPC calls
   - pricing/entitlement reads
   - upload/camera/file picker flows
   - return/reopen state
2. Do not silently reduce a functional feature to static content.
3. If the current pass forbids mutations, checkout, or new feature work, mark those actions `DEFERRED`, `READ-ONLY`, or `BLOCKED`.
4. Do not make disabled or placeholder UI look functional.
5. Final reporting must say whether each child surface is implemented, read-only, deferred, blocked, or not verified.

## No-Permission Change Gate

No-permission changes are regressions even when the code compiles.

1. Do not change behavior, geometry, ownership, data loading, child surfaces, or mutation semantics unless the user explicitly asked or the scoped root cause requires it.
2. Before deleting or replacing code, prove it is unreachable, wrong, or explicitly out of scope.
3. Preserve nearby behavior the user did not ask to change.
4. After editing, grep for removed imports, removed state, removed rows, removed child surfaces, removed data calls, and removed route registrations.
5. If a no-permission change is discovered, restore that exact behavior first, then continue the requested work.

## Simplify-Before-Adding Gate

Agents must reduce complexity and deployment weight inside the approved scope. Do not add layers over bad code by default.

1. Before adding new code, inspect whether existing code should be corrected, replaced, or removed.
2. Prefer fixing the wrong owner over creating a parallel owner.
3. Prefer deleting dead, duplicate, unreachable, superseded, or masked code in the touched scope.
4. Do not leave old and new runtime paths active unless both are intentionally required and documented.
5. Keep deployment lightweight:
   - no new package unless required
   - no new native plugin unless required
   - no new asset copy unless required
   - no new environment variable unless required
   - no new bridge unless required
   - no web `/src` change during native deployment unless explicitly approved
6. Do not preserve bad code just because a new wrapper can hide it. Fix the root owner when that owner is in scope.
7. Do not refactor unrelated files for cleanliness. Simplification must stay inside the touched scope.
8. Simplification must preserve source-of-truth behavior, data ownership, route ownership, and visual parity.
9. If simplification would change product behavior or ownership, stop and ask instead of deciding alone.
10. Final reports for non-trivial changes must include:
   - `CODE REMOVED/SIMPLIFIED: yes/no`
   - `DUPLICATE PATHS LEFT: yes/no`
   - `NEW DEPLOYMENT WEIGHT ADDED: yes/no`

## Layer Ownership Diagnosis Gate

Never fix in a layer until ownership is proven.

1. Before any `/app` fix, study the current web behavior first:
   - inspect the relevant `/src` source file
   - inspect the rendered web route when behavior, UX, or parity matters
   - identify data reads, mutations, callbacks, child surfaces, route ownership, and shell ownership
2. Diagnose the true root owner before editing:
   - `web product behavior` = `src`
   - `native shell/chrome` = `app`
   - `native route/content` = `app`
   - `backend/database/function` = `supabase`
   - `fallback/reference` = `mobile`, normally read-only
   - `native config/build` = `app` config/EAS/native project files
3. Patch only the owning layer.
4. Do not fix web data/action issues with native masking.
5. Do not fix native chrome/shell issues by changing web route behavior.
6. Do not fix backend schema/API drift with UI conditionals unless explicitly approved.
7. During native work, `/src` is source-of-truth evidence, not an edit target, unless the user explicitly approves a web change.
8. If the root cause spans layers, report the split and ask before crossing ownership boundaries unless the user already scoped a cross-layer fix.
9. Before editing, record:
   - `ROOT OWNER: web/native-shell/native-content/backend/config`
   - `LAYERS INSPECTED`
   - `LAYERS TOUCHED`
10. If ownership cannot be proven, mark `NOT VERIFIED` and do not patch.

## Route Ownership Gate

Before changing route ownership, native allowlists, web-backed routes, native-only routes, redirects, route manifests, or chrome suppression:

1. List the route in each ownership map.
2. Confirm the route exists in the runtime router.
3. Confirm the route has exactly one content owner.
4. Confirm native-only routes have native content implemented.
5. Confirm web-backed routes do not accidentally get native-only locking.
6. Confirm aliases and redirects are handled intentionally.
7. Compare all route manifests and report drift exactly.
8. If any route has split ownership, mark it `BROKEN` or `PARTIAL`.

## Sensitive Flow Gate

For auth, account, payments, subscriptions, identity, maps, services, chat, notifications, push, email, uploads, support, moderation, or database-backed flows:

1. Static code proof is not enough.
2. Backend proof is not live proof.
3. Local proof is not production proof.
4. A successful happy path is not enough if the change also owns error/cancel/expired/denied states.
5. Separate proof into:
   - local code changed
   - backend deployed
   - frontend deployed
   - actually live
   - what can be tested now
6. Missing proof means `NOT VERIFIED`.

## Build, Import, And Deploy Gate

Before commit, push, or deploy:

1. Run:
   - `git status --short`
   - `git diff --check`
   - `git ls-files --others --exclude-standard`
   - targeted lint/type/build for touched workspaces
2. Inspect staged imports against tracked files.
3. If a staged file imports a new local module, verify that module is tracked in the same commit.
4. If a staged file imports a package, verify `package.json` and the lockfile are committed.
5. Run production-preview smoke for touched browser routes when applicable.
6. Fail on:
   - `ReferenceError`
   - `Cannot access ... before initialization`
   - blank page
   - unresolved module
   - route crash
7. After push, verify remote hash equals local `HEAD`.
8. After deployment, verify the target deployment is ready and serving the expected asset/build.
9. Never say `live`, `done`, or `safe` after `git push` alone.

## Required Completion Language

When relevant, report these explicitly:

- Source of truth inspected: yes/no
- Visual parity proof: pass/fail/not verified
- Behavior proof: pass/fail/not verified
- Widget/backend proof: pass/fail/not applicable
- Route ownership proof: pass/fail/not applicable
- Shell/chrome proof: pass/fail/not applicable
- Token changed: no, or exact approved token change
- No-permission behavior preserved: yes/no
- Runtime proof: local/live/not verified
- Safe to push: yes/no
- Safe to deploy live: yes/no

## If Parity Is Blocked

- State the blocker plainly.
- Distinguish artificial scope blocker from true platform blocker.
- Do not invent a workaround that creates drift.
- Do not claim the page or flow is fixed.
