import { BlurView } from "@react-native-community/blur";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { huddleColors, huddleShadows, huddleSpacing } from "../theme/huddleDesignTokens";
import { HuddleBear, type HuddleBearPose } from "./art/HuddleBear";
import { resolveReturnBanner, type NativeReturnBucket } from "../lib/nativeToastCopy";

// Shown once, after "I'm back". Same rail, geometry and motion as NativeToast,
// with a bear in a tinted block on the left.
// Contract: app/docs/Contracts/notification_copy_contract.md

export const NATIVE_RETURN_BANNER_DURATION_MS = 4200;

// Tight to the safe area so the card reads as continuing from the Dynamic
// Island rather than floating. 0 would weld it to the island.
export const NATIVE_RAIL_TOP_GAP = 4;

// The bear art is 4:5, so the card's height follows the block width rather than
// the other way round. Cropping the bear to a shorter card cuts it at the ankles,
// which reads as a rendering bug — at this size the whole figure has to be there,
// standing on the card's bottom edge.
const BANNER_BLOCK_WIDTH = 104;
const BANNER_HEIGHT = Math.round(BANNER_BLOCK_WIDTH * (1350 / 1080));

// One glow colour per bucket, not two washes. Two gradients meeting at the
// bear block's edge produced a hard vertical seam — the card read as two
// panels glued together instead of one object.
const BUCKET_STYLE: Record<NativeReturnBucket, {
  glow: string;
  stamp: string;
  shadow: string;
  pose: HuddleBearPose;
}> = {
  short:  { glow: "#FF8C3C", stamp: "#B44608", shadow: "rgba(255,117,31,0.30)", pose: "unimpressed" },
  normal: { glow: "#5A7DFF", stamp: "#1A3699", shadow: "rgba(33,69,207,0.30)",  pose: "neutral" },
  long:   { glow: "#A8E000", stamp: "#3F5E00", shadow: "rgba(120,160,0,0.30)",  pose: "happy" },
};

type NativeReturnBannerProps = {
  elapsedSeconds: number;
  onDismiss: () => void;
};

export function NativeReturnBanner({ elapsedSeconds, onDismiss }: NativeReturnBannerProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const content = resolveReturnBanner(elapsedSeconds);
  const bucket = BUCKET_STYLE[content.bucket];

  const translateY = useSharedValue(reduceMotion ? 0 : -120);
  const progress = useSharedValue(1);

  useEffect(() => {
    translateY.value = reduceMotion ? 0 : withSpring(0, { damping: 18, stiffness: 190 });
    progress.value = withTiming(0, { duration: NATIVE_RETURN_BANNER_DURATION_MS });
  }, [progress, reduceMotion, translateY]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(180)}
        pointerEvents="none"
        style={styles.scrim}
      />
      <View pointerEvents="box-none" style={[styles.railClip, { top: insets.top }]}>
      <Animated.View
        exiting={FadeOut.duration(180)}
        pointerEvents="box-none"
        style={[styles.rail, cardStyle]}
      >
        <View style={[styles.card, { shadowColor: bucket.shadow }]}>
          <BlurView
            blurAmount={24}
            blurType="light"
            pointerEvents="none"
            reducedTransparencyFallbackColor="rgba(255,255,255,0.94)"
            style={StyleSheet.absoluteFill}
          />
          {/* Opaque base under the tint. Glass alone cannot guarantee contrast:
              the card floats over photos and dark heroes, and without this the
              text sat on whatever happened to be behind it. */}
          <View pointerEvents="none" style={styles.base} />
          {/* One continuous glow, centred on the bear and falling off toward the
              text, so the copy lands on near-white. No seam, better contrast. */}
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient cx="0.14" cy="0.60" id={`banner-glow-${content.bucket}`} r="0.85">
                <Stop offset="0" stopColor={bucket.glow} stopOpacity="0.62" />
                <Stop offset="0.34" stopColor={bucket.glow} stopOpacity="0.26" />
                <Stop offset="0.62" stopColor={bucket.glow} stopOpacity="0.05" />
                <Stop offset="0.82" stopColor={bucket.glow} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect fill={`url(#banner-glow-${content.bucket})`} height="100%" width="100%" />
          </Svg>
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.95)", "rgba(255,255,255,0)"]}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={styles.specular}
          />

          <View style={styles.block}>
            <HuddleBear pose={bucket.pose} size={BANNER_BLOCK_WIDTH} />
          </View>

          <View style={styles.body}>
            <Text style={[styles.eyebrow, { color: bucket.stamp }]}>{content.eyebrow}</Text>
            <Text style={styles.headline}>{content.headline}</Text>
            <Text style={styles.copy}>{content.copy}</Text>
          </View>

          <Pressable
            accessibilityLabel="Dismiss walk summary"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onDismiss}
            style={styles.close}
          >
            <Feather color="rgba(48,54,80,0.75)" name="x" size={13} />
          </Pressable>

          {/* Time left before the banner leaves on its own. The track is what
              makes it read as a countdown rather than a stray line. */}
          <View pointerEvents="none" style={styles.barTrack} />
          <Animated.View style={[styles.bar, { backgroundColor: bucket.stamp }, barStyle]} />
        </View>
      </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 24, 38, 0.10)",
    zIndex: 59,
  },
  // Clip starts at the safe-area edge, so anything above it is cut. The card
  // slides down from behind the Dynamic Island instead of over it.
  railClip: {
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    zIndex: 60,
  },
  rail: {
    left: huddleSpacing.x3,
    position: "absolute",
    right: huddleSpacing.x3,
    top: NATIVE_RAIL_TOP_GAP,
  },
  card: {
    alignItems: "stretch",
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: BANNER_HEIGHT,
    overflow: "hidden",
    ...huddleShadows.glassElevation1,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  specular: {
    height: 1,
    left: "12%",
    position: "absolute",
    right: "12%",
    top: 0,
    zIndex: 3,
  },
  block: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "flex-end",
    width: BANNER_BLOCK_WIDTH,
  },
  body: {
    flex: 1,
    gap: 3,
    justifyContent: "center",
    paddingBottom: huddleSpacing.x4,
    paddingLeft: 15,
    paddingRight: 40,
    paddingTop: huddleSpacing.x4,
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  eyebrow: {
    fontFamily: "Urbanist-800",
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  headline: {
    color: "#1C2135",
    fontFamily: "Urbanist-800",
    fontSize: 17.5,
    letterSpacing: -0.35,
    lineHeight: 20,
  },
  copy: {
    color: "rgba(48,54,80,0.78)",
    fontFamily: "Urbanist-600",
    fontSize: 12.5,
    lineHeight: 16.5,
  },
  close: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
    borderColor: "rgba(28,33,53,0.10)",
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: "center",
    position: "absolute",
    right: 11,
    top: 11,
    width: 26,
    zIndex: 4,
  },
  barTrack: {
    backgroundColor: "rgba(28,33,53,0.07)",
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 3,
  },
  bar: {
    borderBottomRightRadius: 999,
    borderTopRightRadius: 999,
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    zIndex: 4,
  },
});
