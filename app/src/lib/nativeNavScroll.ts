import { useCallback, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { makeMutable, withTiming } from "react-native-reanimated";

// Shared minimize driver for the floating bottom nav.
// 0 = fully expanded, 1 = minimized (shrunk + receded). Read by NativeBottomNav,
// written by scrollable screens (Social, Care) so the nav recedes on scroll-down.
export const navMinimized = makeMutable(0);

export function setNavMinimized(minimized: boolean) {
  navMinimized.value = withTiming(minimized ? 1 : 0, { duration: minimized ? 180 : 220 });
}

const TOP_GUARD = 24; // always expanded within 24px of the top
const DIR_THRESHOLD = 4; // ignore tiny jitter

// Apply minimize from a raw offset + the caller's previous offset.
// Use this inside a screen that already owns an onScroll handler (e.g. Social).
export function applyNavMinimizeFromOffset(currentY: number, lastY: number) {
  const y = Math.max(0, currentY);
  const dir = y - lastY;
  if (y <= TOP_GUARD) setNavMinimized(false);
  else if (dir > DIR_THRESHOLD) setNavMinimized(true);
  else if (dir < -DIR_THRESHOLD) setNavMinimized(false);
}

// Drop-in onScroll handler for screens without an existing one (e.g. Care feed).
export function useNavMinimizeOnScroll() {
  const lastY = useRef(0);
  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, event.nativeEvent.contentOffset.y);
    applyNavMinimizeFromOffset(y, lastY.current);
    lastY.current = y;
  }, []);
}
