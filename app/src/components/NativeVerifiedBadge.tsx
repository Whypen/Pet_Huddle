import { Feather } from "@expo/vector-icons";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { huddleColors } from "../theme/huddleDesignTokens";

type NativeVerifiedBadgeProps = {
  isVerified?: boolean | null;
  verified?: boolean | null;
  compact?: boolean;
  scale?: number;
  size?: number;
  variant?: "avatar" | "default" | string;
  style?: ViewStyle;
};

export function NativeVerifiedBadge({
  isVerified,
  verified,
  compact = false,
  scale = 1,
  size,
  style,
}: NativeVerifiedBadgeProps) {
  const show = isVerified ?? verified ?? true;
  if (!show) return null;

  const baseSize = size ?? (compact ? 14 : 16);
  const badgeSize = Math.max(10, Math.round(baseSize * scale));

  return (
    <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }, style]}>
      <Feather color="#FFFFFF" name="check" size={Math.max(8, Math.round(badgeSize * 0.65))} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blue,
  },
});
