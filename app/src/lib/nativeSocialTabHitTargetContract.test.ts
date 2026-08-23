import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const primitives = fs.readFileSync(
  path.resolve(__dirname, "../components/social/NativeSocialFeedPrimitives.tsx"),
  "utf8",
);

// "All" is the shortest label in the topic strip. tabButton carries no horizontal
// padding, so each tab's touch box is exactly its text width — measured, that made
// "All" ~21pt wide against a 44pt platform minimum, and it was the only tab users
// reported as unresponsive. hitSlop is the fix that costs no layout change.
describe("social topic tab hit target", () => {
  it("applies hitSlop to every topic tab", () => {
    expect(primitives).toContain("hitSlop={NATIVE_SOCIAL_TAB_HIT_SLOP}");
  });

  it("keeps horizontal slop at half the inter-tab gap so neighbours never overlap", () => {
    const gapMatch = primitives.match(/tabRow:\s*\{[^}]*gap:\s*huddleSpacing\.(x\d)/);
    expect(gapMatch?.[1]).toBe("x4"); // 16pt
    const slopMatch = primitives.match(
      /NATIVE_SOCIAL_TAB_HIT_SLOP = \{ bottom: (\d+), left: (\d+), right: (\d+), top: (\d+) \}/,
    );
    expect(slopMatch).not.toBeNull();
    const [, bottom, left, right, top] = slopMatch!.map(Number);
    // 8 + 8 === the 16pt gap: adjacent targets meet exactly, no overlap, no dead zone.
    expect(left + right).toBe(16);
    expect(left).toBe(right);
    // 32pt row + 6 + 6 === 44pt minimum touch height.
    expect(32 + top + bottom).toBe(44);
  });

  it("still has no horizontal padding on tabButton, so hitSlop is what carries the target", () => {
    const tabButton = primitives.slice(
      primitives.indexOf("  tabButton: {"),
      primitives.indexOf("  topicTabFrame: {"),
    );
    expect(tabButton).not.toContain("paddingHorizontal");
  });
});
