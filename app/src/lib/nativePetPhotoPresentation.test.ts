import { describe, expect, it } from "vitest";
import { nativePetPresentationImageStyle } from "./nativePetPhotoPresentation";

describe("pet photo presentation crops", () => {
  const crop = { centerX: 50, centerY: 50, widthPct: 80 };

  it("uses the selected 5:4 frame for Home", () => {
    expect(nativePetPresentationImageStyle(crop, 5 / 4)).toMatchObject({
      width: "125%",
      height: "195.3125%",
    });
  });

  it("derives the maximum centered 4:5 crop for polaroids", () => {
    const style = nativePetPresentationImageStyle(crop, 4 / 5);
    expect(parseFloat(String(style.width))).toBeCloseTo(195.3125);
    expect(parseFloat(String(style.height))).toBeCloseTo(195.3125);
  });

  it("derives the maximum centered square crop for avatars", () => {
    const style = nativePetPresentationImageStyle(crop, 1);
    expect(style.width).toBe("156.25%");
    expect(style.height).toBe("195.3125%");
    expect(style.left).not.toBe(style.top);
  });
});
