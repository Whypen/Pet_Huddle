import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "../screens/NativeMapScreen.tsx"), "utf8");

describe("NativeMapScreen broadcast location holder", () => {
  it("publishes the live holder coordinate rather than delayed camera state", () => {
    const screen = source();
    expect(screen).toMatch(/const currentCenter = centerCoordinateRef\.current;[\s\S]*const center = \{ lat: currentCenter\[1\], lng: currentCenter\[0\] \};[\s\S]*setBroadcastPreviewPin\(center\)/);
    expect(screen).not.toMatch(/const center = broadcastPinningCenter \?\?/);
  });

  it("keeps address search in the pin-first view and map taps do not open the composer", () => {
    const screen = source();
    expect(screen).toMatch(/accessibilityLabel="Alert location search"/);
    expect(screen).toMatch(/lookupNativeMapQueryCenter\(query, null, \{ lat: currentCenter\[1\], lng: currentCenter\[0\] \}\)/);
    expect(screen).toMatch(/A map tap repositions the holder but does not bypass the pin-first/);
  });

  it("shows address validation only after an explicitly empty search", () => {
    const screen = source();
    expect(screen).toMatch(/if \(!broadcastManualQuery\.trim\(\)\) \{\s*setBroadcastManualAttempted\(true\)/);
    expect(screen).toMatch(/setBroadcastManualAttempted\(false\);\s*void searchBroadcastManualLocation\(\)/);
    expect(screen).not.toMatch(/Location not found\. Try a more specific address/);
  });

  it("keeps long location results on one stable input line", () => {
    const screen = source();
    expect(screen).toMatch(/accessibilityLabel="Alert location search"[\s\S]*multiline=\{false\}[\s\S]*numberOfLines=\{1\}/);
    expect(screen).toMatch(/manualAddressInput: \{[\s\S]*height: 36,[\s\S]*maxHeight: 36/);
  });

  it("keeps the existing incognito toggle optimistic and serializes writes", () => {
    const screen = source();
    expect(screen).toMatch(/selfPinPersistChainRef/);
    expect(screen).toMatch(/selfPinIntentVersionRef/);
    expect(screen).toMatch(/const effectivePending = pending;/);
    expect(screen).toMatch(/resolveOwnAreaCoordinate\(ownPin\.lng, ownPin\.lat, mapPeopleGeometryVersion, mapViewerArea\)/);
    expect(screen).toMatch(/const toggleSelfIncognito = useCallback/);
    expect(screen).toMatch(/applyCamera\(displayCenter, Math\.max\(cameraZoomRef\.current, 15\.5\)\)/);
    expect(screen).toMatch(/openSelfPinMenu/);
    expect(screen).toMatch(/onChangePrecision=\{\(precision\) => persistSelfPin\(precision, selfHours/);
  });

  it("anchors owner and friend markers to the same canonical 500m server cell", () => {
    const screen = source();
    expect(screen).toMatch(/return viewerArea \? \[viewerArea\.lng, viewerArea\.lat\] : \[lng, lat\]/);
    expect(screen).toMatch(/const areaKey = nativeMapPeopleAreaKey/);
    expect(screen).toMatch(/clusters\.set\(presence\.areaKey/);
    expect(screen).not.toMatch(/cluster\.points\.every/);
    expect(screen).toMatch(/const AREA_BLOB_RADIUS_M = 500/);
    expect(screen).toMatch(/pixelRadiusAtZoom0: blob\.radius \* mapPixelsPerMeter\(blob\.center\[1\], 0\)/);
    expect(screen).toMatch(/circleRadius: \[[\s\S]*?\["exponential", 2\][\s\S]*?\["zoom"\]/);
    expect(screen).not.toMatch(/blob\.hasOwner \? 375 : blob\.radius/);
  });

  it("keeps camera gestures native and resolves React marker layout only after map idle", () => {
    const screen = source();
    const cameraChanged = screen.match(/onCameraChanged=\{\(state\) => \{([\s\S]*?)\n[ ]{8}\}\}\n[ ]{8}onMapIdle=/)?.[1] ?? "";
    const mapIdle = screen.match(/onMapIdle=\{\(\) => \{([\s\S]*?)\n[ ]{10}if \(suppressNextAlertCameraIdleFetchRef\.current\)/)?.[1] ?? "";

    expect(cameraChanged).toContain("cameraZoomRef.current = zoom");
    expect(cameraChanged).toContain("centerCoordinateRef.current = nextCenter");
    expect(cameraChanged).not.toContain("setCurrentZoom");
    expect(cameraChanged).not.toContain("setBroadcastPinningCenter");
    expect(cameraChanged).not.toContain("setPetPois");

    expect(mapIdle).toContain("setCurrentZoom");
    expect(mapIdle).toContain("setMapVisualZoomTier");
    expect(mapIdle).toContain("setSettledAlertLayoutZoom");
    expect(mapIdle).toContain("setSettledFriendLayoutZoom");
    expect(screen).toMatch(/const MAP_ZOOM_TIER_HYSTERESIS = 0\.25/);
  });
});
