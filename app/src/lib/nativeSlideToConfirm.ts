export const SLIDE_TO_CONFIRM_COMMIT_RATIO = 0.92;

export function shouldCommitNativeSlide(translateX: number, maxTranslate: number): boolean {
  "worklet";
  if (!Number.isFinite(translateX) || !Number.isFinite(maxTranslate) || maxTranslate <= 0) return false;
  return translateX >= maxTranslate * SLIDE_TO_CONFIRM_COMMIT_RATIO;
}

export function canInvokeNativeSlideCommit(input: {
  alreadyCommitted: boolean;
  busy: boolean;
  disabled: boolean;
}): boolean {
  return !input.alreadyCommitted && !input.busy && !input.disabled;
}
