# Strict Backend + Interaction Contract Matrix

Audit date: 2026-05-13

Scope: static audit only. No app code, backend code, UI code, migrations, storage data, DB data, staged files, commits, or pushes were changed.

PASS rule used: a flow is PASS only when the static chain proves user action -> handler -> state transition -> backend call -> auth/RLS boundary -> cache/realtime update -> visible result. If any link is missing, ambient, direct-private without proof, writes fake empty/null cache, or runtime-only touch layering remains unknown, the flow is FAIL, RISK, or UNVERIFIED.

Re-audit update: 2026-05-13, later pass against the current local backend/native workspace.

Current strict result: **IMPROVED BUT STILL FAIL**

Several previous P0 findings are now fixed in the current workspace. The app still fails the strict contract because a few user-action chains remain ambient/direct or omit the RootNavigator token.

## Current Re-audit Result

| Flow | Previous result | Current result | Current proof | Remaining work |
| --- | ---: | ---: | --- | --- |
| Chat dialogue token ownership | FAIL | PASS | `RootNavigator.tsx:731-733` passes `session.access_token`; `NativeChatDialogueScreen.tsx:454,538,645,703,754,860,931,1206` forwards it to read/send/read/delete helpers. | Device/runtime proof for open/send/load older/delete media. |
| Chat helper ambient fallback | FAIL | PASS | `nativeChat.ts:502-508` returns `missing_access_token` when no token is supplied. | Keep protected chat helper calls token-required. |
| Chat send/read/media cleanup RPC boundary | FAIL | PASS/RISK | `nativeChat.ts:1695,1727,1737,1849` calls `send_native_chat_message`, `mark_room_read`, and `request_storage_cleanup` through `nativeChatRpc`; `20260513190000_native_chat_lazy_action_rpc_boundaries.sql` revokes public/anon and grants authenticated/service role. | Attachment upload and realtime ordering need runtime proof. |
| Group management/invites | FAIL | PASS/RISK | `nativeChat.ts:1299,1326-1370` uses management snapshot and invite/member RPCs; group avatar policies now check membership via `20260513193000_native_group_avatar_storage_policy.sql` and broad policies are dropped by `20260513194000_drop_broad_group_avatar_storage_policies.sql`. | Remote migration sync/policy proof still required. |
| Discover pass/seen | FAIL | PASS/RISK | `20260513192000_native_chat_match_seen_rpc_boundary.sql` adds `mark_native_discover_match_seen` and `get_native_seen_match_ids`; grants exclude public/anon. | Confirm all current callers use this path at runtime. |
| Profile prefs/push | FAIL | PASS/RISK | `NativeProfileSummaryScreen.tsx:83-179,262-282,330-406` uses exact-token REST for `notification_preferences`, `push_tokens`, and `profiles.fcm_token`. | Direct owner-table REST remains RLS-dependent; RPC is still preferable. |
| Pet save/upload | FAIL | PASS/RISK | `NativeSetPetScreen.tsx:151-267,1031,1159-1201` requires token/user match, uses exact-token REST for `pets`/`profiles`, exact-token storage upload URL, and RPC media registration. | Runtime save/photo upload proof still needed. |
| Map alert detail cache | FAIL | PASS | `nativeMapData.ts:459-501` throws on RPC errors and writes alert cache only when a real alert is returned. | Runtime marker tap/detail proof still needed. |
| Service action boundaries | RISK | PASS/RISK | `20260513143000_native_service_action_rpc_boundaries.sql` adds exact-token RPCs for bookmark, provider view, service chat, and analytics. | Confirm all service UI action callers use them. |
| Map alert share | FAIL | FAIL | `NativeAlertDetailModal.tsx:252,540,558` still calls `fetchNativeSocialShareTargets`, `recordNativeSocialShare`, and `sendNativeMapAlertShareToChat` without `accessToken`. | Pass token through all map alert share calls. |
| Public profile wave | FAIL | FAIL | `nativePublicProfile.ts:397-462` still uses ambient `supabase.rpc` and direct `waves` select/insert fallback. | Require accessToken and exact-token RPC only. |
| Settings drawer invite notification | FAIL | FAIL | `NativeSettingsDrawer.tsx:819` still inserts into `notifications` directly. | Move family invite/notification to exact-token RPC/function. |
| Broadcast/social media cleanup | RISK | RISK | `nativeBroadcast.ts:174` still performs direct storage upload; media cleanup/register exact-token proof remains uneven across callers. | Convert or prove each storage cleanup/register action. |

## Executive Status

Overall: FAIL

The app has many complete UI handlers, and the current workspace has fixed several of the earlier backend P0s. It still fails the backend/runtime contract because some protected flows still omit `accessToken`, use ambient Supabase/direct private writes, or depend on direct storage/cleanup paths with incomplete proof.

What is definitely broken:

| Priority | Issue | Static proof | Contract failure | Smallest fix |
| --- | --- | --- | --- | --- |
| P0 | Map alert share omits accessToken | `app/src/components/map/NativeAlertDetailModal.tsx:252`, `:540`, `:558` | User action chain loses RootNavigator token before share target/count/chat share backend calls | Pass `accessToken` to share target fetch, share count, and chat share helpers |
| P0 | Public profile wave still has ambient/direct fallback | `app/src/lib/nativePublicProfile.ts:397-462` | Protected peer action can use ambient `supabase.rpc` and direct `waves` select/insert | Exact-token `send_discovery_wave` only; remove direct fallback |
| P0 | Settings family invite writes direct notifications | `app/src/components/NativeSettingsDrawer.tsx:819` | Direct protected table write from UI action | Exact-token family invite/notification RPC |
| P1 | Social feed is mostly exact-token, but shares/support/report flows still have ambient omissions in some callers | `app/src/components/map/NativeAlertDetailModal.tsx:252`, `:540`, `:558`; `app/src/lib/nativeSocial.ts:193`, `:1109`, `:1179`, `:1187` | Exact-token helper accepts token, but map alert modal does not pass it to share target/share-count/send-chat calls | Pass accessToken to all social/map share calls |
| P1 | Storage cleanup/media registration uses ambient RPC after storage uploads | `app/src/lib/nativeStorageCleanup.ts:27`, `app/src/lib/nativeMediaAssets.ts:14`, `app/src/lib/nativeBroadcast.ts:174`, `:178`, `:225` | Cleanup/register writes are protected backend actions but not exact-token | Convert cleanup/media registration to exact-token RPCs |
| P1 | Notifications read/mark-read use exact REST but direct table boundary | `app/src/lib/nativeNotifications.ts:315`, `:342`, `:365` | Direct protected table read/write is allowed only if RLS proof is accepted; current contract prefers exact-token helper/RPC boundary | Use notification RPC or document/prove owner-only RLS |
| P2 | Several flows need runtime touch-layer proof | Map marker taps, modal buttons, chat gestures, social feed action buttons | Static audit proves handlers, not pointerEvents/gesture reachability | Runtime test with tap paths named below |

What is already clean enough:

| Surface | Clean proof |
| --- | --- |
| RootNavigator session identity | Uses active session identity/generation, `getUser(nextSession.access_token)`, passes `session.access_token` to main route surfaces |
| Map shell load | Debounced viewport bucket and exact-token RPC for visible pin shells from prior audit; camera is not notification source |
| Map self-pin/unpin | Exact-token RPCs via `pinNativeUserLocation` and `clearNativeUserLocationPin` |
| Edit Profile save | Exact-token REST save, DB success clears draft and writes profile summary cache |
| Chat core token path | Current workspace passes accessToken into dialogue/inbox helpers and rejects missing token in `nativeChatRpc` |
| Pet profile save path | Current workspace uses token-required REST/storage URL path with JWT subject guard |
| Profile prefs/push path | Current workspace uses token-required REST for prefs/push/profile patch |
| Map alert detail cache | Current workspace no longer writes cached null on RPC failure |
| Social feed core load/create/comment/support | Static chain mostly present and exact-token where caller passes accessToken |

## P0 Blockers

| Flow | Issue | File/line | Evidence | Fix needed |
| --- | --- | --- | --- | --- |
| Chat dialogue open | Direct-room open can create/fetch room through ambient helper without screen accessToken | `app/src/screens/NativeChatDialogueScreen.tsx:763`, `app/src/lib/nativeChat.ts:1588` | handler resolves room with `ensureNativeDirectChatRoom`, helper has no token param and uses ambient session/RPC path | Add accessToken prop/param and exact-token direct-room RPC |
| Chat dialogue snapshot/read state | Ambient RPCs load protected chat snapshots/member state | `app/src/screens/NativeChatDialogueScreen.tsx:303`, `:576`, `:655`, `:679`, `:691` | `supabase.rpc` used directly in protected dialogue flow | Replace with exact-token RPC wrapper |
| Chat send/delete/read | Send/read/delete attachment chain lacks exact-token guarantee | `app/src/screens/NativeChatDialogueScreen.tsx:935`, `:940`, `:1227`; `app/src/lib/nativeChat.ts:1741`, `:1771`, `:1781`, `:1848`, `:1882` | UI handler exists, but helper defaults to ambient `nativeChatRpc` when token absent; attachment upload direct storage | Require accessToken and exact-token storage registration/cleanup |
| Chat block/unmatch/report | Ambient RPCs for block/unmatch | `app/src/screens/NativeChatDialogueScreen.tsx:960`, `:976`, `:990` | Direct `supabase.rpc` in protected action | Exact-token social/security RPC wrapper |
| Group management | Direct private table reads/writes | `app/src/lib/nativeChat.ts:1292`, `:1293`, `:1294`; `app/src/screens/NativeChatDialogueScreen.tsx:1151` | Reads join requests/invites/messages; writes `group_chat_invites` | Group management snapshot/invite RPC |
| Profile prefs/push | Ambient direct table writes | `app/src/screens/NativeProfileSummaryScreen.tsx:175`, `:186`, `:226`, `:249`, `:286` | Push token/profile prefs table access is direct | Exact-token profile settings RPC |
| Pet save | Ambient pet table/storage | `app/src/screens/NativeSetPetScreen.tsx` grep proof | Pet profile flow uses direct table/storage | Exact-token pet profile RPC and owner-path upload |
| Map alert detail | DB error can become cached null | `app/src/lib/nativeMapData.ts:445` | Alert detail fetch is central lazy detail path; previous grep showed null caching on failure | Preserve old cache on failure |

## P1 Risks

| Flow | Risk | File/line | Fix needed |
| --- | --- | --- | --- |
| Map alert share to chat | Missing accessToken in modal calls despite helper accepting token | `app/src/components/map/NativeAlertDetailModal.tsx:252`, `:558`, `:540` | Pass accessToken to `fetchNativeSocialShareTargets`, `sendNativeMapAlertShareToChat`, `recordNativeSocialShare` |
| Map alert media upload | Direct storage upload then ambient media-register/cleanup RPC | `app/src/lib/nativeBroadcast.ts:174`, `:178`, `:225`; `app/src/lib/nativeMediaAssets.ts:14`; `app/src/lib/nativeStorageCleanup.ts:27` | Exact-token cleanup/register and verified upload path |
| Chat discover pass/wave/star | UI state chain exists, but some mutations are ambient/direct | `app/src/screens/NativeChatsScreen.tsx:2133`, `:2197`, `:3008`, `:3141`, `:3146`, `:3209`, `:3666` | Make all discovery actions exact-token |
| Notifications | Exact-token REST but direct table dependency | `app/src/lib/nativeNotifications.ts:315`, `:342`, `:365` | Prefer notification RPC |
| Settings family invites | Direct `notifications` insert | `app/src/components/NativeSettingsDrawer.tsx:819` | Exact-token family invite RPC |
| Public Profile wave | Direct `waves` fallback | `app/src/lib/nativePublicProfile.ts:438`, `:449` | Remove direct fallback; use exact-token RPC only |

## P2 Cleanup / Proof Gaps

| Gap | File/line | Runtime test needed |
| --- | --- | --- |
| Map marker touch layering | `app/src/screens/NativeMapScreen.tsx:1342` | Tap alert marker on simulator and verify detail modal appears |
| Broadcast composer location pin overlay | `app/src/screens/NativeMapScreen.tsx:1525`, `:1549`, `:1560`; `app/src/components/map/NativeBroadcastModal.tsx:646` | Create alert with and without pinning center |
| Discovery swipe/button gestures | `app/src/screens/NativeChatsScreen.tsx:3560` | Tap pass/wave/star and swipe gestures on native device |
| Chat scroll load older threshold | `app/src/screens/NativeChatDialogueScreen.tsx:1493` | Scroll to top and verify older messages append once |
| Social feed action buttons | `app/src/components/social/NativeSocialFeedPrimitives.tsx:887`, `:895`, `:903`, `:911`, `:961` | Tap support/comment/share/more/save on device |

## Required Map Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result condition | Failure path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tap alert marker -> detail modal opens | `app/src/screens/NativeMapScreen.tsx:1342` | `setSelectedAlert`, `setStatusMessage`; focus state from `setAlertFocus` at `:895` | `fetchNativeMapAlertById` at `:1392`; helper at `app/src/lib/nativeMapData.ts:445` | exact-token when `accessToken` present | detail cache exists, but failure-null risk from prior proof | `selectedAlert` renders `NativeAlertDetailModal` at `:1794` | Status message on missing token/failure at `:1406`, `:1413`; DB failure can cache null | FAIL |
| Self pin current location | `app/src/screens/NativeMapScreen.tsx:979`, `:1108`, `:1121` | GPS modal state and own pin refresh state | `pinNativeUserLocation` at `:1121`; helper `app/src/lib/nativeMapMutations.ts:152` | exact-token RPC via `nativeExactTokenRpc` | map refresh triggered by local state/load path | own profile/pin visible in shell | GPS denied opens modal; backend error status | PASS |
| Unpin | `app/src/screens/NativeMapScreen.tsx:1158` | own pin state and status | `clearNativeUserLocationPin`; helper `app/src/lib/nativeMapMutations.ts:167` | exact-token RPC | map refresh expected through local state | own pin removed | backend error status | PASS |
| Create alert | `app/src/components/map/NativeBroadcastModal.tsx:340`, submit at `:646` | composer state, media state, selected location | media upload `app/src/components/map/NativeBroadcastModal.tsx:266`; RPC create `app/src/lib/nativeBroadcast.ts:151` | alert create RPC exact-token-ish; storage direct; media register ambient | local `onCreated` closes modal and inserts preview at `app/src/screens/NativeMapScreen.tsx:1744` | alert appears in map/social preview if returned | upload/create errors surface in modal | RISK |
| Edit alert | `app/src/components/map/NativeAlertDetailModal.tsx:922`, handler backend at `:518` | edit fields/images/sensitive | `updateNativeBroadcastAlert`; helper `app/src/lib/nativeMapAlertInteractions.ts:250` | exact-token RPC via `mapActionRpc` | local modal calls `onUpdated` from parent | updated alert visible in modal/map | message on failure | RISK |
| Delete alert | `app/src/components/map/NativeAlertDetailModal.tsx:428` | confirm/remove state | `deleteNativeBroadcastAlert`; helper `app/src/lib/nativeMapAlertInteractions.ts:229` | exact-token RPC via `mapActionRpc`; cleanup ambient | support cache cleared; storage cleanup requested | alert removed/closed | message on failure | RISK |
| Alert support | `app/src/components/map/NativeAlertDetailModal.tsx:316`, button at `:695` | `liked`, `supportCount`, `message` | `supportNativeAlert`/`removeNativeAlertSupport`; helper `app/src/lib/nativeMapAlertInteractions.ts:188`, `:205` | exact-token RPC | memory + AsyncStorage support cache at `:194`, `:200`, `:211`, `:217` | count/active state updates | rolls message on failure; optimistic cache after RPC only | PASS |
| Alert share | `app/src/components/map/NativeAlertDetailModal.tsx:699`, `:813`, `:817` | `shareOpen`, target state, sending state | `fetchNativeSocialShareTargets` at `:252`, `sendNativeMapAlertShareToChat` at `:558`, native share count at `:540` | RISK: accessToken not passed from modal | share count may update; chat share RPC exact only if token passed | share sheet or chat success message | failure message at `:564` | FAIL |

## Required Chat Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result condition | Failure path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open Discover | `app/src/screens/NativeChatsScreen.tsx:2261` load gate; cards rendered at `:3560` | discover rows/loading/end state | `get_discovery_cards` at `app/src/lib/nativeChat.ts:1490` | exact-token only if accessToken passed; helper fallback ambient at `:526` | discovery seen cache/session state | `DiscoveryProfileCard` visible | empty/end state on no rows | RISK |
| Pass | `app/src/screens/NativeChatsScreen.tsx:3141` | `commitDiscoveryAction` at `:2133` updates passed/seen state | likely local + `discover_match_seen` upsert at `:3008` | direct table ambient | AsyncStorage/session seen cache | card removed/next card visible | rollback exists but direct DB risk | FAIL |
| Wave | `app/src/screens/NativeChatsScreen.tsx:3146` | busy id, commit/rollback | ambient RPC at `:2197`; direct room at `:3190` | ambient/direct helper | discovery seen cache | cue/match/direct chat result | rollback on failure | FAIL |
| Star | `app/src/screens/NativeChatsScreen.tsx:3209`, confirm at `:3285` | confirm target/loading/seen | quota/RPC path plus navigation | mixed exact-token and ambient | discovery seen cache | premium/confirm/star state | quota banner/failure | RISK |
| Open direct chat | `app/src/screens/NativeChatsScreen.tsx:3038`, `:2568`; dialogue route open | route/chat row state | `ensureNativeDirectChatRoom` at `app/src/lib/nativeChat.ts:1588` | ambient helper, direct session | inbox/read state may update | chat dialogue opens | notice/fallback | FAIL |
| Open group/service chat | `app/src/screens/NativeChatsScreen.tsx:2568`, `app/src/screens/NativeChatDialogueScreen.tsx:763` | route/dialogue room state | dialogue snapshot at `app/src/lib/nativeChat.ts:1643` | exact-token helper now rejects missing token | realtime channel in dialogue | messages/member info visible | notice/loading error | PASS/RISK |
| Send message | `app/src/screens/NativeChatDialogueScreen.tsx:940` | input clears, sending state/messages merge | `sendNativeChatMessage`; helper `app/src/lib/nativeChat.ts:1741` | ambient fallback | realtime message channel at `app/src/screens/NativeChatDialogueScreen.tsx:797` | message appears | notice on failure | FAIL |
| Load older messages | `app/src/screens/NativeChatDialogueScreen.tsx:864`, scroll at `:1493` | `loadingOlder`, `hasOlder`, messages merged | `fetchNativeChatDialogueSnapshot` at `:869`; helper `app/src/lib/nativeChat.ts:1698` | ambient fallback | message list state only | older rows prepend | notice at `:876` | FAIL |
| Attach media | `app/src/screens/NativeChatDialogueScreen.tsx:935` | attachment upload/composer payload | `uploadNativeChatAttachment`; helper `app/src/lib/nativeChat.ts:1848` | direct storage ambient | message sends attachment payload | uploaded attachment in message | notice on upload/send failure | RISK |
| Delete media | `app/src/screens/NativeChatDialogueScreen.tsx:1227`, button `:1415` | message attachment removed/refetched | `deleteOwnNativeChatAttachment`; helper `app/src/lib/nativeChat.ts:1882` | storage cleanup ambient RPC | cleanup queue | attachment removed | notice on failure | FAIL |
| Mark read | `app/src/screens/NativeChatDialogueScreen.tsx:453`, `:707`; chats `app/src/screens/NativeChatsScreen.tsx:2553` | read markers/unread row | `markNativeChatMessagesRead`, `markNativeChatRoomRead`; helper `app/src/lib/nativeChat.ts:1771`, `:1781` | ambient fallback | realtime reads channel | unread clears | warn only in some paths | FAIL |
| Block/unmatch/report | `app/src/screens/NativeChatDialogueScreen.tsx:960`, `:990`, report modal `:1786` | block/report modal state | direct `supabase.rpc` block/unmatch; report modal social RPC | ambient | local hidden/blocked state | modal closes/user blocked | notice on failure | FAIL |

## Required Social Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result condition | Failure path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Load feed | `app/src/screens/NativeSocialScreen.tsx:752` | `setThreads`, loading gate | `fetchNativeSocialFeedPage`; helper `app/src/lib/nativeSocial.ts:425` | exact-token if accessToken supplied; helper at `:193` requires token for authed request | feed cache used at `app/src/screens/NativeSocialScreen.tsx:732`; realtime at `:1039` | thread cards render | cached feed/notice | PASS |
| Open comments | button `app/src/components/social/NativeSocialFeedPrimitives.tsx:895`; screen `app/src/screens/NativeSocialScreen.tsx:1439` | `replyFor`, `commentsByThread`, loading sets | `fetchNativeSocialComments`; helper `app/src/lib/nativeSocial.ts:583` | exact-token when token passed | comments cache key at `app/src/screens/NativeSocialScreen.tsx:132`; realtime thread refresh | comments panel visible | comment load error state | PASS |
| Create/edit/delete post | compose `app/src/screens/NativeSocialScreen.tsx:1952`; submit `:1116`; delete `:1273` | composer/edit/delete state, `setThreads` | `createNativeSocialThread` at lib `:814`; `updateNativeSocialThread` at `:835`; `deleteNativeSocialThread` at `:870` | exact-token when token passed | feed refresh/cache purge/media cleanup | new/updated/removed thread visible | quota/notice failure | RISK |
| Create/edit/delete comment | submit `app/src/screens/NativeSocialScreen.tsx:1618`, `:1636`; delete `:1735` | `commentsByThread`, comment counts | `createNativeSocialComment` lib `:885`; update lib `:1028`; delete lib `:1033` | exact-token when token passed | comments cache updates/purge | comment appears/edits/removes | notice/failure, optimistic updates mostly after DB | PASS |
| Media upload/delete | upload in submit `app/src/screens/NativeSocialScreen.tsx:1131`, video `:1133`; cleanup lib `app/src/lib/nativeSocial.ts:710` | media upload state | `uploadNativeSocialImage` lib `:594`; storage cleanup | direct storage + cleanup RPC | cleanup queue/cache | media visible in post/comment | upload error notice | RISK |
| Sensitive flag update | submit payload `app/src/screens/NativeSocialScreen.tsx:1116`, update lib `app/src/lib/nativeSocial.ts:849` | thread `isSensitive` in state | create/update social thread RPC | exact-token | thread state updated | sensitive overlay/value changes | notice on failure | PASS |
| Like/support | button `app/src/components/social/NativeSocialFeedPrimitives.tsx:887`; handler `app/src/screens/NativeSocialScreen.tsx:1224` | optimistic `supportedThreadIds`, likes | `setNativeSocialSupport`; lib `app/src/lib/nativeSocial.ts:1046` | exact-token when token passed | supported cache key at lib `:492`; realtime support channel at screen `:998` | count/active state changes | rollback at `:1253` | PASS |
| Save | button `app/src/components/social/NativeSocialFeedPrimitives.tsx:961`; handler `app/src/screens/NativeSocialScreen.tsx:1790`, storage write `:687` | `storedSets.saved` | local only | no backend | AsyncStorage via `writeNativeSocialStoredState` lib `:1341` | bookmark state changes | no backend failure | PASS |
| Share/report/block | share modal `app/src/screens/NativeSocialScreen.tsx:1959`; report `:1960`; block `:1320`, `:1335` | share/report/block state | `recordNativeSocialShare` lib `:1109`; `reportNativeSocialUser` lib `:1062`; `blockNativeSocialUser` lib `:1058` | exact-token when token passed | thread count/local hidden state | share count/report removal/block filtering | notice on failure | PASS |

## Required Profile / Settings Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result condition | Failure path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Boot/onboarding | `app/src/navigation/RootNavigator.tsx:456`, `:466`, route choose `:609`, render `:730` | session identity, route, onboarding snapshot | `supabase.auth.getSession`, `supabase.auth.getUser(nextSession.access_token)` | RootNavigator session token truth for auth; onboarding RPC from prior audit exact-token | session generation/cache guard | correct route/screen renders | boot error screen/retry | PASS |
| Account Settings | Settings open rows `app/src/components/NativeSettingsDrawer.tsx:407`, account route `:426`; summary screen prefs `app/src/screens/NativeProfileSummaryScreen.tsx:226` | settings overlay/profile summary state | exact-token REST prefs/push/profile patch | exact-token direct owner-table REST | profile summary cache partial | settings visible | REST/RLS failure surfaces through settings handlers | PASS/RISK |
| Verify Identity from Settings | drawer `app/src/components/NativeSettingsDrawer.tsx:399`, `:419`; RootNavigator overlay `app/src/navigation/RootNavigator.tsx:911` | settings overlay/verify return state | verify screen functions from grep include identity/card/phone flows | mixed; exact proof incomplete in this audit | profile status updated by verification flow | verify screen visible | runtime/status errors | RISK |
| Save profile | `app/src/screens/NativeEditProfileScreen.tsx:1239`, save button grep hit later | form/profile/message state | exact-token REST profile save and RPC refresh at `:1310`; cache write `:1317` | exact-token | draft removed `:1315`; profile summary cache write `:1317` | form updates/public profile refresh | message on failure; old draft retained | PASS |
| Upload/delete avatar | photo upload handler `app/src/screens/NativeEditProfileScreen.tsx:977`, storage helper `app/src/lib/nativeProfilePhotos.ts:405` | photo upload/message/form photos | `profile_photos` storage upload | direct storage with token available only through Supabase client session | profile cache after save | avatar visible after DB save | message on failure | RISK |
| Save pet | `app/src/screens/NativeSetPetScreen.tsx:1031,1159-1201` | pet form state | exact-token REST `pets`/`profiles`, exact-token storage object upload URL, media registration RPC | exact-token with JWT subject guard | local state/cache unknown | pet profile updates | REST/storage/RLS failure possible | PASS/RISK |
| Notifications read/mark read | panel route `app/src/navigation/RootNavigator.tsx:939`; lib `app/src/lib/nativeNotifications.ts:315`, `:342`, `:365` | panel rows/unread count | REST exact-token direct `notifications` table | exact-token REST + RLS | no cache; alert scope filter | rows visible/read clears | throw on missing token/non-OK | RISK |

## Action Flow Surface Matrix

| Surface | Required action chains proven | Status | Blocking reason |
| --- | --- | --- | --- |
| RootNavigator boot/onboarding | session -> route -> token props mostly proven | PASS | None for static boot |
| Home | not re-audited in this strict flow beyond prior freshness proof | RISK | Needs per-action home cards matrix if Home actions are in release scope |
| Social | feed/comment/support/save/share/report/block mostly complete | RISK | media storage cleanup/register and accessToken omissions in adjacent map share paths |
| Chats Discover | open/pass/wave/star chain exists | RISK | seen/direct-room boundaries improved; runtime gesture/proof still needed |
| Chats Inbox | open/read chain exists | PASS/RISK | helper now rejects missing token; runtime unread/realtime proof still needed |
| Chat Dialogue | open/send/older/attach/delete/read chain improved | PASS/RISK | exact-token helper path present; attachment upload/realtime runtime proof still needed |
| Groups | manage/invite/report chain improved | PASS/RISK | snapshot/RPC boundary present; remote sync/policy proof still needed |
| Map | shell/self-pin/unpin/support/detail mostly complete | FAIL | share accessToken omissions remain |
| Alert Detail | detail/support/edit/delete complete UI; share incomplete | FAIL | share missing token; media cleanup proof remains uneven |
| Service | exact-token service action RPCs added | PASS/RISK | strict UI action caller proof not fully expanded this turn |
| Service Detail | exact-token detail/action RPCs mostly present | RISK | chat/service action flow needs runtime proof |
| Account Settings | settings rows/summary prefs chain improved | PASS/RISK | exact-token REST present; RLS proof/RPC preference remains |
| Verify Identity | route chain proven | RISK | full card/human/phone backend chain not fully line-proven in this audit |
| Edit Profile | save/draft/cache chain proven | PASS | avatar storage remains RISK |
| Pet Profile | save/upload chain improved | PASS/RISK | exact-token REST/storage URL path present; runtime upload/save proof required |
| Public Profile | wave/chat/star paths exist | FAIL | direct `waves` fallback and ambient RPCs |
| Settings Drawer | route/action rows exist | FAIL | family invite direct notifications write |
| Notifications | read/mark-read exact-token REST exists | RISK | direct notifications table boundary |

## Proof Commands Used

Only grep-style code discovery was used for the current strict static audit:

```bash
grep -Rni "handle.*Press\|onPress\|set.*Modal\|set.*Open\|fetchNativeMapAlertById\|pinNativeUserLocation\|clearNativeUserLocationPin\|createNativeBroadcastAlert\|updateNativeBroadcastAlert\|deleteNativeBroadcastAlert\|supportNativeMapAlert\|shareNativeMapAlert" app/src/screens/NativeMapScreen.tsx app/src/components/map app/src/lib/nativeMap*.ts app/src/lib/nativeBroadcast.ts
grep -Rni "handle.*Wave\|handle.*Pass\|handle.*Star\|commitDiscoveryAction\|ensureNativeDirectChatRoom\|sendNativeChatMessage\|loadOlder\|older\|uploadNativeChatAttachment\|delete.*Attachment\|markNativeChat.*Read\|block_user\|unmatch_user\|report\|nativeChatRpc\|supabase\.from\|supabase\.rpc" app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx app/src/lib/nativeChat.ts app/src/lib/nativePublicProfile.ts
grep -Rni "load.*Feed\|fetchNativeSocialFeedPage\|comments\|create.*Thread\|update.*Thread\|delete.*Thread\|create.*Comment\|update.*Comment\|delete.*Comment\|upload.*Media\|sensitive\|support\|like\|save\|share\|report\|block\|nativeSocialRpc\|supabase\.from\|storage\.from" app/src/screens/NativeSocialScreen.tsx app/src/components/social app/src/lib/nativeSocial.ts
grep -Rni "getSession\|getUser\|supabase\.from\|supabase\.rpc\|storage\.from\|upload(\|setItem\|AsyncStorage\|save\|verify\|identity\|notification\|mark.*read\|handle.*Press\|onPress" app/src/navigation/RootNavigator.tsx app/src/screens/NativeProfileSummaryScreen.tsx app/src/screens/NativeEditProfileScreen.tsx app/src/screens/NativeSetPetScreen.tsx app/src/screens/NativeVerifyIdentityScreen.tsx app/src/components/NativeSettingsDrawer.tsx app/src/lib/nativeNotifications.ts app/src/lib/nativeProfilePhotos.ts
grep -Rni "createNativeBroadcastAlert\|handleCreate\|uploadNativeBroadcast\|requestNativeStorageCleanup\|registerNativeMediaAsset\|mapActionRpc\|support\|share\|deleteNativeBroadcastAlert\|updateNativeBroadcastAlert\|nativeExactTokenRpc\|supabase\.from\|supabase\.rpc\|storage\.from" app/src/components/map/NativeBroadcastModal.tsx app/src/components/map/NativeAlertDetailModal.tsx app/src/lib/nativeBroadcast.ts app/src/lib/nativeMapAlertInteractions.ts app/src/lib/nativeMapMutations.ts app/src/lib/nativeStorageCleanup.ts app/src/lib/nativeMediaAssets.ts
grep -Rni "createNativeSocialComment\|updateNativeSocialComment\|deleteNativeSocialComment\|loadCommentsForThread\|setCommentsByThread\|setThreads\|setStoredSets\|writeNativeSocialStoredState\|setShareThread\|setReportThread\|setComposerOpen\|setEditingThread\|NativeSocialFeedCard\|onToggleSaved\|onOpenComments\|onOpenShare\|onOpenSupport\|onOpenMore" app/src/screens/NativeSocialScreen.tsx app/src/components/social/NativeSocialFeedPrimitives.tsx app/src/lib/nativeSocial.ts
```

Remote DB proof was reused from the immediately preceding reliability audit because the user supplied the DB password location and remote verification already completed there. This strict audit did not rerun DB mutations and did not write DB data.

## Runtime Tests Required

| Test | Why static proof is insufficient |
| --- | --- |
| Tap map alert marker and verify detail modal opens | Touch layering/pointerEvents cannot be fully proven statically |
| Tap broadcast pin-center controls and create alert | Overlay gesture priority cannot be fully proven statically |
| Swipe and button pass/wave/star in Discover | Gesture handler reachability cannot be fully proven statically |
| Open chat, scroll to top, send message, attach and delete media | Realtime ordering and attachment display need device proof |
| Tap social save/support/comment/share/more/report/block | Static handlers exist; gesture layering and modal stacking need runtime proof |
| Verify Identity from Settings overlay | Route overlay is static-proven; card/phone/human backend status sequence needs runtime proof |

## Final Status

Release blockers:

| Area | Status |
| --- | --- |
| Map alert share token omission | RELEASE BLOCKER |
| Public Profile wave ambient/direct fallback | RELEASE BLOCKER |
| Settings drawer family invite direct notification insert | RELEASE BLOCKER |
| Broadcast/social media cleanup/register proof gaps | RELEASE RISK |

Safe to defer:

| Area | Reason |
| --- | --- |
| Chat Dialogue / Groups / Direct Chat | Current exact-token/RPC path is improved; remaining gap is runtime/realtime proof, not the previous ambient fallback blocker |
| Profile Summary prefs/push | Current exact-token REST path is improved; remaining gap is RLS/RPC preference proof |
| Pet Profile save/upload | Current exact-token REST/storage URL path is improved; remaining gap is runtime upload/save proof |
| Map alert detail cache-null failure | Current implementation throws on RPC error and does not cache fake null |
| Service card/detail strict action expansion | Prior exact-token proof exists; less central than chat/profile/map blockers |
| Runtime version log gaps | Useful proof gap, not a direct data-loss issue |

Needs runtime test:

| Area | Runtime proof |
| --- | --- |
| Map marker/modal touch layering | Tap marker -> modal -> support/share/edit/delete |
| Chat gestures and scroll | Discover gestures, dialogue older-load, media delete |
| Social modal stack | comments/share/report/block/save/support |
| Verify Identity overlay | Settings -> Verify -> back/complete |

Needs remote DB proof:

| Area | Status |
| --- | --- |
| Schema/functions/storage buckets | VERIFIED in preceding audit |
| Per-flow RLS for direct table accesses | Still effectively FAIL/RISK because current app contract forbids these direct paths even when RLS exists |
