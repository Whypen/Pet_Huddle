PHASE/GATE:
Phase 2 `/chats` Bumble-level runtime follow-up after user rejection.

RESULT: BLOCKED / NOT SHIPPED

FILES CHANGED:
- `app/src/screens/NativeChatsScreen.tsx`
- `app/src/screens/WebShellScreen.tsx`
- `app/src/components/nativeModalPrimitives.styles.ts`
- `app/src/components/profile/NativeProfileHero.tsx`
- `app/src/components/profile/NativePublicProfileContent.tsx`
- `supabase/migrations/20260506165000_public_group_preview_members.sql`
- `supabase/migrations/20260506184000_native_chat_membership_rpc_boundary.sql`
- `docs/native-chat/NEXT_AGENT_RESUME.md`

PATCH DIFFS:
- Added a `/chats` load gate to suppress duplicate identical Supabase loads and force only explicit refresh/action reloads.
- Switched missing chat empty states to the shared Empty Chat asset instead of text-only cards.
- Renamed the upgrade modal component reference to avoid the stale `DiscoverUpgradeModal` runtime red-screen path.
- Moved Explore group detail to content-height bottom sheet mode so short previews are dynamic and footer stays owned by `AppBottomSheetFooter`.
- Tightened `AppBottomSheet` primitive height/scroll/footer constraints with shared footer bottom padding.
- Added profile gate caching in `WebShellScreen` to avoid repeated profile/pet onboarding gate fetches on route/object churn.
- Updated group member RPC contracts to return `is_verified` and classify `created_by` as `admin`.
- Stretched native public profile content/hero to prevent unintended inset media.

SQL MIGRATIONS:
- `20260506165000_public_group_preview_members.sql`: public preview members now include `is_verified` and creator/admin role ordering.
- `20260506184000_native_chat_membership_rpc_boundary.sql`: native group members now include `is_verified`.

RLS:
- No new RLS policy.

TRIGGER CODE:
- None.

RPC FUNCTIONS:
- `get_public_group_preview_members`
- `get_native_group_members`

ROUTE SEARCH OUTPUT:
- `/app` native route only. `src` web source was read for parity; no web source patch was made in this pass.

DATABASE PROOF COMMANDS:
- Not run. No real invite/request/create mutation proof was performed.

STORAGE POLICY PROOF:
- Not run.

REALTIME PROOF:
- Static sweep found active realtime channels only in chat dialogue, service chat, signup verification signal, and smoke helper. No map live subscription was found.

PUSH/DEEPLINK PROOF:
- `xcrun simctl openurl booted 'pet.huddle:///chats?tab=groups'`: opened native Chats > Groups.

ROLLBACK PROOF:
- Not run.

UIUX PARITY PROOF:
- Runtime screenshot `/tmp/huddle-chats-groups-proof.png` proves native Chats > Groups loads without the previous red screen.
- Runtime click proof for Group Details failed because injected simulator taps did not open the row/detail surface. Therefore sticky CTA/admin-role/profile-modal visual proof is NOT VERIFIED.

TEST RESULTS:
- `npm --prefix app run typecheck`: pass.
- `npx eslint app/src/screens/NativeChatsScreen.tsx app/src/screens/WebShellScreen.tsx app/src/lib/nativeChat.ts app/src/components/nativeModalPrimitives.tsx app/src/components/nativeModalPrimitives.styles.ts app/src/components/profile/NativePublicProfileModal.tsx app/src/components/profile/NativeProfileHero.tsx app/src/components/profile/NativePublicProfileContent.tsx`: pass.
- `git diff --check`: pass.
- `npm run build`: pass with existing Browserslist/Tailwind/chunk-size warnings.

BLOCKERS:
- Not release-ready: group detail sheet footer/admin-role/member profile proof is still not visually verified.
- Request-budget proof is improved but not fully clean: runtime logs still showed repeated Home/WebShell profile/pet/notification reads during app boot/user state churn before the cache fix could be re-proven.
- DB mutation proof for request-to-join, accept/decline invite, invite users, approve/decline requests, and create group was not run.

FIXES APPLIED:
- See PATCH DIFFS.

SAFE TO CONTINUE TO NEXT GATE:
yes, but only to runtime verification and remaining fixes. Do not ship.

NEXT_AGENT_RESUME UPDATED:
yes
