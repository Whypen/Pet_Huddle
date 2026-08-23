import Feather from "@expo/vector-icons/Feather";
import { useEventListener } from "expo";
import { AppState } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { fetchNativeChatInbox, type NativeChatInboxRow } from "../../lib/nativeChat";
import { writeNativeChatsInboxHandoff, writeNativeChatsLastTabHandoff } from "../../lib/nativeChatHandoff";
import { haptic } from "../../lib/nativeHaptics";
import { nativeFreshImageKey, nativeFreshImageUri } from "../../lib/nativeImageFreshness";
import { createSingleRealtimeChannel } from "../../lib/realtimeChannelManager";

// Metro bundler resolves static assets via require() — eslint-disable matches the project convention.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SERVICE_BANNER = require("../../../assets/service-banner.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SERVICE_BANNER_ORB = require("../../../assets/service-banner-orb.png");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SERVICE_BANNER_ORB_VIDEO = require("../../../assets/service-banner-orb.mp4");

const TERMINAL_SERVICE_STATUSES = new Set(["cancelled", "completed", "declined", "expired", "disputed"]);
const LIVE_SERVICE_STATUS = "in_progress";

type Props = {
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  onNavigate: (path: string) => void;
};

const SERVICE_INBOX_ROUTE = "/chats?tab=service";

export function NativeServiceInboxBanner({ userId, accessToken, sessionKey, onNavigate }: Props) {
  const [rows, setRows] = useState<NativeChatInboxRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const reduceMotion = useReducedMotion();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbPlayer = useVideoPlayer(SERVICE_BANNER_ORB_VIDEO, (player) => {
    player.audioMixingMode = "mixWithOthers";
    player.loop = true;
    player.muted = true;
    player.timeUpdateEventInterval = 0.1;
    player.play();
  });

  useEventListener(orbPlayer, "statusChange", ({ status, error }) => {
    if (status === "error" || error) {
      setVideoFailed(true);
      setVideoReady(false);
      setVideoFrameReady(false);
    }
  });
  useEventListener(orbPlayer, "sourceLoad", () => {
    setVideoFailed(false);
    setVideoReady(true);
    setVideoFrameReady(false);
  });
  useEventListener(orbPlayer, "timeUpdate", ({ currentTime }) => {
    if (currentTime > 0) setVideoFrameReady(true);
  });

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setHydrated(true);
      return;
    }
    let active = true;
    void fetchNativeChatInbox({
      userId,
      accessToken,
      sessionKey,
      scope: "service",
      onlyWithActivity: null,
      limit: 12,
      allowCacheHydration: true,
      onCacheHydration: (cached) => {
        if (active) {
          setRows(cached);
          setHydrated(true);
        }
      },
    })
      .then((data) => {
        if (active) {
          setRows(data);
          setHydrated(true);
        }
      })
      .catch(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [userId, accessToken, sessionKey]);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    const refreshRows = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void fetchNativeChatInbox({
          userId,
          accessToken,
          sessionKey,
          scope: "service",
          onlyWithActivity: null,
          limit: 12,
          force: true,
          forceDb: true,
        })
          .then((data) => {
            if (!active) return;
            setRows(data);
            setHydrated(true);
          })
          .catch(() => {
            if (!active) return;
            setHydrated(true);
          });
      }, 450);
    };

    const channelName = `native-service-inbox-banner-realtime-${userId}`;
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `user_id=eq.${userId}` }, refreshRows)
        .on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `requester_id=eq.${userId}` }, refreshRows)
        .on("postgres_changes", { event: "*", schema: "public", table: "service_chats", filter: `provider_id=eq.${userId}` }, refreshRows));

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshRows();
    });

    return () => {
      active = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      subscription.remove();
      void handle.dispose();
    };
  }, [accessToken, sessionKey, userId]);

  // Live pulse — fires when any service is in_progress
  const livePulse = useSharedValue(0);
  const hasLive = rows.some((row) => row.serviceStatus === LIVE_SERVICE_STATUS);
  useEffect(() => {
    if (reduceMotion || !hasLive) {
      livePulse.value = 0;
      return;
    }
    livePulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [hasLive, livePulse, reduceMotion]);
  const livePulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + livePulse.value * 0.45,
    transform: [{ scale: 0.85 + livePulse.value * 0.3 }],
  }));

  const backgroundPulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      backgroundPulse.value = 0;
      return;
    }
    backgroundPulse.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [backgroundPulse, reduceMotion]);
  const backgroundOrbStyle = useAnimatedStyle(() => ({
    opacity: interpolate(backgroundPulse.value, [0, 1], [0.12, 0.24]),
    transform: [{ scale: interpolate(backgroundPulse.value, [0, 1], [1, 1.2]) }],
  }));

  if (!hydrated) {
    return (
      <View
        accessibilityLabel="Loading care chats"
        accessibilityRole="progressbar"
        style={[styles.card, styles.skeletonCard]}
      >
        <View style={styles.skeletonGlow} />
        <View style={styles.skeletonLineWide} />
        <View style={styles.skeletonLineNarrow} />
      </View>
    );
  }

  const activeRows = rows.filter((row) => row.serviceStatus && !TERMINAL_SERVICE_STATUSES.has(row.serviceStatus));
  const hasActiveChats = activeRows.length > 0;
  const unreadCount = rows.reduce((sum, row) => sum + (row.unreadCount || 0), 0);
  const previewRows = (activeRows.length > 0 ? activeRows : rows).slice(0, 3);
  const statusBadge = serviceStatusBadge((activeRows[0] ?? rows[0])?.serviceStatus ?? null);

  const handlePress = () => {
    haptic.selectTab();
    writeNativeChatsLastTabHandoff({ sessionKey, tab: "service", userId });
    writeNativeChatsInboxHandoff({ rows, sessionKey, tab: "service", userId });
    onNavigate(SERVICE_INBOX_ROUTE);
  };

  const subtitle =
    rows.length === 0
      ? "Tap to start"
      : unreadCount > 0
        ? `${unreadCount} unread`
        : activeRows.length > 0
          ? `${activeRows.length} active`
          : `${rows.length} chats`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open care chats. ${subtitle}`}
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <ExpoImage
        cachePolicy="memory-disk"
        contentFit="cover"
        source={hasActiveChats ? SERVICE_BANNER_ORB : SERVICE_BANNER}
        style={StyleSheet.absoluteFill}
      />

      {hasActiveChats && videoReady && !videoFailed ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, videoFrameReady ? null : styles.videoLoading]}>
          <VideoView
            contentFit="cover"
            fullscreenOptions={{ enable: false }}
            nativeControls={false}
            player={orbPlayer}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      {hasActiveChats ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.backgroundOrb, backgroundOrbStyle]} />
          <View pointerEvents="none" style={styles.grainOverlay} />
        </>
      ) : null}

      <View pointerEvents="none" style={styles.chevronCorner}>
        <Feather color="rgba(255, 255, 255, 0.96)" name="arrow-up-right" size={16} />
      </View>

      {hasActiveChats ? (
        <View style={styles.body}>
          {previewRows.length > 0 ? (
            <View style={styles.avatarStack}>
              {previewRows.map((row, index) => (
                <View
                  key={row.chatId}
                  style={[
                    styles.avatarRing,
                    { marginLeft: index === 0 ? 0 : -10, zIndex: previewRows.length - index },
                  ]}
                >
                  {row.peerAvatarUrl ? (
                    <ExpoImage cachePolicy="memory-disk" key={nativeFreshImageKey(row.peerAvatarUrl, row.peerAvatarUrl)} transition={120} source={{ uri: nativeFreshImageUri(row.peerAvatarUrl, row.peerAvatarUrl) }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{(row.peerName || "?").slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyIconWrap}>
              <Feather color={huddleColors.onPrimary} name="message-circle" size={20} />
            </View>
          )}

          <Text numberOfLines={1} style={styles.title}>Care chats</Text>

          <View style={styles.statusLine}>
            {statusBadge ? (
              <View style={styles.statusBadge}>
                <Text numberOfLines={1} style={[styles.statusBadgeText, statusBadge.textStyle]}>{statusBadge.label}</Text>
              </View>
            ) : null}
            {statusBadge ? (
              hasLive ? <Animated.View style={[styles.livePulseDot, livePulseStyle]} /> : <View style={styles.livePulseDot} />
            ) : null}
            <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const AVATAR_SIZE = 30;
// Pull next sibling up so the gap below = horizontal column gap (huddleSpacing.x3 = 12)
const TIGHT_GAP_PULL = -(34 - huddleSpacing.x3);

const serviceStatusBadge = (status: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "booked") return { label: "Booked", textStyle: styles.statusBadgeTextBlue };
  if (normalized === "in_progress") return { label: "Care in progress", textStyle: styles.statusBadgeTextBlue };
  return null;
};

const styles = StyleSheet.create({
  card: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: huddleRadii.card,
    paddingVertical: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#FF8F66",
    marginBottom: TIGHT_GAP_PULL,
    ...huddleShadows.polaroidFrame,
  },
  pressed: {
    opacity: 0.94,
  },
  skeletonCard: {
    backgroundColor: "#F2F7FF",
  },
  skeletonGlow: {
    position: "absolute",
    top: "18%",
    left: "10%",
    right: "10%",
    height: "52%",
    borderRadius: huddleRadii.card,
    backgroundColor: "rgba(255, 255, 255, 0.54)",
  },
  skeletonLineWide: {
    width: "58%",
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(33, 69, 207, 0.10)",
    marginBottom: huddleSpacing.x2,
  },
  skeletonLineNarrow: {
    width: "38%",
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(33, 69, 207, 0.08)",
  },
  backgroundOrb: {
    position: "absolute",
    width: "80%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.48)",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.018)",
  },
  videoLoading: {
    opacity: 0,
  },
  chevronCorner: {
    position: "absolute",
    top: huddleSpacing.x2,
    right: huddleSpacing.x2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── Content ─────────────────────────────────────────────────────
  body: {
    alignItems: "center",
    gap: 6,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: huddleColors.onPrimary,
    padding: 2,
  },
  avatar: {
    width: AVATAR_SIZE - 4,
    height: AVATAR_SIZE - 4,
    borderRadius: (AVATAR_SIZE - 4) / 2,
    backgroundColor: huddleColors.mutedCanvas,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blue,
  },
  avatarInitial: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: 12,
  },
  emptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.32)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  // White text with dark soft shadow so it stays legible over the glass + painted orb beneath
  title: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    textShadowColor: "rgba(60, 35, 60, 0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusBadge: {
    minHeight: 22,
    maxWidth: "88%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    backgroundColor: huddleColors.matchComposerGlass,
  },
  statusBadgeText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
  },
  statusBadgeTextBlue: {
    color: huddleColors.blue,
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.95)",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    textShadowColor: "rgba(60, 35, 60, 0.40)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: huddleColors.onPrimary,
  },
});
