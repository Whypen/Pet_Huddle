// Left-edge swipe opener — a thin catcher pinned to the left edge of the content
// region that opens a drawer/panel on a rightward drag. Deliberately scoped:
//   • Only the leftmost `edgeWidth` px (a zone that's screen-edge padding anyway).
//   • Vertical drags fail (failOffsetY) so list scrolling still works.
//   • Caller positions it BELOW the header and ABOVE the bottom nav (top/bottom
//     props) so it never intercepts header or tab-bar taps.
//   • Caller renders it only on top-level tab routes (no modals/overlays open),
//     which avoids any clash with back-style navigation on detail screens.
//
// gesture-handler only (already wrapped by GestureHandlerRootView). runOnJS(true)
// keeps the commit callback on the JS thread, so no reanimated/worklet plumbing.

import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { haptic } from "../lib/nativeHaptics";

type NativeLeftEdgeSwipeProps = {
  onOpen: () => void;
  /** Distance from the top of the screen where the catcher starts. */
  top: number;
  /** Distance from the bottom where the catcher ends. */
  bottom: number;
  /** Width of the catcher's touch-down strip. Default 28 — roughly the iOS
   *  screen-edge gesture zone, so the swipe is reliably hittable. */
  edgeWidth?: number;
};

export function NativeLeftEdgeSwipe({ onOpen, top, bottom, edgeWidth = 28 }: NativeLeftEdgeSwipeProps) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX(12) // activate on a clear rightward drag
        .failOffsetY([-12, 12]) // yield to vertical scrolls/taps
        .onEnd((event) => {
          // Commit only on a decisive open (distance or velocity), like iOS drawers.
          if (event.translationX > 56 || event.velocityX > 650) {
            haptic.selectTab();
            onOpen();
          }
        }),
    [onOpen],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View pointerEvents="auto" style={[styles.edge, { top, bottom, width: edgeWidth }]} />
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: "absolute",
    left: 0,
    zIndex: 60,
  },
});
