// Shared animation configs for /app native screens.
// Every Reanimated spring/timing call references one of the configs below.
// Do not introduce per-screen spring constants. If a new config is needed,
// add it here, link it to a `huddleMotion` token where possible, and reuse it.

import { useCallback, useRef } from "react";
import { Animated } from "react-native";
import { huddleMotion } from "../theme/huddleDesignTokens";

// Tab-pill style spring: snappy, no overshoot. Used by the bottom-nav active
// indicator and any peer "selector slides between options" animation.
export const springTab = {
  damping: 18,
  stiffness: 220,
  mass: 0.7,
} as const;

// Soft spring: card scale-in, hover lift. No overshoot.
export const springSoft = {
  damping: 20,
  stiffness: 160,
  mass: 0.8,
} as const;

// Standard timing config (pair with `huddleMotion.durations` + `huddleMotion.easings`).
export const timingBase = {
  duration: huddleMotion.durations.base,
} as const;

export const timingFast = {
  duration: huddleMotion.durations.fast,
} as const;

export const timingSlow = {
  duration: huddleMotion.durations.slow,
} as const;

// Shake hook — call triggerShake() on validation failure to give tactile button feedback.
// Wrap the target button in <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>.
export function useShakeAnimation() {
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);
  return [shakeAnim, triggerShake] as const;
}
