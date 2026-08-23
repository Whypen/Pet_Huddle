import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { huddleColors, huddlePolaroid, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";

// Compact average-rating badge ("★ 4.9"). Render only when a rating exists
// (>= 1 review); callers gate on the summary being present.
type NativeRatingBadgeProps = {
  count?: number | null;
  rating: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function NativeRatingBadge({ count = null, rating, compact = false, style }: NativeRatingBadgeProps) {
  const highScore = rating > 4.5;
  const contentColor = highScore ? huddleColors.coral : huddleColors.onPrimary;
  return (
    <View style={[styles.badge, compact ? styles.badgeCompact : null, style]}>
      <View pointerEvents="none" style={styles.badgeBackground} />
      <FontAwesome color={contentColor} name="star" size={compact ? 9 : 11} />
      <Text style={[styles.value, compact ? styles.valueCompact : null, highScore ? styles.valueHighScore : null]}>{rating.toFixed(1)}</Text>
      {typeof count === "number" && count > 0 ? (
        <Text style={[styles.count, compact ? styles.countCompact : null, highScore ? styles.valueHighScore : null]}>({count})</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: huddlePolaroid.badge.size,
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  badgeBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
    opacity: 0.7,
  },
  badgeCompact: {
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  value: {
    fontFamily: "Urbanist-800",
    fontSize: 12,
    lineHeight: 15,
    color: huddleColors.onPrimary,
  },
  valueHighScore: {
    color: huddleColors.coral,
  },
  valueCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  count: {
    fontFamily: "Urbanist-700",
    fontSize: 11,
    lineHeight: 15,
    color: huddleColors.onPrimary,
  },
  countCompact: {
    fontSize: 9,
    lineHeight: 13,
  },
});
