import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canInvokeNativeSlideCommit, shouldCommitNativeSlide, SLIDE_TO_CONFIRM_COMMIT_RATIO } from "./nativeSlideToConfirm";

const primitiveSource = readFileSync(resolve(__dirname, "../components/nativeModalPrimitives.tsx"), "utf8");

describe("native SlideToConfirm release invariants", () => {
  it("cannot commit before layout or with invalid geometry", () => {
    expect(shouldCommitNativeSlide(0, 0)).toBe(false);
    expect(shouldCommitNativeSlide(100, 0)).toBe(false);
    expect(shouldCommitNativeSlide(Number.NaN, 100)).toBe(false);
    expect(shouldCommitNativeSlide(100, Number.NaN)).toBe(false);
    expect(shouldCommitNativeSlide(Number.POSITIVE_INFINITY, 100)).toBe(false);
  });

  it("requires the complete 92 percent slide threshold", () => {
    const distance = 300;
    expect(shouldCommitNativeSlide(distance * (SLIDE_TO_CONFIRM_COMMIT_RATIO - 0.001), distance)).toBe(false);
    expect(shouldCommitNativeSlide(distance * SLIDE_TO_CONFIRM_COMMIT_RATIO, distance)).toBe(true);
    expect(shouldCommitNativeSlide(distance, distance)).toBe(true);
  });

  it("prevents duplicate, busy, and disabled commits", () => {
    expect(canInvokeNativeSlideCommit({ alreadyCommitted: false, busy: false, disabled: false })).toBe(true);
    expect(canInvokeNativeSlideCommit({ alreadyCommitted: true, busy: false, disabled: false })).toBe(false);
    expect(canInvokeNativeSlideCommit({ alreadyCommitted: false, busy: true, disabled: false })).toBe(false);
    expect(canInvokeNativeSlideCommit({ alreadyCommitted: false, busy: false, disabled: true })).toBe(false);
  });

  it("has no tap-to-submit path while enabled", () => {
    const enabledBranch = primitiveSource.slice(
      primitiveSource.indexOf("return (\n    <GestureDetector gesture={panGesture}>", primitiveSource.indexOf("export function SlideToConfirm")),
      primitiveSource.indexOf("const slideToConfirmStyles", primitiveSource.indexOf("export function SlideToConfirm")),
    );
    expect(enabledBranch).toContain("<GestureDetector gesture={panGesture}>");
    expect(enabledBranch).not.toContain("onPress=");
    expect(primitiveSource).toContain(".activeOffsetX([12, 9999])");
    expect(primitiveSource).toContain(".failOffsetY([-12, 12])");
  });
});
