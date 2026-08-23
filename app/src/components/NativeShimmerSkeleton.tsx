// Reusable shimmer skeleton for native loading states.
//
// Renders a base muted rectangle with an animated highlight band that sweeps
// across it on a loop. Uses Reanimated worklets so the animation runs on the
// UI thread. When reduced motion is enabled, falls back to a static fill.
//
// Drop-in usage: replace any `<View style={styles.skeleton} />` placeholder
// with `<NativeShimmerSkeleton style={styles.skeleton} />`. The component
// owns the entire visual; do not pass children.
//
// Higher-level skeleton layouts (NativeChatRowSkeleton, NativeGroupCardSkeleton)
// are exported below for screen-level loading states.

import { useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { huddleColors, huddlePolaroid, huddleRadii, huddleSpacing, huddleShadows } from "../theme/huddleDesignTokens";

const SHIMMER_DURATION_MS = 1400;
const HIGHLIGHT_WIDTH_RATIO = 0.6;

type NativeShimmerSkeletonProps = {
  style?: StyleProp<ViewStyle>;
};

export function NativeShimmerSkeleton({ style }: NativeShimmerSkeletonProps) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress, reduceMotion]);

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${(progress.value * 200) - 100}%` }],
  }));

  return (
    <View style={[styles.base, style]}>
      {!reduceMotion ? (
        <Animated.View style={[styles.highlightWrapper, highlightStyle]} pointerEvents="none">
          <LinearGradient
            colors={[
              "rgba(255,255,255,0)",
              "rgba(255,255,255,0.55)",
              "rgba(255,255,255,0)",
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFillObject, { width: `${HIGHLIGHT_WIDTH_RATIO * 100}%` }]}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    backgroundColor: huddleColors.mutedCanvas,
  },
  highlightWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
});

// ─── Chat row skeleton ───────────────────────────────────────────────────────
// Matches the webChatRow shape: avatar circle left + 3 stacked text lines right.
// Render 5-6 of these while the inbox is loading.
export function NativeChatRowSkeleton() {
  return (
    <View style={rowSkeletonStyles.row}>
      <NativeShimmerSkeleton style={rowSkeletonStyles.avatar} />
      <View style={rowSkeletonStyles.body}>
        <NativeShimmerSkeleton style={rowSkeletonStyles.lineTitle} />
        <NativeShimmerSkeleton style={rowSkeletonStyles.lineSub} />
        <NativeShimmerSkeleton style={rowSkeletonStyles.lineMeta} />
      </View>
    </View>
  );
}

const AVATAR_SIZE = 48;
const rowSkeletonStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x3,
    minHeight: 96,
    borderRadius: huddleRadii.card,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.glassElevation1,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: huddleSpacing.x1 + 2,
  },
  lineTitle: {
    height: 13,
    borderRadius: 6,
    width: "55%",
  },
  lineSub: {
    height: 11,
    borderRadius: 5,
    width: "80%",
  },
  lineMeta: {
    height: 10,
    borderRadius: 5,
    width: "35%",
  },
});

// ─── Group card skeleton ──────────────────────────────────────────────────────
// Matches the ExploreGroupCard: 16/9 cover image + 2 text lines below.
export function NativeGroupCardSkeleton() {
  return (
    <View style={groupSkeletonStyles.card}>
      <NativeShimmerSkeleton style={groupSkeletonStyles.cover} />
      <View style={groupSkeletonStyles.body}>
        <NativeShimmerSkeleton style={groupSkeletonStyles.lineName} />
        <NativeShimmerSkeleton style={groupSkeletonStyles.lineMeta} />
      </View>
    </View>
  );
}

const groupSkeletonStyles = StyleSheet.create({
  card: {
    borderRadius: huddleRadii.card,
    overflow: "hidden",
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.cardBorderSoft,
    ...huddleShadows.glassElevation1,
  },
  cover: {
    width: "100%",
    aspectRatio: 16 / 9,
  },
  body: {
    padding: huddleSpacing.x3,
    gap: huddleSpacing.x1 + 2,
  },
  lineName: {
    height: 13,
    borderRadius: 6,
    width: "60%",
  },
  lineMeta: {
    height: 11,
    borderRadius: 5,
    width: "40%",
  },
});

// ─── Carer (Service) card skeleton ───────────────────────────────────────────
// Matches the polaroid-style provider card on the Service tab: photo area on
// top, name + meta caption beneath. Render a grid of these while the Service
// list is loading.
export function NativeCarerCardSkeleton() {
  return (
    <View style={carerSkeletonStyles.frame}>
      <NativeShimmerSkeleton style={carerSkeletonStyles.photo} />
      <View style={carerSkeletonStyles.caption}>
        <NativeShimmerSkeleton style={carerSkeletonStyles.lineName} />
        <NativeShimmerSkeleton style={carerSkeletonStyles.lineMeta} />
      </View>
    </View>
  );
}

const carerSkeletonStyles = StyleSheet.create({
  frame: {
    aspectRatio: huddlePolaroid.frame.aspectRatio,
    borderRadius: huddlePolaroid.frame.radius,
    backgroundColor: huddlePolaroid.frame.backgroundColor,
    overflow: "hidden",
    position: "relative",
    ...huddleShadows.glassElevation1,
  },
  photo: {
    position: "absolute",
    top: "5%",
    left: "5%",
    right: "5%",
    bottom: "31%",
    borderRadius: 2,
  },
  caption: {
    position: "absolute",
    top: "72%",
    left: "8%",
    right: "8%",
    gap: huddleSpacing.x1,
  },
  lineName: {
    height: 13,
    borderRadius: 6,
    width: "75%",
  },
  lineMeta: {
    height: 10,
    borderRadius: 5,
    width: "50%",
  },
});
