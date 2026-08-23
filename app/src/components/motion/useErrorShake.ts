import { useMemo, useRef } from "react";
import { Animated } from "react-native";
import { haptic, type HapticIntent } from "../../lib/nativeHaptics";
import { isReduceMotionActive } from "../../lib/nativeReduceMotion";

/** Shared validation shake with an optional, intent-preserving haptic. */
export function useErrorShake(hapticIntent: HapticIntent | null = "error") {
  const x = useRef(new Animated.Value(0)).current;
  const shake = useMemo(() => () => {
    if (hapticIntent) haptic[hapticIntent]();
    if (isReduceMotionActive()) return;
    x.setValue(0);
    Animated.sequence([
      Animated.timing(x, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(x, { toValue: 7, duration: 55, useNativeDriver: true }),
      Animated.timing(x, { toValue: -5, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [hapticIntent, x]);
  const shakeStyle = useMemo(() => ({ transform: [{ translateX: x }] }), [x]);
  return { shake, shakeStyle };
}
