import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const src = () => readFileSync(resolve(dir, "./NativeMapScreen.tsx"), "utf8");

describe("NativeMapScreen self-pin wiring", () => {
  it("uses only the shared anchored self-pin menu instead of the legacy bottom sheet or an inline bespoke menu", () => {
    const s = src();
    expect(s).not.toMatch(/NativeSelfPinSheet/);
    expect(s).toMatch(/NativeSelfPinAnchoredMenu/);
    expect(s).toMatch(/openSelfPinMenu/);
    expect(s).toMatch(/openSelfPinMenuRef\.current\(displayCenter/);
    expect(s).toMatch(/onOwnerPress=/);
    expect(s).not.toMatch(/ApproximateAreaChip/);
  });

  it("retains the existing icon-only incognito control", () => {
    const s = src();
    expect(s).toMatch(/icon=\{selfPrecision === "hidden" \? "eye-off" : "eye"\}/);
    expect(s).toMatch(/onPress=\{toggleSelfIncognito\}/);
  });

  it("centers by GPS -> stored pin -> cached view -> profile area/district -> profile city", () => {
    const s = src();
    expect(s).toMatch(/const initialCenter = gpsCenter \?\? storedPinCenter \?\? cachedCenter \?\? areaDistrictCenter \?\? cityCenter;/);
    // stored pin uses last_lat/last_lng independent of the share-visibility window.
    expect(s).toMatch(/storedPinCenter = profilePinCenter\(profile\)/);
    expect(s).toMatch(/cityCenter = profileCityCenter\(profile\)/);
    expect(s).not.toMatch(/profileLocationCenter\(/);
  });

  it("stays at a fresh last view on warm remount but re-centers on a cold start", () => {
    const s = src();
    expect(s).toMatch(/if \(cachedCenter && !isColdStart\)/);
    expect(s).toMatch(/nativeMapColdStartConsumed/);
  });

  it("keeps public map sharing behind the explicit pin action", () => {
    const s = src();
    expect(s).toMatch(/accessibilityLabel=\{ownPin \? "Unpin my location" : "Pin my location"\}/);
    expect(s).toMatch(/if \(ownPin\) \{\s*setShowUnpinConfirm\(true\)/);
    expect(s).not.toMatch(/refreshExistingPinIfMoved/);
    expect(s).not.toMatch(/Pinned location refreshed/);
    expect(s).toMatch(/subscribeNativeViewerScope/);
    expect(s).toMatch(/setNativeMapWarmCenter\(\[coords\.lng, coords\.lat\]\)/);
  });

  it("never paints a retained location as an active green self pin", () => {
    const s = src();
    expect(s).toMatch(/isNativeMapSharingWindowVisible/);
    expect(s).not.toMatch(/cached\.ownPin/);
    expect(s).toMatch(/deriveNativeMapOwnPinFromProfile\(profile/);
    expect(s).toMatch(/if \(!isNativeMapSharingWindowVisible\(nextVisibleUntil\)\) return null;/);
  });

  it("reconciles shared Home and Map presence through profile events without a tab-entry fetch", () => {
    const s = src();
    expect(s).toContain("refreshIdentity?: boolean");
    expect(s).toContain("!options?.refreshIdentity && mapShellRequestKeyRef.current === viewportBucketKey");
    expect(s).toContain("!options?.refreshIdentity && identitySnapshot?.sessionKey === requestSessionKey");
    const entry = s.slice(s.indexOf("const becameActive = active && !wasActiveRef.current;"), s.indexOf("useEffect(() => {\n    if (!tokenConfig.ok)"));
    expect(entry).not.toContain("loadMapDataRef.current");
    expect(s).toContain("subscribeNativeProfileSummary(effectiveUserId");
    expect(s).toContain("fetchNativeMapOwnPin(effectiveUserId, { accessToken, force: options?.force === true, sessionKey: mapShellSessionKey })");
  });

  it("recenters through the shared location gate, then refines with a fresh reading", () => {
    const s = src();
    expect(s).toMatch(/const permission = await getNativeForegroundLocationPermissionDetail\(\);/);
    expect(s).toMatch(/const cachedLocation = await getNativeCurrentCoordinates\(\{ accuracy: "balanced" \}\);/);
    expect(s).toMatch(/if \(cachedLocation\) \{[\s\S]*latestPrivateGpsRef\.current = cachedLocation;[\s\S]*focusSelectionCamera\(\s*\[cachedLocation\.lng, cachedLocation\.lat\],\s*15\.5/);
    const recenterStart = s.indexOf("const handleLocationPress = async () =>");
    const recenterEnd = s.indexOf("const handleZoomChange", recenterStart);
    expect(s.slice(recenterStart, recenterEnd)).not.toMatch(/setOwnPin\(/);
    expect(s).toMatch(/getNativeCurrentCoordinates\(\{ accuracy: "high", force: true \}\)/);
    expect(s).toMatch(/We couldn't find your location yet\. Try again in a moment\./);
  });

  it("keeps the local self marker on private GPS without adding public-pin write churn", () => {
    const s = src();
    expect(s).toMatch(/const latestPrivateGpsRef = useRef/);
    expect(s).toMatch(/const displayOwnPin = nextOwnPin && privateGps/);
    expect(s).toMatch(/setOwnPin\(\(current\) => current \? \{ \.\.\.current, lat: coords\.lat, lng: coords\.lng \} : current\)/);
    expect(s).toMatch(/subscribeNativeViewerScope/);
    expect(s).not.toMatch(/watchNativeLocation\(/);
    expect(s).toMatch(/latestPrivateGpsRef\.current = null/);
    expect(s).not.toMatch(/refreshExistingPinIfMoved/);
  });

  it("requests the platform prompt directly, with Settings only after a denial", () => {
    const s = src();
    expect(s).toMatch(/requestNativeLocationForPin\(\{[\s\S]*?retainedCoordinates:/);
    expect(s).toMatch(/primaryLabel=\{locationSettingsReason === "services" \? "Open Location Settings" : "Open huddle Settings"\}/);
    expect(s).toMatch(/visible=\{active && locationSettingsReason !== null\}/);
    expect(s).toMatch(/setLocationSettingsReason\(location\.reason\)/);
    expect(s).toMatch(/precision: NATIVE_MAP_PRECISION_DEFAULT/);
    expect(s).toMatch(/pinNativeUserOutNow\(/);
  });

  it("starts and ends the same Walk activity used by Home", () => {
    const s = src();
    expect(s).toMatch(/import \{ endHomePresenceActivity, startHomePresenceActivity, updateHomePresenceActivity \} from "\.\.\/lib\/nativeActiveSessions";/);
    expect(s).toMatch(/startHomePresenceActivity\(\{[\s\S]*startedAt: outNowClock\.startedAt/);
    expect(s).toMatch(/await endHomePresenceActivity\(\);/);
  });

  it("starts the activity from outNowClock immediately, not behind the profile/avatar backfill", () => {
    const s = src();
    // Closing the app moments after tapping the pin must not lose the Live
    // Activity: it must not wait on fetchNativeProfileSummary or the avatar
    // resolve, both of which are still needed for the pin's display fields
    // but must never gate the activity's existence.
    const startIndex = s.indexOf("void startHomePresenceActivity({");
    const profileFetchIndex = s.indexOf("fetchNativeProfileSummary(effectiveUserId!, { force: true");
    expect(startIndex).toBeGreaterThan(-1);
    expect(profileFetchIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeLessThan(profileFetchIndex);
    expect(s).toContain("const priorAvatarUrl = ownPin?.avatar_url ?? null;");
    expect(s).toContain("selfAvatarUrl: priorAvatarUrl,");
  });

  it("patches the running activity once a properly resolved avatar differs from the one it started with", () => {
    const s = src();
    expect(s).toMatch(/if \(progressStartedAt && avatarUrl && avatarUrl !== priorAvatarUrl\) \{\s*void updateHomePresenceActivity\(/);
  });

  it("keeps a pending pin-style save from snapping back to stale profile precision", () => {
    const s = src();
    expect(s).toMatch(/pendingSelfPinPersistRef/);
    expect(s).toMatch(/selfPinPersistChainRef/);
    expect(s).toMatch(/selfPinIntentVersionRef/);
    expect(s).toMatch(/const effectivePending = pending;/);
    expect(s).toContain("effectivePending?.precision ?? normalizeNativeMapPrecision(profile?.map_precision ?? current?.map_precision)");
    expect(s).toContain("const profileVisibleUntil = typeof profile?.map_visible_until === \"string\" ? profile.map_visible_until : null;");
    expect(s).toContain("effectivePending?.visibleUntil ?? profileVisibleUntil ?? current?.map_visible_until ?? null");
    expect(s).toMatch(/pendingSelfPinPersistRef\.current = \{ precision, visibleUntil \}/);
  });

  it("treats an explicit stop as terminal before the network settles", () => {
    const s = src();
    expect(s).toMatch(/const optimisticallyStopMapSharing = useCallback/);
    expect(s).toMatch(/const intentVersion = \+\+selfPinIntentVersionRef\.current/);
    expect(s).toMatch(/pendingSelfPinPersistRef\.current = null/);
    expect(s).toMatch(/initialMapDataSeedRef\.current = null/);
    expect(s).toMatch(/identitySnapshot\.ownPin = null/);
    expect(s).toMatch(/setOwnPin\(null\)/);
    expect(s).toMatch(/map_visible_until: stoppedAt/);
  });

  it("serializes Unpin after every queued pin update so the latest choice wins", () => {
    const s = src();
    expect(s).toMatch(/selfPinPersistChainRef\.current[\s\S]{0,260}clearNativeUserLocationPin[\s\S]{0,260}stopNativeMapSharing/);
    expect(s).toMatch(/restoreMapSharingAfterStopFailure\(previous\)/);
  });

  it("cannot let an old shell read repaint a pin after an explicit visibility change", () => {
    const s = src();
    expect(s).toContain("const ownPinIntentVersion = selfPinIntentVersionRef.current;");
    expect(s).toContain("if (ownPinIntentVersion !== selfPinIntentVersionRef.current) return current;");
    expect(s).toMatch(/if \(!isNativeMapSharingWindowVisible\(nextVisibleUntil\)\) \{[\s\S]{0,500}selfPinIntentVersionRef\.current \+= 1/);
  });

  it("keeps the chosen Incognito avatar stable until the user explicitly chooses Incognito again", () => {
    const s = src();
    expect(s).toMatch(/const \[selfIncognitoAvatarVersion, setSelfIncognitoAvatarVersion\] = useState\(0\)/);
    expect(s).toMatch(/ownerMaskedAvatarKey=\{`\$\{effectiveUserId \|\| "self"\}:incognito:\$\{selfIncognitoAvatarVersion\}`\}/);
    expect(s).toMatch(/rotateIncognitoAvatar: precision === "hidden"/);
    expect(s).toMatch(/if \(options\?\.rotateIncognitoAvatar\) setSelfIncognitoAvatarVersion/);
    expect(s).not.toMatch(/ownerMaskedAvatarKey=.*location_pinned_until/);
  });
});
