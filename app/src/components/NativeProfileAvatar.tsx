import { Image as ExpoImage } from "expo-image";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { NativeEngagementSummary } from "../lib/nativeEngagement";
import { normalizeNativeProfilePhotoPresentationCrop, type NativeProfilePhotoPresentationCrop } from "../lib/nativeProfilePhotos";
import { loadNativeAvatarPresentation } from "../lib/nativeAvatarPresentation";
import { nativeFreshImageKey, nativeFreshImageUri } from "../lib/nativeImageFreshness";
import { huddleColors, huddleImageDefaults } from "../theme/huddleDesignTokens";

// Same sweep technique as NativeShimmerSkeleton / NameShine: a translucent
// highlight band loops across the surface on a fixed cadence. Clipped to the
// avatar's circle so it plays *over* the ring without ever touching the
// ring's own borderColor (verification colour stays exactly as-is underneath).
const AVATAR_SHIMMER_DURATION_MS = 1500;

function NativeAvatarShimmer({ size }: { size: number }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: AVATAR_SHIMMER_DURATION_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress, reduceMotion]);

  const bandWidth = Math.max(18, size * 0.55);
  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * (size + bandWidth) - bandWidth },
      { rotate: "20deg" },
    ],
  }));

  if (reduceMotion) return null;

  return (
    <View pointerEvents="none" style={[styles.shimmerClip, { width: size, height: size, borderRadius: size / 2 }]}>
      <Reanimated.View style={[styles.shimmerBand, { width: bandWidth, height: size * 1.6, top: -size * 0.3 }, highlightStyle]}>
        <ExpoLinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
          end={{ x: 1, y: 0 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Reanimated.View>
    </View>
  );
}

type NativeProfileAvatarProps = {
  /** Resolved image URL (or storage value already resolved upstream). */
  uri?: string | null;
  /** Cache-bust token that advances when the image changes (e.g. updated_at). */
  version?: string | null;
  /** Outer diameter in px. */
  size: number;
  /** Ring thickness; defaults to a subtle 2px. */
  ringWidth?: number;
  /** Blue verified ring when true. */
  verified?: boolean;
  /** Display name — first letter is the fallback when the image is missing/fails. */
  name?: string | null;
  engagement?: NativeEngagementSummary | null;
  style?: StyleProp<ViewStyle>;
  initialStyle?: StyleProp<TextStyle>;
  presentationCrop?: NativeProfilePhotoPresentationCrop | null;
  userId?: string | null;
};

/**
 * Single source of truth for rendering a person's profile photo everywhere it
 * appears (profile summary, social feed, settings, map pin, chats list/dialogue).
 * Guarantees identical behaviour: cover-fit circle, cache-busting via `version`,
 * and a graceful initials fallback if the URL is empty or fails to load.
 */
export function NativeProfileAvatar({
  uri,
  version,
  size,
  ringWidth = 2,
  verified = false,
  name,
  engagement,
  style,
  initialStyle,
  presentationCrop,
  userId,
}: NativeProfileAvatarProps) {
  const cleanUri = typeof uri === "string" ? uri.trim() : "";
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(cleanUri) && failedUri !== cleanUri;
  const freshVersion = version || cleanUri;
  const initial = (name || "U").trim().charAt(0).toUpperCase() || "U";
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [hydratedCrop, setHydratedCrop] = useState<NativeProfilePhotoPresentationCrop | null>(null);
  useEffect(() => {
    if (presentationCrop || !userId) return;
    let active = true;
    void loadNativeAvatarPresentation(userId).then((next) => {
      if (active) setHydratedCrop(next);
    });
    return () => { active = false; };
  }, [presentationCrop, userId]);
  const crop = normalizeNativeProfilePhotoPresentationCrop(presentationCrop ?? hydratedCrop);
  const imageStyle = useMemo(() => {
    if (!crop || !sourceSize) return styles.image;
    const innerSize = Math.max(1, size - ringWidth * 2);
    const cropWidth = sourceSize.width * crop.widthPct / 100;
    const scale = innerSize / cropWidth;
    const renderedWidth = sourceSize.width * scale;
    const renderedHeight = sourceSize.height * scale;
    const sourceCenterX = sourceSize.width * crop.centerX / 100;
    const sourceCenterY = sourceSize.height * crop.centerY / 100;
    return {
      position: "absolute" as const,
      width: renderedWidth,
      height: renderedHeight,
      left: innerSize / 2 - sourceCenterX * scale,
      top: innerSize / 2 - sourceCenterY * scale,
    };
  }, [crop, ringWidth, size, sourceSize]);

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: verified ? huddleColors.blue : "transparent",
        },
        style,
      ]}
    >
      {showImage ? (
        <View style={[styles.imageClip, { width: size - ringWidth * 2, height: size - ringWidth * 2, borderRadius: Math.max(0, (size - ringWidth * 2) / 2) }]}>
          <ExpoImage
            accessibilityIgnoresInvertColors
            cachePolicy={huddleImageDefaults.cachePolicy}
            contentFit={crop ? "fill" : huddleImageDefaults.contentFit}
            transition={huddleImageDefaults.transition}
            key={nativeFreshImageKey(cleanUri, freshVersion)}
            onError={() => setFailedUri(cleanUri)}
            onLoad={(event) => {
              const width = Number(event.source?.width);
              const height = Number(event.source?.height);
              if (width > 0 && height > 0) setSourceSize({ width, height });
            }}
            source={{ uri: nativeFreshImageUri(cleanUri, freshVersion) }}
            style={imageStyle}
          />
        </View>
      ) : (
        <Text style={[styles.initial, { fontSize: Math.max(12, Math.round(size * 0.4)) }, initialStyle]}>
          {initial}
        </Text>
      )}
      {engagement?.tier === "pillar" ? <NativeAvatarShimmer size={size} /> : null}
      <NativeEngagementSparkle engagement={engagement} size={size} />
    </View>
  );
}

function EngagementSparkleGlyph({ engagement, pixelSize }: { engagement: NativeEngagementSummary; pixelSize: number }) {
  const active = engagement.tier === "active";
  const trusted = engagement.tier === "trusted";
  const gradientId = trusted ? "engagementTrusted" : "engagementPillar";

  return (
    <Svg height={pixelSize} viewBox="-18 -18 36 36" width={pixelSize}>
      <Defs>
        <LinearGradient id="engagementTrusted" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.5" stopColor="#FFFFFF" />
          <Stop offset="0.62" stopColor="#E8B23D" />
          <Stop offset="1" stopColor="#E8B23D" />
        </LinearGradient>
        <LinearGradient id="engagementPillar" x1="0" x2="1" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFE9A8" />
          <Stop offset="0.55" stopColor="#F2C14E" />
          <Stop offset="1" stopColor="#C8861A" />
        </LinearGradient>
      </Defs>
      <Path
        d="M0,-16 C1,-5 5,-1 16,0 C5,1 1,5 0,16 C-1,5 -5,1 -16,0 C-5,-1 -1,-5 0,-16 Z"
        fill={active ? "transparent" : `url(#${gradientId})`}
        stroke="#C8861A"
        strokeLinejoin="round"
        strokeWidth={active ? 2.6 : 1.5}
      />
    </Svg>
  );
}

export function NativeEngagementSparkle({
  engagement,
  size,
  corner = "top-right",
}: {
  engagement?: NativeEngagementSummary | null;
  size: number;
  /** Which corner of the parent box the sparkle anchors to. Avatars use the
   * default top-right; name badges (which sit to the left of the text) use
   * top-left instead. */
  corner?: "top-right" | "top-left";
}) {
  if (!engagement || engagement.tier === "new") return null;
  const sparkleSize = Math.max(13, Math.round(size * 0.34));
  // Circular avatars have empty space in their bounding-box corner (the circle
  // doesn't reach the corner), and that free space scales with the circle's
  // radius — so the clearance nudge must scale with sparkleSize too, not be a
  // flat constant, or larger avatars (e.g. the 72px Home profile avatar) end up
  // under-cleared while small ones get over-cleared. Text has no such built-in
  // clearance, so the top-left (username) variant needs a bigger push.
  const offset = corner === "top-left" ? -(sparkleSize * 0.7 + 2) : -(sparkleSize * 0.35 + 3);
  const cornerStyle = corner === "top-left" ? { left: offset, top: offset } : { right: offset, top: offset };

  return (
    <View pointerEvents="none" style={[styles.sparkleWrap, { width: sparkleSize, height: sparkleSize }, cornerStyle]}>
      <EngagementSparkleGlyph engagement={engagement} pixelSize={sparkleSize} />
    </View>
  );
}

/**
 * Plain inline sparkle — no absolute corner positioning. Use this when the
 * sparkle sits in normal text flow (e.g. before a username), not anchored to
 * a corner of an avatar/photo/card.
 */
export function NativeEngagementSparkleInline({
  engagement,
  size = 16,
  style,
}: {
  engagement?: NativeEngagementSummary | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (!engagement || engagement.tier === "new") return null;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <EngagementSparkleGlyph engagement={engagement} pixelSize={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: huddleColors.mutedCanvas,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageClip: {
    overflow: "hidden",
    position: "relative",
  },
  initial: {
    fontFamily: "Urbanist-700",
    color: huddleColors.text,
  },
  shimmerClip: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  shimmerBand: {
    position: "absolute",
    left: 0,
  },
  sparkleWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
