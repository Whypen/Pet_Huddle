// Shared "Reduce Motion" awareness for the RN Animated / LayoutAnimation paths
// (reanimated components use its own `useReducedMotion`). Exposes a live
// module-level getter for non-hook call sites (e.g. LayoutAnimation helpers)
// plus a hook for components. When the OS accessibility setting is on, callers
// should skip decorative motion and jump straight to the end state.

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

let reduceMotionActive = false;

AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => {
    reduceMotionActive = enabled;
  })
  .catch(() => {
    reduceMotionActive = false;
  });

AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  reduceMotionActive = enabled;
});

export function isReduceMotionActive(): boolean {
  return reduceMotionActive;
}

export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(reduceMotionActive);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setEnabled(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      if (mounted) setEnabled(value);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return enabled;
}
