import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useEffect, useState } from "react";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import {
  huddleColors,
  huddleSpacing,
  huddleType,
} from "../../theme/huddleDesignTokens";

export type NativeProfilePhotoAlign = "full-bleed" | "inset-left" | "inset-right";
export type NativeProfilePhotoAspect = "4/5" | "3/2" | "1/1" | "1:1" | "4:5" | "16:9";

type NativeProfilePhotoPlateProps = {
  accessibilityLabel: string;
  align?: NativeProfilePhotoAlign;
  aspect: NativeProfilePhotoAspect;
  caption?: string | null;
  onPress?: (src: string) => void;
  src: string | null;
  version?: string | number | null;
};

const aspectRatioFor = (aspect: NativeProfilePhotoAspect) => {
  switch (aspect) {
    case "3/2":
      return 3 / 2;
    case "1/1":
    case "1:1":
      return 1;
    case "16:9":
      return 16 / 9;
    case "4/5":
    case "4:5":
    default:
      return 4 / 5;
  }
};

export function NativeProfilePhotoPlate({
  accessibilityLabel,
  align = "full-bleed",
  aspect,
  caption,
  onPress,
  src,
  version,
}: NativeProfilePhotoPlateProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src, version]);

  if (!src) return null;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="imagebutton"
      onPress={() => onPress?.(src)}
      style={({ pressed }) => [
        styles.plate,
        align === "inset-left" ? styles.inset : null,
        align === "inset-right" ? [styles.inset, styles.insetRight] : null,
        { aspectRatio: aspectRatioFor(aspect) },
        pressed ? styles.pressed : null,
      ]}
    >
      {!failed ? (
        <ExpoImage accessibilityIgnoresInvertColors cachePolicy="memory-disk" contentFit="cover" key={nativeFreshImageKey(src, version || src)} onError={() => setFailed(true)} source={{ uri: nativeFreshImageUri(src, version || src) }} style={styles.image} transition={120} />
      ) : (
        <View style={[styles.image, styles.fallback]} />
      )}
      {caption ? (
        <LinearGradient
          colors={[huddleColors.profilePhotoScrimStart, huddleColors.profilePhotoScrimEnd]}
          end={{ x: 0, y: 0 }}
          start={{ x: 0, y: 1 }}
          style={styles.captionScrim}
        >
          <Text ellipsizeMode="tail" numberOfLines={2} style={styles.caption}>{caption}</Text>
        </LinearGradient>
      ) : null}
    </Pressable>
  );
}

export function NativeProfilePhotoFallbackPlate({ aspect = "4/5" }: { aspect?: NativeProfilePhotoAspect }) {
  return <View style={[styles.plate, styles.fallback, { aspectRatio: aspectRatioFor(aspect) }]} />;
}

const styles = StyleSheet.create({
  plate: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: huddleColors.mutedCanvas,
  },
  inset: {
    width: "88%",
    alignSelf: "flex-start",
  },
  insetRight: {
    alignSelf: "flex-end",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  captionScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x8,
    paddingBottom: huddleSpacing.x4,
  },
  caption: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.meta,
    lineHeight: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: huddleColors.onPrimary,
  },
  fallback: {
    backgroundColor: huddleColors.glassControl,
  },
  pressed: {
    opacity: 0.9,
  },
});
