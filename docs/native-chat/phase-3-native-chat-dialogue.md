PHASE/GATE:
Phase 3 Native `/chat-dialogue` UI/code parity closure.

RESULT:
PASS

FILES CHANGED:
- `app/src/screens/NativeChatDialogueScreen.tsx`
- `app/src/lib/nativeChat.ts`
- `app/src/components/profile/NativePublicProfileModal.tsx`
- `app/src/components/nativeModalPrimitives.tsx`
- `app/src/components/nativeModalPrimitives.styles.ts`
- `docs/native-chat/NEXT_AGENT_RESUME.md`
- `docs/native-chat/phase-3-native-chat-dialogue.md`

PATCH DIFFS:
- Native `/chat-dialogue` owns direct and group dialogue UI with route proof states for direct normal, direct empty, blocked, unmatched, failed send, group normal, group info, manage group, group avatar remove, profile modal, and report modal.
- Header no longer has page-local top padding. WebShell safe area owns the device top inset; the native chat header starts directly under it.
- Composer now includes bottom safe-area padding using `useSafeAreaInsets`.
- Direct verified display uses the app-native shield badge treatment used elsewhere in `/app`; the previous inline checkmark was removed.
- Group info/manage sheets and confirm modals use app modal primitives and tokenized form/button treatment.
- In-chat profile modal supports a proof profile path and keeps the shared native public profile renderer.

SQL MIGRATIONS:
None.

RLS:
No DB/RLS changes in this gate.

TRIGGER CODE:
None.

RPC FUNCTIONS:
No RPC changes in this gate.

ROUTE SEARCH OUTPUT:
- `src/routes/ROUTE_MANIFEST.ts` owns `/chat-dialogue` as native content with `header: null`, `nativeBottomNav: false`, and `suppressWebHeader/suppressWebBottomNav: true`.
- `app/src/screens/WebShellScreen.tsx` renders `NativeChatDialogueScreen` only when `shouldUseNativeChatDialogueRouteOwnership()` is enabled.
- `app/src/screens/NativeChatDialogueScreen.tsx` parses `room`, `with`, `name`, and dev-only `uiProof` params.

DATABASE PROOF COMMANDS:
Not run; no DB changes and runtime DB proof is deferred by gate instruction.

STORAGE POLICY PROOF:
Code-accounted only. `app/src/lib/nativeChat.ts` continues to use the private chat attachment helper path and signed reads.

REALTIME PROOF:
Code-accounted only. Runtime realtime proof remains deferred.

PUSH/DEEPLINK PROOF:
Simulator deep links used:
- `huddle://chat-dialogue?uiProof=direct-normal&name=Direct%20Normal`
- `huddle://chat-dialogue?uiProof=direct-empty&name=Direct%20Empty`
- `huddle://chat-dialogue?uiProof=direct-blocked&name=Direct%20Blocked`
- `huddle://chat-dialogue?uiProof=direct-unmatched&name=Direct%20Unmatched`
- `huddle://chat-dialogue?uiProof=direct-failed&name=Direct%20Failed`
- `huddle://chat-dialogue?uiProof=group-normal&name=Group%20Normal`
- `huddle://chat-dialogue?uiProof=group-info&name=Group%20Info`
- `huddle://chat-dialogue?uiProof=group-manage&name=Group%20Manage`
- `huddle://chat-dialogue?uiProof=group-avatar-remove&name=Group%20Avatar`
- `huddle://chat-dialogue?uiProof=profile&name=Profile`
- `huddle://chat-dialogue?uiProof=report&name=Report`

ROLLBACK PROOF:
No rollback runtime proof in this UI gate.

UIUX PARITY PROOF:
Screenshots:
- `/tmp/huddle-phase3-ui-current/01-direct-normal.png`
- `/tmp/huddle-phase3-ui-current/02-direct-empty.png`
- `/tmp/huddle-phase3-ui-current/03-direct-blocked.png`
- `/tmp/huddle-phase3-ui-current/04-direct-unmatched.png`
- `/tmp/huddle-phase3-ui-current/05-direct-failed.png`
- `/tmp/huddle-phase3-ui-current/06-group-normal.png`
- `/tmp/huddle-phase3-ui-current/07-group-info.png`
- `/tmp/huddle-phase3-ui-current/08-group-manage.png`
- `/tmp/huddle-phase3-ui-current/09-group-avatar-remove.png`
- `/tmp/huddle-phase3-ui-current/10-profile.png`
- `/tmp/huddle-phase3-ui-current/11-report.png`

TEST RESULTS:
- `npm --prefix app run typecheck`: PASS
- `npx eslint app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeChat.ts app/src/components/profile/NativePublicProfileModal.tsx app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts`: PASS
- `git diff --check -- app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeChat.ts app/src/components/profile/NativePublicProfileModal.tsx app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts`: PASS
- `npm run build`: PASS

BLOCKERS:
None for Phase 3 code-accounted UI parity. Runtime realtime stress proof remains a later gate by instruction.

FIXES APPLIED:
- Fixed empty top header drift by removing page-local screen padding and using normal flex ownership under WebShell safe area.
- Added bottom safe-area padding to the composer.
- Replaced the wrong direct-chat verified checkmark with the app-native shield badge treatment.
- Audited touched modal/input/button styles and kept them on shared `/app` tokens/primitives.

SAFE TO CONTINUE TO NEXT GATE:
yes

NEXT_AGENT_RESUME UPDATED:
yes

PHASE 2 + 3 COMBINED RESTART PATCH:
- Date: 2026-05-05
- Trigger: product requested Phase 2 and Phase 3 together from the audit matrix; prior Phase 3 PASS wording is no longer sufficient for release-complete status without the current combined proof gates.
- Scope touched this pass: `app/src/screens/NativeChatDialogueScreen.tsx`, `app/src/lib/nativeChat.ts`, plus Phase 2 quota behavior in `app/src/screens/NativeChatsScreen.tsx`.

PHASE 3 PATCHES APPLIED:
- Native `/chat-dialogue` now clears previous room/messages/counterpart/group/read/link/attachment/composer state before resolving a new route target, matching the web source reset behavior.
- Native room loading now requires the current user to be present in `chat_room_members` before treating the room as accessible, matching web membership-first behavior.
- If a supplied `room` is not accessible, native now falls back through `matches.chat_id` to find the active direct counterpart and opens the canonical direct room, matching the web `room` fallback path even when `with` is missing.
- Native read receipt upserts now include `read_at`, matching the web `message_reads` write shape.

PHASE 3 STILL BLOCKED / NOT COMPLETE:
- Required realtime proof was not run: 20-message send/receive, background/foreground, 10 room switches, reopen, no duplicates, unsubscribe cleanup, stale-room event guard.
- Required offline/reconnect proof was not run.
- Required performance proof was not run.
- Legacy public `notices` chat media is web-only historical behavior. Native chat attachments use the private `chat_attachments` bucket with signed read URLs; existing public objects are not backfilled, moved, or deleted in this phase.
- UI screenshot proof was not re-run after this restart patch.

PHASE 3 CURRENT RESULT:
PARTIAL. Code parity improved for route reset, membership/fallback resolution, and read receipt write shape, but `/chat-dialogue` is not release-complete until realtime/offline/performance/runtime visual proof is run.

PROOF RUN THIS RESTART:
- `npm --prefix app run typecheck -- --pretty false`: PASS
- `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeChat.ts`: PASS
- `git diff --check -- app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeChat.ts docs/native-chat/phase-2-native-chats.md docs/native-chat/phase-3-native-chat-dialogue.md docs/native-chat/NEXT_AGENT_RESUME.md`: PASS
- `npm run build`: PASS

SAFE TO SHIP /chat-dialogue NATIVE:
no.

PHASE 3 WEB VS APP UIUX MATRIX AFTER IDENTICALITY PASS:

| Area | Web behavior | App behavior now | Equal? |
|---|---|---|---|
| Route params | Reads `room`, `with`, `name`, `joined`. | Reads `room`, `with`, `name`; group join hydration does not expose a separate native `joined` UI state. | PARTIAL |
| Route reset | Clears room/messages/counterpart/group/read/link/attachment/composer state on route change. | Patched to clear the same state classes before resolving the next target. | CODE-EQUAL |
| Room membership | Requires current-user membership before accepting a room. | Patched to require current user in `chat_room_members`. | CODE-EQUAL |
| Direct fallback | If room inaccessible, checks `matches.chat_id` and opens canonical direct room. | Patched to fall back through `matches.chat_id` and `ensureNativeDirectChatRoom`. | CODE-EQUAL |
| Header | Back, identity/avatar, subtitle/social/availability, more actions. | Same structure with app native sizing. | NEEDS PIXEL PROOF |
| Message day divider | `11px`, rounded pill, translucent white, centered. | Patched to 11px centered pill with matching spacing/color token approximation. | NEEDS PIXEL PROOF |
| Sender label | `11px` semibold muted label above group messages. | Patched to 11px semibold muted label. | CODE-EQUAL |
| System/message hint pills | Blue system pill, muted membership hint. | System pill patched closer; membership hint uses same system renderer for join/leave. | PARTIAL |
| Message bubble | Max 90%, rounded-xl, border, `px-3 py-2`, 14px text. | Patched to max 90%, 12 radius, horizontal 12 / vertical 8, 14px text. | CODE-EQUAL |
| Mine/theirs colors | Mine blue/white; theirs muted/text; star gold. | Same tokenized colors; exact rgba differs where native token is used. | NEEDS PIXEL PROOF |
| Time/read marks | `11px`, muted; read mark blue. | Patched to 11px muted/blue. | CODE-EQUAL |
| Attachments | 144px media previews in bubble grid on web. | Patched media previews to 144px; RN wrap/grid needs screenshot proof. | NEEDS PIXEL PROOF |
| Composer shell | Top border, white/glass background, upload rail 64, inner rounded input chrome, 36 upload button, 40 send button. | Patched composer shell, inner chrome, 36 upload, 40 send, 64 upload rail. | NEEDS PIXEL PROOF |
| Composer behavior | Text/media/link preview, disabled states, send failure restore. | Same behavior. | CODE-EQUAL |
| Link previews | Extract, fetch, lock, dismiss, render. | Same behavior. | CODE-EQUAL |
| Shared cards | Parses `huddle_share` and renders shared content card. | Same parse/render path. | CODE-EQUAL |
| Read receipts | Upserts `chat_id`, `message_id`, `user_id`, `read_at`; realtime marks peer reads. | Patched `read_at`; realtime read subscription exists. | CODE-EQUAL |
| Realtime messages | Dedupes, orders, cleanup, stale room guard. | Dedupes/orders/disposes/stale room guard in code. | NEEDS STRESS PROOF |
| Block/unblock | Same RPC and composer terminal states. | Same RPC and terminal states. | CODE-EQUAL |
| Unmatch | Same RPC and return to chats. | Same RPC and return. | CODE-EQUAL |
| Report | Web report modal source/evidence behavior. | Native social report modal with chat source; evidence parity not fully proven. | NEEDS RUNTIME PROOF |
| Public profile | Opens public profile sheet. | Opens shared native public profile modal with actions hidden. | CODE-EQUAL |
| Group info/manage | Cover, description, mute, manage, invite/remove, leave/remove group. | Same feature set in native sheets. | NEEDS RLS/RUNTIME PROOF |
| Offline/reconnect | Required by phase contract. | Not proven. | BLOCKED |
| Performance | 100-message/media/keyboard/memory proof required. | Not proven. | BLOCKED |

PHASE 3 RESULT AFTER THIS PASS:
Not full UIUX identical yet. Remaining blockers are `joined` UI nuance, membership/system hint exact treatment, pixel proof for header/messages/composer/sheets, realtime stress proof, offline/reconnect proof, performance proof, and group/report runtime proof.
