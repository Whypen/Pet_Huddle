import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { BlurView } from "@react-native-community/blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import Reanimated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { NativeGlyph } from "../NativeGlyphIcons";
import { huddleCoachMark, huddleColors, huddleFeedbackGlass, huddleLayers, huddleMotion, huddleRadii, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

const ENTRANCE_OFFSET = huddleSpacing.x2;

// This is the exact silhouette traced from the founder-supplied arrow asset,
// rotated into a horizontal left-pointing viewBox. The right arrow mirrors the
// same path; neither direction is generated from an invented curve.
const SWIPE_REFERENCE_ARROW_PATH = "M0.0 168.8 L10.5 139.9 L30.2 100.2 L66.5 46.3 L107.3 0.0 L121.6 40.3 L124.7 44.7 L146.0 39.5 L147.1 37.8 L206.0 26.0 L207.7 27.1 L243.4 21.7 L295.0 19.4 L345.2 21.0 L391.3 27.1 L393.3 26.0 L480.0 42.9 L578.8 72.5 L629.8 91.3 L715.4 126.6 L798.5 163.9 L803.5 167.2 L799.0 179.7 L793.1 179.5 L678.1 141.8 L571.5 113.1 L509.5 100.3 L461.7 93.1 L459.8 94.2 L444.0 91.1 L442.0 92.2 L424.8 89.4 L381.0 87.1 L316.4 89.3 L282.0 94.4 L280.3 93.3 L268.7 96.5 L267.1 95.4 L212.6 107.7 L158.7 126.4 L155.4 127.8 L154.9 132.3 L166.9 161.5 L167.2 166.5 L170.6 172.3 L169.5 174.0 L154.8 169.2 L129.2 164.5 L80.6 160.4 L34.9 162.9 L0.0 168.8 Z";
const SWIPE_REFERENCE_ARROW_VIEWBOX_WIDTH = 804;
const SWIPE_REFERENCE_ARROW_VIEWBOX_HEIGHT = 180;

export type NativeSpotlightTarget = {
  height: number;
  shape: "circle" | "rounded";
  width: number;
  x: number;
  y: number;
};

export type NativeSpotlightCopyRegion = {
  bottom: number;
  top: number;
};

// Swipe guide for gesture steps. Icons sit half-cut at the target's left and
// right edges, vertically centred on it — they indicate direction, not where a
// button lives, because a user who swipes never touches the buttons.
function SpotlightSwipeGuide({ centerY, target, waveVisual }: { centerY: number; target: NativeSpotlightTarget; waveVisual: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const swipeProgress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      swipeProgress.value = huddleCoachMark.swipeGestureReducedMotionProgress;
      return;
    }
    swipeProgress.value = withRepeat(
      withTiming(1, { duration: huddleMotion.durations.coachMarkSwipe, easing: Easing.bezier(...huddleMotion.easings.standard) }),
      -1,
      true,
    );
  }, [reduceMotion, swipeProgress]);

  const leftStyle = useAnimatedStyle(() => {
    const progress = swipeProgress.value;
    return {
      opacity: huddleCoachMark.swipeGuideOpacity,
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, huddleCoachMark.swipeGestureMidProgress, 1],
            [huddleCoachMark.swipeGestureTravelX, huddleCoachMark.swipeGestureMidTravelX, 0],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, huddleCoachMark.swipeGestureMidProgress, 1],
            [huddleCoachMark.swipeGestureTravelY, huddleCoachMark.swipeGestureMidTravelY, -huddleCoachMark.swipeGestureEndLift],
          ),
        },
        {
          rotate: `${interpolate(
            progress,
            [0, huddleCoachMark.swipeGestureMidProgress, 1],
            [huddleCoachMark.swipeGestureStartRotation, huddleCoachMark.swipeGestureMidRotation, huddleCoachMark.swipeGestureEndRotation],
          )}deg`,
        },
      ],
    };
  });
  const rightStyle = useAnimatedStyle(() => {
    const progress = swipeProgress.value;
    return {
      opacity: huddleCoachMark.swipeGuideOpacity,
      transform: [
        {
          translateX: interpolate(
            progress,
            [0, huddleCoachMark.swipeGestureMidProgress, 1],
            [-huddleCoachMark.swipeGestureTravelX, -huddleCoachMark.swipeGestureMidTravelX, 0],
          ),
        },
        {
          translateY: interpolate(
            progress,
            [0, huddleCoachMark.swipeGestureMidProgress, 1],
            [huddleCoachMark.swipeGestureTravelY, huddleCoachMark.swipeGestureMidTravelY, -huddleCoachMark.swipeGestureEndLift],
          ),
        },
        {
          rotate: `${interpolate(
            progress,
            [0, huddleCoachMark.swipeGestureMidProgress, 1],
            [-huddleCoachMark.swipeGestureStartRotation, -huddleCoachMark.swipeGestureMidRotation, -huddleCoachMark.swipeGestureEndRotation],
          )}deg`,
        },
      ],
    };
  });

  const half = huddleCoachMark.swipeIconSize / 2;
  const originX = target.x + target.width / 2;
  const arrowLeft = target.x + huddleSpacing.x3;
  const arrowWidth = Math.max(huddleSpacing.x10, originX - huddleSpacing.x4 - arrowLeft);
  const arrowHeight = arrowWidth * (SWIPE_REFERENCE_ARROW_VIEWBOX_HEIGHT / SWIPE_REFERENCE_ARROW_VIEWBOX_WIDTH);
  const arrowTop = centerY - (arrowHeight / 2);
  const rightArrowLeft = originX + huddleSpacing.x4;

  return (
    <>
      <Reanimated.View pointerEvents="none" style={[styles.swipeArrow, { height: arrowHeight, left: arrowLeft, top: arrowTop, width: arrowWidth }, leftStyle]}>
        <Svg height="100%" viewBox={`0 0 ${SWIPE_REFERENCE_ARROW_VIEWBOX_WIDTH} ${SWIPE_REFERENCE_ARROW_VIEWBOX_HEIGHT}`} width="100%">
          <Path d={SWIPE_REFERENCE_ARROW_PATH} fill={huddleCoachMark.passSurface} />
        </Svg>
      </Reanimated.View>

      <Reanimated.View pointerEvents="none" style={[styles.swipeArrow, { height: arrowHeight, left: rightArrowLeft, top: arrowTop, width: arrowWidth }, rightStyle]}>
        <Svg height="100%" viewBox={`0 0 ${SWIPE_REFERENCE_ARROW_VIEWBOX_WIDTH} ${SWIPE_REFERENCE_ARROW_VIEWBOX_HEIGHT}`} width="100%">
          <Path d={SWIPE_REFERENCE_ARROW_PATH} fill={huddleColors.blue} transform={`translate(${SWIPE_REFERENCE_ARROW_VIEWBOX_WIDTH} 0) scale(-1 1)`} />
        </Svg>
      </Reanimated.View>

      {/* Unflipped `pass` glyph points left. The card's Next button applies
          scaleX:-1 to the same glyph to point it right; here the arrow and the
          icon must agree, so the transform is deliberately not applied. */}
      <View pointerEvents="none" style={[styles.swipeIcon, styles.swipeIconPass, { left: target.x - half, top: centerY - half }]}>
        <NativeGlyph color={huddleColors.onPrimary} name="pass" size={huddleCoachMark.swipeGlyphSize} />
      </View>
      <View pointerEvents="none" style={[styles.swipeWaveVisual, { left: target.x + target.width - half, top: centerY - half }]}>
        {waveVisual}
      </View>
    </>
  );
}

export function NativeSpotlightOverlay({
  accent,
  advanceBounds,
  body,
  contentBounds,
  copyRegion,
  focusEnabled = true,
  focusVisual,
  headline,
  kicker,
  onAdvance,
  showSwipeGuide = false,
  swipeWaveVisual,
  step,
  target,
  totalSteps = 1,
  visible,
  whiteVeilBounds,
}: {
  accent: string;
  advanceBounds?: NativeSpotlightTarget | null;
  body?: string;
  contentBounds?: NativeSpotlightTarget | null;
  copyRegion?: NativeSpotlightCopyRegion | null;
  focusEnabled?: boolean;
  focusVisual?: ReactNode;
  headline: string;
  kicker: string;
  onAdvance: () => void;
  showSwipeGuide?: boolean;
  swipeWaveVisual?: ReactNode;
  step?: number;
  target: NativeSpotlightTarget | null;
  totalSteps?: number;
  visible: boolean;
  whiteVeilBounds?: NativeSpotlightTarget | null;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(ENTRANCE_OFFSET);

  useEffect(() => {
    if (!visible || !target) {
      setBlockHeight(null);
      opacity.value = 0;
      translateY.value = ENTRANCE_OFFSET;
      return;
    }
    const duration = reduceMotion ? 0 : huddleMotion.durations.enter;
    const easing = Easing.bezier(...huddleMotion.easings.out);
    opacity.value = withTiming(1, { duration, easing });
    translateY.value = withTiming(0, { duration, easing });
  }, [opacity, reduceMotion, target, translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || !target) return null;

  const cutoutBottom = target.y + target.height;
  const measuredBlockHeight = blockHeight ?? 0;
  const belowTop = cutoutBottom + huddleSpacing.x3;
  const aboveTop = target.y - huddleSpacing.x2 - measuredBlockHeight;
  const topLimit = insets.top + huddleSpacing.x3;
  const availableBottom = screenHeight - insets.bottom - huddleSpacing.x8;
  const contentTopLimit = contentBounds ? contentBounds.y + huddleSpacing.x4 : topLimit;
  const contentBottomLimit = contentBounds
    ? contentBounds.y + contentBounds.height - huddleSpacing.x4
    : availableBottom;
  const copyRegionTop = copyRegion && blockHeight !== null
    ? Math.min(
      Math.max(
        contentTopLimit,
        copyRegion.top + ((copyRegion.bottom - copyRegion.top - measuredBlockHeight) / 2),
      ),
      Math.min(copyRegion.bottom - measuredBlockHeight - huddleSpacing.x4, contentBottomLimit - measuredBlockHeight),
    )
    : null;
  // Above-first. Reading the explanation and then dropping the eye onto the
  // highlighted control is the order that already works on Map, and every
  // circular target has ample room above it. Below is the fallback for targets
  // near the top; the top anchor only ever catches a target so tall that
  // neither side exists — in practice the full-card swipe step.
  const hasRoomAbove = blockHeight !== null && aboveTop >= contentTopLimit;
  const hasRoomBelow = blockHeight !== null && belowTop + measuredBlockHeight + huddleCoachMark.placementMargin <= contentBottomLimit;
  const preferredBlockTop = blockHeight === null
    ? contentTopLimit
    : copyRegionTop !== null
      ? copyRegionTop
      : hasRoomAbove
      ? aboveTop
      : hasRoomBelow
        ? belowTop
        : contentTopLimit;
  const blockTop = blockHeight === null
    ? preferredBlockTop
    : Math.min(
      Math.max(preferredBlockTop, contentTopLimit),
      Math.max(contentTopLimit, contentBottomLimit - measuredBlockHeight),
    );
  const blockHorizontalStyle = contentBounds
    ? {
      left: contentBounds.x + huddleSpacing.x4,
      right: Math.max(huddleSpacing.x4, screenWidth - contentBounds.x - contentBounds.width + huddleSpacing.x4),
    }
    : { left: huddleCoachMark.blockLeft, right: huddleCoachMark.blockRight };
  const advanceStyle = advanceBounds
    ? { height: advanceBounds.height, left: advanceBounds.x, top: advanceBounds.y, width: advanceBounds.width }
    : StyleSheet.absoluteFillObject;

  return (
    <FullWindowOverlay>
    <View pointerEvents="box-none" style={styles.root}>
         {whiteVeilBounds ? (
           <View
             pointerEvents="none"
             style={[
               styles.whiteCardBlur,
               {
                 borderRadius: huddleRadii.modal,
                 height: whiteVeilBounds.height,
                 left: whiteVeilBounds.x,
                 top: whiteVeilBounds.y,
                 width: whiteVeilBounds.width,
               },
             ]}
           >
             <BlurView
               blurAmount={huddleFeedbackGlass.blurAmount}
               blurType="light"
               pointerEvents="none"
               reducedTransparencyFallbackColor={huddleFeedbackGlass.reducedTransparencyFallbackColor}
               style={StyleSheet.absoluteFill}
             />
             <View pointerEvents="none" style={styles.whiteCardBlurWash} />
           </View>
         ) : (
           <View pointerEvents="none" style={StyleSheet.absoluteFill}>
             <BlurView
               blurAmount={huddleFeedbackGlass.blurAmount}
               blurType="light"
               pointerEvents="none"
               reducedTransparencyFallbackColor={huddleFeedbackGlass.reducedTransparencyFallbackColor}
               style={StyleSheet.absoluteFill}
             />
             <LinearGradient
               colors={huddleFeedbackGlass.systemWash}
               end={{ x: 1, y: 1 }}
               pointerEvents="none"
               start={{ x: 0, y: 0 }}
               style={StyleSheet.absoluteFill}
             />
           </View>
         )}

        {/* iOS UIVisualEffectView exposes the rectangular mask bounds when a
            BlurView is inverse-masked. Keep one uninterrupted Toast blur and
            place the exact shared control visual above it; this reads as the
            intended spotlight without a square crop or a screenshot clone. */}
        {focusEnabled && focusVisual ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[
              styles.focusVisual,
              { height: target.height, left: target.x, top: target.y, width: target.width },
            ]}
          >
            {focusVisual}
          </View>
        ) : null}

        {showSwipeGuide && swipeWaveVisual ? (
          <SpotlightSwipeGuide
            centerY={Math.min(
              target.y + target.height - huddleCoachMark.swipeIconSize,
              blockTop + measuredBlockHeight + huddleSpacing.x6 + (huddleCoachMark.swipeIconSize / 2),
            )}
            target={target}
            waveVisual={swipeWaveVisual}
          />
        ) : null}

        <Reanimated.View
          onLayout={(event) => setBlockHeight(event.nativeEvent.layout.height)}
          pointerEvents="none"
          style={[
            styles.block,
            blockHorizontalStyle,
            { opacity: blockHeight === null ? 0 : undefined, top: blockTop },
            animatedStyle,
          ]}
        >
          <View style={[styles.rule, { backgroundColor: accent }]} />
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          <Text style={styles.headline}>{headline}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          {totalSteps > 1 ? (
            <View style={styles.footer}>
              <View style={styles.dashes}>
                {Array.from({ length: totalSteps }, (_, index) => (
                  <View
                    key={index}
                    style={[styles.dash, index + 1 === step ? styles.dashActive : null]}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Reanimated.View>
        <Pressable accessibilityLabel="Continue" accessibilityRole="button" onPress={onAdvance} style={[styles.advanceSurface, advanceStyle]} />
    </View>
    </FullWindowOverlay>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: huddleLayers.coachMark,
    elevation: huddleLayers.coachMark,
  },
  whiteCardBlur: {
    position: "absolute",
    overflow: "hidden",
  },
  whiteCardBlurWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.glassControl,
  },
  advanceSurface: {
    position: "absolute",
  },
  focusVisual: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeIcon: {
    position: "absolute",
    width: huddleCoachMark.swipeIconSize,
    height: huddleCoachMark.swipeIconSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
  },
  swipeArrow: {
    position: "absolute",
  },
  block: {
    position: "absolute",
  },
  rule: {
    width: huddleCoachMark.ruleWidth,
    height: huddleCoachMark.ruleHeight,
    marginBottom: huddleSpacing.x3,
  },
  kicker: {
    color: huddleCoachMark.kickerColor,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    letterSpacing: huddleCoachMark.kickerLetterSpacing,
    marginBottom: huddleSpacing.x2,
    textTransform: "uppercase",
  },
  headline: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h1,
    lineHeight: huddleType.h1Line,
    marginBottom: huddleSpacing.x2,
  },
  body: {
    color: huddleCoachMark.bodyColor,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  footer: {
    marginTop: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  dashes: {
    flexDirection: "row",
    gap: huddleSpacing.x1,
  },
  dash: {
    width: huddleCoachMark.dashWidth,
    height: huddleCoachMark.dashHeight,
    backgroundColor: huddleCoachMark.dashIdle,
  },
  dashActive: {
    backgroundColor: huddleCoachMark.dashActive,
  },
  swipeIconPass: {
    backgroundColor: huddleCoachMark.passSurface,
    borderColor: huddleCoachMark.passBorder,
  },
  swipeWaveVisual: {
    position: "absolute",
    width: huddleCoachMark.swipeIconSize,
    height: huddleCoachMark.swipeIconSize,
    alignItems: "center",
    justifyContent: "center",
  },
});
