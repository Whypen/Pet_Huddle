import { useCallback, useEffect, useRef, useState } from "react";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, runOnJS } from "react-native-reanimated";
import openingVideo from "../../assets/Opening/open.mp4";
import brandLogoVideo from "../../assets/APP/brandlogo.mp4";
import caption1 from "../../assets/Opening/1.png";
import caption2 from "../../assets/Opening/2.png";
import caption3 from "../../assets/Opening/3.png";
import caption4 from "../../assets/Opening/4.png";
import { markNativeOpeningIntroSeen } from "../lib/nativeOpeningIntro";
import { huddleColors, huddleMotion, huddleRadii, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Captions must share one *letter* size, which is not the same as sharing one
// canvas scale. Measured from the exports: 1.png's "community" line is 181px
// tall while 2.png's "locations" is 151px and 3.png's "connections" 157px, so
// the first card's type is roughly 20% larger at source. Scaling every canvas
// by the same factor therefore shrank cards 2-4 — most visibly on 4.png, whose
// canvas is also the narrowest.
//
// sizeCorrection normalises each card to 1.png's letter height. Cards 2 and 3
// share a value because their shared line ("real-time" h=157 / "real-life"
// h=155) already matches — that pairing carries the wordplay and must never
// drift.
//
// The widest corrected card then sets the on-screen ceiling, so equalising the
// type can never push a long line past the safe width.
const CAPTION_MAX_SCREEN_RATIO = 0.7;

type OpeningCaptionSpec = {
  end: number;
  height: number;
  /** Pins the card to a fixed share of screen width, ignoring letter matching. */
  screenWidthRatio?: number;
  sizeCorrection: number;
  source: number;
  start: number;
  width: number;
};

const CAPTIONS: OpeningCaptionSpec[] = [
  { source: caption1, width: 986, height: 610, sizeCorrection: 1, start: 0, end: 1.9 },
  { source: caption2, width: 889, height: 574, sizeCorrection: 1.16, start: 2.1, end: 3.8 },
  { source: caption3, width: 1029, height: 573, sizeCorrection: 1.16, start: 4, end: 6.7 },
  // Pinned to 65% of the screen by request. Its letters therefore run larger
  // than the other three rather than matching them.
  { source: caption4, width: 771, height: 653, sizeCorrection: 1.05, screenWidthRatio: 0.65, start: 6.8, end: 10 },
];

// Pinned cards are excluded: they cannot overflow, and letting one drive the
// ceiling would shrink the cards that are still being matched to each other.
const WIDEST_CORRECTED_CAPTION = Math.max(
  ...CAPTIONS.filter((caption) => caption.screenWidthRatio === undefined).map((caption) => caption.width * caption.sizeCorrection),
);

function OpeningCaption({
  active,
  height,
  reduceMotion,
  source,
  width,
}: {
  active: boolean;
  height: number;
  reduceMotion: boolean;
  source: number;
  width: number;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: reduceMotion ? 0 : huddleMotion.durations.base,
      easing: Easing.bezier(...huddleMotion.easings.out),
    });
  }, [active, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View pointerEvents="none" style={[styles.caption, animatedStyle]}>
      <Image accessibilityIgnoresInvertColors resizeMode="contain" source={source} style={{ width, height }} />
    </Reanimated.View>
  );
}

export function NativeOpeningIntroScreen({ onFinish }: { onFinish: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const skipOpacity = useSharedValue(0);
  const [currentTime, setCurrentTime] = useState(0);
  const finishingRef = useRef(false);
  const whiteOpacity = useSharedValue(0);

  const player = useVideoPlayer(openingVideo, (nextPlayer) => {
    // mixWithOthers matches NativeBrandMedia: the file carries no audio track,
    // and this guarantees the session is never taken from whatever the user is
    // already listening to.
    nextPlayer.audioMixingMode = "mixWithOthers";
    nextPlayer.loop = false;
    nextPlayer.muted = true;
    nextPlayer.timeUpdateEventInterval = 0.1;
    nextPlayer.play();
  });

  // Warms the auth screen's brand mark. Opening a player fetches the asset and
  // initialises its decoder while the film runs, so NativeBrandMedia finds a
  // local, ready file the instant auth mounts. It is paused and never given a
  // VideoView: nothing loops behind the film, and nothing can leak through the
  // fade — which is what mounting the auth screen underneath would have caused.
  useVideoPlayer(brandLogoVideo, (warmup) => {
    warmup.audioMixingMode = "mixWithOthers";
    warmup.muted = true;
    warmup.pause();
  });

  // Held back past the first card so the opening frame stays clean.
  useEffect(() => {
    skipOpacity.value = withDelay(
      reduceMotion ? 0 : 1600,
      withTiming(1, { duration: reduceMotion ? 0 : huddleMotion.durations.enter, easing: Easing.bezier(...huddleMotion.easings.out) }),
    );
  }, [reduceMotion, skipOpacity]);

  // Marked on mount, not on finish: killing the app mid-film still counts as
  // seen, so the opening can never greet the same install twice.
  useEffect(() => {
    void markNativeOpeningIntroSeen();
  }, []);

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    whiteOpacity.value = withTiming(
      1,
      { duration: reduceMotion ? 0 : huddleMotion.durations.slow, easing: Easing.bezier(...huddleMotion.easings.out) },
      (done) => {
        if (done) runOnJS(onFinish)();
      },
    );
  }, [onFinish, reduceMotion, whiteOpacity]);

  useEventListener(player, "timeUpdate", ({ currentTime: time }) => setCurrentTime(time));
  useEventListener(player, "playToEnd", () => finish());
  useEventListener(player, "statusChange", ({ status, error }) => {
    // A film that cannot play must never block the door to the app. Bundled in
    // release builds, so this only realistically fires in dev while Metro is
    // still serving the asset.
    if (status === "error" || error) finish();
  });

  const whiteStyle = useAnimatedStyle(() => ({ opacity: whiteOpacity.value }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: skipOpacity.value }));
  const scale = (width * CAPTION_MAX_SCREEN_RATIO) / WIDEST_CORRECTED_CAPTION;
  const captionWidth = (caption: OpeningCaptionSpec) => (
    caption.screenWidthRatio !== undefined
      ? width * caption.screenWidthRatio
      : caption.width * caption.sizeCorrection * scale
  );

  return (
    <View style={styles.root}>
      <VideoView
        contentFit="cover"
        fullscreenOptions={{ enable: false }}
        nativeControls={false}
        player={player}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" style={styles.captionLayer}>
        {CAPTIONS.map((caption, index) => (
          <OpeningCaption
            active={currentTime >= caption.start && currentTime < caption.end}
            height={captionWidth(caption) * (caption.height / caption.width)}
            key={index}
            reduceMotion={reduceMotion}
            source={caption.source}
            width={captionWidth(caption)}
          />
        ))}
      </View>

      {/* Tappable from the first frame — nobody gets held in an intro. */}
      <Pressable accessibilityLabel="Skip intro" accessibilityRole="button" onPress={finish} style={StyleSheet.absoluteFill} />

      {/* The full-screen tap is invisible on its own, so this makes it explicit.
          Carries its own scrim because the film runs bright — sky, grass, pale
          pavement — where plain white type would disappear. */}
      <Reanimated.View
        pointerEvents="none"
        style={[styles.skip, { bottom: insets.bottom + huddleSpacing.x5 }, skipStyle]}
      >
        <Text style={styles.skipLabel}>Skip</Text>
      </Reanimated.View>

      <Reanimated.View pointerEvents="none" style={[styles.white, whiteStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.canvas,
    zIndex: 12000,
    elevation: 12000,
  },
  captionLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  skip: {
    position: "absolute",
    right: huddleSpacing.x5,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x1,
    borderRadius: huddleRadii.pill,
    backgroundColor: "rgba(8,10,20,0.28)",
  },
  skipLabel: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  white: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.canvas,
  },
});
