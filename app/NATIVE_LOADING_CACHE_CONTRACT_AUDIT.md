# Native Loading / Cache Contract Audit

Scope: current `/app` native loading, cache, DB refresh, realtime, session freshness, and lazy-loading behavior after the latest P1 cache/session coherence pass and the DB-backed Social saved/pinned preference patch.

Audit timestamp: 2026-05-17.

Overall loading/cache status: **PASS (SOURCE) / NEEDS RUNTIME PROOF**.

Migration sync status: **REMOTE APPLIED** for `20260517123000_native_social_post_preferences.sql` and `20260517124500_native_social_pin_rpc_conflict_fix.sql`.

## 0B. CARE CHAT / CHATS REALTIME CACHE AUDIT SNAPSHOT

Audit timestamp: 2026-05-20.

Scope: Native Care Chat and native Chats list status/progress badges, against the Huddle Validated Local Mirror contract.

Current status:

| Surface / signal | Current source state | Status |
|---|---|---|
| Care Chat text messages | `NativeServiceChatScreen` has a dedicated `chat_messages` channel filtered by the current `chat_id`; INSERT deltas merge by id and write the validated message mirror as `source="realtime"`. | PASS/SOURCE |
| Care Chat request/quote/payment/PIN/check-in/completion/issue state | `service_chats` is in `supabase_realtime`; `NativeServiceChatScreen` subscribes by current `chat_id`, clears the service row mirror, invalidates chat read caches, and silently DB-validates through the owning service chat load path. | PASS/SOURCE |
| Care Chat disputes/resolution | `service_disputes` is in `supabase_realtime`; `NativeServiceChatScreen` subscribes by current `service_chat_id` and silently DB-validates the combined service/dispute row. | PASS/SOURCE |
| Care Chat event-only changes | Patched on 2026-05-20: `service_care_events` is added to `supabase_realtime`; `NativeServiceChatScreen` subscribes by current `service_chat_id` so event-only CARE updates, including skipped mid-care update events, invalidate through the same DB-confirmed service chat load path. | PASS/SOURCE |
| Chats list Care progress/status badge | `NativeChatsScreen` listens to user-scoped `service_chats` changes for requester/provider rows, then debounced-refreshes the chat inbox RPC/cache; the list RPC remains the owning surface for compact row progress/status. | PASS/SOURCE |
| Chats list text preview / unread visible rows | Patched on 2026-05-20: `NativeChatsScreen` no longer subscribes to every `chat_messages` change. It registers filtered `chat_messages` listeners only for currently visible row `chat_id`s, plus user-scoped read/member/invite listeners. | PASS/SOURCE |
| Chats list group join requests | Patched on 2026-05-20: broad `group_join_requests` realtime was replaced by `user_id=auth user` plus visible group `chat_id` listeners, so personal request state and visible managed groups refresh without global request churn. | PASS/SOURCE |
| Chats list route-entry cache paint | Verified on 2026-05-20: the inbox mirror cache is scoped by `userId`, `sessionKey`, and tab surface, requires `dbConfirmedAt`, paints cached rows immediately on route entry, preserves DB-confirmed last-message/unread/progress fields, then forces the inbox RPC/DB refresh to overwrite the hydrated rows. | PASS/SOURCE |

Network churn judgment:

- No per-row DB fetches were added.
- Realtime still triggers one debounced owning-surface refresh (`fetchNativeChatInbox`) instead of N refreshes.
- Visible-row scoped realtime removes unnecessary payload delivery from unrelated `chat_messages` and unrelated `group_join_requests`.
- Off-screen conversation changes are intentionally left to foreground/manual/next inbox validation unless they arrive through user-scoped membership/read/service state events; this preserves the current list cache contract without broad message subscriptions.
- Route-entry cache paint does not make cache live truth: cached rows only appear from a DB-confirmed mirror, and `fetchNativeChatInbox(... forceDb: true)` still validates the active surface before marking `inboxSyncState="fresh"`.

## 0A. LATEST SERVICE / CARER PROFILE LIVE-TRUTH AUDIT SNAPSHOT

Audit timestamp: 2026-05-18.

Scope: Service and Carer Profile only, against the Huddle Validated Local Mirror contract.

Current Service status:

| Surface / field | Current source state | Status |
|---|---|---|
| Service provider cards | `native-service:cards:v1:{userId,sessionKey,anchor,country,viewerScope}` can hydrate for fast paint, then active `NativeServiceScreen.load()` calls `fetchNativeServiceProviders(... force: true)` to validate through `get_native_service_provider_cards`. | PASS |
| Service provider detail | `serviceProviderDetail:v2:${userId}:${sessionKey}:${providerId}:${updatedAt}` can paint cached detail on provider open, then `fetchNativeServiceProviderDetail(... force: true)` validates through `get_native_service_provider_detail`. | PASS |
| Care Chat messages | Patched on 2026-05-19: `NativeServiceChatScreen` now receives `sessionKey`, hydrates messages from the validated `chatMessages:v2` cache only after the service chat row is confirmed, overwrites with DB-confirmed `chat_messages`, and writes DB/realtime-confirmed messages back with the captured session key. | PASS/SOURCE |
| Care Chat realtime | Patched on 2026-05-19: `native-service-chat:${roomId}` captures room + session, applies `chat_messages` INSERT deltas locally with duplicate-id protection, writes the realtime-confirmed mirror cache, and clears cache + silently reloads on non-INSERT changes. `service_chats` changes still silently validate the full row. | PASS/SOURCE |
| Care Chat shared images | Patched on 2026-05-19: shared image attachments render through `NativeSocialMediaCarousel`, matching Friends Chat tap-to-enlarge behavior instead of static thumbnails. | PASS/SOURCE |
| Care Chat profile/detail session scope | Patched on 2026-05-19: provider detail and public profile modal opened from Care Chat now receive the route `sessionKey` instead of `null`. | PASS/SOURCE |
| Care banner realtime | Patched on 2026-05-19: `NativeServiceInboxBanner` now renders the validated inbox cache immediately for fast paint, then debounced-refreshes from `chat_messages`, `message_reads`, `group_chat_invites`, `group_join_requests`, and `chat_room_members` with foreground revalidation so the banner follows the same cache-first contract as the chat inbox. | PASS/SOURCE |
| Bookmark state | `toggle_native_service_bookmark` is DB/RPC-backed; failure rolls UI back to previous provider list. | PASS |
| Restrictions | `user_moderation_restrictions` and `user_moderation` realtime subscriptions refresh `service_disabled` / `marketplace_hidden`. | PASS |
| Sorting/filtering | Runs over DB-validated provider rows; cache can only seed the list before the forced DB fetch. | PASS |
| Price/rate/availability/listed/provider visibility | Read from provider card/detail RPCs; DB refresh overwrites cache by provider row. | PASS |
| Stale response guard | `serviceSessionKeyRef`, `activeProviderIdRef`, and `cacheWriteGuard` block old screen/detail responses from writing after session/provider changes. | PASS |
| Broad provider realtime INSERT/UPDATE/DELETE | No broad service-provider subscription; current behavior relies on active load, manual refresh, foreground refresh, and forced detail refresh. | ACCEPTED PARTIAL |

Current Carer Profile status:

| Surface / field | Current source state | Status |
|---|---|---|
| Profile summary shell | `readCachedNativeProfileSummary` can paint shell, then `fetchNativeProfileSummary` validates; `subscribeNativeProfileSummary` patches profile summary/social album. | PASS |
| `pet_care_profiles` load | Patched on 2026-05-18: `fetchNativeCarerProfileRow(..., { force: true })` is used by `loadData()`, so the 30s in-memory cache no longer answers screen load as authority. | PASS |
| Save/upsert result | Patched on 2026-05-18: save uses PostgREST `return=representation`, caches the DB-returned row, and maps UI from that returned row instead of promoting the submitted payload. | PASS |
| Wallet/listed realtime | `pet_care_profiles` `UPDATE` subscription patches wallet/listed subset and updates local row cache. | PASS/PARTIAL |
| Full profile realtime | Realtime handler only patches wallet/listed fields, not every editable field. Screen load/save are DB-confirmed; external concurrent full-field changes require reload. | ACCEPTED PARTIAL |
| Stale response guard | No explicit request sequence on Carer Profile; user-scoped load now forces DB and cache is short-lived. | LOW RISK |

Resolved in current source:

- Carer Profile no longer lets a 30-second memory cache satisfy `loadData()` as live truth.
- Carer Profile save no longer writes the submitted payload as authoritative cache/UI state; it uses the DB-returned representation.
- Service cards/detail already follow cache-first paint plus forced DB validation on the active screen/detail paths.
- Care Chat now follows the same validated message mirror family as Friends Chat for route-open hydration, DB overwrite, and realtime INSERT cache writes.
- Care Chat shared image attachments now use the same carousel/enlarged-viewer path as Friends Chat.

Test results for this pass:

- `npm --prefix app run typecheck`: PASS.
- `git diff --check`: PASS.

Current judgment: the latest cache/session pass fixed the previously listed Social, Chat inbox/messages, Service cards/detail, Map alert detail, and Notifications panel session-coherence risks. This follow-up pass also fixed the remaining source-proven P1 cache risks for profile/Home pet shell keys, Home reminders exact-token refresh, Settings family lazy loading, Verify Identity profile-cache refresh identity, and signup draft auth-boundary cleanup. There are no current source-proven P0 stale-cache blockers. Strict release closure still needs runtime request-count and slow-network proof.

## 0. LATEST SOCIAL / MAP LIVE-TRUTH AUDIT SNAPSHOT

Audit timestamp: 2026-05-17.

Scope: Social and Map only, after the DB-backed Social saved/pinned preference patch, against the Huddle Validated Local Mirror contract:

- Server DB is authority.
- Realtime is live delta.
- Async cache is only a last DB-confirmed local mirror for instant paint.
- Cache may render fast only as hydrating/local mirror; it must not declare live truth before DB/realtime validation.
- DB/realtime validation must patch by stable id and stale responses must not overwrite newer DB-confirmed state.

Current Social status:

| Surface / field | Current source state | Status |
|---|---|---|
| Feed first page | `native-social-feed:v4:${userId}:${sessionKey}:${country}:${sort}` hydrates first, then `fetchNativeSocialFeedPage` validates DB with request/session guards. | PASS |
| Post/thread rows | DB refresh patches rows by stable `thread.id`; realtime visible thread updates schedule DB refetch. | PASS |
| Comments/replies | `native-social-comments:v4:${userId}:${sessionKey}:${threadId}:${count}:${updatedAt}` hydrates first, then `fetchNativeSocialComments` validates DB. | PASS |
| Likes/support count | `thread_supports` realtime uses `event: "*"`, mutation DB result patches count. | PASS |
| My like/support state | visible thread support IDs are DB/RPC-backed and realtime-patched for the current user. | PASS |
| Deleted thread state | `threads` realtime `DELETE` removes row and purges comment cache for that thread. | PASS |
| Blocked author state | loaded through native social blocked-user RPC and applied before rendering. | PASS |
| Visibility/audience restrictions | enforced by feed/detail RPC output; cache is only mirror of previous DB-visible rows. | PASS |
| Saved posts | DB-backed account preference via `native_social_post_saves` and `get_native_social_post_preferences` / `set_native_social_post_saved`; AsyncStorage is only a hydrating mirror. Saved filter uses DB-confirmed `storedSets.status === "fresh"`. Remote RPC smoke test passed as authenticated user inside rollback. | PASS |
| Pinned posts | DB-backed account preference via `native_social_post_pins` and `get_native_social_post_preferences` / `set_native_social_post_pinned`; max 3 enforced in DB/RPC; pinned ordering uses DB-confirmed `storedSets.status === "fresh"` and `pinned_at`. Remote RPC smoke test passed as authenticated user inside rollback; pin-limit error returns `native_social_pin_limit_reached` for controlled app copy. | PASS |
| Thread ordering after new activity | visible-row refresh patches rows, but no broad feed reorder subscription for unseen/newly active rows. | ACCEPTED PARTIAL |
| Reported/hidden content | reported visibility depends on backend feed RPC; hide is local suppression. | ACCEPTED PARTIAL |

Current Map status:

| Surface / field | Current source state | Status |
|---|---|---|
| Map shell pins/alerts | session cache can paint, active `loadMapData` now forces `get_visible_map_pin_shells` DB validation instead of accepting lib cache as live truth. | PASS |
| Current viewport fetch | camera/viewport load validates through DB RPC by current center/radius. | PASS |
| Camera idle fetch | debounced camera-idle fetch validates moved/zoomed map area. | PASS |
| Alert detail | pin tap can paint cached detail, then forced `get_broadcast_alert_by_id` DB fetch validates. | PASS |
| Broadcast quota/tier | broadcast modal now forces profile/quota DB refresh before eligibility/radius/duration decisions. | PASS |
| Pin expiry/visibility | shell RPC returns visible rows and marker state; DB is authority. | PASS |
| Restrictions | moderation restrictions sync from DB/realtime. | PASS |
| My alert interaction state | alert detail supports count/state are DB/realtime-backed. | PASS |
| Broad map-shell realtime INSERT/UPDATE/DELETE | not present; current behavior relies on initial load, manual refresh, focus, camera idle, and mutation callbacks. Product accepted this as noted. | ACCEPTED PARTIAL |
| Explicit UI source/status display | cache hydrates while loading, but no user-facing/source field is exposed in Map UI. Product accepted this as noted. | ACCEPTED PARTIAL |

Accepted remaining non-save/pin gaps:

- Social global feed reorder/new unseen activity is not fully realtime-driven.
- Map shell has no broad realtime invalidation subscription for all visible pins/alerts.
- UI does not expose explicit `source="cache"` / `status="hydrating"` labels, although cache hydration is followed by DB validation on audited active paths.

Resolved in current source:

- Saved posts and pinned posts are now account-level DB preferences.
- Existing legacy AsyncStorage keys `huddle_social_saves` and `huddle_social_pins` remain only as validated mirror storage. Cache read marks them `source="cache"` / `status="hydrating"`; DB preference fetch validates visible loaded thread IDs and writes a DB-confirmed mirror.
- Save/pin mutations are optimistic, RPC-backed, DB-confirmed on success, and rolled back on failure. Pin-limit errors are handled as controlled app copy.

## 1. EXECUTIVE STATUS

| Area | Status | Count | Judgment |
|---|---:|---:|---|
| Overall loading/cache | PASS/SOURCE | - | No current source-proven P0/P1 loading-cache blockers remain. Runtime proof still required. |
| P0 stale-cache blockers | PASS | 0 | No source-proven P0 stale-cache blocker remains. |
| P1 cache risks | PASS | 0 | Previously open P1s are fixed in source. |
| Runtime-only loading/cache tests | NEEDS RUNTIME ONLY | 8 | Source guards need device/network timing proof. |

Already-clean areas:

| Area | Proof | Status |
|---|---|---|
| Root session identity | `app/src/navigation/RootNavigator.tsx:317`, `app/src/navigation/RootNavigator.tsx:522` | PASS |
| Freshness registry | `app/src/lib/nativeFreshnessRegistry.ts:62`, `app/src/lib/nativeFreshnessRegistry.ts:83`, `app/src/lib/nativeFreshnessRegistry.ts:120` | PASS |
| Home freshness sweep guard | `app/src/screens/NativeHomeScreen.tsx:516`, `app/src/screens/NativeHomeScreen.tsx:525`, `app/src/screens/NativeHomeScreen.tsx:527` | PASS |
| Social feed/comments session cache | `app/src/screens/NativeSocialScreen.tsx:138`, `app/src/screens/NativeSocialScreen.tsx:140`, `app/src/screens/NativeSocialScreen.tsx:725`, `app/src/screens/NativeSocialScreen.tsx:745`, `app/src/screens/NativeSocialScreen.tsx:1408`, `app/src/screens/NativeSocialScreen.tsx:1419` | FIXED/PASS |
| Chat inbox/message session cache | `app/src/lib/nativeChat.ts:256`, `app/src/lib/nativeChat.ts:258`, `app/src/lib/nativeChat.ts:322`, `app/src/lib/nativeChat.ts:363`, `app/src/lib/nativeChat.ts:916`, `app/src/lib/nativeChat.ts:934`, `app/src/screens/NativeChatDialogueScreen.tsx:641`, `app/src/screens/NativeChatDialogueScreen.tsx:735` | FIXED/PASS |
| Chat Dialogue access/session guards | `app/src/screens/NativeChatDialogueScreen.tsx:638`, `app/src/screens/NativeChatDialogueScreen.tsx:641`, `app/src/screens/NativeChatDialogueScreen.tsx:735` | PASS |
| Service cards/detail session cache and forced detail refresh | `app/src/lib/nativeService.ts:173`, `app/src/lib/nativeService.ts:180`, `app/src/lib/nativeService.ts:420`, `app/src/lib/nativeService.ts:483`, `app/src/screens/NativeServiceScreen.tsx:271`, `app/src/screens/NativeServiceScreen.tsx:293`, `app/src/screens/NativeServiceScreen.tsx:521`, `app/src/screens/NativeServiceScreen.tsx:527` | FIXED/PASS |
| Map alert detail cache-first then forced DB refresh | `app/src/lib/nativeMapData.ts:445`, `app/src/lib/nativeMapData.ts:446`, `app/src/lib/nativeMapData.ts:473`, `app/src/screens/NativeMapScreen.tsx:1365`, `app/src/screens/NativeMapScreen.tsx:1391`, `app/src/screens/NativeMapScreen.tsx:1408`, `app/src/screens/NativeMapScreen.tsx:1413` | FIXED/PASS |
| Notifications panel session guard and mark-read dedupe | `app/src/components/NativeNotificationsPanel.tsx:23`, `app/src/components/NativeNotificationsPanel.tsx:40`, `app/src/components/NativeNotificationsPanel.tsx:54`, `app/src/components/NativeNotificationsPanel.tsx:60`, `app/src/components/NativeNotificationsPanel.tsx:85`, `app/src/navigation/RootNavigator.tsx:930` | FIXED/PASS |
| Profile summary/Home pet shell session caches | `app/src/lib/nativeProfileSummary.ts:61`, `app/src/lib/nativeProfileSummary.ts:62`, `app/src/screens/NativeHomeScreen.tsx:303`, `app/src/screens/NativeHomeScreen.tsx:304`, `app/src/screens/NativeHomeScreen.tsx:557`, `app/src/screens/NativeHomeScreen.tsx:674` | FIXED/PASS |
| Home reminders exact-token refresh | `app/src/screens/NativeHomeScreen.tsx:448`, `app/src/screens/NativeHomeScreen.tsx:470`, `app/src/screens/NativeHomeScreen.tsx:755` | FIXED/PASS |
| Settings Family Account lazy boundary | `app/src/components/NativeSettingsDrawer.tsx:243`, `app/src/components/NativeSettingsDrawer.tsx:246`, `app/src/components/NativeSettingsDrawer.tsx:558`, `app/src/components/NativeSettingsDrawer.tsx:578` | FIXED/PASS |
| Verify Identity profile cache refresh identity | `app/src/lib/nativeVerifyIdentity.ts:660`, `app/src/lib/nativeVerifyIdentity.ts:665`, `app/src/screens/NativeVerifyIdentityScreen.tsx:470`, `app/src/navigation/RootNavigator.tsx:716` | FIXED/PASS |
| Signup draft auth-boundary cleanup | `app/src/navigation/RootNavigator.tsx:305` | FIXED/PASS |
| Public Profile/Pet cache-first then forced DB refresh | `app/src/components/profile/NativePublicProfileModal.tsx:74`, `app/src/components/profile/NativePublicProfileModal.tsx:94`, `app/src/components/profile/NativePublicProfileContent.tsx:119`, `app/src/components/profile/NativePublicProfileContent.tsx:128` | PASS |
| Map camera idle fetch | `app/src/screens/NativeMapScreen.tsx:1251`, `app/src/screens/NativeMapScreen.tsx:1269` | PASS |

Runtime-only tests needed:

| Runtime test | Status |
|---|---|
| Same-user token refresh with warm Social/Service/Chat caches | NEEDS RUNTIME ONLY |
| Social realtime burst ordering and cache writes | NEEDS RUNTIME ONLY |
| Chat Dialogue route switch while delayed snapshot/realtime arrives | NEEDS RUNTIME ONLY |
| Map pan/zoom request count under fast camera movement | NEEDS RUNTIME ONLY |
| Notification rapid open/close/open on device | NEEDS RUNTIME ONLY |
| Home foreground/reconnect P1 sweep count | NEEDS RUNTIME ONLY |
| Public profile/pet slow-network cache-first then DB overwrite | NEEDS RUNTIME ONLY |
| Verify Identity open/foreground refresh count and no boot/home loading | NEEDS RUNTIME ONLY |

## 2. LOAD PHASE MATRIX

| Phase | Expected items | Current code items | File/line | Overfetch violation | Missing refresh | Status |
|---|---|---|---|---:|---:|---|
| BOOT | auth session, onboarding/profile_exists snapshot, sessionGeneration/sessionKey | Auth session activation, onboarding snapshot, generation/key creation | `RootNavigator.tsx:317`, `RootNavigator.tsx:346`, `RootNavigator.tsx:522` | NO | NO | PASS |
| HOME FIRST LOAD | cache-first profile/pets, DB refresh profile/pets/restrictions/unread/chat/viewer/map shell | Cached profile/pets render from user/session keys, then guarded Home freshness sweep | `NativeHomeScreen.tsx:516`, `NativeHomeScreen.tsx:557`, `NativeHomeScreen.tsx:558`, `NativeHomeScreen.tsx:562`, `NativeHomeScreen.tsx:563`, `NativeHomeScreen.tsx:581` | NO | NO | PASS |
| P1 BACKGROUND | Discover first card batch, Social first page, Service cards, Groups/invites, matched rail | Discover, Service, Groups, matched rail run once by session; Social P1 still purges only | `NativeHomeScreen.tsx:583`, `NativeHomeScreen.tsx:584`, `NativeHomeScreen.tsx:585`, `NativeHomeScreen.tsx:586`, `NativeHomeScreen.tsx:596` | NO | YES: Social warm page is purge-only | RISK |
| LAZY | Chat messages, public profile, pet detail, alert detail, comments/replies, provider detail, group/family/account/verify detail | Detail loads are route/tap/open-owned; service/map detail now cache-first plus forced DB refresh | `NativeChatDialogueScreen.tsx:735`, `NativePublicProfileModal.tsx:74`, `NativePetDetailsScreen.tsx:49`, `NativeMapScreen.tsx:1365`, `NativeServiceScreen.tsx:507`, `NativeSocialScreen.tsx:1405` | NO | NO for audited detail caches | PASS/RISK: family summary still drawer-open |

## 3. SURFACE CACHE MATRIX

| Surface | Cache key | Cache first | DB refresh after login | Force refresh used | sessionKey/userId scoped | old-session write blocked | DB success overwrites cache | DB failure keeps cache | fake empty on DB fail | stale draft/cache can override DB | exact-token/RPC | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| RootNavigator/onboarding | in-memory session + `sessionKey` | NO | YES | YES | YES | YES | YES | YES | NO | NO | YES | PASS |
| Home | profile summary + `huddle_home_pets:${userId}` | YES | YES | YES | user cache + session write guard | YES | YES | YES | NO | possible same-user stale first | PARTIAL | RISK |
| Profile summary | `huddle_native_profile_summary:v3:${userId}:${sessionKey}` | YES | YES | YES | user + session | caller guard | YES | YES | NO | NO | YES | PASS |
| Active pets | `huddle_home_pets:v2:${userId}:${sessionKey}` | YES | YES | YES | user + session | caller guard | YES | YES | NO | NO | REST exact token | PASS |
| Edit Profile draft | `huddle_native_${mode}_profile_draft:${userId}` | draft only | page open | YES | user only | N/A | DB seed first | YES | NO | dirty-field guarded | REST/RPC exact token | PASS/RISK |
| Pet Profile draft/cache | route state/upload caches | partial | page open | N/A | user/pet partial | UNVERIFIED | YES | UNVERIFIED | UNVERIFIED | UNVERIFIED | tokenized REST/RPC | UNVERIFIED |
| Public Profile | `native-public-profile:v2:${viewer}:${session}:${userId}` | YES | lazy open | YES | viewer/session/user | effect cleanup | YES | YES | NO | NO | RPC exact token | PASS |
| Pet Detail | `native-public-profile-pet:v2:${viewer}:${session}:${petId}` | YES | lazy open | YES | viewer/session/pet | effect cleanup | YES | YES | NO | NO | RPC exact token | PASS |
| Verify Identity status | `huddle_native_verify_identity_profile_status:v1:${userId}:${sessionKey}` + route-owned live snapshot | YES | after verification action only | YES action-only | user/session | route mounted | YES | YES | NO | LOW | action-owned RPC | PASS/SOURCE |
| Notifications unread/list | unread early; list state on panel open | unread early/list on open | YES | YES | user + session in panel | YES | YES | YES | NO | NO | REST exact token | PASS |
| Chat inbox/unread | `chatInbox:v2:{userId,sessionKey,scope,cursor,filter}`; unread key includes session | YES | YES | YES | YES | caller/load gate | YES | YES | NO | LOW | RPC exact token | PASS |
| Chat dialogue/messages/read receipts | `chatMessages:v2:${userId}:${sessionKey}:${chatId}:...` | YES after access snapshot | route open | YES | YES | YES | YES | YES | NO | no cache before access | RPC exact token | PASS |
| Matched rail | inbox friends scope with sessionKey | YES | YES | YES | YES | Home guard if Home-owned | YES | YES | NO | LOW | RPC exact token | PASS |
| Discover | memory keyed by viewer/filter/tier/location; relationship TTL 90s | YES | Home P1/screen | YES | user/filter/location | caller guard if provided | YES | YES | semantic empty statuses | possible stale first | RPC exact token | RISK |
| Social first page | `native-social-feed:v4:${userId}:${sessionKey}:${country}:${sort}` | YES | screen open; Home P1 purge only | YES screen-local | YES | YES | YES | YES | NO | LOW | RPC exact token | PASS/RISK: P1 warm missing |
| Social comments/replies | `native-social-comments:v4:${userId}:${sessionKey}:${threadId}:...` | YES on expansion | lazy open | YES | YES | YES | YES | YES | NO | runtime ordering risk | RPC exact token | PASS/RISK |
| Groups/invites | native chat explore memory | YES | Home P1/chats | YES | user/filter/location | caller guard if provided | YES | YES | NO | possible stale first | RPC exact token | RISK |
| Service cards | `native-service:cards:v1:{userId,sessionKey,anchor,country}` | YES | Home P1/screen | YES | YES | YES | YES | YES | NO | LOW | RPC exact token | PASS |
| Service detail | `serviceProviderDetail:v2:${userId}:${sessionKey}:${providerId}:${updatedAt}` | YES on tap | lazy tap | YES | YES | YES | YES | YES | NO | NO | RPC exact token | PASS |
| Map shell pins | `huddle:native-map-session:v5:${sessionKey}` + lib shell key `${sessionKey}|anchor|radius` | YES | Home/Map | YES | YES | YES | YES | YES | NO | LOW | RPC exact token | PASS |
| Map alert detail | `huddle:native-map-pin-detail:v6:${userId}:${sessionKey}:${alertId}:${updatedAt}` + lib session key | YES on tap | lazy tap | YES | YES | YES | YES | YES | NO | NO | RPC exact token | PASS |
| Family state | no persistent cache found | NO | sheet open only | YES | token/user | cancelled guard | YES | YES | NO | NO | RPC exact token | PASS |

## 4. FRESH LOGIN / NEW SESSION VALIDATION

| Scenario | DB refresh once per sessionKey | repeated refresh deduped | old-session response can write cache/UI | prior-user cache can render | accessToken re-keys cache | sessionGeneration controls freshness | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| fresh login | YES | YES | mostly NO | mostly NO | NO | YES | PASS/RISK |
| cold boot restored session | YES | YES | mostly NO | mostly NO | NO | YES | PASS/RISK |
| token refresh same user | YES for session-wired surfaces | YES | mostly NO | N/A | NO | YES where wired | PASS/RISK |
| sessionGeneration change | YES for Root/Home/Social/Chats/Map/Service/Notifications/Public Profile | YES | blocked on patched surfaces | NO source-proven user cache cross-render | NO | YES | PASS/RUNTIME |
| logout/login another user | YES | YES | mostly blocked by user keys | signup draft/global caches remain risk | NO | YES | RISK |

Hard checks:

| Check | Result | Proof | Status |
|---|---|---|---|
| accessToken used as long-term cache identity | Not found in audited native cache/session keys | `NativeSocialScreen.tsx:140`, `nativeChat.ts:934`, `nativeService.ts:180`, `nativeMapData.ts:446`, `nativePublicProfile.ts:482` | PASS |
| user-specific cache key missing userId | signup draft remains global | `nativeSignup.ts:113` | RISK |
| session-scoped cache missing sessionKey | fixed for Social/Chat/Service/Map detail/Notifications/Profile summary/Home pets | `nativeProfileSummary.ts:62`, `NativeHomeScreen.tsx:304` | PASS |
| old-session response can write UI/cache | patched surfaces guard; older unpatched surfaces need runtime/route proof | `NativeSocialScreen.tsx:745`, `NativeChatsScreen.tsx:2277`, `NativeServiceScreen.tsx:294`, `NativeMapScreen.tsx:1414`, `NativeNotificationsPanel.tsx:86` | PASS/RISK |
| failed DB writes fake empty/null | No DB-error fake empty cache write proven | see Fake Empty matrix | PASS/RISK |
| lazy detail fetch runs during BOOT/HOME/P1 | no for audited heavy/details | see Lazy Boundary matrix | PASS |

## 5. SESSION FRESHNESS REGISTRY MATRIX

| Item | File/line | Behavior | Status |
|---|---|---|---|
| `sessionGeneration` | `RootNavigator.tsx:284`, `RootNavigator.tsx:300` | increments when active user identity changes | PASS |
| `sessionKey` creation | `nativeFreshnessRegistry.ts:62`, `RootNavigator.tsx:522` | `userId:generation`; no accessToken | PASS |
| `freshnessRegistry.runOnce` | `nativeFreshnessRegistry.ts:83` | per `sessionKey:surface`, dedupes refreshed and in-flight work | PASS |
| `cacheWriteGuard` | `nativeFreshnessRegistry.ts:120` | blocks stale writes when current session key differs | PASS |
| Home usage | `NativeHomeScreen.tsx:516`, `NativeHomeScreen.tsx:525`, `NativeHomeScreen.tsx:527` | Home/P1 surfaces use registry and guard | PASS |
| Social usage | `NativeSocialScreen.tsx:725`, `NativeSocialScreen.tsx:745` | cache read/write and DB write compare captured session | PASS |
| Chats usage | `nativeChat.ts:934`, `NativeChatsScreen.tsx:2277`, `NativeChatDialogueScreen.tsx:641` | inbox/message identity includes session; route writes guarded | PASS |
| Service usage | `nativeService.ts:180`, `NativeServiceScreen.tsx:294`, `NativeServiceScreen.tsx:528` | cards/detail identity includes session; stale writes blocked | PASS |
| Map usage | `NativeMapScreen.tsx:575`, `NativeMapScreen.tsx:1414` | shell/detail writes compare current session | PASS |
| Notifications usage | `NativeNotificationsPanel.tsx:54`, `NativeNotificationsPanel.tsx:86` | mark-read/list writes scoped by session | PASS |

## 6. DB > CACHE MATRIX

| Surface | DB success overwrite | Cache write | Failure path | Fake-empty prevention | Status |
|---|---|---|---|---|---|
| Profile summary | `nativeProfileSummary.ts:181` | `nativeProfileSummary.ts:93`, `nativeProfileSummary.ts:189` | error throws | missing profile throws | PASS |
| Home pets | `NativeHomeScreen.tsx:558`, `NativeHomeScreen.tsx:573` | `NativeHomeScreen.tsx:389`, `NativeHomeScreen.tsx:576` | old state retained | DB error throws | PASS |
| Home reminders | `NativeHomeScreen.tsx:470` | memory success only | error throws, old state retained by caller | error throws before success empty write | PASS |
| Chat inbox | `nativeChat.ts:963` | `nativeChat.ts:964`, `nativeChat.ts:966` | error throws | no fake empty on error | PASS |
| Chat messages | `NativeChatDialogueScreen.tsx:641`, `NativeChatDialogueScreen.tsx:735` | `nativeChat.ts:363`, `nativeChat.ts:386` | load error does not write cache | access snapshot gate | PASS |
| Social feed | `NativeSocialScreen.tsx:770` | `NativeSocialScreen.tsx:777`, `NativeSocialScreen.tsx:794` | `NativeSocialScreen.tsx:797` | no fake cache write | PASS |
| Social comments | `NativeSocialScreen.tsx:1427`, `NativeSocialScreen.tsx:1498` | `NativeSocialScreen.tsx:1434`, `NativeSocialScreen.tsx:1507` | comment error state only | no fake empty on error | PASS/RISK runtime ordering |
| Public profile | `NativePublicProfileModal.tsx:94` | `nativePublicProfile.ts:509` | keeps cached profile | not-found null is DB success | PASS |
| Public pet | `NativePublicProfileContent.tsx:128`, `NativePetDetailsScreen.tsx:63` | `nativePublicProfile.ts:624`, `nativePublicProfile.ts:670` | keeps cached pet | null removal is DB success not-found | PASS |
| Service cards | `nativeService.ts:437`, `nativeService.ts:467` | `nativeService.ts:160`, `nativeService.ts:467` | screen keeps previous/error | DB success empty only | PASS |
| Service detail | `nativeService.ts:502`, `nativeService.ts:516` | `nativeService.ts:516`, `nativeService.ts:518` | `NativeServiceScreen.tsx:539` keeps cached provider with error | no fake empty write | PASS |
| Map shell | `nativeMapData.ts:359`, `NativeMapScreen.tsx:618` | `nativeMapData.ts:433`, `NativeMapScreen.tsx:628` | old state retained | no fake empty write | PASS |
| Map alert detail | `nativeMapData.ts:473`, `NativeMapScreen.tsx:1408` | `nativeMapData.ts:494`, `NativeMapScreen.tsx:1426` | cached detail retained with status | no fake empty write | PASS |
| Notifications | `NativeNotificationsPanel.tsx:85`, `NativeNotificationsPanel.tsx:87` | no persistent cache | status only, rows retained | no fake mark-read success | PASS |
| Family | `NativeSettingsDrawer.tsx:564`, `NativeSettingsDrawer.tsx:570` | no persistent cache | error flag/message | no fake null on failure | PASS |

## 7. DRAFT CACHE MATRIX

| Draft | draft key | user/session scoped | dirtyFields/equivalent | base/source equivalent | stale draft blocked | blank override blocked | DB seed before draft | autosave before DB load blocked | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| Edit Profile draft | `huddle_native_${mode}_profile_draft:${userId}` | user only | YES | YES | YES | YES | YES | YES | PASS/RISK |
| Onboarding profile draft | `huddle_native_${mode}_profile_draft:${userId}` | user only | YES | YES | YES | YES | YES | YES | PASS/RISK |
| Pet profile draft/cache | route state/upload caches | partial | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | route DB load | UNVERIFIED | UNVERIFIED |
| Signup draft | anonymous native signup draft, purged on authenticated user boundary | anonymous-only | NO | NO | auth-boundary purge | auth-boundary purge | N/A | pre-auth only | PASS/RUNTIME |
| Verify Identity local state | cached profile status first, route state for active phone/human/card action | user/session cached status | N/A | N/A | cached verified state hydrates first | partial action state only | action-owned refresh only | route-owned | PASS/SOURCE |

Proof: `NativeEditProfileScreen.tsx:146`, `NativeEditProfileScreen.tsx:735`, `NativeEditProfileScreen.tsx:953`, `NativeEditProfileScreen.tsx:967`, `NativeEditProfileScreen.tsx:1384`; signup draft global read at `nativeSignup.ts:113`.

## 8. REALTIME VS CACHE MATRIX

| Surface | Channel | session/user scoped | route scoped | event newer-than-local check | duplicate/reorder risk | cache overwrite risk | Status |
|---|---|---:|---:|---:|---|---|---|
| Home pets | Home route subscription/freshness reload | user yes, session via Home guard | Home mounted | DB reload, no per-row version compare | medium | low/medium | RISK |
| Social threads/support | visible thread ids + scheduled DB refresh | user/session guarded | visible scoped | NO | medium | low | PASS/RISK |
| Social comments | `native-social-comments:${threadIds}` | thread ids + session guard | expanded only | NO | medium | low/medium | PASS/RISK |
| Chat messages | `native-chat-dialogue-messages:${roomId}` | room + captured session | route mounted | duplicate id check | low/medium | low | PASS |
| Care Chat messages | `native-service-chat:${roomId}` | room + captured session | route mounted | duplicate id check for INSERT; non-INSERT clears cache and reloads | low/medium | low | PASS/SOURCE |
| Care banner inbox summary | `native-service-inbox-banner-realtime-${userId}` | user + captured session | service surface mounted | debounced inbox reload on chat_messages, message_reads, group_chat_invites, group_join_requests, chat_room_members, plus foreground refresh | low/medium | low | PASS/SOURCE |
| Chat reads | `native-chat-dialogue-reads:${roomId}` | room + captured session | route mounted | sent-message filter | low | low | PASS |
| Chat members | `native-chat-dialogue-members:${roomId}` | room + captured session | route mounted | cooldown/in-flight snapshot refresh | low/medium | low | PASS |
| Map restrictions/interactions | route/action-owned | user/alert partial | route/modal | NO | medium | medium | RISK |
| Service restrictions | `native-service-restrictions:${effectiveUserId}` | user only; screen load session guarded | route mounted | NO | low | medium on session switch | RISK |

## 9. LAZY BOUNDARY MATRIX

| Heavy/detail data | Loaded in BOOT/HOME/P1? | Boundary | File/line | Status |
|---|---:|---|---|---|
| chat messages | NO | Chat route open after snapshot/access check | `NativeChatDialogueScreen.tsx:735`, `nativeChat.ts:1667` | PASS |
| public profile | NO | Modal open | `NativePublicProfileModal.tsx:74`, `NativePublicProfileModal.tsx:94` | PASS |
| pet detail | NO | Pet route/profile pet tap | `NativePetDetailsScreen.tsx:49`, `NativePublicProfileContent.tsx:119` | PASS |
| alert detail | NO | Map pin tap/focus | `NativeMapScreen.tsx:1365`, `nativeMapData.ts:473` | PASS |
| alert/media carousel | NO | Alert detail modal only | `NativeAlertDetailModal.tsx` | PASS |
| social comments/replies | NO | Expanded thread/comment | `NativeSocialScreen.tsx:1405`, `NativeSocialScreen.tsx:1525` | PASS |
| service provider detail | NO | Provider tap | `NativeServiceScreen.tsx:507`, `nativeService.ts:502` | PASS |
| group management | NO | Chat group sheet/action | `NativeChatsScreen.tsx:2773`, `NativeChatDialogueScreen.tsx` group modal state | PASS |
| family account sheet | NO | Full sheet loads only when Family Account opens | `NativeSettingsDrawer.tsx:558`, `NativeSettingsDrawer.tsx:578` | PASS |
| verify identity detail/status/card/phone/human | NO | Cache-first route open; remote refresh after verification actions/resume only | `nativeVerifyIdentity.ts:538`, `NativeVerifyIdentityScreen.tsx:537`, `NativeVerifyIdentityScreen.tsx:626` | PASS/SOURCE |
| account settings detail panels | NO broad boot/home load found | Settings route/open owned | `RootNavigator.tsx:927` | PASS/RISK |

## 10. NETWORK CHURN MATRIX

| Trigger | debounce/throttle | bucket/dedupe | in-flight guard | TTL | repeated DB call risk | Status |
|---|---:|---:|---:|---:|---:|---|
| Map camera fetch | YES | movement + zoom bucket | request id + shell key | shell TTL | LOW | PASS |
| GPS updates | PARTIAL | coordinate cache by accuracy | partial | short memory + AsyncStorage | MEDIUM runtime | RISK |
| notification refresh | mark-read dedupe yes; list fetch each open | panel generation + sessionKey | mark-read yes, list session guard | no list TTL | MEDIUM runtime | PASS/RISK |
| Home route remount | YES | freshness registry by session/surface | YES | once per sessionKey | LOW | PASS |
| app foreground/reconnect | Home registry; Service 24h foreground gate | partial | partial | YES where implemented | MEDIUM runtime | RISK |
| realtime subscriptions | single-channel manager | channel-name dedupe | dispose cleanup | N/A | LOW duplicate, MEDIUM stale where no session guard | RISK |
| P1 background refresh | registry by sessionKey | YES | YES | once per sessionKey | LOW except Social purge-only | RISK |

## 11. FAKE EMPTY / FAKE SUCCESS MATRIX

Unsafe DB-failure fake empty/null cache writes proven in audited surfaces: **0**.

| Hit | Classification | Safe | Status |
|---|---|---:|---|
| `NativeNotificationsPanel.tsx:78 setRows([])` | missing token/user guard before DB call | YES | PASS |
| `NativeHomeScreen.tsx:610-611 setPets([])/setReminders([])` | no-user route state | YES | PASS |
| `NativeHomeScreen.tsx:630`, `NativeHomeScreen.tsx:727` | no selected/active pet UI empty | YES | PASS |
| `NativeHomeScreen.tsx:458-459 return data ?? []` | DB success empty only; error throws first | YES | PASS |
| `nativeChat.ts:318-359 return []` | cache miss/access-not-checked/corrupt cache | YES | PASS |
| `nativeChat.ts:363-392` | skips empty message cache writes | YES | PASS |
| `nativeChat.ts:1171` | missing invitee semantic empty | YES/RISK | RISK |
| `nativeChat.ts:1314` | missing room management snapshot guard | YES | PASS |
| `nativeChat.ts:1742` | no visible message id guard | YES | PASS |
| `nativePublicProfile.ts` null returns | cache miss/not-found/parser guards | YES | PASS |
| `nativeService.ts:445 return []` | DB success empty cards after no error | YES | PASS |
| `NativeSocialScreen.tsx:709 setThreads([])` | no-user guard | YES | PASS |
| `NativeMapScreen.tsx:588-590` | no-user/no-token map reset before DB | YES | PASS/RISK |
| `NativeChatsScreen.tsx:2267 setRows([])` | no-user guard | YES | PASS |

## 12. CURRENT OPEN ITEMS

### P0 STALE-CACHE BLOCKER

| Item | File/line | Violated contract | Smallest fix needed | Fix type |
|---|---|---|---|---|
| None proven in current source | N/A | N/A | N/A | N/A |

### P1 CACHE RISK

| Item | File/line | Violated contract | Smallest fix needed | Fix type |
|---|---|---|---|---|
| None proven in current source | N/A | N/A | N/A | N/A |

### P2 CLEANUP

| Item | Smallest fix needed | Fix type |
|---|---|---|
| Standard cache envelopes | Shared `{ userId, sessionKey, cachedAt, value }` for all user/session data | cache |
| Success-empty vs failure typing | Prefer explicit success/failure helpers or throw-on-failure everywhere | cache |
| Dev request counters | Convert logs into measurable route/action counters | runtime-only |
| Discover/groups session envelope | Add sessionKey to remaining discovery/group shell caches where route state can differ | cache |

### RUNTIME ONLY

| Item | Status |
|---|---|
| Chat Dialogue same-room session change while callbacks arrive | NEEDS RUNTIME ONLY |
| Same-user token refresh with warm Social/Service/Chat caches | NEEDS RUNTIME ONLY |
| Social realtime comment ordering | NEEDS RUNTIME ONLY |
| Map camera request count during rapid pan/zoom | NEEDS RUNTIME ONLY |
| Notification rapid reopen behavior | NEEDS RUNTIME ONLY |
| Home foreground/reconnect P1 loop count | NEEDS RUNTIME ONLY |
| Public profile/pet slow-network cache-first then DB overwrite | NEEDS RUNTIME ONLY |
| Verify Identity foreground refresh/no boot-home loading | NEEDS RUNTIME ONLY |

## 13. FIXED / STALE CACHE FINDINGS

| Old finding | Current status | Proof | Reason |
|---|---|---|---|
| Chat cache rendered before access check | FIXED | `nativeChat.ts:322`, `NativeChatDialogueScreen.tsx:735` | cache read requires `accessChecked: true` after snapshot membership check |
| Chat Dialogue old snapshot/realtime could write UI/cache | FIXED | `NativeChatDialogueScreen.tsx:638`, `NativeChatDialogueScreen.tsx:641`, `NativeChatDialogueScreen.tsx:735` | load/hydrate paths capture room/session and re-check |
| Care Chat messages lacked Friends Chat cache/realtime parity | FIXED | `NativeServiceChatScreen.tsx:1761`, `NativeServiceChatScreen.tsx:1835`, `NativeServiceChatScreen.tsx:1852`, `RootNavigator.tsx:968` | Care Chat now receives `sessionKey`, hydrates from the validated chat-message mirror after service chat confirmation, DB-overwrites the mirror, and applies duplicate-safe realtime INSERT deltas. |
| Care Chat shared images were static thumbnails | FIXED | `NativeServiceChatScreen.tsx:533`, `NativeServiceChatScreen.tsx:2364` | Care Chat image attachments now render through `NativeSocialMediaCarousel`, matching Friends Chat tap-to-enlarge behavior. |
| Care Chat provider/public profile detail opened without session key | FIXED | `NativeServiceChatScreen.tsx:2142`, `NativeServiceChatScreen.tsx:2594` | Provider detail and public profile modal now receive the active route `sessionKey`. |
| Social used accessToken hash identity | STALE | `NativeSocialScreen.tsx:135`, `NativeSocialScreen.tsx:140` | current helper uses `sessionKey` fallback, not token hash |
| Map used accessToken hash identity | STALE | `NativeMapScreen.tsx:101`, `NativeMapScreen.tsx:453` | current map shell/session identity uses `sessionKey` |
| Social feed/comments persistent keys omitted sessionKey | FIXED | `NativeSocialScreen.tsx:138`, `NativeSocialScreen.tsx:140`, `NativeSocialScreen.tsx:725`, `NativeSocialScreen.tsx:1408` | v4 keys include userId + sessionKey |
| Chat inbox/message persistent keys omitted sessionKey | FIXED | `nativeChat.ts:258`, `nativeChat.ts:322`, `nativeChat.ts:363`, `nativeChat.ts:934` | v2 inbox/message keys include sessionKey |
| Service cards/detail caches omitted sessionKey | FIXED | `nativeService.ts:180`, `nativeService.ts:421`, `nativeService.ts:483` | card/detail cache keys include sessionKey |
| Service detail cache hit prevented DB refresh | FIXED | `nativeService.ts:487`, `nativeService.ts:498`, `NativeServiceScreen.tsx:527` | cached detail can render through callback, but forced DB refresh continues |
| Map alert detail cache hit prevented DB refresh | FIXED | `NativeMapScreen.tsx:1391`, `NativeMapScreen.tsx:1408`, `NativeMapScreen.tsx:1413` | cached detail no longer returns before forced DB refresh |
| Notifications panel lacked sessionKey in mark-read/list dedupe | FIXED | `NativeNotificationsPanel.tsx:23`, `NativeNotificationsPanel.tsx:54`, `NativeNotificationsPanel.tsx:86`, `RootNavigator.tsx:930` | panel receives sessionKey and guards list/mark-read writes |
| Profile summary/Home active-pet shell caches were user-only | FIXED | `nativeProfileSummary.ts:62`, `NativeHomeScreen.tsx:304`, `NativeHomeScreen.tsx:557`, `NativeHomeScreen.tsx:674` | cache keys and reads/writes now include `sessionKey` metadata |
| Home reminders used ambient Supabase query | FIXED | `NativeHomeScreen.tsx:448`, `NativeHomeScreen.tsx:470`, `NativeHomeScreen.tsx:755` | reminders refresh now uses exact-token REST and preserves old reminders on failure |
| Settings drawer loaded family summary on drawer open | FIXED | `NativeSettingsDrawer.tsx:243`, `NativeSettingsDrawer.tsx:246`, `NativeSettingsDrawer.tsx:558`, `NativeSettingsDrawer.tsx:578` | drawer open now loads profile summary only; Family state loads when the Family sheet opens |
| Verify Identity profile cache refresh used ambient session | FIXED | `nativeVerifyIdentity.ts:660`, `NativeVerifyIdentityScreen.tsx:470`, `RootNavigator.tsx:716` | refresh helper receives explicit `userId`, `accessToken`, and `sessionKey` |
| Verify Identity cache could persist incomplete unverified status for verified users | FIXED | `nativeVerifyIdentity.ts:250`, `nativeVerifyIdentity.ts:625`, `NativeVerifyIdentityScreen.tsx:550` | v2 cache derives verified status from canonical `is_verified`/verified timestamp fields and ignores old v1 entries |
| Signup draft could survive auth boundary | FIXED | `RootNavigator.tsx:305` | authenticated user-session activation clears anonymous signup draft |

## Terminal Proof Summary

Required proof commands run:

```text
grep -Rni "sessionGeneration\|sessionKey\|freshnessRegistry\|cacheWriteGuard\|NATIVE_FRESHNESS\|force: true\|AsyncStorage.getItem\|AsyncStorage.setItem\|CACHE_VERSION\|draftKey\|persistLocalDraft\|setItem.*\[\]\|setItem.*null" app/src
grep -Rni "get_native_chat_dialogue_snapshot\|get_broadcast_alert_by_id\|get_native_service_provider_detail\|get_native_public_profile\|get_native_public_profile_pet\|thread_comments\|comments\|replies\|media\|upload" app/src/screens/NativeHomeScreen.tsx app/src/lib app/src/screens
grep -Rni "onRegionChange\|onCameraChanged\|onMapIdle\|debounce\|throttle\|setInterval\|AppState\|reconnect\|channel(" app/src
grep -Rni "catch.*return \[\]\|catch.*return null\|return \[\]\|return null\|setItem.*\[\]\|setItem.*null\|set[A-Za-z0-9_]*(\[\]\|set[A-Za-z0-9_]*(null" app/src/lib app/src/screens app/src/components
npm --prefix app run typecheck
git diff --check
git diff --cached --check
```

Relevant output highlights:

```text
NativeSocialScreen.tsx:138 native-social-comments:v4:${userId}:${sessionKey}:...
NativeSocialScreen.tsx:140 native-social-feed:v4:${userId}:${sessionKey}:...
nativeChat.ts:258 chatMessages:v2:index:${userId}:${sessionKey}:${chatId}
nativeChat.ts:934 sessionKey: nativeChatCacheSessionKey(options.userId, options.sessionKey)
nativeService.ts:180 sessionKey: nativeServiceCacheSessionKey(...)
nativeService.ts:483 serviceProviderDetail:v2:${userId}:${sessionKey}:...
nativeMapData.ts:446 alert detail key includes sessionKey
NativeNotificationsPanel.tsx:54 markReadKey = userId:sessionKey:generation
RootNavigator.tsx:930 sessionKey={sessionKey}
nativeProfileSummary.ts:62 profile summary key includes userId + sessionKey
NativeHomeScreen.tsx:304 Home pet cache key includes userId + sessionKey
NativeHomeScreen.tsx:470 Home reminders use exact-token REST
NativeSettingsDrawer.tsx:578 Family state loads on Family sheet open
nativeVerifyIdentity.ts:660-665 Verify Identity profile cache refresh receives explicit userId/accessToken/sessionKey
RootNavigator.tsx:305 authenticated user-session activation clears anonymous signup draft
```

Test proof:

```text
npm --prefix app run typecheck: PASS
git diff --check: PASS
git diff --cached --check: PASS
```
