import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeMapScreen.tsx"), "utf8");
const tokens = () => readFileSync(resolve(dir, "../theme/huddleDesignTokens.ts"), "utf8");

describe("NativeMapScreen area privacy fields", () => {
  it("uses one canonical 500m server-cell membership rule", () => {
    const screen = source();
    expect(screen).toMatch(/const AREA_BLOB_RADIUS_M = 500/);
    expect(screen).toMatch(/const AREA_CELL_DEG = 0\.0045/);
    expect(screen).toMatch(/buildNativeMapPeopleAreaGroups/);
    expect(screen).toMatch(/nativeMapPeopleAreaKey/);
    expect(screen).not.toMatch(/AREA_CLUSTER_MAX_DIAMETER_M/);
    expect(screen).not.toMatch(/cluster\.points\.every/);
  });

  it("uses native radial circle overlays rather than visible polygon bands", () => {
    const screen = source();
    expect(screen).toMatch(/id="huddle-area-gradients"/);
    expect(screen).toMatch(/<Mapbox\.CircleLayer/);
    expect(screen).toMatch(/circleBlur: \["get", "blur"\]/);
    expect(screen).toMatch(/pixelRadiusAtZoom0/);
    expect(screen).not.toMatch(/id="huddle-area-blobs"/);
    expect(screen).not.toMatch(/id="huddle-alert-blobs"/);
  });

  it("keeps friend-only fields cool, own-area fields green, and alert fields separate", () => {
    const screen = source();
    expect(screen).toMatch(/cluster\.hasOwner \? huddleMap\.marker\.ownPin : "#BFD8FF"/);
    expect(screen).toMatch(/strength: cluster\.hasOwner \? 1\.65 : 1\.4/);
    expect(screen).toMatch(/const ALERT_BLOB_RADIUS_M = Math\.round\(AREA_BLOB_RADIUS_M \* 1\.5\)/);
    expect(screen).toMatch(/Alert fields paint first/);
  });

  it("does not add visible area disclosure copy on the map", () => {
    const screen = source();
    expect(screen).not.toMatch(/Approximate area/);
    expect(screen).not.toMatch(/approximateAreaChip/);
  });

  it("keeps area avatars and alert pins centred in their own fields", () => {
    const screen = source();
    expect(screen).toMatch(/coordinate=\{cluster\.center\} key=\{`alert-aggregate:\$\{cluster\.key\}`\}/);
    expect(screen).toMatch(/coordinate=\{cluster\.center\} style=\{\[styles\.mapInteractiveMarker, styles\.mapOwnInteractiveMarker\]\}>\s*<View[\s\S]*?<AreaChipRow/s);
    expect(screen).toMatch(/<AreaChipRow/);
  });

  it("keeps each avatar sufficiently exposed and ranks active friends first in the area menu", () => {
    const screen = source();
    expect(screen).toMatch(/const AREA_CHIP_OVERLAP = 6/);
    expect(screen).toMatch(/marginLeft: -AREA_CHIP_OVERLAP/);
    expect(screen).toMatch(/stackIndex\?: number/);
    expect(screen).toMatch(/zIndex: stackIndex/);
    expect(screen).toMatch(/shownOthers\.length - index/);
    expect(screen).toMatch(/fetchNativeMatchedRailSummary\(\{ accessToken, userId: effectiveUserId \}\)/);
    expect(screen).toMatch(/const sortedAreaMenuMembers = useMemo/);
    expect(screen).toMatch(/relationshipRank = Number\(friendPeerIds\.has\(right\.id\)\) - Number\(friendPeerIds\.has\(left\.id\)\)/);
    expect(screen).toMatch(/\(friend\)/);
    expect(screen).toMatch(/fontSize: 14/);
    expect(screen).toMatch(/<Text style=\{styles\.areaMoreText\}>\{overflow\}<\/Text>/);
    expect(screen).not.toMatch(/>\+\{overflow\}<\/Text>/);
  });

  it("anchors the area menu below the rendered avatar stack", () => {
    const screen = source();
    expect(screen).toMatch(/const anchorCoord = cluster\.center/);
    expect(screen).toMatch(/left: point\[0\] - AREA_MENU_POINTER_CENTER_X/);
    expect(screen).toMatch(/const anchorHalfHeight = cluster\.hasOwner/);
    expect(screen).toMatch(/top: point\[1\] \+ anchorHalfHeight \+ huddleSpacing\.x2/);
    expect(screen).toMatch(/width: AREA_MENU_WIDTH/);
  });

  it("keeps the people picker compact and scrollable without obscuring the map", () => {
    const screen = source();
    expect(screen).toMatch(/const AREA_MENU_MAX_VISIBLE_ROWS = 4/);
    expect(screen).toMatch(/const AREA_MENU_ROW_HEIGHT = 56/);
    expect(screen).toMatch(/Math\.min\(rowCount, AREA_MENU_MAX_VISIBLE_ROWS\) \* AREA_MENU_ROW_HEIGHT/);
    expect(screen).toMatch(/<Animated\.ScrollView\s+bounces=\{false\}\s+nestedScrollEnabled/s);
    expect(screen).toMatch(/showsVerticalScrollIndicator=\{false\}/);
    expect(screen).toMatch(/areaMenuScrollTrack/);
    expect(screen).toMatch(/areaMenuScrollThumb/);
    expect(screen).toMatch(/maxHeight: AREA_MENU_ROW_HEIGHT \* AREA_MENU_MAX_VISIBLE_ROWS/);
  });

  it("keeps the owner centred and gives nearby users a separate hit target", () => {
    const screen = source();
    expect(screen).toMatch(/const ownerToOthersGap = owner && shownOthers\.length > 0 \? huddleSpacing\.x1 : 0/);
    expect(screen).toMatch(/const ownerOffsetX = owner \? \(ownerToOthersGap \+ shownOthersWidth\) \/ 2 : 0/);
    expect(screen).toMatch(/index === 0 \? ownerToOthersGap : -AREA_CHIP_OVERLAP/);
    expect(screen).toMatch(/style=\{\[styles\.mapInteractiveMarker, styles\.mapOwnInteractiveMarker\]\}/);
  });

  it("keeps decorative fields below tappable pin annotations", () => {
    const screen = source();
    expect(screen).toMatch(/<Mapbox\.ShapeSource id="huddle-area-gradients" shape=\{areaGradientFeatures\}>/);
    expect(screen).not.toMatch(/handleAreaGradientPress/);
    expect(screen).toMatch(/<Mapbox\.CircleLayer/);
    expect(screen).toMatch(/mapInteractiveMarker:\s*\{\s*zIndex: 1/s);
    expect(screen).toMatch(/mapOwnInteractiveMarker:\s*\{\s*zIndex: 3/s);
  });

  it("keeps map popovers visible without placing an invisible touch layer above markers", () => {
    const screen = source();
    expect(screen).not.toMatch(/accessibilityLabel="Close area menu"/);
    expect(screen).not.toMatch(/accessibilityLabel="Close map sharing controls"/);
    expect(screen).toMatch(/const beginMapMarkerPress = useCallback/);
    expect(screen).toMatch(/mapMarkerPressGuardUntilRef/);
    expect(screen).toMatch(/if \(state\.gestures\?\.isGestureActive\)/);
  });

  it("gives every people marker an early touch claim and one deterministic fan-out path", () => {
    const screen = source();
    expect(screen).toMatch(/onPressIn=\{beginMapMarkerPress\}/);
    expect(screen.match(/void focusFriendFanAndOpenMenu\(item\)/g)?.length).toBe(2);
    expect(screen).toMatch(/setExpandedFriendIds\(new Set\(\[item\.id\]\)\)/);
    expect(screen).not.toMatch(/setTimeout\([\s\S]{0,100}openAreaMenu/);
    expect(screen).not.toMatch(/disabled=\{member\.is_invisible\}/);
    expect(screen).toMatch(/setStatusMessage\("This person is sharing privately\."\)/);
  });

  it("dismisses transient map selections from the map itself and reserves native controls", () => {
    const screen = source();
    expect(screen).toMatch(/onPress=\{\(event\) => \{[\s\S]*?clearPrimaryMapSelection\(\)/);
    expect(screen).toMatch(/const zoomRailSafeX = windowSize\.width - huddleLayout\.minTouch - huddleSpacing\.x6/);
    expect(screen).toMatch(/const bottomControlSafeY = windowSize\.height -/);
  });

  it("keeps Caution and Others neutral, while preserving their merge priority", () => {
    const screen = source();
    expect(screen).toMatch(/\["lost", "stray", "caution", "others"\]/);
    expect(tokens()).toMatch(/alertCaution: huddleColors\.alertOther/);
    expect(tokens()).toMatch(/alertOthers: "#A1A4A9"/);
  });
});
