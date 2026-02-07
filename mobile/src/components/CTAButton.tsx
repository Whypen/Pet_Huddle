import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { COLORS } from "../theme/tokens";

type Props = {
  title: string;
  disabled?: boolean;
  onPress?: () => void;
  onInvalidPress?: () => void;
};

export function CTAButton({ title, disabled, onPress, onInvalidPress }: Props) {
  const scale = useSharedValue(1);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (disabled) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );
  }, [disabled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shakeX.value }],
  }));

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(4, { duration: 50 }),
      withTiming(-4, { duration: 50 }),
      withTiming(4, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          if (disabled) {
            triggerShake();
            onInvalidPress?.();
            return;
          }
          onPress?.();
        }}
        style={{
          backgroundColor: disabled ? "rgba(33,69,207,0.35)" : COLORS.brandBlue,
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "700" }}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

