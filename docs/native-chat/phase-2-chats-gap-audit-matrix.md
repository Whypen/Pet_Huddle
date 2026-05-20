# Phase 2 Chats Gap Audit Matrix

PHASE/GATE:
User-requested Chats page gap audit before patch.

RESULT:
BLOCKED / 73-ROW MATRIX RECORDED. IMPLEMENTATION REMAINS UNSHIPPABLE UNTIL FAIL/PARTIAL/UNKNOWN/NOT VERIFIED ROWS ARE PATCHED AND PROVEN.

FILES CHANGED:
- `docs/native-chat/phase-2-chats-gap-audit-matrix.md`

PATCH DIFFS:
- Audit artifact only.

SQL MIGRATIONS:
- Existing relevant migrations inspected:
  - `supabase/migrations/20260506165000_public_group_preview_members.sql`
  - `supabase/migrations/20260506184000_native_chat_membership_rpc_boundary.sql`
  - `supabase/migrations/20260506192000_native_group_member_roles_verified.sql`

UIUX PARITY PROOF:
- Web source: `src/pages/Chats.tsx`
- Native source: `app/src/screens/NativeChatsScreen.tsx`
- Native data source: `app/src/lib/nativeChat.ts`
- Shared primitive source: `app/src/components/nativeModalPrimitives.tsx`
- Shared primitive styles: `app/src/components/nativeModalPrimitives.styles.ts`

BLOCKERS:
- Full 73-row scope is now available.
- Runtime simulator screenshots were not captured in this audit pass.
- DB mutation proof was not run; no safe fixture IDs were provided in this pass.
- Existing resume file already says the prior pass was code-gate only and runtime/DB proof remain unresolved.
- Critical runtime request budget failure is in scope: row 56 says repeated calls exceeded 500 and remains FAIL.
- Rows 15, 25, 28, 29, 40, 56, 63 are explicit FAIL/PARTIAL-GAP areas requiring patch/proof before any ship decision.

SAFE TO CONTINUE TO NEXT GATE:
Yes for scoped `/app` patches against the 70-row matrix. No for release.

NEXT_AGENT_RESUME UPDATED:
No. This artifact is the current audit output; resume update should happen after a patch/static gate or explicit stop.

## Source Line Map

| Area | Source lines |
|---|---|
| Shared bottom sheet primitive | `app/src/components/nativeModalPrimitives.tsx:65-79`, `app/src/components/nativeModalPrimitives.styles.ts:108-126` |
| Explore/My Group detail sheet | `app/src/screens/NativeChatsScreen.tsx:2372-2552` |
| Join requests sheet | `app/src/screens/NativeChatsScreen.tsx:2574-2613` |
| Invite users section | `app/src/screens/NativeChatsScreen.tsx:2453-2499` |
| Member actions | `app/src/screens/NativeChatsScreen.tsx:2554-2571` |
| Group management data | `app/src/lib/nativeChat.ts:743-777` |
| Invite accept/decline/request/join | `app/src/lib/nativeChat.ts:613-644` |
| Group invite write | `app/src/lib/nativeChat.ts:794-810` |
| Join request RPC write | `app/src/lib/nativeChat.ts:779-784` |
| Preview member RPC call | `app/src/lib/nativeChat.ts:220-235` |
| Member role/verified migrations | `supabase/migrations/20260506184000_native_chat_membership_rpc_boundary.sql:136-166`, `supabase/migrations/20260506192000_native_group_member_roles_verified.sql:48-82` |

## Original 60-Row Audit Matrix

| # | Status | Validity | Evidence | Remaining risk / patch note |
|---:|---|---|---|---|
| 1 | PASS | Valid | This artifact covers rows 1-60. | Gate text says 70 rows, so Phase 0 remains blocked. |
| 2 | PASS-CODE | Valid | `AppBottomSheet` column layout and fixed footer: `nativeModalPrimitives.tsx:65-79`; sheet body/footer use: `NativeChatsScreen.tsx:2374-2551`. | Needs simulator proof. |
| 3 | PARTIAL | Valid | Modes are `content`/`large`: `nativeModalPrimitives.tsx:65-67`; no `autoMax`. | Add `autoMax` only if visual proof shows oversized short sheets. |
| 4 | PARTIAL | Valid | Footer primitive: `nativeModalPrimitives.tsx:78-79`. | Need confirm `appModalFixedFooter` uses Broadcast footer token; not proven in this excerpt. |
| 5 | PASS-CODE | Valid | Explore path only shows description/members/footer CTA; media/admin gated by `isJoinedGroup`: `NativeChatsScreen.tsx:2403-2529`. | Needs screenshot. |
| 6 | PASS-CODE | Valid | CTA states: `NativeChatsScreen.tsx:2533-2546`. | Needs fixture screenshots for all states. |
| 7 | PASS-CODE | Valid | Close uses modal `onClose` only: `NativeChatsScreen.tsx:2372-2379`. | Needs navigation proof. |
| 8 | PASS-CODE | Valid | Joined detail has Open/footer/admin controls: `NativeChatsScreen.tsx:2397-2499`, `2548-2550`. | Needs admin/non-admin screenshots. |
| 9 | PASS-CODE | Valid | Media renders only when `management?.mediaUrls.length`: `NativeChatsScreen.tsx:2503-2510`. | Needs zero/nonzero runtime proof. |
| 10 | PARTIAL | Valid | Native candidate pool comes from `selectableMembers`; web uses matched friends around `src/pages/Chats.tsx:4149-4220`. | Need deeper parity proof; likely patch candidate source if mismatch. |
| 11 | PASS-CODE | Valid | Pending invites show avatar/name/verified/status: `NativeChatsScreen.tsx:2464-2472`. | Needs screenshot. |
| 12 | PASS-CODE | Valid | Submit and refresh: `NativeChatsScreen.tsx:1905`, `nativeChat.ts:794-810`. | Needs safe DB proof. |
| 13 | FAIL | Valid | No current-user invite inbox/list sheet found beyond detail CTA: `NativeChatsScreen.tsx:1376`, `1397`, `2533-2541`. | Needs implementation if requirement is approved. |
| 14 | FAIL | Valid | Accept is immediate from detail CTA, not staged/confirm sheet: `NativeChatsScreen.tsx:2533-2541`. | Needs implementation or requirement revision. |
| 15 | FAIL | Valid | Decline is immediate from detail CTA, not staged/confirm sheet: `NativeChatsScreen.tsx:2533-2538`. | Needs implementation or requirement revision. |
| 16 | PASS-CODE | Valid | Staged join-request decisions: `NativeChatsScreen.tsx:2353-2369`, `2574-2613`. | Needs safe DB proof. |
| 17 | PASS-CODE | Valid | Uses RPCs: `nativeChat.ts:779-784`. | Needs DB proof. |
| 18 | PARTIAL | Valid | Native inserts `group_join_requests`: `nativeChat.ts:639-644`. | Notification/admin visibility needs DB/source proof. |
| 19 | PASS-CODE | Valid | Pending request IDs loaded and button muted: `nativeChat.ts:558-566`, `NativeChatsScreen.tsx:2543-2546`. | Needs declined lifecycle proof. |
| 20 | PASS-CODE | Valid | Creator/admin precedence: `NativeChatsScreen.tsx:2336-2338`; migrations force creator `admin`: `20260506192000...:57-64`. | Needs creator screenshot. |
| 21 | PASS-CODE | Valid | RPCs return role/admin and verified in latest migration: `20260506192000...:1-82`; native reads them: `nativeChat.ts:220-235`, `743-756`. | Needs live-safe read. |
| 22 | PASS-CODE | Valid | Requests/invites select `profiles.is_verified`: `nativeChat.ts:748-763`; RPC verified: migration lines above. | Needs live-safe verified fixture. |
| 23 | PARTIAL | Valid | UI consumes `isVerified` only: `NativeChatsScreen.tsx:2445`, `2521`, `2590`. | Backend false for verified account would be DB contract fail. |
| 24 | PARTIAL | Valid | Local `VerifiedMemberAvatar` is used; source near `NativeChatsScreen.tsx:2445`. | Needs profile-summary identity unit audit/possible patch. |
| 25 | BLOCKED | Valid | Profile modal file exists but not audited in detail in this pass. | Needs source/visual audit. |
| 26 | BLOCKED | Valid | Same. | Needs long-name screenshot. |
| 27 | BLOCKED | Valid | Same. | Needs narrow simulator proof. |
| 28 | PASS-CODE | Valid | Member/request/invite rows open profile: `NativeChatsScreen.tsx:2444`, `2467`, `2488`, `2520`, `2589`. | Needs tap proof. |
| 29 | PARTIAL | Valid | Explore member list loads/error/no members: `NativeChatsScreen.tsx:2513-2528`. | Requirement says actionable error; current copy is passive. Patch candidate. |
| 30 | PASS-CODE | Valid | 3-dot actions and admin-only remove: `NativeChatsScreen.tsx:2449`, `2554-2571`. | Needs screenshots. |
| 31 | PASS-CODE | Valid | 44px overlay action: `NativeChatsScreen.tsx:2397-2400`, style `3163`. | Needs screenshot. |
| 32 | PASS-CODE | Valid | Inline pencil/save: `NativeChatsScreen.tsx:2403-2425`. | Needs screenshot. |
| 33 | BLOCKED | Valid | Top switch exists; web rail comparison not completed. | Needs source comparison and screenshot. |
| 34 | BLOCKED | Valid | Empty state asset import seen: `NativeChatsScreen.tsx:49-52`. | Need all empty image states. |
| 35 | BLOCKED | Valid | Empty copy line: `NativeChatsScreen.tsx:1874`. | Need approved copy source. |
| 36 | PARTIAL | Valid | Native resolver used in lib and avatar component import: `nativeChat.ts:2`, `NativeChatsScreen.tsx:46`. | Need grep all avatar surfaces and runtime proof. |
| 37 | BLOCKED | Valid | Dialogue screen not audited in this pass. | Needs dependency loop/runtime proof. |
| 38 | BLOCKED | Valid | Dialogue swipe/delete not audited. | Needs runtime tap proof. |
| 39 | PASS-CODE | Valid | JSON preview parser: `NativeChatsScreen.tsx:220-237`. | Needs row screenshot. |
| 40 | BLOCKED | Valid | Read receipt not audited. | Needs web/native source comparison. |
| 41 | BLOCKED | Valid | Direct dialogue header not audited. | Needs screenshot. |
| 42 | PARTIAL | Valid | Native location settings import exists: `NativeChatsScreen.tsx:43`. | Need exact call path + Android audit. |
| 43 | BLOCKED | Valid | Create group flow not fully audited. | Needs safe fixture create proof. |
| 44 | PASS-CODE | Valid | Create location autocomplete present: `NativeChatsScreen.tsx:2705-2785`. | Needs runtime typing proof. |
| 45 | BLOCKED | Valid | Join code sheet exists: `NativeChatsScreen.tsx:2620-2656`. | Need product instruction decision. |
| 46 | BLOCKED | Valid | Upgrade handoff not audited. | Need source/runtime proof. |
| 47 | BLOCKED | Valid | Filter rows not audited. | Need source/runtime proof. |
| 48 | BLOCKED | Valid | Match modal loop not runtime-audited. | Need idle logs. |
| 49 | BLOCKED | Valid | Smoke proof isolation not audited. | Need grep/log proof. |
| 50 | BLOCKED | Valid | Supabase subscriptions not audited. | Need `/app` source audit. |
| 51 | PARTIAL | Valid | Several limits exist in audited queries: `nativeChat.ts:559`, `748-750`, `864-866`. | Need full `.select()` audit. |
| 52 | PARTIAL | Valid | Management uses batched RPC/join selects: `nativeChat.ts:746-750`. | Need full per-row fetch audit. |
| 53 | BLOCKED | Valid | Request budget guard not audited. | Need source proof it stays enabled. |
| 54 | BLOCKED | Valid | Docs not updated except this audit artifact. | Required docs update still pending. |
| 55 | BLOCKED | Valid | Static gates not run in this pass. | Run after patch. |
| 56 | BLOCKED | Valid | Runtime screenshots not captured. | Needs simulator. |
| 57 | BLOCKED | Valid | Runtime logs not captured. | Needs Metro logs. |
| 58 | BLOCKED | Valid | DB proof not run. | Needs safe fixture/test data. |
| 59 | PASS | Valid | Full 60-row matrix included here. | If 70-row gate remains, this is blocked. |
| 60 | BLOCKED | Valid | Ship decision below. | No ship until runtime/DB/static gates pass. |

## Ship Decision

DO NOT SHIP.

The fix plan is valid as a 73-row hard gate now that the full matrix is supplied. The current build remains non-shippable because runtime, DB, request-budget, profile-modal, empty-state, invite-inbox, group-card icon/layout, group avatar editing, and final build proof are incomplete.

## User-Supplied 73-Row Matrix

| # | Area | Current Ship Status |
|---:|---|---|
| 1 | Hard-gate matrix | FAIL |
| 2 | Primary CTA reliability | NOT VERIFIED |
| 3 | Explore group intent | NOT VERIFIED |
| 4 | Explore CTA states | NOT VERIFIED |
| 5 | Explore close behavior | NOT VERIFIED |
| 6 | My Groups intent | NOT VERIFIED |
| 7 | My Groups Open CTA | NOT VERIFIED |
| 8 | Media section rule | NOT VERIFIED |
| 9 | Explore media rule | NOT VERIFIED |
| 10 | Invite users path | NOT VERIFIED |
| 11 | Invite candidate pool | PARTIAL |
| 12 | Pending invites display | NOT VERIFIED |
| 13 | Send invites | NOT VERIFIED |
| 14 | Current-user invite response | NOT VERIFIED |
| 15 | Accept invite UX | PARTIAL / GAP |
| 16 | Decline invite UX | PARTIAL |
| 17 | Admin join requests UX | NOT VERIFIED |
| 18 | Join request staging | CODE ONLY |
| 19 | Join request backend | PARTIAL |
| 20 | Request-to-join backend | PARTIAL |
| 21 | Request sent state | PARTIAL |
| 22 | Creator/admin role | NOT VERIFIED |
| 23 | Role source truth | PARTIAL |
| 24 | Verification trust | PARTIAL |
| 25 | Verified badge accuracy | FAIL UNTIL PROVEN |
| 26 | Avatar/badge composition | PARTIAL |
| 27 | Profile modal link | PARTIAL |
| 28 | Profile modal full bleed | FAIL / PARTIAL |
| 29 | Profile modal badge hierarchy | FAIL |
| 30 | Group member rows | NOT VERIFIED |
| 31 | Explore members list | PARTIAL |
| 32 | Member action menu | NOT VERIFIED |
| 33 | Explore action menu | NOT VERIFIED |
| 34 | Cover controls | NOT VERIFIED |
| 35 | Description editing | NOT VERIFIED |
| 36 | Bottom padding standard | NOT VERIFIED |
| 37 | Shared primitives discipline | PARTIAL |
| 38 | AppBottomSheet height model | PARTIAL |
| 39 | Top switch | NOT VERIFIED |
| 40 | Empty state images | FAIL / UNKNOWN |
| 41 | Empty state copy | NOT VERIFIED |
| 42 | Group avatar URL normalization | PARTIAL |
| 43 | User avatar URL normalization | PARTIAL |
| 44 | Image fallback | PARTIAL |
| 45 | Conversation dialogue loading | NOT VERIFIED |
| 46 | Dialogue red line/delete underlay | UNKNOWN / NOT VERIFIED |
| 47 | Friends preview JSON | NOT VERIFIED |
| 48 | Read receipt parity | NOT VERIFIED |
| 49 | Direct chat header | NOT VERIFIED |
| 50 | Location settings action | NOT VERIFIED |
| 51 | Create group success | UNKNOWN |
| 52 | Create group location autocomplete | NOT VERIFIED |
| 53 | Join group by code UX | UNKNOWN |
| 54 | Upgrade sheet | NOT VERIFIED |
| 55 | Filter behavior | NOT VERIFIED |
| 56 | Request budget runtime churn | FAIL |
| 57 | Request budget match modal | NOT VERIFIED |
| 58 | Request budget smoke proof | NOT VERIFIED |
| 59 | Request budget realtime overload | UNKNOWN |
| 60 | Request budget missing pagination | PARTIAL |
| 61 | Request budget looped profile fetch | PARTIAL |
| 62 | Request budget config | PASS / APP FAIL |
| 63 | Runtime simulator proof | FAIL |
| 64 | Typecheck | PASS |
| 65 | Targeted ESLint | PASS |
| 66 | Diff check | PASS |
| 67 | Build | NOT VERIFIED |
| 68 | Docs artifact | PARTIAL |
| 69 | `Read First.md` modal contract | NOT VERIFIED |
| 70 | Dirty worktree safety | PASS |
| 71 | My Group location icon should be Pin | FAIL |
| 72 | Move gear icon away from avatar overlap area | FAIL |
| 73 | Create Group and Group Modal allow group avatar editing | PARTIAL |

## Critical Patch Order

1. Request budget churn rows 56-62.
2. Missing invite inbox UX rows 14-16.
3. Profile modal/badge rows 25-29.
4. Empty images/copy rows 40-41.
5. Dialogue/runtime rows 45-49.
6. Build/runtime/DB/docs proof rows 63-69.
7. My Group list/card layout rows 71-72 and group avatar editing row 73.

## 2026-05-06 Patch Result

FILES CHANGED:
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/screens/NativeChatDialogueScreen.tsx`
- `app/src/screens/NativeServiceChatScreen.tsx`
- `app/src/components/profile/NativePublicProfileModal.tsx`
- `app/src/components/profile/NativeProfileHero.tsx`
- `docs/native-chat/phase-2-chats-gap-audit-matrix.md`
- `docs/native-chat/NEXT_AGENT_RESUME.md`

CODE CHANGES:
- Row 14-16: added current-user group invite inbox sheet with avatar/name/context, staged accept/decline decisions, and confirm action.
- Row 71: replaced My Group row location text glyph with `Feather` `map-pin`.
- Row 72: moved My Group manage gear into a stable right-side header action lane, away from the avatar column.
- Row 73: verified existing Create Group avatar/cover picker and My Group modal avatar/cover save path remain wired through `updateNativeGroupChatMetadata`.
- Row 46: increased swipe threshold so normal row taps do not expose the delete underlay from small horizontal movement.
- Row 29: Explore member load failure copy is now actionable.
- Rows 28-29: profile modal header/hero badge layout tightened; verified badge now stays attached to the hero name and role/tier chips have safer narrow-width constraints.
- Row 56: removed per-load unread-total fetches from `NativeChatsScreen`; unread total now loads once per signed-in user instead of on every tab/list refresh.
- Row 73: Create Group, group detail, and dialogue group modal avatar edit strings now say group avatar, not cover photo.
- Dialogue group modal media now hides the media section when there are no attachments.
- Static blocker in `NativeServiceChatScreen` fixed: restored refresh state/import, passed link previews to message bubbles, and restored share preview styles.

STATIC PROOF:
- `npm --prefix app run typecheck`: PASS.
- `npx eslint app/src/screens/NativeChatsScreen.tsx`: PASS.
- `git diff --check`: PASS.
- `npm run build`: PASS with existing Browserslist/Tailwind/chunk-size warnings.
- After the row 46 threshold patch, `npm --prefix app run typecheck`, targeted ESLint, `git diff --check`, and `npm run build` were rerun and remained PASS.
- After the final profile/dialogue/service-chat patches: `npm --prefix app run typecheck`, targeted ESLint for touched native chats/profile files, `git diff --check`, and `npm run build` all PASS.

RUNTIME PROOF:
- `/tmp/huddle-chats-groups-73-proof.png`: Explore empty state screenshot captured.
- `/tmp/huddle-chats-my-groups-row-clean-proof-2.png`: My Groups row proof captured. Shows Pin icon next to location and manage gear moved to right-side action lane.
- `/tmp/huddle-runtime-chats-afterclick.png`: Explore group card and preview sheet. CTA is sticky/visible; sheet is preview-only.
- `/tmp/huddle-runtime-my-groups-list-final.png`: My Groups list. Pin icon is used for location; gear is in the right action lane and no longer overlaps the avatar.
- `/tmp/huddle-runtime-dialogue-afterwait.png`: Dialogue group modal opened; revealed a stale runtime bundle first, then source was patched so zero-media group modals hide the media block and avatar editing is labeled as group avatar.
- `/tmp/huddle-runtime-after-reload-error.png`: profile modal opened and full-bleed hero/header badges fit visually.
- User-supplied `/Users/hyphen/Desktop/Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.16.01.png`: Explore preview sheet is visually wrong: sheet is too shallow/cropped, background card CTA remains visible behind modal, footer CTA crowds content, and outside-backdrop tap close was not proven.
- User-supplied `/Users/hyphen/Desktop/Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.27.14.png`: My Group detail sheet is visually wrong: avatar camera overlaps the member-count pill, CTA is clipped at bottom, and outside-backdrop tap close was not implemented/proven.
- User-supplied `/Users/hyphen/Desktop/Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.28.20.png`: Group-chat-dialogue avatar opens the wrong legacy group info modal, not the My Groups detail-sheet pattern.

RUNTIME BLOCKER:
- Fresh Metro runtime emitted `ERROR [runtime not ready]: Error: Exception in HostFunction: <unknown>` after restart. This means runtime success is not fully proven for all 73 rows.
- The final one-go runtime still emitted `ERROR [runtime not ready]: Error: Exception in HostFunction: <unknown>` after Metro reload.
- Request-budget logs still showed repeated passive calls outside the Chats page, including `profiles` repeated 3x, `reminders` repeated 3x, and `record_social_feed_event` repeated 4x in 10s. Request-budget gate remains FAIL.
- DB mutation proof was not run.

LATEST PATCH AFTER USER MODAL FINDINGS:
- `NativeChatsScreen` GroupDetailsModal now uses a full-height shared bottom sheet for both Explore and My Groups and supports outside-backdrop tap to close.
- My Groups avatar edit camera button moved below the member-count pill to avoid overlap.
- `NativeChatDialogueScreen` group avatar/details modal now uses the same shared bottom-sheet/header/scroll structure instead of the legacy freeform info sheet, and supports outside-backdrop tap to close.
- Static recheck after this patch: `npm --prefix app run typecheck`, targeted ESLint, and `git diff --check` all PASS.
- Runtime visual proof after this patch is still required; rows stay incomplete until fresh simulator screenshots prove the fixes.

## 2026-05-06 Strict Code-Parity Follow-Up

SCOPE:
- No runtime proof was accepted in this pass.
- `Read First.md` and `No Mistake Codex.md` were re-read before the final code patch.
- Code fixes only; runtime remains pending until code parity/static gates are complete.

FILES PATCHED:
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/screens/NativeChatDialogueScreen.tsx`
- `app/src/lib/nativeSocial.ts`
- `docs/native-chat/phase-2-chats-gap-audit-matrix.md`

CODE CHANGES:
- Modal outside close: added backdrop `Pressable` dismissal with inner propagation stop to group invite inbox, join requests, member action menu, join-code sheet, create-group sheet, dialogue group info, dialogue manage group, and confirm modal surfaces touched in this pass.
- Dialogue group info: replaced the remaining legacy freeform hero body with the shared group-detail hero primitives (`appGroupHero`, `appGroupHeroMembers`, `appGroupHeroCopy`, `appGroupHeroMetaRow`) and inline pin icon. The close control now uses the non-absolute `AppModalIconButton` in the sheet header.
- Dialogue manage sheet: replaced absolute close button usage in the header with `AppModalIconButton` and added outside-backdrop close.
- Request budget: added session/thread/event dedupe inside `recordNativeSocialFeedEvent` so passive social feed viewability cannot repeatedly call `record_social_feed_event` for the same event key in one session.

STATIC GATES AFTER THIS PATCH:
- `npm --prefix app run typecheck`: PASS.
- `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeSocial.ts`: PASS.
- `git diff --check -- app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeSocial.ts docs/native-chat/phase-2-chats-gap-audit-matrix.md docs/native-chat/NEXT_AGENT_RESUME.md`: PASS.
- `npm run build`: PASS with existing Browserslist, Tailwind content-pattern, ambiguous duration class, and chunk-size warnings.

RUNTIME/DB STATUS:
- NOT RUN in this strict code-parity pass.
- Runtime visual rows remain `NOT VERIFIED` until a fresh one-go simulator run is performed after all code parity work.
- DB mutation rows remain `NOT VERIFIED` until safe fixture/test data proof is run.

UPDATED SHIP DECISION:
DO NOT SHIP until the one-go runtime gate and DB proof gate pass.

MODAL FINDINGS ADDED TO MATRIX:
| Impacted row | Status | Evidence | Finding |
|---:|---|---|---|
| 2 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.16.01.png` | Explore sticky CTA is not cleanly proven; footer/CTA crowds the cropped sheet and background card CTA is still visible behind modal. |
| 3 | FAIL | Same | Dynamic sheet height is wrong for Explore; sheet opens too shallow and crops content. |
| 4 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.27.14.png` | My Group footer safe padding is wrong; Open CTA is clipped at the bottom edge. |
| 5 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.16.01.png` | Explore preview intent is not fully visible/proven because sheet body is cropped. |
| 7 | FAIL | Both modal screenshots | Outside-backdrop tap close was missing/unproven. |
| 8 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.27.14.png` | My Groups detail visual quality is not acceptable; avatar edit control overlaps member pill and CTA is clipped. |
| 31 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.27.14.png` | Cover/avatar control placement fails; camera overlaps member count. |
| 45 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.28.20.png` | Group dialogue avatar opens the wrong legacy group info modal instead of the My Groups detail-sheet pattern. |
| 63 | FAIL | All three user screenshots | Runtime visual gate failed; these screenshots add new visual regressions to the matrix. |
| 73 | FAIL | `Simulator Screenshot - iPhone 17 Pro - 2026-05-06 at 22.28.20.png` | Avatar editing exists in code, but the dialogue avatar modal uses the wrong surface and presentation. |

SHIP DECISION:
DO NOT SHIP.

## 2026-05-06 Strict Code-Completion Delta

SCOPE:
- Code-only continuation. No simulator/runtime proof was run in this delta.
- `Read First.md` and `No Mistake Codex.md` were re-read before continuing.
- The user requirement is preserved: rows that need visual/runtime/DB proof remain incomplete until proven.

FILES PATCHED:
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/screens/NativeChatDialogueScreen.tsx`
- `app/src/components/profile/NativePublicProfileModal.tsx`
- `app/src/lib/nativeSocial.ts`

CODE CHANGES:
- Group detail bottom sheet now uses the shared large sheet mode for Explore and My Groups so the CTA/footer is not constrained by the earlier short `content` mode that caused cropped runtime screenshots.
- Invite candidate pool now includes the broader matched-user pool from `matches`, then batch-loads profile identity/verification with one `.in()` query. It is no longer limited to visible inbox rows.
- Remaining touched modal backdrops now dismiss on outside tap with inner propagation stop, including filters, delete/star confirms, public profile confirms, group details, join-code, invite inbox, join requests, member menu, create-group, dialogue group info, and dialogue manage group.
- `NativePublicProfileModal` now stops backdrop propagation from the modal card and its nested confirms.
- `recordNativeSocialFeedEvent` remains deduped by session/thread/event key to prevent repeated passive `record_social_feed_event` churn in a single app session.

STATIC GATES AFTER THIS DELTA:
- `npm --prefix app run typecheck`: PASS.
- `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/components/profile/NativePublicProfileModal.tsx app/src/lib/nativeSocial.ts`: PASS.
- `git diff --check -- app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/components/profile/NativePublicProfileModal.tsx app/src/lib/nativeSocial.ts docs/native-chat/phase-2-chats-gap-audit-matrix.md docs/native-chat/NEXT_AGENT_RESUME.md 'Read First.md'`: PASS.
- `npm run build`: PASS with existing Browserslist, Tailwind content-pattern, ambiguous duration class, and chunk-size warnings.

CODE MATRIX RESULT:
- Code-solvable fixes in the touched scope are now patched for rows 2, 3, 7, 10, 11, 36, 37, 38, 48, 56, 57, 58, 71, 72, and 73.
- Runtime/visual rows remain `NOT VERIFIED`.
- DB mutation rows remain `NOT VERIFIED`.
- Request-budget runtime proof remains `NOT VERIFIED` because the one-go runtime pass has not been run after this delta.

SHIP DECISION:
DO NOT SHIP until the one-go runtime gate and safe-fixture DB proof pass.

## 2026-05-06 Bumble-Level Code Reaudit Delta

SCOPE:
- Code-only reaudit of the patched chats/profile/modal scope.
- No simulator/runtime proof was run.

FINDINGS PATCHED:
- Shared sheet primitive gap: `AppBottomSheet` only exposed `content` and `large`, while the matrix requires dynamic short content with max-height long content. Added shared `autoMax` mode in `app/src/components/nativeModalPrimitives.tsx` and `app/src/components/nativeModalPrimitives.styles.ts`.
- Bottom-sheet body gap: `AppBottomSheetScroll` reused the generic modal scroll without a bottom-sheet body style. It now renders a dedicated scroll body with shared bottom-sheet scroll styling, preserving fixed header/body/footer composition.
- Group detail/dialogue sheet gap: `NativeChatsScreen` and `NativeChatDialogueScreen` now use `mode="autoMax"` for group detail sheets instead of forcing large fixed height.
- Dead UI/style drift: removed obsolete dialogue group-cover styles that belonged to the replaced legacy group-info surface.

STATIC GATES AFTER REAUDIT PATCH:
- `npm --prefix app run typecheck`: PASS.
- `npx eslint app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/components/profile/NativePublicProfileModal.tsx app/src/lib/nativeSocial.ts`: PASS.
- `git diff --check -- app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/components/profile/NativePublicProfileModal.tsx app/src/lib/nativeSocial.ts docs/native-chat/phase-2-chats-gap-audit-matrix.md docs/native-chat/NEXT_AGENT_RESUME.md`: PASS.
- `npm run build`: PASS with existing Browserslist, Tailwind content-pattern, ambiguous duration class, and chunk-size warnings.

UPDATED SHIP DECISION:
DO NOT SHIP until one-go runtime visual/request-budget proof and safe-fixture DB proof pass.
