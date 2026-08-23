import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const detail = readFileSync(resolve(appRoot, "src/components/map/NativeAlertDetailModal.tsx"), "utf8");

/**
 * A bottom sheet is built as:
 *   <Pressable onPress={close}>            // backdrop
 *     <Pressable onPress={stopPropagation}> // card boundary
 *
 * The inner boundary must hug the card. If it stretches (flex: 1) it covers the whole
 * backdrop, so every tap in the empty space above the sheet lands on stopPropagation
 * instead of the close handler. That reads as "tap outside does nothing", and for a
 * deep-linked alert -- where the card is small because the shell has no title/body --
 * it turns the screen into an undismissable touch trap over the map.
 *
 * The working reference is AppDestructiveSlideConfirm, whose boundary
 * (appConfirmBoundary) is width-only.
 */
describe("native alert detail backdrop dismiss", () => {
  const boundaryBlock = (() => {
    const start = detail.indexOf("  bottomSheetBoundary: {");
    expect(start, "bottomSheetBoundary style not found").toBeGreaterThan(-1);
    return detail.slice(start, detail.indexOf("},", start));
  })();

  it("keeps the card boundary from stretching over the backdrop", () => {
    expect(boundaryBlock).not.toMatch(/flex:\s*1/);
  });

  it("still stops card taps from closing the sheet", () => {
    // The stopPropagation boundary itself must remain -- without it, tapping the card
    // body would dismiss the sheet.
    expect(detail).toContain("onPress={(event) => event.stopPropagation()}");
    expect(detail).toContain("style={[styles.bottomSheetBoundary,");
  });

  it("keeps the backdrop wired to close", () => {
    expect(detail).toMatch(/nativeModalStyles\.appModalBackdrop, nativeModalStyles\.appModalBottomSafeArea\][\s\S]{0,80}onPress=\{shareOpen \? closeSharePage : onClose\}/);
  });
});
