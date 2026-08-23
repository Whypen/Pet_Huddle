import { BlurView } from "@react-native-community/blur";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { huddleColors, huddleFeedbackGlass, huddleShadows, huddleSpacing } from "../theme/huddleDesignTokens";
import { resolveToastCopy, type NativeToastContent, type NativeToastTone } from "../lib/nativeToastCopy";
import { hideNativeWindowToast, showNativeWindowToast } from "../lib/nativeToastBus";

// Top-rail notification. Shares its geometry, tint recipe and motion with
// NativeReturnBanner so both read as one system.
// Contract: app/docs/Contracts/notification_copy_contract.md

// Long enough to actually read two lines. Anything under ~3.5s and the
// message is gone before a person finishes it.
export const NATIVE_TOAST_DURATION_MS = 4200;

// Same rail gap as the return banner — one system.
const NATIVE_RAIL_TOP_GAP = 4;

export const nativeToastTints: Record<NativeToastTone, {
  wash: [string, string];
  disc: string;
  discInk: string;
  shadow: string;
}> = {
  done: {
    wash: ["rgba(191,255,0,0.42)", "rgba(191,255,0,0.13)"],
    disc: huddleColors.lime,
    discInk: "#1F2510",
    shadow: "rgba(120,160,0,0.30)",
  },
  system: {
    wash: [...huddleFeedbackGlass.systemWash],
    disc: huddleColors.blue,
    discInk: "#FFFFFF",
    shadow: "rgba(33,69,207,0.30)",
  },
  limit: {
    wash: ["rgba(255,117,31,0.30)", "rgba(255,117,31,0.08)"],
    disc: huddleColors.coral,
    discInk: "#FFFFFF",
    shadow: "rgba(255,117,31,0.30)",
  },
  failed: {
    wash: ["rgba(239,68,68,0.26)", "rgba(239,68,68,0.07)"],
    disc: huddleColors.validationRed,
    discInk: "#FFFFFF",
    shadow: "rgba(239,68,68,0.28)",
  },
};

const TONE_ICON: Record<NativeToastTone, keyof typeof Feather.glyphMap> = {
  done: "check",
  system: "info",
  limit: "alert-triangle",
  failed: "x",
};

type NativeToastProps = {
  /** Legacy call sites pass the old single string; it resolves to the new copy. */
  message?: string;
  /** New call sites can pass resolved content directly. */
  content?: NativeToastContent;
  onDismiss?: () => void;
  /** Retained for backwards compatibility; every toast now shares one lifetime. */
  holdToPause?: boolean;
  /** Retained for backwards compatibility — tone now drives the icon. */
  icon?: "check" | "info";
  /** RootNavigator alone renders the window-level rail. */
  windowLevel?: boolean;
};

// "huddle" is always lower case and always bold, wherever it appears.
function ToastText({ style, value }: { style: object; value: string }) {
  const parts = value.split(/(huddle)/gi);
  return (
    <Text style={style}>
      {parts.map((part, index) => (
        part.toLowerCase() === "huddle"
          ? <Text key={index} style={styles.brand}>huddle</Text>
          : part
      ))}
    </Text>
  );
}

function NativeToastRelay({ content, message, onDismiss, holdToPause = false }: NativeToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const id = showNativeWindowToast({
      content,
      holdToPause,
      message,
      onDismiss: () => onDismissRef.current?.(),
    });
    return () => hideNativeWindowToast(id);
  }, [content, holdToPause, message]);

  return null;
}

export function NativeToast(props: NativeToastProps) {
  if (!props.windowLevel) return <NativeToastRelay {...props} />;
  return <NativeToastView {...props} />;
}

function NativeToastView({ content, holdToPause = false, message, onDismiss }: NativeToastProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const resolved = content ?? resolveToastCopy(message ?? "");
  const tint = nativeToastTints[resolved.tone];

  const translateY = useSharedValue(reduceMotion ? 0 : -120);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const progress = useSharedValue(1);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissDeadlineRef = useRef(0);
  const dismissRemainingRef = useRef(NATIVE_TOAST_DURATION_MS);

  const clearDismissTimer = () => {
    if (!dismissTimerRef.current) return;
    clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
  };

  const armDismissTimer = (duration: number) => {
    clearDismissTimer();
    if (!onDismiss) return;
    const safeDuration = Math.max(0, duration);
    dismissRemainingRef.current = safeDuration;
    dismissDeadlineRef.current = Date.now() + safeDuration;
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      onDismiss();
    }, safeDuration);
  };

  useEffect(() => {
    translateY.value = reduceMotion ? 0 : withSpring(0, { damping: 18, stiffness: 190 });
    opacity.value = withTiming(1, { duration: reduceMotion ? 120 : 200 });
    progress.value = 1;
    progress.value = withTiming(0, { duration: NATIVE_TOAST_DURATION_MS });
    armDismissTimer(NATIVE_TOAST_DURATION_MS);
    return () => {
      clearDismissTimer();
      cancelAnimation(progress);
    };
  // The toast intentionally restarts only when its message changes. Callback
  // identity changes must not reset the visible countdown.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity, progress, reduceMotion, translateY, resolved.headline]);

  const dismiss = () => { onDismiss?.(); };

  const pauseDismissal = () => {
    if (!holdToPause || !dismissTimerRef.current) return;
    dismissRemainingRef.current = Math.max(0, dismissDeadlineRef.current - Date.now());
    clearDismissTimer();
    cancelAnimation(progress);
  };

  const resumeDismissal = () => {
    if (!holdToPause || dismissTimerRef.current || dismissRemainingRef.current <= 0) return;
    progress.value = withTiming(0, { duration: dismissRemainingRef.current });
    armDismissTimer(dismissRemainingRef.current);
  };

  // Swipe up to dismiss early. Without an onDismiss the toast is display-only.
  const swipeUp = Gesture.Pan()
    .enabled(Boolean(onDismiss))
    .onUpdate((event) => {
      if (event.translationY < 0) translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY < -40) {
        translateY.value = withTiming(-140, { duration: 160 });
        opacity.value = withTiming(0, { duration: 160 }, (finished) => {
          if (finished) runOnJS(dismiss)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 190 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!resolved.headline) return null;

  return (
    <>
      {/* The veil is what gives the tint something to sit against — without it
          the glass washes out on huddle's white canvas. */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(180)}
        pointerEvents="none"
        style={styles.scrim}
      />
      <View pointerEvents="box-none" style={[styles.railClip, { top: insets.top }]}>
      <GestureDetector gesture={swipeUp}>
        <Animated.View
          exiting={FadeOut.duration(180)}
          pointerEvents="box-none"
          style={[styles.rail, cardStyle]}
        >
          <Pressable
            accessibilityHint={onDismiss ? "Swipe up or tap to dismiss" : undefined}
            accessibilityLabel={`${resolved.headline}${resolved.copy ? `. ${resolved.copy}` : ""}`}
             accessibilityRole={onDismiss ? "button" : "alert"}
             onPress={onDismiss}
             onPressIn={pauseDismissal}
             onPressOut={resumeDismissal}
             style={[styles.card, { shadowColor: tint.shadow }]}
          >
            <BlurView
              blurAmount={huddleFeedbackGlass.blurAmount}
              blurType="light"
              pointerEvents="none"
              reducedTransparencyFallbackColor={huddleFeedbackGlass.reducedTransparencyFallbackColor}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.base} />
            <LinearGradient
              colors={tint.wash}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            {/* specular highlight along the top edge */}
            <LinearGradient
              colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.95)", "rgba(255,255,255,0)"]}
              end={{ x: 1, y: 0 }}
              pointerEvents="none"
              start={{ x: 0, y: 0 }}
              style={styles.specular}
            />
            <View style={[styles.disc, { backgroundColor: tint.disc }]}>
              <Feather color={tint.discInk} name={TONE_ICON[resolved.tone]} size={21} />
            </View>
            <View style={styles.text}>
              <ToastText style={styles.headline} value={resolved.headline} />
              {resolved.copy ? <ToastText style={styles.copy} value={resolved.copy} /> : null}
            </View>
            {/* Time left before it leaves. Always brand blue — the bar times the
                card, it does not restate the tone the tint already carries. */}
            <View pointerEvents="none" style={styles.barTrack} />
            <Animated.View style={[styles.bar, barStyle]} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
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
    alignItems: "flex-start",
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    overflow: "hidden",
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: 17,
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
  },
  disc: {
    alignItems: "center",
    flexShrink: 0,
    borderColor: "rgba(255,255,255,0.70)",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  text: {
    alignSelf: "center",
    flex: 1,
    gap: 3,
    justifyContent: "center",
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  headline: {
    color: "#1C2135",
    fontFamily: "Urbanist-800",
    fontSize: 16,
    letterSpacing: -0.25,
    lineHeight: 19,
  },
  copy: {
    color: "rgba(48,54,80,0.78)",
    fontFamily: "Urbanist-600",
    fontSize: 12.5,
    lineHeight: 17,
  },
  barTrack: {
    backgroundColor: "rgba(28,33,53,0.07)",
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
  },
  bar: {
    backgroundColor: huddleColors.blue,
    borderBottomRightRadius: 999,
    borderTopRightRadius: 999,
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
  },
  brand: {
    fontFamily: "Urbanist-800",
  },
});
