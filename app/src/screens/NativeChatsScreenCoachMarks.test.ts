import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeChatsScreen.tsx"), "utf8");

describe("NativeChatsScreen Discover coach marks", () => {
  it("starts only when the active Discover deck has a visible, measured profile", () => {
    const text = source();
    expect(text).toContain('topTab !== "discover"');
    expect(text).toContain("!currentDiscoveryProfileId");
    expect(text).toContain("!discoveryGeometryReady");
    expect(text).toContain("discoverLocationPrivacyCoverVisible");
    expect(text).toContain('isNativeCoachMarkSeen(userId, "discover_star_wave_swipe")');
  });

  it("lets users see Discover before arming the sequence for their first in-page interaction", () => {
    const text = source();
    expect(text).toContain("const [discoverCoachMarkArmed, setDiscoverCoachMarkArmed] = useState(false)");
    expect(text).toContain("setShowDiscoverCoachMarks(false)");
    expect(text).toContain("setDiscoverCoachMarkArmed((armed) => armed || !seen)");
    expect(text).toContain("const startDiscoverCoachMarks = useCallback");
    expect(text).toContain('accessibilityLabel="Show Discover guide"');
    expect(text).toContain("onPressIn={startDiscoverCoachMarks}");
    expect(text).toContain("style={StyleSheet.absoluteFill}");
    expect(text).not.toContain("onStartShouldSetResponderCapture={startDiscoverCoachMarks}");
    expect(text).not.toContain("setShowDiscoverCoachMarks(!seen)");
  });

  it("never dismisses an open sequence from the arming effect, and cannot re-fire once finished", () => {
    const text = source();
    // The arming effect re-runs on every top-card change (hydration swap, or the user
    // swiping on). It must arm only -- a bare setShowDiscoverCoachMarks(false) inside
    // the seen-check callback closed the overlay while the user was still reading it.
    const armingCallback = text.slice(
      text.indexOf('isNativeCoachMarkSeen(userId, "discover_star_wave_swipe")'),
      text.indexOf("const startDiscoverCoachMarks"),
    );
    expect(armingCallback).not.toContain("setShowDiscoverCoachMarks(false)");
    expect(armingCallback).toContain("discoverCoachMarksCompletedRef.current");
    expect(text).toContain("const discoverCoachMarksCompletedRef = useRef(false)");
    expect(text).toContain("discoverCoachMarksCompletedRef.current = true;");
  });

  it("measures Star and Wave only on the top card and reuses the deck target for swipe", () => {
    const text = source();
    expect(text).toContain("ref={index === 0 ? starRef : undefined}");
    expect(text).toContain("ref={index === 0 ? waveRef : undefined}");
    expect(text).toContain("ref={index === 0 ? cardRef : undefined}");
    expect(text).toMatch(/ref=\{index === 0 \? cardRef : undefined\}\s+style=\{\[styles\.discoveryProfileCard/);
    expect(text).not.toMatch(/ref=\{index === 0 \? cardRef : undefined\}\s+style=\{\[\s*styles\.discoveryCardUnit/);
    expect(text).toContain("cardRef={discoverCardRef}");
    expect(text).toContain("starRef={discoverStarRef}");
    expect(text).toContain("waveRef={discoverWaveRef}");
    expect(text).toContain("starFocusVisual={<DiscoveryStarControlVisual standalone />}");
    expect(text).toContain("waveFocusVisual={<DiscoveryWaveControlVisual standalone />}");
  });

  it("bounds coach-mark advancement to the page, outside global header and nav", () => {
    const text = source();
    expect(text).toContain("ref={discoverPageRef}");
    expect(text).toContain("pageRef={discoverPageRef}");
  });

  it("reuses the exact live Star and Wave visuals for the spotlight focus", () => {
    const text = source();
    expect(text).toContain("function DiscoveryStarControlVisual");
    expect(text).toContain("function DiscoveryWaveControlVisual");
    expect((text.match(/<DiscoveryStarControlVisual/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((text.match(/<DiscoveryWaveControlVisual/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("does not add any Community coach mark", () => {
    const text = source();
    expect(text).not.toContain("community_tab_intro");
    expect(text).not.toContain("communityTooltipAnchor");
  });
});
