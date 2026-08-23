import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const nav = () => readFileSync(resolve(root, "app/src/navigation/RootNavigator.tsx"), "utf8");
const home = () => readFileSync(resolve(root, "app/src/screens/NativeHomeScreen.tsx"), "utf8");
const viewerScope = () => readFileSync(resolve(root, "app/src/lib/nativeViewerScope.ts"), "utf8");
const mapScreen = () => readFileSync(resolve(root, "app/src/screens/NativeMapScreen.tsx"), "utf8");
const chatsScreen = () => readFileSync(resolve(root, "app/src/screens/NativeChatsScreen.tsx"), "utf8");
const mediaPermissions = () => readFileSync(resolve(root, "app/src/lib/nativeMediaPermissions.ts"), "utf8");
const autoPin = () => readFileSync(resolve(root, "app/src/lib/nativeMapAutoPin.ts"), "utf8");
const nativeLocation = () => readFileSync(resolve(root, "app/src/lib/nativeLocation.ts"), "utf8");
const activeSessions = () => readFileSync(resolve(root, "app/src/lib/nativeActiveSessions.ts"), "utf8");
const activeHydration = () => readFileSync(resolve(root, "app/src/lib/nativeActiveSessionHydration.ts"), "utf8");
const iosActiveSessions = () => readFileSync(resolve(root, "app/modules/huddle-active-sessions/ios/HuddleActiveSessionsModule.swift"), "utf8");
const androidActiveSessions = () => readFileSync(resolve(root, "app/modules/huddle-active-sessions/android/src/main/java/pet/huddle/activesessions/HuddleActiveSessionsModule.kt"), "utf8");
const androidActiveSessionLayout = () => readFileSync(resolve(root, "app/modules/huddle-active-sessions/android/src/main/res/layout/huddle_active_session_compact.xml"), "utf8");
const moduleIndex = () => readFileSync(resolve(root, "app/modules/huddle-active-sessions/src/index.ts"), "utf8");
const liveActivityWidget = () => readFileSync(resolve(root, "app/targets/HuddleLiveActivities/HuddleLiveActivities.swift"), "utf8");
const liveActivityAssets = () => readFileSync(resolve(root, "app/targets/HuddleLiveActivities/HuddleLiveActivityAssets.swift"), "utf8");
const serviceChat = () => readFileSync(resolve(root, "app/src/screens/NativeServiceChatScreen.tsx"), "utf8");
const appConfig = () => readFileSync(resolve(root, "app/app.config.js"), "utf8");
const liveProgressMigration = () => readFileSync(resolve(root, "supabase/migrations/20260714010000_live_activity_progress_dispatch.sql"), "utf8");
const liveProgressDispatcher = () => readFileSync(resolve(root, "supabase/functions/dispatch-live-activity-progress/index.ts"), "utf8");
const xcodeProject = () => readFileSync(resolve(root, "app/ios/huddle.xcodeproj/project.pbxproj"), "utf8");

describe("native location privacy contract", () => {
  it("warms private geolocation on boot only after permission is already granted", () => {
    const s = nav();
    expect(s).toMatch(/getNativeForegroundLocationPermissionDetail/);
    expect(s).toMatch(/getNativeCurrentCoordinates\(\{ accuracy: "balanced" \}\)/);
    expect(s).toMatch(/One canonical location read owns both Home and Map startup/);
    expect(s).toMatch(/devicePoint: coords/);
    expect(s).toMatch(/setNativeMapWarmCenter/);
    expect(s).not.toMatch(/requestNativeForegroundLocationPermissionDetail/);
    expect(s).not.toMatch(/pinNativeUserLocation/);
  });

  it("routes the explicit I'm out action through the shared native location gate before public sharing", () => {
    const s = home();
    const permissionIndex = s.indexOf("requestNativeLocationForPin({ retainedCoordinates })");
    const coordsIndex = s.indexOf('freshCoords = location.status === "ready" ? location.coords : null;');
    const pinIndex = s.indexOf("pinNativeUserOutNow(");
    const activityIndex = s.indexOf("startHomePresenceActivity({");
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(coordsIndex).toBeGreaterThan(permissionIndex);
    expect(pinIndex).toBeGreaterThan(coordsIndex);
    expect(activityIndex).toBeGreaterThan(pinIndex);
  });

  it("shares only server-confirmed Out Now presence between Home and Map", () => {
    const homeScreen = home();
    const nativeMap = mapScreen();
    expect(homeScreen.indexOf("queueOutNowMutation(presenceIntent, () => pinNativeUserOutNow(")).toBeLessThan(homeScreen.indexOf("patchNativeProfileSummaryCache(userId"));
    expect(homeScreen).not.toContain("optimisticVisibleUntil");
    expect(nativeMap.indexOf("pinNativeUserOutNow(effectiveUserId!")).toBeLessThan(nativeMap.indexOf("setOwnPin((prev) => ({"));
    expect(nativeMap).toMatch(/if \(!current\)[\s\S]*last_lat[\s\S]*marker_state: "active"/);
    expect(nativeMap).toMatch(/if \(!isNativeMapSharingWindowVisible\(nextVisibleUntil\)\) return null/);
  });

  it("keeps permission prompts explicit and missing-location Discover privacy-owned", () => {
    const nativeMap = mapScreen();
    const chats = chatsScreen();
    const media = mediaPermissions();
    const coldPermissionStart = nativeMap.indexOf("const detail = await getNativeForegroundLocationPermissionDetail");
    const coldPermissionBlock = nativeMap.slice(coldPermissionStart, nativeMap.indexOf("if (effectiveUserId)", coldPermissionStart));
    expect(coldPermissionStart).toBeGreaterThan(-1);
    expect(coldPermissionBlock).not.toContain("requestNativeForegroundLocationPermissionDetail");
    expect(chats).toMatch(/discoverLocationPrivacyCoverVisible \|\| discoverStatus !== "error"/);
    expect(chats).toMatch(/mergeNativeDiscoveryPermissionDeck\([\s\S]*viewerScope\?\.profileCountryName/);
    expect(media).toMatch(/getNativeMediaLibrarySavePermissionDetail\(\)/);
    expect(media).toMatch(/status === "denied" \|\| status === "restricted"/);
  });

  it("shows huddle Settings guidance only after an explicit pin action returns a denied location result", () => {
    const homeScreen = home();
    const nativeMap = mapScreen();
    expect(homeScreen).toMatch(/requestNativeLocationForPin\(\{ retainedCoordinates \}\)/);
    expect(homeScreen).toMatch(/location\.status === "settings_required"/);
    expect(homeScreen).toMatch(/setOutNowLocationSettingsReason\(location\.reason\)/);
    expect(homeScreen).toMatch(/Turn on Location for huddle in Settings\./);
    expect(homeScreen).toMatch(/open=\{active && outNowLocationSettingsReason !== null\}/);
    expect(homeScreen).toMatch(/confirmLabel=\{outNowLocationSettingsReason === "services" \? "Open Location Settings" : "Open huddle Settings"\}/);
    expect(homeScreen).not.toMatch(/Could not mark you out now\./);
    expect(homeScreen).toMatch(/if \(!renewalOnly\) \{[\s\S]*const location = await requestNativeLocationForPin\(\{ retainedCoordinates \}\)/);
    expect(homeScreen).toMatch(/if \(renewalOnly\)[\s\S]*out_now_saved_location_missing[\s\S]*return;/);
    expect(homeScreen).not.toMatch(/location_required_to_continue/);
    expect(nativeMap).toMatch(/requestNativeLocationForPin\(\{[\s\S]*retainedCoordinates: latestPrivateGpsRef\.current \?\? retainedOwnCoordinateRef\.current/);
    expect(nativeMap).toMatch(/setLocationSettingsReason\(location\.reason\)/);
    expect(nativeMap).toMatch(/visible=\{active && locationSettingsReason !== null\}/);
    expect(nativeMap).toMatch(/openNativeAppSettings\(\)/);
    expect(nativeMap).toMatch(/Turn on Location for huddle in Settings\./);
    const recenterStart = nativeMap.indexOf("const handleLocationPress = async () =>");
    const recenterEnd = nativeMap.indexOf("const handleZoomChange", recenterStart);
    const recenter = nativeMap.slice(recenterStart, recenterEnd);
    // Recenter must centre the rendered privacy identity, never raw GPS.
    // resolveOwnAreaCoordinate is the geometry-version-aware form of that rule:
    // v2 uses the server's viewer area cell, v1 falls back to coarsenToCellCenter.
    expect(recenter).toMatch(/if \(ownPin\) \{[\s\S]*?resolveOwnAreaCoordinate\(ownPin\.lng, ownPin\.lat[\s\S]*?focusSelectionCamera/);
    expect(nativeMap).toMatch(/const resolveOwnAreaCoordinate[\s\S]*?return coarsenToCellCenter\(lng, lat\);/);
    expect(recenter).toMatch(/getNativeForegroundLocationPermissionDetail\(\)/);
    expect(recenter).not.toMatch(/requestNativeLocationForPin\(\)/);
    expect(recenter).not.toMatch(/setLocationSettingsReason\(/);
    expect(recenter).not.toMatch(/setOwnPin\(/);
  });

  it("serializes native location prompts and gives Home and Map one action contract", () => {
    const location = nativeLocation();
    const nativeMap = mapScreen();
    expect(location).toMatch(/let nativeLocationPermissionRequest: Promise<NativeLocationPermissionDetail> \| null = null/);
    expect(location).toMatch(/if \(nativeLocationPermissionRequest\) return nativeLocationPermissionRequest/);
    expect(location).toMatch(/export async function requestNativeLocationForPin\(options:/);
    expect(location).toMatch(/Location\.requestForegroundPermissionsAsync\(\)/);
    expect(location).toMatch(/Location\.hasServicesEnabledAsync\(\)/);
    // Out Now and Pin only ever render an approximate ~500m server cell, so
    // requestNativeLocationForPin must never wait on a live GPS fix -- it
    // resolves from cache/retained/last-known or returns "unavailable"
    // immediately, letting the caller fall back to a saved server location.
    expect(location).toMatch(/export async function requestNativeLocationForPin[\s\S]*?\n\}/);
    const pinGate = location.slice(
      location.indexOf("export async function requestNativeLocationForPin"),
      location.indexOf("export async function requestNativeLocationForPin") + 1200,
    );
    expect(pinGate).not.toContain("getNativeCurrentCoordinates(");
    expect(pinGate).toContain('return { status: "unavailable" };');
    expect(location).toMatch(/Location\.getLastKnownPositionAsync\(\{\s*maxAge: 24 \* 60 \* 60_000,\s*\}\)/);
    expect(location).toMatch(/source: "recent"/);
    expect(location).toMatch(/source: "retained"/);
    expect(location).toMatch(/const currentCoordinatePositionRequest: Record<NativeCoordinateAccuracy, Promise<Location\.LocationObject> \| null>/);
    expect(location).toMatch(/if \(!positionRequest\) \{[\s\S]*?Location\.getCurrentPositionAsync[\s\S]*?currentCoordinatePositionRequest\[accuracy\] = positionRequest/);
    expect(location).toMatch(/const position = timeoutMs === null\s*\? await positionRequest\s*:\s*await Promise\.race/);
    expect(nativeMap).toMatch(/requestNativeLocationForPin\(\{\s*retainedCoordinates:/);
    expect(nativeMap).toMatch(/pinNativeUserOutNow\(/);
  });

  it("keeps a first Out Now action visibly resolving until its first GPS fix arrives", () => {
    const homeScreen = home();
    const nativeMap = mapScreen();
    expect(homeScreen).toMatch(/setOutNowState\(\(current\) => \(\{ \.\.\.current, busy: true, error: "" \}\)\)/);
    expect(homeScreen).toMatch(/busy \? "Finding your location\.\.\." : "I'm out now"/);
    expect(homeScreen).toMatch(/<ActivityIndicator color="#2C3A12" size="small" \/>/);
    expect(nativeMap).toMatch(/setStatusMessage\("Finding your location\.\.\."\)/);
    expect(nativeMap).toMatch(/We can't get your location yet\. Check your signal and try again\./);
    expect(homeScreen).toMatch(/We can't get your location yet\. Check your signal and try again\./);
  });

  it("reconciles an out-now session immediately after a Lock Screen return", () => {
    const homeScreen = home();
    const foregroundStart = homeScreen.indexOf('const subscription = AppState.addEventListener("change", (nextState) => {');
    const foregroundEnd = homeScreen.indexOf('return () => subscription.remove();', foregroundStart);
    const foreground = homeScreen.slice(foregroundStart, foregroundEnd);
    expect(foreground).toMatch(/freshnessRegistry\.invalidate\(sessionKey, \["profile_summary", "viewer_location_scope", "map_shell"\]\)/);
    expect(foreground).toMatch(/void runHomeFreshnessSweep\(\{ userId, accessToken, sessionGeneration, sessionKey \}\)/);
    expect(homeScreen).toMatch(/terminalHomePresenceAtRef\.current[\s\S]*serverVisibleMs > terminalMs \+ 1000/);
    expect(homeScreen).not.toContain("pendingHomePresenceUntilRef");
    expect(homeScreen).not.toMatch(/const currentUntil = profileRef\.current\?\.map_visible_until/);
  });

  it("does not refresh or create a public map pin on boot", () => {
    const navSource = nav();
    const helper = autoPin();
    expect(navSource).not.toMatch(/renewNativeMapPinOnBootOnce/);
    expect(helper).toMatch(/isNativeOwnPinWindowVisible/);
    expect(helper).toMatch(/boot_public_pin_renew_disabled/);
    expect(helper).not.toMatch(/pinNativeUserLocation/);
    expect(helper).not.toMatch(/setSelfPinSheetOpen/);
  });

  it("uses cached private viewer scope unless explicitly forced", () => {
    const s = viewerScope();
    expect(s).toMatch(/force = false/);
    expect(s).toMatch(/readCachedNativeViewerScope/);
    expect(s).toMatch(/cachedScope\.source === "live_device_gps"/);
    expect(s).toMatch(/getNativeCurrentCoordinates\(\{ force \}\)/);
    expect(s).not.toMatch(/getNativeCurrentCoordinates\(\{ force: true \}\)/);
  });

  it("keeps public pin writes explicit while refresh stays read-only", () => {
    const s = mapScreen();
    const rootNavigator = nav();
    expect(s).toMatch(/accessibilityLabel=\{ownPin \? "Unpin my location" : "Pin my location"\}/);
    expect(s).not.toMatch(/refreshExistingPinIfMoved/);
    expect(s).toMatch(/void loadMapData\(\{ center: centerCoordinateRef\.current, force: true \}\)/);
    expect(rootNavigator).toMatch(/cacheNativeLocationCoordinates\(next\)/);
    expect(rootNavigator).toMatch(/syncNativePrivateUserLocation/);
    expect(s).toMatch(/subscribeNativeViewerScope/);
    expect(s).not.toMatch(/watchNativeLocation\(/);
  });

  it("recovers Live Activities when the stored native activity id is stale", () => {
    const js = activeSessions();
    const ios = iosActiveSessions();
    expect(ios).toMatch(/AsyncFunction\("updateActivity"\).*-> Bool/s);
    expect(ios).toMatch(/findActivity\(payload\.activityId\) \?\? preferredActivity\(from: matches\)/);
    expect(js).toMatch(/if \(updated === false\) \{\s*activeSessionLog\("home_update_recover_start"/s);
    expect(js).toMatch(/await AsyncStorage\.removeItem\(HOME_ACTIVITY_KEY\)/);
    expect(js).toMatch(/await startHomePresenceActivity\(payload\)/);
    expect(js).toMatch(/if \(updated === false\) \{\s*activeSessionLog\("care_update_recover_start"/s);
    expect(js).toMatch(/await AsyncStorage\.removeItem\(careActivityKey\(sessionId\)\)/);
    expect(js).toMatch(/await startCareSessionActivity\(payload\)/);
  });

  it("does not silently report success when ActivityKit is disabled", () => {
    const ios = iosActiveSessions();
    expect(ios).toMatch(/ActivityAuthorizationInfo\(\)\.areActivitiesEnabled/);
    expect(ios).toMatch(/ERR_ACTIVITYKIT_DISABLED/);
  });

  it("keeps Home and Care as independently verified concurrent activities", () => {
    const js = activeSessions();
    const hydration = activeHydration();
    const ios = iosActiveSessions();
    const android = androidActiveSessions();
    expect(js).toMatch(/serializeActiveSessionStart/);
    expect(js).toMatch(/verifyNativeActiveSessionCoexistence/);
    expect(hydration).toMatch(/const homeExpected = await hydrateHomePresence\(options\)/);
    expect(hydration).toMatch(/const careExpected = await hydrateCarePresence\(options\)/);
    expect(hydration).not.toMatch(/Promise\.all\(\[\s*hydrateHomePresence/);
    expect(hydration).toMatch(/active_coexistence_recovery/);
    expect(ios).toMatch(/if state\.kind == "map_out_now" \{ return 0\.9 \}/);
    expect(ios).toMatch(/return state\.showAction == true \? 0\.8 : 0\.7/);
    expect(ios).toMatch(/relevanceScore: relevanceScore\(for: state\)/);
    expect(ios).toMatch(/AsyncFunction\("getActivitySnapshot"\)/);
    expect(android).toMatch(/AsyncFunction\("getActivitySnapshot"\)/);
  });

  it("uses immutable Care milestones for one stable clock across hydration, chat updates, and pushes", () => {
    const hydration = activeHydration();
    const chat = serviceChat();
    const dispatcher = liveProgressDispatcher();
    expect(hydration).toMatch(/const startedAt = row\.in_progress_at \|\| row\.checkin_submitted_at \|\| row\.booked_at/);
    expect(chat).toMatch(/const startedAt = serviceChat\.in_progress_at \|\| serviceChat\.checkin_submitted_at \|\| serviceChat\.booked_at/);
    expect(dispatcher).toMatch(/isoOrNull\(data\.in_progress_at\) \|\| isoOrNull\(data\.checkin_submitted_at\)[\s\S]*?isoOrNull\(data\.booked_at\)/);
    expect(hydration).not.toMatch(/startedAt =[^\n]*updated_at/);
    expect(chat).not.toMatch(/startedAt =[^\n]*updated_at/);
    expect(dispatcher).not.toMatch(/startedAt =[^;]*updated_at/);
    expect(hydration).not.toMatch(/startedAt =[^\n]*new Date\(\)/);
    expect(chat).not.toMatch(/startedAt =[^\n]*new Date\(\)/);
  });

  it("ends every canonical terminal Care state before hydration or dispatch can recreate it", () => {
    const hydration = activeHydration();
    const dispatcher = liveProgressDispatcher();
    const widget = liveActivityWidget();
    for (const status of [
      "completed",
      "cancelled",
      "under_dispute",
      "handoff_issue_review",
      "not_started_refunded",
      "handoff_expired_manual_refund_required",
    ]) {
      expect(hydration).toContain(`"${status}"`);
      expect(dispatcher).toContain(`"${status}"`);
      expect(widget).toContain(`"${status}"`);
    }
    expect(hydration.indexOf("if (terminal) continue")).toBeLessThan(hydration.indexOf('const active = row.care_status === "in_progress"'));
  });

  it("includes the Live Activity source folder exactly once in the Xcode target", () => {
    const project = xcodeProject();
    const target = project.match(/XX16294940CFC70FA69D3FXX \/\* HuddleLiveActivities \*\/ = \{[\s\S]*?\n\t\t\};/)?.[0] || "";
    expect(target).toContain("XX7F1E802CB2DA396A430FXX /* ../targets/HuddleLiveActivities */");
    expect(target).not.toContain("XX9D62F1D5F079B7FEC990XX");
    expect(project).not.toContain('path = HuddleLiveActivities;');
  });

  it("updates custom progress while the app is idle through ActivityKit pushes", () => {
    const ios = iosActiveSessions();
    const widget = liveActivityWidget();
    const migration = liveProgressMigration();
    const dispatcher = liveProgressDispatcher();
    expect(appConfig()).toMatch(/NSSupportsLiveActivitiesFrequentUpdates: true/);
    expect(ios).toMatch(/pushType: \.token/);
    expect(ios).toMatch(/activity\.pushTokenUpdates/);
    expect(ios).toMatch(/register_native_live_activity/);
    expect(widget).toMatch(/var progressPermille: Int\?/);
    expect(widget).toMatch(/CGFloat\(max\(0, min\(1000, progressPermille \?\? 0\)\)\) \/ 1000/);
    expect(migration).toMatch(/live-activity-progress-every-minute/);
    expect(dispatcher).toMatch(/"apns-push-type": "liveactivity"/);
    expect(dispatcher).toMatch(/const visualProgress = Number\(state\.progressPermille \|\| 0\)/);
    expect(dispatcher).toMatch(/attemptedEvent = terminal \? "end" : "update"/);
    expect(dispatcher).toMatch(/sendAPNs\(row, state, terminal \? "end" : "update"/);
  });

  it("normalizes Care pet avatar storage refs before native Live Activity handoff", () => {
    const hydration = activeHydration();
    const chat = serviceChat();
    expect(hydration).toMatch(/const nearbySnapshot = await hydrateHomeCompanions\(userId, accessToken\)/);
    expect(hydration).toMatch(/companions: companions\.slice\(0, 4\)/);
    expect(hydration).toMatch(/companionsTotalCount: nearbySnapshot\?\.totalCount \?\? 0/);
    expect(hydration).toMatch(/await startHomePresenceActivity\(\{\s*startedAt,\s*progressStartedAt,\s*expiresAt,\s*selfAvatarUrl: avatarUrl,\s*companions: companions\.slice\(0, 4\),/s);
    expect(hydration).toMatch(/await startCareSessionActivity\(\{/);
    expect(hydration).toMatch(/await clearInactiveCareSessionActivities\(activeCareSessions\)/);
    expect(hydration).toMatch(/let startedCount = 0/);
    expect(hydration).toMatch(/startedCount \+= 1/);
    expect(hydration).toMatch(/const activePetCard = activeCarePetCard\(row\.request_card, row\.quote_card, row\.booking_snapshot\)/);
    expect(hydration).toMatch(/const activePetScope = Array\.isArray\(row\.active_pet_scope\)/);
    expect(hydration).toMatch(/source: "service_care_scope"/);
    expect(hydration).toMatch(/\{ pets: activePetScope \}/);
    expect(hydration).toMatch(/petsTotalCount: pets\.length/);
    expect(hydration).not.toMatch(/updateHomePresenceActivity/);
    expect(hydration).not.toMatch(/updateCareSessionActivity/);
    expect(hydration).toMatch(/resolveNativePetImageUrlAsync\(rawUrl\)/);
    expect(chat).toMatch(/resolveNativePetImageUrlAsync\(pet\.rawUrl\)/);
  });

  it("renders the Live Activity wordmark from embedded PNG bytes instead of the widget asset catalog", () => {
    const widget = liveActivityWidget();
    const assets = liveActivityAssets();
    expect(widget).toMatch(/UIImage\(data: Data\(base64Encoded: huddleWordmarkPNGBase64\)/);
    expect(widget).toMatch(/Image\(uiImage: image\)/);
    expect(widget).toMatch(/\.renderingMode\(\.original\)/);
    expect(assets).toMatch(/let huddleWordmarkPNGBase64 = "/);
    expect(assets).toMatch(/let huddleWalkDogPNGBase64 = "/);
    expect(assets).toMatch(/let huddlePetCarePNGBase64 = "/);
  });

  it("keeps the redesigned payload contract aligned across shared TS, iOS, and Android", () => {
    const shared = moduleIndex();
    const ios = iosActiveSessions();
    const android = androidActiveSessions();
    expect(shared).toMatch(/sessionId\?: string \| null/);
    expect(shared).toMatch(/selfAvatarUrl\?: string \| null/);
    expect(shared).toMatch(/avatarIsBlurred\?: boolean\[\]/);
    expect(shared).toMatch(/names\?: string\[\]/);
    expect(shared).toMatch(/totalCount\?: number/);
    expect(shared).toMatch(/friendCount\?: number/);
    expect(shared).toMatch(/nearbyUserCount\?: number/);
    expect(ios).toMatch(/@Field var sessionId: String\?/);
    expect(ios).toMatch(/@Field var selfAvatarUrl: String\?/);
    expect(ios).toMatch(/@Field var avatarIsBlurred: \[Bool\]\?/);
    expect(ios).toMatch(/@Field var names: \[String\]\?/);
    expect(ios).toMatch(/@Field var totalCount: Int\?/);
    expect(ios).toMatch(/@Field var friendCount: Int\?/);
    expect(ios).toMatch(/@Field var nearbyUserCount: Int\?/);
    expect(android).toMatch(/private fun sessionId\(payload: Map<String, Any\?>\): String/);
    // Care cards are identified by a unique per-service notification tag posted as
    // (tag, id). Two concurrent sessions therefore cannot collide onto one card the
    // way the former `hashCode() % 10000` id could.
    expect(android).toContain('NotificationIdentity("care:$serviceId", "huddle:care:$serviceId", careNotificationId)');
    expect(android).toContain("notify(identity.tag, identity.id, builder.build())");
    expect(android).not.toMatch(/% 10000/);
  });

  it("renders care avatars from names even when some pets have no photo", () => {
    const widget = liveActivityWidget();
    expect(widget).toMatch(/let limit = state\.isCare \? 3 : 2/);
    expect(widget).toMatch(/let count = max\(state\.names\.count, state\.avatarUrls\.count\)/);
    expect(widget).toMatch(/let name = index < state\.names\.count \? state\.names\[index\] : ""/);
    expect(widget).toMatch(/let url = index < state\.avatarUrls\.count \? state\.avatarUrls\[index\] : nil/);
    expect(widget).toMatch(/guard let url,[\s\S]*?HuddleSharedAvatarStore\.load\(reference: url\) != nil/);
  });

  it("preserves name-photo positional pairing and out-now overflow math", () => {
    const js = activeSessions();
    const widget = liveActivityWidget();
    expect(js).toMatch(/const pairs = list\.map\(\(entry\) => \(\{\s*avatarUrl: String\(entry\.avatarUrl \|\| ""\)\.trim\(\),\s*name: String\(entry\.name \|\| ""\)\.trim\(\),/s);
    expect(js).toMatch(/avatarUrls: pairs\.map\(\(entry\) => entry\.avatarUrl\)/);
    expect(js).toMatch(/avatarIsBlurred: pairs\.map\(\(entry\) => entry\.isBlurred\)/);
    expect(js).toMatch(/names: pairs\.map\(\(entry\) => entry\.name\)/);
    expect(widget).toMatch(/max\(0, state\.totalCount - shown\.count\)/);
  });

  it("uses authoritative compact nearby counts and never ellipsizes the Lock Screen subline", () => {
    const js = activeSessions();
    const homeScreen = home();
    const hydration = activeHydration();
    const widget = liveActivityWidget();
    const android = androidActiveSessions();
    const androidLayout = androidActiveSessionLayout();
    expect(js).toMatch(/friendCount\?: number/);
    expect(js).toMatch(/nearbyUserCount\?: number/);
    expect(homeScreen).toMatch(/friendCount: pulse\.matchedOut\.length/);
    expect(homeScreen).toMatch(/nearbyUserCount: pulse\.nearbyOut\.length/);
    expect(hydration).toMatch(/friendCount: nearbySnapshot\?\.friendCount \?\? 0/);
    expect(hydration).toMatch(/nearbyUserCount: nearbySnapshot\?\.nearbyUserCount \?\? 0/);
    expect(widget).toMatch(/func compactSubline\(intervalComplete: Bool\) -> String\?/);
    expect(widget).toContain("friendLabel");
    expect(widget).toContain("userLabel");
    expect(widget).toContain("pets are under care");
    expect(widget).toMatch(/Text\(subline\)[\s\S]*?\.lineLimit\(1\)[\s\S]*?\.truncationMode\(\.tail\)/);
    expect(android).toMatch(/private fun presentationState\(/);
    expect(android).toMatch(/HuddleActiveSessionPresentation\.reduce\(/);
    expect(android).toMatch(/setTextViewText\(R\.id\.huddle_subtitle, presentation\.subline\.orEmpty\(\)\)/);
    expect(android).toMatch(/setViewVisibility\(R\.id\.huddle_subtitle, if \(presentation\.subline == null\) View\.GONE else View\.VISIBLE\)/);
    expect(androidLayout).toMatch(/android:id="@\+id\/huddle_subtitle"[\s\S]*?android:ellipsize="end"[\s\S]*?android:maxLines="1"/);
  });

  it("overlaps +N by the same six points as the companion avatars on iOS and Android", () => {
    const widget = liveActivityWidget();
    const androidLayout = androidActiveSessionLayout();
    expect(widget).toMatch(/companionStack:[\s\S]*?HStack\(alignment: \.bottom, spacing: -6\)/);
    expect(widget).not.toMatch(/Text\("\+\\\(overflow\\\)"\)[\s\S]*?\.padding\(\.trailing, 8\)/);
    expect(androidLayout).toMatch(/android:id="@\+id\/huddle_avatar_overflow"[\s\S]*?android:layout_marginEnd="-6dp"/);
  });

  it("cleans up stored stale activities during hydration", () => {
    const js = activeSessions();
    const hydration = activeHydration();
    expect(js).toMatch(/export const clearHomePresenceActivityIfStored = async \(\) => \{/);
    expect(js).toMatch(/export const clearInactiveCareSessionActivities = async \(activeSessions: Array<\{ chatId: string; serviceId: string \} \| string>\) => \{/);
    expect(js).toMatch(/service=\$\{encodeURIComponent\(entry\.serviceId\)\}/);
    expect(hydration).not.toMatch(/clearHomePresenceActivityIfStored/);
    expect(hydration).toMatch(/await clearInactiveCareSessionActivities\(activeCareSessions\)/);
  });

  it("uses a custom Android remote-view card instead of a plain text notification", () => {
    const android = androidActiveSessions();
    expect(android).toMatch(/RemoteViews\(context\(\)\.packageName, R\.layout\.huddle_active_session_compact\)/);
    expect(android).toMatch(/\.setCustomContentView\(remoteViews\)/);
    expect(android).toMatch(/\.setCustomBigContentView\(remoteViews\)/);
    expect(android).toMatch(/\.setCustomHeadsUpContentView\(remoteViews\)/);
    expect(android).toMatch(/NotificationCompat\.DecoratedCustomViewStyle/);
    expect(android).toMatch(/widget_render_fallback_avatar/);
    expect(android).toMatch(/snapshot_degraded_missing_companions/);
  });

  it("does not substitute a companion photo when the out-now self avatar is missing", () => {
    const widget = liveActivityWidget();
    expect(widget).toMatch(/HuddleRingedAvatar\(url: state\.isCare \? state\.avatarUrls\.first : state\.selfAvatarUrl/);
    expect(widget).toMatch(/HuddleProgressRingedAvatar\([\s\S]{0,180}state: state,[\s\S]{0,180}fallbackGlyph: "person\.fill"/);
    expect(widget).toMatch(/if let url = state\.selfAvatarUrl, let image = HuddleSharedAvatarStore\.load\(reference: url\)/);
    expect(widget).toMatch(/HuddleAvatarFallback\(size: inner, glyph: fallbackGlyph\)/);
  });

  it("falls back to the brand glyph instead of a blank disc for nameless placeholders", () => {
    const widget = liveActivityWidget();
    expect(widget).toMatch(/else if let initial = name\.trimmingCharacters\(in: \.whitespaces\)\.first/);
    expect(widget).toMatch(/HuddleAvatarFallback\(size: size, glyph: fallbackGlyph\)/);
  });

  it("keeps Walk and overrun Care full with the glyph attached to the endpoint", () => {
    const widget = liveActivityWidget();
    const android = androidActiveSessions();
    expect(widget).toContain("let displayedProgress: CGFloat = intervalComplete ? 1 : fraction");
    expect(widget).toContain("fraction: progress,");
    expect(widget).toContain("fraction = CGFloat(max(0, min(1000, progressPermille ?? 0))) / 1000");
    expect(widget).not.toMatch(/HuddleOverrunSessionTrack/);
    expect(widget).toMatch(/let glyphLeading = max\(0, fillWidth - 2\)/);
    expect(android).toContain("val displayedProgress = presentation.displayedProgressPermille");
    expect(android).toMatch(/huddle_progress_overrun, View\.GONE/);
  });

  it("starts Home's activity from the confirmed clock immediately, not behind the profile refresh", () => {
    const s = home();
    // Closing the app moments after tapping "I'm out now" must not lose the
    // Live Activity: it must not wait on the secondary profile-summary
    // refetch, which is reconciliation, not a precondition for existing.
    const startIndex = s.indexOf("void startHomePresenceActivity({");
    const secondaryFetchIndex = s.indexOf('void fetchNativeProfileSummary(userId, { force: true, accessToken: freshAccessToken, sessionKey })');
    expect(startIndex).toBeGreaterThan(-1);
    expect(secondaryFetchIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeLessThan(secondaryFetchIndex);
  });

  it("reuses the last resolved avatar on renewal instead of resetting the activity to a placeholder", () => {
    const s = home();
    // A renewal's activity is already running with a correct avatar. Passing
    // null unconditionally would flash it back to the placeholder on every
    // renewal, not just the genuine first start.
    expect(s).toContain("const presenceAvatarUrlRef = useRef<string | null>(null);");
    expect(s).toContain("if (selfAvatarUrl) presenceAvatarUrlRef.current = selfAvatarUrl;");
    expect(s).toContain("selfAvatarUrl: presenceAvatarUrlRef.current,");
    expect(s).not.toMatch(/void startHomePresenceActivity\(\{[\s\S]{0,200}selfAvatarUrl: null,/);
  });
});
