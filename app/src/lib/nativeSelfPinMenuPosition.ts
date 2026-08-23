import { huddleLayout, huddleSpacing } from "../theme/huddleDesignTokens";

export const NATIVE_SELF_PIN_MENU_WIDTH = huddleLayout.minTouch * 5 + huddleSpacing.x6;
export const NATIVE_SELF_PIN_MENU_HEIGHT = huddleLayout.minTouch * 6 + huddleSpacing.x6;
export const NATIVE_SELF_PIN_MENU_POINTER_SIZE = huddleSpacing.x4;

export type NativeSelfPinMenuPlacement = {
  left: number;
  pointerHorizontal: "left" | "right";
  pointerVertical: "bottom" | "top";
  top: number;
};

export function clampAnchoredSelfPinMenuPosition(
  anchor: { left: number; top: number },
  viewport: { width: number; height: number },
  insets: { top: number; bottom: number },
) {
  const margin = huddleSpacing.x3;
  const minTop = insets.top + margin;
  const maxTop = Math.max(minTop, viewport.height - insets.bottom - NATIVE_SELF_PIN_MENU_HEIGHT - margin);
  const minLeft = margin;
  const maxLeft = Math.max(minLeft, viewport.width - NATIVE_SELF_PIN_MENU_WIDTH - margin);
  return {
    left: Math.max(minLeft, Math.min(maxLeft, anchor.left)),
    top: Math.max(minTop, Math.min(maxTop, anchor.top)),
  };
}

export function resolveAnchoredSelfPinMenuPosition(
  point: { x: number; y: number },
  targetHalfSize: number,
  viewport: { width: number; height: number },
  insets: { top: number; bottom: number },
): NativeSelfPinMenuPlacement {
  const gap = huddleSpacing.x2;
  const margin = huddleSpacing.x3;
  const rightSpace = viewport.width - margin - (point.x + targetHalfSize + gap);
  const leftSpace = point.x - targetHalfSize - gap - margin;
  const bottomSpace = viewport.height - insets.bottom - margin - (point.y + targetHalfSize + gap);
  const topSpace = point.y - targetHalfSize - gap - (insets.top + margin);
  const openRight = rightSpace >= NATIVE_SELF_PIN_MENU_WIDTH || rightSpace >= leftSpace;
  const openBelow = bottomSpace >= NATIVE_SELF_PIN_MENU_HEIGHT || bottomSpace >= topSpace;
  const clamped = clampAnchoredSelfPinMenuPosition({
    left: openRight
      ? point.x + targetHalfSize + gap
      : point.x - targetHalfSize - gap - NATIVE_SELF_PIN_MENU_WIDTH,
    top: openBelow
      ? point.y + targetHalfSize + gap
      : point.y - targetHalfSize - gap - NATIVE_SELF_PIN_MENU_HEIGHT,
  }, viewport, insets);
  return {
    ...clamped,
    pointerHorizontal: openRight ? "left" : "right",
    pointerVertical: openBelow ? "top" : "bottom",
  };
}
