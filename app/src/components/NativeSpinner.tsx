// Huddle loading spinner — "Three-dot pulse".
//
// Three dots in a row, each spring-pulsing scale + opacity with a phase offset.
// Premium execution: spring overshoot, synced opacity float, tight 130ms offset.
// Press interaction: dots accelerate (cycle 1.2s → 0.65s) while parent is pressed.
// Reduced motion: static dots at scale 1, opacity 0.6.
//
// Use this everywhere a raw <ActivityIndicator> sits today. No accompanying
// text — the spinner alone communicates the wait.

import { useEffect } from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { huddleColors } from "../theme/huddleDesignTokens";

type NativeSpinnerTone = "primary" | "accent" | "secondary" | "muted";
type NativeSpinnerSize = "xs" | "sm" | "md" | "lg";

const DOT_SIZE: Record<NativeSpinnerSize, number> = { xs: 3, sm: 4, md: 6, lg: 8 };

const TONE_COLOR: Record<NativeSpinnerTone, string> = {
  primary: huddleColors.onPrimary,
  accent: huddleColors.blue,
  secondary: huddleColors.text,
  muted: huddleColors.iconMuted,
};

const TONE_OPACITY: Record<NativeSpinnerTone, { min: number; max: number }> = {
  primary: { min: 0.4, max: 1.0 },
  accent: { min: 0.4, max: 1.0 },
  secondary: { min: 0.4, max: 1.0 },
  muted: { min: 0.3, max: 0.85 },
};

type NativeSpinnerProps = {
  tone?: NativeSpinnerTone;
  size?: NativeSpinnerSize;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
};

function useDot(
  index: number,
  pressed: boolean,
  reduceMotion: boolean,
  opacityRange: { min: number; max: number },
) {
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(opacityRange.min);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = 1;
      opacity.value = 0.6;
      return;
    }
    const cycleMs = pressed ? 650 : 1200;
    const phaseMs = pressed ? 70 : 130;
    const restMs = pressed ? 80 : 200;
    const upMs = cycleMs * 0.42;
    const downMs = cycleMs * 0.42;
    const delay = index * phaseMs;

    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = 0.85;
    opacity.value = opacityRange.min;

    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withSpring(1.15, { damping: 12, stiffness: 200, mass: 0.5 }),
          withSpring(0.85, { damping: 14, stiffness: 180, mass: 0.5 }),
          withDelay(restMs, withTiming(0.85, { duration: 0 })),
        ),
        -1,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(opacityRange.max, { duration: upMs }),
          withTiming(opacityRange.min, { duration: downMs }),
          withDelay(restMs, withTiming(opacityRange.min, { duration: 0 })),
        ),
        -1,
      ),
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [pressed, reduceMotion, opacityRange.min, opacityRange.max, scale, opacity, index]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
}

export function NativeSpinner({
  tone = "accent",
  size = "sm",
  pressed = false,
  style,
}: NativeSpinnerProps) {
  const reduceMotion = useReducedMotion();
  const dotSize = DOT_SIZE[size];
  const gap = dotSize * 1.5;
  const color = TONE_COLOR[tone];
  const opacityRange = TONE_OPACITY[tone];

  const dot0 = useDot(0, pressed, reduceMotion, opacityRange);
  const dot1 = useDot(1, pressed, reduceMotion, opacityRange);
  const dot2 = useDot(2, pressed, reduceMotion, opacityRange);

  const dotBase = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: color,
  };

  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap },
        style,
      ]}
    >
      <Animated.View style={[dotBase, dot0]} />
      <Animated.View style={[dotBase, dot1]} />
      <Animated.View style={[dotBase, dot2]} />
    </View>
  );
}

export type { NativeSpinnerTone, NativeSpinnerSize };
