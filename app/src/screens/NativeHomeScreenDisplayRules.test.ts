import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeHomeScreen.tsx"), "utf8");

describe("NativeHomeScreen compact display rules", () => {
  it("hides low group attendance counts", () => {
    expect(source()).toMatch(/event\.rsvpCount >= 3 \? <Text[^>]*>\{event\.rsvpCount\} going<\/Text> : null/);
  });

  it("drops trailing zeroes from whole-kilometre nearby distances", () => {
    const home = source();
    expect(home).toMatch(/Number\(\(meters \/ 1000\)\.toFixed\(1\)\)/);
    expect(home).toMatch(/Math\.round\(meters \/ 1000\)/);
    expect(home).toMatch(/return `\$\{kilometres\}km away`/);
    expect(home).not.toMatch(/toFixed\(meters < 10_000 \? 1 : 0\)/);
  });

  it("uses the canonical nearby-out snapshot and keeps the two-kilometre display boundary", () => {
    const home = source();
    expect(home).toMatch(/const HOME_NEARBY_MAX_METERS = 2_000/);
    expect(home).toMatch(/meters > HOME_NEARBY_MAX_METERS/);
    expect(home).toMatch(/preloadNativeHomeNearbyPeople\(\{ userId, accessToken, sessionKey/);
    expect(home).toMatch(/freshnessRegistry\.runOnce\(sessionKey, "nearby_out_snapshot"/);
  });

  it("does not present a cached Out Now window as active before canonical presence resolves", () => {
    const home = source();
    expect(home).toContain("const isOutNowActive = outNowPresenceResolved && Boolean(outNowCountdown);");
    expect(home.indexOf("queueOutNowMutation(presenceIntent, () => pinNativeUserOutNow(")).toBeLessThan(home.indexOf("setOutNowPresenceResolved(true);"));
    expect(home).not.toContain("optimisticPresence = true;");
  });

  it("keeps I'm back enabled after the server-confirmed Out commit", () => {
    const home = source();
    const outAction = home.slice(home.indexOf("const handleOutNow"), home.indexOf("const handleReturned"));
    expect(outAction.indexOf("setOutNowPresenceResolved(true);")).toBeGreaterThan(outAction.indexOf("pinNativeUserOutNow("));
    expect(outAction).toMatch(/finally \{[\s\S]{0,160}busy: false/);
    expect(home).toMatch(/const handleReturned = useCallback\(async \(\) => \{\s*if \(!userId\) return;/);
  });

  it("switches Back to the inactive state immediately instead of starting a location flow", () => {
    const home = source();
    expect(home).toContain("terminalHomePresenceAtRef.current = stoppedAt;");
    expect(home).toMatch(/Back is a terminal user choice[\s\S]{0,220}busy: false/);
    expect(home).toContain("Your map is unpinned. Check your connection to finish syncing.");
    expect(home).not.toContain("Returning…");
  });

  it("uses the shared presence lane so a late Out request cannot revive a returned session", () => {
    const home = source();
    expect(home).toContain("beginNativePresenceIntent");
    expect(home).toContain("enqueueNativePresenceMutation");
    expect(home).toMatch(/const queueOutNowMutation = useCallback/);
    expect(home).toMatch(/queueOutNowMutation\(presenceIntent, \(\) => pinNativeUserOutNow/);
    expect(home).toMatch(/queueOutNowMutation\(presenceIntent, \(\) => returnNativeUserOutNow/);
    expect(home).toMatch(/const actionEpoch = \+\+outNowActionEpochRef\.current/);
    expect(home).toMatch(/if \(!isCurrentAction\(\)\) return;/);
  });
});
