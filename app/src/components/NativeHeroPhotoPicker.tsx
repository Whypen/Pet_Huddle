import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeProfilePhotoPresentationCrop } from "../lib/nativeProfilePhotos";
import { NativeProfileAvatar } from "./NativeProfileAvatar";
import {
  huddleColors,
  huddleFieldStates,
  huddleGlassControls,
  huddleLayout,
  huddleProfilePhotoSlots,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

type NativeHeroPhotoPickerProps = {
  aspectRatio?: number;
  uri?: string | null;
  /** Cache-bust token that advances when the image changes. */
  version?: string | null;
  onPick: () => void;
  onEdit?: () => void;
  onRemove: () => void;
  badgeLabel: string;
  emptyTitle: string;
  emptyHelper: string;
  error?: boolean;
  presentationCrop?: NativeProfilePhotoPresentationCrop | null;
};

/**
 * The hero photo card used for the main profile photo on signup step 5 and the
 * banner-first pet photo in set/edit-pet. The aspect defaults to profile 4:5;
 * callers can supply their canonical display ratio without changing avatar crops:
 * empty-state gradient + prompt, top badge, replace/remove controls, and a tappable
 * card that opens the picker. The actual cropper is owned by the parent screen.
 */
export function NativeHeroPhotoPicker({
  aspectRatio = 4 / 5,
  uri,
  version,
  onPick,
  onEdit,
  onRemove,
  badgeLabel,
  emptyTitle,
  emptyHelper,
  error = false,
  presentationCrop,
}: NativeHeroPhotoPickerProps) {
  const hasPhoto = Boolean(uri);
  return (
    <Pressable
      accessibilityLabel={hasPhoto ? `Edit ${badgeLabel.toLowerCase()}` : `Add ${badgeLabel.toLowerCase()}`}
      accessibilityRole="button"
      onPress={hasPhoto ? (onEdit ?? onPick) : onPick}
      style={({ pressed }) => [styles.card, { aspectRatio }, !hasPhoto ? styles.emptyCard : null, error ? styles.errorCard : null, pressed ? styles.pressed : null]}
    >
      {!hasPhoto ? (
        <LinearGradient
          colors={[huddleColors.photoSlotEmptyStart, huddleColors.photoSlotEmptyEnd]}
          pointerEvents="none"
          style={styles.emptyGradient}
        />
      ) : null}
      <View style={styles.badge}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.badgeText}>{badgeLabel}</Text>
      </View>
      {hasPhoto ? (
        <NativeProfileAvatar
          presentationCrop={presentationCrop}
          size={huddleProfilePhotoSlots.slotWidth}
          uri={uri}
          version={version || uri}
        />
      ) : (
        <View style={styles.emptyInner}>
          <View style={styles.emptyIcon}>
            <Feather color={huddleColors.blue} name="image" size={24} />
          </View>
          <Text ellipsizeMode="tail" numberOfLines={2} style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text ellipsizeMode="tail" numberOfLines={2} style={styles.emptyHelper}>{emptyHelper}</Text>
        </View>
      )}
      {hasPhoto ? (
        <Pressable
          accessibilityLabel={`Replace ${badgeLabel.toLowerCase()}`}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onPick();
          }}
          style={({ pressed }) => [styles.replaceButton, pressed ? styles.pressed : null]}
        >
          <Feather color={huddleColors.text} name="image" size={17} />
        </Pressable>
      ) : null}
      {hasPhoto ? (
        <Pressable
          accessibilityLabel={`Remove ${badgeLabel.toLowerCase()}`}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={({ pressed }) => [styles.removeButton, pressed ? styles.pressed : null]}
        >
          <Feather color={huddleColors.text} name="x" size={17} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: huddleProfilePhotoSlots.slotWidth,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.mutedCanvas,
    ...huddleShadows.glassElevation1,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.photoSlotEmptyStart,
  },
  errorCard: {
    ...huddleFieldStates.error,
  },
  emptyGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  badge: {
    position: "absolute",
    top: huddleSpacing.x3,
    alignSelf: "center",
    zIndex: 2,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.glassChrome,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  badgeText: {
    fontFamily: "Urbanist-800",
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.76,
    textTransform: "uppercase",
    color: huddleColors.text,
  },
  emptyInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
  },
  emptyIcon: {
    ...huddleGlassControls.surface,
    width: huddleProfilePhotoSlots.emptyIconSize,
    height: huddleProfilePhotoSlots.emptyIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    marginBottom: huddleSpacing.x3,
  },
  emptyTitle: {
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  emptyHelper: {
    marginTop: huddleSpacing.x1,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.subtext,
  },
  replaceButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    left: huddleSpacing.x3,
    zIndex: 2,
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.photoControl,
  },
  removeButton: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    zIndex: 3,
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.photoControl,
  },
  pressed: {
    opacity: 0.78,
  },
});
