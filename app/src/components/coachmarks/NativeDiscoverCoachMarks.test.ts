import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeDiscoverCoachMarks.tsx"), "utf8");

describe("NativeDiscoverCoachMarks", () => {
  it("uses the approved three-step order", () => {
    expect(source()).toContain('["star", "wave", "swipe"]');
  });

  it("keeps every word of the approved copy across the kicker/headline/body split", () => {
    const text = source();
    // Star's single sentence breaks at its em dash; the other two break at the
    // sentence boundary. No word is added, removed or reworded.
    expect(text).toContain('headline: "Says hello —", body: "and opens the chat right away!"');
    expect(text).toContain('headline: "Says you\'re interested.", body: "You\'re matched once they wave back."');
    expect(text).toContain('headline: "You can also swipe.", body: "Right to say yes, left to pass for now."');
  });

  it("carries the social accent and shows the swipe guide only on the gesture step", () => {
    const text = source();
    expect(text).toContain("accent={huddleColors.coral}");
    expect(text).toContain('showSwipeGuide={currentStep === "swipe"}');
  });

  it("reports its position so the overlay can draw progress dashes", () => {
    const text = source();
    expect(text).toContain("step={stepIndex + 1}");
    expect(text).toContain("totalSteps={DISCOVER_STEPS.length}");
  });

  it("retries target measurement until the mounted deck controls are available and retains geometry across advances", () => {
    const text = source();
    expect(text).toContain("type DiscoverCoachMarkGeometry");
    expect(text).toContain("onMeasured({");
    expect(text).toContain("const target = (() => {");
    expect(text).not.toContain("setTarget(null)");
    expect(text).toContain("measureInWindow");
    expect(text).toContain("MAX_DISCOVER_GEOMETRY_MEASURE_ATTEMPTS");
    expect(text).toContain("onUnavailable");
    expect(text).toContain("requestAnimationFrame(scheduleMeasurement)");
  });

  it("keeps Swipe centred but places Star and Wave near their real controls", () => {
    const text = source();
    expect(text).toContain("wave.measureInWindow");
    expect(text).toContain("card.measureInWindow");
    expect(text).toContain('currentStep === "swipe"');
    expect(text).toContain("bottom: Math.min(geometry.star.y, geometry.wave.y)");
    expect(text).toContain("copyRegion={copyRegion}");
    expect(text).not.toContain("const spotlight");
  });

  it("clips the white veil and every copy block to the measured top card", () => {
    const text = source();
    expect(text).toContain("contentBounds={geometry?.card}");
    expect(text).toContain("whiteVeilBounds={geometry?.card}");
  });

  it("limits the continue hit area to the measured page above the global nav", () => {
    const text = source();
    expect(text).toContain("page.measureInWindow");
    expect(text).toContain("huddleLayout.navHeight");
    expect(text).toContain("Math.min(pageY + pageHeight, globalNavTop)");
    expect(text).toContain("advanceBounds={geometry?.page}");
  });

  it("reuses the exact shared Wave visual on the Swipe step", () => {
    expect(source()).toContain("swipeWaveVisual={waveFocusVisual}");
  });

  it("does not expose the whole card as a rectangular hole on the swipe step", () => {
    const text = source();
    expect(text).toContain('focusEnabled={currentStep !== "swipe"}');
    expect(text).toContain('focusVisual={currentStep === "star" ? starFocusVisual : currentStep === "wave" ? waveFocusVisual : null}');
  });

  it("marks seen only after the final step", () => {
    expect(source()).toContain('markNativeCoachMarkSeen(userId, "discover_star_wave_swipe").finally(onFinish)');
  });
});
