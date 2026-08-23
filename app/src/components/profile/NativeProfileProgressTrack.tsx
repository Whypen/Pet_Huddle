// Slim, label-less profile completion bar. A faint full-width track with a
// brand-blue fill that eases to the new value as sections complete. Shared by
// the profile / set-pet / carer forms; sits at the top of the scroll content.

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { huddleColors, huddleRadii } from "../../theme/huddleDesignTokens";

export function NativeProfileProgressTrack({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const value = useSharedValue(clamped);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    value.value = reduceMotion ? clamped : withTiming(clamped, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [clamped, reduceMotion, value]);

  // Fill eases to green as the form nears completion — a clear "done" signal at 100%.
  const fillStyle = useAnimatedStyle(() => ({
    width: `${value.value * 100}%`,
    backgroundColor: interpolateColor(value.value, [0.9, 1], [huddleColors.blue, huddleColors.success]),
  }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.sectionDividerStrong,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: huddleRadii.pill,
  },
});
