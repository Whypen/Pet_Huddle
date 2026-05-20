# Native Map Parity Matrix

Status legend: `same`, `equivalent`, `missing`, `partial`, `not verified`.

Source files checked:
- `src/pages/Map.tsx`
- `src/components/map/BroadcastModal.tsx`
- `src/components/map/PinDetailModal.tsx`
- `src/components/profile/PublicProfileSheet.tsx`
- `src/components/moderation/ReportModal.tsx`

Native files checked:
- `app/src/screens/NativeMapScreen.tsx`
- `app/src/components/map/NativeBroadcastModal.tsx`
- `app/src/components/map/NativeAlertDetailModal.tsx`
- `app/src/components/profile/NativePublicProfileModal.tsx`
- `app/src/components/profile/NativePublicProfileContent.tsx`
- `app/src/components/social/NativeSocialReportModal.tsx`
- `app/src/lib/nativeMapData.ts`
- `app/src/lib/nativeBroadcast.ts`
- `app/src/lib/nativeMapMutations.ts`
- `app/src/lib/nativeMapAlertInteractions.ts`

## Phase 0 Matrix

| Bucket / Row | Status | Proof / Gap | Owner |
| --- | --- | --- | --- |
| `/map` route ownership | equivalent, runtime not proven | `src/routes/ROUTE_MANIFEST.ts` now has `/map.nativeContentOnly: true`; native shell still gates `/map` through `shouldUseNativeMapRoute()` so the kill switch can force fallback. | native-shell |
| `/map?alert=` route parsing | equivalent, runtime not proven | Native parses alert/thread query and fetches focused alert; push-tap runtime proof is still missing. | native-shell |
| Bottom nav Map entry | not verified | Route ownership is flipped, but simulator bottom-nav proof is not run. | native-shell |
| Kill switch rollback | code equivalent, runtime not proven | App shell special-cases `/map` so false native map flags return to web route even with manifest ownership. | native-shell |
| Web alert fields | partial | Web `PinDetailModal` includes social/thread/media/sensitive/status fields; native maps many, but RPC field shape still needs DB proof. | backend |
| Native alert fields | partial | Native read model maps social/media/sensitive fields, but field parity depends on `get_visible_broadcast_alerts` and `get_broadcast_alert_by_id` DB contracts. | backend |
| Broadcast `post_on_social` / `post_on_threads` | same source behavior, DB proof missing | Web `BroadcastModal.tsx` and native `nativeBroadcast.ts` currently bind both columns to one `postOnThreads` toggle. This is not proven as correct product behavior; DB side effects still need proof. | backend |
| Alert support / unsupport | partial | Native has `supportNativeAlert`, `removeNativeAlertSupport`, and notification enqueue; authenticated runtime/DB proof is missing. | backend |
| Alert report | partial | Native uses shared report modal and writes `broadcast_alert_interactions`, but report payload/category/copy and admin-side processing proof are not complete. | backend |
| Alert delete | partial | Native calls `delete_broadcast_alert`; owner matrix and DB proof are missing. | backend |
| Alert edit | partial | Native has `updateNativeBroadcastAlert`, but edit media upload/save cleanup and web parity are not fully audited/proven. | native-content |
| Alert hide | same, runtime not proven | Web `PinDetailModal` hides locally through `onHide`; native detail modal also hides locally through `onHidden`. No backend hide helper is expected for this row. | native-content |
| Alert block | equivalent, runtime not proven | Native detail/profile block actions call `block_user`, close/remove map content, and refresh map data; DB proof is still missing. | backend |
| PinningLayer place-alert mode | equivalent, runtime not proven | Native no longer confirms by tapping a map coordinate; it uses fixed center pin selection, live map-center coordinate tracking, top address/distance card, manual search fallback, and explicit Place Alert Pin confirmation. | native-content |
| Broadcast modal UI tokens | partial | Several fields were adjusted toward native profile field tokens; code needs another source-vs-native pass after recent input/media changes. | native-content |
| Broadcast validation | intentional product delta | Native rejects empty title/details because user explicitly required no empty pin; web source allows optional fields unless source is updated. | native-content |
| Broadcast media upload / preview | equivalent, runtime not proven | Native broadcast upload now uses the same FileSystem/base64 storage upload shape as native Social and previews immediately while upload state resolves. | backend |
| Alert detail media carousel | equivalent, runtime not proven | Native alert detail uses the same native Social carousel sizing formula, stride, peeking, controls, aspect clamp, and sensitive reveal treatment. | native-content |
| Sensitive image treatment | equivalent, runtime not proven | Native alert detail uses Social blur radius and tap-to-view/dismissed hint treatment. | native-content |
| Shared report modal | partial | Map uses `NativeSocialReportModal`, but the report modal bottom image upload and CTA were changed to match Map broadcast tokens and still need visual proof. | native-content |
| Safety restriction modal | equivalent, runtime not proven | Native now uses a dedicated `NativeMapRestrictionModal` with the web map restriction title/body and tokenized modal treatment instead of inline screen copy. | native-content |
| Public profile child surface | equivalent for known gap rows, runtime not proven | Native public profile now maps/displays `last_active_at`, blocks users through `block_user`, and supports Discover wave insertion with canonical/legacy wave schema fallback. | native-content |
| Friend/avatar hydration | partial | Native uses native avatar resolver paths, but exact cross-surface proof against Service/Social avatar behavior is still missing. | backend |
| Pin/privacy mutations | partial | Native calls location pin, clear pin, incognito/privacy paths; DB proof for exact columns/cleanup is missing. | backend |
| Location permission/settings resume | not verified | Code exists for permission/resume, but physical-device proof is required. | native-shell |
| Notifications side effects | partial | Support notification enqueue exists; alert creation notification/district accuracy and push open-to-native proof are not complete. | backend |
| Offline/loading/error states | partial | Native has token/missing/offline/loading/error states; screenshot/runtime proof is missing. | native-content |
| Copy/i18n | partial | Native still contains local English strings in map surfaces; not fully matched to web resolver/copy doctrine. | config |
| Runtime authenticated mutation matrix | missing | No runtime proof was run for this updated gate. | native-shell |

## Known Missing / Drift Rows

| Item | Status | Why | Owner |
| --- | --- | --- | --- |
| Public profile sheet parity | fixed, runtime not proven | Added `last_active_at`, block action, Discover wave action, non-social state, and map refresh after block. | native-content |
| Safety restriction modal component parity | fixed, runtime not proven | Added dedicated `NativeMapRestrictionModal`; removed inline restriction copy from `NativeMapScreen`. | native-content |
| Alert hide interaction path | fixed, runtime not proven | Reclassified as local-only parity because web hide is local `onHide`, not a backend interaction helper. | native-content |
| Alert edit/media parity | partial | Update helper and FileSystem alert upload exist, but edit cleanup and refreshed detail proof are not runtime-proven. | backend |
| Broadcast media immediate upload/preview | fixed, runtime not proven | Alert uploads now use native FileSystem/base64 storage upload rather than `fetch(uri).blob()`. | backend |
| Alert carousel exact Social parity | fixed, runtime not proven | Rechecked against `NativeSocialFeedPrimitives`: sizing formula, peeking, aspect clamp, controls, and sensitive overlay match native Social. | native-content |
| PinningLayer exact gesture model | fixed, runtime not proven | Map tap no longer drops the alert; native place-alert mode now selects the moving map center and confirms through the placement CTA. | native-content |
| Push notification to native `/map?alert=` | not verified | Native route parsing exists, but push-tap handoff through `WebShellScreen` is not runtime-proven. | native-shell |
| Copy/i18n/token hard gate | partial | Native map surfaces still need a full text/token sweep after recent UI fixes. | config |

## Gate Result

| Gate | Status |
| --- | --- |
| PARITY MATRIX COMPLETED | updated, not final |
| BACKEND/RPC FIELD PARITY VERIFIED | partial |
| CHILD SURFACES VERIFIED | partial |
| SIDE EFFECTS VERIFIED | partial |
| CODE PARITY | code gaps patched for known rows; runtime/DB proof still missing |
| SAFE TO MOVE TO NEXT PHASE | no until simulator and authenticated DB proof pass |
| SAFE TO PUSH | no |
| SAFE TO DEPLOY LIVE | no |
| WEB SRC TOUCHED | yes, route metadata only |
| WEB BEHAVIOR CHANGED | intended no for standalone web; native app route ownership changed |
| ROUTE OWNERSHIP FLIPPED | yes |
| KILL SWITCH PRESERVED | code yes, runtime not proven |
| ROLLBACK TO WEB VERIFIED | no runtime proof |
| SIMULATOR PROOF | not run |
| PHYSICAL DEVICE PROOF | not run |
