# CODEX / CLAUDE EXECUTION RULES

Read this before acting.

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

## App-only design system rule
The `app/huddle Design System` package is strictly for `/app` native visual guidance only.

- Current `src` web app remains the source of truth for structure, routes, content, copy, behavior, and product ownership.
- `app/huddle Design System` is only a style/token/component-polish reference for `/app`.
- Use it for colors, typography, spacing, radii, shadows, motion, buttons, fields, chips, cards, native header, bottom nav, and approved native support/settings/legal visual polish.
- Do not copy and paste screens, nav labels, copy, route content, or product structure from the design system.
- Do not let the design system override the agreed phase plan, route ownership, auth/session architecture, billing/store logic, map/chat product structure, or current web behavior.
- Treat any older Expo app or UI kit inside the design system as reference-only; extract token values and styling rules, then apply them to current web-derived `/app` native screens/components.

## App modal/input UI contract
For `/app` native modals, consistency is a hard contract, not polish.

Before editing any `/app` native modal, inspect and reuse or port:
- `app/huddle Design System/native-modal-primitives.tsx`
- `app/huddle Design System/native-modal-primitives.md`

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
- Do not open app-owned auth/help flows through web route WebViews. Build those flows in `/app`; use WebView only for embedded web-origin requirements like Turnstile or legal document content.

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
