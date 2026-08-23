import { useState } from "react";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import huddleVideoFallback from "../../assets/huddle-video-fallback-transparent.png";
import huddleVideo from "../../assets/huddle-video.mp4";

type LogoBounds = { x: number; y: number; width: number; height: number };

const FALLBACK_LOGO_BOUNDS: LogoBounds = {
  x: 306 / 1255,
  y: 485 / 1856,
  width: (949 - 306 + 1) / 1255,
  height: (1373 - 485 + 1) / 1856,
};
const VIDEO_LOGO_BOUNDS: LogoBounds = {
  x: 193 / 809,
  y: 311 / 1200,
  width: (614 - 193 + 1) / 809,
  height: (888 - 311 + 1) / 1200,
};
const TARGET_LOGO_BOUNDS = VIDEO_LOGO_BOUNDS;

type NativeBrandMediaProps = {
  size?: number;
  windowHeight?: number;
  style?: StyleProp<ViewStyle>;
  /** Override the default video/fallback assets (e.g. a tighter-cropped brand mark). */
  videoSource?: VideoSource;
  fallbackSource?: ImageSourcePropType;
  /** Shared crop bounds for both videoSource and fallbackSource when they share one framing. */
  bounds?: LogoBounds;
  /** Skip the video entirely and always render the static fallback (e.g. while the video asset lacks alpha transparency). */
  disableVideo?: boolean;
};

export function NativeBrandMedia({
  size = 160,
  windowHeight = 132,
  style,
  videoSource = huddleVideo,
  fallbackSource = huddleVideoFallback,
  bounds,
  disableVideo = false,
}: NativeBrandMediaProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const player = useVideoPlayer(videoSource, (nextPlayer) => {
    nextPlayer.audioMixingMode = "mixWithOthers";
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    nextPlayer.timeUpdateEventInterval = 0.1;
    nextPlayer.play();
  });

  useEventListener(player, "statusChange", ({ status, error }) => {
    if (status === "error" || error) {
      setVideoFailed(true);
      setVideoReady(false);
      setVideoFrameReady(false);
    }
  });
  useEventListener(player, "sourceLoad", () => {
    setVideoFailed(false);
    setVideoReady(true);
    setVideoFrameReady(false);
    player.play();
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime > 0) setVideoFrameReady(true);
  });

  const targetBounds = bounds ?? TARGET_LOGO_BOUNDS;
  const fallbackBounds = bounds ?? FALLBACK_LOGO_BOUNDS;
  const videoBounds = bounds ?? VIDEO_LOGO_BOUNDS;
  const logoFrameWidth = size * targetBounds.width;
  const logoFrameHeight = size * targetBounds.height;
  const logoFrameStyle = {
    width: logoFrameWidth,
    height: logoFrameHeight,
    left: size * targetBounds.x,
    top: (windowHeight - size) / 2 + size * targetBounds.y,
  };
  const fallbackLayerStyle = resolveMediaLayerStyle(logoFrameWidth, logoFrameHeight, fallbackBounds);
  const videoLayerStyle = resolveMediaLayerStyle(logoFrameWidth, logoFrameHeight, videoBounds);

  return (
    <View style={[styles.window, { width: size, height: windowHeight }, style]}>
      <View pointerEvents="none" style={[styles.logoFrame, logoFrameStyle]}>
        <Image source={fallbackSource} resizeMode="contain" style={[styles.mediaLayer, fallbackLayerStyle]} />
      </View>
      {!disableVideo && videoReady && !videoFailed ? (
        <View pointerEvents="none" style={[styles.logoFrame, logoFrameStyle, videoFrameReady ? null : styles.videoLoading]}>
          <VideoView player={player} nativeControls={false} fullscreenOptions={{ enable: false }} contentFit="contain" style={[styles.mediaLayer, videoLayerStyle]} />
        </View>
      ) : null}
    </View>
  );
}

function resolveMediaLayerStyle(
  frameWidth: number,
  frameHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const mediaWidth = frameWidth / bounds.width;
  const mediaHeight = frameHeight / bounds.height;
  return {
    position: "absolute" as const,
    width: mediaWidth,
    height: mediaHeight,
    left: (frameWidth - mediaWidth * bounds.width) / 2 - mediaWidth * bounds.x,
    top: (frameHeight - mediaHeight * bounds.height) / 2 - mediaHeight * bounds.y,
  };
}

const styles = StyleSheet.create({
  window: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoFrame: {
    position: "absolute",
    overflow: "hidden",
  },
  mediaLayer: {},
  videoLoading: {
    opacity: 0,
  },
});
