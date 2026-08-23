import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, Easing } from "react-native-reanimated";
import { haptic } from "../lib/nativeHaptics";
import type { NativeHuddleRewardCelebrationTarget } from "../lib/nativeHuddleRewardCelebration";
import { huddleColors, huddleLayout, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";
import { NativeProfileAvatar } from "./NativeProfileAvatar";

// The card is sized by whichever layer is showing and animates between the two
// as it floods, so neither state carries dead space from the other's layout.
const FLOOD_OVERSHOOT = 900;
const ANCHOR_FALLBACK = 250;
const SEGMENT_COUNT = 10;

const BEAT_LAND = 260;
const BEAT_FUSE = 900;
const BEAT_FLOOD = 1050;
const BEAT_PACK = 1200;
const BEAT_SETTLE = 1340;
const PACK_STAGGER = 55;

const AVATAR_MAX = 72;
const AVATAR_MIN = 52;
const AVATAR_NARROW_WIDTH = 260;
const AVATAR_GAP_MIN = 18;

type Props = {
  accentColor: string;
  target: NativeHuddleRewardCelebrationTarget | null;
  onClose: () => void;
};

const monthsLabel = (months: number) => `${months} month${months === 1 ? "" : "s"}`;

const endsAtLabel = (value: string) => {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
};

const celebrationCopy = (template: string, values: { expiry: string; months: string; reward: string }) => (
  template
    .replaceAll("{reward}", values.reward)
    .replaceAll("{months}", values.months)
    .replaceAll("{expiry}", values.expiry)
);

// Each face lands on its own beat, so the pack visibly assembles rather than
// appearing all at once. Own component because hooks cannot run in a loop.
function PackMember({ children, index, play, style }: { children: React.ReactNode; index: number; play: boolean; style?: object }) {
  const enter = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!play) {
      enter.value = 0;
      return;
    }
    if (reduceMotion) {
      enter.value = 1;
      return;
    }
    enter.value = withDelay(index * PACK_STAGGER, withTiming(1, {
      duration: 400,
      easing: Easing.bezier(0.2, 1.3, 0.4, 1),
    }));
  }, [enter, index, play, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 2),
    transform: [
      { translateY: (1 - enter.value) * 18 },
      { scale: 0.5 + enter.value * 0.5 },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export function NativeHuddleRewardCelebration({ accentColor, target, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const [remaining, setRemaining] = useState(1);
  const [anchor, setAnchor] = useState(ANCHOR_FALLBACK);
  const [rowWidth, setRowWidth] = useState(0);
  const [packPlaying, setPackPlaying] = useState(false);
  const [phase, setPhase] = useState<"before" | "after">("before");
  const [beforeHeight, setBeforeHeight] = useState(0);
  const [afterHeight, setAfterHeight] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const lastSegment = useSharedValue(0);
  const fuse = useSharedValue(0);
  const flood = useSharedValue(0);
  const after = useSharedValue(0);
  const before = useSharedValue(1);
  const cardHeight = useSharedValue(0);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    if (!target) {
      setPackPlaying(false);
      setPhase("before");
      return undefined;
    }

    if (reduceMotion) {
      // Same moment, no travel: the colour cut and the copy still land.
      setRemaining(0);
      lastSegment.value = 1;
      fuse.value = 1;
      flood.value = 1;
      before.value = 0;
      after.value = withTiming(1, { duration: 160 });
      setPackPlaying(true);
      setPhase("after");
      haptic.success();
      return clearTimers;
    }

    setRemaining(1);
    setPackPlaying(false);
    setPhase("before");
    lastSegment.value = 0;
    fuse.value = 0;
    flood.value = 0;
    before.value = 1;
    after.value = 0;

    timersRef.current.push(setTimeout(() => {
      // The final friend lands. Overshoot is the point — it should arrive.
      setRemaining(0);
      lastSegment.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.2, 1.35, 0.4, 1) });
      haptic.selectTab();
    }, BEAT_LAND));

    timersRef.current.push(setTimeout(() => {
      // Ten segments fuse into one bar.
      fuse.value = withTiming(1, { duration: 90, easing: Easing.linear });
    }, BEAT_FUSE));

    timersRef.current.push(setTimeout(() => {
      // The bar splits open and floods the card. The progress the user was
      // watching becomes the celebration surface — no confetti required.
      flood.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.25, 0.9, 0.25, 1) });
      before.value = withDelay(120, withTiming(0, { duration: 120 }));
      // The card reshapes to the reward layout on the same curve as the flood.
      setPhase("after");
      haptic.success();
    }, BEAT_FLOOD));

    // The faces that earned it assemble out of the flood, one per beat.
    timersRef.current.push(setTimeout(() => setPackPlaying(true), BEAT_PACK));

    timersRef.current.push(setTimeout(() => {
      after.value = withTiming(1, { duration: 320, easing: Easing.bezier(0.2, 0.9, 0.25, 1) });
    }, BEAT_SETTLE));

    return clearTimers;
  }, [after, before, clearTimers, flood, fuse, lastSegment, reduceMotion, target]);

  // Each layer reports its own natural height; the card follows whichever one
  // is on screen instead of being pinned to a constant.
  useEffect(() => {
    const target = phase === "after" ? afterHeight : beforeHeight;
    if (!target) return;
    if (cardHeight.value === 0 || reduceMotion) {
      cardHeight.value = target;
      return;
    }
    cardHeight.value = withTiming(target, { duration: 420, easing: Easing.bezier(0.25, 0.9, 0.25, 1) });
  }, [afterHeight, beforeHeight, cardHeight, phase, reduceMotion]);

  const onBarLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setAnchor(y + height / 2);
  }, []);

  const onBeforeLayout = useCallback((event: LayoutChangeEvent) => {
    setBeforeHeight(event.nativeEvent.layout.height);
  }, []);

  const onAfterLayout = useCallback((event: LayoutChangeEvent) => {
    setAfterHeight(event.nativeEvent.layout.height);
  }, []);

  const onRowLayout = useCallback((event: LayoutChangeEvent) => {
    setRowWidth(event.nativeEvent.layout.width);
  }, []);

  const lastSegmentStyle = useAnimatedStyle(() => ({
    opacity: lastSegment.value,
    transform: [{ scaleX: lastSegment.value }],
  }));
  const fusedStyle = useAnimatedStyle(() => ({ opacity: fuse.value }));
  const beforeStyle = useAnimatedStyle(() => ({ opacity: before.value }));
  const cardStyle = useAnimatedStyle(() => (cardHeight.value > 0 ? { height: cardHeight.value } : {}));
  // Both halves are anchored to the fused bar and clipped by the card, so the
  // split reads the same whatever height the card is animating through.
  const floodUpStyle = useAnimatedStyle(() => ({
    top: anchor - anchor * flood.value,
    height: anchor * flood.value,
  }));
  const floodDownStyle = useAnimatedStyle(() => ({ height: FLOOD_OVERSHOOT * flood.value }));
  const afterStyle = useAnimatedStyle(() => ({
    opacity: after.value,
    transform: [{ translateY: (1 - after.value) * 16 }],
  }));

  if (!target) return null;

  const tierLabel = target.rewardTier === "gold" ? "huddle＊" : "huddle+";
  // Both inks are dark tokens: white on coral fails contrast at body sizes.
  const ink = accentColor === huddleColors.coral ? huddleColors.text : huddleColors.blue;
  const endsAt = endsAtLabel(target.grantEndsAt);
  const templateValues = {
    reward: tierLabel,
    months: monthsLabel(target.rewardMonths),
    expiry: endsAt || "now",
  };

  const overflowCount = Math.max(0, target.contributorTotal - target.contributors.length);
  const memberCount = target.contributors.length + (overflowCount > 0 ? 1 : 0);
  // Two rows rather than one strip: it fills the flooded card, and it lets the
  // faces sit at ~72pt with only light overlap so friends stay recognisable.
  const packRowCount = memberCount > 10 ? 3 : 2;
  const perRow = Math.ceil(memberCount / packRowCount);
  const avatarSize = rowWidth > 0 && rowWidth < AVATAR_NARROW_WIDTH ? AVATAR_MIN : AVATAR_MAX;
  // The row is sized to the card rather than assumed to fit — six faces must
  // not run off a 320pt device.
  const step = perRow > 1 && rowWidth > 0
    ? Math.max(AVATAR_GAP_MIN, Math.min(avatarSize - 10, (rowWidth - avatarSize) / (perRow - 1)))
    : avatarSize;
  const overlap = -(avatarSize - step);
  const packRows = Array.from({ length: packRowCount }, (_, row) => (
    Array.from({ length: memberCount }, (_, index) => index).slice(row * perRow, row * perRow + perRow)
  )).filter((row) => row.length > 0);

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Close reward" onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.card, cardStyle]}>
        <Pressable onPress={(event) => event.stopPropagation()} style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[styles.floodUp, { backgroundColor: accentColor }, floodUpStyle]} />
        <Animated.View pointerEvents="none" style={[styles.floodDown, { top: anchor, backgroundColor: accentColor }, floodDownStyle]} />

        <Animated.View onLayout={onBeforeLayout} pointerEvents="none" style={[styles.beforeLayer, beforeStyle]}>
          <View style={styles.metricRow}>
            <Text numberOfLines={1} style={[styles.metric, { color: accentColor }]}>{remaining}</Text>
            <Text style={styles.metricUnit}>friends{"\n"}to go</Text>
          </View>
          <Text numberOfLines={2} style={styles.beforeTitle}>Almost there.</Text>
          <Text numberOfLines={1} style={[styles.beforeReward, { color: accentColor }]}>Earn {tierLabel}.</Text>
          <View onLayout={onBarLayout} style={styles.segments}>
            {Array.from({ length: SEGMENT_COUNT }, (_, index) => (
              index === SEGMENT_COUNT - 1 ? (
                <View key={index} style={styles.segment}>
                  <Animated.View style={[styles.segmentFill, { backgroundColor: accentColor }, lastSegmentStyle]} />
                </View>
              ) : (
                <View key={index} style={[styles.segment, { backgroundColor: accentColor }]} />
              )
            ))}
            <Animated.View pointerEvents="none" style={[styles.fusedBar, { backgroundColor: accentColor }, fusedStyle]} />
          </View>
        </Animated.View>

        <View onLayout={onAfterLayout} style={styles.afterLayer}>
          <Animated.View style={[styles.afterHead, afterStyle]}>
            <Pressable
              accessibilityLabel="Close reward"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.close}
            >
              <Feather color={ink} name="x" size={24} />
            </Pressable>
          </Animated.View>

          <View style={styles.afterBody}>
            {target.contributors.length ? (
              <View
                accessibilityLabel={`${target.contributorTotal} friends joined your huddle`}
                onLayout={onRowLayout}
                style={styles.contributors}
              >
                {packRows.map((row, rowIndex) => (
                  <View
                    key={rowIndex}
                    style={[styles.contributorRow, rowIndex > 0 ? { marginTop: -Math.round(avatarSize * 0.14) } : null]}
                  >
                    {row.map((index, positionInRow) => {
                      const contributor = target.contributors[index];
                      return (
                        <PackMember
                          key={contributor ? contributor.user_id : `overflow-${index}`}
                          index={index}
                          play={packPlaying}
                          style={positionInRow > 0 ? { marginLeft: overlap, zIndex: index } : { zIndex: index }}
                        >
                          {contributor ? (
                            <NativeProfileAvatar
                              initialStyle={styles.contributorInitial}
                              name={contributor.display_name}
                              ringWidth={3}
                              size={avatarSize}
                              style={[styles.contributorAvatar, { borderColor: accentColor }]}
                              uri={contributor.avatar_url}
                              userId={contributor.user_id}
                              version={contributor.updated_at}
                            />
                          ) : (
                            <View
                              style={[
                                styles.contributorMore,
                                { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, borderColor: accentColor },
                              ]}
                            >
                              <Text numberOfLines={1} style={styles.contributorMoreText}>+{overflowCount}</Text>
                            </View>
                          )}
                        </PackMember>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}

            <Animated.View style={afterStyle}>
              <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.afterTitle, { color: ink }]}>
                {celebrationCopy(target.headline, templateValues)}
              </Text>
              <View style={styles.rewardChip}>
                <Text numberOfLines={2} style={styles.rewardChipText}>
                  {celebrationCopy(target.pill, templateValues)}
                </Text>
              </View>
              <Text numberOfLines={2} style={[styles.afterBodyText, { color: ink }]}>
                {celebrationCopy(target.subheadline, templateValues)}
              </Text>
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    justifyContent: "center",
    padding: huddleSpacing.x5,
    backgroundColor: huddleColors.backdrop,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    overflow: "hidden",
    alignSelf: "center",
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.blue,
  },
  floodUp: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  floodDown: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  beforeLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x6,
  },
  metricRow: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingRight: 48,
  },
  metric: {
    fontFamily: "Urbanist-800",
    fontSize: 108,
    lineHeight: 112,
    letterSpacing: -4,
  },
  metricUnit: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 27,
  },
  beforeTitle: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-800",
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.7,
    color: huddleColors.onPrimary,
  },
  beforeReward: {
    marginTop: 2,
    fontFamily: "Urbanist-800",
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  segments: {
    height: 6,
    flexDirection: "row",
    gap: 5,
    marginTop: huddleSpacing.x5,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.membershipUpgradeDivider,
  },
  segmentFill: {
    width: "100%",
    height: "100%",
    borderRadius: huddleRadii.pill,
  },
  fusedBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: huddleRadii.pill,
  },
  afterLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  afterHead: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: huddleLayout.minTouch + huddleSpacing.x5,
  },
  close: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    position: "absolute",
    zIndex: 2,
    right: huddleSpacing.x3,
    top: huddleSpacing.x3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  afterBody: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleLayout.minTouch + huddleSpacing.x4,
    paddingBottom: huddleSpacing.x6,
  },
  contributors: {
    alignItems: "flex-start",
    marginBottom: huddleSpacing.x4,
  },
  contributorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  contributorAvatar: {
    backgroundColor: huddleColors.blue,
  },
  contributorInitial: {
    color: huddleColors.onPrimary,
  },
  contributorMore: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    backgroundColor: huddleColors.blue,
  },
  contributorMoreText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-800",
    fontSize: 18,
    lineHeight: 22,
  },
  afterTitle: {
    fontFamily: "Urbanist-800",
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1.4,
  },
  rewardChip: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: 7,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.blue,
  },
  rewardChipText: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-800",
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  afterBodyText: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
  },
});
