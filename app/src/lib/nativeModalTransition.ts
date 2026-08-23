import { useCallback, useEffect, useRef } from "react";

const NATIVE_MODAL_DISMISS_MS = 360;

// React Native can leave an invisible touch-blocking layer when one native Modal is
// closed and another is opened in the same render. Queue the next sheet until the
// dismissal animation has completed, and cancel it if the screen unmounts.
export function useNativeModalTransition() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return useCallback((closeCurrent: () => void, openNext: () => void) => {
    closeCurrent();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      openNext();
    }, NATIVE_MODAL_DISMISS_MS);
  }, []);
}
