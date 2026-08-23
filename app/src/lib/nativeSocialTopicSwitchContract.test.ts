import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const screen = fs.readFileSync(
  path.resolve(__dirname, "../screens/NativeSocialScreen.tsx"),
  "utf8",
);

// Topic switching must stay a pure client-side filter with instant tap handling.
// These three properties were each a real, user-reported failure:
//   1. Comparing against selectedTags dropped any tap made during the ~110ms
//      transition — tapping a topic then "All" left you on the topic.
//   2. stopAnimation() still fires the interrupted callback, so a superseded
//      transition committed the category the user had already moved away from.
//   3. Coupling a network load to the tap made the tab feel unresponsive.
describe("social topic switch contract", () => {
  it("resolves the current topic from the synchronous intent ref, not lagging state", () => {
    const selectCategory = screen.slice(
      screen.indexOf("const selectCategory = useCallback"),
      screen.indexOf("const goToAdjacentCategory = useCallback"),
    );
    expect(selectCategory).toContain("categoryTargetRef.current");
    expect(selectCategory).toMatch(/const currentCategory = categoryTargetRef\.current;/);
    // The stale comparison must not come back.
    expect(selectCategory).not.toMatch(/const currentCategory = selectedTags\./);
  });

  it("guards the transition swap so a superseded animation cannot commit its category", () => {
    const runFeedTransition = screen.slice(
      screen.indexOf("const runFeedTransition = useCallback"),
      screen.indexOf("const selectCategory = useCallback"),
    );
    expect(runFeedTransition).toContain("feedTransitionGenerationRef.current !== generation");
  });

  it("attaches no feed network load to a topic tap", () => {
    const selectCategory = screen.slice(
      screen.indexOf("const selectCategory = useCallback"),
      screen.indexOf("const goToAdjacentCategory = useCallback"),
    );
    expect(selectCategory).not.toMatch(/load\(["'](?:revalidate|reset|refresh|more|coverage)["']\)/);
  });
});
