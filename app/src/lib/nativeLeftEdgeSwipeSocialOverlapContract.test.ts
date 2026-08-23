import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = fs.readFileSync(
  path.resolve(__dirname, "../navigation/RootNavigator.tsx"),
  "utf8",
);

// Root cause (2026-08-19): NativeLeftEdgeSwipe (opens the notifications panel on a
// left-edge swipe) is rendered on every top-level tab route with a `top` that only
// clears the GLOBAL header. Social renders its own filter bar (search + topic tabs)
// below that header, inside the screen content, so the catcher physically overlapped
// Social's topic tab row — specifically "All", which sits at the screen's left edge
// (x 16-45) inside the catcher's 28px-wide zone (x 0-28), with a higher zIndex and
// its own gesture-handler Pan recognizer that operates outside RN's core touch
// responder system. That is why "All" intermittently failed to respond while every
// other topic tab (further right, outside the catcher's zone) worked every time, and
// why neither a ScrollView-cancellation prop nor onPress/onTouchStart instrumentation
// on the Pressable itself ever showed the drop — the touch was won by a different
// gesture system before RN's Pressable saw it at all.
describe("left-edge notification swipe catcher clears Social's own filter bar", () => {
  it("adds Social's filter bar height only for the /social route", () => {
    const usage = root.slice(
      root.indexOf("<NativeLeftEdgeSwipe"),
      root.indexOf("/>", root.indexOf("<NativeLeftEdgeSwipe")),
    );
    expect(usage).toContain('effectiveRoute === "/social"');
    expect(usage).toContain("huddleSocial.filterBarHeight");
  });
});
