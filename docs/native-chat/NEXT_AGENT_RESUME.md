# Native Chat Resume

CURRENT PHASE/GATE:
Phase 2 `/chats` code-only 42 screenshot issue fix pass.

RESULT:
BLOCKED / NOT SHIPPED.

LATEST GATE ARTIFACT:
docs/native-chat/phase-2-code-only-42-screenshot-fixes-20260507.md

UNRESOLVED BLOCKERS:
- Latest code-only pass fixed the screenshot modal code gaps without running runtime, by user instruction.
- Runtime visual proof remains required for all 42 screenshot issues before any row can become visually complete.
- DB proof remains required for invite/request/create mutations.
- Request-budget idle/navigation proof remains required.
- Static gates after the latest code-only pass are green.
- User supplied three modal screenshots that are now recorded in `docs/native-chat/phase-2-chats-gap-audit-matrix.md`: Explore sheet cropped/too shallow with background CTA visible, My Group detail camera overlapping member pill with clipped Open CTA, and group-chat-dialogue avatar opening the wrong legacy group info modal.
- Latest code patch after those screenshots: GroupDetailsModal now uses a full-height shared sheet and outside-backdrop close; My Group camera was moved below member pill; dialogue group info now uses shared bottom-sheet/header/scroll structure and outside-backdrop close. Fresh runtime proof is still required.
- Strict code-parity follow-up after rereading `Read First.md` and `No Mistake Codex.md`: no runtime proof accepted. Added outside-backdrop close to the remaining touched bottom sheets/menus/confirms, replaced dialogue group info's legacy visual body with shared group-detail hero primitives, replaced absolute close buttons in dialogue sheet headers with inline `AppModalIconButton`, and deduped native social feed event RPCs per session/thread/event.
- Fresh Metro runtime emitted `ERROR [runtime not ready]: Error: Exception in HostFunction: <unknown>` after restart; runtime success is not fully proven.
- Final one-go runtime still emitted `ERROR [runtime not ready]: Error: Exception in HostFunction: <unknown>` after Metro reload.
- Request-budget logs still showed repeated passive calls outside the Chats page: `profiles` 3x, `reminders` 3x, and `record_social_feed_event` repeated 4x in 10s. Request-budget gate remains FAIL.
- Group detail sheet runtime proof is still missing because simulator tap injection did not open the row/detail surface.
- Request-budget runtime proof must be rerun after the `WebShellScreen` profile-gate cache patch.
- Database mutation proof is still missing for request-to-join, accept/decline invite, invite users, approve/decline requests, and create group.
- Visual proof is still required for Explore short content, Explore long member list, My Groups with media, My Groups without media, profile modal full-bleed hero, and member avatar/name profile taps.
- Rows 71-73 added: My Group location icon must use a Pin, gear icon must move away from avatar overlap area, and group avatar editing must be available in Create Group and Group Modal.

FILES CHANGED THIS GATE:
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/screens/NativeChatDialogueScreen.tsx`
- `app/src/components/nativeModalPrimitives.tsx`
- `app/src/components/nativeModalPrimitives.styles.ts`
- `docs/native-chat/phase-2-code-only-42-screenshot-fixes-20260507.md`
- `docs/native-chat/NEXT_AGENT_RESUME.md`

COMMANDS ALREADY RUN:
- `sed -n '1,260p' 'Read First.md'`
- `sed -n '1,260p' 'No Mistake Codex.md'`
- `sed -n '1,220p' 'native chat.md'`
- `npm --prefix app run typecheck`
- `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/screens/WebShellScreen.tsx app/src/lib/nativeChat.ts app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts app/src/components/profile/NativePublicProfileModal.tsx app/src/components/profile/NativeProfileHero.tsx app/src/components/profile/NativePublicProfileContent.tsx`
- `git diff --check`
- `npm run build`
- Latest code-only pass: `npm --prefix app run typecheck` PASS; targeted ESLint PASS; `git diff --check` PASS; `npm run build` PASS with existing warnings.
- Final pass after current edits: `npm --prefix app run typecheck`, targeted ESLint for touched native chats/profile files, `git diff --check`, and `npm run build`: PASS.
- Strict code-parity follow-up commands: `npm --prefix app run typecheck`: PASS; `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeSocial.ts`: PASS; targeted `git diff --check`: PASS; `npm run build`: PASS with existing warnings.
- `xcrun simctl openurl 339821B7-1376-4EF1-8BC2-8CDA1E211FBF 'pet.huddle:///chats?tab=groups'`
- `xcrun simctl io 339821B7-1376-4EF1-8BC2-8CDA1E211FBF screenshot /tmp/huddle-chats-groups-73-proof.png`
- `xcrun simctl io 339821B7-1376-4EF1-8BC2-8CDA1E211FBF screenshot /tmp/huddle-chats-my-groups-row-clean-proof-2.png`
- `npm --prefix app start -- --localhost`
- `xcrun simctl openurl booted 'pet.huddle:///chats?tab=groups'`
- `xcrun simctl io booted screenshot /tmp/huddle-chats-groups-proof.png`
- `/tmp/huddle-runtime-chats-afterclick.png`
- `/tmp/huddle-runtime-my-groups-list-final.png`
- `/tmp/huddle-runtime-dialogue-afterwait.png`
- `/tmp/huddle-runtime-after-reload-error.png`

COMMANDS STILL REQUIRED:
- User approval for one-go runtime verification.
- Debug fresh Metro `HostFunction` runtime error before claiming runtime success.
- Restart Metro after current patches and rerun request-budget log proof.
- Open Group Details in simulator and capture proof for sticky footer/admin role/member rows/profile tap.
- Capture profile modal proof after full-bleed/content sizing patch.
- Run safe fixture/test-data DB proof for group request/invite/create actions or mark those rows `NOT VERIFIED`.
- Re-run typecheck, targeted eslint, diff check, and build after any further patch.

NEXT ALLOWED ACTION:
Wait for user approval, then run one-go runtime proof. Do not claim shipped until every matrix row has current runtime/DB/static proof.

STRICT CODE-COMPLETION DELTA:
- Re-read `Read First.md` and `No Mistake Codex.md`.
- No runtime proof was run in this delta.
- `NativeChatsScreen` now keeps GroupDetailsModal on shared large sheet mode for Explore and My Groups, avoiding the previous cropped `content` sheet path.
- Invite users now uses the broader matched-user pool from `matches` and batch-loads candidate profiles/verification via one `.in()` read instead of relying only on visible inbox rows.
- Remaining touched modal surfaces now close on outside-backdrop tap with inner propagation stop, including filters, delete/star confirms, profile confirms, group details, join-code, invite inbox, join requests, member menu, create-group, dialogue group info, and dialogue manage group.
- Static gates after this delta: `npm --prefix app run typecheck` PASS; targeted ESLint for `NativeChatsScreen.tsx`, `NativeChatDialogueScreen.tsx`, `NativePublicProfileModal.tsx`, and `nativeSocial.ts` PASS; targeted `git diff --check` PASS; `npm run build` PASS with existing warnings.
- Runtime/visual/DB proof remains pending and must not be represented as complete.

BUMBLE-LEVEL CODE REAUDIT DELTA:
- No runtime proof was run.
- Added shared `AppBottomSheet` `autoMax` mode for dynamic short sheets with capped long-content height.
- `AppBottomSheetScroll` now renders a dedicated bottom-sheet scroll body instead of reusing only the generic modal scroll path.
- Group detail sheets in `NativeChatsScreen` and group-dialogue info in `NativeChatDialogueScreen` now use `mode="autoMax"`.
- Removed obsolete legacy dialogue group-cover styles left behind by the shared group-detail surface replacement.
- Static gates after this reaudit patch: typecheck PASS; targeted ESLint PASS; targeted `git diff --check` PASS; `npm run build` PASS with existing warnings.

FORBIDDEN ACTIONS:
- Do not touch `mobile`.
- Do not edit `src` for native parity unless the user explicitly approves a web product change.
- Do not mutate real production user/group data for proof.
- Do not disable `request_budget`.

STOP CONDITION:
Stop and report `NOT SHIPPED` if runtime proof shows a red screen, request-budget churn, missing sticky CTA, wrong admin/verified source, or any unproven DB mutation.

IMPLEMENTATION ALLOWED:
yes, `/app` native chats/profile/modal files and required SQL migration sync only.
