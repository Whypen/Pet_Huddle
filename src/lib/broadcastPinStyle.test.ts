/**
 * Caution is the one alert type whose colour differs by surface, and the split
 * is easy to "tidy away" into a single value. It already was once.
 *
 * These tests read the NATIVE source, so they fail if either platform moves.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBroadcastPinStyle } from "./broadcastPinStyle";

const repoRoot = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

describe("broadcast pin colours", () => {
  it("keeps Caution neutral on the map, matching native's map token", () => {
    // huddleDesignTokens.ts: alertCaution: huddleColors.alertOther, and
    // alertOther is #A1A4A9.
    const tokens = read("app/src/theme/huddleDesignTokens.ts");
    expect(tokens).toMatch(/alertCaution:\s*huddleColors\.alertOther/);
    expect(tokens).toMatch(/alertOther:\s*"#A1A4A9"/);

    expect(getBroadcastPinStyle("Caution").markerColor).toBe("#A1A4A9");
  });

  it("keeps Caution blue in composer chrome, matching native's composer", () => {
    const nativeBroadcast = read("app/src/lib/nativeBroadcast.ts");
    expect(nativeBroadcast).toMatch(/if \(type === "Caution"\) return "#2145CF";/);

    expect(getBroadcastPinStyle("Caution").color).toBe("#2145CF");
  });

  it("does not collide with verified friend pins on the map", () => {
    // The whole reason native's comment says Caution is "intentionally neutral
    // so it does not read as friend presence".
    const friendOverlay = read("src/components/map/FriendMarkersOverlay.tsx");
    const friendVerifiedColor = friendOverlay.match(
      /friend\.isVerified \? "(#[0-9A-Fa-f]{6})"/,
    )?.[1];
    expect(friendVerifiedColor).toBe("#2145CF");

    expect(getBroadcastPinStyle("Caution").markerColor).not.toBe(friendVerifiedColor);
  });

  it("leaves every other type identical across both surfaces", () => {
    for (const type of ["Stray", "Lost", "Others"]) {
      const style = getBroadcastPinStyle(type);
      expect(style.markerColor).toBe(style.color);
    }
  });
});
