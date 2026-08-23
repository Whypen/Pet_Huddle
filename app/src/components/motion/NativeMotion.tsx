import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from "react-native";
import { isReduceMotionActive } from "../../lib/nativeReduceMotion";
import { haptic, type HapticIntent } from "../../lib/nativeHaptics";
import { huddleMotion } from "../../theme/huddleDesignTokens";

// Shared motion primitives so every interactive surface speaks the same body
// language — press shrinks, errors shake, arrivals fade in — without each
// screen re-inventing an Animated.Value. All motion is reduce-motion-guarded.

// ── NativePressable ─────────────────────────────────────────────────────────
// Drop-in Pressable that springs down on press (the universal "button" feel),
// optionally fires a haptic, and can shake when `errorSignal` changes. Adopt it
// anywhere a plain Pressable is a button; everything else stays identical.
type NativePressableProps = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
  style?: PressableProps["style"];
  /** Scale reached while pressed (default 0.96). */
  pressScale?: number;
  /** Haptic intent fired on press-in. Omit for silent controls. */
  hapticIntent?: HapticIntent;
  /** Change this value (e.g. an incrementing counter) to trigger an error shake. */
  errorSignal?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function NativePressable({ children, style, pressScale = 0.96, hapticIntent, errorSignal, onPressIn, onPressOut, disabled, ...rest }: NativePressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const reduce = isReduceMotionActive();

  const spring = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  useEffect(() => {
    if (errorSignal === undefined || errorSignal === 0) return;
    haptic.error();
    if (reduce) return;
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -8, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 7, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorSignal]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { if (!reduce && !disabled) spring(pressScale); if (hapticIntent && !disabled) haptic[hapticIntent](); onPressIn?.(e); }}
      onPressOut={(e) => { if (!reduce) spring(1); onPressOut?.(e); }}
      style={(state) => {
        const resolvedStyle = typeof style === "function" ? style(state) : style;
        const flattenedTransform = StyleSheet.flatten(resolvedStyle)?.transform;
        const existingTransform = Array.isArray(flattenedTransform) ? flattenedTransform : [];
        return [resolvedStyle, { transform: [...existingTransform, { scale }, { translateX: shakeX }] }] as unknown as StyleProp<ViewStyle>;
      }}
    >
      {(state) => typeof children === "function" ? children(state) : children}
    </AnimatedPressable>
  );
}

// ── NativeFadeIn ────────────────────────────────────────────────────────────
// Fades + lifts children in on mount and whenever `trigger` changes — the
// arrival motion for pages and tab-pane switches. `trigger` is any value that
// changes when the content should re-animate (e.g. the active route/tab key).
export function NativeFadeIn({ children, trigger, style, distance = 8, duration = huddleMotion.durations.enter }: {
  children: ReactNode;
  trigger?: string | number;
  style?: StyleProp<ViewStyle>;
  distance?: number;
  duration?: number;
}) {
  const progress = useRef(new Animated.Value(isReduceMotionActive() ? 1 : 0)).current;
  useEffect(() => {
    if (isReduceMotionActive()) { progress.setValue(1); return; }
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trigger, duration, progress]);
  return (
    <Animated.View
      style={[
        { flex: 1 },
        style,
        { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
