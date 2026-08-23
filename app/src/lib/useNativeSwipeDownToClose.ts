// Header-only swipe-down-to-close for modals, built on react-native-gesture-handler
// + reanimated (NOT PanResponder — that's unreliable inside an RN Modal on the New
// Architecture). Wrap ONLY the header/grab-handle in a <GestureDetector gesture={gesture}>
// so list scrolling never closes the sheet; apply `cardStyle` to the card and
// `backdropStyle` to the dim layer. The modal's content must sit inside a
// <GestureHandlerRootView> for gestures to fire inside the Modal.

import { useEffect, useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

const SPRING = { damping: 24, stiffness: 280, mass: 0.6 } as const;

export function useNativeSwipeDownToClose({
  open,
  onClose,
  closeDistance = 100,
  closeVelocity = 900,
}: {
  open: boolean;
  onClose: () => void;
  closeDistance?: number;
  closeVelocity?: number;
}) {
  const translateY = useSharedValue(0);

  // Reset whenever the modal (re)opens — it stays mounted between opens.
  useEffect(() => {
    if (open) translateY.value = 0;
  }, [open, translateY]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(10) // engage only on a downward drag
        .failOffsetX([-20, 20]) // let horizontal swipes through
        .onUpdate((event) => {
          "worklet";
          const dy = Math.max(0, event.translationY);
          // Rubber-band past a soft limit so a fling doesn't overshoot unnaturally.
          const SOFT_LIMIT = 220;
          translateY.value = dy <= SOFT_LIMIT ? dy : SOFT_LIMIT + (dy - SOFT_LIMIT) * 0.35;
        })
        .onEnd((event) => {
          "worklet";
          if (event.translationY > closeDistance || event.velocityY > closeVelocity) {
            runOnJS(onClose)();
          } else {
            translateY.value = withSpring(0, SPRING);
          }
        }),
    [closeDistance, closeVelocity, onClose, translateY],
  );

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, 260], [1, 0.4], Extrapolation.CLAMP),
  }));

  return { gesture, cardStyle, backdropStyle };
}
