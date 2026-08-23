import { useEffect, useRef, useState } from "react";

// Backstop for the whole app: no screen's loading state may stay true forever.
//
// Layer 1 (nativeTimeout.ts) bounds each network primitive, but that only holds
// as long as every future call site remembers to use it. This hook is the
// layer that does not depend on anyone remembering: it watches a loading flag
// and trips if it is still true past a deadline, so an un-bounded call added
// later degrades to a retryable error state instead of an infinite spinner.
//
// Same shape as the boot gate in RootNavigator.tsx, which force-releases the
// brand hold via releaseBootGate("deadline") after BOOT_SURFACE_PREWARM_MAX_MS.

// Generous on purpose: real requests on a bad connection should still win.
// This fires only when something is genuinely stuck, never as normal timing.
export const NATIVE_LOADING_DEADLINE_MS = 8000;

export const useNativeLoadingDeadline = (
  loading: boolean,
  options: { maxMs?: number; onTrip?: () => void } = {},
): boolean => {
  const { maxMs = NATIVE_LOADING_DEADLINE_MS, onTrip } = options;
  const [tripped, setTripped] = useState(false);
  const onTripRef = useRef(onTrip);
  onTripRef.current = onTrip;

  useEffect(() => {
    if (!loading) {
      setTripped(false);
      return;
    }
    const timer = setTimeout(() => {
      setTripped(true);
      onTripRef.current?.();
    }, maxMs);
    return () => clearTimeout(timer);
  }, [loading, maxMs]);

  return tripped;
};
