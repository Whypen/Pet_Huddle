import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeSpotlightOverlay.tsx"), "utf8");

describe("NativeSpotlightOverlay", () => {
  it("supports circular and rounded targets", () => {
    const text = source();
    expect(text).toContain("react-native-svg");
    expect(text).toContain('shape: "circle" | "rounded"');
  });

  it("advances from the bounded page surface and never renders a Next control", () => {
    const text = source();
    expect(text).toContain("onPress={onAdvance}");
    expect(text).toContain("advanceBounds?: NativeSpotlightTarget | null;");
    expect(text).toContain('pointerEvents="box-none"');
    expect(text).toContain("styles.advanceSurface");
    expect(text).not.toMatch(/>Next</);
  });

  it("uses shared visual and motion tokens and measures the block height", () => {
    const text = source();
    expect(text).toContain("huddleMotion.durations.enter");
    expect(text).toContain("setBlockHeight(event.nativeEvent.layout.height)");
    expect(text).not.toContain("TOOLTIP_HEIGHT_ESTIMATE");
  });

  it("lays type directly on the active veil with the approved editorial hierarchy", () => {
    const text = source();
    expect(text).toContain("<View style={[styles.rule, { backgroundColor: accent }]} />");
    expect(text).toContain("{kicker}");
    expect(text).toContain("{headline}");
    expect(text).toContain("{body}");
    expect(text).not.toContain("huddleShadows");
    expect(text).not.toContain("glassOverlay");
  });

  it("keeps Map on the shared Toast blur and system-blue wash", () => {
    const text = source();
    expect(text).toContain('import { BlurView } from "@react-native-community/blur";');
    expect(text).toContain("blurAmount={huddleFeedbackGlass.blurAmount}");
    expect(text).toContain("colors={huddleFeedbackGlass.systemWash}");
    expect(text).toContain("whiteVeilBounds ? (");
  });

  it("clips one plain light BlurView to the measured top-card bounds", () => {
    const text = source();
    expect(text).not.toContain("NativeGlassSurface");
    expect(text).toContain("whiteVeilBounds ? (");
    expect(text).toContain('blurType="light"');
    expect(text).toContain('borderRadius: huddleRadii.modal');
    expect(text).toContain('height: whiteVeilBounds.height');
    expect(text).toContain('width: whiteVeilBounds.width');
    expect(text).toContain('backgroundColor: huddleColors.glassControl');
    expect(text).not.toContain("glassTint");
  });

  it("uses one uninterrupted full-window blur and re-renders the exact shared target above it", () => {
    const text = source();
    expect(text).toContain("focusVisual?: ReactNode;");
    expect(text).toContain("{focusEnabled && focusVisual ? (");
    expect(text).toContain("{focusVisual}");
    expect(text).not.toContain("MaskedView");
    expect(text).toContain("focusEnabled?: boolean;");
    expect(text).not.toContain("const veilStrips = [");
    expect(text).not.toContain("veilStrip:");
  });

  it("renders in the normal native tree so the glass can sample the actual screen", () => {
    const text = source();
    expect(text).not.toContain("<Modal");
    expect(text).toContain("zIndex: huddleLayers.coachMark");
  });

  it("sets dark type for the light veil and uses a real type token for the headline", () => {
    const text = source();
    expect(text).toMatch(/headline:\s*{[^}]*color:\s*huddleColors\.text/);
    expect(text).toMatch(/headline:\s*{[^}]*fontSize:\s*huddleType\.h1/);
    expect(text).not.toContain("huddleCoachMark.headlineSize");
  });

  it("supports a measured card copy region while clamping all copy inside the card", () => {
    const text = source();
    expect(text).toContain("copyRegion?: NativeSpotlightCopyRegion | null;");
    expect(text).toContain("const copyRegionTop = copyRegion");
    expect(text).toMatch(/copyRegionTop\s*!==\s*null\s*\?\s*copyRegionTop/);
    expect(text).toContain("const contentTopLimit = contentBounds");
    expect(text).toContain("const contentBottomLimit = contentBounds");
    expect(text).toContain("const blockHorizontalStyle = contentBounds");
  });

  it("takes its accent per surface rather than hardcoding one", () => {
    const text = source();
    expect(text).toContain("accent: string;");
    expect(text).not.toContain("huddleColors.coral");
    expect(text).not.toContain("huddleColors.lime");
  });

  it("renders progress dashes only when there is more than one step", () => {
    expect(source()).toContain("{totalSteps > 1 ? (");
  });

  it("keeps tap-to-advance behavior without rendering instruction copy", () => {
    const text = source();
    expect(text).toContain('accessibilityLabel="Continue"');
    expect(text).not.toContain("Tap anywhere to continue");
    expect(text).not.toContain("hint?: string");
    expect(text).not.toContain("styles.hint");
  });

  it("uses the exact founder-supplied arrow silhouette for both swipe directions", () => {
    const text = source();
    expect(text).toContain("const SWIPE_REFERENCE_ARROW_PATH");
    expect(text).toContain('<Path d={SWIPE_REFERENCE_ARROW_PATH} fill={huddleCoachMark.passSurface} />');
    expect(text).toContain('d={SWIPE_REFERENCE_ARROW_PATH} fill={huddleColors.blue}');
    expect(text).toContain("scale(-1 1)");
    expect(text).not.toContain("buildArrowPath");
  });

  it("uses Discover's pass surface on the left and the exact shared Wave visual on the right", () => {
    const text = source();
    expect(text).toContain('<NativeGlyph color={huddleColors.onPrimary} name="pass"');
    expect(text).toContain("waveVisual: ReactNode");
    expect(text).toContain("{waveVisual}");
    expect(text).not.toContain("MaterialCommunityIcons");
    expect(text).not.toContain("scaleX: -1");
  });

  it("sizes and positions the approved arrow with shared spacing tokens", () => {
    const text = source();
    expect(text).toContain("target.x + huddleSpacing.x3");
    expect(text).toContain("originX - huddleSpacing.x4 - arrowLeft");
    expect(text).toContain("originX + huddleSpacing.x4");
  });

  it("moves the approved arrows from lower centre outward and caps them at 80% opacity", () => {
    const text = source();
    expect(text).toContain("huddleCoachMark.swipeGuideOpacity");
    expect(text).toContain("huddleCoachMark.swipeGestureTravelX");
    expect(text).toContain("huddleCoachMark.swipeGestureTravelY");
    expect(text).toContain("huddleCoachMark.swipeGestureStartRotation");
    expect(text).toContain("huddleCoachMark.swipeGestureEndRotation");
    expect(text).toContain("huddleMotion.durations.coachMarkSwipe");
    expect(text).toContain("withRepeat(");
    expect(text).toMatch(/-1,\s*true,/);
    expect(text).not.toContain("swipeDrift");
  });

  it("uses Urbanist weights for the editorial hierarchy, with a bold headline", () => {
    const text = source();
    expect(text).toMatch(/kicker:\s*{[^}]*fontFamily:\s*"Urbanist-700"/);
    expect(text).toMatch(/headline:\s*{[^}]*fontFamily:\s*"Urbanist-700"/);
    expect(text).toContain('fontFamily: "Urbanist-500"');
  });
});
