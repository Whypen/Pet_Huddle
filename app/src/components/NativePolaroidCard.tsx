import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import {
  huddleColors,
  huddlePolaroid,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
} from "../theme/huddleDesignTokens";

export type NativePolaroidBadge = {
  color: string;
  name: keyof typeof Feather.glyphMap;
  style?: StyleProp<ViewStyle>;
};

type NativePolaroidCardProps = {
  accessibilityLabel?: string;
  badges?: NativePolaroidBadge[];
  captionPrimary: string;
  captionSecondary?: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  photo: ReactNode;
  photoOverlay?: ReactNode;
  variant?: "feed" | "detail";
};

export function NativePolaroidCard({
  accessibilityLabel,
  badges = [],
  captionPrimary,
  captionSecondary,
  disabled = false,
  onPress,
  photo,
  photoOverlay,
  variant = "feed",
}: NativePolaroidCardProps) {
  const interactive = Boolean(onPress);
  const detail = variant === "detail";

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={interactive ? "button" : undefined}
      disabled={disabled || !interactive}
      onPress={onPress}
      style={({ pressed }) => [styles.outer, pressed && interactive && !disabled ? styles.pressed : null, disabled ? styles.disabled : null]}
    >
      <View style={styles.polaroid}>
        <View style={[styles.photoSlot, detail ? styles.photoSlotDetail : null]}>
          {photo}
          {disabled ? <View pointerEvents="none" style={styles.disabledPhotoOverlay} /> : null}
          <View pointerEvents="none" style={styles.photoInset} />
          {photoOverlay}
        </View>

        {badges.length > 0 ? (
          <View pointerEvents="none" style={[styles.badgeStack, detail ? styles.badgeStackDetail : null]}>
            {badges.map((badge) => (
              <View key={`${badge.name}:${badge.color}`} style={[styles.badgePuck, detail ? styles.badgePuckDetail : null, badge.style]}>
                <Feather color={badge.color} name={badge.name} size={16} />
              </View>
            ))}
          </View>
        ) : null}

        <View style={[styles.caption, detail ? styles.captionDetail : null]}>
          <Text numberOfLines={1} style={[styles.captionName, detail ? styles.captionNameDetail : null]}>{captionPrimary}</Text>
          {captionSecondary}
        </View>
      </View>
    </Pressable>
  );
}

export const nativePolaroidStyles = StyleSheet.create({
  photo: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  badgePrimary: {
    backgroundColor: huddleColors.blue,
  },
  badgeSuccess: {
    backgroundColor: huddleColors.success,
  },
  badgeEmergency: {
    backgroundColor: huddleColors.validationRed,
  },
  captionSecondaryWrap: {
    width: "100%",
    minHeight: 34,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  captionSecondaryToken: {
    fontFamily: "Urbanist-500",
    fontSize: huddlePolaroid.caption.serviceSize,
    lineHeight: huddlePolaroid.caption.serviceLine,
    color: huddleColors.text,
  },
  captionSecondaryWrapDetail: {
    width: "100%",
    minHeight: 34,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  captionSecondaryTokenDetail: {
    fontFamily: "Urbanist-500",
    fontSize: huddlePolaroid.detail.serviceSize,
    lineHeight: huddlePolaroid.detail.serviceLine,
    color: huddleColors.text,
  },
});

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    shadowColor: huddlePolaroid.frame.shadowColor,
    shadowOpacity: huddlePolaroid.frame.shadowOpacity,
    shadowRadius: huddlePolaroid.frame.shadowRadius,
    shadowOffset: huddlePolaroid.frame.shadowOffset,
    elevation: huddlePolaroid.frame.elevation,
  },
  polaroid: {
    aspectRatio: huddlePolaroid.frame.aspectRatio,
    backgroundColor: huddlePolaroid.frame.backgroundColor,
    borderRadius: huddlePolaroid.frame.radius,
    overflow: "hidden",
  },
  photoSlot: {
    position: "absolute",
    top: huddlePolaroid.photo.top,
    left: huddlePolaroid.photo.left,
    right: huddlePolaroid.photo.right,
    bottom: huddlePolaroid.photo.bottom,
    overflow: "hidden",
    borderRadius: huddlePolaroid.photo.radius,
  },
  photoSlotDetail: {
    bottom: huddlePolaroid.detail.photoBottom,
  },
  photoInset: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
  },
  disabledPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  badgeStack: {
    position: "absolute",
    top: huddlePolaroid.badge.top,
    left: huddlePolaroid.badge.left,
    gap: huddleSpacing.x2,
  },
  badgeStackDetail: {
    top: huddlePolaroid.detail.badgeTop,
    left: huddlePolaroid.detail.badgeLeft,
  },
  badgePuck: {
    width: huddlePolaroid.badge.size,
    height: huddlePolaroid.badge.size,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.polaroidBadge,
  },
  badgePuckDetail: {
    width: huddlePolaroid.detail.badgeSize,
    height: huddlePolaroid.detail.badgeSize,
  },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    top: huddlePolaroid.caption.top,
    bottom: 0,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingHorizontal: huddleSpacing.x3,
    paddingTop: 10,
    paddingBottom: huddleSpacing.x3,
  },
  captionDetail: {
    top: huddlePolaroid.detail.captionTop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: 0,
    paddingBottom: 0,
    gap: huddleSpacing.x1,
  },
  captionName: {
    width: "100%",
    textAlign: "left",
    fontFamily: "Georgia",
    fontStyle: "italic",
    fontWeight: "700",
    fontSize: huddlePolaroid.caption.nameSize,
    lineHeight: huddlePolaroid.caption.nameLine,
    color: huddleColors.text,
  },
  captionNameDetail: {
    textAlign: "center",
    fontSize: huddlePolaroid.detail.nameSize,
    lineHeight: huddlePolaroid.detail.nameLine,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.98,
  },
});
