# Native App Action Chain Audit

Audit date: 2026-05-14

Scope: `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/app` plus backend dependencies in `/supabase/migrations`.

Mode: strict static re-audit against current local code. No app code, backend code, UI, migrations, staging, commits, or pushes were changed.

Input audits used only as starting inputs:

- `/Users/hyphen/Documents/Whypen/Huddle App/NATIVE_BACKEND_DEPENDENCY_MATRIX_AUDIT.md`
- `/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle/STRICT_BACKEND_INTERACTION_CONTRACT_AUDIT.md`

PASS rule: a flow is `PASS` only when static code proves UI action -> handler -> required props/session/accessToken -> backend/storage call -> auth/RLS/storage boundary -> success response -> state/cache/realtime update -> visible UI result -> failure/rollback behavior. If a link is missing, unclear, ambient, direct-private without proof, fake-empty, fake-success, grouped instead of line-by-line, or static-unexpanded, status is `FAIL`, `RISK`, or `UNVERIFIED`.

Strict static hard gate added 2026-05-14: this audit is backend static proof only. Runtime tests, static gates, device behavior, gesture behavior, and simulator proof are out of scope for the verdict. A row can be `PASS` only when the current source proves the full action chain and the saved-field mapping to the exact RPC argument or DB column. Every delete must prove DB ref clearing and media ref cleanup. Every failure must preserve the exact failing stage and original error, or it is `RISK`/`FAIL`.

Status legend:

- `PASS`: full chain is statically proven and uses exact-token/RPC/storage boundary.
- `FAIL`: violates contract or has fake-success/fake-empty/ambient protected backend action.
- `RISK`: likely works but needs source-contract proof, remote schema/RLS/storage-policy proof, has best-effort cleanup, loses exact failure stage/original error, or has partial rollback.
- `UNVERIFIED`: action exists but full chain cannot be proven statically.
- Old-finding status: `FIXED`, `STILL OPEN`, `STALE`, `SUPERSEDED`, `OUT OF SCOPE FOR STATIC AUDIT`.

## 0A. LOCATION SCOPE CONTRACT

Product contract updated 2026-05-15. This contract applies to native Discover, Service, Social feed discovery, alert-derived Social feed rows, Map shell/nearby surfaces, and any future nearby notifications. A location request must select exactly one operating source first, then rank results. It must never mix coordinates from one source with text fields from another source.

Source selection is OR-only:

1. Live GPS/current app location.
2. Recent cached GPS.
3. User-selected app location/pin.
4. Profile location fallback.

Hard source rule:

- If live/current/cached/pinned source wins, profile country/district/city must not be used for that request.
- If a source has point but no reverse-geocoded country/city/district, keep those text fields null.
- If profile fallback wins, profile text/geog may be used only as profile-sourced fields. If profile text and profile point conflict, output point-only or text-only, never mixed.
- Valid travel state: profile home `Hong Kong` and current/pinned point `San Francisco` means the operating scope is San Francisco point-only or San Francisco same-source reverse-geocoded fields. It is not an inconsistent account state.

Static source proof:

| Contract item | Status | Code proof |
|---|---|---|
| `NativeViewerScope` carries normalized same-source fields | `PASS` | `app/src/lib/nativeViewerScope.ts:21` |
| Live GPS wins before cached/pinned/profile fallback | `PASS` | `app/src/lib/nativeViewerScope.ts:119` |
| Cached GPS wins before pinned/profile fallback | `PASS` | `app/src/lib/nativeViewerScope.ts:139` |
| Pinned/app location wins before profile fallback | `PASS` | `app/src/lib/nativeViewerScope.ts:159` |
| Current/cached/pinned source drops profile text | `PASS` | `app/src/lib/nativeViewerScope.ts:130`, `app/src/lib/nativeViewerScope.ts:150`, `app/src/lib/nativeViewerScope.ts:170` |
| Reverse-geocode/alias normalization source exists | `PASS` | `app/src/lib/nativeLocation.ts:87`, `app/src/lib/nativeLocation.ts:269` |

## 0B. LOCATION RANKING CONTRACT

Ranking is separate from source selection. After the selected operating source is resolved, result ranking is:

1. Same district/neighborhood.
2. Same city.
3. Nearby radius.
4. Same country fallback only when local rows are insufficient.

`insufficient` means fewer than 50 local rows for Discover and normal Social feed discovery. Service does not use broad same-country fallback; Service remains local-only inside the 50km provider pool.

| Surface | Ranking contract | Status | Code proof |
|---|---|---|---|
| Discover | district -> city -> 150km -> country fallback when local rows `< 50` | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:169`, `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:209`, `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:282` |
| Discover app payload | passes same-source `viewer_city`, `viewer_country`, `viewer_district`, `min_local_results = 50` | `PASS` | `app/src/lib/nativeChat.ts:1507` |
| Service | district -> city -> 50km, no country fallback | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:374`, `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:417` |
| Service app payload | passes full `NativeViewerScope`; client no longer filters point with stale country text | `PASS` | `app/src/lib/nativeService.ts:405`, `app/src/lib/nativeService.ts:430`, `app/src/screens/NativeServiceScreen.tsx:268` |
| Home service warm load | passes same viewer scope to Service cache/RPC path | `PASS` | `app/src/screens/NativeHomeScreen.tsx:608` |
| Social normal feed | district -> city -> 150km -> country fallback when local rows `< 50` | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:538`, `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:558` |
| Social app payload | passes app-resolved viewer scope into feed RPC | `PASS` | `app/src/lib/nativeSocial.ts:456`, `app/src/screens/NativeSocialScreen.tsx:649` |

## 0C. ALERT-DERIVED SOCIAL VISIBILITY MATRIX

Alert-derived Social feed discovery uses the alert incident location, not the author profile location. Direct/deeplink/shared public thread access remains separate and global if the thread is public/valid.

| Case | Feed visibility rule | Status | Code proof |
|---|---|---|---|
| Viewer geog and alert incident geog both exist | Show only if within 150km. No country requirement. | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:520` |
| Alert geog missing or viewer geog missing, city exists on both sides | Same-city alert can show. | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:521` |
| Geog/city cannot resolve local relevance | Country is fallback only and gated by local row count `< 50`. | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:522`, `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:558` |
| Alert incident fields | Uses normalized incident fields first; no address-country parsing as hard visibility. | `PASS` | `supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql:470` |
| Direct/deeplink/shared thread open | Uses separate direct thread RPC path, not feed discovery scope. | `PASS / STATIC` | `app/src/lib/nativeSocial.ts:478` |
| Downtown SF alert for SF operating scope | Runtime proof returned Social `11` rows and included the Downtown alert in Pass 1. | `PASS / RUNTIME` | `supabase/migrations/20260515122000_social_feed_app_viewer_scope_pass1.sql:110` |

## 1. EXECUTIVE STATUS

Overall: **FAIL**

Static bulletproof result: **FAIL**

Runtime-ready from static code: **NO**

Remote DB/source-contract proof: **PARTIAL VERIFIED**

Static re-audit result, 2026-05-14:

- Current static P0 blockers: **2 confirmed from current local code and remote function proof**.
- Current static result remains **FAIL** because every concrete control match is now enumerated but not every backend-adjacent match has full handler expansion, saved-field mapping is only partially expanded, failure stage/original-error preservation is inconsistent, and several owner-table/storage cleanup paths fail or remain risky.
- Hard-control scan count: **1,581 native control/action matches** from `rg -n "<Pressable|Pressable|Touchable|onPress=|onSubmit|onSave|onUpload|onDelete|onToggle|PanResponder|Gesture\\.Tap|submitComposer|submitMessage|createGroup|saveGroup|savePet|saveProfile|handleBookmark|requestService|handleCreate|deleteAttachment" app/src/screens app/src/components | wc -l`. Any surface below marked `COMPLETE` only means the matrix exists, not that all 1,581 controls are individually proven.
- Tested-response hard gate: **NOT SATISFIED**. A row is not verified unless there is either a real executed response for that exact action or a deterministic source-contract harness result for that exact helper/branch. Typecheck, grep, and migration sync are proof aids, not action-row tests.
- Temp harness update, 2026-05-14: executed disposable live proof now covers profile photo, pet photo, group create/avatar, chat attachment send, social composer image, alert image/pin, and missing-token media/cleanup branches. It does **not** cover every native mutating row, every filter, every form field, every edit/delete variant, every failure branch, or every identity/payment path.
- Previous P0 items for public profile block/star, map alert share, settings family invite notification, and profile photo media registration are now **FIXED STATIC / NEEDS REMOTE SOURCE-CONTRACT PROOF** based on current code.
- Do not use older source-audit P0 labels without checking current code first; several old rows are now stale.

Current top P0 blockers:

| Priority | Item | File/line | Violated contract | Smallest fix |
|---|---|---|---|---|
| P0 | Media cleanup RPC rejects app-used buckets on failed save/register cleanup | `app/src/screens/NativeSetPetScreen.tsx:1182,1250`; `app/src/screens/NativeChatsScreen.tsx:195,2936,3426`; `app/src/lib/nativeProfilePhotos.ts:443`; `supabase/migrations/20260513213000_map_storage_cleanup_idempotent_request.sql:19-23` | Upload/register/save failure paths request cleanup for `pets`, `avatars`, and legacy `Profiles`, but backend cleanup lowercases and accepts only `notices`, `social_album`, `alerts`, `chat_attachments`, `profile_photos`, `profiles`. Failed cleanup is caught/logged in several paths, so DB/media cleanup is not statically complete. | Align cleanup RPC accepted buckets with app bucket calls, canonicalize legacy `Profiles`, and prove cleanup queue processing in source. |
| P0 | Group avatar media registration rejects app object paths | `app/src/screens/NativeChatsScreen.tsx:176-195`; `app/src/screens/NativeChatDialogueScreen.tsx:1173-1181`; remote `register_native_media_asset` body | App uploads group covers to `avatars/groups/{roomId}/{userId}-{ts}.jpg`, but remote `register_native_media_asset` requires non-service paths to start with `auth.uid()/`. Registration therefore raises `object_path_owner_mismatch` after upload, and cleanup then calls unsupported `avatars`. | Add group-avatar-aware registration path/RPC or change app object paths and storage policy consistently; fix cleanup support for `avatars`. |

Current P1 risks:

| Priority | Item | File/line | Contract concern | Smallest fix |
|---|---|---|---|---|
| P1 | Direct owner-table REST is used for pet/profile/settings instead of RPC | `NativeSetPetScreen.tsx:185-223`; `NativeProfileSummaryScreen.tsx:114-183` | Exact-token exists, but RLS policy proof is required for direct table boundary. | Keep only with remote RLS proof or move to owner RPCs. |
| P1 | Chat attachments and group avatars use direct storage object upload | `NativeChatDialogueScreen.tsx:986,1174`; `nativeChat.ts:1798-1817` | Token is passed, but storage policy/member permission is not source-contract proven in this audit. | Add source-contract proof from migrations/policies or move upload/delete behind RPC/function boundary. |
| P1 | Broadcast/social upload cleanup is best-effort | `nativeBroadcast.ts:200-214`; `nativeSocial.ts:615-624`; `NativeAlertDetailModal.tsx:537-544` | Cleanup failure is logged or swallowed inconsistently; exact cleanup stage/original error is not preserved to caller. | Add deterministic cleanup result reporting or queue proof. |
| P0 | Media bucket cleanup RPC rejects current app buckets | `nativeStorageCleanup.ts:3,21-32`; `NativeSetPetScreen.tsx:1182,1250`; `NativeChatsScreen.tsx:195,2936,3426`; `nativeProfilePhotos.ts:443`; backend whitelist `20260513213000_map_storage_cleanup_idempotent_request.sql:19-23` | App requests cleanup for `pets`, `avatars`, and `Profiles`, but backend `request_storage_cleanup` only accepts `notices`, `social_album`, `alerts`, `chat_attachments`, `profile_photos`, `profiles`; failed-save cleanup can silently leave orphan media. | Add accepted buckets or stop sending unsupported buckets; prove cleanup processor handles them. |
| P0 | Group avatar registration path contract is broken | `NativeChatsScreen.tsx:176-195`; `NativeChatDialogueScreen.tsx:1173-1181`; remote `register_native_media_asset` | Remote registration allows bucket `avatars`, but rejects object paths not prefixed with `auth.uid()/`; group avatar paths start `groups/`. | Add an RPC branch that validates group membership/admin for `groups/{roomId}/...` or register group media server-side. |
| P1 | Service/carer profile uses exact-token REST but still depends on owner-table RLS and wallet function source-contract proof | `NativeCarerProfileScreen.tsx:173-181,554-566,776-783` | Current ambient upsert finding is stale; protected writes now include bearer headers, but direct owner-table RLS and Stripe wallet functions remain unproven. | Remote/source RLS/function proof or move carer profile writes to owner RPC. |
| P1 | Verify Identity relies on `supabase.auth.getSession()` inside helper | `nativeVerifyIdentity.ts:366,664` | It is session plumbing, but full upload/function chain was not re-proven. | Source-contract proof for phone/card/device/identity evidence flows. |
| P1 | Verify Identity phone/card/liveness/device fields are not line-by-line mapped | `NativeVerifyIdentityScreen.tsx`; `nativeVerifyIdentity.ts:366,664` | Full static mapping from UI fields to function args/storage object paths/status reconcile is not expanded. | Add exact rows for phone OTP send/resend/wrong/correct, SetupIntent/3DS/status reconcile, liveness poses, device evidence upload. |
| P1 | Service Cards/Detail action proof is improved but still partial | `NativeServiceScreen.tsx:453-570`; `nativeService.ts:627-669` | Bookmark, view, chat, and analytics use exact-token RPCs, but every visible control and caller branch is not individually expanded. | Expand every service control row and caller branch. |
| P1 | Remote DB function/table/RLS/storage source-contract proof is partial, with live risks found | Section 28 and Section 32A | Linked DB proof now verified migrations, selected function grants/shapes, selected table columns, buckets, storage policies, and cleanup function bodies. It also found broad anon grants on several chat/group RPCs and confirmed cleanup whitelist mismatch. | Lock down anon execute grants where not intended; fix cleanup whitelist; keep remaining unqueried function/table rows `UNVERIFIED`. |
| P1 | Every-control coverage is still partial | Section 27 | Several rows group controls by family rather than exact individual control. | Expand all Section 27 rows before static bulletproof claim. |
| P1 | Failure paths often replace original error with generic UI text | `NativeChatsScreen.tsx:2948-2950,3429-3434`; `NativeChatDialogueScreen.tsx:1002-1007,1189-1193,1303-1305`; `NativeSocialScreen.tsx:1208-1214` | The chain preserves user-visible stage loosely, but not exact failing stage plus original error for every protected action. | Store/report `{stage, originalError}` for each protected mutation and cleanup failure. |

Already-clean areas:

| Area | Current proof |
|---|---|
| RootNavigator session source | `RootNavigator.tsx:397-432` validates session/getUser for boot; `RootNavigator.tsx:721-895` passes `session.access_token` to protected native screens/modals. |
| Exact-token RPC primitive | `nativeExactTokenRequest.ts:25-51` posts to `/rest/v1/rpc/*` with `Authorization: Bearer <token>` and returns `missing_access_token` on absent token. |
| Chat core helper fallback | `nativeChat.ts:502-508` rejects missing token instead of ambient RPC. |
| Map alert share token path | `NativeAlertDetailModal.tsx:250-260,554-579` now checks/passes `accessToken`. Old finding is `FIXED`. |
| Family invite path | `NativeSettingsDrawer.tsx:699-714` uses `runNativeFamilyAction`; `NativeSettingsDrawer.tsx:79-82` uses exact-token RPC. Old direct notification finding is `FIXED/SUPERSEDED`. |
| Pet save/upload token path | `NativeSetPetScreen.tsx:151-223,1159-1206` uses JWT subject guard, exact-token REST, exact-token storage upload URL, and media registration REST. |
| Map alert detail fake-null cache | `nativeMapData.ts:459-501` throws on RPC error and caches only real alert matches. |
| Public profile block/star/wave | `nativePublicProfile.ts:297,354-383,431-463` uses exact-token RPCs; no current ambient protected block/star/wave call was found in this file. Static status remains `RISK` where notification failure is logged after atomic chat success. |
| Profile photo registration/upload/save | Temp harness `audit_1778693332079` proved `profile_photos` upload, `register_native_media_asset`, `profiles.photos`, `profiles.avatar_url`, `profiles.social_album`, and `request_storage_cleanup profile_photos` all return success. Legacy `Profiles` cleanup remains failed. |
| Service action RPC callers | `NativeServiceScreen.tsx:453-570`; `nativeService.ts:627-669` routes bookmark/view/chat/analytics through exact-token RPC helpers. Coverage remains partial until each visible service card/detail control is independently expanded. |

Stale old findings now fixed:

| Old finding | Current status | Proof | Reason |
|---|---|---|---|
| Chat dialogue did not receive accessToken | `FIXED` | `RootNavigator.tsx:731-733`; `NativeChatDialogueScreen.tsx:454,538,645,703,754,860,931,1206` | RootNavigator now passes token and dialogue forwards it. |
| `nativeChatRpc` ambient fallback | `FIXED` | `nativeChat.ts:502-508` | Missing token returns error. |
| Map alert share omitted accessToken | `FIXED` | `NativeAlertDetailModal.tsx:250-260,554-579` | Share target, share count, chat share now require/pass token. |
| Settings family invite inserted notifications directly | `FIXED/SUPERSEDED` | `NativeSettingsDrawer.tsx:699-714`; `NativeSettingsDrawer.tsx:79-82` | Family invite now uses RPC boundary. |
| Public profile wave direct fallback | `FIXED` | `nativePublicProfile.ts:354-383` | Wave requires token and uses exact-token RPCs only. |
| Public profile block ambient RPC | `FIXED` | `nativePublicProfile.ts:297-302` | Block requires token and calls `nativeExactTokenRpc("block_user")`. |
| Public profile star ambient quota/chat/notification RPCs | `FIXED/STATIC RISK` | `nativePublicProfile.ts:431-463` | Star requires token and calls exact-token quota, atomic chat, and notification RPCs; notification failure is logged after chat success, so failure-stage completeness is partial. |
| Pet profile ambient direct writes | `FIXED` | `NativeSetPetScreen.tsx:151-223,1159-1206` | Current save/load path is exact-token REST/storage. |
| Alert detail cached null on DB failure | `FIXED` | `nativeMapData.ts:473-501` | Error throws; cache writes only on match. |
| Profile photo media registration missing token | `FIXED/STATIC RISK` | `nativeProfilePhotos.ts:405-423`; `nativeMediaAssets.ts:15-22` | Registration receives `accessToken`; cleanup queue is requested on registration failure, but legacy `Profiles` delete cleanup is not aligned with cleanup whitelist. |

Runtime items are excluded from this static audit verdict. They can be tested only after the code chain is statically ready.

## 2. SCREEN ACTION MATRIX

Every row is current static truth. Rows that group repeated controls still enumerate the visible action/tap target family and exact representative file lines.

| Screen/surface | UI action | UI file/line | Handler file/line | Backend/storage function | Table/RPC/bucket touched | accessToken/session passed | boundary | Success state | Failure state | rollback | Visible result | Status |
|---|---|---:|---:|---|---|---|---|---|---|---|---|---|
| RootNavigator | Boot session | `RootNavigator.tsx:397` | `RootNavigator.tsx:397-432` | `supabase.auth.getSession/getUser`; onboarding snapshot | auth; `get_native_onboarding_snapshot` via boot helper | session token yes | PASS for auth plumbing | route state set | boot retry/error | no | correct screen renders | PASS |
| RootNavigator | Open settings drawer | `RootNavigator.tsx:885-895` | `RootNavigator.tsx:885-895` | none | none | yes to drawer | PASS | drawer opens | n/a | n/a | drawer visible | PASS |
| RootNavigator | Open notifications | `RootNavigator.tsx:887-893` | `RootNavigator.tsx:887-893` | panel fetches notifications | `notifications`, viewer scope | yes | PASS/RISK direct owner REST | panel opens | panel error state | no | notification panel | RISK |
| Home | Avatar/edit profile tap | `NativeHomeScreen.tsx:758` | inline navigate | none | none | n/a | PASS | route `/edit-profile` | n/a | n/a | edit profile screen | PASS |
| Home | Retry load | `NativeHomeScreen.tsx:831` | `loadHome` at `NativeHomeScreen.tsx:613-631` | profile summary + pets REST | `get_native_profile_summary`, `pets` | yes | PASS/RISK direct pets REST | state ready, cache write guarded | error state | old cache retained | home content/retry | RISK |
| Home | Edit pet | `NativeHomeScreen.tsx:861,897` | inline navigate | none | none | n/a | PASS | route `/edit-pet-profile` | n/a | n/a | pet edit screen | PASS |
| Home | Pet card tap | `NativeHomeScreen.tsx:890` | inline navigate | lazy pet details | `get_native_public_profile_pet` or owner pet path | token later | PASS/RISK | detail route | n/a | n/a | pet details screen | RISK |
| Profile Summary | Back | `NativeProfileSummaryScreen.tsx:519` | `handleBackToSettingsDrawer` | none | none | n/a | PASS | drawer route state | n/a | n/a | settings drawer | PASS |
| Profile Summary | Public profile preview | `NativeProfileSummaryScreen.tsx:530,684-685` | `setPublicProfileOpen` | `NativePublicProfileModal` load | `get_native_public_profile_snapshot` | yes | PASS | modal opens | modal error | n/a | public profile modal | PASS |
| Profile Summary | Manage membership | `NativeProfileSummaryScreen.tsx:576` | inline navigate | none | none | n/a | PASS | route `/premium` | n/a | n/a | membership screen | PASS |
| Profile Summary | Discovery privacy toggle | `NativeProfileSummaryScreen.tsx:589` | `persistPrivacy` at `NativeProfileSummaryScreen.tsx:376-391` | exact-token REST PATCH | `profiles.non_social` | yes | PASS/RISK direct REST | profile state/cache | previous value restored on catch | YES | row toggle changes | RISK |
| Profile Summary | Map privacy toggle | `NativeProfileSummaryScreen.tsx:598` | `persistPrivacy` | exact-token REST PATCH | `profiles.hide_from_map` | yes | PASS/RISK | profile state/cache | previous value restored | YES | row toggle changes | RISK |
| Profile Summary | Push toggle | `NativeProfileSummaryScreen.tsx:612-617` | `handlePushToggle` at `NativeProfileSummaryScreen.tsx:394-412` | token registration + exact-token REST | `push_tokens`, `profiles.fcm_token`, `notification_preferences` | yes | PASS/RISK | prefs updated | previous prefs restored | YES | switch updates | RISK |
| Profile Summary | Notification category toggle | `NativeProfileSummaryScreen.tsx:621` | `persistPrefs` at `NativeProfileSummaryScreen.tsx:362-374` | exact-token REST upsert | `notification_preferences` | yes | PASS/RISK | prefs updated | previous restored | YES | switch updates | RISK |
| Profile Summary | Edit profile | `NativeProfileSummaryScreen.tsx:631` | inline navigate | none | none | n/a | PASS | route `/edit-profile` | n/a | n/a | edit screen | PASS |
| Profile Summary | Verify identity | `NativeProfileSummaryScreen.tsx:633` | inline navigate | none | none | n/a | PASS | route `/verify-identity` | n/a | n/a | verify screen | PASS |
| Profile Summary | Security | `NativeProfileSummaryScreen.tsx:635` | inline navigate | none | none | n/a | PASS | route `/settings/security` | n/a | n/a | security screen | PASS |
| Profile Summary | Logout | `NativeProfileSummaryScreen.tsx:641,804-807` | confirm modal -> sign out | `supabase.auth.signOut` via RootNavigator callback | auth | session | PASS | session cleared | modal stays/error risk | no | signed out | RISK |
| Profile Summary | Delete account | `NativeProfileSummaryScreen.tsx:644,855-858` | delete confirm | function call at `NativeProfileSummaryScreen.tsx:469-475` | `delete-account` function | session from `getSession` | RISK | account deletion flow | message | no | modal/status | RISK |
| Edit Profile | Retry load | `NativeEditProfileScreen.tsx:1372` | `loadProfile` | exact-token REST/profile RPCs | `profiles`, `pets`, refresh RPCs | initialSession token | PASS/RISK | form populated | message | no | form | RISK |
| Edit Profile | Back | `NativeEditProfileScreen.tsx:1384` | `onGoBack` | none | none | n/a | PASS | route back | n/a | n/a | previous screen | PASS |
| Edit Profile | Save header/footer | `NativeEditProfileScreen.tsx:1395,1513` | `saveProfile` | exact-token REST + refresh RPCs | `profiles`, `pets`, verification refresh | yes | PASS/RISK | draft removed, cache written | message, draft retained | partial | saved profile | RISK |
| Edit Profile | Switch edit/preview | `NativeEditProfileScreen.tsx:1407,1411` | `silentSaveDraftForPreview` | exact-token REST save | `profiles` | yes | RISK | preview shows saved draft | message possible | no | preview tab | RISK |
| Edit Profile | Save draft | `NativeEditProfileScreen.tsx:1516` | `saveDraft` | AsyncStorage only | draft key | n/a | PASS | draft persisted | message | n/a | draft saved | PASS |
| Edit Profile | Profile photo upload/replace | `NativeProfilePhotoSlot.tsx:191-220` | `handlePickAndUpload`; upload at `nativeProfilePhotos.ts:386-416`; DB save via `NativeEditProfileScreen.tsx:1010-1105` | storage upload + media registration + profile ref save | `profile_photos`, `register_native_media_asset`, `profiles.photos`, `profiles.avatar_url`, `profiles.social_album` | upload yes; registration yes | TEMP HARNESS PASS for current bucket/ref chain | path returned and DB refs saved | upload/registration/save error | `profile_photos` cleanup PASS; legacy `Profiles` cleanup FAIL | photo refs persisted | PASS/RISK |
| Edit Profile | Profile photo remove | `NativeProfilePhotoSlot.tsx:224-228,307-312` | `onRemoved` | DB save later, cleanup unclear | `profile_photos` potential orphan | token later | RISK | slot cleared | can persist only on save | partial | photo removed | RISK |
| Edit Profile | Phone OTP request/verify | `NativeProfileForm.tsx:677,877` | native phone OTP handlers | phone OTP helper/functions | OTP challenge/auth session | session helper | RISK | phone status updates | field error | no | phone row | RISK |
| Edit Profile | Visibility toggles | `NativeProfileForm.tsx:932,949,967,971` | local form setters | saveProfile later | `profiles.prefs` on save | yes on save | PASS/RISK | local state | save can fail | no | toggles update | RISK |
| Edit Profile | Use current location | `NativeProfileForm.tsx:998` | location handler | Expo location/search | profile save later | n/a | RISK | form fields set | permission error | no | fields filled | RISK |
| Pet Profile / NativeSetPet | Load pet | `NativeSetPetScreen.tsx:1031-1045` | `fetchPetRowWithToken` | exact-token REST | `pets` | yes | PASS/RISK | form loaded | message | no | pet form | RISK |
| Pet Profile / NativeSetPet | Save/draft | `NativeSetPetScreen.tsx:1185-1220` | `savePet` | exact-token REST/storage/function | `pets`, `profiles`, `pets` bucket, media RPC, Brevo function | yes | FAIL on cleanup boundary | saved id/photo, nav or message | message, stays on form | cleanup request uses unsupported `pets` bucket | pet saved/draft | FAIL/RISK |
| Pet Profile / NativeSetPet | Photo upload | `NativeSetPetScreen.tsx:1127,1159-1182` | `uploadPhoto` | exact-token storage REST + media RPC | bucket `pets`, `register_native_media_asset` | yes | FAIL on cleanup boundary | public URL set | registration/save failure cleanup rejects `pets` | cleanup ineffective for this bucket | photo visible | FAIL/RISK |
| Pet Details | Home button | `NativePetDetailsScreen.tsx:91` | navigate | none | none | n/a | PASS | route `/` | n/a | n/a | Home | PASS |
| Pet Details | Public/owner pet load | route at `RootNavigator.tsx:800-805` | screen load | public/owner pet helpers | pet RPC/REST | yes | RISK | detail content | empty/error | n/a | detail content | RISK |
| Public Profile | Wave | `NativePublicProfileModal.tsx:183` | `onWave` -> `sendNativePublicProfileWave` | exact-token RPCs | `send_discovery_wave`, relationship RPCs | yes | PASS/RISK | button/modal state via caller | returns failed silently in helper | no | wave result/cue | RISK |
| Public Profile | Star | `NativePublicProfileModal.tsx:129` | `sendNativePublicProfileStarChat` | exact-token RPCs | `get_quota_snapshot`, `send_star_chat_atomic`, `enqueue_notification` | YES | STATIC FIXED / SOURCE-CONTRACT LATER | route/chat on atomic success | reason surfaced; notification failure logs only after success | no | star modal/result | RISK |
| Public Profile | Block | `NativePublicProfileModal.tsx:180` | `blockNativePublicProfileUser` | exact-token RPC | `block_user` | YES | STATIC FIXED / SOURCE-CONTRACT LATER | hidden/blocked callback after backend success | error message | no | modal stays retryable on failure | RISK |
| Public Profile | Close/photo lightbox | `NativePublicProfileModal.tsx:171,206`; content `NativePublicProfileContent.tsx:164-216` | local state | none | none | n/a | PASS | modal/lightbox closes | n/a | n/a | UI closes | PASS |
| Verify Identity | Open from settings/profile | `RootNavigator.tsx:711-729,914` | `NativeVerifyIdentityScreen` | identity helpers/functions | identity tables/buckets | session passed | UNVERIFIED | status updates | errors | unknown | verify UI | UNVERIFIED |
| Verify Identity | Phone/card/device/human actions | `NativeVerifyIdentityScreen.tsx` large flow | verify handlers | `nativeVerifyIdentity.ts` | `identity_verification*`, functions | session via helper | UNVERIFIED | verification status | errors | unknown | status cards | UNVERIFIED |
| Settings Drawer | Main navigation rows | `NativeSettingsDrawer.tsx:327-350` | `openPath/openSupportModal` | none | none | n/a | PASS | route/modal | n/a | n/a | target screen | PASS |
| Settings Drawer | Family add/search | `NativeSettingsDrawer.tsx:635-652,792-821` | `sendInvite` | exact-token RPC | `create_native_family_invite` | yes | PASS/RISK | reload family state | Alert error | no | invite row updates | RISK |
| Settings Drawer | Family remove/cancel/leave/accept/decline | `NativeSettingsDrawer.tsx:654-697` | `runAction/quitFamily` | exact-token RPC | family RPCs | yes | PASS/RISK | reload/close | Alert error | no | family state | RISK |
| Notifications | Close | `NativeNotificationsPanel.tsx:71,75` | `onClose` | none | none | n/a | PASS | panel closes | n/a | n/a | panel hidden | PASS |
| Notifications | Notification row tap | `NativeNotificationsPanel.tsx:104` | mark/navigate handler | exact-token REST | `notifications` PATCH/read, viewer scope | yes | RISK | mark read, route | panel error | no | route/panel updates | RISK |
| Social | Feed load | `NativeSocialScreen.tsx:752`; lib `nativeSocial.ts:438` | `fetchNativeSocialFeedPage` | exact-token RPC | `get_social_feed` | yes | PASS/RISK | threads/cache | notice/cache | old cache | feed visible | RISK |
| Social | Compose submit | `NativeSocialScreen.tsx:1117-1205`; modal submit `NativeSocialScreen.tsx:2612-2619` | `submitComposer` | upload + exact-token RPC | `notices`, `create/update_native_social_thread` | yes | PASS/RISK | thread inserted/refreshed | cleanup best-effort, notice | partial cleanup | post visible | RISK |
| Social | Support | primitive `NativeSocialFeedPrimitives.tsx:887`; handler `NativeSocialScreen.tsx:1224` | `toggleSupport` | exact-token RPC | `thread_supports` via RPC | yes | PASS | optimistic + rollback | rollback/notice | YES | count/icon | PASS |
| Social | Comments open/load older | primitive `NativeSocialFeedPrimitives.tsx:895`; handlers `NativeSocialScreen.tsx:1381-1446` | comments RPC | `get_native_social_comments`, `thread_comments` realtime | yes | PASS/RISK | comments cache/state | error text | no | comments panel | RISK |
| Social | Comment submit/edit/delete | `NativeSocialScreen.tsx:1617-1738` | comment handlers | exact-token RPC + upload | `thread_comments`, `notices` | yes | PASS/RISK | comments/cache/count | notice | partial | comments update | RISK |
| Social | Share/report/block | primitives `NativeSocialFeedPrimitives.tsx:903,911`; modals `NativeSocialScreen.tsx:1959-1964` | share/report/block handlers | exact-token RPCs | share/report/block RPCs | yes | PASS/RISK | local hidden/count | notice | partial | modal closes/state | RISK |
| Social | Save/pin | primitive `NativeSocialFeedPrimitives.tsx:961,964` | `toggleSaved/togglePinned` | AsyncStorage | local keys | n/a | PASS | local state persisted | no backend | n/a | icon changes | PASS |
| Social | Media/lightbox/sensitive | primitives `NativeSocialFeedPrimitives.tsx:492,717,786-792` | local state | none | none | n/a | PASS | lightbox/reveal state | n/a | n/a | viewer updates | PASS |
| Map | Camera movement | `NativeMapScreen.tsx:1238` | debounced shell load at `NativeMapScreen.tsx:585-619` | exact-token RPC | `get_visible_map_pin_shells` | yes | PASS/RISK | pin cache/session state | old cache | old cache retained | pins update | RISK |
| Map | Self pin/unpin | prior handlers `NativeMapScreen.tsx:979,1108,1121,1158` | map mutation helpers | exact-token RPC | pin/location RPCs | yes | PASS/RISK | pin state/map refresh | status message | no | pin visible/removed | RISK |
| Map | Alert marker tap | `NativeMapScreen.tsx:1342,1392-1413` | `fetchNativeMapAlertById` | exact-token RPC | `get_broadcast_alert_by_id` | yes | PASS/RISK | selected alert/modal | status message | no | detail modal | RISK static UI event proof out of scope |
| Alert Detail | Support | `NativeAlertDetailModal.tsx:715` | `handleSupport` `NativeAlertDetailModal.tsx:323-362` | exact-token RPCs | alert interactions, notification | yes | PASS/RISK | liked/count/onRefresh | message | partial | support count | RISK |
| Alert Detail | Share to chat/native | `NativeAlertDetailModal.tsx:833,837` | `handleShareToChat/handleNativeShare` `NativeAlertDetailModal.tsx:554-588` | exact-token share targets/message/share count | chat/share RPCs | yes | PASS/RISK | message/share sheet | message | no | share success | RISK |
| Alert Detail | Report/hide/block | `NativeAlertDetailModal.tsx:730-732` | report/block/hide handlers | exact-token RPCs except hide local | report/block RPCs | yes | PASS/RISK | hidden/report/block state | message | no | modal updates | RISK |
| Alert Detail | Edit/upload/save/delete | `NativeAlertDetailModal.tsx:686-689,911,924,939,942` | edit/delete handlers | storage + exact-token RPCs | `alerts`, broadcast RPCs, cleanup | yes | PASS/RISK | onRefresh/modal closes | message, cleanup best effort | partial cleanup | alert updated/deleted | RISK |
| Broadcast Modal | Add image | `NativeBroadcastModal.tsx:645` | `pickMedia/uploadOne` | storage + register | `alerts`, media RPC | yes | PASS/RISK | media status uploaded | media status error | no | thumbnail/status | RISK |
| Broadcast Modal | Pin location | `NativeBroadcastModal.tsx:285-292` | `requestLocation` | map parent state | none/backend later | n/a | PASS | location pick mode | restricted modal | n/a | map picker | PASS |
| Broadcast Modal | Range/duration gestures | `NativeBroadcastModal.tsx:310-326` | local handlers | none | none | n/a | PASS | local state/upsell | cap/upsell | n/a | controls update | PASS |
| Broadcast Modal | Create alert | `NativeBroadcastModal.tsx:333-350,648-652` | `handleCreate` | exact-token RPC | `create_alert_thread_and_pin`, alerts/social | yes | PASS/RISK | onCreated closes/adds preview | error text | no | alert appears | RISK |
| Chats Discover | Load cards | `NativeChatsScreen.tsx:2261` | load rows | exact-token RPC | `get_discovery_cards`, quota/viewer scope | yes | PASS/RISK | rows/cache | empty/end | cache retained | cards visible | RISK |
| Chats Discover | Pass | `NativeChatsScreen.tsx:3141`; seen `NativeChatsScreen.tsx:3002` | commit action | exact-token RPC | `mark_native_discover_match_seen` | yes | PASS/RISK | card removed/seen cache | rollback paths | YES | next card | RISK |
| Chats Discover | Wave | `NativeChatsScreen.tsx:3146,3177` | wave handler | exact-token RPC/direct chat | `send_discovery_wave`, direct room RPC | yes | PASS/RISK | cue/match/chat | rollback | YES | card/cue/chat | RISK |
| Chats Discover | Star | `NativeChatsScreen.tsx:3209,3285` | star confirm | exact-token RPCs | quota/star/chat RPCs | yes | RISK | confirm/chat | quota banner | partial | chat/upsell | RISK |
| Chats Discover | Swipe/media/profile tap | `NativeChatsScreen.tsx:1188-1194,3560` | local profile/card handlers | lazy public profile | public profile RPCs | yes | RISK | sheet/profile opens | notice | no | modal/profile | RISK |
| Chats Inbox | Open row | `NativeChatsScreen.tsx:2540-2568` | row navigation | exact-token room/read RPCs | chat room/read RPCs | yes | PASS/RISK | route/read state | notice | no | dialogue opens | RISK |
| Chats Inbox | Search/filter/tabs | `NativeChatsScreen.tsx` tab/filter lines in grep | fetch inbox/search | exact-token RPCs | `search_chat_inbox`, inbox RPCs | yes | PASS/RISK | rows update | empty/error | cache retained | list changes | RISK |
| Chat Dialogue | Add media | `NativeChatDialogueScreen.tsx:1519`; handler `880-903` | `pickMedia` | picker only | none until send | n/a | PASS | uploads queued | permission/cap notice | n/a | upload rail | PASS |
| Chat Dialogue | Send message | `NativeChatDialogueScreen.tsx:1522`; handler `905-946` | upload + send RPC | `chat_attachments`, `send_native_chat_message`, media RPC | yes | PASS/RISK | input clears/messages hydrate | restores input/uploads error | YES | message appears | RISK |
| Chat Dialogue | Delete attachment | `NativeChatDialogueScreen.tsx:1388`; handler `1203-1220` | cleanup + content update | `chat_attachments`, update message RPC | yes | PASS/RISK | attachment removed/refetched | notice | partial | attachment removed | RISK |
| Chat Dialogue | Header/profile/group/menu | `NativeChatDialogueScreen.tsx:1413-1444` | navigate/open modal | lazy group/profile RPCs | profile/group snapshots | yes | RISK | sheet/menu opens | notice | no | UI opens | RISK |
| Chat Dialogue | Block/unmatch/mute/report | `NativeChatDialogueScreen.tsx:1532-1538`; handlers `952-998` | exact-token RPCs | block/unmatch/mute/report RPCs | yes | PASS/RISK | state/route updated | notice | partial | menu result | RISK |
| Chat Dialogue | Group avatar/name/description/invite/remove | `NativeChatDialogueScreen.tsx:1553-1625,1715,1738`; handlers `1095-1191` | storage/RPCs | `avatars`, group RPCs | yes | PASS/RISK | group state updates | notice | partial | group sheet updates | RISK |
| Groups | Create group cover | `NativeChatsScreen.tsx:2916`; upload helper `NativeChatsScreen.tsx:176-195` | storage + registration | `avatars/groups/*`, media RPC | yes | FAIL on registration + cleanup boundary | avatar URL never safely proven because registration rejects `groups/` path | registration failure then cleanup rejects `avatars` | cleanup ineffective for this bucket | group cover | FAIL |
| Groups | Join/request/invite/accept/decline | `NativeChatsScreen.tsx:2424,2762,3008+` | group handlers | exact-token RPCs | group join/invite RPCs | yes | PASS/RISK | group state/cache | notices | partial | group lists | RISK |
| Service Cards | Load cards | `NativeServiceScreen.tsx:259-283`; lib `nativeService.ts:411-460` | `fetchNativeServiceProviders` | exact-token RPC | `get_native_service_provider_cards` | yes | PASS/RISK | providers cache/state | old cache/error | old cache | cards visible | RISK |
| Service Cards | Bookmark/detail/action taps | service screen action handlers | service handlers | exact-token RPCs from migrations | service bookmark/detail/view/chat RPCs | yes expected | UNVERIFIED | card/detail state | notice | unknown | card/detail | UNVERIFIED |
| Service Detail | Open provider detail | lib `nativeService.ts:489` | `get_native_service_provider_detail` | exact-token RPC | service detail RPC | yes | PASS/RISK | detail modal/state | error | no | detail view | RISK |

## 3. PROP CHAIN MATRIX

| Protected screen/modal | RootNavigator session source | screen prop | child modal prop | helper argument | request Authorization header | Status |
|---|---|---|---|---|---|---|
| NativeChatDialogueScreen | `RootNavigator.tsx:731-733` | `accessToken={session.access_token}` | Public profile modal at `NativeChatDialogueScreen.tsx:1752-1753` | chat helpers receive `accessToken` at `454,538,645,703,754,860,931,1206` | `nativeExactTokenRpc` header at `nativeExactTokenRequest.ts:34-38` | PASS |
| NativePublicProfileModal | passed by Chat/Social/Map/Profile screens | required `accessToken` prop at modal type | content receives at `NativePublicProfileModal.tsx:229` | profile/wave/block/star exact-token | exact-token helper | STATIC FIXED / SOURCE-CONTRACT LATER |
| NativePetDetailsScreen | `RootNavigator.tsx:800-805` | `accessToken={session.access_token}` | content only | pet helper receives token | exact-token/RPC or REST depending path | RISK |
| NativeSetPetScreen | `RootNavigator.tsx:721-722,806-807` | `accessToken={session.access_token}` | no protected child | `requireActivePetSession` at `NativeSetPetScreen.tsx:151-157` | `Authorization: Bearer` at `160-164` | PASS/RISK |
| NativeProfileSummaryScreen | `RootNavigator.tsx:817-819,863-865` | `accessToken={session.access_token}` | PublicProfile modal `684-685` | prefs/push REST functions receive token | `Authorization: Bearer` at `89-94` | PASS/RISK |
| NativeAlertDetailModal | `NativeMapScreen.tsx:1797` | `accessToken` prop | report modal receives token | map/social/share helpers receive token | exact-token RPC | PASS/RISK |
| NativeBroadcastModal | `NativeMapScreen` passes token to modal | `accessToken` prop | none | `uploadNativeBroadcastImage/createNativeBroadcastAlert` receive token | REST storage/RPC bearer | PASS/RISK |
| NativeSocialReportModal | `NativeSocialScreen.tsx:1960,1964` | `accessToken` prop | none | report helper receives token | exact-token RPC | PASS/RISK |
| NativeServiceScreen | `RootNavigator.tsx:747` | `accessToken={session.access_token}` | service detail uses lib | list/detail helpers receive token | exact-token RPC | RISK |
| NativeNotificationsPanel | `RootNavigator.tsx:890-895` | `accessToken={session.access_token}` | none | notification helpers receive token | REST bearer | RISK |

## 4. BACKEND/RLS MATRIX

| RPC/function/table | Caller file/line | exact-token | security definer | grants/revokes proof | direct private table access | Current status | Fix needed |
|---|---|---|---|---|---|---|---|
| `get_native_onboarding_snapshot` | Root boot | YES | yes in migrations | authenticated/service role in prior proof | NO | PASS | none |
| `get_native_profile_summary` | `nativeProfileSummary.ts:136-159` | YES; missing token throws `missing_access_token` | yes | authenticated/service | NO | STATIC FIXED / SOURCE-CONTRACT LATER | source-contract proof later. |
| `get_native_viewer_scope` | `nativeViewerScope.ts:84-101` | YES | yes | authenticated/service | NO | PASS | none |
| `get_visible_map_pin_shells` | `nativeMapData.ts:359-433` | YES | yes | authenticated/service | NO | PASS/RISK | source-contract map churn proof. |
| `get_broadcast_alert_by_id` | `nativeMapData.ts:473-501` | YES | yes | needs remote grant reproof | NO | PASS/RISK | remote grant proof. |
| Alert support/report/block RPCs | `NativeAlertDetailModal.tsx:323-435`; `nativeMapAlertInteractions.ts:24` | YES | yes in migrations | revokes in `20260513150000...` | NO | PASS/RISK | source-contract proof. |
| `create_alert_thread_and_pin` | `nativeBroadcast.ts:166` | YES | yes | needs remote proof | NO | PASS/RISK | remote grant proof. |
| `request_storage_cleanup` | `nativeStorageCleanup.ts:27`; chat/broadcast/social callers | YES when token passed | yes | authenticated/service in migrations | NO | RISK | ensure every caller passes token and retry queue works. |
| `register_native_media_asset` | `nativeMediaAssets.ts:15-22` | YES; profile photo caller passes token | yes | authenticated/service in migrations | NO | STATIC FIXED / SOURCE-CONTRACT LATER | source-contract proof later. |
| `get_social_feed` | `nativeSocial.ts:438` | YES | yes | authenticated/service | NO | PASS/RISK | source-contract cache proof. |
| `get_native_social_comments` | `nativeSocial.ts:587` | YES | yes | revoke public/anon in `20260513165000...` | NO | PASS/RISK | source-contract comment ordering proof. |
| Social create/update/delete/comment/support/report/block RPCs | `nativeSocial.ts:814-1109` | YES by `nativeSocialRpc` | yes in migrations | revokes in social lazy migration | NO | PASS/RISK | verify all helper branches. |
| `get_chat_inbox_summaries/search/unread` | `nativeChat.ts:939-1008` | YES if caller passes token; missing token errors | yes | latest migrations revoke anon for newer signatures | NO | PASS/RISK | remote grants proof. |
| `get_native_chat_dialogue_snapshot` | `nativeChat.ts:1643-1655` | YES | yes | authenticated/service | NO | PASS/RISK | realtime proof. |
| Chat send/read/delete/update RPCs | `nativeChat.ts:1695-1849`; `NativeChatDialogueScreen.tsx:1215` | YES | yes | `20260513190000...` | NO | PASS/RISK | storage policy source-contract proof. |
| Group management/invite RPCs | `nativeChat.ts:1299,1326-1370`; dialogue exact calls | YES | yes | `20260513190000...` | NO | PASS/RISK | admin/member source-contract proof. |
| `send_discovery_wave` | `nativePublicProfile.ts:354-383`; `NativeChatsScreen` | YES for public profile wave | yes | authenticated/service | NO | PASS/RISK | caller result UX proof. |
| `block_user` from public profile | `nativePublicProfile.ts:297-302` | YES | yes likely | unknown | NO | RISK | source-contract block proof and live grant proof. |
| `send_star_chat_atomic/get_quota_snapshot/enqueue_notification` from public profile | `nativePublicProfile.ts:431-463` | YES | yes likely | unknown | NO | RISK | source-contract star/quota/chat/notification proof. |
| `notification_preferences`, `push_tokens`, `profiles` REST | `NativeProfileSummaryScreen.tsx:114-183` | YES | n/a table RLS | policy proof needed | YES direct owner table | RISK | prove owner RLS or RPC. |
| `pets`, `profiles` REST | `NativeSetPetScreen.tsx:185-223,225-249` | YES | n/a table RLS | policy proof needed | YES direct owner table | RISK | prove owner RLS or RPC. |
| `pet_care_profiles` load/upsert | `NativeCarerProfileScreen.tsx:144,520` | YES exact-token REST | n/a | policy proof needed | YES direct owner/provider table | STATIC FIXED / SOURCE-CONTRACT LATER | remote RLS proof later. |
| Family RPCs | `NativeSettingsDrawer.tsx:79-82,654-714` | YES | yes | migrations need proof | NO | PASS/RISK | remote grant/source-contract proof. |
| Notifications REST | `nativeNotifications.ts:305-365` | YES | n/a RLS | policy proof needed | YES direct owner table | RISK | notification RPC preferred. |

## 5. STORAGE MATRIX

| Feature | Bucket | Object path rule | Auth token source | Upload/delete function | DB/media registration | Cleanup behavior | Storage policy proof | Failure behavior | Status |
|---|---|---|---|---|---|---|---|---|---|
| Profile photos | `profile_photos` | helper path from `getNativeProfilePhotoUploadPath(userId, slot, ext)`; temp harness path `{uid}/audit_1778693332079_profile.png` | `accessToken` prop to upload and registration | `nativeProfilePhotos.ts:386-416`; direct storage upload; temp harness live upload PASS | `registerNativeMediaAsset` receives `cleanAccessToken`; temp harness registration PASS | cleanup queued on registration failure; temp harness `profile_photos` cleanup PASS | remote owner/public policy verified | upload/registration/profile DB ref success executed; no fake success observed | PASS/RISK |
| Pet photos | `pets` | `${activeUserId}/${petId}.${ext}` at `NativeSetPetScreen.tsx:1163` | `requireActivePetSession` token | REST storage POST at `1166-1177` | exact-token REST RPC at `262-270,1178` | no explicit cleanup if DB save later fails | owner-folder policy assumed | save error message, possible orphan | RISK |
| Broadcast/alert images | `alerts` | `${userId}/${timestamp-random}.${ext}` at `nativeBroadcast.ts:183` | `accessToken` required at `178-180` | REST storage POST at `187-199` | `registerNativeMediaAsset` with token at `200-206` | cleanup RPC on registration failure at `207-214`; edit-save orphan cleanup at `NativeAlertDetailModal.tsx:537-544` | owner-folder policy assumed | message/error; cleanup best-effort | RISK |
| Social images | `notices` | `${userId}/${scope}/${timestamp-random}.${ext}` at `nativeSocial.ts:599` | `requireNativeSocialAccessToken` | REST storage POST at `603-614` | `registerNativeMediaAsset` with token at `615-621` | cleanup RPC on register failure at `622-624`; submit cleanup at `NativeSocialScreen.tsx:1204-1205` | owner-folder policy assumed | notice/error; best-effort cleanup | RISK |
| Group avatars | `avatars` | `groups/${roomId}/${userId}-${Date.now()}.jpg` at `NativeChatDialogueScreen.tsx:1173`; group create helper `NativeChatsScreen.tsx:176-195` | screen `accessToken` | `uploadNativeChatStorageObject` | exact-token `register_native_media_asset` at `NativeChatDialogueScreen.tsx:1175-1181`, `NativeChatsScreen.tsx:187-193` | registration rejects `groups/` path because remote function requires `auth.uid()/`; cleanup then rejects `avatars` | storage policy permits group path, but registration RPC does not | notice/generic error | FAIL |
| Chat attachments | `chat_attachments` | `${userId}/chat-media/${roomId}/${nonce}.${ext}` at `nativeChat.ts:1798` | screen `accessToken` | `uploadNativeChatAttachment` at `nativeChat.ts:1801-1817` | registration in chat helper at `nativeChat.ts:526-535` | `deleteOwnNativeChatAttachment` queues cleanup at `1849` | member-aware policy in `20260506183000...` | send rollback restores input/uploads | RISK |
| Identity documents | `identity_verification` | helper-defined | session from `nativeVerifyIdentity.ts:366` | verify identity helper | verification functions | helper/function cleanup | owner/admin policy from old audit, not re-run | status/error unknown | UNVERIFIED |
| Identity evidence | `identity_verification_evidence` | helper-defined | session from `nativeVerifyIdentity.ts:664` | verify identity helper | verification functions | helper/function cleanup | owner/service policy from old audit, not re-run | status/error unknown | UNVERIFIED |

## 6. CACHE / REALTIME MATRIX

| Surface | Cache key | user/session scoped | DB overwrites cache | failed DB keeps cache | fake-empty risk | Realtime channel | duplicate/reorder risk | stale-session guard | Status |
|---|---|---|---|---|---|---|---|---|---|
| Home freshness | `native-home:pets:v1:{userId}`, session freshness registry | YES | YES on guarded success | YES via old state/cache | LOW | home pets channel | low | YES `cacheWriteGuard` | PASS/RISK |
| Profile summary | `native-profile-summary:v2:{userId}` | YES | YES | YES | LOW, but ambient fallback risk | profile subscription | low | guard optional | RISK |
| Social feed | `native-social:*` | YES | YES | cached feed can show | LOW/MEDIUM on hydration fallback | `native-social-threads:*`, comments/support channels | MEDIUM | partial | RISK |
| Social comments/support | `native-social-comments:v3:{userId}:...`, supported key | YES | YES | old comments retained | LOW | `native-social-comments:*`, support | MEDIUM | partial | RISK |
| Chat inbox | `native-chat-inbox:*`, unread memory | YES | YES | old cache retained | LOW | none for inbox list | medium stale unread | cacheWriteGuard | RISK |
| Chat dialogue/messages/reads | per-message/media index keys | YES | hydrated after send/load | old messages retained | LOW | `native-chat-dialogue-messages/reads/members` | HIGH source-contract ordering | partial | RISK |
| Map shell/detail | `native-map:pinShell:*`, `native-map:alertDetail:*` | YES, session key for shell | YES for real rows/detail | YES; detail no fake null | LOW | restrictions + alert interactions | medium | shell guard yes | PASS/RISK |
| Service cards/detail | `native-service:providers:*`, detail memory/cache | YES | YES | old cache retained | LOW | restrictions | low | load gate | RISK |
| Notifications | no persistent cache | YES by user/token | n/a | n/a | LOW | none | low | token required | RISK |
| Public profile cache | `native-public-profile:*` | profile id, not session | YES | persistent stale possible | LOW | none | low | no session guard | RISK |
| Pet/profile drafts | `huddle_native_*_draft:{userId}` | YES | DB success removes draft | draft retained | LOW | none | n/a | user scoped | PASS/RISK |

## 7. NEGATIVE PATH MATRIX

| Protected action group | Missing token | 401/403/RLS denied | RPC error | null response | network failure | storage upload failure | DB save failure | cleanup failure | no fake success | no fake empty | rollback | user-visible retry/error | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chat send/read/delete | `missing_access_token` from helper | throws/notice | throws/notice | invalid rows ignored | notice | upload status error | send notice | best effort | YES | YES | YES | YES | RISK |
| Public profile block/star | token guard present | exact-token RPC error returns failure/reason | star catches to `failed` with reason | empty room -> failed reason | catch failed | n/a | n/a | notification enqueue best effort after chat success | YES | YES | NO | PARTIAL | RISK |
| Public profile wave | token required | returns failed | returns failed | failed | failed | n/a | n/a | n/a | YES | YES | NO | PARTIAL | RISK |
| Profile photo upload | token guard for upload | upload error | registration exact-token throws | n/a | throws | throws | registration fail after upload | temp harness proved `profile_photos` cleanup success; legacy `Profiles` cleanup mismatch remains | YES | YES | PARTIAL | YES | PASS/RISK |
| Pet save/upload | token guard | throws message | register throws | load null shows failed | message | save message | message | cleanup request uses unsupported `pets` bucket | YES | YES | NO | YES | FAIL |
| Profile prefs/push | token guard | restored previous | restored previous | defaults can upsert | message | push permission error | restored previous | n/a | YES | RISK | YES | YES | RISK |
| Alert create/edit/delete | token guard | message | message | missing id throws | message | media status error | message | logged best effort | YES | YES | partial | YES | RISK |
| Social compose/comment | token guard | notice | notice | no comment rows | notice | media status/error | notice | best effort | YES | YES | partial | YES | RISK |
| Family invite/actions | token guard in RPC wrapper | Alert | Alert | n/a | Alert | n/a | n/a | n/a | YES | YES | NO | YES | RISK |
| Notifications | token guard | throws | throws | empty list possible | throws | n/a | mark read throws | n/a | YES | RISK | NO | PARTIAL | RISK |

## 8. LAZY VS SHELL MATRIX

| Rule | Current static proof | Violation | Status |
|---|---|---|---|
| BOOT loads only auth + profile/onboarding decision | `RootNavigator.tsx:397-432`, onboarding route decision only | none found | PASS |
| HOME loads approved HOME phase data | `NativeHomeScreen.tsx:534-594` warms profile, pets, viewer scope, chat unread/inbox, map shells, discovery/group/matched rail | P1 warmup includes discovery/groups/matched rail; accepted by old Home freshness contract but more than pure shell | RISK |
| P1 loads shell/list data only | chat inbox, service cards, social feed, map shells use list RPCs | no message/detail eager load in Home | PASS/RISK |
| Chat messages loaded only on dialogue open | `fetchNativeChatDialogueSnapshot` called in `NativeChatDialogueScreen.tsx:538,645,860`; not Home | none found | PASS |
| Public profile loaded only on modal/open | modal `NativePublicProfileModal`; Home only routes to detail/profile | none found | PASS |
| Pet detail loaded only on route/open | `RootNavigator.tsx:800-805`; Home navigates only | none found | PASS |
| Alert detail/media loaded only on marker/detail | `NativeMapScreen.tsx:1392`; `nativeMapData.ts:445-501` | none found | PASS |
| Service detail loaded on provider detail | `nativeService.ts:489`; service cards separate | none found | PASS |
| Comments/replies loaded on open | `NativeSocialScreen.tsx:1445-1458`; not feed initial | realtime subscribes after visible threads | PASS/RISK |

## 9. ROUTE / WIRING MATRIX

| Route path | Rendered component | userId passed | accessToken/session passed | expected protected helper receives token | route mismatch risk | Status |
|---|---|---|---|---|---|---|
| `/` | `NativeHomeScreen` | YES | YES + sessionKey | YES | low | PASS/RISK |
| `/profile` and settings account overlay | `NativeProfileSummaryScreen` | YES | YES | YES | low | PASS/RISK |
| `/edit-profile`, `/set-profile` | `NativeEditProfileRoute` | YES | initialSession | mostly YES; profile photo registration fixed; photo/OTP/source-contract proof remains | low | RISK |
| `/set-pet`, `/edit-pet-profile` | `NativeSetPetScreen` | YES | YES | YES | low | PASS/RISK |
| `/pet-details` | `NativePetDetailsScreen` | YES | YES | YES expected | id param missing risk | RISK |
| `/verify-identity` | `NativeVerifyIdentityScreen` | YES | initialSession | helper gets session internally | overlay return complexity | UNVERIFIED |
| `/social` | `NativeSocialScreen` | YES | YES | YES | low | PASS/RISK |
| `/map` | `NativeMapScreen` | YES | YES | YES | alert query route risk low | PASS/RISK |
| `/chats` | `NativeChatsScreen` | YES | YES | YES | tab query risk low | PASS/RISK |
| `/chat-dialogue`, `/service-chat` | `NativeChatDialogueScreen` | YES | YES | YES | query room/with fallback complexity | RISK |
| `/service` | `NativeServiceScreen` | YES | YES | YES for list/detail | action caller not fully expanded | RISK |
| `/carerprofile` | `NativeCarerProfileRoute` | YES | session/initialSession | exact-token REST owner-table upsert; live RLS/wallet proof missing | low | RISK |
| `/premium` | `NativeManageSubscriptionRoute` | YES | session | billing/store not audited | alias risk low | UNVERIFIED |
| `/settings/security` mapped as `/security-settings` internally | `NativeSecuritySettingsScreen` | via session | initialSession | auth/session helper | route naming mismatch risk | RISK |
| legal routes | `NativeLegalRoute` | n/a | n/a | n/a | low | PASS |

## 10. OUT-OF-SCOPE RUNTIME TEST LIST

| Runtime item | Exact test needed | Expected log/result | Priority |
|---|---|---|---|
| Map marker touch layering | Tap visible alert marker, then support/share/edit/delete from detail | Detail modal opens; `get_broadcast_alert_by_id` request; no map pan steals tap | P0 static-followup |
| Modal stacking | Open alert share, report, edit, public profile, and settings family modals in sequence | Backdrop closes only top modal; no hidden stuck modal | P1 |
| Discover gestures | Swipe pass/wave/star and tap buttons on same cards | One backend action per gesture; rollback on failure | P1 |
| GPS/camera/photo permissions | Deny and allow location/photo permissions for map, pet, profile, social, chat | User-visible permission message; no fake success | P1 |
| Realtime message/read ordering | Two devices send/read/delete attachment concurrently | No duplicate/reordered visible messages after snapshot/realtime merge | P0 static-followup |
| Storage policy behavior | Upload as owner/member/non-member for `pets`, `alerts`, `notices`, `avatars/groups`, `chat_attachments`, identity buckets | Owner/member allowed; non-member denied; cleanup queue rows created | P0 static-followup |
| API churn/network loops | Move map camera repeatedly; open/close Home/Social/Chats | Debounced loads; no request storm; cache guard logs | P1 |
| Simulator stale bundle | Rebuild app and verify version/log signatures for touched flows | Current code lines behavior visible | P1 |
| Push delivery/deeplink | Send notification and tap in foreground/background | Opens expected route and marks read | P1 |
| Verify Identity phone OTP send | Tap send OTP on Verify Identity phone step | OTP request returns success/cooldown state; no fake verified state | P0 static-followup |
| Verify Identity phone OTP resend | Tap resend after cooldown and before cooldown | Correct cooldown/error handling; no duplicate fake success | P0 static-followup |
| Verify Identity wrong OTP | Submit invalid OTP | Backend rejects; visible error; no verified cache/status write | P0 static-followup |
| Verify Identity correct OTP | Submit valid OTP | Backend accepts; phone verified status refreshes visibly | P0 static-followup |
| Verify Identity card SetupIntent 200 | Start card verification | backend returns SetupIntent/client secret with HTTP 200 | P0 static-followup |
| Verify Identity Stripe confirmSetupIntent success | Complete card confirmation without challenge | success status reconciles to backend and UI | P0 static-followup |
| Verify Identity 3DS required path | Use card requiring 3DS | 3DS modal opens, completes, status reconciles | P0 static-followup |
| Verify Identity 3DS cancelled path | Cancel 3DS | visible cancelled/error state; no fake verified status | P0 static-followup |
| Verify Identity backend card status reconcile | Refresh after Stripe/card result | backend snapshot matches UI status | P0 static-followup |
| Verify Identity human detector callback fires | Start liveness | detector callback logs/sets active pose state | P0 static-followup |
| Verify Identity Center -> Left -> Right backend passed | Complete liveness pose sequence | backend accepts sequence and UI moves to passed state | P0 static-followup |
| Verify Identity device evidence upload | Run device/evidence collection | evidence upload returns success and links to verification attempt | P0 static-followup |
| Verify Identity evidence storage owner/admin policy | Upload/read evidence as owner/admin/non-owner | owner/admin allowed; non-owner denied | P0 static-followup |

## 11. CURRENT OPEN ITEMS

| Class | Item | File/line | Violated contract | Smallest fix |
|---|---|---|---|---|
| P0 BLOCKER | Media bucket cleanup whitelist mismatch | `nativeStorageCleanup.ts:3,21-32`; `NativeSetPetScreen.tsx:1182,1250`; `NativeChatsScreen.tsx:195,2936,3426`; `nativeProfilePhotos.ts:443`; `20260513213000_map_storage_cleanup_idempotent_request.sql:19-23` | Failed save/register cleanup can call unsupported buckets `pets`, `avatars`, and legacy `Profiles`; cleanup errors are caught/logged in multiple paths, so orphan media can persist. | Add/canonicalize cleanup support for these buckets or remove unsupported app calls; prove queue processor handles them. |
| FIXED STATIC / SOURCE-CONTRACT LATER | Public Profile block ambient RPC old finding | `nativePublicProfile.ts:297-302`; `NativePublicProfileModal.tsx:180` | Old finding is stale in current code. | Runtime block action proof only. |
| FIXED STATIC / SOURCE-CONTRACT LATER | Public Profile Star ambient quota/chat/notification RPCs old finding | `nativePublicProfile.ts:431-463`; `NativePublicProfileModal.tsx:129` | Old finding is stale in current code; notification enqueue failure is logged after atomic chat success. | Runtime star/quota/chat proof only. |
| FIXED STATIC / SOURCE-CONTRACT LATER | Profile photo media registration missing token old finding | `nativeProfilePhotos.ts:405-423`; `nativeMediaAssets.ts:15-22` | Old finding is stale in current code; registration receives token and cleanup queue is requested on registration failure. | Source-contract upload/registration/cleanup proof only. |
| P1 RISK | Direct owner REST needs RLS proof | `NativeSetPetScreen.tsx:185-223`; `NativeProfileSummaryScreen.tsx:114-183`; `nativeNotifications.ts:305-365` | Direct private table access accepted only with RLS proof. | Remote policy proof or RPC wrappers. |
| P1 RISK | Carer profile exact-token REST still needs RLS/function proof | `NativeCarerProfileScreen.tsx:173-181,554-566,776-783` | Current ambient upsert old finding is stale; direct `pet_care_profiles` REST and wallet functions still need remote/RLS/source-contract proof. | Remote RLS/function proof or owner RPC wrappers. |
| P1 RISK | Storage cleanup best-effort | `nativeBroadcast.ts:207-214`; `nativeSocial.ts:622-624`; `NativeAlertDetailModal.tsx:537-544` | Cleanup failure can leave orphan media. | Queue/retry proof and visible/telemetry failure path. |
| P1 RISK | Chat/group storage policy source-contract proof missing | `NativeChatDialogueScreen.tsx:926,1109-1117`; `nativeChat.ts:1798-1817` | Static path is correct but storage RLS cannot be proven locally. | Runtime member/non-member tests. |
| P1 RISK | Verify Identity phone OTP send/resend/wrong/correct OTP not chain-proven | `NativeVerifyIdentityScreen.tsx`; `nativePhoneOtp.ts:229,292`; `nativeVerifyIdentity.ts:366,664` | Protected verification subflow is not fully traced from each button to backend status and visible result. | Expand per-control audit and expand phone OTP static rows. |
| P1 RISK | Verify Identity card SetupIntent/3DS/status reconcile not chain-proven | `NativeVerifyIdentityScreen.tsx`; `nativeVerifyIdentity.ts` | Stripe SetupIntent, 3DS branches, cancellation, and backend reconcile are not statically proven. | Add exact card-flow matrix and expand Stripe static rows. |
| P1 RISK | Verify Identity human liveness/device/evidence upload not chain-proven | `NativeVerifyIdentityScreen.tsx`; `nativeVerifyIdentity.ts`; `nativeVerifyIdentityHumanModel.ts` | Liveness callback, pose sequence, device evidence upload, and storage policy result are source-contract dependent. | Add per-step proof and expand evidence upload static rows. |
| P1 RISK | Service Cards action caller proof partial | `NativeServiceScreen.tsx:453-570`; `nativeService.ts:627-669`; `20260513143000_native_service_action_rpc_boundaries.sql` | Current code proves exact-token RPC callers for bookmark/view/chat/analytics, but every visible control is not individually expanded. | Expand exact control rows and run source-contract action proof. |
| P1 RISK | Service Detail action proof partial | `NativeServiceScreen.tsx:860-884`; `nativeService.ts:489-504,640-660` | Detail load/request service path is exact-token, but control-by-control proof and static caller result are still missing. | Expand detail controls and run request/chat proof. |
| P1 RISK | `/premium` billing/store audit not performed | `RootNavigator.tsx:759-777`; `NativeManageSubscriptionRoute` | Billing/store/payment route is rendered with session but payment action chain is outside this audit. | Add premium billing/store action matrix before static bulletproof claim. |
| P1 RISK | `/settings/security` route mismatch/auth helper proof incomplete | `RootNavigator.tsx:753-757`; `NativeSecuritySettingsScreen.tsx:175,382-583` | Internal route is `/security-settings` while navigation uses `/settings/security`; MFA/password/passkey helpers not fully audited. | Prove route mapping and exact auth helper behavior. |
| P1 RISK | Legacy bucket `Profiles` status unverified | storage matrix Section 17 | Legacy profile bucket activity/policies are not confirmed inactive. | Run storage bucket/policy proof and grep active use. |
| P1 RISK | Legacy bucket `verification` status unverified | storage matrix Section 17 | Legacy verification bucket activity/policies are not confirmed inactive. | Run storage bucket/policy proof and grep active use. |
| P1 RISK | Legacy bucket `social_album` status unverified | storage matrix Section 17 | Legacy social album bucket activity/policies are not confirmed inactive. | Run storage bucket/policy proof and grep active use. |
| P1 RISK | Remote DB function grants/shapes not rerun | Section 24 | Static migration sync is not live `pg_proc` proof. | Run function grants/shapes query in Section 28. |
| P1 RISK | Remote table columns/RLS not rerun | Section 24 | Static code cannot prove live schema/RLS. | Run table columns and public RLS queries in Section 28. |
| P1 RISK | Remote storage buckets/policies not rerun | Section 24 | Static code cannot prove live bucket public/private mode or storage policy predicates. | Run storage bucket and policy queries in Section 28. |
| P1 RISK | Cleanup queue processor not proven | `nativeStorageCleanup.ts:27`; `storage_cleanup_queue` | Enqueue path exists, but processor execution/retry is not proven. | Run cleanup processor proof in Section 28. |
| P1 RISK | All `UNVERIFIED` route/matrix rows require static disposition | Sections 2, 9, 14-21 | UNVERIFIED rows cannot be left implicit for static bulletproof claim. | Promote each to owner, proof command, or explicit deferral before static bulletproof claim. |
| P2 CLEANUP | Backup `.bak.focus-snap` file still grep-visible | `app/src/screens/NativeCarerProfileScreen.tsx.bak.focus-snap:501` | Backup source can confuse audits/build tooling. | Remove/archive after approval. |
| OUT OF SCOPE | Touch/modal/realtime/push/identity source-contract proof | multiple lines above | Static audit cannot prove device behavior. | Run tests in section 10. |

## 12. FIXED / STALE AUDIT ITEMS

| Old finding | Current status | Proof file/line | Reason fixed/stale/superseded |
|---|---|---|---|
| Protected chat helper falls back to ambient RPC | FIXED | `nativeChat.ts:502-508` | Missing token now returns `missing_access_token`. |
| Chat dialogue does not receive accessToken | FIXED | `RootNavigator.tsx:731-733`; `NativeChatDialogueScreen.tsx:454,538,645,703,754,860,931,1206` | Token prop and helper args are wired. |
| Direct group management private table reads | SUPERSEDED | `nativeChat.ts:1299,1326-1370`; dialogue group RPCs `NativeChatDialogueScreen.tsx:1013,1138,1158,1174,1191` | Current audited paths use snapshots/RPCs. |
| Discover seen direct write | FIXED | `NativeChatsScreen.tsx:3002`; migration `20260513192000_native_chat_match_seen_rpc_boundary.sql` | Uses `mark_native_discover_match_seen`. |
| Map alert detail fake-null cache | FIXED | `nativeMapData.ts:473-501` | RPC error throws; cache writes only real match. |
| Map alert share missing token | FIXED | `NativeAlertDetailModal.tsx:250-260,554-579` | Token required and passed. |
| Settings family invite direct notification insert | FIXED/SUPERSEDED | `NativeSettingsDrawer.tsx:699-714`; `NativeSettingsDrawer.tsx:79-82` | Exact-token family RPC now owns invite. |
| Public profile wave direct fallback | FIXED | `nativePublicProfile.ts:354-383` | Exact-token public profile RPC path; no direct wave insert in current code. |
| Public profile block/star clean | STILL OPEN | `nativePublicProfile.ts:296-304,419-463` | Block/star still ambient. |
| Pet profile ambient load/save | FIXED | `NativeSetPetScreen.tsx:151-223,1159-1206` | Exact-token REST/storage path. |
| Profile prefs/push ambient writes | FIXED/SUPERSEDED | `NativeProfileSummaryScreen.tsx:114-183,262-282,362-412` | Exact-token REST, still RLS proof risk. |
| Group avatar broad authenticated policy | FIXED/SOURCE-CONTRACT LATER | migrations `20260513193000`, `20260513194000`; migration list synced | Membership-aware policy added and broad policies dropped; source-contract behavior still needed. |
| Verify identity full backend proof | OUT OF SCOPE FOR STATIC AUDIT | `nativeVerifyIdentity.ts:366,664`; `NativeVerifyIdentityScreen.tsx` | Static audit cannot prove device/evidence flow. |

## Terminal Proof

Required grep command 1:

```bash
grep -Rni "supabase.rpc\|supabase.from\|supabase.auth.getUser\|getSession\|Authorization: Bearer\|nativeExactTokenRpc\|resolveNativeViewerScope\|cacheWriteGuard\|sessionKey\|AsyncStorage.setItem\|storage.from\|upload(\|show_languages\|show_location\|prefs\|onRegionChange\|onCameraChanged" app/src supabase/migrations
```

Relevant output summary:

- `RootNavigator.tsx:397,409,432,496,522,855` uses auth session/getUser, sessionKey, and passes tokens.
- `nativeExactTokenRequest.ts:25-51` is the exact-token RPC primitive with `Authorization: Bearer`.
- `nativeChat.ts:502-508` rejects missing accessToken; chat callers pass accessToken.
- `NativeAlertDetailModal.tsx:250-260,554-579` now passes token for share.
- `nativePublicProfile.ts:296-304,419-463` still has ambient public-profile block/star.
- `nativeProfilePhotos.ts:405-416` uploads with token but registration omits token.
- `NativeCarerProfileScreen.tsx:520,729` still has ambient direct provider profile access.

Required grep command 2:

```bash
grep -Rni "onPress\|onSubmit\|onSave\|onUpload\|onDelete\|onToggle\|onJoin\|onInvite\|onReport\|onShare" app/src/screens app/src/components
```

Relevant output summary:

- High-density action surfaces found in `NativeProfileSummaryScreen.tsx`, `NativeHomeScreen.tsx`, `NativeEditProfileScreen.tsx`, `NativeChatDialogueScreen.tsx`, `NativeChatsScreen.tsx`, `NativeSocialScreen.tsx`, `NativeMapScreen.tsx`, `NativeBroadcastModal.tsx`, `NativeAlertDetailModal.tsx`, `NativeSettingsDrawer.tsx`, and profile photo/public profile components.
- Representative lines are included in the Screen Action Matrix; lower-level repeated controls are grouped by action family and marked `RISK` or `UNVERIFIED` where full chain is not statically proven.

Required grep command 3:

```bash
grep -Rni "catch.*return \[\]\|catch.*return null\|return \[\]\|return null\|setItem.*\[\]\|setItem.*null" app/src/lib app/src/screens app/src/components
```

Relevant output summary:

- Many mapper/UI guard `return null` hits are harmless render guards.
- Relevant risk hits: `nativeSocial.ts:456-458` can return `null` on thread fetch error/no data; `nativeProfileSummary.ts:132` has ambient fallback path; `nativeMapData.ts:454,470,498` returns null only for persistent empty/context miss/no match, not RPC error; `nativeChat.ts:316-338` returns cached empty arrays from local cache parsing, not DB failure.

Required grep command 4:

```bash
grep -Rni "get_native_chat_dialogue_snapshot\|get_broadcast_alert_by_id\|get_native_service_provider_detail\|thread_comments\|comments\|replies\|media\|upload" app/src/screens/NativeHomeScreen.tsx app/src/lib app/src/screens
```

Relevant output summary:

- Chat detail snapshot only appears in chat dialogue helpers/screens, not Home.
- Alert detail `get_broadcast_alert_by_id` is in `nativeMapData.ts:473`, reached from marker/detail.
- Service detail `get_native_service_provider_detail` is in `nativeService.ts:489`.
- Social comments load on comments open and realtime subscription, not initial Home.
- Upload paths found for profile photos, pets, alerts, notices, chat attachments, group avatars, and identity helpers.

Required test proof:

```bash
npm --prefix app run typecheck
git diff --check
git diff --cached --check
```

Results:

- `npm --prefix app run typecheck`: PASS (`tsc --noEmit` exited 0).
- `git diff --check`: PASS.
- `git diff --cached --check`: PASS.

## 13. SOURCE AUDIT GATE COVERAGE INDEX

This section exists because the consolidated audit must preserve every gate and matrix family from both source audits, not only the user-requested 12 sections. Current truth supersedes stale source rows.

| Source gate/matrix | Present in this consolidated audit | Current-truth section |
|---|---:|---|
| Native Backend Dependency: Current Re-audit Delta | YES | Sections 1, 12, 22 |
| Native Backend Dependency: App Route To Backend Dependency Matrix | YES | Section 14 |
| Native Backend Dependency: RPC Contract Matrix | YES | Sections 4, 15 |
| Native Backend Dependency: Table And Schema Matrix | YES | Section 16 |
| Native Backend Dependency: Storage Bucket Matrix | YES | Sections 5, 17 |
| Native Backend Dependency: App Data Flow Matrix | YES | Sections 6, 7, 18 |
| Native Backend Dependency: Broken And Risk Summary P0/P1/P2 | YES | Sections 1, 11, 19 |
| Native Backend Dependency: Proof Commands, Migration/Test, Remote Function/Column/RLS/Bucket Gates | YES | Sections Terminal Proof, 23, 24 |
| Native Backend Dependency: Final Status / Do Not Patch Claim | YES | Sections 1, 25 |
| Strict Contract: Current Re-audit Result | YES | Sections 1, 12, 22 |
| Strict Contract: Executive Status | YES | Sections 1, 25 |
| Strict Contract: P0/P1/P2 | YES | Sections 11, 19 |
| Strict Contract: Required Map Flows | YES | Section 20 |
| Strict Contract: Required Chat Flows | YES | Section 20 |
| Strict Contract: Required Social Flows | YES | Section 20 |
| Strict Contract: Required Profile / Settings Flows | YES | Section 20 |
| Strict Contract: Action Flow Surface Matrix | YES | Sections 2, 21 |
| Strict Contract: Runtime Tests Required | YES | Section 10 |

## 14. APP ROUTE TO BACKEND DEPENDENCY MATRIX

This preserves the source route/backend dependency gate with current code status.

| App route/screen | Feature surface | RPCs/functions called | Direct tables read/written | Storage buckets | Cache keys | Realtime channels | Auth method | Status | Issue | Fix needed |
|---|---|---|---|---|---|---|---|---|---|---|
| RootNavigator boot/onboarding | session boot, route decision | `get_native_onboarding_snapshot`; auth `getSession/getUser` | none for feature reads | none | `createNativeSessionKey(userId,generation)` | auth listener | session token + exact-token boot | PASS | Auth plumbing only. | Keep session/accessToken as sole source. |
| Home | profile, pets, P1 freshness | `get_native_profile_summary`, `get_native_viewer_scope`, chat inbox/unread, map shells, discovery/group/matched rail | exact-token owner REST `pets` | none | home pets/profile/map/chat/service/social warm caches | home pets subscription | exact-token + cache guard | PASS/RISK | Home warms several P1 surfaces; accepted but needs source-contract cache proof. | Source-contract cache proof. |
| Profile Summary | account profile, prefs, push, delete/logout | profile summary, delete-account function, auth signOut | exact-token REST `notification_preferences`, `push_tokens`, `profiles` | none | device id, profile cache | profile summary subscription | exact-token REST/session | RISK | Direct owner-table REST requires RLS proof. | RLS proof or RPC. |
| Edit Profile | profile form, photos, phone OTP | profile REST, refresh RPCs, uniqueness RPCs, phone helpers | exact-token REST `profiles`, `pets`; ambient signup uniqueness RPCs | `profile_photos` | profile drafts | none | mixed | RISK | photo registration is now exact-token; uniqueness checks remain ambient and source-contract proof is missing. | Exact-token uniqueness and source-contract photo/phone proof. |
| Pet Profile / NativeSetPet | load/save pet and photo | `register_native_media_asset`, Brevo function | exact-token REST `pets`, `profiles` | `pets` | local screen state/Home pets later | none | exact-token REST/storage | RISK | Direct owner REST + no cleanup on DB failure after upload. | RLS proof and cleanup proof. |
| Public Profile | profile, pets, wave, star, block | profile/pet/relationship/wave/star/block exact-token RPCs | none current for protected actions | profile/public URL resolution | `native-public-profile:*` | none | exact-token RPC | RISK | source-contract grant proof still missing. | Expand public profile source-contract rows. |
| Pet Details | owner/public pet detail | public pet/profile pet helpers | pet RPC/REST depending ownership | public pet URLs | public pet cache | none | token passed | RISK | Full owner/public branch not exhaustively proven. | Runtime and helper branch proof. |
| Verify Identity | phone/card/device/human/evidence | verify identity functions/RPCs | identity tables via functions | `identity_verification`, `identity_verification_evidence`, `verification` | secure device/challenge keys | auth/session | session helper/function | UNVERIFIED | Full evidence upload flow not line-proven. | Source-contract policy proof. |
| Settings Drawer | nav, family account, support/legal | family RPCs, profile summary | none current for family invite | none | profile/family state | none | exact-token family RPC | RISK | Family RPC remote grants/source-contract not fully proven. | Remote grant + source-contract proof. |
| Notifications | list/count/mark/read route | viewer scope + REST notifications | exact-token REST `notifications` | none | none persistent | none | exact-token REST | RISK | Direct table boundary. | RPC or RLS proof. |
| Social | feed/comments/posts/support/share/report/block | social feed/hydration/thread/comment/action RPCs, video functions | link preview/direct cache, mention reads risk | `notices`, Bunny video | social feed/comment/supported/saved/pinned caches | thread/comment/support channels | mostly exact-token | RISK | Media cleanup and direct cache/mention paths need proof. | Source-contract boundary proof. |
| Map | shell, own pin, detail open | viewer scope, map shells, block ids, alert detail, pin mutations | none found in shell | none for shell | map shell/session/detail cache | restrictions/interactions | exact-token RPC | PASS/RISK | Runtime camera churn/touch only. | Source-contract proof. |
| Alert Detail | support/share/report/edit/delete | alert interaction, block/report, share, update/delete RPCs | no direct detail read | `alerts` | alert detail/support/sensitive keys | alert interactions | exact-token | RISK | Media cleanup best-effort. | Cleanup proof. |
| Broadcast Modal | create alert/media | `create_alert_thread_and_pin`, media register/cleanup | none direct | `alerts` | modal state | parent map refresh | exact-token | RISK | Upload cleanup best-effort. | Source-contract cleanup proof. |
| Chats Discover | discovery cards/actions | discovery cards, quota, seen, wave, direct room/star RPCs | none current for seen | `avatars` for groups | seen/matched/filter/group prompt keys | none | exact-token | RISK | Gestures out of scope and star branch proof. | Source-contract proof. |
| Chats Inbox | rows/search/unread | inbox/search/unread/matched rail RPCs | none in main loader | signed `chat_attachments` in details | inbox/unread caches | none | exact-token | PASS/RISK | Source-contract stale unread proof. | Source-contract proof. |
| Chat Dialogue | messages/reads/members/actions/media | snapshot, send/read/update/delete, block/unmatch/group RPCs | realtime table subscriptions only | `chat_attachments`, `avatars/groups` | message/media/read caches | messages/reads/members | exact-token | RISK | Storage policy source-contract/realtime out of scope. | Source-contract storage proof. |
| Groups | create/manage/invite/join | group create/update/join/invite/member RPCs | none current audited | `avatars/groups`, `chat_attachments` | explore/group prompt caches | group/member realtime | exact-token | RISK | Admin/member source-contract policy. | Source-contract policy proof. |
| Service Cards | provider cards/search/filter | provider cards, viewer scope | analytics/view via service RPCs expected | provider public URLs | service provider cache | restrictions | exact-token for list | RISK | All action callers not fully expanded. | Caller proof. |
| Service Detail | provider detail/actions | provider detail, view/bookmark/service chat RPCs | no direct detail read | provider public URLs | detail memory/cache | restrictions | exact-token expected | RISK | Action caller proof incomplete. | Runtime/caller proof. |
| Carer Profile | provider listing save | profile summary, Stripe, `pet_care_profiles` upsert | exact-token REST `pet_care_profiles` | provider media URLs | local form | none | exact-token owner REST | RISK | Native route not in requested screen list but active native route; direct owner-table RLS and wallet functions unproven. | Prove RLS/function behavior or move to owner RPC. |

## 15. RPC CONTRACT MATRIX EXPANSION

This preserves the old RPC gate. `Remote exists/grants` is based on local migrations plus `supabase migration list`; exact live `pg_proc` output was not rerun in this correction pass.

| RPC/function | Caller file/line | Purpose | Tables read | Tables written | Storage touched | security definer | grants/revokes proof | uses `auth.uid()` | shape match | remote synced | Status | Fix needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `get_native_onboarding_snapshot` | boot helper/RootNavigator | onboarding decision | `profiles`, `pets` | none | none | YES | local migration synced | YES | PASS | YES | PASS | none |
| `get_native_profile_summary` | `nativeProfileSummary.ts:155-180` | profile/quota | `profiles`, quota/family | none | none | YES | synced | YES | PASS | YES | RISK | remove ambient fallback branch. |
| `get_native_viewer_scope` | `nativeViewerScope.ts:98` | location/scope | `profiles`, location | none | none | YES | synced | YES | PASS | YES | PASS | none |
| `get_visible_map_pin_shells` | `nativeMapData.ts:385` | map shell pins | alerts/profiles/blocks | none | none | YES | synced | YES | PASS | YES | PASS/RISK | source-contract churn proof. |
| `get_native_map_blocked_user_ids` | `nativeMapData.ts:278` | block filter | `user_blocks` | none | none | YES | `20260513150000` | YES | PASS | YES | PASS | none |
| `get_broadcast_alert_by_id` | `nativeMapData.ts:473` | alert detail | `broadcast_alerts`, profile/media | none | none | YES expected | synced | YES expected | PASS | YES | RISK | live grant/shape query. |
| `native_map_*alert*` support/report/count | `nativeMapAlertInteractions.ts`; modal | support/report/count | alert interactions | alert interactions | none | YES | `20260513150000` | YES | PASS | YES | PASS/RISK | source-contract proof. |
| `create_alert_thread_and_pin` | `nativeBroadcast.ts:166` | create alert/thread | profile/quota | alerts/thread rows | alert refs | YES | synced | YES | PASS | YES | RISK | live grant proof. |
| `request_storage_cleanup` | storage cleanup helpers | cleanup queue | storage metadata | cleanup queue | buckets | YES | synced | YES | PASS | YES | RISK | prove worker/retry. |
| `register_native_media_asset` | media helpers | media registry | optional content | media asset registry | bucket/path | YES | synced | YES | PASS | YES | FAIL for profile photo caller | pass token in caller. |
| `get_social_feed` | `nativeSocial.ts:438` | feed list | threads/profiles/supports | none | none | YES | synced | YES | PASS | YES | PASS/RISK | source-contract proof. |
| `get_social_feed_hydration` | `nativeSocial.ts:379` | feed hydration | comments/mentions/media | none | none | YES | synced | YES | PASS | YES | RISK | no hidden partial failure. |
| `get_native_social_comments` | `nativeSocial.ts:587` | comments | `thread_comments`, profiles, mentions | none | none | YES | `20260513165000` revokes anon | YES | PASS | YES | PASS/RISK | realtime proof. |
| social mutation RPCs | `nativeSocial.ts:814-1109` | create/update/delete/support/share/report/block | social tables | social tables | media refs | YES | lazy/action migrations | YES | PASS | YES | RISK | prove every branch/caller. |
| `get_discovery_cards` | `nativeChat.ts:1464` | discover cards | profiles/pets/waves/matches | none | none | YES | synced | YES | PASS | YES | PASS/RISK | source-contract filter proof. |
| `check_and_increment_quota` | `NativeChatsScreen.tsx:2169` | quota | quota | quota usage | none | YES | older anon risk in source; current remote not requeried | YES | PASS | YES | RISK | live grants. |
| `mark_native_discover_match_seen` | `NativeChatsScreen.tsx:3002` | seen write | seen table | `discover_match_seen` | none | YES | `20260513192000` | YES | PASS | YES | PASS/RISK | source-contract branch proof. |
| inbox/search/unread RPCs | `nativeChat.ts:939-1008` | chat inbox | chat tables | none | attachment refs | YES | synced | YES | PASS | YES | PASS/RISK | live grants. |
| `ensure_direct_chat_room` | `nativeChat.ts:1569` | direct room | profiles/matches/chats | chats/members | none | YES | synced | YES | PASS | YES | PASS/RISK | source-contract proof. |
| `get_native_chat_dialogue_snapshot` | `nativeChat.ts:1651` | messages/members | chat private tables | none | attachment refs | YES | synced | YES | PASS | YES | PASS/RISK | realtime proof. |
| `send_native_chat_message` | `nativeChat.ts:1705` | send | membership | `chat_messages` | attachment refs | YES | `20260513190000` | YES | PASS | YES | PASS/RISK | source-contract proof. |
| `mark_room_read` | `nativeChat.ts:1727,1737` | read state | messages/members | reads | none | YES | `20260512120000` | YES | PASS | YES | PASS/RISK | realtime proof. |
| group management RPCs | `nativeChat.ts:1299,1326-1370`; dialogue | group manage | chats/members/invites | group tables | avatar refs | YES | `20260513190000` | YES | PASS | YES | PASS/RISK | admin source-contract proof. |
| `send_discovery_wave` | `nativePublicProfile.ts:357` | wave | waves/blocks/matches | waves | none | YES | synced | YES | PASS | YES | PASS/RISK | failure UX. |
| `block_user` from public profile | `nativePublicProfile.ts:297-302` | block | blocks | blocks | none | YES likely | unknown | YES | args likely | YES likely | RISK | source-contract grant proof. |
| `send_star_chat_atomic` | `nativePublicProfile.ts:443-448` | star chat | quota/matches | quota/chat/message | none | YES likely | unknown | YES | args likely | YES likely | RISK | source-contract grant proof. |
| `enqueue_notification` from public profile star | `nativePublicProfile.ts:451-461` | notification | prefs/profiles | notifications | none | YES likely | unknown | YES/service | args likely | YES likely | RISK | notification failure logged after chat success; source-contract proof. |
| family RPCs | `NativeSettingsDrawer.tsx:654-714` | family actions | family/profiles | family/invites | none | YES expected | synced | YES | PASS | YES | PASS/RISK | live grant/source-contract. |
| service RPCs | service libs/migration | service bookmark/view/chat/analytics | service/profile tables | service tables/analytics | none | YES | `20260513143000` | YES | PASS | YES | RISK | caller proof. |

## 16. TABLE AND SCHEMA MATRIX

This preserves the source table/schema gate. Live column/policy queries are required before static bulletproof claim; status below is current static app dependency risk.

| Table/view | Native fields/dependency | Column proof | RLS/policy proof | Direct native access | Expected boundary | Status | Fix needed |
|---|---|---|---|---|---|---|---|
| `profiles` | profile summary, prefs, privacy, fcm token, location, verification | local app selects/writes many fields | needs live proof | exact-token REST in profile/settings/pet; ambient in carer backup/path | owner REST/RPC | RISK | remote policy proof; remove ambient carer. |
| `profiles_public` | public projection | not actively direct-read in native grep | not requeried | no direct active native hit found | RPC/view only | UNVERIFIED | query if still used. |
| `pets` | owner pet load/save, public pet cards | app select constant in set pet | needs live proof | exact-token REST | owner REST/RPC | RISK | RLS proof or RPC. |
| `threads` | social feed/posts/map bridge | via RPC mostly | needs live proof | mutation via RPC; link preview/cache adjacent | exact-token RPC | RISK | prove no direct protected mutations remain. |
| `thread_comments` | comments/replies | migration adds fields | needs live proof | realtime subscription + RPC | exact-token RPC/realtime | RISK | source-contract ordering/RLS proof. |
| `broadcast_alerts` | map pins/detail/alerts | via RPC | needs live proof | no direct detail read | exact-token RPC | PASS/RISK | remote grants. |
| `map_alerts` | legacy bridge | not active direct | not requeried | no active hit | legacy/RPC | UNVERIFIED | mark legacy or query. |
| `chat_messages` | dialogue/realtime/send | via RPC/realtime | needs live proof | realtime subscription; send via RPC | RPC + authorized realtime | RISK | realtime RLS proof. |
| `message_reads` | read receipts | via RPC/realtime | needs live proof | realtime subscription | RPC + authorized realtime | RISK | source-contract order proof. |
| `chat_room_members` | membership/roles/mute | via RPC/realtime/storage policies | storage policy migration | realtime subscription | RPC + authorized realtime | RISK | member/non-member tests. |
| `chats` | room/group metadata | via RPC | needs live proof | no current audited private direct read | RPC | PASS/RISK | re-grep before static bulletproof claim. |
| `user_blocks` | block/filter | via RPC mostly | needs live proof | public profile block ambient RPC | exact-token RPC | FAIL for public profile block | exact-token wrapper. |
| `user_unmatches` | unmatch | via RPC | needs live proof | no direct current audited | exact-token RPC | RISK | source-contract proof. |
| `matches` | discovery/chat/star | via RPC | old public-role risk not requeried | no direct current audited | RPC | RISK | live grants/policies. |
| `notifications` | panel/star/family | exact-token REST panel; star/family exact-token enqueue/RPC | needs live proof | direct owner REST panel | owner REST/RPC | RISK | RLS proof for panel; source-contract star/family notification proof. |
| `family_members` | family account | via family RPCs | needs live proof | no direct current audited | exact-token RPC | RISK | remote grants. |
| `storage_cleanup_queue` | cleanup | via RPC | needs live proof | no direct app access | RPC | RISK | worker proof. |
| `notification_preferences` | settings prefs | exact-token REST | needs live proof | direct owner REST | owner REST/RPC | RISK | RLS proof or RPC. |
| `pet_care_profiles` | service/carer listing | service RPC read, carer exact-token REST | needs live proof | direct owner REST | exact-token owner REST/RPC | RISK | live owner RLS proof or RPC wrapper. |

## 17. STORAGE BUCKET MATRIX EXPANSION

| Bucket | Used by feature | Upload path | Read/resolve path | Delete/cleanup path | URL type | Resolver | Cleanup RPC/function | bucket exists/synced | Policy proof | Status | Fix needed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `profile_photos` | edit profile slots | helper path by user/slot/ext | public URL resolver | registration-failure cleanup queued; temp harness cleanup PASS; legacy `Profiles` delete cleanup unsupported | public | `nativeProfilePhotos` | media register exact-token + cleanup request | remote bucket/policy verified | live harness verified upload/register/profile refs/cleanup | PASS/RISK | keep legacy `Profiles` cleanup bucket mismatch open. |
| `Profiles` | legacy profile bucket | no active upload found | legacy resolver | delete helper calls cleanup with `Profiles` | private/legacy | URL cache | cleanup RPC lowercases to `profiles`, but bucket proof/legacy behavior unverified | assumed yes | old proof only | FAIL/RISK | confirm inactive or make cleanup bucket canonical and proven. |
| `avatars` | group avatars | `groups/{roomId}/{userId}-{ts}.jpg` | public URL resolver | cleanup requested on register/metadata failure but backend rejects `avatars` bucket | public | `resolveNativeAvatarUrl` | media register + unsupported cleanup call | yes migration synced | membership policy migrations synced | FAIL/RISK | add `avatars` to cleanup RPC or use supported cleanup path; source-contract admin/member/non-member proof. |
| `pets` | pet photo | `{userId}/{petId}.{ext}` | public URL from storage path | cleanup requested on register/save failure but backend rejects `pets` bucket | public | direct URL | media register + unsupported cleanup call | assumed yes | owner folder assumed | FAIL/RISK | add `pets` to cleanup RPC or use supported cleanup path; RLS/source-contract proof. |
| `notices` | social post/comment/report image | `{userId}/{thread|reply|report}/{ts}.{ext}` | public URL builder | cleanup RPC on register/update/remove | public | `buildPublicStorageUrl` | yes | assumed yes | owner folder assumed | RISK | source-contract cleanup proof. |
| `social_album` | legacy/social album | no current primary upload | resolver fallback | cleanup extractor supports legacy | public/private mixed | `nativeSocial` refs | cleanup can parse legacy | assumed yes | old proof only | UNVERIFIED | confirm active/legacy. |
| `alerts` | broadcast/alert media | `{userId}/{ts-random}.{ext}` | public URL cache | cleanup RPC on register/edit/delete | public | `getCachedNativeAlertPublicUrl` | yes | assumed yes | owner folder assumed | RISK | source-contract cleanup proof. |
| `chat_attachments` | chat message attachments | `{userId}/chat-media/{roomId}/{nonce}.{ext}` | signed URLs | cleanup RPC/delete own | signed/private | `nativeStorageUrlCache` | yes | yes migration synced | member-aware policy old proof | RISK | source-contract member proof. |
| `identity_verification` | ID/selfie docs | helper-defined | signed/private | helper/function cleanup | private | verify helpers | functions | assumed yes | old proof only | UNVERIFIED | source-contract identity proof. |
| `identity_verification_evidence` | evidence artifacts | helper-defined | signed/private | helper/function cleanup | private | verify helpers | functions | assumed yes | old proof only | UNVERIFIED | source-contract identity proof. |
| `verification` | legacy verification | helper/legacy | signed/private | unknown | private | unknown | unknown | assumed yes | old proof only | UNVERIFIED | confirm legacy. |

## 18. APP DATA FLOW MATRIX EXPANSION

| Flow | Step | app file/line | RPC/table/storage | Success condition | Failure mode | Cache behavior | Realtime behavior | Status |
|---|---|---|---|---|---|---|---|---|
| Login/boot | Resolve session identity | `RootNavigator.tsx:397-432` | auth + onboarding RPC | valid user/token | boot error/retry | session generation key | auth listener | PASS |
| Home load | Profile/pets | `NativeHomeScreen.tsx:613-631` | profile RPC, pets REST | state ready | error state | old cache retained | pets channel | RISK |
| Home P1 freshness | warm P1 data | `NativeHomeScreen.tsx:534-594` | viewer/chat/map/discovery/service/social | background success | log fail keep cache | guarded cache | per surface | RISK |
| Discover | cards load | `nativeChat.ts:1464`; `NativeChatsScreen.tsx:1972-2284` | discovery RPC | cards mapped | empty/end/error | discovery cache | none | RISK |
| Discover | pass/wave/star | `NativeChatsScreen.tsx:2996-3209` | seen/wave/star RPCs | card removed/chat/cue | rollback/notice | seen/matched keys | none | RISK |
| Chat dialogue | open snapshot | `NativeChatDialogueScreen.tsx:538,645` | dialogue snapshot RPC | room/messages loaded | notice | message cache | message/read/member channels | RISK |
| Chat dialogue | send media/message | `NativeChatDialogueScreen.tsx:905-946` | storage + send RPC | message merged | input/uploads restored | message cache | message channel | RISK |
| Social feed | feed/hydration | `nativeSocial.ts:379,438` | feed/hydration RPC | rows hydrated | cache/notice | feed cache | thread/support | RISK |
| Social comments | open/load/submit | `NativeSocialScreen.tsx:1381-1738` | comment RPCs/storage | comments update | error/notice | comment cache | comments realtime | RISK |
| Map shell | camera fetch | `NativeMapScreen.tsx:585-619` | pin shells RPC | pins fetched | old cache/status | shell/session cache | restrictions | PASS/RISK |
| Alert detail | open marker | `nativeMapData.ts:445-501` | alert detail RPC | alert returned | throws/no fake null | detail cache real only | interactions | PASS/RISK |
| Broadcast | create/edit/delete | `NativeBroadcastModal.tsx:333-350`; detail modal edit/delete | alert RPC/storage | alert row/media | message | map refresh | interactions/social bridge | RISK |
| Service | cards/detail | `nativeService.ts:411-493` | provider cards/detail RPC | rows/detail | old cache/error | service cache | restrictions | RISK |
| Profile | save/avatar | `NativeEditProfileScreen`; photo helpers | profile REST, storage | profile saved | draft retained/error | draft/profile cache | none | RISK |
| Pet | save/photo | `NativeSetPetScreen.tsx:1185-1220` | pets REST/storage | saved/nav | message | Home later | none | RISK |
| Notifications | list/read | `nativeNotifications.ts:305-365` | notifications REST | rows/read | throw/error | none | none | RISK |
| Public Profile | wave/star/block | `nativePublicProfile.ts:297-463` | exact-token RPCs | wave/star/block result | failed reason/logged notification failure | public cache | none | RISK |

## 19. BROKEN AND RISK SUMMARY EXPANSION

### P0: app boot/access/security/data-loss

| Priority | Issue | Evidence | Status | Fix needed |
|---|---|---|---|---|
| P0 stale | Public Profile block ambient RPC | `nativePublicProfile.ts:297-302` | FIXED STATIC / SOURCE-CONTRACT LATER | Current code uses exact-token `block_user`; run source-contract block proof. |
| P0 stale | Public Profile Star ambient quota/chat/notification RPCs | `nativePublicProfile.ts:431-463` | FIXED STATIC / SOURCE-CONTRACT LATER | Current code uses exact-token quota/star/notification RPCs; run source-contract star proof. |
| P0 stale | Profile photo media registration missing token after upload | `nativeProfilePhotos.ts:405-423` | FIXED STATIC / SOURCE-CONTRACT LATER | Current code passes accessToken and queues cleanup on registration failure. |

### P1: stale data/request storm/media/avatar broken

| Priority | Issue | Evidence | Status | Fix needed |
|---|---|---|---|---|
| P1 | Direct owner REST needs live RLS proof | settings/pet/notifications REST paths | RISK | RLS proof or RPC. |
| P1 | Carer profile direct owner REST still needs live RLS proof | `NativeCarerProfileScreen.tsx:554-566` | RISK | RLS proof or owner RPC. |
| P1 | Cleanup best-effort can leave orphan media | broadcast/social/alert cleanup lines | RISK | cleanup retry proof. |
| P0 | Cleanup whitelist mismatch for media buckets | `NativeSetPetScreen.tsx:1182,1250`; `NativeChatsScreen.tsx:195,2936,3426`; `nativeProfilePhotos.ts:443`; `20260513213000...:19-23` | FAIL/RISK | backend cleanup RPC rejects `pets`, `avatars`, and legacy `Profiles` cleanup paths. |
| P1 | Chat/group storage policy source-contract missing | chat attachment/group avatar lines | RISK | source-contract policy proof. |
| P1 | Home P1 warmup/network churn proof missing | `NativeHomeScreen.tsx:534-594` | RISK | source-contract cache proof. |

### P2: cleanup/refactor/proof gaps

| Priority | Issue | Evidence | Status | Fix needed |
|---|---|---|---|---|
| P2 | Backup file appears in grep scope | `NativeCarerProfileScreen.tsx.bak.focus-snap` | RISK | archive/remove with approval. |
| P2 | Remote column/RLS/storage policy queries not rerun in this correction | proof section | UNVERIFIED | run static proof bundle. |
| P2 | Runtime logs out of scope for static audit | out-of-scope runtime tests | RISK | add/prove logs separately if requested. |

## 20. STRICT REQUIRED FLOW MATRICES

### Required Map Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result | Failure path | Status |
|---|---|---|---|---|---|---|---|---|
| Tap alert marker -> detail | `NativeMapScreen.tsx:1342,1392-1413` | `selectedAlert`, status | `fetchNativeMapAlertById` -> `get_broadcast_alert_by_id` | exact-token | detail cache real rows only | modal appears | status message | RISK static UI event proof out of scope |
| Self pin current location | `NativeMapScreen.tsx:979,1108,1121` | own pin refresh/status | `pinNativeUserLocation` | exact-token | map refresh | own pin visible | GPS/backend status | RISK static GPS permission proof out of scope |
| Unpin | `NativeMapScreen.tsx:1158` | own pin/status | `clearNativeUserLocationPin` | exact-token | map refresh | pin removed | status | RISK |
| Create alert | `NativeBroadcastModal.tsx:333-350,648-652` | modal/media/map preview | `create_alert_thread_and_pin`, `alerts` upload | exact-token | parent refresh | alert appears | error text | RISK |
| Edit alert | `NativeAlertDetailModal.tsx:499-548,942` | edit fields/images | update RPC/storage | exact-token | onRefresh | updated modal/map | message, cleanup best effort | RISK |
| Delete alert | `NativeAlertDetailModal.tsx:430-445` | confirm/hidden | delete RPC/cleanup | exact-token | onRefresh/hidden | modal closes | message | RISK |
| Alert support | `NativeAlertDetailModal.tsx:323-362,715` | liked/count/message | support/remove/count/notify RPCs | exact-token | interaction realtime/support cache | count active | message | PASS/RISK |
| Alert share | `NativeAlertDetailModal.tsx:243-274,554-588,833-837` | share target/sending/message | share targets/send/share count | exact-token | message/share count | share sheet/chat success | message | PASS/RISK |

### Required Chat Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result | Failure path | Status |
|---|---|---|---|---|---|---|---|---|
| Open Discover | `NativeChatsScreen.tsx:2261` | rows/loading/end | `get_discovery_cards` | exact-token | discovery cache | cards | empty/end/error | RISK |
| Pass | `NativeChatsScreen.tsx:3141,3002` | passed/seen | `mark_native_discover_match_seen` | exact-token | seen keys | next card | rollback | RISK |
| Wave | `NativeChatsScreen.tsx:3146,3177` | busy/seen/chat cue | wave/direct room RPCs | exact-token | seen keys | cue/chat | rollback | RISK |
| Star | `NativeChatsScreen.tsx:3209,3285` | confirm/loading | star/quota/chat RPCs | exact-token expected | seen/chat | chat/upsell | quota/error | RISK |
| Open direct chat | `NativeChatsScreen.tsx:3038,2555` | route/read | ensure direct room/read | exact-token | inbox/read | dialogue | notice | RISK |
| Open group/service chat | `NativeChatDialogueScreen.tsx:754-769` | route/dialogue | snapshot/direct fallback | exact-token | realtime | messages | notice | RISK |
| Send message | `NativeChatDialogueScreen.tsx:905-946,1522` | input/uploads/messages | upload + send RPC | exact-token | message cache/realtime | message appears | rollback input/uploads | RISK |
| Load older | `NativeChatDialogueScreen.tsx:860-876` | older/messages | snapshot before timestamp | exact-token | message state | older prepend | notice | RISK |
| Attach media | `NativeChatDialogueScreen.tsx:880-903,926` | uploads | storage upload/register | exact-token storage/RPC | upload state | uploaded thumb/message | upload error | RISK |
| Delete media | `NativeChatDialogueScreen.tsx:1203-1220,1388` | attachment removed | cleanup + message update RPC | exact-token | message update/realtime | attachment removed | notice | RISK |
| Mark read | `NativeChatDialogueScreen.tsx:454,703` | read markers | mark room/read RPC | exact-token | reads realtime | unread clears | warn/notice | RISK |
| Block/unmatch/report | `NativeChatDialogueScreen.tsx:952-998,1532-1538` | menu/block state | exact-token block/unmatch/report | exact-token | local/route | modal closes | notice | RISK |

### Required Social Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result | Failure path | Status |
|---|---|---|---|---|---|---|---|---|
| Load feed | `NativeSocialScreen.tsx:752`; `nativeSocial.ts:438` | threads/loading | `get_social_feed` | exact-token | feed cache/realtime | cards | cache/notice | RISK |
| Open comments | `NativeSocialFeedPrimitives.tsx:895`; `NativeSocialScreen.tsx:1381-1446` | comments state | `get_native_social_comments` | exact-token | comment cache/realtime | comments | error text | RISK |
| Create/edit/delete post | `NativeSocialScreen.tsx:1117-1205,1273` | threads/composer | social thread RPCs/storage | exact-token | cache purge/realtime | row changed | notice/cleanup | RISK |
| Create/edit/delete comment | `NativeSocialScreen.tsx:1617-1738` | comments/count | comment RPCs/storage | exact-token | comment cache | comment changed | notice | RISK |
| Media upload/delete | `nativeSocial.ts:594-630,710+` | media status | `notices` storage + cleanup | exact-token | cache/cleanup | media visible | upload error | RISK |
| Sensitive flag | `NativeSocialScreen.tsx:1117` | thread sensitive | create/update RPC | exact-token | thread state | overlay state | notice | PASS/RISK |
| Like/support | `NativeSocialFeedPrimitives.tsx:887`; `NativeSocialScreen.tsx:1224` | supported/count | support RPC | exact-token | supported cache/realtime | icon/count | rollback | PASS/RISK |
| Save/pin | `NativeSocialFeedPrimitives.tsx:961,964` | local saved/pinned | AsyncStorage | local | local cache | icon | local only | PASS |
| Share/report/block | `NativeSocialFeedPrimitives.tsx:903,911`; modals `NativeSocialScreen.tsx:1959-1964` | modal/thread state | share/report/block RPCs | exact-token | count/hidden | modal result | notice | RISK |

### Required Profile / Settings Flows

| User action | Handler file/line | State updated | Backend call | Auth method | Cache/realtime update | Visible result | Failure path | Status |
|---|---|---|---|---|---|---|---|---|
| Boot/onboarding | `RootNavigator.tsx:397-432,711-855` | session/route | auth + onboarding | session/exact token | session cache | route renders | boot retry | PASS |
| Account settings prefs | `NativeProfileSummaryScreen.tsx:362-412,589-621` | prefs/privacy | exact-token REST | exact-token direct table | profile/prefs | switches | rollback/message | RISK |
| Verify identity from settings | `NativeSettingsDrawer.tsx:339`; `RootNavigator.tsx:711-729` | route/return state | verify helpers | session/helper | profile status later | verify screen | errors | UNVERIFIED |
| Save profile | `NativeEditProfileScreen.tsx:1395,1513` | form/message/cache | exact-token REST/RPC | exact-token | draft/profile cache | saved form | draft retained | RISK |
| Upload/delete avatar | `NativeProfilePhotoSlot.tsx:191-228`; `nativeProfilePhotos.ts:405-443` | photo slot | storage + register | upload token; register token present | profile cache after save | photo | error; legacy `Profiles` cleanup mismatch | RISK |
| Save pet | `NativeSetPetScreen.tsx:1185-1220` | pet form | exact-token REST/storage | exact-token | Home later | nav/message | message | RISK |
| Notifications | `NativeNotificationsPanel.tsx:104`; `nativeNotifications.ts:305-365` | rows/count | REST notifications | exact-token direct table | none | row/read | error | RISK |

## 21. ACTION FLOW SURFACE MATRIX EXPANSION

| Surface | Required action chains proven | Status | Blocking reason |
|---|---|---|---|
| RootNavigator boot/onboarding | session -> route -> token props | PASS | none |
| Home | cards/nav/retry/freshness | RISK | source-contract cache proof |
| Profile Summary | prefs/push/privacy/delete/logout/profile preview | RISK | direct REST RLS and delete source-contract |
| Edit Profile | save/draft/preview/profile photos/OTP/location | RISK | profile photo register token fixed; legacy cleanup/source-contract/OTP proof remains |
| Pet Profile | load/save/upload/draft | RISK | direct REST/storage source-contract |
| Public Profile | load/wave/star/block/photo | RISK | star/block exact-token fixed; source-contract grant proof remains |
| Pet Details | load/nav | RISK | full branch proof |
| Verify Identity | card/phone/human/device/evidence | UNVERIFIED | static-unexpanded |
| Settings Drawer | nav/family/support/legal | RISK | family source-contract grants |
| Notifications | open/read/navigate | RISK | direct table RLS |
| Social | feed/comment/support/save/share/report/block/media | RISK | media cleanup/source-contract |
| Map | camera/self pin/marker/detail | RISK | static UI out of scope/source-contract churn |
| Alert Detail | support/share/edit/delete/report/block | RISK | media cleanup source-contract |
| Broadcast Modal | create/media/location/range/duration | RISK | media cleanup/source-contract |
| Chats Discover | cards/pass/wave/star/swipe/profile | RISK | gestures out of scope/star source-contract |
| Chats Inbox | rows/read/search/filter/open | RISK | realtime/unread proof |
| Chat Dialogue | send/read/older/media/block/unmatch/group | RISK | realtime/storage proof |
| Groups | create/join/invite/manage/avatar | RISK | storage/admin source-contract |
| Service Cards | list/filter/bookmark/detail | RISK/PARTIAL | exact-token callers found; every-control/source-contract proof not fully expanded |
| Service Detail | detail/view/bookmark/chat | RISK | source-contract action proof |
| Carer Profile | listing save/wallet | RISK | exact-token REST owner table + wallet functions need live proof |

## 22. OLD FINDING DISPOSITION MATRIX

| Old finding | Disposition | Current proof | Current status |
|---|---|---|---|
| Chat helper ambient fallback | FIXED | `nativeChat.ts:502-508` | PASS |
| Chat dialogue missing token | FIXED | `RootNavigator.tsx:731-733`; dialogue call sites | PASS/RISK source-contract |
| Direct private group/chat reads | SUPERSEDED | group/snapshot RPCs | RISK source-contract |
| Pet ambient table/storage | FIXED | `NativeSetPetScreen.tsx:151-223,1159-1206` | RISK |
| Profile prefs/push ambient writes | FIXED/SUPERSEDED | `NativeProfileSummaryScreen.tsx:114-183` | RISK |
| Alert detail fake-null cache | FIXED | `nativeMapData.ts:473-501` | PASS/RISK |
| Group avatar broad policy | FIXED/SOURCE-CONTRACT LATER | migrations synced through `20260513233500` | RISK |
| Map share missing token | FIXED | `NativeAlertDetailModal.tsx:250-260,554-579` | RISK |
| Public profile wave direct fallback | FIXED | `nativePublicProfile.ts:354-383` | RISK |
| Public profile block/star ambient | FIXED STATIC / OUT OF SCOPE FOR STATIC AUDIT | `nativePublicProfile.ts:297-302,431-463` | RISK |
| Settings drawer family direct notification | FIXED/SUPERSEDED | `NativeSettingsDrawer.tsx:699-714` | RISK |
| Broadcast/social cleanup proof gaps | STILL OPEN | cleanup helper lines | RISK |
| Runtime touch/gesture/realtime tests | OUT OF SCOPE FOR STATIC AUDIT | section 10/20 | RISK |

## 23. PROOF GATES FROM SOURCE AUDITS

| Gate | Command/query | Current result in this pass | Status |
|---|---|---|---|
| Local grep bundle | required grep command 1 in Terminal Proof | run; key relevant output summarized | PASS |
| Action grep | required grep command 2 in Terminal Proof | run; key surfaces summarized | PASS |
| Fake-empty/null grep | required grep command 3 in Terminal Proof | run; relevant risks summarized | PASS |
| Lazy/detail/media grep | required grep command 4 in Terminal Proof | run; lazy proof summarized | PASS |
| Typecheck | `npm --prefix app run typecheck` | PASS | PASS |
| Diff whitespace | `git diff --check` | PASS | PASS |
| Cached diff whitespace | `git diff --cached --check` | PASS | PASS |
| Migration sync | `supabase migration list | tail -n 35` | Local and remote matched through `20260513233500` | PASS |
| Remote function existence/grants/shape | source SQL in old audit | not rerun in this correction; local migrations inspected | UNVERIFIED |
| Remote columns | source SQL in old audit | not rerun in this correction | UNVERIFIED |
| Remote public/storage RLS policies | source SQL in old audit | not rerun in this correction | UNVERIFIED |
| Storage bucket listing | source SQL in old audit | not rerun in this correction | UNVERIFIED |
| Storage policies for native buckets | source SQL in old audit | migrations inspected; live policies not requeried | RISK |

Migration sync proof excerpt from this correction pass:

```text
20260513193000 | 20260513193000 | 2026-05-13 19:30:00
20260513194000 | 20260513194000 | 2026-05-13 19:40:00
20260513202000 | 20260513202000 | 2026-05-13 20:20:00
20260513213000 | 20260513213000 | 2026-05-13 21:30:00
20260513223000 | 20260513223000 | 2026-05-13 22:30:00
20260513224500 | 20260513224500 | 2026-05-13 22:45:00
20260513225500 | 20260513225500 | 2026-05-13 22:55:00
20260513231500 | 20260513231500 | 2026-05-13 23:15:00
20260513233500 | 20260513233500 | 2026-05-13 23:35:00
```

## 24. REMOTE DB / SOURCE-CONTRACT STATIC PROOF GATES

These are preserved from the backend dependency audit. They are static/backend proof gates, not out-of-scope runtime tests. Local source inspection found migrations, but the linked schema/grant/policy shape remains `UNVERIFIED` until queried or replaced by exact migration source-contract proof.

| Gate | Query target | Required pass condition | Current status |
|---|---|---|---|
| Function existence/grants/shape | `pg_proc` for all `get_native_*`, chat/social/map/service/family/media RPCs | exists, security definer where intended, no anon grants for protected RPCs, args/returns match app | UNVERIFIED |
| Public table columns | `information_schema.columns` for profiles/pets/threads/comments/broadcast/chat/matches/notifications/family/storage cleanup/service | every app-selected/written column exists with expected type | UNVERIFIED |
| Public RLS policies | `pg_policies` for protected public tables | owner/member/block/privacy predicates match contract | UNVERIFIED |
| Storage buckets | `storage.buckets` for profile/photos/pets/alerts/notices/avatars/chat/identity/legacy | bucket exists and public/private mode matches resolver | UNVERIFIED |
| Storage policies | `pg_policies` on `storage.objects` | owner folder for public uploads, member-aware chat/avatar, identity owner/admin, no broad group avatar policy | RISK/UNVERIFIED |
| Cleanup worker | `storage_cleanup_queue` plus processor | cleanup rows are processed and failures retried | UNVERIFIED |

## 25. FINAL STATIC STATUS / DO NOT PATCH CLAIM

Static blockers:

| Area | Status |
|---|---|
| Public Profile block exact-token gap | FIXED STATIC |
| Public Profile Star exact-token gap | FIXED STATIC / STATIC RISK because notification failure is logged after chat success |
| Profile photo media registration token gap | FIXED STATIC / STATIC RISK because legacy cleanup mismatch remains |
| Media cleanup bucket mismatch | STATIC P0 |
| Remote DB/source-contract proof not run | STATIC BLOCKER FOR BULLETPROOF CLAIM |
| Every-control coverage partial | STATIC BLOCKER FOR BULLETPROOF CLAIM |
| Saved-field mapping partial | STATIC BLOCKER FOR BULLETPROOF CLAIM |
| Failure stage/original-error preservation partial | STATIC BLOCKER FOR BULLETPROOF CLAIM |

Static risks that cannot be marked PASS yet:

| Area | Reason |
|---|---|
| Home P1 warmup/cache | no current static P0, but cache/freshness field mapping remains grouped |
| Direct owner REST for settings/pets/notifications | can be `PASS` only with source-contract RLS proof |
| Legacy buckets `Profiles`, `verification`, `social_album` | `Profiles` is actively referenced in delete cleanup and mismatches cleanup canonicalization |
| Service action strict expansion | exact-token callers found, but individual card/detail controls and failure-stage branches remain partial |
| Verify Identity | phone/card/liveness/device/evidence helper chains remain grouped and must be expanded |

Needs remote DB/source-contract proof:

| Area | Status |
|---|---|
| Function grants/shapes | UNVERIFIED |
| Table columns/RLS | UNVERIFIED |
| Storage buckets/policies | UNVERIFIED |
| Cleanup processor | UNVERIFIED |

Runtime testing is intentionally excluded from this static verdict. Static result answers only whether the code is ready before runtime validation.

Do not patch claim: this audit file is the only artifact changed for this correction. No app runtime code, backend code, UI, RootNavigator route code, migrations, database data, storage data, commits, staging, or pushes were changed.

## 26. NEW REQUEST COVERAGE MATRIX

This section maps the user's explicit consolidation requirements to the audit sections above. `STATIC MATRIX PRESENT` means the audit has a named check gate. It does not mean line-by-line proof is complete. Any grouped row is `PARTIAL` until expanded into exact controls/fields.

Correction after strict hard-gate challenge: previous `COMPLETE` labels below were too broad if read as every-control proof. They now mean only `MATRIX PRESENT` or `ADMINISTRATIVE COMPLETE`. Every native action surface remains `PARTIAL` until the 1,581 action-control matches are individually enumerated or explicitly excluded as non-backend local UI controls.

| User-requested gate | Required scope | Where covered | Coverage status |
|---|---|---|---|
| One consolidated output file | `app/NATIVE_APP_ACTION_CHAIN_AUDIT.md` only | whole file | ADMINISTRATIVE COMPLETE |
| Do not patch app/backend/UI/migrations | no code/backend/UI/migration edits | Section 25 | ADMINISTRATIVE COMPLETE |
| Use old audits as starting inputs, re-audit current repo | source audits + current code evidence | Sections 1, 12-25, Terminal Proof | MATRIX PRESENT / CURRENT DELTAS UPDATED |
| Every old finding marked fixed/open/stale/superseded/static-unexpanded | all old P0/P1/P2 and current delta findings | Sections 12, 22 | MATRIX PRESENT / REQUIRES FULL OLD-ROW RECHECK BEFORE BULLETPROOF CLAIM |
| Every current row marked PASS/FAIL/RISK/UNVERIFIED | all current matrices | Sections 2-11, 14-21, 24 | STATIC MATRIX PRESENT / ROW STATUS UPDATED |
| Full PASS chain rule | action -> handler -> props/token -> backend/storage -> boundary -> response -> state/cache/realtime -> visible result -> failure | Opening PASS rule, Sections 2, 7, 20 | RULE PRESENT / NOT ALL ROWS SATISFY |
| Current open items | P0/P1/P2/static-unexpanded, file/line, contract, smallest fix | Section 11 plus Section 19 | MATRIX PRESENT / ADD ALL UNEXPANDED CONTROL GAPS BEFORE BULLETPROOF CLAIM |
| Screen action matrix | every requested native screen/surface | Sections 2, 20, 21, 27, 30 | PARTIAL - grouped controls remain |
| RootNavigator action coverage | boot, settings, notifications, route token props | Sections 2, 3, 9, 14, 20, 27 | PARTIAL - chrome/tab/support controls still grouped |
| Home action coverage | retry, nav/edit pet/pet detail, freshness | Sections 2, 6, 8, 14, 18, 21, 27 | PARTIAL - pet cards/profile cards still grouped |
| Profile Summary action coverage | prefs/push/privacy/nav/logout/delete | Sections 2, 3, 7, 14, 20, 27 | PARTIAL - rows/switches/destructive confirm controls still grouped |
| Edit Profile action coverage | load/save/draft/preview/photos/OTP/location | Sections 2, 5, 7, 14, 20, 30 | PARTIAL - field/delete/failure rows need expansion |
| Pet Profile / NativeSetPet action coverage | load/save/draft/photo upload | Sections 2, 5, 7, 14, 20, 30 | FAIL/RISK - `pets` cleanup bucket mismatch |
| Public Profile action coverage | load/wave/star/block/photo/close | Sections 2, 3, 4, 7, 14, 20, 27 | PARTIAL - modal/photo/pet/lightbox controls still grouped |
| Pet Details action coverage | route/load/home nav | Sections 2, 3, 9, 14, 27 | PARTIAL - all detail tap targets not individually enumerated |
| Verify Identity action coverage | route and verification flow | Sections 2, 3, 5, 10, 14, 20, 30 | PARTIAL / UNVERIFIED - subflows not line-by-line mapped |
| Settings Drawer action coverage | nav, family search/invite/member actions | Sections 2, 3, 14, 20, 27 | PARTIAL - all drawer rows/family controls not individually enumerated |
| Notifications action coverage | open/close/list/read/navigate | Sections 2, 3, 6, 7, 14, 20, 27 | PARTIAL - row variants and route outcomes still grouped |
| Social action coverage | load/feed/comment/post/media/support/save/share/report/block | Sections 2, 5, 6, 7, 14, 20, 30 | PARTIAL - composer and failure-stage proof improved, controls still grouped |
| Map action coverage | camera, self pin, unpin, marker detail | Sections 2, 6, 8, 10, 14, 20, 27 | PARTIAL - marker/GPS/restriction/broadcast controls still grouped |
| Alert Detail action coverage | support/share/report/hide/block/edit/delete/media | Sections 2, 5, 6, 7, 14, 20, 27 | PARTIAL - share targets/edit image/menu controls still grouped |
| Broadcast Modal action coverage | image, location, range/duration, create | Sections 2, 5, 7, 14, 20, 27 | PARTIAL - upload/remove/range/location/upsell controls still grouped |
| Chats Discover action coverage | load/pass/wave/star/swipe/profile/media | Sections 2, 6, 7, 14, 20, 27 | PARTIAL - swipe/album/filter/quota controls still grouped |
| Chats Inbox action coverage | rows/open/read/search/filter | Sections 2, 6, 7, 14, 20, 27 | PARTIAL - row swipe/delete/search/filter variants still grouped |
| Chat Dialogue action coverage | open/send/older/media/delete/read/block/unmatch/report/group | Sections 2, 5, 6, 7, 14, 20, 30 | PARTIAL - attachment cleanup/mutation order has static risks |
| Groups action coverage | create/join/invite/manage/avatar | Sections 2, 5, 7, 14, 20, 30 | FAIL/RISK - `avatars` cleanup bucket mismatch |
| Service Cards action coverage | load/filter/detail/bookmark/action proof | Sections 2, 6, 9, 14, 21, 27 | COVERAGE PARTIAL - RISK/UNVERIFIED; exact missing action caller grep required |
| Service Detail action coverage | detail/view/bookmark/chat | Sections 2, 4, 6, 9, 14, 21, 27 | COVERAGE PARTIAL - RISK/UNVERIFIED; exact missing action caller grep required |
| Prop Chain Matrix | protected screens/modals and Authorization header | Section 3 | MATRIX PRESENT / PROTECTED CHILD CONTROLS STILL PARTIAL |
| Backend/RLS Matrix | RPC/function, caller, exact-token, security definer, grants, direct table, status | Sections 4, 15, 16, 24 | MATRIX PRESENT / REMOTE SOURCE-CONTRACT UNVERIFIED |
| Storage Matrix | upload/delete/cleanup, bucket, path, auth, policy, registration, cleanup, failure | Sections 5, 17, 30 | FAIL/RISK - bucket cleanup mismatch and delete-ref gaps |
| Required buckets | `profile_photos`, `pets`, `alerts`, `notices`, `avatars/groups`, `chat_attachments`, `identity_verification`, `identity_verification_evidence` | Sections 5, 17, 30 | MATRIX PRESENT / `pets`, `avatars`, identity cleanup not clean |
| Cache / Realtime Matrix | cache key, scoped, DB overwrite, failure keeps cache, fake-empty, realtime, reorder, guard | Section 6 plus Section 18 | MATRIX PRESENT / REORDER AND STALE-GUARD ROWS PARTIAL |
| Negative Path Matrix | missing token, 401/403, RLS, RPC, null, network, storage, DB, cleanup | Section 7 plus Section 30 | PARTIAL/FAIL - original error/stage not preserved everywhere |
| Lazy vs Shell Matrix | boot/home/P1/lazy detail violations | Section 8 | MATRIX PRESENT / STATIC SCOPE ONLY |
| Route / Wiring Matrix | route path, component, userId/token, helper token, mismatch | Section 9 | MATRIX PRESENT / SOME ROUTES UNVERIFIED |
| Runtime-only test list | tap, modal, gestures, permissions, realtime, storage policy, API churn, stale bundle, push/deeplink | Section 10 | OUT OF SCOPE FOR THIS STATIC AUDIT |
| Fixed / Stale Audit Items | old finding, status, proof, reason | Sections 12, 22 | MATRIX PRESENT / OLD FINDINGS RECLASSIFIED WHERE RECHECKED |
| Native Backend Dependency old matrices | route/backend, RPC, table/schema, storage, data flow, risk summary, proof/final gates | Sections 13-19, 23-25 | MATRIX PRESENT / NOT EVERY OLD ROW IS FULL CONTROL-PROVEN |
| Strict Backend Interaction old matrices | required map/chat/social/profile flows, action surface, static/final gates | Sections 13, 20-25 | MATRIX PRESENT / NOT EVERY OLD ROW IS FULL CONTROL-PROVEN |
| Terminal/source proof required grep commands | four grep commands with relevant output summary plus strict static greps | Terminal Proof, Section 30 | COMPLETE FOR CURRENT PASS; not a substitute for line-by-line expansion |
| Test proof required | typecheck, diff check, cached diff check | Terminal Proof | ADMINISTRATIVE COMPLETE |
| Migration sync proof from repo rules | migration list | Section 23 | ADMINISTRATIVE COMPLETE |

## 27. EXACT CONTROL COVERAGE GAPS

The Screen Action Matrix and strict flow expansions still group repeated controls by action family. That is acceptable for static risk triage but **not bulletproof every-control coverage**. Each row below must be expanded into one row per visible button/tap target/gesture before claiming complete control coverage.

| Surface | Grouped action | Exact missing controls/tap targets | File/line search needed | Status |
|---|---|---|---|---|
| RootNavigator / chrome | grouped settings, notification, bottom nav/header actions | logo press, notification bell, settings button, bottom nav tab buttons, support modal close/actions | `rg -n "onLogoPress|onNotificationsPress|onSettingsPress|NativeBottomNav|onNavigate|support" app/src/navigation/RootNavigator.tsx app/src/components` | NOT BULLETPROOF UNTIL EXPANDED |
| Home | grouped card/nav/retry actions | retry button, avatar edit, profile summary cards, each pet card, edit pet CTA, carousel controls if present | `rg -n "onPress|Pressable|Touchable|pet|retry|edit" app/src/screens/NativeHomeScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Profile Summary | grouped prefs/navigation/destructive actions | every `ActionRow`, each switch row, logout confirm/cancel, delete confirm/cancel, public profile modal open/close | `rg -n "ActionRow|onPress|Confirm|Delete|Logout|switch" app/src/screens/NativeProfileSummaryScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Edit Profile | grouped form/photo/OTP/location controls | every field edit/save icon, select option, visibility toggle, phone OTP request/verify, location suggestion, save/draft/preview/back, each photo slot action | `rg -n "onPress|onSave|onToggle|onOtp|onUseCurrentLocation|NativeProfilePhoto" app/src/screens/NativeEditProfileScreen.tsx app/src/components/profile` | NOT BULLETPROOF UNTIL EXPANDED |
| Pet Profile / NativeSetPet | grouped save/photo/form editor controls | photo picker/remove, save draft, finish save, reminder/medication/vet editors, date/select controls, back | `rg -n "onPress|savePet|uploadPhoto|reminder|medication|vet|Pressable" app/src/screens/NativeSetPetScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Public Profile | grouped wave/star/block/photo controls | close, wave, star confirm/cancel, block confirm/cancel, pet taps, photo lightbox open/close | `rg -n "onPress|onWave|confirmStar|confirmBlock|lightbox|pet" app/src/components/profile/NativePublicProfileModal.tsx app/src/components/profile/NativePublicProfileContent.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Pet Details | grouped detail/nav controls | home/back, owner/profile tap, photo taps, any edit/navigation CTAs | `rg -n "onPress|Pressable|onNavigate|photo|profile" app/src/screens/NativePetDetailsScreen.tsx app/src/components/NativePetDetailsContent.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Verify Identity | grouped verification flow | phone send/resend/verify, wrong/correct OTP submit, card start/confirm/3DS return/cancel, liveness start/pose capture, device/evidence upload, back/close | `rg -n "onPress|send|resend|otp|SetupIntent|3DS|liveness|human|device|evidence|upload|verify" app/src/screens/NativeVerifyIdentityScreen.tsx app/src/lib/nativeVerifyIdentity.ts` | NOT BULLETPROOF UNTIL EXPANDED |
| Settings Drawer | grouped nav/family actions | every main row, legal rows, support row, family open/close, search result invite buttons, remove/cancel/leave/accept/decline, upsell buttons | `rg -n "onPress|SettingsRow|sendInvite|removeMember|cancelInvite|quitFamily|acceptInvite|declineInvite" app/src/components/NativeSettingsDrawer.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Notifications | grouped panel row actions | close backdrop, close icon, every notification row tap, mark-read/navigate behavior | `rg -n "onPress|Pressable|mark|navigate|notification" app/src/components/NativeNotificationsPanel.tsx app/src/lib/nativeNotifications.ts` | NOT BULLETPROOF UNTIL EXPANDED |
| Social | grouped feed/comment/media/modals | composer open/close/submit, every media add/remove, support/comment/share/more/save/pin, report/block/hide, comment reply/edit/delete/load older, carousel controls | `rg -n "onPress|onSubmit|onToggle|onOpen|onRemove|onReply|onDelete|support|share|report|block|pin|save" app/src/screens/NativeSocialScreen.tsx app/src/components/social` | NOT BULLETPROOF UNTIL EXPANDED |
| Map | grouped map controls | marker taps, own pin, unpin, GPS modal actions, restriction modal, broadcast open, camera changed region events, clustered marker taps | `rg -n "onPress|onCameraChanged|Marker|pin|unpin|broadcast|restriction|cluster" app/src/screens/NativeMapScreen.tsx app/src/components/map` | NOT BULLETPROOF UNTIL EXPANDED |
| Alert Detail | grouped support/share/edit/delete/report/block controls | sensitive reveal, creator profile, social link, support, share open, share target row, share-to-chat, native share, more menu items, edit image remove/add/save, delete confirm | `rg -n "onPress|handleSupport|handleShare|handleSaveEdit|handleDelete|openReport|handleBlock|revealSensitive" app/src/components/map/NativeAlertDetailModal.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Broadcast Modal | grouped image/location/create controls | add image, remove image, sensitive toggle, range slider, duration slider, location pin, create, close, upsell actions | `rg -n "onPress|handleCreate|pickMedia|removeMedia|range|duration|sensitive|location|upsell" app/src/components/map/NativeBroadcastModal.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Chats Discover | grouped card gestures/actions | swipe gestures, pass button, wave button, star button, profile tap, album/media controls, filters, quota/upsell confirm/cancel | `rg -n "onPress|Swipe|Pan|handle.*Pass|handle.*Wave|handle.*Star|filter|confirm|DiscoveryProfileCard" app/src/screens/NativeChatsScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Chats Inbox | grouped row/search/filter actions | tab buttons, search input submit/clear, row taps, mark read on open, filter chips, group/service/friends tab controls | `rg -n "onPress|tab|search|filter|row|markNativeChatRoomRead|resolveNativeChatInboxRowNavigation" app/src/screens/NativeChatsScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Chat Dialogue | grouped composer/menu/group actions | back, identity/profile tap, more menu, attach, remove queued upload, send, media preview close, attachment delete, block/unmatch/report, group info, avatar/name/description edit, invite/remove member | `rg -n "onPress|submitMessage|pickMedia|deleteAttachment|toggleMute|block|unmatch|group|invite|remove|avatar|description|name" app/src/screens/NativeChatDialogueScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Groups | grouped group create/manage actions | group create cover pick/remove, create submit, edit metadata, join/request/accept/decline/cancel invite, member action menu | `rg -n "onPress|create.*Group|join|invite|decline|accept|cancel|member|cover|metadata" app/src/screens/NativeChatsScreen.tsx app/src/screens/NativeChatDialogueScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |
| Service Cards | grouped list/detail/action controls | provider card tap, bookmark, sort/filter/search/date controls, request/chat/service action buttons, provider profile modal controls | `rg -n "onPress|bookmark|detail|provider|chat|request|filter|sort|search|toggle|record_native_service" app/src/screens/NativeServiceScreen.tsx app/src/lib/nativeService.ts` | NOT BULLETPROOF UNTIL EXPANDED |
| Service Detail | grouped provider detail controls | detail open/close, profile avatar/photo tap, bookmark, request service, service chat, view count/analytics trigger, report/block if present | `rg -n "onPress|detail|bookmark|chat|request|view|analytics|provider" app/src/screens/NativeServiceScreen.tsx app/src/lib/nativeService.ts` | NOT BULLETPROOF UNTIL EXPANDED |
| Premium | grouped billing/store controls not audited | plan tabs, purchase/restore/manage subscription, add-ons, store callbacks, web/billing fallback | `rg -n "onPress|purchase|restore|billing|subscription|addon|store|checkout|manage" app/src/screens app/src/components app/src/lib | rg "Premium|Subscription|Billing|Store"` | NOT BULLETPROOF UNTIL EXPANDED |
| Security Settings | grouped security controls not fully audited | password modal open/submit/cancel, TOTP setup/verify/disable, passkey remove, biometric row, auth app open | `rg -n "onPress|handleStartMfaSetup|handleVerifyCode|handleChangePassword|passkey|biometric|TOTP|password" app/src/screens/NativeSecuritySettingsScreen.tsx` | NOT BULLETPROOF UNTIL EXPANDED |

## 28. REMOTE DB PROOF NOT RUN = AUDIT NOT BULLETPROOF

Static consolidation is separate from live database proof. The following static gates must be run against the linked database before this audit can be called statically bulletproof.

### Function grants/shapes

```bash
set -a; source <(grep -E '^(SUPABASE_DB_PASSWORD|TWILIO_AUTH_TOKEN)=' backend.env.md); set +a; supabase db query --linked -o table "
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) args,
  pg_get_function_result(p.oid) result,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proacl, '; '),'') as grants
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (
    proname like 'get_native_%'
    or proname like 'native_%'
    or proname in (
      'search_chat_inbox',
      'get_chat_inbox_summaries',
      'get_chat_inbox_unread_total',
      'check_and_increment_quota',
      'request_storage_cleanup',
      'register_native_media_asset',
      'resolve_native_viewer_scope',
      'get_visible_map_pin_shells',
      'get_social_feed',
      'get_social_feed_hydration',
      'get_discovery_cards',
      'get_public_groups_for_viewer',
      'get_group_invite_previews',
      'ensure_direct_chat_room',
      'check_native_direct_relationship',
      'send_star_chat_atomic',
      'enqueue_notification'
    )
  )
order by proname;"
```

### Table columns

```bash
set -a; source <(grep -E '^(SUPABASE_DB_PASSWORD|TWILIO_AUTH_TOKEN)=' backend.env.md); set +a; supabase db query --linked -o table "
select table_name,column_name,data_type,udt_name
from information_schema.columns
where table_schema='public'
  and table_name in (
    'profiles','profiles_public','pets','threads','thread_comments',
    'broadcast_alerts','map_alerts','chat_messages','message_reads',
    'chat_room_members','chats','user_blocks','user_unmatches','matches',
    'notifications','family_members','storage_cleanup_queue',
    'notification_preferences','pet_care_profiles'
  )
order by table_name,column_name;"
```

### Public RLS policies

```bash
set -a; source <(grep -E '^(SUPABASE_DB_PASSWORD|TWILIO_AUTH_TOKEN)=' backend.env.md); set +a; supabase db query --linked -o table "
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'profiles','profiles_public','pets','threads','thread_comments',
    'broadcast_alerts','map_alerts','chat_messages','message_reads',
    'chat_room_members','chats','user_blocks','user_unmatches','matches',
    'notifications','family_members','storage_cleanup_queue',
    'notification_preferences','pet_care_profiles'
  )
order by schemaname,tablename,policyname;"
```

### Storage buckets

```bash
set -a; source <(grep -E '^(SUPABASE_DB_PASSWORD|TWILIO_AUTH_TOKEN)=' backend.env.md); set +a; supabase db query --linked -o table "
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in (
  'avatars','alerts','notices','profile_photos','pets','chat_attachments',
  'social_album','identity_verification','identity_verification_evidence',
  'verification','Profiles'
)
order by id;"
```

### Storage policies

```bash
set -a; source <(grep -E '^(SUPABASE_DB_PASSWORD|TWILIO_AUTH_TOKEN)=' backend.env.md); set +a; supabase db query --linked -o table "
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='storage'
  and tablename='objects'
  and (
    qual like '%avatars%' or with_check like '%avatars%'
    or qual like '%alerts%' or with_check like '%alerts%'
    or qual like '%notices%' or with_check like '%notices%'
    or qual like '%profile_photos%' or with_check like '%profile_photos%'
    or qual like '%pets%' or with_check like '%pets%'
    or qual like '%chat_attachments%' or with_check like '%chat_attachments%'
    or qual like '%identity_verification%' or with_check like '%identity_verification%'
    or qual like '%social_album%' or with_check like '%social_album%'
    or qual like '%verification%' or with_check like '%verification%'
    or qual like '%Profiles%' or with_check like '%Profiles%'
  )
order by policyname;"
```

### Cleanup queue processor

```bash
set -a; source <(grep -E '^(SUPABASE_DB_PASSWORD|TWILIO_AUTH_TOKEN)=' backend.env.md); set +a; supabase db query --linked -o table "
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name='storage_cleanup_queue'
order by ordinal_position;

select proname, pg_get_function_identity_arguments(oid) args, pg_get_function_result(oid) result
from pg_proc
where pronamespace='public'::regnamespace
  and (proname like '%storage_cleanup%' or proname like '%cleanup%')
order by proname;"
```

## 29. AUDIT BULLETPROOF STATUS

| Verdict item | Status |
|---|---|
| Static consolidation | PASS - matrices consolidated into one file |
| Static line-by-line action proof | PARTIAL |
| Every-control coverage | PARTIAL |
| Every composer/create/edit form field mapping | PARTIAL |
| Every room/chat/group creation path | PARTIAL |
| Every media upload/delete/cleanup path | FAIL/RISK |
| Every delete clears DB refs + media refs | PARTIAL/FAIL |
| Every failure preserves exact stage + original error | PARTIAL/FAIL |
| Remote DB/source-contract proof | UNVERIFIED/PARTIAL |
| Every row has tested/verified response | NO |
| Runtime-ready from static code | NO |
| Static backend proof result | FAIL |
| Safe to fix P0s from this audit | YES - media cleanup whitelist mismatch |
| Safe to claim full app complete | NO |

Non-bulletproof reason, stated plainly: source scan found **1,581 native action-control matches** across `app/src/screens` and `app/src/components`. This audit has strict matrices and high-risk chain proof, but it has not converted those 1,581 matches into one row per concrete control. Therefore any broad screen-level `PASS` or `COMPLETE` from earlier sections is subordinate to Section 26 and this verdict.

Tested-response reason, stated plainly: action-row verification has not been completed. No mutating backend row may be called `VERIFIED` from grep/typecheck alone. Live mutating rows such as pet save, group create, chat send/delete attachment, social post, report/block/share, service chat, and identity verification require a sandbox/test account and expected response capture, or a dedicated source-contract harness that exercises mocked success/failure branches.

## 30. STRICT STATIC HARD-GATE RE-AUDIT DELTA

This section supersedes earlier runtime/release phrasing. It records the stricter static-only checks added after the 2026-05-14 hard-gate correction. `PASS` is not allowed when controls are grouped, fields are not mapped to exact RPC args/DB columns, cleanup bucket names do not match backend acceptance, or failure branches hide the exact stage/original error.

### Composer/Create/Edit Form Gate

| Flow | Static source proof | Field/arg/column mapping | Success state | Failure stage/original error | Status |
|---|---|---|---|---|---|
| Social thread composer create | `NativeSocialScreen.tsx:1117-1214`; `nativeSocial.ts:594-624`; `nativeSocial.ts:751-817` | `title` -> `threads.title`; `content` -> thread content RPC arg; `category` -> tags/category arg; `isSensitive` -> sensitive arg; images -> bucket `notices` path `${userId}/thread/...`; video -> `social-video-create-upload` then finalize | created thread fetched and inserted; cache refreshed | upload cleanup uses `cleanupNativeSocialStorageImages(...).catch(() => undefined)` and UI shows generic quota/save banner, so cleanup stage/original error is not preserved | RISK |
| Social thread composer edit | `NativeSocialScreen.tsx:1141-1184`; `nativeSocial.ts` update helper | same fields as create plus `id`; removed images are handled by update helper cleanup path | thread state/cache patched from fresh fetch | cleanup/update/mention notification stages are not individually surfaced | RISK |
| Chat dialogue composer send | `NativeChatDialogueScreen.tsx:960-1010`; `nativeChat.ts:1780-1874` | text/link preview serialized into `p_content`; attachments -> `chat_attachments` path `${userId}/chat-media/${roomId}/${nonce}.${ext}` then `register_native_media_asset` | input/upload rail cleared; hydrated messages merged | catch restores text/uploads/preview but collapses original error to `Failed to send message`; uploaded orphan cleanup is not proven if send fails after upload/register | RISK |
| Group create form | `NativeChatsScreen.tsx:2911-2952`; `nativeChat.ts:1186-1247`; `NativeChatsScreen.tsx:171-203` | name/description/joinMethod/visibility/location/country/petFocus/inviteUserIds -> `createNativeGroupChat` args; cover -> bucket `avatars` path `groups/${chatId}/${userId}-${Date.now()}.${ext}` | modal closes, drafts reset, rows reload, route opens created room | create failure uses generic status; cover register/metadata cleanup calls unsupported `avatars` bucket | FAIL/RISK |
| Group edit form | `NativeChatsScreen.tsx:3381-3434`; `nativeChat.ts:1649-1685` | name/avatar/description/location/petFocus -> `update_group_chat_metadata` args; update booleans map each changed field | local group state patched and optional route opens | cover cleanup calls unsupported `avatars` bucket; exact original metadata/upload error is not preserved to UI | FAIL/RISK |
| Chat dialogue group info edit | `NativeChatDialogueScreen.tsx:1098-1194`; `nativeChat.ts:1649-1685` | group name/description/avatar -> `update_group_chat_metadata`; avatar -> bucket `avatars` path `groups/${roomId}/${userId}-${Date.now()}.jpg` | room state patched; notice shown | avatar upload/register failure has no cleanup request for `avatars`; original error is collapsed to generic notice | FAIL/RISK |
| Pet create/edit form | `NativeSetPetScreen.tsx:631-653,1159-1255`; `NativeSetPetScreen.tsx:200-223,263-274` | form fields map to `pets` columns: `name`, `species`, `breed`, `gender`, `neutered_spayed`, `dob`, `weight`, `weight_unit`, `bio`, `routine`, `clinic_name`, `preferred_vet`, `phone_no`, `vet_contact`, `microchip_id`, `temperament`, `vet_visit_records`, `set_reminder`, `medications`, `is_active`, `is_public`, `photo_url` | saved id set, photo URI updated, draft/onboarding navigation handled | registration/save cleanup calls unsupported `pets`; Brevo failure is intentionally swallowed; raw pet save error partly preserved except weight special case | FAIL/RISK |
| Edit profile save/draft/photo form | `NativeEditProfileScreen.tsx:1010-1105`; `nativeProfilePhotos.ts:386-443`; `nativeMediaAssets.ts:15-22` | payload built by `buildProfilePayload`; photos -> `profiles.photos`, `avatar_url`, `social_album`; profile photos bucket `profile_photos` | profile row/cache updated; draft messages set | queued deletes use `Promise.allSettled` and do not fail the save; legacy `Profiles` cleanup mismatches cleanup whitelist canonicalization | RISK |
| Service request/detail actions | `NativeServiceScreen.tsx:453-570`; `nativeService.ts:627-669` | bookmark -> `p_provider_user_id`; service chat -> `p_provider_user_id`; analytics -> `p_event/p_payload`; view -> `p_provider_user_id` | providers/detail state updated or route opens service chat | caller controls are still grouped and original RPC error is mapped to broad Alert categories | RISK/UNVERIFIED |
| Verify Identity forms | `NativeVerifyIdentityScreen.tsx`; `nativeVerifyIdentity.ts:366,664` | phone OTP, card SetupIntent/3DS/status reconcile, human liveness, device/evidence upload are not expanded to exact args/columns in this audit | status cards update in screen | stage/original error preservation not line-by-line proven | UNVERIFIED |

### Room/Chat/Group Creation Gate

| Creation path | Caller | Backend function/RPC | Token path | Static result |
|---|---|---|---|---|
| Direct chat from dialogue route fallback | `NativeChatDialogueScreen.tsx:796,811` | `ensureNativeDirectChatRoom` -> `ensure_direct_chat_room` | `accessToken`, `actorId` required; missing actor throws | RISK because route fallback branches are not all individually expanded |
| Direct chat from inbox row navigation | `NativeChatsScreen.tsx:2568` | `resolveNativeChatInboxRowNavigation` caller passes `ensureNativeDirectChatRoom` | `accessToken`, `actorId` passed | RISK because exact row variants are grouped |
| Direct chat from discover/profile wave/star | `NativeChatsScreen.tsx:3049,3198,3266`; `nativePublicProfile.ts:431-463` | `ensure_direct_chat_room` or `send_star_chat_atomic` | exact-token | RISK because notification failure after star chat is logged and not rolled back |
| Service chat | `NativeServiceScreen.tsx:546`; `nativeService.ts:654-669` | `create_native_service_chat` | exact-token required | RISK because detail/card caller controls are grouped |
| Group create | `NativeChatsScreen.tsx:2911`; `nativeChat.ts:1186-1247` | group create RPC/helper chain | exact-token | FAIL/RISK because cover cleanup can fail against unsupported `avatars` |
| Group invite/join/accept/decline | `NativeChatsScreen.tsx:3715,3731,3743`; `nativeChat.ts:1186-1370` | group invite/join/remove RPCs | exact-token | RISK because all invite/member controls are grouped and failure stage is generic |

### Media Bucket Static Match Gate

| Feature | Upload/register bucket | Cleanup bucket sent by app | Backend cleanup accepts? | Static result |
|---|---|---|---|---|
| Social composer images | `notices` | `notices` | YES | RISK due best-effort cleanup/error hiding |
| Social legacy album | `social_album` | `social_album` | YES | RISK until active use/delete refs are line-by-line proven |
| Broadcast/alert images | `alerts`/`notices` depending helper | `alerts`/`notices` | YES if helper sends canonical bucket | RISK until each alert edit/delete media branch is expanded |
| Profile photos | `profile_photos` | `profile_photos` | YES | RISK because queued delete failures are all-settled and do not fail save |
| Legacy profile photos | `Profiles` | `Profiles` | NO: backend lowercases to `profiles`, but owner path check expects `${uid}/...` and legacy path handling is not source-proven | FAIL/RISK |
| Pet photos | `pets` | `pets` | NO | FAIL/RISK |
| Group covers/avatars | `avatars` | `avatars` | NO | FAIL/RISK |
| Chat attachments | `chat_attachments` | `chat_attachments` | YES | RISK because send failure after upload/register does not prove orphan cleanup |
| Identity verification | `identity_verification` | not fully expanded | NO in cleanup whitelist | UNVERIFIED/FAIL if cleanup is expected |
| Identity verification evidence | `identity_verification_evidence` | not fully expanded | NO in cleanup whitelist | UNVERIFIED/FAIL if cleanup is expected |

### Failure Preservation Gate

| Flow | Current failure behavior | Static status |
|---|---|---|
| Pet save after upload | queues unsupported `pets` cleanup, logs cleanup failure, surfaces raw save error or generic weight message | FAIL/RISK |
| Group create/edit cover | queues unsupported `avatars` cleanup, logs cleanup failure, generic user status | FAIL/RISK |
| Chat send with attachments | restores text/uploads/preview but hides original upload/register/send error and does not prove orphan cleanup after send failure | RISK |
| Chat attachment delete | cleanup RPC first, then DB content update; if DB update fails after cleanup request, media may be queued for delete while message still references it | FAIL/RISK |
| Profile photo delete queue | `Promise.allSettled` hides failed cleanup; save can succeed while old media remains | RISK |
| Social composer image cleanup | cleanup catch swallows original cleanup error; user gets generic banner | RISK |
| Service bookmark/request | rollback exists for bookmark; request maps backend details to broad alerts | RISK |
| Verify Identity | failure-stage preservation not expanded | UNVERIFIED |

## 31. EXACT BACKEND-IMPACT CONTROL LEDGER

This ledger is the current one-by-one static audit for controls that can create, edit, delete, upload, join, invite, send, report, share, block, toggle protected state, or call backend/storage. Pure local navigation, close/back, dropdown-open, text entry, lightbox, local tab, local select, and non-mutating preview controls are classified as `LOCAL/NAV` unless they trigger a protected helper later. Shared token path for protected native screens is RootNavigator `session.access_token` -> screen `accessToken` prop -> helper argument -> `nativeExactTokenRpc`/REST/storage bearer header.

| Surface | Exact control | File/line | Handler | Backend/storage chain | Shared token path | Static status |
|---|---|---:|---|---|---|---|
| Profile Summary | Discovery privacy toggle | `NativeProfileSummaryScreen.tsx:590` | `persistPrivacy("discovery")` | PATCH `profiles.non_social` | YES | RISK - direct owner REST RLS proof needed |
| Profile Summary | Map privacy toggle | `NativeProfileSummaryScreen.tsx:599` | `persistPrivacy("map-privacy")` | PATCH `profiles.hide_from_map` | YES | RISK - direct owner REST RLS proof needed |
| Profile Summary | Push preference toggle | `NativeProfileSummaryScreen.tsx:613` | `handlePushToggle` | push token registration, `profiles.fcm_token`, `notification_preferences` | YES | RISK - direct REST/RLS and device token branch proof partial |
| Profile Summary | Logout confirm | `NativeProfileSummaryScreen.tsx:652,809` | confirm modal `onConfirm` | Supabase signOut callback | session | RISK - local/session cleanup branch only partially audited |
| Profile Summary | Delete account confirm | `NativeProfileSummaryScreen.tsx:682,860` | `submitDeleteAccount` | Edge function `delete-account` | session from `getSession` | RISK - function outcome/delete cascade proof partial |
| Edit Profile | Retry load | `NativeEditProfileScreen.tsx:1394` | `loadProfile` | profile/pet REST and refresh helpers | YES | RISK - direct REST/RLS proof partial |
| Edit Profile | Header save | `NativeEditProfileScreen.tsx:1415-1417` | `saveProfile` | exact-token REST `profiles`, `pets`, refresh RPCs | YES | RISK - field matrix partial, delete cleanup all-settled |
| Edit Profile | Preview tab | `NativeEditProfileScreen.tsx:1433` | `silentSaveDraftForPreview` | exact-token REST profile save | YES | RISK - save failure can block preview, field proof partial |
| Edit Profile | Footer save | `NativeEditProfileScreen.tsx:1536` | `saveProfile` | exact-token REST `profiles`, `pets`, refresh RPCs | YES | RISK - same as header save |
| Edit Profile | Save draft | `NativeEditProfileScreen.tsx:1539` | `saveDraft` | AsyncStorage + exact-token profile upsert in edit mode | YES in edit mode | RISK - backend branch shares profile risks |
| Edit Profile | Profile photo pick/upload | `NativeProfilePhotoSlot.tsx:191-220` | `handlePickAndUpload` | storage `profile_photos`, `register_native_media_asset`, `profiles` photo refs on save | YES | PASS/RISK - temp harness verified upload/register/DB refs/cleanup; legacy `Profiles` delete remains failed |
| Edit Profile | Profile photo remove | `NativeProfilePhotoSlot.tsx:224-228,307-312` | `onRemoved` -> save later | clears draft photo ref; cleanup via `deleteNativeProfilePhotoPath` after save | YES later | RISK - delete cleanup uses all-settled and legacy `Profiles` mismatch |
| Pet Profile | Header save | `NativeSetPetScreen.tsx:1402-1404` | `savePet(onboardingMode)` | upload `pets`, register media, REST `pets`, profile onboarding, Brevo | YES | FAIL/RISK - `pets` cleanup rejected on failure |
| Pet Profile | Photo picker | `NativeSetPetScreen.tsx:1453` | `pickPhoto`; upload during `savePet` | upload `pets/{userId}/{petId}.{ext}`, register media | YES on save | FAIL/RISK - `pets` cleanup rejected |
| Pet Profile | Species chip | `NativeSetPetScreen.tsx:1491` | `updateForm` | local field -> `pets.species` on save | YES on save | RISK - depends on failing save chain |
| Pet Profile | Breed select | `NativeSetPetScreen.tsx:1518` | local select -> `updateForm` | local field -> `pets.breed` on save | YES on save | RISK |
| Pet Profile | Gender chip | `NativeSetPetScreen.tsx:1539` | `updateForm({ gender })` | local field -> `pets.gender` on save | YES on save | RISK |
| Pet Profile | Neutered/spayed toggle | `NativeSetPetScreen.tsx:1543` | `updateForm` | local field -> `pets.neutered_spayed` on save | YES on save | RISK |
| Pet Profile | Weight/unit/select controls | `NativeSetPetScreen.tsx:1611` | `updateForm` | local field -> `pets.weight`, `pets.weight_unit` on save | YES on save | RISK |
| Pet Profile | Temperament select | `NativeSetPetScreen.tsx:1646` | `updateForm` | local field -> `pets.temperament` on save | YES on save | RISK |
| Pet Profile | Add vet visit | `NativeSetPetScreen.tsx:1710-1711` | opens visit draft | local draft -> `pets.vet_visit_records` on save | YES on save | RISK |
| Pet Profile | Remove vet visit | `NativeSetPetScreen.tsx:1737` | `updateForm` | removes local row -> `pets.vet_visit_records` on save | YES on save | RISK |
| Pet Profile | Save vet visit | `NativeSetPetScreen.tsx:1801` | `saveVisit` | local row -> `pets.vet_visit_records` on save | YES on save | RISK |
| Pet Profile | Set reminder | `NativeSetPetScreen.tsx:1813-1814` | opens reminder draft | local row -> `pets.set_reminder` on save | YES on save | RISK |
| Pet Profile | Remove reminder | `NativeSetPetScreen.tsx:1840` | `updateForm` | removes local row -> `pets.set_reminder` on save | YES on save | RISK |
| Pet Profile | Save reminder | `NativeSetPetScreen.tsx:1881` | `saveReminder` | local row -> `pets.set_reminder` on save | YES on save | RISK |
| Pet Profile | Add medication | `NativeSetPetScreen.tsx:1893-1894` | opens medication draft | local row -> `pets.medications` on save | YES on save | RISK |
| Pet Profile | Remove medication | `NativeSetPetScreen.tsx:1925` | `updateForm` | removes local row -> `pets.medications` on save | YES on save | RISK |
| Pet Profile | Save medication | `NativeSetPetScreen.tsx:1995` | `saveMedication` | local row -> `pets.medications` on save | YES on save | RISK |
| Pet Profile | Active toggle | `NativeSetPetScreen.tsx:2010` | `updateForm` | local field -> `pets.is_active` on save | YES on save | RISK |
| Pet Profile | Public toggle | `NativeSetPetScreen.tsx:2017` | `updateForm` | local field -> `pets.is_public` on save | YES on save | RISK |
| Pet Profile | Footer save | `NativeSetPetScreen.tsx:2027` | `savePet(false)` | upload/register/REST save chain | YES | FAIL/RISK - `pets` cleanup rejected |
| Pet Profile | Draft save | `NativeSetPetScreen.tsx:2030` | `savePet(true)` | upload/register/REST save chain | YES | FAIL/RISK - `pets` cleanup rejected |
| Public Profile | Wave | `NativePublicProfileModal.tsx:205-207` | `onWave` -> `sendNativePublicProfileWave` | exact-token wave/relationship RPCs | YES | RISK - returns failed reason; caller coverage partial |
| Public Profile | Open star confirm | `NativePublicProfileModal.tsx:214-216` | local confirm | backend on confirm | YES on confirm | LOCAL/NAV until confirm |
| Public Profile | Confirm star | `NativePublicProfileModal.tsx:265` | `handleStar` | quota RPC, `send_star_chat_atomic`, `enqueue_notification` | YES | RISK - notification failure after chat success not rolled back |
| Public Profile | Open block confirm | `NativePublicProfileModal.tsx:223-225` | local confirm | backend on confirm | YES on confirm | LOCAL/NAV until confirm |
| Public Profile | Confirm block | `NativePublicProfileModal.tsx:276` | `handleBlock` | `block_user` exact-token RPC | YES | RISK - grant/source-contract proof partial |
| Settings Drawer | Family invite search result | `NativeSettingsDrawer.tsx:635-652,792-821` | `sendInvite` | `create_native_family_invite` exact-token RPC | YES | RISK - grant/failure-stage proof partial |
| Settings Drawer | Family member/invite actions | `NativeSettingsDrawer.tsx:654-697` | `runAction`, `quitFamily` | family accept/decline/cancel/remove/leave RPCs | YES | RISK - controls grouped inside drawer rows |
| Notifications | Notification row tap | `NativeNotificationsPanel.tsx:132` | inline mark/navigate | PATCH `notifications` read and route handling | YES | RISK - direct owner REST/RLS and route variants partial |
| Social Feed | Retry load | `NativeSocialScreen.tsx:1923` | `load("reset")` | `get_social_feed` exact-token RPC | YES | RISK - cache/error proof partial |
| Social Feed | Compose FAB | `NativeSocialScreen.tsx:1976` | opens composer or restriction | backend on composer submit | YES on submit | LOCAL/NAV until submit |
| Social Composer | Select category | `NativeSocialScreen.tsx:2652,2663` | local category state | `category` -> thread create/update arg on submit | YES on submit | RISK - field mapping proven, submit chain risk |
| Social Composer | Remove media | `NativeSocialScreen.tsx:2744` | local media removal | removed queued media not uploaded | n/a | PASS local before upload |
| Social Composer | Sensitive checkbox | `NativeSocialScreen.tsx:2751` | local `isSensitive` | `isSensitive` -> thread create/update arg on submit | YES on submit | RISK - submit chain risk |
| Social Composer | Add media | `NativeSocialScreen.tsx:2759` | `pickMedia` | local selected media -> `uploadNativeSocialImage` on submit | YES on submit | RISK - upload cleanup best-effort |
| Social Composer | Submit post | `NativeSocialScreen.tsx:2762`; handler `1127-1214` | `submitComposer` | upload `notices`, create/update thread RPC, mentions/notifications | YES | RISK - cleanup/original error hidden |
| Social Comments | Submit reply | `NativeSocialScreen.tsx:2345`; handler `submitReply` | exact-token comment RPC + optional media upload | `thread_comments`, `notices` | YES | RISK - media cleanup/error stage partial |
| Social Comments | Pick reply media | `NativeSocialScreen.tsx:2341` | reply media picker | upload `notices` on reply submit | YES on submit | RISK |
| Social Comments | Remove reply image | `NativeSocialScreen.tsx:2355` | local remove queued image | none if not uploaded | n/a | PASS local before upload |
| Social Comments | Reload replies | `NativeSocialScreen.tsx:2373` | comments reload | `get_native_social_comments` | YES | RISK - cache/order partial |
| Social Comments | Load older replies | `NativeSocialScreen.tsx:2380` | comments pagination | `get_native_social_comments` | YES | RISK |
| Social Comments | Reply to comment | `NativeSocialScreen.tsx:2461` | local reply target | backend on submit | YES on submit | LOCAL/NAV until submit |
| Social Comments | Like comment | `NativeSocialScreen.tsx:2465` | `onLikeComment` | exact-token social comment support RPC | YES | RISK - branch proof partial |
| Social More | Delete thread confirm | `NativeSocialScreen.tsx:2001` | `executeDeleteThread` | exact-token delete thread RPC + media cleanup | YES | RISK - cleanup failure/original error partial |
| Social More | Block thread author confirm | `NativeSocialScreen.tsx:2009` | `executeBlockThreadAuthor` | exact-token block RPC | YES | RISK |
| Social More | Block comment author confirm | `NativeSocialScreen.tsx:2017` | `executeBlockCommentAuthor` | exact-token block RPC | YES | RISK |
| Social Report | Category checkbox | `NativeSocialReportModal.tsx:180` | local category set | report categories on submit | YES on submit | RISK |
| Social Report | Add image | `NativeSocialReportModal.tsx:200` | `pickImages` | report media -> `uploadNativeSocialImage(..., "report")` on submit | YES on submit | RISK |
| Social Report | Submit report | `NativeSocialReportModal.tsx:203`; handler `submit` | upload report images + report RPC | `notices`, report RPC | YES | RISK - cleanup/error stage partial |
| Social Share | Select target | `NativeSocialScreen.tsx:2950` | local target key | target used by share-to-chat | YES on send | LOCAL/NAV until send |
| Social Share | Share to chat | `NativeSocialScreen.tsx:2963` | `shareToChat` | exact-token chat share/send RPC | YES | RISK - target variants partial |
| Social Share | Native share | `NativeSocialScreen.tsx:2967` | `onNativeShare` | OS share + possible share count | YES if count helper used | RISK |
| Broadcast Modal | Pick/add media | `NativeBroadcastModal.tsx:214,645` | `pickMedia`/upload helper | upload `alerts`, register media | YES | RISK - cleanup best-effort |
| Broadcast Modal | Remove media | `NativeBroadcastModal.tsx` media remove controls | local remove or cleanup later | `alerts` cleanup if uploaded and removed | YES | RISK - exact row variants partial |
| Broadcast Modal | Sensitive toggle | `NativeBroadcastModal.tsx` | local `isSensitive` | alert create arg on submit | YES on create | RISK |
| Broadcast Modal | Create alert | `NativeBroadcastModal.tsx:333,648-652` | `handleCreate` | `create_alert_thread_and_pin`, media refs | YES | RISK - cleanup/stage proof partial |
| Alert Detail | Reveal sensitive | `NativeAlertDetailModal.tsx:643` | `revealSensitive` | local reveal only | n/a | PASS local |
| Alert Detail | Open creator profile | `NativeAlertDetailModal.tsx:655-658` | `onOpenProfile` | public profile modal load | YES in modal | RISK - downstream modal chain partial |
| Alert Detail | Edit alert button | `NativeAlertDetailModal.tsx:686` | local edit mode | backend on save | YES on save | LOCAL/NAV until save |
| Alert Detail | Delete alert confirm | `NativeAlertDetailModal.tsx:689,750` | `handleDelete` | exact-token delete alert RPC + cleanup | YES | RISK - cleanup best-effort |
| Alert Detail | Support | `NativeAlertDetailModal.tsx:715` | `handleSupport` | exact-token alert interaction RPC | YES | RISK - refresh/failure partial |
| Alert Detail | Open share sheet | `NativeAlertDetailModal.tsx:719` | local share modal | backend on share/send | YES on send | LOCAL/NAV until send |
| Alert Detail | Confirm block | `NativeAlertDetailModal.tsx:760` | `confirmBlockUser` | exact-token block RPC | YES | RISK |
| Alert Detail | Report submit success | `NativeAlertDetailModal.tsx:769` | report modal callback | report RPC in child modal | YES | RISK |
| Alert Detail | Select share target | `NativeAlertDetailModal.tsx:817` | local share target key | target used by share-to-chat | YES on send | LOCAL/NAV until send |
| Alert Detail | Share to chat | `NativeAlertDetailModal.tsx:833` | `handleShareToChat` | exact-token share target/message/share count | YES | RISK |
| Alert Detail | Native share | `NativeAlertDetailModal.tsx:837` | `handleNativeShare` | OS share + share count helper | YES for count | RISK |
| Alert Detail | Remove edit image | `NativeAlertDetailModal.tsx:909-911` | local remove | removed images cleaned on save | YES on save | RISK - cleanup best-effort |
| Alert Detail | Sensitive edit toggle | `NativeAlertDetailModal.tsx:924` | local edit state | alert update arg on save | YES on save | RISK |
| Alert Detail | Add edit image | `NativeAlertDetailModal.tsx:939` | `pickEditMedia` | upload `alerts` on save/update | YES | RISK |
| Alert Detail | Save edit | `NativeAlertDetailModal.tsx:942`; handler `499-548` | `handleSaveEdit` | exact-token update RPC + media cleanup | YES | RISK - cleanup/stage partial |
| Chat Dialogue | Remove link preview | `NativeChatDialogueScreen.tsx:1343` | local preview clear | message content excludes preview on send | YES on send | LOCAL/NAV until send |
| Chat Dialogue | Retry/open attachment | `NativeChatDialogueScreen.tsx:1449-1453` | retry signed URL/open preview | signed URL helper/cache | YES where signed URL required | RISK |
| Chat Dialogue | Delete attachment | `NativeChatDialogueScreen.tsx:1457`; handler `1267-1305` | `deleteAttachment` | cleanup `chat_attachments`, then update message content RPC | YES | FAIL/RISK - cleanup can precede failed DB ref update |
| Chat Dialogue | Add media | `NativeChatDialogueScreen.tsx:1588` | `pickMedia` | queued upload -> `chat_attachments` on send | YES on send | RISK |
| Chat Dialogue | Remove queued upload | `NativeChatDialogueScreen.tsx:1578` | local remove | no upload if queued | n/a | PASS local before upload |
| Chat Dialogue | Send message | `NativeChatDialogueScreen.tsx:1591`; handler `962-1010` | `submitMessage` | upload/register `chat_attachments`, `send_native_chat_message` | YES | RISK - send failure after upload has orphan risk |
| Chat Dialogue | Toggle block confirm | `NativeChatDialogueScreen.tsx:1815` | `toggleBlock` | exact-token `block_user`/`unblock_user` | YES | RISK |
| Chat Dialogue | Block group member confirm | `NativeChatDialogueScreen.tsx:1816` | `blockGroupMember` | exact-token block RPC | YES | RISK |
| Chat Dialogue | Unmatch confirm | `NativeChatDialogueScreen.tsx:1817` | `unmatch` | exact-token unmatch/remove RPC | YES | RISK |
| Chat Dialogue | Leave group confirm | `NativeChatDialogueScreen.tsx:1818` | `leaveGroup` | sends leave message, removes member RPC | YES | RISK - two-step failure can leave message/member mismatch |
| Chat Dialogue | Remove group confirm | `NativeChatDialogueScreen.tsx:1819` | `removeGroup` | exact-token `remove_group_chat` RPC | YES | RISK - media cleanup not proven |
| Chat Dialogue | Change group avatar | `NativeChatDialogueScreen.tsx:1622,1650,1674` | `updateGroupAvatar` | upload/register `avatars`, update metadata | YES | FAIL - registration rejects `groups/` path and cleanup for `avatars` is unsupported |
| Chat Dialogue | Save group name | `NativeChatDialogueScreen.tsx:1644`; handler `1098` | `saveGroupName` | `update_group_chat_metadata` | YES | RISK - generic failure |
| Chat Dialogue | Save group description | `NativeChatDialogueScreen.tsx:1683`; handler `1129` | `saveGroupDescription` | `update_group_chat_metadata` | YES | RISK - generic failure |
| Chat Dialogue | Invite users open | `NativeChatDialogueScreen.tsx:1694,1738` | load manage data | group management snapshot RPC | YES | RISK |
| Chat Dialogue | Invite member | `NativeChatDialogueScreen.tsx:1784`; handler `inviteGroupMember` | invite member RPC | `invite_native_group_members` | YES | RISK |
| Chat Dialogue | Remove member | `NativeChatDialogueScreen.tsx:1807`; handler `removeGroupMember` | remove member RPC | `remove_group_member` | YES | RISK |
| Chats Discover | Star button | `NativeChatsScreen.tsx:1224` | `onStar` -> confirm/star handler | quota/star/direct chat RPCs | YES | RISK - notification branch partial |
| Chats Discover | Wave button | `NativeChatsScreen.tsx:1227` | `onWave` | wave/direct chat RPCs | YES | RISK |
| Chats Discover | Pass button | `NativeChatsScreen.tsx:1230` | `onPass` | seen/pass RPC/cache | YES | RISK |
| Chats Discover | Profile tap | `NativeChatsScreen.tsx:1258` | open profile | public profile snapshot RPC | YES | RISK |
| Chats Inbox | Swipe delete reveal | `NativeChatsScreen.tsx:1369-1374` | local reveal | backend only on delete button | YES on delete | LOCAL/NAV until delete |
| Chats Inbox | Remove conversation | `NativeChatsScreen.tsx:1384` | row `onDelete` | remove conversation/unmatch RPC | YES | RISK |
| Chats Inbox | Open row | `NativeChatsScreen.tsx:1389` | row `onPress` | room navigation/read snapshot | YES | RISK |
| Chats Inbox | Open group details avatar | `NativeChatsScreen.tsx:1433` | `onOpenDetails` | group management/detail RPCs | YES | RISK |
| Chats Groups | Create group submit | `NativeChatsScreen.tsx:2911-2952` | create group handler | create group RPC, optional `avatars` upload/register/update | YES | FAIL - group cover registration rejects `groups/` path; cleanup rejects `avatars` |
| Chats Groups | Edit group metadata save | `NativeChatsScreen.tsx:3381-3434` | group edit save | update metadata RPC, optional `avatars` upload/register | YES | FAIL - edited group cover registration rejects `groups/` path; cleanup rejects `avatars` |
| Chats Groups | Leave group | `NativeChatsScreen.tsx:3715` | `removeNativeGroupMember` | group member RPC | YES | RISK |
| Chats Groups | Remove member | `NativeChatsScreen.tsx:3731` | `removeNativeGroupMember` | group member RPC | YES | RISK |
| Chats Groups | Remove group | `NativeChatsScreen.tsx:3743` | `removeNativeGroupChat` | group remove RPC | YES | RISK - media cleanup not proven |
| Service Cards | Bookmark | `NativeServiceScreen.tsx:453-480` | `handleBookmark` | `toggle_native_service_bookmark` | YES | RISK - rollback exists, grant/source proof partial |
| Service Cards | Open provider detail | `NativeServiceScreen.tsx:489-527` | `openProvider` | detail RPC, analytics/view RPCs | YES | RISK - analytics errors swallowed |
| Service Detail | Request service/chat | `NativeServiceScreen.tsx:528-570` | `requestService` | restriction state, `create_native_service_chat` | YES | RISK - error mapped to broad alerts |
| Verify Identity | Blocked identity Help & Support | `NativeVerifyIdentityScreen.tsx:1473` | `openBlockedSupportPath` | support route/intent, no DB mutation in this control | n/a | LOCAL/NAV |
| Verify Identity | Phone card header toggle | `NativeVerifyIdentityScreen.tsx:1487-1490`; `1660-1667` | `refreshAll("manual")`, `setActiveCard("phone")` | snapshot/profile refresh via verify helpers | session helper | RISK - refresh helper uses session internally, exact token not prop-passed |
| Verify Identity | Phone send OTP | `NativeVerifyIdentityScreen.tsx:1505`; `1756-1762`; handler `570-577` | `sendOtp(false)` | `sendNativeVerifyIdentityPhoneOtp` -> `send-phone-otp` function with phone, device id, Turnstile token | phone helper session/function | RISK - helper preserves error state but exact function response/columns not fully source-contract proven |
| Verify Identity | Phone resend OTP | `NativeVerifyIdentityScreen.tsx:1505`; `1756-1762`; handler `570-577` | `sendOtp(true)` | `resendNativeVerifyIdentityPhoneOtp` -> `send-phone-otp` function | phone helper session/function | RISK - cooldown/error branch is model-driven, function proof partial |
| Verify Identity | Phone verification code input | `NativeVerifyIdentityScreen.tsx:1507`; `1776-1785` | `setOtpCode` | local code -> verify function on submit | n/a until submit | LOCAL/NAV until verify |
| Verify Identity | Phone verify code | `NativeVerifyIdentityScreen.tsx:1510`; `1787`; handler `579-585` | `verifyOtp` | `verifyNativeVerifyIdentityPhoneOtpCode` -> `verify-phone-otp` function/status refresh | phone helper session/function | RISK - wrong/correct branch modeled, backend status column proof partial |
| Verify Identity | Human card header toggle | `NativeVerifyIdentityScreen.tsx:1523-1526`; `1660-1667` | `refreshAll("manual")`, `setActiveCard("human")` | snapshot/profile refresh | session helper | RISK |
| Verify Identity | Human open settings for camera denied | `NativeVerifyIdentityScreen.tsx:1551`; `2033`; handler prop `onOpenSettings` | `Linking.openSettings()` | no backend mutation | n/a | LOCAL/NAV |
| Verify Identity | Human start face check | `NativeVerifyIdentityScreen.tsx:1552`; `2033`; handler `696-751` | `startHuman` | `startNativeVerifyIdentityHumanModel` -> `verify-human-challenge` action start | session helper | RISK - session helper exact token internal; function response proof partial |
| Verify Identity | Human begin check/capture | `NativeVerifyIdentityScreen.tsx:1552`; `2033`; handler `755-789` | `beginHumanCapture` | starts detector capture; backend only after detector finishes | session helper later | RISK - detector-driven path not one visible submit button |
| Verify Identity | Human detector center/left/right submit | `NativeVerifyIdentityScreen.tsx:1536-1552`; handlers `881-1013` | `handleDetectedFaces` -> complete model | `completeNativeVerifyIdentityHumanModel` -> `verify-human-challenge` action complete with attempt id, challenge, result, evidencePath null | session helper | RISK - static chain found, but not a direct button and failure stage collapses connection timeout |
| Verify Identity | Card header toggle | `NativeVerifyIdentityScreen.tsx:1565-1568`; `1660-1667` | `refreshAll("manual")`, `setActiveCard("card")` | snapshot/profile refresh | session helper | RISK |
| Verify Identity | Card legal name field | `NativeVerifyIdentityScreen.tsx:1580-1585`; `2143-2161` | `legal_name_changed` reducer | legalName -> `createNativeCardSetupIntent` payload | session helper on Add Card | RISK - field maps only on setup intent |
| Verify Identity | Card postal code field | `NativeVerifyIdentityScreen.tsx:1586-1591`; `2176-2183` | `postal_code_changed` reducer | postalCode -> card state; not sent in current setup payload except model state | n/a unless helper uses state | RISK - field/arg mapping not fully proven |
| Verify Identity | Stripe CardField complete | `NativeVerifyIdentityScreen.tsx:1592-1596`; `2184-2197` | `card_complete_changed`, `mark...Ready` | Stripe native field -> `confirmSetupIntent` on submit | Stripe SDK | RISK - native SDK boundary external |
| Verify Identity | Add Card / Try Different Card | `NativeVerifyIdentityScreen.tsx:1597`; `2163-2168`; handler `588-620` | `prepareCard` | `createNativeCardSetupIntent` -> `create-identity-setup-intent` function | session helper | RISK - exact helper token internal, setup response proof partial |
| Verify Identity | Verify Card | `NativeVerifyIdentityScreen.tsx:1598`; `2204`; handler `791-854` | `submitCard` | `confirmSetupIntent` Stripe SDK, then status reconcile | Stripe SDK + session helper | RISK - 3DS/cancel/success branches modeled but not line-separated by visible controls |
| Verify Identity | Check Status | `NativeVerifyIdentityScreen.tsx:1599`; `2205`; handler `622-646` | `checkCard` | `getNativeCardStatus` via verify identity helper/function | session helper | RISK |
| Verify Identity | Card Help & Support | `NativeVerifyIdentityScreen.tsx:1600`; `2215` | `openBlockedSupportPath` | support route/intent | n/a | LOCAL/NAV |
| Verify Identity | Continue footer | `NativeVerifyIdentityScreen.tsx:1648` | `onNavigate("/set-profile")` | route navigation only | n/a | LOCAL/NAV |

## 32. TESTED RESPONSE LEDGER

This is the tested-response gate. It supersedes any older wording that could imply a row was verified from static inspection alone.

| Row class | Test type required | Current evidence | Tested response status | Audit status |
|---|---|---|---|---|
| Local/navigation-only controls | Source inspection of local state/navigation target | exact file/line and handler rows in Section 31 | SOURCE-INSPECTED ONLY | NOT BACKEND-VERIFIED |
| Exact-token RPC helpers | Harness or live call proving missing-token, success, RPC error, 401/403 branches | grep/source chain; typecheck | NOT EXECUTED PER ROW | NOT VERIFIED |
| Direct REST owner-table writes | Live/sandbox call proving owner success, non-owner denied, missing-token denied, RLS error surfaced | source chain only | NOT EXECUTED PER ROW | NOT VERIFIED |
| Storage uploads | Live/sandbox upload proving bucket, path, owner/member policy, registration, cleanup on failure | source chain found | NOT EXECUTED PER ROW | NOT VERIFIED |
| Storage cleanup | Live/sandbox call or source-contract harness proving accepted bucket and queued row | source proves `pets`, `avatars`, `Profiles` mismatch | STATIC FAIL PROVEN FOR MISMATCH; no success-row execution | FAIL/NOT VERIFIED |
| Pet save/photo | Live/sandbox save with upload/register/REST success and forced failures for upload/register/save/cleanup | source chain; mismatch proof | NOT EXECUTED PER ROW | FAIL/RISK |
| Group create/edit/avatar | Live/sandbox create/edit with cover upload/register/metadata success and forced cleanup failure | source chain; mismatch proof | NOT EXECUTED PER ROW | FAIL/RISK |
| Chat send attachment | Harness/live send with upload/register/send success and forced send failure after upload | source chain only | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |
| Chat attachment delete | Harness/live delete proving DB ref update and cleanup ordering under failure | source proves cleanup-before-DB-update risk | NOT EXECUTED PER ROW | FAIL/RISK |
| Social composer/comment/report/share | Harness/live create/edit/delete/comment/report/share with upload cleanup failures | source chain only | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |
| Public profile wave/star/block | Harness/live exact-token calls and notification failure branch | source chain only | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |
| Service bookmark/detail/request chat | Harness/live bookmark rollback, detail load, service chat success/error branches | source chain only | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |
| Verify Identity phone OTP | Sandbox send/resend/wrong/correct OTP response capture | exact control/helper chain in Section 31 | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |
| Verify Identity card/3DS/status | Stripe test SetupIntent, confirm success, 3DS required/cancelled, backend reconcile response capture | exact control/helper chain in Section 31 | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |
| Verify Identity human/device/evidence | Harness/device-backed challenge start/complete/device evidence response capture | exact control/helper chain in Section 31 | NOT EXECUTED PER ROW | RISK/NOT VERIFIED |

## 32A. REMOTE DB/RLS/STORAGE PROOF RESULTS

Linked remote proof was rerun on 2026-05-14 with `SUPABASE_DB_PASSWORD` from `Backend.env.md`. These are read-only checks only.

| Gate | Remote proof result | Status |
|---|---|---|
| Migration sync | `supabase migration list` shows local and remote synced through `20260513233500`. | PASS |
| Required storage buckets | Remote `storage.buckets` contains `alerts`, `avatars`, `chat_attachments`, `identity_verification`, `identity_verification_evidence`, `notices`, `pets`, `profile_photos`, `Profiles`, `social_album`, `verification`. | PASS/RISK |
| Bucket public/private mode | `alerts`, `avatars`, `notices`, `pets`, `profile_photos` are public; `chat_attachments`, `identity_verification`, `identity_verification_evidence`, `Profiles`, `social_album`, `verification` are private. | PASS/RISK |
| Storage policies for `pets` | Remote policy permits public read and owner-folder insert/update/delete where first path segment equals `auth.uid()`. App path `userId/petId.ext` matches this. | PASS for policy shape |
| Storage policies for `avatars/groups` | Remote group policies permit insert/update/delete only when first path segment is `groups` and `can_write_native_group_avatar(name)` is true. App group path `groups/{roomId}/{userId}-{ts}.jpg` matches the policy family. | PASS/RISK |
| Storage policies for `chat_attachments` | Remote policies permit owner/member room insert/select/update/delete for `chat_attachments`, including room membership checks. | PASS/RISK |
| Storage policies for identity buckets | Remote policies exist for owner path and service role/admin access on `identity_verification` and owner/service role on `identity_verification_evidence`. | PASS/RISK |
| `request_storage_cleanup` body | Remote function lowercases bucket and accepts only `notices`, `social_album`, `alerts`, `chat_attachments`, `profile_photos`, `profiles`. | FAIL for `pets`, `avatars`, `Profiles` callers |
| `process_storage_cleanup_queue` body | Remote function is service-role gated, deletes from `storage.objects`, marks queue row processed, and marks matching `media_assets.deleted_at`. | PASS/RISK |
| `register_native_media_asset` body | Remote function accepts `alerts`, `avatars`, `chat_attachments`, `notices`, `pets`, `profile_photos`, `profiles`, `social_album` and requires object path prefix `auth.uid()/`. | FAIL/RISK for group avatar paths beginning `groups/` unless caller uses a different registration path or service role; `Profiles` canonicalization remains risky. |
| Selected table columns | Remote `information_schema.columns` confirms current selected columns for `profiles`, `pets`, `notifications`, `notification_preferences`, `push_tokens`, `threads`, `thread_comments`, `chat_messages`, `chat_room_members`, `media_assets`, `storage_cleanup_queue`, `pet_care_profiles`. | PASS/RISK |
| Identity table columns | Query for `identity_verifications`, `identity_verification_evidence`, `verification_events`, `phone_verification_challenges`, `device_fingerprints` returned no rows for those table names. Current native identity helpers mostly reconcile through `profiles` and edge functions, so DB table naming remains source-contract risk. | RISK/UNVERIFIED |
| Function grants/shapes | Remote selected functions are `SECURITY DEFINER`. Most selected functions grant execute to `authenticated,service_role`. | PASS/RISK |
| Broad anon function grants | Remote grants include `anon` on `get_chat_inbox_summaries`, `search_chat_inbox`, `remove_group_chat`, `remove_group_member`, and all visible overloads of `update_group_chat_metadata`. | RISK/FAIL until intentionally justified |

Remote proof changed current status:

| Finding | Updated status |
|---|---|
| Pet photo upload storage policy | `PASS` for bucket policy/path shape; still `FAIL/RISK` because cleanup RPC rejects `pets`. |
| Group avatar upload storage policy | `PASS/RISK` for group membership storage policy; still `FAIL/RISK` because media registration requires owner-prefixed path and cleanup RPC rejects `avatars`. |
| Chat attachment storage policy | `PASS/RISK`; policy exists, but send/delete ordering and orphan failure paths remain risky. |
| Legacy `Profiles` bucket | `FAIL/RISK`; bucket exists and policies exist, but cleanup lowercases to `profiles`, so processor targets a different bucket id. |
| Service/card/social/chat RPC grant proof | `PARTIAL VERIFIED`; selected functions exist and are security definer, but broad anon grants on several chat/group functions must be treated as release risk. |

## 32B. TEMP HARNESS EXECUTED ACTION RESULTS

Harness run: `audit_1778693332079` on 2026-05-14. The harness created a disposable confirmed user, executed the action chains below through the remote API/storage/RPC paths, then attempted best-effort cleanup of its own rows/media/user. Product code was not patched.

| Product action | Executed stages | Result | Audit status update |
|---|---|---|---|
| Profile photo upload/save | `profile_photos` upload -> `register_native_media_asset` -> save `profiles.photos.cover`, `profiles.avatar_url`, `profiles.social_album` -> `request_storage_cleanup profile_photos` | All returned success; DB readback matched uploaded path/public URL. | `PASS/RISK` because current `profile_photos` chain works, but legacy `Profiles` delete cleanup still fails. |
| Legacy profile photo cleanup | Upload to `Profiles` -> `request_storage_cleanup Profiles` | Cleanup returned failure: storage queue insert violated RLS after bucket lowercasing/canonical mismatch. | `FAIL/RISK` |
| Pet photo save | `pets` upload -> `register_native_media_asset` -> insert `pets.photo_url` | Upload/register/DB ref returned success. | `PASS` for save path |
| Pet photo cleanup | `request_storage_cleanup pets` | Returned `invalid_bucket`. | `FAIL` |
| Group create | `create_native_group_chat` | Returned group id and room code. | `PASS` |
| Group avatar upload/register | `avatars/groups/{roomId}/{uid}-{ts}.png` upload -> `register_native_media_asset` | Storage upload returned success; registration returned `object_path_owner_mismatch`. | `FAIL` |
| Group avatar cleanup | `request_storage_cleanup avatars` | Returned `invalid_bucket`. | `FAIL` |
| Chat attachment send | `chat_attachments` upload -> `register_native_media_asset` -> `send_native_chat_message` with attachment JSON ref -> `request_storage_cleanup chat_attachments` | All returned success. | `PASS/RISK` because send path works, but delete/edit failure ordering is a separate unexecuted row. |
| Social composer image submit | `notices` upload -> `register_native_media_asset` -> `create_native_social_thread` with image URL -> `request_storage_cleanup notices` | All returned success. | `PASS/RISK` because create path works, but edit/delete/comment/report variants remain unexecuted. |
| Alert image + pin create | `alerts` upload -> `register_native_media_asset` -> `create_alert_thread_and_pin` with image URL -> `request_storage_cleanup alerts` | All returned success. | `PASS/RISK` because create path works, but edit/delete/support/share variants remain unexecuted. |
| Missing-token media RPCs | Empty bearer for `register_native_media_asset` and `request_storage_cleanup` | Both returned `401 Empty JWT is sent in Authorization header`. | `PASS` for missing-token rejection. |

Harness coverage limits:

| Area | Status after harness |
|---|---|
| Every mutating row in Section 31 | `NO`; only the rows above were executed. |
| Every native control/action match in Section 33 | `LISTED`, but not all were executed end to end. |
| Every form field mapping | `PARTIAL`; profile photo refs, pet `photo_url`, social image array, chat attachment content JSON, alert image payload were executed. All other fields remain source-traced only. |
| Every filter/search/sort/cache update | `NOT EXECUTED`; remains source-traced only. |
| Verify Identity phone/card/human/device/evidence | `NOT EXECUTED`; remains source-traced only. |
| Service bookmark/detail/request | `NOT EXECUTED`; remains source-traced only. |
| All delete clears DB refs + media refs | `NOT EXECUTED`; cleanup acceptance was tested for selected buckets, but DB-ref clearing variants remain incomplete. |
| Every failure preserves exact stage + original error | `PARTIAL`; harness captured exact backend errors for cleanup and registration failures, but app UI still collapses several errors to generic notices. |

Minimum command/test set still required before this audit can say every row is verified:

```bash
# Non-mutating static proof already run:
npm --prefix app run typecheck
git diff --check
git diff --cached --check
supabase migration list

# Still required:
# 1. Per-helper unit/source-contract harness for exact-token missing/success/error branches.
# 2. Sandbox/live action tests for every mutating row in Section 31.
# 3. Storage policy tests for owner/member/non-member upload/delete/cleanup per bucket.
# 4. Forced-failure tests proving rollback, no fake success, and original error/stage preservation.
```

## 33. COMPLETE MACHINE CONTROL MATCH LEDGER

Generated from the stricter control scan on 2026-05-14. This section enumerates every concrete native control/action match returned by the audit pattern, one row per match. It does not turn a mutating action into PASS; mutating rows still require Section 31 chain proof plus Section 32 executed/source-contract response proof.

Control scan command:

```bash
rg -n "<Pressable|Touchable|onPress=|onSubmit|onSave|onUpload|onDelete|onToggle|PanResponder|Gesture\.Tap|<AppModalButton|<AppModalIconButton|submitComposer|submitMessage|createGroup|saveGroup|savePet|saveProfile|handleBookmark|requestService|handleCreate|deleteAttachment" app/src/screens app/src/components
```

Concrete control/action matches audited here: **877**. Existing backend-impact expanded rows in Section 31: **136**. Any match below marked backend-adjacent but not named in Section 31 remains **RISK** and cannot be claimed bulletproof.

| # | File | Line | Source match | Static class | Audit result |
|---:|---|---:|---|---|---|
| 1 | `app/src/components/HuddleRangeControl.tsx` | 2 | import { PanResponder, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type PanResponderGestureState } from "react-native"; | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 2 | `app/src/components/HuddleRangeControl.tsx` | 77 | PanResponder.create({ | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 3 | `app/src/components/HuddleRangeControl.tsx` | 78 | onStartShouldSetPanResponder: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 4 | `app/src/components/HuddleRangeControl.tsx` | 79 | onMoveShouldSetPanResponder: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 5 | `app/src/components/HuddleRangeControl.tsx` | 80 | onPanResponderGrant: (event: GestureResponderEvent) => updateLow(event.nativeEvent.pageX), | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 6 | `app/src/components/HuddleRangeControl.tsx` | 81 | onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => updateLow(gesture.moveX), | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 7 | `app/src/components/HuddleRangeControl.tsx` | 88 | PanResponder.create({ | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 8 | `app/src/components/HuddleRangeControl.tsx` | 89 | onStartShouldSetPanResponder: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 9 | `app/src/components/HuddleRangeControl.tsx` | 90 | onMoveShouldSetPanResponder: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 10 | `app/src/components/HuddleRangeControl.tsx` | 91 | onPanResponderGrant: (event: GestureResponderEvent) => updateHigh(event.nativeEvent.pageX), | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 11 | `app/src/components/HuddleRangeControl.tsx` | 92 | onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => updateHigh(gesture.moveX), | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 12 | `app/src/components/HuddleRangeControl.tsx` | 138 | PanResponder.create({ | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 13 | `app/src/components/HuddleRangeControl.tsx` | 139 | onStartShouldSetPanResponder: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 14 | `app/src/components/HuddleRangeControl.tsx` | 140 | onStartShouldSetPanResponderCapture: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 15 | `app/src/components/HuddleRangeControl.tsx` | 141 | onMoveShouldSetPanResponder: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 16 | `app/src/components/HuddleRangeControl.tsx` | 142 | onMoveShouldSetPanResponderCapture: () => true, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 17 | `app/src/components/HuddleRangeControl.tsx` | 143 | onPanResponderTerminationRequest: () => false, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 18 | `app/src/components/HuddleRangeControl.tsx` | 144 | onPanResponderGrant: (event: GestureResponderEvent) => updateValueFromLocalX(event.nativeEvent.locationX), | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 19 | `app/src/components/HuddleRangeControl.tsx` | 145 | onPanResponderMove: (event: GestureResponderEvent) => updateValueFromLocalX(event.nativeEvent.locationX), | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 20 | `app/src/components/NativeBottomNav.tsx` | 103 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 21 | `app/src/components/NativeBottomNav.tsx` | 108 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 22 | `app/src/components/NativeGlobalHeader.tsx` | 34 | <Pressable accessibilityLabel="Notifications" onPress={onNotificationsPress} style={styles.iconButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 23 | `app/src/components/NativeGlobalHeader.tsx` | 46 | <Pressable accessibilityLabel="huddle Home" onPress={onLogoPress} style={styles.logoButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 24 | `app/src/components/NativeGlobalHeader.tsx` | 52 | <Pressable accessibilityLabel="Settings" onPress={onSettingsPress} style={styles.iconButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 25 | `app/src/components/NativeNotificationsPanel.tsx` | 99 | <Pressable accessibilityLabel="Close notifications" onPress={onClose} style={styles.backdrop}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 26 | `app/src/components/NativeNotificationsPanel.tsx` | 100 | <Pressable style={styles.panel}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 27 | `app/src/components/NativeNotificationsPanel.tsx` | 103 | <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 28 | `app/src/components/NativeNotificationsPanel.tsx` | 129 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 29 | `app/src/components/NativeNotificationsPanel.tsx` | 132 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 30 | `app/src/components/NativePageHeader.tsx` | 12 | <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.backButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 31 | `app/src/components/NativePetDetailsContent.tsx` | 339 | onPress={() => setHealthOpen((current) => !current)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 32 | `app/src/components/NativePetDetailsContent.tsx` | 358 | onPress={() => setRoutineOpen((current) => !current)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 33 | `app/src/components/NativePetDetailsContent.tsx` | 417 | <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={styles.disclosureHeader}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 34 | `app/src/components/NativePetDetailsModal.tsx` | 24 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 35 | `app/src/components/NativePetDetailsModal.tsx` | 27 | onPress={onClose} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 36 | `app/src/components/NativePetDetailsModal.tsx` | 35 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 37 | `app/src/components/NativePetDetailsModal.tsx` | 38 | onPress={onClose} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 38 | `app/src/components/NativePhoneField.tsx` | 165 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 39 | `app/src/components/NativePhoneField.tsx` | 167 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 40 | `app/src/components/NativePhoneField.tsx` | 196 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 41 | `app/src/components/NativePhoneField.tsx` | 198 | onPress={() => selectCountry(country)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 42 | `app/src/components/NativePolaroidCard.tsx` | 45 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 43 | `app/src/components/NativePolaroidCard.tsx` | 49 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 44 | `app/src/components/NativeSettingsDrawer.tsx` | 410 | <Pressable accessibilityLabel="Close settings" onPress={onClose} style={styles.backdrop}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 45 | `app/src/components/NativeSettingsDrawer.tsx` | 411 | <Pressable style={styles.panel}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 46 | `app/src/components/NativeSettingsDrawer.tsx` | 415 | <Pressable accessibilityLabel="Back to settings" onPress={() => setLegalOpen(false)} style={styles.backRow}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 47 | `app/src/components/NativeSettingsDrawer.tsx` | 427 | <Pressable accessibilityLabel="Edit profile" onPress={() => openPath("/edit-profile")} style={styles.profileRow}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 48 | `app/src/components/NativeSettingsDrawer.tsx` | 508 | <Pressable onPress={row.onPress} style={[styles.row, !last && styles.rowBorder]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 49 | `app/src/components/NativeSettingsDrawer.tsx` | 520 | <Pressable onPress={onClose} style={[styles.familyModalBackdrop, modalPrimitiveStyles.appModalSafeArea]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 50 | `app/src/components/NativeSettingsDrawer.tsx` | 521 | <Pressable style={[modalPrimitiveStyles.appModalCard, styles.carerGateCard]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 51 | `app/src/components/NativeSettingsDrawer.tsx` | 527 | <Pressable onPress={onClose} style={styles.carerGateSecondary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 52 | `app/src/components/NativeSettingsDrawer.tsx` | 530 | <Pressable onPress={onVerify} style={styles.carerGatePrimary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 53 | `app/src/components/NativeSettingsDrawer.tsx` | 743 | <Pressable onPress={slotOpen ? () => setSlotOpen(false) : onClose} style={[styles.familyModalBackdrop, modalPrimitiveStyles.appModalSafeArea]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 54 | `app/src/components/NativeSettingsDrawer.tsx` | 744 | <Pressable onPress={(event) => event.stopPropagation()} style={[modalPrimitiveStyles.appModalCard, styles.familyCard, slotOpen && styles.sharePerksCard]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 55 | `app/src/components/NativeSettingsDrawer.tsx` | 746 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 56 | `app/src/components/NativeSettingsDrawer.tsx` | 748 | onPress={searchOpen ? () => setSearchOpen(false) : onClose} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 57 | `app/src/components/NativeSettingsDrawer.tsx` | 773 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 58 | `app/src/components/NativeSettingsDrawer.tsx` | 775 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 59 | `app/src/components/NativeSettingsDrawer.tsx` | 784 | <Pressable onPress={() => setSlotOpen(false)} style={styles.familySecondaryTextOnly}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 60 | `app/src/components/NativeSettingsDrawer.tsx` | 830 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 61 | `app/src/components/NativeSettingsDrawer.tsx` | 833 | onPress={() => void sendInvite(result)} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 62 | `app/src/components/NativeSettingsDrawer.tsx` | 863 | <Pressable onPress={() => void loadFamilyState()} style={styles.familySecondaryTextOnly}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 63 | `app/src/components/NativeSettingsDrawer.tsx` | 905 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 64 | `app/src/components/NativeSettingsDrawer.tsx` | 908 | onPress={() => void removeMember(String(acceptedRow?.family_member_id \|\| ""))} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 65 | `app/src/components/NativeSettingsDrawer.tsx` | 915 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 66 | `app/src/components/NativeSettingsDrawer.tsx` | 918 | onPress={() => void quitFamily()} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 67 | `app/src/components/NativeSettingsDrawer.tsx` | 943 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 68 | `app/src/components/NativeSettingsDrawer.tsx` | 946 | onPress={() => void cancelInvite(row.family_member_id)} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 69 | `app/src/components/NativeSettingsDrawer.tsx` | 960 | <Pressable accessibilityRole="button" onPress={() => void declineInvite()} style={modalPrimitiveStyles.appModalSecondaryButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 70 | `app/src/components/NativeSettingsDrawer.tsx` | 965 | <Pressable accessibilityRole="button" onPress={() => void acceptInvite()} style={modalPrimitiveStyles.appModalPrimaryButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 71 | `app/src/components/NativeSettingsDrawer.tsx` | 976 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 72 | `app/src/components/NativeSettingsDrawer.tsx` | 978 | onPress={handleAddPress} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 73 | `app/src/components/NativeSettingsDrawer.tsx` | 984 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 74 | `app/src/components/NativeSettingsDrawer.tsx` | 987 | onPress={() => void quitFamily()} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 75 | `app/src/components/map/NativeAlertDetailModal.tsx` | 643 | onPress={alert.is_sensitive ? revealSensitive : undefined} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 76 | `app/src/components/map/NativeAlertDetailModal.tsx` | 654 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 77 | `app/src/components/map/NativeAlertDetailModal.tsx` | 658 | onPress={() => alert.creator_id && onOpenProfile?.(alert.creator_id)} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 78 | `app/src/components/map/NativeAlertDetailModal.tsx` | 675 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 79 | `app/src/components/map/NativeAlertDetailModal.tsx` | 676 | <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 80 | `app/src/components/map/NativeAlertDetailModal.tsx` | 686 | <Pressable accessibilityLabel="Edit alert" accessibilityRole="button" onPress={() => setEditing(true)} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 81 | `app/src/components/map/NativeAlertDetailModal.tsx` | 689 | <Pressable accessibilityLabel="Remove alert" accessibilityRole="button" onPress={() => setConfirmRemove(true)} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 82 | `app/src/components/map/NativeAlertDetailModal.tsx` | 694 | <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.iconButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 83 | `app/src/components/map/NativeAlertDetailModal.tsx` | 710 | <Pressable accessibilityRole="button" onPress={handleSocial} style={styles.socialLink}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 84 | `app/src/components/map/NativeAlertDetailModal.tsx` | 715 | <Pressable accessibilityLabel="Support" accessibilityRole="button" onPress={() => void handleSupport()} style={[styles.footerButton, liked ? styles.supportActive : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 85 | `app/src/components/map/NativeAlertDetailModal.tsx` | 719 | <Pressable accessibilityLabel="Share" accessibilityRole="button" onPress={() => setShareOpen(true)} style={styles.footerButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 86 | `app/src/components/map/NativeAlertDetailModal.tsx` | 724 | <Pressable accessibilityLabel="More" accessibilityRole="button" onPress={() => setMenuOpen((value) => !value)} style={styles.footerButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 87 | `app/src/components/map/NativeAlertDetailModal.tsx` | 788 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setShareOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 88 | `app/src/components/map/NativeAlertDetailModal.tsx` | 789 | <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 89 | `app/src/components/map/NativeAlertDetailModal.tsx` | 793 | <Pressable accessibilityLabel="Close share" accessibilityRole="button" onPress={() => setShareOpen(false)} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 90 | `app/src/components/map/NativeAlertDetailModal.tsx` | 817 | <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setShareTargetKey(target.chatId)} style={({ pressed }) => [styles.shareTa | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 91 | `app/src/components/map/NativeAlertDetailModal.tsx` | 833 | <Pressable accessibilityRole="button" disabled={!shareTargetKey \|\| shareSending \|\| shareTargetsLoading} onPress={() => void handleShareToChat()} style={({ pressed }) => [styles | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 92 | `app/src/components/map/NativeAlertDetailModal.tsx` | 837 | <Pressable accessibilityRole="button" onPress={() => { void handleNativeShare().then(() => setShareOpen(false)); }} style={({ pressed }) => [styles.shareSecondaryButton, pressed ?  | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 93 | `app/src/components/map/NativeAlertDetailModal.tsx` | 849 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setEditing(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 94 | `app/src/components/map/NativeAlertDetailModal.tsx` | 850 | <Pressable onPress={(event) => event.stopPropagation()} style={[styles.bottomSheetBoundary, { maxHeight: alertDetailSheetMaxHeight }]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 95 | `app/src/components/map/NativeAlertDetailModal.tsx` | 854 | <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => setEditing(false)} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 96 | `app/src/components/map/NativeAlertDetailModal.tsx` | 908 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 97 | `app/src/components/map/NativeAlertDetailModal.tsx` | 911 | onPress={() => setEditImages((current) => current.filter((entry) => entry.id !== item.id))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 98 | `app/src/components/map/NativeAlertDetailModal.tsx` | 921 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 99 | `app/src/components/map/NativeAlertDetailModal.tsx` | 924 | onPress={() => setEditIsSensitive((value) => !value)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 100 | `app/src/components/map/NativeAlertDetailModal.tsx` | 939 | <Pressable accessibilityLabel="Add image" accessibilityRole="button" onPress={() => void pickEditMedia()} style={styles.editCameraButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 101 | `app/src/components/map/NativeAlertDetailModal.tsx` | 942 | <Pressable accessibilityRole="button" onPress={() => void handleSaveEdit()} style={styles.editSaveButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 102 | `app/src/components/map/NativeBroadcastModal.tsx` | 333 | const handleCreate = async () => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 103 | `app/src/components/map/NativeBroadcastModal.tsx` | 463 | <Pressable accessibilityLabel="Close broadcast composer" accessibilityRole="button" onPress={handleClose} style={StyleSheet.absoluteFill} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 104 | `app/src/components/map/NativeBroadcastModal.tsx` | 467 | <AppModalCloseButton onPress={handleClose} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 105 | `app/src/components/map/NativeBroadcastModal.tsx` | 472 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 106 | `app/src/components/map/NativeBroadcastModal.tsx` | 475 | onPress={() => selectedLocation ? onClearLocation() : void requestLocation()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 107 | `app/src/components/map/NativeBroadcastModal.tsx` | 486 | <Pressable accessibilityRole="button" onPress={() => setTypeMenuOpen((value) => !value)} style={styles.typeSelect}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 108 | `app/src/components/map/NativeBroadcastModal.tsx` | 493 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 109 | `app/src/components/map/NativeBroadcastModal.tsx` | 496 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 110 | `app/src/components/map/NativeBroadcastModal.tsx` | 509 | <Pressable accessibilityRole="switch" accessibilityState={{ checked: postOnThreads }} onPress={() => setPostOnThreads((value) => !value)} style={styles.socialToggle}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 111 | `app/src/components/map/NativeBroadcastModal.tsx` | 552 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 112 | `app/src/components/map/NativeBroadcastModal.tsx` | 555 | onPress={tier === "gold" ? undefined : () => setBroadcastUpsellTarget(tier === "free" ? "plus" : "gold")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 113 | `app/src/components/map/NativeBroadcastModal.tsx` | 563 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 114 | `app/src/components/map/NativeBroadcastModal.tsx` | 565 | onPress={() => setBroadcastUpsellTarget(upsellTargetForTier())} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 115 | `app/src/components/map/NativeBroadcastModal.tsx` | 623 | <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => removeMediaAt(index)} style={styles.mediaRemoveButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 116 | `app/src/components/map/NativeBroadcastModal.tsx` | 632 | <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSensitive }} onPress={() => setIsSensitive((value) => !value)} style={styles.sensitiveRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 117 | `app/src/components/map/NativeBroadcastModal.tsx` | 645 | <Pressable accessibilityLabel="Add image" accessibilityRole="button" onPress={() => void pickMedia()} style={styles.mediaButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 118 | `app/src/components/map/NativeBroadcastModal.tsx` | 648 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 119 | `app/src/components/map/NativeBroadcastModal.tsx` | 651 | onPress={() => void handleCreate()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 120 | `app/src/components/map/NativeBroadcastModal.tsx` | 710 | <Pressable accessibilityLabel="Close broadcast upsell" onPress={onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 121 | `app/src/components/map/NativeBroadcastModal.tsx` | 711 | <Pressable onPress={(event) => event.stopPropagation()} style={[nativeModalStyles.appModalCard, styles.broadcastUpsellCard]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 122 | `app/src/components/map/NativeBroadcastModal.tsx` | 726 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 123 | `app/src/components/map/NativeBroadcastModal.tsx` | 728 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 124 | `app/src/components/map/NativeBroadcastModal.tsx` | 736 | <Pressable accessibilityRole="button" onPress={onClose} style={styles.broadcastUpsellSecondary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 125 | `app/src/components/map/NativeMapErrorState.tsx` | 28 | <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [ | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 126 | `app/src/components/map/NativeMapRestrictionModal.tsx` | 15 | <Pressable style={styles.backdrop} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 127 | `app/src/components/map/NativeMapRestrictionModal.tsx` | 16 | <Pressable style={styles.card} onPress={() => undefined}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 128 | `app/src/components/map/NativeMapRestrictionModal.tsx` | 17 | <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={styles.closeButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 129 | `app/src/components/map/NativeMapRestrictionModal.tsx` | 28 | <Pressable accessibilityRole="button" onPress={onClose} style={styles.primaryButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 130 | `app/src/components/nativeModalPrimitives.tsx` | 10 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 131 | `app/src/components/nativeModalPrimitives.tsx` | 13 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 132 | `app/src/components/nativeModalPrimitives.tsx` | 33 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 133 | `app/src/components/nativeModalPrimitives.tsx` | 37 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 134 | `app/src/components/nativeModalPrimitives.tsx` | 176 | <Pressable accessibilityRole="button" onPress={onToggle} style={[nativeModalStyles.appModalSelectTrigger, triggerStyle]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 135 | `app/src/components/nativeModalPrimitives.tsx` | 187 | <Pressable key={option} onPress={() => onSelect(option)} style={nativeModalStyles.appModalSelectOption}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 136 | `app/src/components/nativeModalPrimitives.tsx` | 244 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 137 | `app/src/components/nativeModalPrimitives.tsx` | 246 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 138 | `app/src/components/nativeModalPrimitives.tsx` | 285 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 139 | `app/src/components/nativeModalPrimitives.tsx` | 288 | onPress={item.onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 140 | `app/src/components/nativeModalPrimitives.tsx` | 337 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={onCancel}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 141 | `app/src/components/nativeModalPrimitives.tsx` | 338 | <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 142 | `app/src/components/nativeModalPrimitives.tsx` | 344 | <AppModalButton disabled={loading} variant="secondary" onPress={onCancel}>{finalCancelLabel}</AppModalButton> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 143 | `app/src/components/nativeModalPrimitives.tsx` | 345 | <AppModalButton disabled={loading} loading={loading} variant={destructive ? "destructive" : "primary"} onPress={onConfirm}>{finalConfirmLabel}</AppModalButton> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 144 | `app/src/components/profile/NativeProfileForm.tsx` | 329 | <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} hitSlop={8} onPress={() => onToggle?.(!value)} style={styles.visibilityToggle}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 145 | `app/src/components/profile/NativeProfileForm.tsx` | 344 | return <VisibilityToggle onToggle={onToggle} value={value} />; | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 146 | `app/src/components/profile/NativeProfileForm.tsx` | 373 | const rightAccessory = visibility ? <VisibilityControl onToggle={onVisibilityToggle} value={visibilityValue} /> : undefined; | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 147 | `app/src/components/profile/NativeProfileForm.tsx` | 433 | <Pressable accessibilityRole="button" onPress={() => setExpanded((current) => !current)} style={[styles.selectTrigger, expanded ? styles.selectTriggerFocused : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 148 | `app/src/components/profile/NativeProfileForm.tsx` | 445 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 149 | `app/src/components/profile/NativeProfileForm.tsx` | 450 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 150 | `app/src/components/profile/NativeProfileForm.tsx` | 473 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 151 | `app/src/components/profile/NativeProfileForm.tsx` | 477 | onPress={() => onChange(!value)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 152 | `app/src/components/profile/NativeProfileForm.tsx` | 532 | const rightAccessory = visibility ? <VisibilityControl onToggle={onVisibilityToggle} value={visibilityValue} /> : undefined; | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 153 | `app/src/components/profile/NativeProfileForm.tsx` | 540 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 154 | `app/src/components/profile/NativeProfileForm.tsx` | 542 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 155 | `app/src/components/profile/NativeProfileForm.tsx` | 580 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 156 | `app/src/components/profile/NativeProfileForm.tsx` | 585 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 157 | `app/src/components/profile/NativeProfileForm.tsx` | 641 | <Pressable accessibilityLabel={'Edit ${label}'} onPress={onEdit} style={styles.inlineIconButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 158 | `app/src/components/profile/NativeProfileForm.tsx` | 654 | <Pressable accessibilityLabel={'Save ${label}'} onPress={onSave} style={styles.inlineIconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 159 | `app/src/components/profile/NativeProfileForm.tsx` | 697 | <Pressable accessibilityLabel="Edit Phone" onPress={onEdit} style={styles.inlineIconButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 160 | `app/src/components/profile/NativeProfileForm.tsx` | 719 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 161 | `app/src/components/profile/NativeProfileForm.tsx` | 722 | onPress={onOtpRequest} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 162 | `app/src/components/profile/NativeProfileForm.tsx` | 729 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 163 | `app/src/components/profile/NativeProfileForm.tsx` | 731 | onPress={async () => { | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 164 | `app/src/components/profile/NativeProfileForm.tsx` | 888 | onSave={() => setDisplayNameEditMode(false)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 165 | `app/src/components/profile/NativeProfileForm.tsx` | 902 | onSave={() => setSocialIdEditMode(false)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 166 | `app/src/components/profile/NativeProfileForm.tsx` | 926 | onSave={async () => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 167 | `app/src/components/profile/NativeProfileForm.tsx` | 957 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 168 | `app/src/components/profile/NativeProfileForm.tsx` | 959 | onPress={onPhoneOtpVerify} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 169 | `app/src/components/profile/NativeProfileForm.tsx` | 997 | fieldAccessory={<Pressable accessibilityLabel="Edit date of birth" onPress={() => setDobEditMode(true)} style={styles.inlineIconButton}><Feather color={huddleColors.iconMuted} name | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 170 | `app/src/components/profile/NativeProfileForm.tsx` | 1014 | rightAccessory={<VisibilityControl onToggle={(value) => setVisibility("show_height", value)} value={form.show_height} />} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 171 | `app/src/components/profile/NativeProfileForm.tsx` | 1031 | <VisibilityControl onToggle={(value) => setVisibility("show_academic", value)} value={form.show_academic} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 172 | `app/src/components/profile/NativeProfileForm.tsx` | 1053 | <VisibilityControl onToggle={(value) => setVisibility("show_location", value)} value={form.show_location} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 173 | `app/src/components/profile/NativeProfileForm.tsx` | 1083 | <Pressable accessibilityLabel="Use current location" disabled={resolvingLocation} onPress={onUseCurrentLocation} style={styles.inlineIconButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 174 | `app/src/components/profile/NativeProfileForm.tsx` | 1109 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 175 | `app/src/components/profile/NativeProfileForm.tsx` | 1112 | onPress={() => onLocationSuggestionSelect?.(item)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 176 | `app/src/components/profile/NativeProfilePack.tsx` | 139 | onPress={isPublic ? () => onPetPress?.(pet.id, isPublic) : undefined} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 177 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 7 | PanResponder, | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 178 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 95 | const panResponder = useMemo(() => PanResponder.create({ | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 179 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 96 | onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > huddleSpacing.x1 \|\| Math.abs(gesture.dy) > huddleSpacing.x1, | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 180 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 97 | onPanResponderGrant: () => { | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 181 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 100 | onPanResponderMove: (_, gesture) => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 182 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 157 | <Pressable accessibilityLabel="Close crop photo" accessibilityRole="button" onPress={onCancel} style={styles.closeButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 183 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 165 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 184 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 168 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 185 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 216 | <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" onPress={() => changeZoom(-huddleProfilePhotoCropper.zoomStep)} style={styles.zoomButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 186 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 220 | <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" onPress={() => changeZoom(huddleProfilePhotoCropper.zoomStep)} style={styles.zoomButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 187 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 227 | <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={[styles.actionButton, styles.cancelButton, saving ? styles.disabled : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 188 | `app/src/components/profile/NativeProfilePhotoCropper.tsx` | 230 | <Pressable accessibilityRole="button" disabled={saving} onPress={handleSave} style={[styles.actionButton, styles.saveButton, saving ? styles.disabled : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 189 | `app/src/components/profile/NativeProfilePhotoPlate.tsx` | 49 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 190 | `app/src/components/profile/NativeProfilePhotoPlate.tsx` | 52 | onPress={() => onPress?.(src)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 191 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 193 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 192 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 196 | onPress={handlePickAndUpload} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 193 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 218 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 194 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 221 | onPress={handlePickAndUpload} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 195 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 226 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 196 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 229 | onPress={() => onRemoved(slot, value)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 197 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 281 | <Pressable accessibilityLabel="Close photo options" accessibilityRole="button" onPress={() => setActionsOpen(false)} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 198 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 284 | <Pressable accessibilityRole="button" onPress={handlePickAndUpload} style={styles.sheetRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 199 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 288 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 200 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 290 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 201 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 309 | <Pressable accessibilityRole="button" onPress={() => setConfirmingRemove(false)} style={[styles.confirmButton, styles.keepButton]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 202 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 312 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 203 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 314 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 204 | `app/src/components/profile/NativeProfilePhotoSlot.tsx` | 334 | onSave={handleCroppedSave} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 205 | `app/src/components/profile/NativePublicProfileContent.tsx` | 171 | onPress={setLightboxSrc} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 206 | `app/src/components/profile/NativePublicProfileContent.tsx` | 185 | onPress={setLightboxSrc} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 207 | `app/src/components/profile/NativePublicProfileContent.tsx` | 194 | onPress={setLightboxSrc} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 208 | `app/src/components/profile/NativePublicProfileContent.tsx` | 204 | onPress={setLightboxSrc} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 209 | `app/src/components/profile/NativePublicProfileContent.tsx` | 219 | <Pressable accessibilityLabel="Close photo preview" accessibilityRole="button" onPress={() => setLightboxSrc(null)} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 210 | `app/src/components/profile/NativePublicProfileContent.tsx` | 220 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 211 | `app/src/components/profile/NativePublicProfileContent.tsx` | 223 | onPress={() => setLightboxSrc(null)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 212 | `app/src/components/profile/NativePublicProfileModal.tsx` | 195 | <Pressable accessibilityLabel="Close profile" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 213 | `app/src/components/profile/NativePublicProfileModal.tsx` | 204 | <AppModalIconButton | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 214 | `app/src/components/profile/NativePublicProfileModal.tsx` | 207 | onPress={() => { void Promise.resolve(onWave?.()); }} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 215 | `app/src/components/profile/NativePublicProfileModal.tsx` | 213 | <AppModalIconButton | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 216 | `app/src/components/profile/NativePublicProfileModal.tsx` | 216 | onPress={() => setConfirmStar(true)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 217 | `app/src/components/profile/NativePublicProfileModal.tsx` | 222 | <AppModalIconButton | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 218 | `app/src/components/profile/NativePublicProfileModal.tsx` | 225 | onPress={() => setConfirmBlock(true)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 219 | `app/src/components/profile/NativePublicProfileModal.tsx` | 230 | <AppModalIconButton accessibilityLabel="Close profile" onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 220 | `app/src/components/profile/NativePublicProfileModal.tsx` | 253 | <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed ? huddleButtons.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 221 | `app/src/components/service/NativeCarerProfileContent.tsx` | 142 | <Pressable accessibilityLabel="Previous" onPress={() => goToSlide(-1)} style={({ pressed }) => [styles.heroArrow, styles.heroArrowLeft, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 222 | `app/src/components/service/NativeCarerProfileContent.tsx` | 145 | <Pressable accessibilityLabel="Next" onPress={() => goToSlide(1)} style={({ pressed }) => [styles.heroArrow, styles.heroArrowRight, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 223 | `app/src/components/service/NativeCarerProfileContent.tsx` | 171 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 224 | `app/src/components/service/NativeCarerProfileContent.tsx` | 173 | onPress={() => setStoryExpanded((current) => !current)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 225 | `app/src/components/service/NativeCarerProfileContent.tsx` | 241 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 226 | `app/src/components/service/NativeCarerProfileContent.tsx` | 244 | onPress={() => Alert.alert("Credentials", credentialRows.join("\n"))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 227 | `app/src/components/service/NativeCarerProfileContent.tsx` | 295 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 228 | `app/src/components/service/NativeCarerProfileContent.tsx` | 298 | onPress={onRequestService} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 229 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 187 | onPress={() => onOpenExternalLink(safeUrl)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 230 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 262 | onPress={() => onOpenProfile(entry.mentionedUserId)} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 231 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 303 | <Pressable accessibilityRole="button" onPress={onClearTags} style={({ pressed }) => [styles.tabButton, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 232 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 308 | <Pressable key={tag} accessibilityRole="button" onPress={() => onToggleTag(tag)} style={({ pressed }) => [styles.tabButton, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 233 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 331 | <Pressable accessibilityRole="button" accessibilityLabel="Change social sort" onPress={() => setSortMenuOpen((open) => !open)} style={({ pressed }) => [styles.sortField, sortMenuOp | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 234 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 336 | <Pressable style={styles.dropdownBackdrop} onPress={() => setSortMenuOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 235 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 337 | <Pressable style={styles.sortMenu}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 236 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 340 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 237 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 344 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 238 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 379 | <Pressable accessibilityRole="button" onPress={() => onOpenProfile(thread.userId)} style={({ pressed }) => [styles.avatarButton, authorVerified ? styles.avatarVerified : null, pres | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 239 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 492 | <Pressable accessibilityLabel={revealed ? "Blur sensitive media" : "Reveal sensitive media"} accessibilityRole="button" onPress={onToggleSensitive} style={styles.expandedIconButton | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 240 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 497 | <Pressable accessibilityLabel={muted ? "Turn sound on" : "Mute video"} accessibilityRole="button" onPress={() => setMuted((current) => !current)} style={styles.expandedIconButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 241 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 501 | <Pressable accessibilityLabel="Close media viewer" accessibilityRole="button" onPress={onClose} style={styles.expandedIconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 242 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 552 | <Pressable accessibilityRole="button" onPress={onToggleSensitive} style={styles.expandedSensitiveTapArea}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 243 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 714 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 244 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 717 | onPress={() => handleMediaPress(index)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 245 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 786 | <Pressable accessibilityRole="button" accessibilityLabel="Previous image" disabled={activeIndex <= 0} onPress={() => scrollToIndex(activeIndex - 1)} style={({ pressed }) => [styles | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 246 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 792 | <Pressable accessibilityRole="button" accessibilityLabel="Next image" disabled={activeIndex >= media.length - 1} onPress={() => scrollToIndex(activeIndex + 1)} style={({ pressed }) | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 247 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 818 | return <NativeSocialMediaCarousel isSensitive={thread.isSensitive} items={media} onPress={onOpenWebThread} videoStatus={thread.videoStatus} />; | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 248 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 831 | <Pressable accessibilityRole="link" onPress={() => onOpen(url)} style={({ pressed }) => [styles.linkPreview, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 249 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 887 | <Pressable accessibilityRole="button" accessibilityLabel={supported ? "Remove support" : "Support post"} accessibilityState={{ selected: supported }} onPress={onOpenSupport} hitSlo | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 250 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 895 | <Pressable accessibilityRole="button" accessibilityLabel="Open replies" onPress={onOpenComments} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? st | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 251 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 903 | <Pressable accessibilityRole="button" accessibilityLabel="Share post" onPress={onOpenShare} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles. | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 252 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 911 | <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={onOpenMore} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.iconButton, pressed ? styles | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 253 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 961 | <Pressable accessibilityRole="button" accessibilityLabel={saved ? "Unsave post" : "Save post"} onPress={onToggleSaved} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.to | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 254 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 964 | <Pressable accessibilityRole="button" accessibilityLabel={pinned ? "Unpin post" : "Pin post"} onPress={onTogglePinned} hitSlop={huddleSpacing.x2} style={({ pressed }) => [styles.to | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 255 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 968 | <Pressable accessibilityRole="button" onPress={() => onOpenProfile(thread.userId)} style={styles.authorTextBlock}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 256 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 973 | <Pressable accessibilityRole="button" onPress={onOpenMap} style={({ pressed }) => [styles.mapLink, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 257 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 992 | <Pressable accessibilityRole="button" onPress={onToggleExpanded} style={({ pressed }) => [styles.readMoreButton, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 258 | `app/src/components/social/NativeSocialFeedPrimitives.tsx` | 997 | <Pressable accessibilityRole="link" onPress={() => onOpenExternalLink(firstUrl)} style={({ pressed }) => [styles.linkPreview, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 259 | `app/src/components/social/NativeSocialReportModal.tsx` | 166 | <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 260 | `app/src/components/social/NativeSocialReportModal.tsx` | 174 | <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.sheetIconButton, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 261 | `app/src/components/social/NativeSocialReportModal.tsx` | 180 | <Pressable key={category} accessibilityRole="checkbox" accessibilityState={{ checked: categories.has(category) }} onPress={() => setCategories((current) => toggleSetValue(current,  | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 262 | `app/src/components/social/NativeSocialReportModal.tsx` | 200 | <Pressable accessibilityLabel={NATIVE_SOCIAL_REPORT_COPY.imagePickerLabel} accessibilityRole="button" onPress={pickImages} style={({ pressed }) => [styles.imageButton, pressed ? st | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 263 | `app/src/components/social/NativeSocialReportModal.tsx` | 203 | <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, submitting ? styles.disabled : null, pressed ? styles.pr | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 264 | `app/src/screens/NativeAuthScreen.tsx` | 266 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 265 | `app/src/screens/NativeAuthScreen.tsx` | 268 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 266 | `app/src/screens/NativeAuthScreen.tsx` | 335 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 267 | `app/src/screens/NativeAuthScreen.tsx` | 337 | onPress={() => void submitSupport()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 268 | `app/src/screens/NativeAuthScreen.tsx` | 342 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 269 | `app/src/screens/NativeAuthScreen.tsx` | 344 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 270 | `app/src/screens/NativeAuthScreen.tsx` | 412 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 271 | `app/src/screens/NativeAuthScreen.tsx` | 414 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 272 | `app/src/screens/NativeAuthScreen.tsx` | 480 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 273 | `app/src/screens/NativeAuthScreen.tsx` | 482 | onPress={() => void submitReset()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 274 | `app/src/screens/NativeAuthScreen.tsx` | 497 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 275 | `app/src/screens/NativeAuthScreen.tsx` | 500 | onPress={() => null} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 276 | `app/src/screens/NativeAuthScreen.tsx` | 714 | const handleCreateAccount = useCallback(async () => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 277 | `app/src/screens/NativeAuthScreen.tsx` | 740 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 278 | `app/src/screens/NativeAuthScreen.tsx` | 741 | onPress={() => setAppModalTarget("support")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 279 | `app/src/screens/NativeAuthScreen.tsx` | 770 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 280 | `app/src/screens/NativeAuthScreen.tsx` | 772 | onPress={openEmailChoice} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 281 | `app/src/screens/NativeAuthScreen.tsx` | 784 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 282 | `app/src/screens/NativeAuthScreen.tsx` | 786 | onPress={() => void handleAppleSignIn()} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 283 | `app/src/screens/NativeAuthScreen.tsx` | 799 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 284 | `app/src/screens/NativeAuthScreen.tsx` | 801 | onPress={handlePasskeyLogin} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 285 | `app/src/screens/NativeAuthScreen.tsx` | 817 | <Text style={styles.footerLink} onPress={() => setAppModalTarget("terms")}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 286 | `app/src/screens/NativeAuthScreen.tsx` | 821 | <Text style={styles.footerLink} onPress={() => setAppModalTarget("privacy")}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 287 | `app/src/screens/NativeAuthScreen.tsx` | 834 | <Pressable style={styles.modalBackdrop} onPress={closeEmailModal}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 288 | `app/src/screens/NativeAuthScreen.tsx` | 836 | <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 289 | `app/src/screens/NativeAuthScreen.tsx` | 837 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 290 | `app/src/screens/NativeAuthScreen.tsx` | 838 | onPress={closeEmailModal} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 291 | `app/src/screens/NativeAuthScreen.tsx` | 854 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 292 | `app/src/screens/NativeAuthScreen.tsx` | 856 | onPress={openSignInStep} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 293 | `app/src/screens/NativeAuthScreen.tsx` | 862 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 294 | `app/src/screens/NativeAuthScreen.tsx` | 864 | onPress={handleCreateAccount} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 295 | `app/src/screens/NativeAuthScreen.tsx` | 938 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 296 | `app/src/screens/NativeAuthScreen.tsx` | 940 | onPress={() => setSigninPasswordVisible((visible) => !visible)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 297 | `app/src/screens/NativeAuthScreen.tsx` | 953 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 298 | `app/src/screens/NativeAuthScreen.tsx` | 955 | onPress={() => void handleEmailSignIn()} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 299 | `app/src/screens/NativeAuthScreen.tsx` | 961 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 300 | `app/src/screens/NativeAuthScreen.tsx` | 963 | onPress={openResetPassword} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 301 | `app/src/screens/NativeAuthScreen.tsx` | 969 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 302 | `app/src/screens/NativeAuthScreen.tsx` | 971 | onPress={handleCreateAccount} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 303 | `app/src/screens/NativeAuthScreen.tsx` | 991 | <Pressable style={StyleSheet.absoluteFill} onPress={() => setAppModalTarget(null)} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 304 | `app/src/screens/NativeAuthScreen.tsx` | 1008 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 305 | `app/src/screens/NativeAuthScreen.tsx` | 1009 | onPress={() => setAppModalTarget(null)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 306 | `app/src/screens/NativeCarerProfileScreen.tsx` | 288 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 307 | `app/src/screens/NativeCarerProfileScreen.tsx` | 291 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 308 | `app/src/screens/NativeCarerProfileScreen.tsx` | 313 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 309 | `app/src/screens/NativeCarerProfileScreen.tsx` | 316 | onPress={() => onChange(!value)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 310 | `app/src/screens/NativeCarerProfileScreen.tsx` | 507 | const saveProfile = useCallback(async (silent = false) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 311 | `app/src/screens/NativeCarerProfileScreen.tsx` | 808 | <Pressable accessibilityLabel="Back" onPress={goBack} style={styles.headerIcon}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 312 | `app/src/screens/NativeCarerProfileScreen.tsx` | 825 | <Pressable accessibilityLabel="Back" onPress={goBack} style={({ pressed }) => [styles.headerIcon, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 313 | `app/src/screens/NativeCarerProfileScreen.tsx` | 833 | <Pressable accessibilityLabel="Save" disabled={saving} onPress={() => void saveProfile(false)} style={({ pressed }) => [styles.headerIcon, pressed && !saving ? styles.pressed : nul | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 314 | `app/src/screens/NativeCarerProfileScreen.tsx` | 842 | <Pressable onPress={() => setMode("edit")} style={[styles.tab, mode === "edit" ? styles.tabActive : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 315 | `app/src/screens/NativeCarerProfileScreen.tsx` | 845 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 316 | `app/src/screens/NativeCarerProfileScreen.tsx` | 846 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 317 | `app/src/screens/NativeCarerProfileScreen.tsx` | 847 | void saveProfile(true); | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 318 | `app/src/screens/NativeCarerProfileScreen.tsx` | 859 | <Pressable onPress={() => void loadData()} style={styles.primaryButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 319 | `app/src/screens/NativeCarerProfileScreen.tsx` | 903 | <Pressable key={skill} onPress={() => toggleSkill(skill)} style={styles.chip}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 320 | `app/src/screens/NativeCarerProfileScreen.tsx` | 912 | <Pressable onPress={() => toggleDrop("skills")} style={[styles.selectButton, openDrop === "skills" \|\| focusedField === "skills" ? styles.fieldFocused : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 321 | `app/src/screens/NativeCarerProfileScreen.tsx` | 920 | onToggle={toggleSkill} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 322 | `app/src/screens/NativeCarerProfileScreen.tsx` | 931 | <Pressable onPress={addRateRow} style={styles.iconCircle}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 323 | `app/src/screens/NativeCarerProfileScreen.tsx` | 945 | <Pressable onPress={() => editRate(index)} style={styles.iconCircle}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 324 | `app/src/screens/NativeCarerProfileScreen.tsx` | 949 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 325 | `app/src/screens/NativeCarerProfileScreen.tsx` | 950 | onPress={() => setFormData((prev) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 326 | `app/src/screens/NativeCarerProfileScreen.tsx` | 968 | <Pressable ref={setFieldRef("rateServices")} onPress={() => toggleDrop("rateServices")} style={[styles.selectButton, openDrop === "rateServices" \|\| focusedField === "rateServices | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 327 | `app/src/screens/NativeCarerProfileScreen.tsx` | 977 | onToggle={(service) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 328 | `app/src/screens/NativeCarerProfileScreen.tsx` | 997 | <Pressable ref={setFieldRef("currency")} onPress={() => toggleDrop("currency")} style={[styles.rateSelect, openDrop === "currency" \|\| focusedField === "currency" ? styles.fieldFo | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 329 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1012 | <Pressable ref={setFieldRef("rate")} onPress={() => toggleDrop("rate")} style={[styles.rateSelectWide, openDrop === "rate" \|\| focusedField === "rate" ? styles.fieldFocused : null | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 330 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1017 | <SelectList closeOnSelect options={CURRENCIES} selected={formData.currency ? [formData.currency] : []} onToggle={(currency) => { setFormData((prev) => ({ ...prev, currency })); set | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 331 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1020 | <SelectList closeOnSelect options={RATE_OPTIONS} selected={rateDraft.rate ? [rateDraft.rate] : []} onToggle={(rate) => { setRateDraft((prev) => ({ ...prev, rate })); setOpenDrop(nu | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 332 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1023 | <Pressable onPress={saveRate} style={styles.smallPrimaryButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 333 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1026 | <Pressable onPress={() => { setRateEditIndex(null); setOpenDrop(null); }} style={styles.smallSecondaryButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 334 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1045 | onToggle={(petType) => setFormData((prev) => ({ | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 335 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1075 | onToggle={(size) => setFormData((prev) => ({ ...prev, dogSizes: toggleStringItem(prev.dogSizes, size) }))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 336 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1091 | onToggle={(day) => setFormData((prev) => ({ ...prev, days: toggleStringItem(prev.days, day) }))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 337 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1101 | <Pressable ref={setFieldRef("timeFrom")} onPress={() => toggleDrop("timeFrom")} style={[styles.selectButton, styles.compactSelectButton, openDrop === "timeFrom" \|\| focusedField = | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 338 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1106 | <SelectList closeOnSelect options={TIME_OPTIONS} selected={formData.otherTimeFrom ? [formData.otherTimeFrom] : []} onToggle={(otherTimeFrom) => { setFormData((prev) => ({ ...prev,  | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 339 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1108 | <Pressable ref={setFieldRef("timeTo")} onPress={() => toggleDrop("timeTo")} style={[styles.selectButton, styles.compactSelectButton, openDrop === "timeTo" \|\| focusedField === "ti | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 340 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1113 | <SelectList closeOnSelect options={TIME_OPTIONS} selected={formData.otherTimeTo ? [formData.otherTimeTo] : []} onToggle={(otherTimeTo) => { setFormData((prev) => ({ ...prev, otherT | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 341 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1139 | <Pressable onPress={() => toggleDrop("minNoticeUnit")} style={[styles.noticeUnitSelect, openDrop === "minNoticeUnit" \|\| focusedField === "minNoticeUnit" ? styles.fieldFocused : n | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 342 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1148 | onToggle={(unit) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 343 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1174 | onToggle={(locationStyle) => setFormData((prev) => ({ ...prev, locationStyles: toggleStringItem(prev.locationStyles, locationStyle) }))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 344 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1206 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 345 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1209 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 346 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1232 | <Pressable onPress={() => void refreshWallet()} style={styles.walletButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 347 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1240 | <Pressable onPress={() => void refreshWallet()} style={styles.walletButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 348 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1246 | <Pressable onPress={() => void startWallet()} style={styles.primaryButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 349 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1255 | <Pressable onPress={() => setFormData((prev) => ({ ...prev, agreementAccepted: !prev.agreementAccepted, agreementAcceptedAt: !prev.agreementAccepted ? (prev.agreementAcceptedAt ??  | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 350 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1259 | <Text style={styles.agreementText}>I agree to the <Text onPress={openAgreement} style={styles.linkText}>Service Provider Agreement</Text></Text> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 351 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1298 | <AppModalCloseButton onPress={() => setProofState(null)} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 352 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1315 | <AppModalButton onPress={() => setProofState(null)} variant="secondary"> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 353 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1318 | <AppModalButton onPress={submitProof}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 354 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1368 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 355 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1369 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 356 | `app/src/screens/NativeCarerProfileScreen.tsx` | 1378 | {openDrop === dropKey ? <SelectList options={options} selected={selected} onToggle={onToggle} /> : null} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 357 | `app/src/screens/NativeChatDialogueScreen.tsx` | 962 | const submitMessage = useCallback(async () => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 358 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1098 | const saveGroupName = useCallback(async () => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 359 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1129 | const saveGroupDescription = useCallback(async () => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 360 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1267 | const deleteAttachment = useCallback(async (message: NativeChatMessage, attachmentPath: string) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 361 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1343 | <Pressable accessibilityLabel="Remove link preview" onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 362 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1410 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 363 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1412 | onPress={() => { | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 364 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1449 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 365 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1453 | onPress={() => failed ? void retryAttachmentLoad(attachmentKey, attachment.path) : openMediaPreview(uri)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 366 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1457 | {mine && attachment.path ? <Pressable accessibilityLabel="Delete attachment" onPress={() => void deleteAttachment(message, attachment.path!)} style={styles.removeUpload}><Feather c | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 367 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1482 | <Pressable accessibilityLabel="Back" onPress={() => onNavigate(isGroup ? "/chats?tab=groups" : isService ? "/chats?tab=service" : "/chats?tab=chats")} style={styles.iconButton}><Fe | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 368 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1492 | <Pressable accessibilityLabel="Open group details" onPress={openGroupInfoSheet} style={styles.identity}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 369 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1502 | <Pressable disabled={counterpart?.isTeamHuddle === true} onPress={() => counterpart?.id && setProfileSheetUserId(counterpart.id)} style={styles.identity}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 370 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1513 | {headerReady && !isService && (!counterpart?.isTeamHuddle \|\| isGroup) ? <Pressable accessibilityLabel={isGroup ? "native-chat-group-details-button" : "native-chat-more-button"} t | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 371 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1547 | <Pressable onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 372 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1578 | <Pressable onPress={() => setUploads((current) => current.filter((_, currentIndex) => currentIndex !== index))} style={styles.removeUpload}><Feather color={huddleColors.onPrimary}  | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 373 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1588 | <Pressable accessibilityLabel={canSendVideo ? "Add media" : "Add images"} disabled={composerDisabled} onPress={pickMedia} style={styles.attachButton}><Feather color={huddleColors.m | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 374 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1591 | <Pressable accessibilityLabel="native-chat-send-button" testID="native-chat-send-button" disabled={composerDisabled \|\| (!input.trim() && uploads.length === 0 && !activePreviewUrl | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 375 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1598 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalMenuSafeArea]} onPress={() => setMenuOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 376 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1612 | <Pressable accessibilityLabel="Close media preview" style={styles.mediaPreviewBackdrop} onPress={() => setMediaPreviewUri(null)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 377 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1617 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setGroupInfoOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 378 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1618 | <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 379 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1622 | <Pressable accessibilityLabel="Change group avatar" disabled={!isAdmin \|\| groupAvatarBusy !== null} onPress={() => void updateGroupAvatar()} style={styles.groupInfoHeaderAvatar}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 380 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1644 | <Pressable accessibilityLabel={groupNameEditing ? "Save group name" : "Edit group name"} disabled={groupNameSaving} onPress={saveGroupName} style={styles.groupInfoNameButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 381 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1650 | <Pressable accessibilityLabel={room?.avatarUrl ? "Change group avatar" : "Add group avatar"} disabled={groupAvatarBusy !== null} onPress={() => void updateGroupAvatar()} style={nat | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 382 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1654 | <AppModalIconButton accessibilityLabel="Close group details" onPress={() => setGroupInfoOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 383 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1674 | <Pressable accessibilityLabel={room?.avatarUrl ? "Change group avatar" : "Add group avatar"} disabled={groupAvatarBusy !== null} onPress={() => void updateGroupAvatar()} style={sty | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 384 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1683 | {isAdmin ? <Pressable disabled={groupDescriptionSaving} onPress={saveGroupDescription} style={styles.iconButton}><Feather color={huddleColors.blue} name={groupDescriptionSaving ? " | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 385 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1694 | <Pressable accessibilityLabel="native-chat-group-invite-users-button" onPress={() => { setGroupInfoOpen(false); setGroupManageReturnToInfo(true); void loadGroupManageData(); setGro | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 386 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1710 | <Pressable onPress={() => member.id !== userId && setProfileSheetUserId(member.id)} style={styles.memberIdentity}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 387 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1727 | <Pressable key={'${attachment.key}:${index}'} accessibilityRole="imagebutton" onPress={() => openMediaPreview(attachment.uri)}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 388 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1738 | <AppModalButton onPress={() => { setGroupInfoOpen(false); setGroupManageReturnToInfo(true); void loadGroupManageData(); setGroupManageOpen(true); }}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 389 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1742 | <AppModalButton variant="secondary" onPress={() => setGroupInfoOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 390 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1752 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={() => setGroupManageOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 391 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1753 | <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 392 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1757 | {groupManageReturnToInfo ? <Pressable accessibilityLabel="Back to group details" onPress={() => { setGroupManageOpen(false); setGroupManageSearch(""); setGroupManageReturnToInfo(fa | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 393 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1760 | <AppModalIconButton accessibilityLabel="Close invite users" onPress={() => setGroupManageOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 394 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1769 | <Pressable onPress={() => member.id !== userId && setProfileSheetUserId(member.id)} style={styles.memberIdentity}><ResilientAvatarImage fallback={<Text style={styles.avatarText}>{i | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 395 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1771 | <Pressable accessibilityLabel={'More actions for ${member.name}'} hitSlop={huddleSpacing.x2} onPress={() => setGroupMemberActionTarget(member)} style={nativeModalStyles.appModalSoc | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 396 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1783 | <Pressable onPress={() => setProfileSheetUserId(member.id)} style={styles.memberIdentity}><ResilientAvatarImage fallback={<Text style={styles.avatarText}>{initials(member.name)}</T | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 397 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1784 | <Pressable onPress={() => void inviteGroupMember(member)} style={styles.addMemberButton}><Feather color={huddleColors.blue} name="user-plus" size={16} /></Pressable> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 398 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1796 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalMenuSafeArea]} onPress={() => setGroupMemberActionTarget(null)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 399 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1798 | <Pressable onPress={() => { if (groupMemberActionTarget) setGroupMemberReportTarget(groupMemberActionTarget); setGroupMemberActionTarget(null); setReportOpen(true); }} style={nativ | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 400 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1802 | <Pressable onPress={() => { setGroupMemberBlockTarget(groupMemberActionTarget); setGroupMemberActionTarget(null); }} style={nativeModalStyles.appModalMenuItem}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 401 | `app/src/screens/NativeChatDialogueScreen.tsx` | 1807 | <Pressable onPress={() => { const member = groupMemberActionTarget; setGroupMemberActionTarget(null); if (member) void removeGroupMember(member); }} style={nativeModalStyles.appMod | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 402 | `app/src/screens/NativeChatsScreen.tsx` | 9 | import { ActivityIndicator, Animated, AppState, Dimensions, Easing, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowD | PROP/TYPE/IMPORT | NOT A VISIBLE CONTROL |
| 403 | `app/src/screens/NativeChatsScreen.tsx` | 1193 | // the gesture, so Pressable.onPress never fires. Gesture.Tap() runs on the JS thread | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 404 | `app/src/screens/NativeChatsScreen.tsx` | 1207 | Gesture.Tap() | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 405 | `app/src/screens/NativeChatsScreen.tsx` | 1224 | <Pressable accessibilityLabel={'Star ${profile.displayName}'} disabled={busy} onPress={() => onStar(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, sty | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 406 | `app/src/screens/NativeChatsScreen.tsx` | 1227 | <Pressable accessibilityLabel={'Wave at ${profile.displayName}'} disabled={busy} onPress={() => void onWave(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficBut | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 407 | `app/src/screens/NativeChatsScreen.tsx` | 1230 | <Pressable accessibilityLabel={'Pass ${profile.displayName}'} disabled={busy} onPress={() => onPass(profile)} style={({ pressed }) => [traffic ? [styles.discoveryTrafficButton, sty | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 408 | `app/src/screens/NativeChatsScreen.tsx` | 1258 | <Pressable accessibilityLabel={'Open ${profile.displayName} profile'} accessibilityRole="button" style={styles.discoveryProfileTap}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 409 | `app/src/screens/NativeChatsScreen.tsx` | 1263 | <Pressable accessibilityLabel="Previous photo" onPress={(event) => { event.stopPropagation(); stepAlbum(-1); }} style={styles.discoveryAlbumLeftZone} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 410 | `app/src/screens/NativeChatsScreen.tsx` | 1264 | <Pressable accessibilityLabel="Next photo" onPress={(event) => { event.stopPropagation(); stepAlbum(1); }} style={styles.discoveryAlbumRightZone} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 411 | `app/src/screens/NativeChatsScreen.tsx` | 1369 | const panResponder = useMemo(() => PanResponder.create({ | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 412 | `app/src/screens/NativeChatsScreen.tsx` | 1370 | onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4, | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 413 | `app/src/screens/NativeChatsScreen.tsx` | 1371 | onPanResponderMove: (_, gesture) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 414 | `app/src/screens/NativeChatsScreen.tsx` | 1374 | onPanResponderRelease: (_, gesture) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 415 | `app/src/screens/NativeChatsScreen.tsx` | 1384 | <Pressable accessibilityLabel={'Remove ${name}'} onPress={() => onDelete(row)} style={styles.rowDeleteAction}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 416 | `app/src/screens/NativeChatsScreen.tsx` | 1389 | <Pressable accessibilityLabel={'${automationId}:${name}'} testID={automationId} disabled={disabled} onPress={() => onPress(row)} style={({ pressed }) => [styles.webChatRow, priorit | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 417 | `app/src/screens/NativeChatsScreen.tsx` | 1390 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 418 | `app/src/screens/NativeChatsScreen.tsx` | 1393 | onPress={(event) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 419 | `app/src/screens/NativeChatsScreen.tsx` | 1432 | <Pressable accessibilityLabel={'native-chat-group-row:${name}'} testID="native-chat-group-row" onPress={() => onPress(row)} style={({ pressed }) => [styles.webChatRow, unread && st | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 420 | `app/src/screens/NativeChatsScreen.tsx` | 1433 | <Pressable accessibilityLabel={'Open ${name} details'} onPress={(event) => { event.stopPropagation(); onOpenDetails(row); }} style={styles.groupListAvatar}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 421 | `app/src/screens/NativeChatsScreen.tsx` | 1468 | <Pressable key={'match:${row.chatId}'} accessibilityLabel={'Open match with ${name}'} onPress={() => onOpen(row)} style={styles.matchRailItem}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 422 | `app/src/screens/NativeChatsScreen.tsx` | 1507 | <Pressable onPress={onResurface} style={({ pressed }) => [styles.discoveryEndPrimary, pressed && huddleButtons.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 423 | `app/src/screens/NativeChatsScreen.tsx` | 1512 | <Pressable onPress={onExpandSearch} style={({ pressed }) => [styles.discoveryEndSecondary, pressed && huddleButtons.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 424 | `app/src/screens/NativeChatsScreen.tsx` | 1549 | {buttonLabel ? <Pressable onPress={onPress} style={styles.webEmptyButton}><Text style={styles.webEmptyButtonText}>{buttonLabel}</Text></Pressable> : null} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 425 | `app/src/screens/NativeChatsScreen.tsx` | 1686 | <Pressable accessibilityLabel="Close" onPress={onClose} style={[nativeModalStyles.appMatchCloseButton, { top: Math.max(insets.top + huddleSpacing.x2, huddleSpacing.x4) }]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 426 | `app/src/screens/NativeChatsScreen.tsx` | 1698 | <Pressable key={reply} onPress={() => setQuickHello(reply)} style={({ pressed }) => [styles.matchQuickReplyChip, pressed && huddleButtons.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 427 | `app/src/screens/NativeChatsScreen.tsx` | 1713 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 428 | `app/src/screens/NativeChatsScreen.tsx` | 1716 | onPress={onQuickHello} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 429 | `app/src/screens/NativeChatsScreen.tsx` | 1722 | <Pressable accessibilityLabel="Keep exploring" onPress={onClose} style={styles.matchKeepExploring}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 430 | `app/src/screens/NativeChatsScreen.tsx` | 1797 | const [createGroupOpen, setCreateGroupOpen] = useState(false); | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 431 | `app/src/screens/NativeChatsScreen.tsx` | 1821 | const open = filterOpen \|\| groupExploreSortOpen \|\| premiumTier !== null \|\| confirmStarTarget !== null \|\| matchModal !== null \|\| profileSheetUserId !== null \|\| inviteInb | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 432 | `app/src/screens/NativeChatsScreen.tsx` | 1824 | }, [confirmStarTarget, createGroupOpen, filterOpen, groupDetails, groupExploreSortOpen, groupManagement, groupMemberReportTarget, inviteInboxOpen, joinCodeOpen, matchModal, onBotto | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 433 | `app/src/screens/NativeChatsScreen.tsx` | 2887 | const handleCreateGroup = useCallback(async () => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 434 | `app/src/screens/NativeChatsScreen.tsx` | 3453 | <Pressable onPress={() => handleTopTabPress("discover")} style={[nativeModalStyles.appTopSegmentButton, topTab === "discover" && nativeModalStyles.appTopSegmentButtonActive]}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 435 | `app/src/screens/NativeChatsScreen.tsx` | 3456 | <Pressable onPress={() => handleTopTabPress("chats")} style={[nativeModalStyles.appTopSegmentButton, topTab === "chats" && nativeModalStyles.appTopSegmentButtonActive]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 436 | `app/src/screens/NativeChatsScreen.tsx` | 3464 | <Pressable accessibilityLabel="Filter" onPress={() => setFilterOpen(true)} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 437 | `app/src/screens/NativeChatsScreen.tsx` | 3490 | <Pressable accessibilityLabel="Clear search" onPress={() => setSearchQuery("")} style={styles.searchClear}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 438 | `app/src/screens/NativeChatsScreen.tsx` | 3501 | <Pressable key={tab.key} onPress={() => handleMainTabPress(tab.key)} style={nativeModalStyles.appUnderlineTab}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 439 | `app/src/screens/NativeChatsScreen.tsx` | 3509 | <Pressable accessibilityLabel="Search" onPress={() => setSearchOpen((open) => !open)} style={styles.iconButtonSmall}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 440 | `app/src/screens/NativeChatsScreen.tsx` | 3517 | <Pressable onPress={() => setGroupSubTab("my")} style={[nativeModalStyles.appPillTab, groupSubTab === "my" && nativeModalStyles.appPillTabActive]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 441 | `app/src/screens/NativeChatsScreen.tsx` | 3520 | <Pressable onPress={() => setGroupSubTab("explore")} style={[nativeModalStyles.appPillTab, groupSubTab === "explore" && nativeModalStyles.appPillTabActive]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 442 | `app/src/screens/NativeChatsScreen.tsx` | 3526 | <Pressable accessibilityLabel="Sort groups" onPress={() => setGroupExploreSortOpen(true)} style={styles.iconButtonSmall}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 443 | `app/src/screens/NativeChatsScreen.tsx` | 3530 | <Pressable accessibilityLabel="Join with code" onPress={() => setJoinCodeOpen(true)} style={styles.iconButtonSmall}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 444 | `app/src/screens/NativeChatsScreen.tsx` | 3533 | <Pressable accessibilityLabel="Create Group" onPress={() => selfVerified ? setCreateGroupOpen(true) : setStatus("Get verified to start a group chat and coordinate your next local m | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 445 | `app/src/screens/NativeChatsScreen.tsx` | 3559 | onPress={() => { void handleDiscoverEnableLocation(); }} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 446 | `app/src/screens/NativeChatsScreen.tsx` | 3567 | {discoverRequestSettled && !loading && topTab === "discover" && discoveryQuotaLocked ? <NativeChatsEmptyState body={discoveryQuotaCopy} buttonLabel={effectiveTier === "free" ? "Upg | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 447 | `app/src/screens/NativeChatsScreen.tsx` | 3594 | <Pressable accessibilityLabel="Expand group invites" onPress={() => setGroupInviteBannerExpanded((expanded) => !expanded)} style={styles.groupInviteBannerCopy}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 448 | `app/src/screens/NativeChatsScreen.tsx` | 3601 | <Pressable accessibilityLabel="Not now for group invite" onPress={() => setDismissedInviteBannerIds((current) => new Set(current).add(firstPendingGroupInvite.inviteId \|\| firstPen | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 449 | `app/src/screens/NativeChatsScreen.tsx` | 3604 | <Pressable accessibilityLabel="Join group invite" onPress={() => void handleJoinExploreGroup(firstPendingGroupInvite)} style={styles.groupInviteBannerPrimary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 450 | `app/src/screens/NativeChatsScreen.tsx` | 3613 | <Pressable onPress={() => setPendingGroupInvitePrompt(group)} style={styles.groupInviteBannerRowCopy}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 451 | `app/src/screens/NativeChatsScreen.tsx` | 3618 | <Pressable accessibilityLabel={'Not now for ${group.name}'} onPress={() => setDismissedInviteBannerIds((current) => new Set(current).add(group.inviteId \|\| group.id))} style={styl | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 452 | `app/src/screens/NativeChatsScreen.tsx` | 3621 | <Pressable accessibilityLabel={'Join ${group.name}'} onPress={() => void handleJoinExploreGroup(group)} style={styles.groupInviteBannerPrimary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 453 | `app/src/screens/NativeChatsScreen.tsx` | 3634 | {!loading && topTab === "chats" && (mainTab !== "groups" \|\| groupSubTab !== "explore") && visibleRows.length > 0 ? <View style={styles.list}>{visibleRows.map((row) => mainTab === | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 454 | `app/src/screens/NativeChatsScreen.tsx` | 3637 | <Pressable style={styles.dropdownBackdrop} onPress={() => setGroupExploreSortOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 455 | `app/src/screens/NativeChatsScreen.tsx` | 3638 | <Pressable onPress={(event) => event.stopPropagation()} style={[styles.floatingDropdown, styles.groupSortDropdown]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 456 | `app/src/screens/NativeChatsScreen.tsx` | 3641 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 457 | `app/src/screens/NativeChatsScreen.tsx` | 3643 | onPress={() => { setGroupExploreSort(option.value); setGroupExploreSortOpen(false); }} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 458 | `app/src/screens/NativeChatsScreen.tsx` | 3768 | <NativeJoinWithCodeSheet open={joinCodeOpen} value={groupCodeDraft} onChange={setGroupCodeDraft} onClose={() => setJoinCodeOpen(false)} onSubmit={handleJoinCode} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 459 | `app/src/screens/NativeChatsScreen.tsx` | 3771 | <CreateGroupModal countryLabel={groupCountryDraft} cover={groupCoverDraft} creating={groupCreating} description={groupDescriptionDraft} joinMethod={groupJoinMethodDraft} location={ | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 460 | `app/src/screens/NativeChatsScreen.tsx` | 3806 | <Pressable accessibilityLabel={'Open ${group.name} details'} onPress={() => onOpen(group)} style={styles.exploreCover}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 461 | `app/src/screens/NativeChatsScreen.tsx` | 3810 | <Pressable accessibilityLabel={'Hide ${group.name}'} onPress={(event) => { event.stopPropagation(); onHide(group.id); }} hitSlop={8} style={styles.exploreHideButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 462 | `app/src/screens/NativeChatsScreen.tsx` | 3821 | <Pressable disabled={group.requested} onPress={() => onOpen(group)} style={[nativeModalStyles.appPrimaryPillButton, group.invitePending && styles.exploreCtaInvite, group.requested  | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 463 | `app/src/screens/NativeChatsScreen.tsx` | 3851 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 464 | `app/src/screens/NativeChatsScreen.tsx` | 3852 | <Pressable onPress={(event) => event.stopPropagation()} style={styles.groupDetailsEventBoundary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 465 | `app/src/screens/NativeChatsScreen.tsx` | 3856 | <AppModalIconButton accessibilityLabel="Close group invites" onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 466 | `app/src/screens/NativeChatsScreen.tsx` | 3866 | <Pressable accessibilityLabel={'Open ${group.name} invite'} onPress={() => onOpenGroup(group)} style={styles.inviteInboxIdentity}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 467 | `app/src/screens/NativeChatsScreen.tsx` | 3876 | <Pressable accessibilityLabel={'Decline ${group.name}'} onPress={() => setDecisions((current) => ({ ...current, [group.id]: "decline" }))} style={[styles.requestDecisionIcon, decis | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 468 | `app/src/screens/NativeChatsScreen.tsx` | 3879 | <Pressable accessibilityLabel={'Accept ${group.name}'} onPress={() => setDecisions((current) => ({ ...current, [group.id]: "accept" }))} style={[styles.requestDecisionIcon, decisio | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 469 | `app/src/screens/NativeChatsScreen.tsx` | 3890 | <AppModalButton disabled={selectedCount === 0 \|\| confirming} loading={confirming} onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 470 | `app/src/screens/NativeChatsScreen.tsx` | 3918 | <Pressable style={[nativeModalStyles.appModalBackdrop, styles.groupInvitePromptBackdrop]} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 471 | `app/src/screens/NativeChatsScreen.tsx` | 3919 | <Pressable style={styles.groupInvitePromptCard} onPress={(event) => event.stopPropagation()}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 472 | `app/src/screens/NativeChatsScreen.tsx` | 3929 | <Pressable accessibilityRole="button" onPress={onClose} style={nativeModalStyles.appModalSecondaryButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 473 | `app/src/screens/NativeChatsScreen.tsx` | 3934 | <Pressable accessibilityRole="button" onPress={() => onJoin(group)} style={nativeModalStyles.appModalPrimaryButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 474 | `app/src/screens/NativeChatsScreen.tsx` | 4002 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 475 | `app/src/screens/NativeChatsScreen.tsx` | 4003 | <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 476 | `app/src/screens/NativeChatsScreen.tsx` | 4007 | <AppModalIconButton accessibilityLabel="Close filters" onPress={onClose}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 477 | `app/src/screens/NativeChatsScreen.tsx` | 4025 | <Pressable onPress={() => groupLocked ? onLockedFilter(group.tier as StarUpgradeTier) : setExpandedTier(groupExpanded ? null : group.tier as StarUpgradeTier)} style={styles.filterC | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 478 | `app/src/screens/NativeChatsScreen.tsx` | 4035 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 479 | `app/src/screens/NativeChatsScreen.tsx` | 4036 | onPress={() => toggleRow ? patch({ [row.key]: !draftFilters[row.key] } as Partial<NativeChatDiscoveryFilters>) : toggleFilterRow(row.key, expanded)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 480 | `app/src/screens/NativeChatsScreen.tsx` | 4071 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 481 | `app/src/screens/NativeChatsScreen.tsx` | 4072 | onPress={() => toggleRow ? patch({ [row.key]: !draftFilters[row.key] } as Partial<NativeChatDiscoveryFilters>) : toggleFilterRow(row.key, expanded)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 482 | `app/src/screens/NativeChatsScreen.tsx` | 4100 | <AppModalButton variant="secondary" onPress={handleReset}><Text style={styles.modalSecondaryLabel}>Reset</Text></AppModalButton> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 483 | `app/src/screens/NativeChatsScreen.tsx` | 4101 | <AppModalButton onPress={handleApply}><Text style={styles.modalPrimaryLabel}>Apply Filters</Text></AppModalButton> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 484 | `app/src/screens/NativeChatsScreen.tsx` | 4152 | <Pressable accessibilityLabel="Close membership" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 485 | `app/src/screens/NativeChatsScreen.tsx` | 4153 | <Pressable style={[styles.upgradeCard, { backgroundColor: themeColor }]} onPress={(event) => event.stopPropagation()}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 486 | `app/src/screens/NativeChatsScreen.tsx` | 4155 | <Pressable accessibilityRole="button" accessibilityState={{ selected: billing === "monthly" }} onPress={() => setBilling("monthly")} style={[styles.upgradeBillingTab, billing !== " | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 487 | `app/src/screens/NativeChatsScreen.tsx` | 4158 | <Pressable accessibilityRole="button" accessibilityState={{ selected: billing === "annual" }} onPress={() => setBilling("annual")} style={[styles.upgradeBillingTab, billing !== "an | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 488 | `app/src/screens/NativeChatsScreen.tsx` | 4180 | <Pressable accessibilityRole="button" onPress={onUpgrade} style={styles.upgradeCta}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 489 | `app/src/screens/NativeChatsScreen.tsx` | 4183 | <Pressable accessibilityRole="button" onPress={onClose} style={styles.upgradeLaterButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 490 | `app/src/screens/NativeChatsScreen.tsx` | 4227 | return <Pressable onPress={() => onPatch({ [row]: !filters[row] } as Partial<NativeChatDiscoveryFilters>)} style={styles.toggleRow}><Text style={styles.filterLabel}>{label}</Text>< | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 491 | `app/src/screens/NativeChatsScreen.tsx` | 4242 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 492 | `app/src/screens/NativeChatsScreen.tsx` | 4246 | onPress={() => onChange(nextValues.length === options.length ? [] : nextValues)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 493 | `app/src/screens/NativeChatsScreen.tsx` | 4544 | <Pressable accessibilityLabel="Close group details" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 494 | `app/src/screens/NativeChatsScreen.tsx` | 4549 | <AppModalIconButton accessibilityLabel="Close" onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 495 | `app/src/screens/NativeChatsScreen.tsx` | 4558 | <Pressable accessibilityLabel="Change group avatar" onPress={onPickCover} style={[styles.createAvatarButton, detailsErrors.cover ? styles.createAvatarButtonError : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 496 | `app/src/screens/NativeChatsScreen.tsx` | 4595 | <Pressable accessibilityLabel="Change group avatar" onPress={onPickCover} style={styles.coverEmptyCameraOnly}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 497 | `app/src/screens/NativeChatsScreen.tsx` | 4623 | <Pressable onPress={() => setExpandedMetaEditor((current) => current === "location" ? null : "location")} style={[styles.groupMetaChip, expandedMetaEditor === "location" && styles. | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 498 | `app/src/screens/NativeChatsScreen.tsx` | 4627 | <Pressable onPress={() => setExpandedMetaEditor((current) => current === "pet" ? null : "pet")} style={[styles.groupMetaChip, expandedMetaEditor === "pet" && styles.groupMetaChipAc | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 499 | `app/src/screens/NativeChatsScreen.tsx` | 4654 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 500 | `app/src/screens/NativeChatsScreen.tsx` | 4656 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 501 | `app/src/screens/NativeChatsScreen.tsx` | 4674 | <Pressable accessibilityRole="button" onPress={() => setPetFocusOpen((current) => !current)} style={[nativeModalStyles.appModalSelectTrigger, styles.createSelectTrigger, petFocusOp | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 502 | `app/src/screens/NativeChatsScreen.tsx` | 4689 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 503 | `app/src/screens/NativeChatsScreen.tsx` | 4693 | onPress={() => togglePetFocusSpecies(option)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 504 | `app/src/screens/NativeChatsScreen.tsx` | 4732 | <Pressable onPress={() => setPetFocusBreedOpen((current) => current === species ? null : species)} style={[styles.petFocusBreedTrigger, petFocusBreedOpen === species ? nativeModalS | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 505 | `app/src/screens/NativeChatsScreen.tsx` | 4739 | <Pressable key={breedOption} onPress={() => { setPetFocusBreed(species, breedOption); setPetFocusBreedOpen(null); }} style={[styles.petFocusBreedOption, breed === breedOption ? sty | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 506 | `app/src/screens/NativeChatsScreen.tsx` | 4760 | <Pressable accessibilityLabel={editCover ? "Save group avatar" : "Change group avatar"} onPress={editCover ? onSaveDetails : onPickCover} style={styles.heroOverlayAction}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 507 | `app/src/screens/NativeChatsScreen.tsx` | 4787 | <Pressable onPress={() => setJoinRequestsOpen((open) => !open)} style={styles.managementActionHeader}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 508 | `app/src/screens/NativeChatsScreen.tsx` | 4801 | <Pressable accessibilityLabel={'Open ${request.name \|\| "requester"} profile'} onPress={() => onOpenMemberProfile(request.userId)} style={styles.memberIdentity}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 509 | `app/src/screens/NativeChatsScreen.tsx` | 4806 | <Pressable onPress={() => setRequestDecisions((current) => ({ ...current, [request.id]: "decline" }))} style={[styles.requestDecisionIcon, decision === "approve" && styles.requestD | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 510 | `app/src/screens/NativeChatsScreen.tsx` | 4809 | <Pressable onPress={() => setRequestDecisions((current) => ({ ...current, [request.id]: "approve" }))} style={[styles.requestDecisionIcon, decision === "decline" && styles.requestD | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 511 | `app/src/screens/NativeChatsScreen.tsx` | 4818 | <AppModalButton disabled={selectedRequestCount === 0 \|\| requestConfirming} loading={requestConfirming} onPress={() => { void confirmJoinRequestDecisions(); }}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 512 | `app/src/screens/NativeChatsScreen.tsx` | 4828 | <Pressable onPress={() => setInviteEditorOpen((open) => !open)} style={styles.managementActionHeader}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 513 | `app/src/screens/NativeChatsScreen.tsx` | 4853 | <Pressable accessibilityLabel="Clear invite search" onPress={() => setInviteSearch("")} style={styles.searchClear}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 514 | `app/src/screens/NativeChatsScreen.tsx` | 4867 | <Pressable key={userId} onPress={() => setInviteDraft((current) => active ? current.filter((id) => id !== userId) : [...current, userId])} style={styles.inviteMemberRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 515 | `app/src/screens/NativeChatsScreen.tsx` | 4868 | <Pressable accessibilityLabel={'Open ${name} profile'} onPress={(event) => { event.stopPropagation(); onOpenMemberProfile(userId); }} style={styles.memberIdentity}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 516 | `app/src/screens/NativeChatsScreen.tsx` | 4880 | {inviteDraft.length ? <AppModalButton onPress={() => { onInviteMembers(group, inviteDraft); setInviteDraft([]); setInviteEditorOpen(false); }}><Text style={styles.modalPrimaryLabel | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 517 | `app/src/screens/NativeChatsScreen.tsx` | 4884 | <Pressable accessibilityLabel={'Open ${invite.name \|\| "invited user"} profile'} onPress={() => onOpenMemberProfile(invite.userId)} style={[styles.memberIdentity, styles.pendingIn | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 518 | `app/src/screens/NativeChatsScreen.tsx` | 4891 | <Pressable accessibilityLabel={'Cancel invite for ${invite.name \|\| "member"}'} onPress={() => onCancelInvite(group, invite)} hitSlop={8}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 519 | `app/src/screens/NativeChatsScreen.tsx` | 4901 | <Pressable disabled={groupActionBusy === "mute"} onPress={() => { void toggleGroupMute(); }} style={({ pressed }) => [styles.groupSheetActionButton, pressed && styles.pressed, grou | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 520 | `app/src/screens/NativeChatsScreen.tsx` | 4908 | <Pressable onPress={() => setGroupActionConfirm(canManage ? "remove" : "leave")} style={({ pressed }) => [styles.groupSheetActionButton, pressed && styles.pressed]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 521 | `app/src/screens/NativeChatsScreen.tsx` | 4922 | <Pressable accessibilityLabel={'Open ${member.name \|\| "member"} profile'} onPress={() => onOpenMemberProfile(member.userId)} style={styles.memberIdentity}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 522 | `app/src/screens/NativeChatsScreen.tsx` | 4928 | <Pressable accessibilityLabel={'Member actions for ${member.name \|\| "member"}'} onPress={(event) => openMemberActionMenu(member, event)} style={styles.iconButtonSmall}><Feather c | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 523 | `app/src/screens/NativeChatsScreen.tsx` | 4951 | <Pressable accessibilityLabel={'Open ${member.name \|\| "member"} profile'} onPress={() => onOpenMemberProfile(member.userId)} style={styles.memberIdentity}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 524 | `app/src/screens/NativeChatsScreen.tsx` | 4967 | <AppModalButton variant="secondary" onPress={() => onDeclineInvite(group)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 525 | `app/src/screens/NativeChatsScreen.tsx` | 4970 | <AppModalButton onPress={() => onJoin(group)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 526 | `app/src/screens/NativeChatsScreen.tsx` | 4975 | <AppModalButton disabled={group.requested} variant={group.requested ? "secondary" : "primary"} onPress={() => onJoin(group)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 527 | `app/src/screens/NativeChatsScreen.tsx` | 4982 | <AppModalButton variant="secondary" onPress={() => onOpenChat(group)}><Text style={styles.modalSecondaryLabel}>Open Group</Text></AppModalButton> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 528 | `app/src/screens/NativeChatsScreen.tsx` | 4983 | <AppModalButton onPress={onSaveDetails}><Text style={styles.modalPrimaryLabel}>Save</Text></AppModalButton> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 529 | `app/src/screens/NativeChatsScreen.tsx` | 4986 | <AppModalButton onPress={() => onOpenChat(group)}><Text style={styles.modalPrimaryLabel}>Open Group</Text></AppModalButton> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 530 | `app/src/screens/NativeChatsScreen.tsx` | 4995 | <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={closeMemberActionMenu} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 531 | `app/src/screens/NativeChatsScreen.tsx` | 5034 | <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalBottomSafeArea]} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 532 | `app/src/screens/NativeChatsScreen.tsx` | 5035 | <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appBottomSheetEventBoundary}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 533 | `app/src/screens/NativeChatsScreen.tsx` | 5039 | <AppModalIconButton accessibilityLabel="Close" onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 534 | `app/src/screens/NativeChatsScreen.tsx` | 5062 | <AppModalButton disabled={normalized.length !== 6} onPress={onSubmit}><Text style={styles.modalPrimaryLabel}>Join</Text></AppModalButton> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 535 | `app/src/screens/NativeChatsScreen.tsx` | 5124 | const createGroupScrollRef = useRef<ScrollView \| null>(null); | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 536 | `app/src/screens/NativeChatsScreen.tsx` | 5166 | createGroupScrollRef.current?.scrollTo({ y, animated: true }); | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 537 | `app/src/screens/NativeChatsScreen.tsx` | 5231 | <Pressable accessibilityLabel="Close create group" style={StyleSheet.absoluteFillObject} onPress={onClose} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 538 | `app/src/screens/NativeChatsScreen.tsx` | 5236 | <AppModalIconButton accessibilityLabel="Close" onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 539 | `app/src/screens/NativeChatsScreen.tsx` | 5241 | ref={createGroupScrollRef} | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 540 | `app/src/screens/NativeChatsScreen.tsx` | 5253 | <Pressable accessibilityLabel="Upload group avatar" onPress={onPickCover} style={styles.createAvatarButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 541 | `app/src/screens/NativeChatsScreen.tsx` | 5287 | <Pressable accessibilityLabel="Remove cover photo" onPress={onRemoveCover} style={styles.coverActionButton}><Feather color={huddleColors.onPrimary} name="trash-2" size={20} /></Pre | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 542 | `app/src/screens/NativeChatsScreen.tsx` | 5288 | <Pressable accessibilityLabel="Change cover photo" onPress={onPickCover} style={styles.coverActionButton}><Feather color={huddleColors.onPrimary} name="camera" size={20} /></Pressa | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 543 | `app/src/screens/NativeChatsScreen.tsx` | 5291 | <Pressable accessibilityLabel="Add cover photo" onPress={onPickCover} style={styles.coverEmptyAction}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 544 | `app/src/screens/NativeChatsScreen.tsx` | 5327 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 545 | `app/src/screens/NativeChatsScreen.tsx` | 5329 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 546 | `app/src/screens/NativeChatsScreen.tsx` | 5346 | <Pressable accessibilityRole="button" onPress={() => setPetFocusOpen((current) => !current)} style={[nativeModalStyles.appModalSelectTrigger, styles.createSelectTrigger, petFocusOp | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 547 | `app/src/screens/NativeChatsScreen.tsx` | 5361 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 548 | `app/src/screens/NativeChatsScreen.tsx` | 5365 | onPress={() => togglePetFocusSpecies(option)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 549 | `app/src/screens/NativeChatsScreen.tsx` | 5404 | <Pressable onPress={() => setPetFocusBreedOpen((current) => current === species ? null : species)} style={[styles.petFocusBreedTrigger, petFocusBreedOpen === species ? nativeModalS | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 550 | `app/src/screens/NativeChatsScreen.tsx` | 5411 | <Pressable key={breedOption} onPress={() => { setPetFocusBreed(species, breedOption); setPetFocusBreedOpen(null); }} style={[styles.petFocusBreedOption, breed === breedOption ? sty | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 551 | `app/src/screens/NativeChatsScreen.tsx` | 5425 | <Pressable onPress={() => onChangeVisibility("public")} style={[nativeModalStyles.appOptionCard, visibility === "public" && nativeModalStyles.appOptionCardActive]}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 552 | `app/src/screens/NativeChatsScreen.tsx` | 5432 | <Pressable onPress={() => { onChangeVisibility("private"); onChangeJoinMethod("request"); }} style={[nativeModalStyles.appOptionCard, visibility === "private" && nativeModalStyles. | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 553 | `app/src/screens/NativeChatsScreen.tsx` | 5445 | <Pressable onPress={() => onChangeJoinMethod("request")} style={[nativeModalStyles.appOptionCard, joinMethod === "request" && nativeModalStyles.appOptionCardActive]}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 554 | `app/src/screens/NativeChatsScreen.tsx` | 5452 | <Pressable onPress={() => onChangeJoinMethod("instant")} style={[nativeModalStyles.appOptionCard, joinMethod === "instant" && nativeModalStyles.appOptionCardActive]}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 555 | `app/src/screens/NativeChatsScreen.tsx` | 5465 | <AppModalButton disabled={creating} loading={creating} onPress={submitCreateGroup}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 556 | `app/src/screens/NativeEditProfileScreen.tsx` | 1259 | const saveProfile = async ({ silent = false }: { silent?: boolean } = {}) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 557 | `app/src/screens/NativeEditProfileScreen.tsx` | 1394 | <Pressable onPress={() => void loadProfile()} style={styles.primaryButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 558 | `app/src/screens/NativeEditProfileScreen.tsx` | 1406 | <Pressable accessibilityLabel="Back" onPress={onGoBack} style={styles.backButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 559 | `app/src/screens/NativeEditProfileScreen.tsx` | 1414 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 560 | `app/src/screens/NativeEditProfileScreen.tsx` | 1417 | onPress={() => void saveProfile()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 561 | `app/src/screens/NativeEditProfileScreen.tsx` | 1429 | <Pressable onPress={() => setViewMode("edit")} style={[styles.tabButton, viewMode === "edit" ? styles.tabButtonActive : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 562 | `app/src/screens/NativeEditProfileScreen.tsx` | 1432 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 563 | `app/src/screens/NativeEditProfileScreen.tsx` | 1433 | onPress={() => void silentSaveDraftForPreview().finally(() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 564 | `app/src/screens/NativeEditProfileScreen.tsx` | 1536 | <Pressable disabled={saving} onPress={() => void saveProfile()} style={[styles.primaryButton, saving ? styles.disabled : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 565 | `app/src/screens/NativeEditProfileScreen.tsx` | 1539 | <Pressable disabled={saving} onPress={saveDraft} style={[styles.secondaryButton, saving ? styles.disabled : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 566 | `app/src/screens/NativeHomeScreen.tsx` | 761 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 567 | `app/src/screens/NativeHomeScreen.tsx` | 765 | onPress={() => onNavigate("/edit-profile")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 568 | `app/src/screens/NativeHomeScreen.tsx` | 838 | <Pressable accessibilityRole="button" onPress={() => void loadHome({ showLoading: true })} style={styles.retryButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 569 | `app/src/screens/NativeHomeScreen.tsx` | 865 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 570 | `app/src/screens/NativeHomeScreen.tsx` | 868 | onPress={() => onNavigate("/edit-pet-profile")} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 571 | `app/src/screens/NativeHomeScreen.tsx` | 897 | onPress={() => onNavigate('/pet-details?id=${pet.id}')} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 572 | `app/src/screens/NativeHomeScreen.tsx` | 901 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 573 | `app/src/screens/NativeHomeScreen.tsx` | 904 | onPress={() => onNavigate("/edit-pet-profile")} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 574 | `app/src/screens/NativeHomeScreen.tsx` | 969 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 575 | `app/src/screens/NativeHomeScreen.tsx` | 971 | onPress={onPress} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 576 | `app/src/screens/NativeHomeScreen.tsx` | 974 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 577 | `app/src/screens/NativeHomeScreen.tsx` | 977 | onPress={(event) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 578 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 281 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 579 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 286 | onPress={() => setSelectedAddons((current) => ({ ...current, [row.id]: !current[row.id] }))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 580 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 293 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 581 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 297 | onPress={() => undefined} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 582 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 329 | <Pressable onPress={() => setBilling("monthly")} style={[styles.billingTab, !isAnnual ? null : styles.billingTabInactiveRight]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 583 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 332 | <Pressable onPress={() => setBilling("annual")} style={[styles.billingTab, isAnnual ? null : styles.billingTabInactiveLeft]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 584 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 367 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 585 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 371 | onPress={() => undefined} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 586 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 379 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 587 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 382 | onPress={() => undefined} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 588 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 399 | <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack} style={({ pressed }) => [styles.returnArrow, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 589 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 423 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 590 | `app/src/screens/NativeManageSubscriptionScreen.tsx` | 426 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 591 | `app/src/screens/NativeMapScreen.tsx` | 1284 | onPress={(event) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 592 | `app/src/screens/NativeMapScreen.tsx` | 1317 | <Pressable accessibilityLabel="Open my profile" accessibilityRole="button" onPress={() => setProfileModalUserId(effectiveUserId)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 593 | `app/src/screens/NativeMapScreen.tsx` | 1338 | <Pressable accessibilityLabel={'Open ${item.friend.display_name \|\| "friend"} profile'} accessibilityRole="button" onPress={() => setProfileModalUserId(item.friend.id)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 594 | `app/src/screens/NativeMapScreen.tsx` | 1351 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 595 | `app/src/screens/NativeMapScreen.tsx` | 1355 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 596 | `app/src/screens/NativeMapScreen.tsx` | 1458 | onPress={() => setShowAlerts((value) => !value)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 597 | `app/src/screens/NativeMapScreen.tsx` | 1464 | onPress={() => setShowFriends((value) => !value)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 598 | `app/src/screens/NativeMapScreen.tsx` | 1471 | onPress={refreshReadOnlyData} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 599 | `app/src/screens/NativeMapScreen.tsx` | 1480 | onPress={() => void toggleInvisible()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 600 | `app/src/screens/NativeMapScreen.tsx` | 1487 | onPress={handlePinToggle} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 601 | `app/src/screens/NativeMapScreen.tsx` | 1538 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 602 | `app/src/screens/NativeMapScreen.tsx` | 1542 | onPress={() => void searchBroadcastManualLocation()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 603 | `app/src/screens/NativeMapScreen.tsx` | 1563 | <Pressable accessibilityLabel="Cancel alert pin" accessibilityRole="button" onPress={cancelBroadcastPinning} style={styles.pickLocationCancel}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 604 | `app/src/screens/NativeMapScreen.tsx` | 1566 | <Pressable accessibilityLabel="Place alert pin here" accessibilityRole="button" onPress={confirmBroadcastPinning} style={styles.pickLocationConfirm}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 605 | `app/src/screens/NativeMapScreen.tsx` | 1577 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 606 | `app/src/screens/NativeMapScreen.tsx` | 1590 | <Pressable accessibilityLabel="Zoom in" accessibilityRole="button" onPress={() => { haptic.toggleControl(); handleZoomChange(1); }} style={styles.zoomButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 607 | `app/src/screens/NativeMapScreen.tsx` | 1593 | <Pressable accessibilityLabel="Zoom out" accessibilityRole="button" onPress={() => { haptic.toggleControl(); handleZoomChange(-1); }} style={[styles.zoomButton, styles.zoomButtonMi | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 608 | `app/src/screens/NativeMapScreen.tsx` | 1596 | <Pressable accessibilityLabel="Recenter" accessibilityRole="button" onPress={() => { haptic.toggleControl(); void handleLocationPress(); }} style={styles.zoomButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 609 | `app/src/screens/NativeMapScreen.tsx` | 1864 | <Pressable style={styles.nativeConfirmationBackdrop} onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 610 | `app/src/screens/NativeMapScreen.tsx` | 1865 | <Pressable onPress={(event) => event.stopPropagation()}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 611 | `app/src/screens/NativeMapScreen.tsx` | 1869 | <AppModalIconButton accessibilityLabel="Close" onPress={onClose}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 612 | `app/src/screens/NativeMapScreen.tsx` | 1882 | <AppModalButton variant={primaryVariant === "danger" ? "destructive" : "primary"} onPress={onPrimary}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 613 | `app/src/screens/NativeMapScreen.tsx` | 1919 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 614 | `app/src/screens/NativeMapScreen.tsx` | 1924 | onPress={onPress ? () => { haptic.toggleControl(); onPress(); } : undefined} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 615 | `app/src/screens/NativePetDetailsScreen.tsx` | 105 | <Pressable accessibilityRole="button" onPress={() => onNavigate("/")} style={styles.homeButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 616 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 520 | <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={handleBackToSettingsDrawer} style={styles.backButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 617 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 527 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 618 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 531 | onPress={() => setPublicProfileOpen(true)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 619 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 577 | <ActionRow icon="star" label="Manage Membership" value={display.tierLabel} onPress={() => onNavigate("/premium")} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 620 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 590 | onPress={() => void persistPrivacy({ nonSocial: profile?.non_social !== true, hideFromMap: profile?.hide_from_map === true }, "discovery")} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 621 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 599 | onPress={() => void persistPrivacy({ nonSocial: profile?.non_social === true, hideFromMap: profile?.hide_from_map !== true }, "map-privacy")} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 622 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 613 | onPress={() => { | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 623 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 632 | <ActionRow icon="edit-3" label="Edit profile" onPress={() => onNavigate("/edit-profile")} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 624 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 634 | <ActionRow icon="shield" label="Identity Verification" value={display.verification} onPress={() => onNavigate("/verify-identity")} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 625 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 636 | <ActionRow icon="lock" label="Security" onPress={() => onNavigate("/settings/security")} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 626 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 642 | onPress={() => setConfirmMode("logout")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 627 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 645 | <ActionRow danger icon="trash-2" label="Delete Account" onPress={() => setDeleteOpen(true)} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 628 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 714 | <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.actionRow}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 629 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 757 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 630 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 761 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 631 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 798 | <Pressable onPress={onClose} style={styles.modalBackdrop}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 632 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 799 | <Pressable style={styles.modalCard}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 633 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 806 | <Pressable onPress={onClose} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 634 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 809 | <Pressable onPress={onConfirm} style={({ pressed }) => [styles.modalButton, styles.modalPrimaryButton, copy.danger && styles.modalDangerButton, pressed && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 635 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 842 | <Pressable onPress={onClose} style={styles.modalBackdrop}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 636 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 843 | <Pressable style={styles.modalCard}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 637 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 857 | <Pressable disabled={busy} onPress={onClose} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && !busy && styles.pressed]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 638 | `app/src/screens/NativeProfileSummaryScreen.tsx` | 860 | <Pressable disabled={busy} onPress={onConfirm} style={({ pressed }) => [styles.modalButton, styles.modalDangerButton, pressed && !busy && styles.pressed]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 639 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 382 | <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={handleBackToAccountSettings} style={styles.backButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 640 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 404 | <Pressable disabled style={[styles.primaryButton, styles.disabledButton]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 641 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 411 | <Pressable onPress={() => setRemovePasskeyOpen(true)} style={styles.dangerRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 642 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 433 | <Pressable disabled={mfaLoading} onPress={() => void handleStartMfaSetup()} style={({ pressed }) => [styles.primaryButton, (pressed \|\| mfaLoading) && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 643 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 443 | <Pressable onPress={() => void handleOpenAuthApp()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 644 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 468 | <Pressable disabled={otpCode.length < 6 \|\| !totpFactorId \|\| mfaPhase === "verifying"} onPress={() => void handleVerifyCode()} style={({ pressed }) => [styles.primaryButton, (pr | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 645 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 471 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 646 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 472 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 647 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 488 | <Pressable onPress={() => setDisableMfaOpen(true)} style={styles.dangerRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 648 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 498 | <Pressable onPress={() => setPasswordOpen(true)} style={styles.statusRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 649 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 524 | <Pressable onPress={() => setPasswordOpen(false)} style={styles.modalBackdrop}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 650 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 525 | <Pressable style={styles.modalCard}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 651 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 580 | <Pressable disabled={passwordBusy} onPress={() => setPasswordOpen(false)} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 652 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 583 | <Pressable disabled={passwordBusy \|\| !currentPassword \|\| !newPassword \|\| !confirmPassword \|\| !turnstileToken.trim()} onPress={() => void handleChangePassword()} style={({ p | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 653 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 611 | <Pressable onPress={onClose} style={styles.modalBackdrop}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 654 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 612 | <Pressable style={styles.modalCard}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 655 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 616 | <Pressable onPress={onClose} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 656 | `app/src/screens/NativeSecuritySettingsScreen.tsx` | 619 | <Pressable onPress={onConfirm} style={({ pressed }) => [styles.modalButton, styles.modalDangerButton, pressed && styles.pressed]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 657 | `app/src/screens/NativeServiceScreen.tsx` | 138 | <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.providerCardShadow, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 658 | `app/src/screens/NativeServiceScreen.tsx` | 179 | <Pressable accessibilityRole="button" accessibilityLabel={provider.isBookmarked ? "Remove bookmark" : "Bookmark provider"} onPress={onBookmark} hitSlop={10} style={({ pressed }) => | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 659 | `app/src/screens/NativeServiceScreen.tsx` | 206 | <Pressable onPress={onPress} style={({ pressed }) => [styles.emptySecondaryButton, pressed ? huddleButtons.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 660 | `app/src/screens/NativeServiceScreen.tsx` | 453 | const handleBookmark = async (providerUserId: string) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 661 | `app/src/screens/NativeServiceScreen.tsx` | 523 | const requestService = async (providerUserId: string) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 662 | `app/src/screens/NativeServiceScreen.tsx` | 594 | <Pressable accessibilityLabel="Open filters" onPress={() => openPanel("filters")} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 663 | `app/src/screens/NativeServiceScreen.tsx` | 597 | <Pressable accessibilityLabel="Choose service date" onPress={() => openPanel("dates")} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 664 | `app/src/screens/NativeServiceScreen.tsx` | 600 | <Pressable accessibilityLabel="Sort services" onPress={() => openPanel("sort")} style={styles.iconButton}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 665 | `app/src/screens/NativeServiceScreen.tsx` | 610 | <Pressable onPress={() => void load()} style={styles.primaryButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 666 | `app/src/screens/NativeServiceScreen.tsx` | 624 | <ServiceEmptyCard body="No providers match these filters." buttonLabel="Expand Filter" onPress={() => openPanel("filters")} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 667 | `app/src/screens/NativeServiceScreen.tsx` | 634 | onBookmark={() => void handleBookmark(item.userId)} | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 668 | `app/src/screens/NativeServiceScreen.tsx` | 644 | onBookmark={() => void handleBookmark(item.userId)} | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 669 | `app/src/screens/NativeServiceScreen.tsx` | 654 | <Pressable style={styles.dropdownBackdrop} onPress={closePanel}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 670 | `app/src/screens/NativeServiceScreen.tsx` | 655 | <Pressable onPress={(event) => event.stopPropagation()} style={[styles.floatingDropdown, styles.sortDropdown]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 671 | `app/src/screens/NativeServiceScreen.tsx` | 659 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 672 | `app/src/screens/NativeServiceScreen.tsx` | 661 | onPress={() => { updateFilter({ sort: option.value }); closePanel(); }} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 673 | `app/src/screens/NativeServiceScreen.tsx` | 676 | <Pressable accessibilityLabel="Close service sheet" accessibilityRole="button" onPress={closePanel} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 674 | `app/src/screens/NativeServiceScreen.tsx` | 701 | onPress={() => toggleFilterDropdown("serviceTypes", 132)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 675 | `app/src/screens/NativeServiceScreen.tsx` | 703 | <OptionList options={NATIVE_SERVICE_TYPES} selected={filterDraft.serviceTypes} onToggle={(serviceTypes) => setFilterDraft((prev) => ({ ...prev, serviceTypes }))} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 676 | `app/src/screens/NativeServiceScreen.tsx` | 710 | onPress={() => toggleFilterDropdown("petTypes", 250)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 677 | `app/src/screens/NativeServiceScreen.tsx` | 712 | <OptionList options={NATIVE_SERVICE_PET_TYPES} selected={filterDraft.petTypes} onToggle={(petTypes) => setFilterDraft((prev) => ({ ...prev, petTypes }))} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 678 | `app/src/screens/NativeServiceScreen.tsx` | 719 | onPress={() => toggleFilterDropdown("dogSizes", 368)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 679 | `app/src/screens/NativeServiceScreen.tsx` | 721 | <OptionList options={NATIVE_SERVICE_DOG_SIZES} selected={filterDraft.dogSizes} onToggle={(dogSizes) => setFilterDraft((prev) => ({ ...prev, dogSizes }))} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 680 | `app/src/screens/NativeServiceScreen.tsx` | 728 | onPress={() => toggleFilterDropdown("locationStyles", 486)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 681 | `app/src/screens/NativeServiceScreen.tsx` | 730 | <OptionList options={NATIVE_SERVICE_LOCATION_STYLES} selected={filterDraft.locationStyles} onToggle={(locationStyles) => setFilterDraft((prev) => ({ ...prev, locationStyles }))} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 682 | `app/src/screens/NativeServiceScreen.tsx` | 737 | <Pressable accessibilityLabel="Previous month" onPress={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} style={styles.dateArrowButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 683 | `app/src/screens/NativeServiceScreen.tsx` | 741 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 684 | `app/src/screens/NativeServiceScreen.tsx` | 743 | onPress={() => toggleDateDropdown("month")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 685 | `app/src/screens/NativeServiceScreen.tsx` | 750 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 686 | `app/src/screens/NativeServiceScreen.tsx` | 752 | onPress={() => toggleDateDropdown("year")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 687 | `app/src/screens/NativeServiceScreen.tsx` | 758 | <Pressable accessibilityLabel="Next month" onPress={() => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} style={styles.dateArrowButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 688 | `app/src/screens/NativeServiceScreen.tsx` | 797 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 689 | `app/src/screens/NativeServiceScreen.tsx` | 800 | onPress={() => setDateDraftDates((prev) => prev.includes(cell.iso!) ? prev.filter((item) => item !== cell.iso) : [...prev, cell.iso!])} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 690 | `app/src/screens/NativeServiceScreen.tsx` | 818 | <AppModalButton | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 691 | `app/src/screens/NativeServiceScreen.tsx` | 820 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 692 | `app/src/screens/NativeServiceScreen.tsx` | 832 | <AppModalButton | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 693 | `app/src/screens/NativeServiceScreen.tsx` | 833 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 694 | `app/src/screens/NativeServiceScreen.tsx` | 860 | <Pressable accessibilityLabel="Close provider profile" accessibilityRole="button" onPress={closeProvider} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 695 | `app/src/screens/NativeServiceScreen.tsx` | 867 | <AppModalIconButton accessibilityLabel="Close provider profile" onPress={closeProvider}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 696 | `app/src/screens/NativeServiceScreen.tsx` | 884 | <NativeCarerProfileContent provider={activeProvider} showRequestAction canRequestService={!serviceDisabled} onRequestService={() => void requestService(activeProvider.userId)} /> | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 697 | `app/src/screens/NativeServiceScreen.tsx` | 914 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 698 | `app/src/screens/NativeServiceScreen.tsx` | 916 | onPress={() => onToggle(toggleString(selected, option))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 699 | `app/src/screens/NativeServiceScreen.tsx` | 940 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 700 | `app/src/screens/NativeServiceScreen.tsx` | 942 | onPress={() => onSelect(option)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 701 | `app/src/screens/NativeServiceScreen.tsx` | 972 | <Pressable onPress={onPress} style={({ pressed }) => [styles.filterSelectButton, open ? styles.fieldFocused : null, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 702 | `app/src/screens/NativeServiceScreen.tsx` | 985 | <Pressable onPress={() => onChange(!value)} style={styles.toggleRow}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 703 | `app/src/screens/NativeSetPetScreen.tsx` | 200 | const savePetRowWithToken = async ( | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 704 | `app/src/screens/NativeSetPetScreen.tsx` | 716 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 705 | `app/src/screens/NativeSetPetScreen.tsx` | 718 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 706 | `app/src/screens/NativeSetPetScreen.tsx` | 728 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 707 | `app/src/screens/NativeSetPetScreen.tsx` | 730 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 708 | `app/src/screens/NativeSetPetScreen.tsx` | 740 | <Pressable accessibilityRole="switch" accessibilityState={{ checked }} onPress={onPress} style={[styles.webToggleTrack, checked ? styles.webToggleTrackChecked : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 709 | `app/src/screens/NativeSetPetScreen.tsx` | 763 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 710 | `app/src/screens/NativeSetPetScreen.tsx` | 765 | onPress={() => onSelect(option)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 711 | `app/src/screens/NativeSetPetScreen.tsx` | 806 | <Pressable accessibilityRole="button" onPress={onToggle} style={styles.dateIconButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 712 | `app/src/screens/NativeSetPetScreen.tsx` | 842 | <Pressable key={year} onPress={() => updatePart({ year })} style={[styles.inlineDateOption, year === parts.year ? styles.inlineDateOptionActive : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 713 | `app/src/screens/NativeSetPetScreen.tsx` | 849 | <Pressable key={month} onPress={() => updatePart({ month })} style={[styles.inlineDateOption, month === parts.month ? styles.inlineDateOptionActive : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 714 | `app/src/screens/NativeSetPetScreen.tsx` | 856 | <Pressable key={day} onPress={() => updatePart({ day })} style={[styles.inlineDateOption, day === parts.day ? styles.inlineDateOptionActive : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 715 | `app/src/screens/NativeSetPetScreen.tsx` | 1196 | const savePet = async (draftOnly: boolean) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 716 | `app/src/screens/NativeSetPetScreen.tsx` | 1217 | await savePetRowWithToken(targetPetId, session.userId, { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 717 | `app/src/screens/NativeSetPetScreen.tsx` | 1268 | await savePetRowWithToken(savedPetId, session.userId, payload, false, session.token); | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 718 | `app/src/screens/NativeSetPetScreen.tsx` | 1380 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 719 | `app/src/screens/NativeSetPetScreen.tsx` | 1382 | onPress={() => { | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 720 | `app/src/screens/NativeSetPetScreen.tsx` | 1401 | <Pressable | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 721 | `app/src/screens/NativeSetPetScreen.tsx` | 1404 | onPress={() => void savePet(onboardingMode)} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 722 | `app/src/screens/NativeSetPetScreen.tsx` | 1416 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 723 | `app/src/screens/NativeSetPetScreen.tsx` | 1418 | onPress={() => setProfileMode("edit")} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 724 | `app/src/screens/NativeSetPetScreen.tsx` | 1423 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 725 | `app/src/screens/NativeSetPetScreen.tsx` | 1425 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 726 | `app/src/screens/NativeSetPetScreen.tsx` | 1453 | <Pressable accessibilityRole="button" onPress={pickPhoto} style={styles.photoWrap}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 727 | `app/src/screens/NativeSetPetScreen.tsx` | 1491 | onPress={() => updateForm({ species: species.id, breed: species.id === "others" ? "" : form.breed })} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 728 | `app/src/screens/NativeSetPetScreen.tsx` | 1518 | <Pressable onPress={() => toggleSelectField("breed")} style={[styles.selectField, selectTarget === "breed" \|\| focusedField === "breed" ? styles.inputFocused : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 729 | `app/src/screens/NativeSetPetScreen.tsx` | 1539 | <GenderChip key={gender} label={gender} selected={form.gender === gender} onPress={() => updateForm({ gender })} /> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 730 | `app/src/screens/NativeSetPetScreen.tsx` | 1543 | <Pressable onPress={() => updateForm({ neuteredSpayed: !form.neuteredSpayed })} style={styles.checkboxPill}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 731 | `app/src/screens/NativeSetPetScreen.tsx` | 1582 | onToggle={() => toggleDateField("dob")} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 732 | `app/src/screens/NativeSetPetScreen.tsx` | 1610 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 733 | `app/src/screens/NativeSetPetScreen.tsx` | 1611 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 734 | `app/src/screens/NativeSetPetScreen.tsx` | 1646 | <Pressable onPress={() => toggleSelectField("temperament")} style={[styles.selectField, selectTarget === "temperament" \|\| focusedField === "temperament" ? styles.inputFocused : n | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 735 | `app/src/screens/NativeSetPetScreen.tsx` | 1709 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 736 | `app/src/screens/NativeSetPetScreen.tsx` | 1711 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 737 | `app/src/screens/NativeSetPetScreen.tsx` | 1723 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 738 | `app/src/screens/NativeSetPetScreen.tsx` | 1725 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 739 | `app/src/screens/NativeSetPetScreen.tsx` | 1737 | <Pressable onPress={() => updateForm({ vetVisitRecords: form.vetVisitRecords.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 740 | `app/src/screens/NativeSetPetScreen.tsx` | 1744 | <Pressable ref={setFieldRef("visitReason")} onPress={() => toggleSelectField("visitReason")} style={[styles.selectField, selectTarget === "visitReason" \|\| focusedField === "visit | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 741 | `app/src/screens/NativeSetPetScreen.tsx` | 1758 | <DateField focused={dateTarget === "visitDate" \|\| focusedField === "visitDate"} onBlur={() => setFocusedField(null)} onChangeText={(visitDate) => setVisitDraft((current) => ({ .. | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 742 | `app/src/screens/NativeSetPetScreen.tsx` | 1769 | <Pressable ref={setFieldRef("vaccine")} onPress={() => toggleSelectField("vaccine")} style={[styles.selectField, selectTarget === "vaccine" \|\| focusedField === "vaccine" ? styles | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 743 | `app/src/screens/NativeSetPetScreen.tsx` | 1791 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 744 | `app/src/screens/NativeSetPetScreen.tsx` | 1792 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 745 | `app/src/screens/NativeSetPetScreen.tsx` | 1801 | <Pressable onPress={saveVisit} style={styles.iconSaveButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 746 | `app/src/screens/NativeSetPetScreen.tsx` | 1812 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 747 | `app/src/screens/NativeSetPetScreen.tsx` | 1814 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 748 | `app/src/screens/NativeSetPetScreen.tsx` | 1826 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 749 | `app/src/screens/NativeSetPetScreen.tsx` | 1828 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 750 | `app/src/screens/NativeSetPetScreen.tsx` | 1840 | <Pressable onPress={() => updateForm({ reminders: form.reminders.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 751 | `app/src/screens/NativeSetPetScreen.tsx` | 1847 | <Pressable ref={setFieldRef("reminderReason")} onPress={() => toggleSelectField("reminderReason")} style={[styles.selectField, selectTarget === "reminderReason" \|\| focusedField = | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 752 | `app/src/screens/NativeSetPetScreen.tsx` | 1861 | <DateField focused={dateTarget === "reminderDate" \|\| focusedField === "reminderDate"} onBlur={() => setFocusedField(null)} onChangeText={(reminderDate) => setReminderDraft((curre | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 753 | `app/src/screens/NativeSetPetScreen.tsx` | 1871 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 754 | `app/src/screens/NativeSetPetScreen.tsx` | 1872 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 755 | `app/src/screens/NativeSetPetScreen.tsx` | 1881 | <Pressable onPress={saveReminder} style={styles.iconSaveButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 756 | `app/src/screens/NativeSetPetScreen.tsx` | 1892 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 757 | `app/src/screens/NativeSetPetScreen.tsx` | 1894 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 758 | `app/src/screens/NativeSetPetScreen.tsx` | 1906 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 759 | `app/src/screens/NativeSetPetScreen.tsx` | 1908 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 760 | `app/src/screens/NativeSetPetScreen.tsx` | 1925 | <Pressable onPress={() => updateForm({ medications: form.medications.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 761 | `app/src/screens/NativeSetPetScreen.tsx` | 1946 | <Pressable onPress={() => toggleSelectField("doseUnit")} style={styles.compositeFieldSelect}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 762 | `app/src/screens/NativeSetPetScreen.tsx` | 1970 | <Pressable onPress={() => toggleSelectField("frequencyUnit")} style={styles.compositeFieldSelect}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 763 | `app/src/screens/NativeSetPetScreen.tsx` | 1985 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 764 | `app/src/screens/NativeSetPetScreen.tsx` | 1986 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 765 | `app/src/screens/NativeSetPetScreen.tsx` | 1995 | <Pressable onPress={saveMedication} style={styles.iconSaveButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 766 | `app/src/screens/NativeSetPetScreen.tsx` | 2010 | <InlineToggle checked={form.isActive} onPress={() => updateForm({ isActive: !form.isActive })} /> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 767 | `app/src/screens/NativeSetPetScreen.tsx` | 2017 | <InlineToggle checked={form.isPublic} onPress={() => updateForm({ isPublic: !form.isPublic })} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 768 | `app/src/screens/NativeSetPetScreen.tsx` | 2027 | <Pressable disabled={saving} onPress={() => void savePet(false)} style={({ pressed }) => [styles.primaryButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 769 | `app/src/screens/NativeSetPetScreen.tsx` | 2030 | <Pressable disabled={saving} onPress={() => void savePet(true)} style={({ pressed }) => [styles.draftButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled :  | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 770 | `app/src/screens/NativeSignupScreen.tsx` | 295 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 771 | `app/src/screens/NativeSignupScreen.tsx` | 298 | onPress={onPress} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 772 | `app/src/screens/NativeSignupScreen.tsx` | 391 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 773 | `app/src/screens/NativeSignupScreen.tsx` | 392 | onPress={onClose} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 774 | `app/src/screens/NativeSignupScreen.tsx` | 1296 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 775 | `app/src/screens/NativeSignupScreen.tsx` | 1297 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 776 | `app/src/screens/NativeSignupScreen.tsx` | 1344 | <Pressable onPress={() => setDobPicker(dobPicker === "month" ? null : "month")} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectMonth, liveDobError ? styles.dobSele | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 777 | `app/src/screens/NativeSignupScreen.tsx` | 1350 | <Pressable onPress={() => setDobPicker(dobPicker === "day" ? null : "day")} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectDay, liveDobError ? styles.dobSelectErro | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 778 | `app/src/screens/NativeSignupScreen.tsx` | 1356 | <Pressable onPress={() => setDobPicker(dobPicker === "year" ? null : "year")} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectYear, liveDobError ? styles.dobSelectE | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 779 | `app/src/screens/NativeSignupScreen.tsx` | 1372 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 780 | `app/src/screens/NativeSignupScreen.tsx` | 1374 | onPress={() => selectDobPart(dobPicker, option.value)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 781 | `app/src/screens/NativeSignupScreen.tsx` | 1455 | <Pressable onPress={() => setPasswordVisible((visible) => !visible)} style={styles.passwordEyeButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 782 | `app/src/screens/NativeSignupScreen.tsx` | 1469 | <Pressable onPress={() => setConfirmPasswordVisible((visible) => !visible)} style={styles.passwordEyeButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 783 | `app/src/screens/NativeSignupScreen.tsx` | 1478 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 784 | `app/src/screens/NativeSignupScreen.tsx` | 1481 | onPress={() => setUpdatesChecked((checked) => !checked)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 785 | `app/src/screens/NativeSignupScreen.tsx` | 1493 | <Text style={styles.legalLink} onPress={() => setLegalModalTarget("terms")}>Terms of Service</Text>{" "} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 786 | `app/src/screens/NativeSignupScreen.tsx` | 1495 | <Text style={styles.legalLink} onPress={() => setLegalModalTarget("privacy")}>Privacy Policy</Text>. | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 787 | `app/src/screens/NativeSignupScreen.tsx` | 1543 | onPress={() => void openMailInbox()} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 788 | `app/src/screens/NativeSignupScreen.tsx` | 1568 | <Pressable onPress={() => setSocialRetryNonce((value) => value + 1)}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 789 | `app/src/screens/NativeSignupScreen.tsx` | 1601 | <SignupButton variant="secondary" label="Return to Sign In" onPress={() => void resetAndCancel()} /> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 790 | `app/src/screens/NativeSignupScreen.tsx` | 1603 | <SignupButton disabled={!canContinueDob} label="Continue" onPress={continueDob} /> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 791 | `app/src/screens/NativeSignupScreen.tsx` | 1608 | <SignupButton disabled={!canContinueCredentials} label="Continue" loading={busy} onPress={() => void continueCredentials()} /> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 792 | `app/src/screens/NativeSignupScreen.tsx` | 1619 | onPress={() => void manualContinue()} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 793 | `app/src/screens/NativeSignupScreen.tsx` | 1622 | <Pressable disabled={emailResendDisabled} onPress={() => void resendEmail()} hitSlop={8}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 794 | `app/src/screens/NativeSignupScreen.tsx` | 1628 | <Pressable onPress={changeEmail} hitSlop={8}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 795 | `app/src/screens/NativeSignupScreen.tsx` | 1639 | {step === "name" ? <SignupButton disabled={!canContinueName} label="Continue" loading={busy} loadingLabel="Checking…" onPress={() => void continueName()} /> : null} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 796 | `app/src/screens/NativeSignupScreen.tsx` | 1642 | <SignupButton label="Start Verification" loading={busy} loadingLabel="Starting…" onPress={() => void completeSignup("/verify-identity")} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 797 | `app/src/screens/NativeSignupScreen.tsx` | 1647 | onPress={() => { | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 798 | `app/src/screens/NativeSignupScreen.tsx` | 1660 | <Pressable style={styles.modalBackdrop} onPress={closeSignInModal}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 799 | `app/src/screens/NativeSignupScreen.tsx` | 1662 | <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 800 | `app/src/screens/NativeSignupScreen.tsx` | 1663 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 801 | `app/src/screens/NativeSignupScreen.tsx` | 1664 | onPress={closeSignInModal} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 802 | `app/src/screens/NativeSignupScreen.tsx` | 1725 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 803 | `app/src/screens/NativeSignupScreen.tsx` | 1729 | onPress={() => setSigninPasswordVisible((visible) => !visible)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 804 | `app/src/screens/NativeSignupScreen.tsx` | 1737 | <Pressable onPress={() => onOpenWebPath("/reset-password")} style={({ pressed }) => [styles.forgotPasswordButton, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 805 | `app/src/screens/NativeSignupScreen.tsx` | 1741 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 806 | `app/src/screens/NativeSignupScreen.tsx` | 1743 | onPress={() => void submitDuplicateSignIn()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 807 | `app/src/screens/NativeSignupScreen.tsx` | 1764 | <Pressable style={StyleSheet.absoluteFill} onPress={() => setLegalModalTarget(null)} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 808 | `app/src/screens/NativeSignupScreen.tsx` | 1774 | <Pressable style={styles.confirmationBackdrop} onPress={() => setSkipConfirmOpen(false)}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 809 | `app/src/screens/NativeSignupScreen.tsx` | 1775 | <Pressable style={styles.confirmationCard} onPress={(event) => event.stopPropagation()}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 810 | `app/src/screens/NativeSignupScreen.tsx` | 1779 | <Pressable onPress={() => setSkipConfirmOpen(false)} style={({ pressed }) => [styles.confirmationButton, styles.confirmationSecondaryButton, pressed ? styles.pressed : null]}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 811 | `app/src/screens/NativeSignupScreen.tsx` | 1782 | <Pressable onPress={() => void completeSignup("/set-profile")} style={({ pressed }) => [styles.confirmationButton, styles.confirmationPrimaryButton, pressed ? styles.pressed : null | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 812 | `app/src/screens/NativeSocialScreen.tsx` | 412 | <Text key={'${comment.id}-fallback-${match.index}'} onPress={() => onOpenProfile(userId)} style={styles.commentMentionText}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 813 | `app/src/screens/NativeSocialScreen.tsx` | 427 | <Text key={'${comment.id}-${entry.mentionedUserId}-${index}'} onPress={() => onOpenProfile(entry.mentionedUserId)} style={styles.commentMentionText}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 814 | `app/src/screens/NativeSocialScreen.tsx` | 1127 | const submitComposer = useCallback(async (payload: { category: string; content: string; isSensitive: boolean; media: NativeSocialComposerUploadMedia[]; title: string }) => { | HANDLER/FUNCTION MATCH | AUDITED BY HELPER/FORM SECTION OR RISK IF NOT NAMED |
| 815 | `app/src/screens/NativeSocialScreen.tsx` | 1923 | <Pressable accessibilityRole="button" onPress={() => void load("reset")} style={({ pressed }) => [styles.retryButton, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 816 | `app/src/screens/NativeSocialScreen.tsx` | 1976 | <Pressable accessibilityRole="button" accessibilityLabel="Compose post" onPress={() => { haptic.primaryConfirm(); if (socialPostingBlocked) openPostingRestriction(); else { setEdit | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 817 | `app/src/screens/NativeSocialScreen.tsx` | 1981 | <NativeSocialComposerModal accessToken={accessToken} currentUserId={userId} editingThread={editingThread} isGoldUser={isGoldUser} linkPreviewByUrl={linkPreviewByUrl} open={composer | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 818 | `app/src/screens/NativeSocialScreen.tsx` | 1982 | <NativeSocialMoreModal anchor={moreThreadAnchor} currentUserId={userId} open={Boolean(moreThread)} thread={moreThread} onBlock={confirmBlockThreadAuthor} onClose={() => { setMoreTh | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 819 | `app/src/screens/NativeSocialScreen.tsx` | 2041 | onDelete={(thread, comment) => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 820 | `app/src/screens/NativeSocialScreen.tsx` | 2123 | <AppModalButton variant="secondary" onPress={onClose}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 821 | `app/src/screens/NativeSocialScreen.tsx` | 2127 | <AppModalButton variant="primary" onPress={onAction}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 822 | `app/src/screens/NativeSocialScreen.tsx` | 2150 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 823 | `app/src/screens/NativeSocialScreen.tsx` | 2153 | onPress={() => onSelect(suggestion)} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 824 | `app/src/screens/NativeSocialScreen.tsx` | 2341 | <Pressable accessibilityRole="button" disabled={Boolean(editingComment)} onPress={onPickReplyMedia} style={({ pressed }) => [styles.replyComposerIconButton, editingComment ? styles | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 825 | `app/src/screens/NativeSocialScreen.tsx` | 2345 | <Pressable accessibilityRole="button" disabled={replySubmitting \|\| !replyDraft.trim() \|\| remainingReplyWords < 0} onPress={onSubmitReply} style={({ pressed }) => [styles.replyS | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 826 | `app/src/screens/NativeSocialScreen.tsx` | 2355 | <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => onRemoveReplyMedia(index)} style={styles.mediaRemoveButton}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 827 | `app/src/screens/NativeSocialScreen.tsx` | 2373 | <Pressable accessibilityRole="button" onPress={onReload} style={({ pressed }) => [styles.inlineReplyState, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 828 | `app/src/screens/NativeSocialScreen.tsx` | 2380 | <Pressable accessibilityRole="button" disabled={loadingOlder} onPress={onLoadOlder} style={({ pressed }) => [styles.inlineReplyState, pressed ? styles.pressed : null]}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 829 | `app/src/screens/NativeSocialScreen.tsx` | 2417 | <Pressable accessibilityRole="button" onPress={() => onOpenProfile(comment.userId)} style={styles.commentAvatar}> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 830 | `app/src/screens/NativeSocialScreen.tsx` | 2441 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 831 | `app/src/screens/NativeSocialScreen.tsx` | 2443 | onPress={() => setExpandedCommentTextIds((current) => toggleSetValue(current, comment.id))} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 832 | `app/src/screens/NativeSocialScreen.tsx` | 2461 | <Pressable accessibilityRole="button" accessibilityLabel={canExpandBranch ? '${branchExpanded ? "Hide" : "View"} ${replyBadgeCount} ${replyBadgeCount === 1 ? "reply" : "replies"} a | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 833 | `app/src/screens/NativeSocialScreen.tsx` | 2465 | <Pressable accessibilityRole="button" accessibilityState={{ selected: likedCommentIds.has(comment.id) }} hitSlop={huddleSpacing.x2} onPress={() => onLikeComment(comment)} style={({ | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 834 | `app/src/screens/NativeSocialScreen.tsx` | 2468 | <Pressable accessibilityRole="button" accessibilityLabel="More reply actions" hitSlop={huddleSpacing.x2} onPress={() => onMoreComment(comment)} style={({ pressed }) => [styles.comm | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 835 | `app/src/screens/NativeSocialScreen.tsx` | 2642 | <Pressable accessibilityLabel="Close composer" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 836 | `app/src/screens/NativeSocialScreen.tsx` | 2647 | <AppModalCloseButton onPress={onClose} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 837 | `app/src/screens/NativeSocialScreen.tsx` | 2652 | <Pressable accessibilityRole="button" accessibilityLabel="Select category" onPress={() => setCategoryOpen((open) => !open)} style={({ pressed }) => [styles.categorySelectField, cat | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 838 | `app/src/screens/NativeSocialScreen.tsx` | 2659 | <Pressable | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 839 | `app/src/screens/NativeSocialScreen.tsx` | 2663 | onPress={() => { | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 840 | `app/src/screens/NativeSocialScreen.tsx` | 2744 | <Pressable accessibilityLabel="Remove image" accessibilityRole="button" onPress={() => setMedia((current) => current.filter((_, idx) => idx !== index))} style={styles.mediaRemoveBu | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 841 | `app/src/screens/NativeSocialScreen.tsx` | 2751 | <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSensitive }} onPress={() => setIsSensitive((current) => !current)} style={({ pressed }) => [styles.checkbox | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 842 | `app/src/screens/NativeSocialScreen.tsx` | 2759 | <Pressable accessibilityLabel={isGoldUser ? "Add media" : "Add images"} accessibilityRole="button" disabled={!currentUserId} onPress={pickMedia} style={({ pressed }) => [styles.foo | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 843 | `app/src/screens/NativeSocialScreen.tsx` | 2762 | <Pressable accessibilityRole="button" disabled={submitting \|\| media.some((item) => item.status === "queued" \|\| item.status === "uploading" \|\| item.status === "error")} onPres | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 844 | `app/src/screens/NativeSocialScreen.tsx` | 2801 | <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 845 | `app/src/screens/NativeSocialScreen.tsx` | 2847 | <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 846 | `app/src/screens/NativeSocialScreen.tsx` | 2925 | <Pressable accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 847 | `app/src/screens/NativeSocialScreen.tsx` | 2929 | <AppModalCloseButton onPress={onClose} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 848 | `app/src/screens/NativeSocialScreen.tsx` | 2950 | <Pressable key={target.chatId} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedKey(target.chatId)} style={({ pressed }) => [styles.shareTarge | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 849 | `app/src/screens/NativeSocialScreen.tsx` | 2963 | <Pressable accessibilityRole="button" disabled={!selectedTarget \|\| sending \|\| loading} onPress={shareToChat} style={({ pressed }) => [styles.secondaryButton, !selectedTarget \| | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 850 | `app/src/screens/NativeSocialScreen.tsx` | 2967 | <Pressable accessibilityRole="button" onPress={() => { void onNativeShare(thread).then(onClose); }} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 851 | `app/src/screens/NativeSupportScreen.tsx` | 163 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 852 | `app/src/screens/NativeSupportScreen.tsx` | 164 | onPress={onCancel ?? resetSupportForm} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 853 | `app/src/screens/NativeSupportScreen.tsx` | 221 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 854 | `app/src/screens/NativeSupportScreen.tsx` | 223 | onPress={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 855 | `app/src/screens/NativeSupportScreen.tsx` | 290 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 856 | `app/src/screens/NativeSupportScreen.tsx` | 292 | onPress={() => void submitSupport()} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 857 | `app/src/screens/NativeSupportScreen.tsx` | 301 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 858 | `app/src/screens/NativeSupportScreen.tsx` | 303 | onPress={onCancel ?? resetSupportForm} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 859 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1451 | <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack ?? onCancelSignup ?? (() => void Linking.openURL("huddle:/settings").catch(() => {}) | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 860 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1476 | <Pressable accessibilityRole="button" onPress={openBlockedSupportPath} hitSlop={8}> | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 861 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1490 | onToggle={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 862 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1527 | onToggle={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 863 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1587 | onToggle={() => { | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 864 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1617 | onSubmit={() => void submitCard()} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 865 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1630 | <ActionButton label={continueLabel} onPress={() => onNavigate?.("/set-profile")} secondary={activeStep !== "final"} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 866 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1661 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 867 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1665 | onPress={disabled ? undefined : onToggle} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 868 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1756 | <Pressable | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 869 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1758 | onPress={onSend} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 870 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 1787 | <ActionButton disabled={phoneState.loading \|\| otpCode.trim().length < 6} label={phoneState.loading ? "Verifying…" : "Verify code"} onPress={onVerify} secondary /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 871 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 2033 | onPress={permissionDenied ? onOpenSettings : ready ? onCapture : onStart} | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 872 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 2168 | onPress={blockedSupportReady ? onSupport : onPrimary} | BACKEND-IMPACT OR MUTATION-CANDIDATE | AUDITED IN SECTION 31 IF NAMED; OTHERWISE RISK UNTIL HANDLER TRACE EXPANDED |
| 873 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 2204 | <ActionButton disabled={loading \|\| !canSubmit} label={loading ? "Checking…" : "Verify Card"} onPress={onSubmit} /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 874 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 2205 | <ActionButton disabled={loading} label="Check Status" onPress={onCheck} secondary /> | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 875 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 2215 | {blockedSupportReady ? <ActionButton label="Help & Support" onPress={onSupport} secondary /> : null} | LOCAL CONTROL WITH BACKEND-ADJACENT CONTEXT | RISK UNTIL HANDLER TRACE CONFIRMS NO BACKEND CALL |
| 876 | `app/src/screens/NativeVerifyIdentityScreen.tsx` | 2230 | <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, disabled \|\| secondary ? styles.secondaryButton : huddleButtons.primary, pressed ? h | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
| 877 | `app/src/screens/WebShellScreen.tsx` | 1035 | <Pressable onPress={handleRetry} style={styles.retryButton}> | LOCAL/NAV/STRUCTURAL | NO DIRECT BACKEND CALL IN LOCAL CONTEXT |
