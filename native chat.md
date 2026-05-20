# Native Chat Migration Plan

## Scope

This document is the complete phase plan for migrating Huddle chat surfaces from web-backed runtime to native app-owned runtime.

Execution starts with Phase -1 and Phase 0 only. No native chat screen implementation begins until Phase -1 and Phase 0 gates pass.

## Route Ownership Target

| Route | Current owner | Target owner | Default decision |
|---|---|---|---|
| `/chats` | `web-backed-native-chrome` | `native-content` | Migrate after Phase 0 proof |
| `/chat-dialogue` | Web route through shell | `native-content` | Migrate after Phase 0 proof |
| `/service-chat` | Web route through shell | Keep `web-backed-native-chrome` by default | Do not migrate until payment/booking gate passes |
| `/service` | `native-content` | `native-content` | Preserve, validate handoff |
| `/notifications` | `native-content` | `native-content` | Preserve, validate chat deep links |
| `/social` | `native-content` | `native-content` | Preserve, validate share-to-chat |
| `/map` | `native-content` | `native-content` | Preserve, validate share-to-chat |
| `/verify-identity` | Web route | Web route | Deferred |
| `/discover` | Redirect-only | Excluded | Do not build |
| `/threads` | Alias | Excluded | Do not build |

## Non-Negotiable Gates

- Do not implement native chat screens until membership table conflict is resolved with DB proof.
- Do not implement native chat screens until `message_reads` FK target is proven.
- Do not implement native chat screens until chat attachment storage is private, signed, and member-authorized.
- Do not implement native chat screens until rollback switch is defined.
- Do not implement native chat screens until `/chats` and `/chat-dialogue` ownership can be reverted without DB rollback.
- Do not claim `PASS` unless the command/output proof is included.
- If something cannot be verified, mark it `BLOCKED` and include the exact command required to verify it.

## Strict Parity Definition

For native chat migration, parity means the `/app` native chat implementation is source-to-native identical to the active web source of truth in `src`, except where a difference is explicitly replaced by approved `/app` tokens or shared primitives without changing product behavior.

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

If any row is below 100%, return `PARITY BLOCKED`. Do not run runtime, simulator, screenshot, or visual proof before code parity is 100%.


## Phase Audit Artifact Rule

Every phase/gate result must be saved as an append-only audit artifact inside the repo.

Recommended path:

```text
docs/native-chat/phase-[number]-[gate-name].md
```

Purpose:

- Preserve the exact gate result.
- Preserve blockers, drift, proof output, and safe-to-continue decision.
- Prevent repeated long explanations.
- Create a baseline for the next gate.
- Prove whether each later phase resolved or changed the previous blockers.

Rules:

- Saving the artifact does not replace fresh proof.
- Future gates do not need to repeat the full previous audit explanation.
- Future gates must read the previous gate artifact before starting.
- Future gates must rerun only the proof commands required for that gate.
- Future gates must compare current output against saved blockers.
- Future gate summaries should report only:
  - resolved blockers
  - unresolved blockers
  - new drift
  - changed proof
  - safe/not safe to continue

Each saved gate artifact must include:

```text
PHASE/GATE:
RESULT: PASS / BLOCKED
FILES CHANGED:
PATCH DIFFS:
SQL MIGRATIONS:
RLS:
TRIGGER CODE:
RPC FUNCTIONS:
ROUTE SEARCH OUTPUT:
DATABASE PROOF COMMANDS:
STORAGE POLICY PROOF:
REALTIME PROOF:
PUSH/DEEPLINK PROOF:
ROLLBACK PROOF:
UIUX PARITY PROOF:
TEST RESULTS:
BLOCKERS:
FIXES APPLIED:
SAFE TO CONTINUE TO NEXT GATE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

Before starting any new phase/gate:

```text
1. Read the previous gate artifact.
2. Rerun the proof commands required for the current gate only.
3. Compare current proof against saved blockers.
4. Fix any failed gate item if fixable inside the current approved scope.
5. Re-run the same gate review after fixes.
6. Return only the required gate summary.
```

Hard rule:

- Do not use saved artifacts to claim PASS.
- PASS still requires current command/output proof for the current gate.
- If the current gate depends on DB/storage/runtime state, current proof must be included.


## Resume Safety Rule

Codex chat context is not the source of truth. If Codex restarts, hangs after automatic context compaction, or a new agent takes over, the task must resume from repo files and current repo state.

Every gate must end by updating one resume file:

```text
docs/native-chat/NEXT_AGENT_RESUME.md
```

This file must stay short and current. It must include:

```text
CURRENT PHASE/GATE:
RESULT: PASS / BLOCKED / IN_PROGRESS
LATEST GATE ARTIFACT:
UNRESOLVED BLOCKERS:
FILES CHANGED THIS GATE:
COMMANDS ALREADY RUN:
COMMANDS STILL REQUIRED:
NEXT ALLOWED ACTION:
FORBIDDEN ACTIONS:
STOP CONDITION:
IMPLEMENTATION ALLOWED: yes/no
```

If Codex restarts or a new agent takes over, it must:

```text
1. Read docs/native-chat/NEXT_AGENT_RESUME.md.
2. Read the latest gate artifact listed inside that file.
3. Run git status --short.
4. Run git diff --stat.
5. Rerun only the proof commands required for the current gate.
6. Compare repo state against the resume file and latest gate artifact.
7. Continue only from NEXT ALLOWED ACTION.
8. Stop if repo state conflicts with the resume file.
```

Hard fail if:

- `docs/native-chat/NEXT_AGENT_RESUME.md` is missing.
- The resume file is stale.
- The resume file conflicts with current repo state.
- The latest gate artifact is missing.
- The next allowed action is unclear.
- The agent relies on chat memory instead of repo artifacts.

Required output field for every gate:

```text
NEXT_AGENT_RESUME UPDATED: yes/no
```


## Current Drift List

| Drift | Impact | Required resolution |
|---|---|---|
| `/chats` is still WebView-backed | Native app still depends on web runtime for a core tab | Route can switch only after rollback and runtime proof |
| `/chat-dialogue` has no native ownership | Message runtime remains web-owned | Add only after schema/storage/realtime gates pass |
| `/service-chat` contains payment/booking flows | High policy and payment risk | Keep web-backed unless payment gate passes |
| `chat_participants` and `chat_room_members` both appear in code/schema references | Membership ownership ambiguity | Resolve canonical membership table with DB proof |
| Legacy `messages` exists historically | Wrong-table implementation risk | Native must hard-fail on direct `messages` usage |
| `message_reads` FK target not proven against current remote DB | Read receipt integrity risk | Prove FK target before native read receipt work |
| Chat media uses mixed public/signed patterns | Privacy/security risk | Lock private signed storage contract |
| Realtime duplicate/leak behavior unproven | Message duplication/stale updates risk | Stress-test before route ownership switch |
| Offline/reconnect behavior unproven | Silent message loss risk | Define and prove retry/refresh behavior |
| Rollback switch undefined | Unsafe release risk | Define before manifest ownership changes |

# Phase -1: Self-Audit Before Touching Code

## Goal

Produce proof-backed audit only. No implementation. No route ownership changes.

## Required Route/Search Proof

Use `grep -Rni`, not `rg`.

```bash
grep -Rni "chat_rooms\|chat_participants\|from('messages')\|from(\"messages\")" src app supabase
grep -Rni "WebView\|WebShellScreen\|nativeContentOnly\|/chats\|/chat-dialogue\|/service-chat" app src
grep -Rni "service_role\|SUPABASE_SERVICE\|createSignedUrl\|getPublicUrl\|chat-attachments\|chat_attachments\|attachments" app/src src supabase/functions supabase/migrations
```

## Required Audit Targets

| Area | Required proof |
|---|---|
| Native route manifest | Current ownership and fallback behavior |
| Web route runtime | `/chats`, `/chat-dialogue`, `/service-chat` entry points |
| Chat schema references | All `chat_participants`, `chat_room_members`, `chat_messages`, `messages`, `message_reads` references |
| RPC references | All chat/group/direct/service chat RPCs |
| Storage references | All chat attachment upload/read/delete paths |
| Realtime references | Channel names, subscribe/unsubscribe ownership |
| Push/deep links | Notification and internal navigation targets |
| Service role usage | No service role in `app/src` or browser/client code |

## Hard Failures

- Native chat would touch `chat_rooms`.
- Native chat would read/write `public.messages`.
- Membership table conflict remains undocumented.
- `message_reads` FK target remains undocumented.
- Chat attachments use public URLs.
- Client code uses service role.
- `/chats` or `/chat-dialogue` ownership changes before rollback exists.

## Required Output

```text
PHASE -1 RESULT: PASS/BLOCKED

FILES CHANGED: none
PATCH DIFFS: none
SQL MIGRATIONS: none
ROUTE SEARCH OUTPUT: included
SCHEMA DRIFT: listed
RPC DRIFT: listed
STORAGE DRIFT: listed
REALTIME DRIFT: listed
PUSH/DEEPLINK DRIFT: listed
SERVICE ROLE CLIENT PROOF: included
BLOCKERS: exact list
SAFE TO ENTER PHASE 0: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 0: Canonical Contract Lock

## Goal

Lock the native chat contract before implementation.

## Canonical Schema Lock

| Contract | Required decision |
|---|---|
| Chat room table | Prove `public.chats` |
| Membership table | Resolve `chat_participants` vs `chat_room_members` |
| Message table | Prove `public.chat_messages` |
| Read receipts | Prove `message_reads` FK target |
| Blocks | Prove `user_blocks` usage |
| Unmatches | Prove `user_unmatches` usage |
| Reports | Prove approved report path/RPC |
| Service chat | Keep web-backed unless separately proven |

## Required DB Proof Commands

```bash
supabase migration list
supabase db push
supabase migration list
```

## Required DB Inspection SQL

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'chats',
  'chat_participants',
  'chat_room_members',
  'chat_messages',
  'messages',
  'message_reads',
  'user_blocks',
  'user_unmatches',
  'user_reports'
);

select conname, conrelid::regclass, confrelid::regclass
from pg_constraint
where conrelid::regclass::text in (
  'message_reads',
  'chat_messages',
  'chat_participants',
  'chat_room_members',
  'chats'
);

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
and tablename in (
  'chats',
  'chat_participants',
  'chat_room_members',
  'chat_messages',
  'message_reads',
  'user_blocks',
  'user_unmatches',
  'user_reports'
);

select routine_name, routine_type
from information_schema.routines
where specific_schema = 'public'
and routine_name ilike '%chat%';

select tgname, tgrelid::regclass, tgfoid::regprocedure
from pg_trigger
where not tgisinternal
and tgrelid::regclass::text in (
  'chats',
  'chat_messages',
  'message_reads',
  'chat_participants',
  'chat_room_members'
);
```

## Storage/Security Lock

Native chat attachments must prove:

| Requirement | Required |
|---|---|
| Private bucket | yes |
| Signed URL read | yes |
| Member-only read authorization | yes |
| Owner-only delete or secure RPC delete | yes |
| No public URL leak | yes |
| No service role in app/client code | yes |

Required storage SQL:

```sql
select id, name, public
from storage.buckets
where name ilike '%chat%' or name in ('notices', 'avatars');

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
and tablename = 'objects'
and (
  qual ilike '%chat%' or
  with_check ilike '%chat%' or
  qual ilike '%notices%' or
  with_check ilike '%notices%'
);
```

## Rollback Lock

Before implementation, define a rollback switch that proves:

| Rollback requirement | Required |
|---|---|
| `/chats` can revert to WebView | yes |
| `/chat-dialogue` can revert to WebView | yes |
| No DB migration needed for frontend rollback | yes |
| Deep links still resolve after rollback | yes |
| Staged release possible | yes |
| Storage changes do not block frontend rollback | yes |

## WebView Removal Proof Requirement

Before any future ownership switch:

```bash
grep -Rni "WebView\|WebShellScreen\|nativeContentOnly\|/chats\|/chat-dialogue\|/service-chat" app src
```

Required result:

- `/chats` may become `nativeContentOnly: true` only when native route is proven and rollback exists.
- `/chat-dialogue` may enter native manifest only when native route is proven and rollback exists.
- `/service-chat` remains web-backed unless payment/booking gate passes.
- `WebShellScreen` remains available for approved web-backed routes.
- Turnstile/legal/helper WebView exceptions remain intact.

## Required Output

```text
PHASE 0 RESULT: PASS/BLOCKED

FILES CHANGED: none unless plan/proof artifact only
PATCH DIFFS: included if any artifact changed
SQL MIGRATIONS: none unless explicitly approved
RLS: included
TRIGGER CODE: included
RPC FUNCTIONS: included
ROUTE SEARCH OUTPUT: included
DATABASE PROOF COMMANDS: included
STORAGE POLICY PROOF: included
PUSH/DEEPLINK PROOF: included
ROLLBACK PLAN: included
CANONICAL MEMBERSHIP TABLE: proven/BLOCKED
MESSAGE_READS FK TARGET: proven/BLOCKED
CHAT ATTACHMENT STORAGE: proven/BLOCKED
SAFE TO IMPLEMENT NATIVE /chats: yes/no
SAFE TO IMPLEMENT NATIVE /chat-dialogue: yes/no
SAFE TO KEEP /service-chat WEB-BACKED: yes
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 1: Native Chat Foundation

## Entry Criteria

- Phase -1 is `PASS`.
- Phase 0 is `PASS`.
- Canonical membership table is proven.
- `message_reads` FK target is proven.
- Chat storage contract is private/signed/member-authorized.
- Rollback switch is defined.

## Goal

Build shared native chat infrastructure without switching route ownership yet.

## Build Targets

| Area | Purpose |
|---|---|
| Native chat data client | Canonical reads/writes/RPC wrappers |
| Native chat realtime manager | Room-level subscribe/unsubscribe lifecycle |
| Native chat storage client | Signed URL attachment upload/read/delete contract |
| Message parser | Plain text, JSON payloads, attachments, link previews, shared content, system messages |
| Read receipt client | Canonical `message_reads` writes and reconciliation |
| Safety resolver | Block/unmatch/report/restriction state |
| Profile/member resolver | Direct peer, group members, Team Huddle/system identities |
| Shared UI primitives | Message bubble, composer, attachment tile, receipt row, empty/error/loading states |

## Hard Rules

- Do not use `chat_rooms`.
- Do not use direct `messages` table.
- Do not use public URLs for chat attachments.
- Do not add route ownership yet unless rollback is already proven and approved.
- Do not create route-local visual variants for buttons, fields, chips, cards, sheets, or modals.

## Gate 1 Review

```text
PHASE 1 RESULT: PASS/BLOCKED

FILES CHANGED: exact list
PATCH DIFFS: included
CANONICAL TABLE USAGE PROOF: included
LEGACY TABLE GREP PROOF: included
STORAGE CONTRACT PROOF: included
TYPECHECK: npm --prefix app run typecheck output included
SAFE TO START /chats ROUTE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 2: Native `/chats`

## Goal

Migrate the chat inbox/discover/groups surface to native content with rollback support.

## Required Parity

| Feature | Required |
|---|---|
| Chat inbox list | Sort, unread, avatar, last message, timestamp |
| Discover tab | Existing `?tab=discover` behavior and age gate |
| Groups tab | Existing groups, discovery, join/request state |
| Group creation | Same validation, image, country/location, visibility |
| Join with code | Same success/error paths |
| Service chat rows | Route to web-backed `/service-chat` by default |
| Direct chat rows | Route to native `/chat-dialogue` only after Phase 3 ownership, otherwise fallback works |
| Empty states | Huddle tone, tokenized UI |
| Loading/error/retry states | Explicit and recoverable |
| Bottom nav | Native active `chats` tab |
| Header | Native global header only |

## WebView Ownership Switch

`/chats` can switch to `nativeContentOnly: true` only after:

- Native `/chats` runtime smoke passes.
- Rollback switch is proven.
- WebView removal grep proof is included.
- Deep links to `/chats` and `/chats?tab=discover` work.

## Gate 2 Review

```text
PHASE 2 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
ROUTE SEARCH OUTPUT
WEBVIEW REMOVAL PROOF
CANONICAL TABLE PROOF
STORAGE POLICY PROOF
PUSH/DEEPLINK PROOF
ROLLBACK PROOF
TEST RESULTS:
npm --prefix app run typecheck
npm run lint
git diff --check
simulator smoke
SAFE TO SHIP /chats NATIVE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 3: Native `/chat-dialogue`

## Goal

Migrate direct and group conversation runtime to native content with rollback support.

## Required Parity

| Feature | Required |
|---|---|
| Direct room resolution | `room`, `with`, `name` params |
| Direct chat creation | Approved canonical RPC/function path |
| Group chat load | Members, admin, mute, visibility, room code |
| Message pagination | Initial page and older page scroll retention |
| Realtime messages | No duplicates, stable ordering |
| Composer | Text, attachment, disabled, sending, failed, retry |
| Attachments | Private upload, signed read, owner/secure delete |
| Link previews | Extract, lock, dismiss, render |
| Shared content cards | Same share model behavior |
| System messages | Same display rules |
| Read receipts | Persist and reconcile after reopen |
| Group details | Info and media display |
| Group management | Members, admin actions, leave/remove, description/image updates |
| Block/unblock | Same RPC and disabled terminal states |
| Unmatch | Same confirmation and terminal states |
| Report | Same report source and evidence behavior |
| Public profile | Same viewed-user behavior |
| Safety restrictions | Chat disabled/restricted states |
| Keyboard | Composer never hidden |

## Required Realtime Proof

- Send 20 messages quickly.
- Receive 20 messages from second session.
- Background/foreground app.
- Switch rooms 10 times.
- Reopen same room.
- Prove no duplicate messages.
- Prove unsubscribe cleanup.
- Prove stale room events do not mutate active room.

## Required Offline/Reconnect Proof

- Offline send disabled or clearly queued.
- Failed send has retry.
- Reconnect refreshes canonical messages.
- No silent lost message.
- Media upload offline does not create ghost attachment.

## Required Performance Proof

- 100-message room scroll.
- Media-heavy room scroll.
- Keyboard open/close.
- Room switch memory stability.
- Hidden tabs do not fetch unnecessary data.

## Gate 3 Review

```text
PHASE 3 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
ROUTE SEARCH OUTPUT
WEBVIEW REMOVAL PROOF
CANONICAL TABLE PROOF
STORAGE POLICY PROOF
REALTIME PROOF
OFFLINE/RECONNECT PROOF
PERFORMANCE PROOF
PUSH/DEEPLINK PROOF
ROLLBACK PROOF
TEST RESULTS:
npm --prefix app run typecheck
npm run lint
npm run build
git diff --check
simulator smoke
SAFE TO SHIP /chat-dialogue NATIVE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 4: Push, Deep Link, and Cross-Surface Hardening

## Goal

Ensure all app surfaces route to native chat where approved and web-backed chat where not approved.

## Required Path Matrix

| Source | Target behavior |
|---|---|
| Bottom nav Chats | `/chats` native if Phase 2 shipped, otherwise WebView fallback |
| Notification chat tap | `/chat-dialogue?room=...` native if Phase 3 shipped, otherwise WebView fallback |
| Discover forced path | `/chats?tab=discover` native if Phase 2 shipped |
| Profile message action | `/chat-dialogue?...` native if Phase 3 shipped |
| Social share to chat | Native share target list if Phase 2/3 shipped, otherwise existing behavior |
| Map share to chat | Native share target list if Phase 2/3 shipped, otherwise existing behavior |
| Service provider request | `/service-chat` web-backed by default |

## Gate 4 Review

```text
PHASE 4 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
PUSH/DEEPLINK PROOF
ROUTE SEARCH OUTPUT
ROLLBACK PROOF
SIMULATOR SMOKE
SAFE TO SHIP CROSS-SURFACE CHAT LINKS: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 5: Storage Migration and Cleanup

## Goal

If Phase 0 proves existing chat storage is not compliant, migrate chat attachments to the canonical private/signed/member-authorized contract.

## Required Decisions

| Decision | Requirement |
|---|---|
| Existing public chat media | Must either remain legacy-read-only with risk documented or be migrated through approved path |
| New native chat media | Must use private signed member-authorized path only |
| Delete behavior | Owner-only or secure RPC only |
| URL storage | Store object paths, not public URLs, unless legacy compatibility explicitly requires otherwise |
| Rollback | Frontend rollback must not require storage rollback |

## Gate 5 Review

```text
PHASE 5 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
SQL MIGRATIONS
RLS
STORAGE POLICY PROOF
BACKFILL/MIGRATION PROOF if applicable
NO PUBLIC URL LEAK PROOF
ROLLBACK PLAN
SAFE TO USE CHAT ATTACHMENTS IN NATIVE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 6: `/service-chat` Payment/Booking Gate

## Default

Keep `/service-chat` web-backed-native-chrome.

## Goal

Only decide whether `/service-chat` can become native-owned after legal, payment, booking, and runtime proof.

## Required Proof Before Native Ownership

| Area | Required |
|---|---|
| App Store policy | Prove physical service, not digital entitlement/IAP-required path |
| Stripe checkout | Success and cancel proof |
| Booking mutation | Persistent state proof |
| Webhook | Stripe webhook proof |
| Provider payout | Backend/function proof |
| Review flow | Runtime proof |
| Dispute flow | Runtime proof |
| Refund/cancel | Runtime proof |
| Role behavior | Provider and requester proof |
| Rollback | Can revert route without DB rollback where possible |

## Gate 6 Review

```text
PHASE 6 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
PAYMENT POLICY PROOF
CHECKOUT PROOF
WEBHOOK PROOF
BOOKING STATE PROOF
PAYOUT PROOF
DISPUTE/REVIEW PROOF
ROLLBACK PROOF
SAFE TO MIGRATE /service-chat NATIVE: yes/no
DEFAULT IF BLOCKED: keep web-backed-native-chrome
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 7: UIUX Consistency and Design-System Hardening

## Goal

Make chat surfaces feel app-native and consistent with Huddle app design contracts.

## Required Checks

| Area | Requirement |
|---|---|
| Typography | Urbanist via shared tokens |
| Color | Shared Huddle tokens only |
| Spacing | 8pt scale or existing shared token |
| Buttons | Shared button contract only |
| Fields/composer | Shared form/input/composer treatment |
| Cards | Shared card/surface treatment |
| Chips | Shared chip treatment |
| Sheets/modals | Native modal primitives and shared backdrop |
| Bottom nav | Existing native bottom nav only |
| Header | Existing native global/page headers only |
| Empty states | Huddle tone, no generic filler |
| Error states | Clear, recoverable, non-technical |
| Accessibility | Labels, tap targets, contrast |
| Keyboard | No clipped composer or hidden actions |

## Gate 7 Review

```text
PHASE 7 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
UI TOKEN COMPLIANCE PROOF
SCREENSHOT/SIMULATOR PROOF
ACCESSIBILITY REVIEW
KEYBOARD PROOF
SAFE TO CALL VISUALLY COMPLETE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Phase 8: Full Regression and Release Gate

## Goal

Prove migrated chat routes and unaffected native routes are safe to ship.

## Required Route Matrix

| Route | Required proof |
|---|---|
| `/` | Existing native Home unaffected |
| `/social` | Existing native Social unaffected |
| `/chats` | Native inbox/discover/groups or rollback fallback |
| `/chat-dialogue` | Native direct/group chat or rollback fallback |
| `/service` | Native service list still routes correctly |
| `/service-chat` | Web-backed default still works |
| `/map` | Existing native Map unaffected |
| `/notifications` | Chat deep links resolve correctly |
| `/settings` | Existing drawer/settings unaffected |

## Required Commands

```bash
npm --prefix app run typecheck
npm run lint
npm run build
git diff --check
```

## Required Proof

```text
PHASE 8 RESULT: PASS/BLOCKED

FILES CHANGED
PATCH DIFFS
SQL MIGRATIONS
RLS
TRIGGER CODE
RPC FUNCTIONS
ROUTE SEARCH OUTPUT using grep -Rni, not rg
DATABASE PROOF COMMANDS
STORAGE POLICY PROOF
REALTIME PROOF
PUSH/DEEPLINK PROOF
ROLLBACK PLAN
AUDIT ARTIFACT PATH
PREVIOUS ARTIFACT COMPARISON
TEST RESULTS:
npm --prefix app run typecheck
npm run lint
npm run build
git diff --check
simulator smoke
LOCAL RUNTIME PROOF
LIVE RUNTIME PROOF if deployed
SAFE TO PUSH: yes/no
SAFE TO DEPLOY LIVE: yes/no
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Final Mandatory Proof Format For Any Implementation Phase

```text
FILES CHANGED
PATCH DIFFS
SQL MIGRATIONS
RLS
TRIGGER CODE
RPC FUNCTIONS
ROUTE SEARCH OUTPUT using grep -Rni, not rg
DATABASE PROOF COMMANDS
STORAGE POLICY PROOF
REALTIME PROOF
PUSH/DEEPLINK PROOF
ROLLBACK PLAN
AUDIT ARTIFACT PATH
PREVIOUS ARTIFACT COMPARISON
TEST RESULTS:
npm --prefix app run typecheck
npm run lint
npm run build
git diff --check
simulator smoke
NEXT_AGENT_RESUME UPDATED: yes/no
```

# Release Decision Rules

- `PASS` means command/output proof is included.
- `BLOCKED` means proof is missing or a hard gate failed.
- `/chats` cannot ship native before rollback proof.
- `/chat-dialogue` cannot ship native before realtime/offline/storage proof.
- `/service-chat` remains web-backed unless payment/booking gate passes.
- Any schema, RLS, storage, trigger, or RPC change requires migration sync proof.
- Any frontend-only route rollback must require no DB rollback.
- Every gate must update `docs/native-chat/NEXT_AGENT_RESUME.md` before returning.
- A new agent must resume from `NEXT_AGENT_RESUME.md` plus the latest gate artifact, not chat history.

# Final Hard Gates Added Before Proceeding

## Phase -1 / Phase 0 Runtime File Freeze

Phase -1 and Phase 0 must not modify app runtime files.

Allowed files:

- Proof notes
- Audit artifact
- Planning artifact

Forbidden in Phase -1 and Phase 0:

- Runtime changes in `app`
- Runtime changes in `src`
- Runtime changes in `supabase`
- Route manifest changes
- Feature flag implementation
- Native screen/component implementation
- DB migration files
- Storage policy changes

## Dirty Worktree Proof Gate

Before and after each phase, include:

```bash
git status --short
```

Required output fields:

```text
GIT STATUS BEFORE: included
GIT STATUS AFTER: included
UNRELATED DIRTY FILES TOUCHED: yes/no
```

Do not proceed if unrelated dirty files would be modified.

## Commit/Diff Boundary Proof Gate

Before and after each phase, include:

```bash
git diff --stat
git diff -- app src supabase
```

Required proof:

- Exact changed-file boundary is visible.
- Phase -1 and Phase 0 show no runtime diff in `app`, `src`, or `supabase`.
- Any implementation phase shows only approved touched files.
- No unrelated cleanup is included.

Required output fields:

```text
DIFF STAT BEFORE: included
DIFF STAT AFTER: included
RUNTIME DIFF app/src/supabase: included
DIFF BOUNDARY SAFE: yes/no
```

## Dependency Gate

No new packages unless explicitly justified and approved before implementation.

Hard fail if:

- `package.json` changes without explicit dependency approval.
- Lockfile changes without matching approved package change.
- A native dependency is added to solve a problem that can be solved with existing runtime.
- A dependency is added during Phase -1 or Phase 0.

Required output field:

```text
NEW DEPENDENCIES ADDED: yes/no
DEPENDENCY APPROVAL: yes/no/not applicable
```

## Native Route Flag Naming Requirement

Rollback switches must be explicit, searchable, and route-scoped.

Required names:

```text
ENABLE_NATIVE_CHATS
ENABLE_NATIVE_CHAT_DIALOGUE
```

Rules:

- Do not use vague names such as `ENABLE_NATIVE_CHAT` or `CHAT_NATIVE_ENABLED`.
- Each flag must control exactly one route ownership boundary.
- Each flag must be grep-searchable.
- Each flag must allow route fallback without DB rollback.
- `/service-chat` must not be controlled by these flags.

Required proof command before route ownership switch:

```bash
grep -Rni "ENABLE_NATIVE_CHATS\|ENABLE_NATIVE_CHAT_DIALOGUE" app src
```

## Data-Loss Gate

No destructive DB/storage migration is allowed in this migration plan without separate explicit approval.

Forbidden unless separately approved:

- Delete existing chat rows.
- Delete existing message rows.
- Delete existing message read rows.
- Delete existing media objects.
- Move existing chat media objects.
- Rewrite existing attachment URLs.
- Backfill existing chat media into a new bucket.
- Drop legacy tables or columns.
- Tighten storage policy in a way that can strand existing media.

Allowed before separate approval:

- Read-only audits.
- New forward-only private storage path for future native chat attachments, if approved.
- Compatibility reads for existing legacy media, if privacy risk is documented.

Required output field:

```text
DATA-LOSS RISK: yes/no
DESTRUCTIVE DB/STORAGE CHANGE: yes/no
SEPARATE APPROVAL REQUIRED: yes/no
```

## Privacy Logging Gate

Production logs must not print:

- Message body
- Attachment URL
- Signed URL
- User private data
- Access token
- Refresh token
- Email or phone unless already approved for a specific secure diagnostic path
- Full storage object path if it identifies private user content

Allowed logs:

- Route name
- Boolean state
- Count values
- Stable non-sensitive event labels
- Redacted IDs where needed

Hard fail if native chat logs message content, attachment URLs, signed URLs, or private profile data in production.

Required output field:

```text
PRIVACY LOGGING CHECK: PASS/BLOCKED
PRODUCTION PRIVATE DATA LOGGING: yes/no
```

## Second-User Realtime Proof Requirement

Realtime proof must use two real authenticated users/sessions.

Not sufficient:

- One simulator only
- One account in two tabs without distinct authenticated users
- Mocked realtime only
- Code inspection only

Required proof:

- User A sends messages.
- User B receives messages.
- User B sends messages.
- User A receives messages.
- 20-message burst is tested across two authenticated users.
- Room switching cleanup is tested while both users are active.
- Read receipts are proven from both perspectives.

Required output field:

```text
SECOND USER REALTIME PROOF: included/BLOCKED
AUTHENTICATED USER A: proven/redacted
AUTHENTICATED USER B: proven/redacted
```

## Route Param Compatibility Proof

Route params must be proven separately by route.

### `/chat-dialogue`

Supported params:

```text
room
with
name
```

Rules:

- Do not mix `paid` into `/chat-dialogue`.
- Unknown service/payment params must not alter `/chat-dialogue` behavior.
- Direct room resolution must preserve `room`, `with`, and `name` compatibility.

### `/service-chat`

Supported params:

```text
room
paid
booking/request params
```

Rules:

- `paid` belongs only to `/service-chat`.
- Booking/request params belong only to `/service-chat`.
- `/service-chat` remains web-backed unless payment/booking gate passes.

Required proof commands:

```bash
grep -Rni "room\|with\|name\|paid\|booking\|request" src/pages/ChatDialogue.tsx src/pages/ServiceChat.tsx app/src
```

Required output field:

```text
ROUTE PARAM COMPATIBILITY PROOF: included/BLOCKED
/chat-dialogue PARAMS SAFE: yes/no
/service-chat PARAMS SAFE: yes/no
PAID PARAM MIXED INTO /chat-dialogue: yes/no
```

## Final Approval Stop After Phase 0

After Phase 0, stop and ask before Phase 1 implementation.

Required exact line in Phase 0 output:

```text
PHASE 0 COMPLETE. STOPPING BEFORE PHASE 1. EXPLICIT APPROVAL REQUIRED TO IMPLEMENT.
```

No Phase 1 files may be created or modified until explicit approval is given after Phase 0 proof is reviewed.

## Phase 0 Locked Contract

Canonical native chat objects:

- rooms: `public.chats`
- members: `public.chat_room_members`
- messages: `public.chat_messages`
- reads: `public.message_reads`
- attachments: private `chat_attachments` bucket

Forbidden for native chat:

- `public.chat_participants`
- `public.messages`
- `notices` bucket for native chat attachments

Known carry-forward:

- `message_reads_message_id_fkey` points to `public.chat_messages(id)` but is `NOT VALID`.
- Phase 1 must not assume full FK integrity until this is resolved or explicitly accepted.

Remote DB proof source:

- Use Supavisor pooler host for remote DB proof.
- Direct Supabase host may fail due IPv6-only routing.

Efficiency rule:

- Do not repeat Phase 0 DB proof unless schema/storage/migration files are changed.
- Future gates only need to verify the objects they touch.

## Standing Native Phase Parity Gate

Before any runtime or simulator proof, code parity must be 100%.

Process:

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

Blocked state:

If code parity is below 100%, return:

- `PARITY BLOCKED`
- exact gaps
- exact files/lines
- exact patch plan
- no runtime claim

Required output:

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

## Phase 1 Locked Foundation

- `app/src/lib/nativeChat.ts` exists and is the required native chat foundation for future `/chats` and `/chat-dialogue` implementation.
- Phase 2 and later native chat work must use `app/src/lib/nativeChat.ts` before adding route-local data access.

## Phase 2 Locked Native /chats

- `app/src/screens/NativeChatsScreen.tsx` exists.
- `/chats` is native-owned when `EXPO_PUBLIC_ENABLE_NATIVE_CHATS` is not false.
- `/chats` normalizes to `/` when `EXPO_PUBLIC_ENABLE_NATIVE_CHATS=false` so disabled native ownership does not hit the live web `/chats` 404 fallback.
- `/chats?tab=discover` routes to the native Discover tab.
- `/chats?tab=groups` routes to the native Groups tab.
- `/service-chat` remains web-backed.
- `/chat-dialogue` remains web-backed until Phase 3.
- Native Discover uses `social_discovery_restricted` and `waves`; it does not use legacy chat tables.
