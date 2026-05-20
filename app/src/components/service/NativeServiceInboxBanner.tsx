import Feather from "@expo/vector-icons/Feather";
import { AppState } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { fetchNativeChatInbox, type NativeChatInboxRow } from "../../lib/nativeChat";
import { haptic } from "../../lib/nativeHaptics";
import { createSingleRealtimeChannel } from "../../lib/realtimeChannelManager";

// Animated background — orb stays static, color zones drift in waves over 6s loop.
// Metro bundler resolves static assets via require() — eslint-disable matches the project convention.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SERVICE_BANNER_ORB = require("../../../assets/service-banner-orb.webp");

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
  const reduceMotion = useReducedMotion();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  if (!hydrated) return null;

  const activeRows = rows.filter((row) => row.serviceStatus && !TERMINAL_SERVICE_STATUSES.has(row.serviceStatus));
  const unreadCount = rows.reduce((sum, row) => sum + (row.unreadCount || 0), 0);
  const previewRows = (activeRows.length > 0 ? activeRows : rows).slice(0, 3);
  const statusBadge = serviceStatusBadge((activeRows[0] ?? rows[0])?.serviceStatus ?? null);

  const handlePress = () => {
    haptic.selectTab();
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
      {/* ─ Layer 0: Animated WebP — painted orb + drifting background ─ */}
      <ExpoImage
        cachePolicy="memory-disk"
        contentFit="cover"
        source={SERVICE_BANNER_ORB}
        style={StyleSheet.absoluteFill}
      />

      {/* ─ Layer 1: Glass-neu circle on top of the painted orb ─────── */}
      {/* Whisper-light dome hint: no backdrop blur (would mush the colors),
         no tint, no border — just a faint top-left highlight gradient suggesting
         a curved glass surface above the painted orb. The painted colors show through. */}
      <View pointerEvents="none" style={styles.glassOrbWrap}>
        <View style={styles.glassOrb}>
          {/* Top-left soft highlight only — the entire "glass" feel comes from this whisper */}
          <LinearGradient
            colors={["rgba(255, 255, 255, 0.12)", "rgba(255, 255, 255, 0)"]}
            end={{ x: 0.7, y: 0.7 }}
            pointerEvents="none"
            start={{ x: 0.1, y: 0.05 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>

      {/* ─ Layer 2: Top-right chevron affordance ─────────────────── */}
      <View pointerEvents="none" style={styles.chevronCorner}>
        <Feather color="rgba(255, 255, 255, 0.96)" name="arrow-up-right" size={16} />
      </View>

      {/* ─ Layer 3: Content (avatars + title + subtitle) ─────────── */}
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
                  <ExpoImage cachePolicy="memory-disk" transition={120} source={{ uri: row.peerAvatarUrl }} style={styles.avatar} />
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
    backgroundColor: "#E8A8AD", // fallback while the WebP loads
    marginBottom: TIGHT_GAP_PULL,
    ...huddleShadows.polaroidFrame,
  },
  pressed: {
    opacity: 0.94,
  },
  // ── Glass-neu circle ────────────────────────────────────────────
  glassOrbWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  glassOrb: {
    // Matches the painted orb in the WebP exactly:
    //   In source canvas (600x450): orb radius = 270, diameter = 540
    //   → 90% of canvas width / aspectRatio 1 makes a perfect circle
    //   The card crops top/bottom, same as the painted orb does in the WebP — perfect alignment.
    width: "90%",
    aspectRatio: 1,
    borderRadius: 999,
    overflow: "hidden",
    // No border — should blend seamlessly with the painted orb beneath
  },
  // ── Chevron corner ──────────────────────────────────────────────
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
