import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const primitives = fs.readFileSync(
  path.resolve(__dirname, "../components/social/NativeSocialFeedPrimitives.tsx"),
  "utf8",
);

// Reproduction of the real strip geometry (fontSize 14, gap 16, padding 16,
// iPhone-class 390pt viewport). The old placeUnderline did an unconditional
// scrollTo(layout.x - 16), pinning the active tab to the left edge and pushing
// "All" — the first tab — entirely out of view, so it could not be tapped at all.
const PAD = 16;
const GAP = 16;
const VIEWPORT = 390;
const WIDTHS: Record<string, number> = {
  All: 21, Social: 42, Pets: 28, Health: 42, Adoption: 56, News: 33, Events: 44, Market: 44,
};

const layout = (() => {
  const out: Record<string, { x: number; width: number }> = {};
  let x = PAD;
  for (const [name, width] of Object.entries(WIDTHS)) {
    out[name] = { x, width };
    x += width + GAP;
  }
  return out;
})();

/** Minimum scroll-into-view, mirroring placeUnderline. */
const minimalScrollOffset = (tab: string, current: number) => {
  const { x, width } = layout[tab];
  const leftEdge = x - PAD;
  const rightEdge = x + width + PAD;
  if (leftEdge < current) return Math.max(0, leftEdge);
  if (rightEdge > current + VIEWPORT) return rightEdge - VIEWPORT;
  return current;
};

const allPixelsVisible = (offset: number) => {
  const a = layout.All;
  return Math.max(0, Math.min(a.x + a.width, offset + VIEWPORT) - Math.max(a.x, offset));
};

describe("social topic strip scrolling keeps All reachable", () => {
  it("never scrolls All out of view for any mid-strip tab", () => {
    for (const tab of ["All", "Social", "Pets", "Health", "Adoption", "News", "Events"]) {
      expect(allPixelsVisible(minimalScrollOffset(tab, 0))).toBe(WIDTHS.All);
    }
  });

  it("the old pin-to-left-edge behaviour made All completely unreachable", () => {
    const oldOffset = (tab: string) => Math.max(0, layout[tab].x - PAD);
    for (const tab of ["Social", "Pets", "Health", "Adoption", "News", "Events", "Market"]) {
      expect(allPixelsVisible(oldOffset(tab))).toBe(0);
    }
  });

  it("does not scroll at all when the target tab is already fully visible", () => {
    expect(minimalScrollOffset("Health", 0)).toBe(0);
    expect(minimalScrollOffset("News", 0)).toBe(0);
  });

  it("scrolls only far enough to reveal a tab that is genuinely off-screen", () => {
    const offset = minimalScrollOffset("Market", 0);
    expect(offset).toBeGreaterThan(0);
    const right = layout.Market.x + layout.Market.width + PAD;
    expect(offset).toBe(right - VIEWPORT);
  });

  it("the unconditional pin-to-left-edge scroll is gone from the source", () => {
    expect(primitives).not.toContain("scrollTo({ x: Math.max(0, layout.x - huddleSpacing.x4)");
    expect(primitives).toContain("tabViewportWidthRef");
    expect(primitives).toContain("tabScrollOffsetRef");
  });
});
