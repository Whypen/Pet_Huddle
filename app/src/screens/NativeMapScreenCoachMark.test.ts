import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeMapScreen.tsx"), "utf8");

describe("NativeMapScreen Broadcast coach mark", () => {
  it("measures the existing Broadcast control, never the personal pin control", () => {
    const text = source();
    expect(text).toMatch(/ref=\{broadcastCoachMarkRef\}[\s\S]{0,600}accessibilityLabel="Broadcast an alert"/);
    expect(text).not.toMatch(/ref=\{broadcastCoachMarkRef\}[\s\S]{0,200}accessibilityLabel=\{ownPin \? "Unpin my location"/);
  });

  it("uses the approved one-step spotlight copy on first real Map use", () => {
    const text = source();
    expect(text).toContain('isNativeCoachMarkSeen(effectiveUserId, "map_broadcast_intro")');
    expect(text).toContain('headline="Pins stay live 7 days, plus any boost time."');
    expect(text).toContain('body="You choose who sees them and how far."');
    expect(text).toContain('kicker="Alerts"');
    expect(text).toContain("<NativeSpotlightOverlay");
  });

  it("reuses the exact Broadcast control above the uninterrupted blur", () => {
    const text = source();
    expect(text).toMatch(/focusVisual=\{\([\s\S]*?<MapControlButton[\s\S]*?icon="radio"[\s\S]*?size=\{56\}/);
  });

  it("keeps global header and bottom navigation outside the continue hit area", () => {
    const text = source();
    expect(text).toContain("const mapCoachMarkAdvanceBounds");
    expect(text).toContain("y: mapTopChromeOffset");
    expect(text).toContain("huddleLayout.navHeight");
    expect(text).toContain("advanceBounds={mapCoachMarkAdvanceBounds}");
  });

  it("does not wait for Mapbox tiles before showing and retries the real button measurement", () => {
    const text = source();
    expect(text).toMatch(/if \(!active \|\| !effectiveUserId\) \{/);
    expect(text).not.toContain('if (!active || !mapLoaded || !effectiveUserId) return undefined;');
    expect(text).toContain("let remainingAttempts = 8;");
    expect(text).toContain("onLayout={() => {");
  });

  it("persists dismissal per user", () => {
    expect(source()).toContain('markNativeCoachMarkSeen(effectiveUserId, "map_broadcast_intro")');
  });

  it("lets users see Map before its first in-page interaction opens the spotlight", () => {
    const text = source();
    expect(text).toContain("const [showBroadcastCoachMark, setShowBroadcastCoachMark] = useState(false)");
    expect(text).toContain("const startBroadcastCoachMark = useCallback");
    expect(text).toContain("onStartShouldSetResponderCapture={startBroadcastCoachMark}");
    expect(text).toContain("visible={active && showBroadcastCoachMark && Boolean(broadcastCoachMarkTarget)}");
    expect(text).not.toContain("visible={active && broadcastCoachMarkEligible && Boolean(broadcastCoachMarkTarget)}");
  });
});
