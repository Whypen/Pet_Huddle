PHASE/GATE:
Phase 2 `/chats` Bumble-level group sheet follow-up.

RESULT: PASS / CODE-GATE ONLY

FILES CHANGED:
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/lib/nativeChat.ts`
- `app/src/lib/nativeChatPhase3Smoke.ts`
- `docs/native-chat/NEXT_AGENT_RESUME.md`

PATCH DIFFS:
- Explore invite response split into `Accept invite` and `Decline invite`.
- My Groups media section now renders only when media exists.
- My Groups admin surface now has an explicit `Invite users` path with pending invited rows, member/invite exclusion, friend search, profile-linked rows, and batched invite submit.
- Admin join-request review now opens a staged bottom sheet with avatar/name, tick/cross decisions, muted opposite action, and sticky confirm.
- Native join-request approve/decline now uses web-equivalent RPCs instead of direct status edits.
- Group request/invite profile fetch includes `is_verified`.
- Group member rows no longer fake verification from admin role.
- Create Group body uses shared `AppBottomSheetScroll`; removed local footer safe-area wrapper.
- Removed a dead phase-3 smoke import from the chat screen and fixed the smoke helper type mismatch.

SQL MIGRATIONS:
- none

RLS:
- `declineNativeGroupInvite` uses the existing `group_chat_invites` authenticated update/RLS contract.

TRIGGER CODE:
- none

RPC FUNCTIONS:
- `approve_group_join_request`
- `decline_group_join_request`
- `accept_group_chat_invite_by_id`
- `accept_group_chat_invite`

ROUTE SEARCH OUTPUT:
- Scope stayed inside `/app` native chat surfaces; `src/pages/Chats.tsx` was read as source-of-truth and not edited.

DATABASE PROOF COMMANDS:
- not run; runtime/database mutation proof intentionally not executed.

STORAGE POLICY PROOF:
- not applicable in this follow-up.

REALTIME PROOF:
- not applicable; no realtime subscriptions added.

PUSH/DEEPLINK PROOF:
- not run.

ROLLBACK PROOF:
- not run.

UIUX PARITY PROOF:
- Code parity read against `src/pages/Chats.tsx` group manage/invite/request sections.
- Runtime simulator visual proof not run.

TEST RESULTS:
- `npm --prefix app run typecheck`: pass
- `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/lib/nativeChat.ts app/src/lib/nativeChatPhase3Smoke.ts app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts app/src/components/profile/NativePublicProfileModal.tsx app/src/components/profile/NativeProfileHero.tsx app/src/lib/nativeProfilePhotos.ts`: pass
- `git diff --check`: pass
- `npm run build`: pass with existing Browserslist/Tailwind/chunk-size warnings

BLOCKERS:
- Simulator proof not run, so release status remains code-gated only.
- `nativeModalPrimitives.styles.ts` still has active existing composer transparent/no-shadow values; classified as approved composer reset, not group sheet drift.

FIXES APPLIED:
- See PATCH DIFFS.

SAFE TO CONTINUE TO NEXT GATE:
yes, runtime simulator proof is next.

NEXT_AGENT_RESUME UPDATED:
yes
