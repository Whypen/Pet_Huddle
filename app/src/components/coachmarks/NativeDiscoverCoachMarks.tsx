import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { markNativeCoachMarkSeen } from "../../lib/nativeCoachMarks";
import { huddleColors, huddleLayout, huddleSpacing } from "../../theme/huddleDesignTokens";
import { NativeSpotlightOverlay, type NativeSpotlightCopyRegion, type NativeSpotlightTarget } from "./NativeSpotlightOverlay";

const DISCOVER_STEPS = ["star", "wave", "swipe"] as const;
const MAX_DISCOVER_GEOMETRY_MEASURE_ATTEMPTS = 16;
type DiscoverCoachMarkStep = typeof DISCOVER_STEPS[number];

type DiscoverCoachMarkGeometry = {
  card: NativeSpotlightTarget;
  page: NativeSpotlightTarget;
  star: NativeSpotlightTarget;
  wave: NativeSpotlightTarget;
};

const STEP_CONTENT: Record<DiscoverCoachMarkStep, { body: string; headline: string; kicker: string }> = {
  star: { kicker: "Star", headline: "Says hello —", body: "and opens the chat right away!" },
  wave: { kicker: "Wave", headline: "Says you're interested.", body: "You're matched once they wave back." },
  swipe: { kicker: "Swipe", headline: "You can also swipe.", body: "Right to say yes, left to pass for now." },
};

export function NativeDiscoverCoachMarks({
  cardRef,
  onFinish,
  pageRef,
  starFocusVisual,
  starRef,
  userId,
  visible,
  waveFocusVisual,
  waveRef,
}: {
  cardRef: RefObject<View | null>;
  onFinish: () => void;
  pageRef: RefObject<View | null>;
  starFocusVisual: ReactNode;
  starRef: RefObject<View | null>;
  userId: string | null | undefined;
  visible: boolean;
  waveFocusVisual: ReactNode;
  waveRef: RefObject<View | null>;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [stepIndex, setStepIndex] = useState(0);
  const [geometry, setGeometry] = useState<DiscoverCoachMarkGeometry | null>(null);
  const currentStep = DISCOVER_STEPS[stepIndex];

  const measureDiscoverGeometry = useCallback((onMeasured: (nextGeometry: DiscoverCoachMarkGeometry) => void, onUnavailable: () => void) => {
    const page = pageRef.current;
    if (!page) {
      onUnavailable();
      return;
    }
    page.measureInWindow((pageX, pageY, pageWidth, pageHeight) => {
      if (pageWidth <= 0 || pageHeight <= 0) {
        onUnavailable();
        return;
      }
      const card = cardRef.current;
      if (!card) {
        onUnavailable();
        return;
      }
      card.measureInWindow((cardX, cardY, cardWidth, cardHeight) => {
        if (cardWidth <= 0 || cardHeight <= 0) {
          onUnavailable();
          return;
        }
        const star = starRef.current;
        if (!star) {
          onUnavailable();
          return;
        }
        star.measureInWindow((starX, starY, starWidth, starHeight) => {
          if (starWidth <= 0 || starHeight <= 0) {
            onUnavailable();
            return;
          }
          const wave = waveRef.current;
          if (!wave) {
            onUnavailable();
            return;
          }
          wave.measureInWindow((waveX, waveY, waveWidth, waveHeight) => {
            if (waveWidth <= 0 || waveHeight <= 0) {
              onUnavailable();
              return;
            }
            const card: NativeSpotlightTarget = {
              x: cardX,
              y: cardY,
              width: cardWidth,
              height: cardHeight,
              shape: "rounded",
            };
            const globalNavTop = windowHeight - Math.max(huddleSpacing.x2, insets.bottom + huddleSpacing.x2) - huddleLayout.navHeight;
            onMeasured({
              card,
              page: {
                x: pageX,
                y: pageY,
                width: pageWidth,
                height: Math.max(0, Math.min(pageY + pageHeight, globalNavTop) - pageY),
                shape: "rounded",
              },
              star: { x: starX, y: starY, width: starWidth, height: starHeight, shape: "circle" },
              wave: { x: waveX, y: waveY, width: waveWidth, height: waveHeight, shape: "circle" },
            });
          });
        });
      });
    });
  }, [cardRef, insets.bottom, pageRef, starRef, waveRef, windowHeight]);

  useEffect(() => {
    if (!visible) return undefined;
    setGeometry(null);
    let frame = 0;
    let attempts = 0;
    let cancelled = false;
    const scheduleMeasurement = () => {
      if (cancelled) return;
      attempts += 1;
      measureDiscoverGeometry(
        (nextGeometry) => {
          if (!cancelled) setGeometry(nextGeometry);
        },
        () => {
          if (!cancelled && attempts < MAX_DISCOVER_GEOMETRY_MEASURE_ATTEMPTS) {
            frame = requestAnimationFrame(scheduleMeasurement);
          }
        },
      );
    };
    frame = requestAnimationFrame(scheduleMeasurement);
    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measureDiscoverGeometry, visible]);

  useEffect(() => {
    if (visible) return;
    setStepIndex(0);
    setGeometry(null);
  }, [visible]);

  const advance = useCallback(() => {
    const next = stepIndex + 1;
    if (next >= DISCOVER_STEPS.length) {
      void markNativeCoachMarkSeen(userId, "discover_star_wave_swipe").finally(onFinish);
      return;
    }
    setStepIndex(next);
  }, [onFinish, stepIndex, userId]);

  if (!visible || !currentStep) return null;

  const content = STEP_CONTENT[currentStep];
  const target = (() => {
    if (!geometry) return null;
    if (currentStep === "star") return geometry.star;
    if (currentStep === "wave") return geometry.wave;
    return geometry.card;
  })();
  const copyRegion: NativeSpotlightCopyRegion | null = geometry && currentStep === "swipe"
    ? { top: geometry.card.y, bottom: Math.min(geometry.star.y, geometry.wave.y) }
    : null;

  return (
    <NativeSpotlightOverlay
      accent={huddleColors.coral}
      advanceBounds={geometry?.page}
      body={content.body}
      contentBounds={geometry?.card}
      copyRegion={copyRegion}
      focusEnabled={currentStep !== "swipe"}
      focusVisual={currentStep === "star" ? starFocusVisual : currentStep === "wave" ? waveFocusVisual : null}
      headline={content.headline}
      kicker={content.kicker}
      onAdvance={advance}
      showSwipeGuide={currentStep === "swipe"}
      step={stepIndex + 1}
      swipeWaveVisual={waveFocusVisual}
      target={target}
      totalSteps={DISCOVER_STEPS.length}
      visible={visible}
      whiteVeilBounds={geometry?.card}
    />
  );
}
