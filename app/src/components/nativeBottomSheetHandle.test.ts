import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(dir, path), "utf8");
const primitive = () => read("./nativeModalPrimitives.tsx");
const styles = () => read("./nativeModalPrimitives.styles.ts");

describe("bottom sheet grab handle", () => {
  it("lives in the shared primitive so every bottom sheet gets the same cue", () => {
    const text = primitive();
    expect(text).toContain("nativeModalStyles.appBottomSheetHandleArea");
    expect(text).toContain("nativeModalStyles.appBottomSheetHandle");
  });

  it("only appears when swiping can actually dismiss the sheet", () => {
    // A handle on a sheet that cannot be dragged would promise a gesture that
    // does nothing.
    expect(primitive()).toMatch(/\{canSwipeToClose \? \([\s\S]*?appBottomSheetHandleArea/);
  });

  it("drags too when only the header owns the gesture", () => {
    expect(primitive()).toMatch(/\{\.\.\.\(swipeToCloseArea === "header" \? panHandlers : \{\}\)\}\s*style=\{nativeModalStyles\.appBottomSheetHandleArea\}/);
  });

  it("is a small neutral pill, not a decorative bar", () => {
    const text = styles();
    expect(text).toMatch(/appBottomSheetHandle: \{[^}]*height: 4/s);
    expect(text).toMatch(/appBottomSheetHandle: \{[^}]*width: 36/s);
    expect(text).toMatch(/appBottomSheetHandle: \{[^}]*borderRadius: huddleRadii\.pill/s);
  });

  it("does not disturb the header swipe wiring that follows it", () => {
    // The handle renders outside Children.map, so index 0 still means the header.
    expect(primitive()).toMatch(/appBottomSheetHandleArea[\s\S]*\{swipeToCloseArea === "header"\s*\? Children\.map\(children, \(child, index\) => index === 0/);
  });
});
