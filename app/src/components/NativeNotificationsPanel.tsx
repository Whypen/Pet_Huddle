import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import emptyNotificationsImage from "../../assets/Notifications/empty-chat-native.png";
import { NativeSpinner } from "./NativeSpinner";
import { NativeToast, NATIVE_TOAST_DURATION_MS } from "./NativeToast";
import {
  huddleColors,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";
import {
  fetchNativeNotificationsWithToken,
  markAllNativeNotificationsReadWithToken,
  NativeNotificationRow,
  notificationDestinationPath,
  notificationHubText,
  notificationTimeAgo,
  readCachedNativeNotifications,
  writeNativeNotificationsCache,
  writeNativeUnreadNotificationCountCache,
} from "../lib/nativeNotifications";
import { haptic } from "../lib/nativeHaptics";
import { requestAppReview, type AppReviewTrigger } from "../lib/nativeAppReview";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";

type NativeNotificationsPanelProps = {
  open: boolean;
  accessToken?: string | null;
  sessionKey?: string | null;
  userId: string | null;
  onClose: () => void;
  onMarkedRead: () => void;
  onNavigate: (path: string) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Map an opened notification to a review a-ha moment (aggregated social love /
// community support on your alert). Returns null for everything else.
const appReviewTriggerForNotification = (row: NativeNotificationRow): AppReviewTrigger | null => {
  const meta = { ...(row.metadata || {}), ...(row.data || {}) };
  const kind = String(meta.kind || row.type || "").toLowerCase();
  if (kind === "like") return "social_likes_milestone";
  if (kind === "alert_like") return "alert_community_support";
  return null;
};
// Off-screen travel for the closed drawer (safe upper bound for any phone width).
const DRAWER_TRAVEL = Math.round(Dimensions.get("window").width * 0.92);
const DRAWER_SPRING = { damping: 22, stiffness: 240, mass: 0.7 } as const;

export function NativeNotificationsPanel({ open, accessToken, sessionKey, userId, onClose, onMarkedRead, onNavigate }: NativeNotificationsPanelProps) {
  const [rows, setRows] = useState<NativeNotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const panelOpenGenerationRef = useRef(0);
  const openRef = useRef(open);
  const onMarkedReadRef = useRef(onMarkedRead);
  const onNavigateRef = useRef(onNavigate);
  const pendingNavigationPathRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);
  const markReadInFlightKeyRef = useRef<string | null>(null);
  const markReadInFlightUserRef = useRef<string | null>(null);
  const lastMarkedReadKeyRef = useRef<string | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadInFlightKeyRef = useRef<string | null>(null);
  const panelSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const currentPanelSessionKey = sessionKey || (userId ? `${userId}:0` : "anon:0");
  panelSessionKeyRef.current = currentPanelSessionKey;
  onMarkedReadRef.current = onMarkedRead;
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    openRef.current = open;
    if (open && !wasOpenRef.current) {
      panelOpenGenerationRef.current += 1;
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!statusMessage) return;
    const visibleMessage = statusMessage;
    const timer = setTimeout(() => {
      setStatusMessage((current) => current === visibleMessage ? null : current);
    }, NATIVE_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const markReadAfterRowsKnown = useCallback(async () => {
    if (!openRef.current || !userId) return;
    if (!accessToken) return;
    const markReadKey = `${userId}:${currentPanelSessionKey}:${panelOpenGenerationRef.current}`;
    if (lastMarkedReadKeyRef.current === markReadKey || markReadInFlightUserRef.current === `${userId}:${currentPanelSessionKey}`) return;
    markReadInFlightKeyRef.current = markReadKey;
    markReadInFlightUserRef.current = `${userId}:${currentPanelSessionKey}`;
    try {
      await markAllNativeNotificationsReadWithToken(userId, accessToken);
      if (!openRef.current || markReadInFlightKeyRef.current !== markReadKey || panelSessionKeyRef.current !== currentPanelSessionKey) return;
      lastMarkedReadKeyRef.current = markReadKey;
      setRows((currentRows) => {
        const readRows = currentRows.map((row) => ({ ...row, read: true }));
        void writeNativeNotificationsCache(userId, readRows, { sessionKey: currentPanelSessionKey });
        void writeNativeUnreadNotificationCountCache(userId, 0, { sessionKey: currentPanelSessionKey });
        return readRows;
      });
      onMarkedReadRef.current();
    } catch {
      if (openRef.current && markReadInFlightKeyRef.current === markReadKey && panelSessionKeyRef.current === currentPanelSessionKey) {
        setStatusMessage("Notifications are visible, but read status could not sync.");
      }
    } finally {
      if (markReadInFlightKeyRef.current === markReadKey) {
        markReadInFlightKeyRef.current = null;
        markReadInFlightUserRef.current = null;
      }
    }
  }, [accessToken, currentPanelSessionKey, userId]);

  const loadRows = useCallback(async () => {
    if (!userId) {
      return;
    }
    const requestSessionKey = currentPanelSessionKey;
    const requestKey = `${userId}:${requestSessionKey}`;
    if (loadInFlightKeyRef.current === requestKey) return;
    loadInFlightKeyRef.current = requestKey;
    const cachedRows = await readCachedNativeNotifications(userId, { sessionKey: requestSessionKey });
    if (panelSessionKeyRef.current !== requestSessionKey) {
      if (loadInFlightKeyRef.current === requestKey) loadInFlightKeyRef.current = null;
      return;
    }
    if (cachedRows) setRows(cachedRows);
    setLoading(!cachedRows);
    setStatusMessage(null);
    try {
      if (!accessToken) throw new Error("notifications_access_token_required");
      const nextRows = await fetchNativeNotificationsWithToken(userId, accessToken, 80, {
        sessionKey: requestSessionKey,
        cacheWriteGuard: () => panelSessionKeyRef.current === requestSessionKey,
      });
      if (panelSessionKeyRef.current !== requestSessionKey) return;
      setRows(nextRows);
      await markReadAfterRowsKnown();
    } catch {
      if (panelSessionKeyRef.current === requestSessionKey) setStatusMessage("We couldn't load notifications. Pull back in a moment.");
    } finally {
      if (loadInFlightKeyRef.current === requestKey) loadInFlightKeyRef.current = null;
      if (panelSessionKeyRef.current === requestSessionKey) setLoading(false);
    }
  }, [accessToken, currentPanelSessionKey, markReadAfterRowsKnown, userId]);

  useEffect(() => {
    if (!open) return;
    void loadRows();
  }, [loadRows, open]);

  useEffect(() => {
    if (!open || !userId) return;
    const requestSessionKey = currentPanelSessionKey;
    const refresh = () => {
      if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        if (openRef.current && panelSessionKeyRef.current === requestSessionKey) void loadRows();
      }, 450);
    };
    const handle = createSingleRealtimeChannel(`native-notifications-panel-${userId}`, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        refresh,
      ));
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      void handle.dispose();
    };
  }, [currentPanelSessionKey, loadRows, open, userId]);

  const todayRows = useMemo(() => rows.slice(0, 80), [rows]);

  // Proper left-drawer: slides in from the left, interactive swipe-left-to-close,
  // tap-backdrop / X to close. Stays mounted through the close animation via
  // `rendered`, then unmounts.
  const [rendered, setRendered] = useState(open);
  const reduceMotion = useReducedMotion();
  const translateX = useSharedValue(-DRAWER_TRAVEL);
  const backdropOpacity = useSharedValue(0);
  const panelWidth = useSharedValue(DRAWER_TRAVEL);

  useEffect(() => {
    if (open || rendered) return;
    const path = pendingNavigationPathRef.current;
    if (!path) return;
    pendingNavigationPathRef.current = null;
    // `rendered=false` commits the native notification Modal removal. Wait one
    // frame before routing so alert details never present underneath a closing
    // native Modal (the fast, cached A -> B path used to hit this race).
    const frame = requestAnimationFrame(() => onNavigateRef.current(path));
    return () => cancelAnimationFrame(frame);
  }, [open, rendered]);

  const animateIn = useCallback(() => {
    if (reduceMotion) {
      translateX.value = 0;
      backdropOpacity.value = 1;
      return;
    }
    translateX.value = withSpring(0, DRAWER_SPRING);
    backdropOpacity.value = withTiming(1, { duration: 180 });
  }, [backdropOpacity, reduceMotion, translateX]);

  const animateOutAndUnmount = useCallback(() => {
    const closedX = -(panelWidth.value || DRAWER_TRAVEL);
    backdropOpacity.value = withTiming(0, { duration: 160 });
    if (reduceMotion) {
      translateX.value = closedX;
      setRendered(false);
      return;
    }
    translateX.value = withTiming(closedX, { duration: 210 }, (finished) => {
      if (finished) runOnJS(setRendered)(false);
    });
  }, [backdropOpacity, panelWidth, reduceMotion, translateX]);

  useEffect(() => {
    if (open) {
      pendingNavigationPathRef.current = null;
      setRendered(true);
      requestAnimationFrame(animateIn);
    } else if (rendered) {
      animateOutAndUnmount();
    }
  }, [animateIn, animateOutAndUnmount, open, rendered]);

  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-12) // engage only on a leftward drag
        .failOffsetY([-16, 16]) // yield to the notifications list scroll
        .onChange((event) => {
          "worklet";
          const next = Math.min(0, event.translationX);
          translateX.value = next;
          backdropOpacity.value = Math.max(0, 1 + next / (panelWidth.value || DRAWER_TRAVEL));
        })
        .onEnd((event) => {
          "worklet";
          if (event.translationX < -70 || event.velocityX < -550) {
            runOnJS(onClose)();
          } else {
            translateX.value = withSpring(0, DRAWER_SPRING);
            backdropOpacity.value = withTiming(1, { duration: 160 });
          }
        }),
    [backdropOpacity, onClose, panelWidth, translateX],
  );

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!rendered) return null;

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={rendered}>
      <View style={styles.root}>
        <AnimatedPressable
          accessibilityLabel="Close notifications"
          accessibilityRole="button"
          onPress={onClose}
          style={[styles.backdrop, backdropStyle]}
        />
        <GestureDetector gesture={closeGesture}>
          <Animated.View
            onLayout={(event) => { panelWidth.value = event.nativeEvent.layout.width; }}
            style={[styles.panel, panelStyle]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Notifications</Text>
              <Pressable accessibilityLabel="Close" hitSlop={huddleSpacing.x2} onPress={onClose} style={styles.closeButton}>
                <Feather color={huddleColors.iconMuted} name="x" size={22} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loading}>
                <NativeSpinner tone="accent" size="md" />
              </View>
            ) : null}
            {!loading && todayRows.length === 0 ? (
              <View style={styles.empty}>
                <ExpoImage accessibilityIgnoresInvertColors contentFit="contain" source={emptyNotificationsImage} style={styles.emptyIllustration} />
                <Text style={styles.emptyText}>You're all caught up.</Text>
              </View>
            ) : null}
            {!loading
              ? todayRows.map((row) => {
                  const path = notificationDestinationPath(row);
                  return (
                    <Pressable
                      disabled={!path}
                      key={row.id}
                      onPress={() => {
                        if (!path) return;
                        haptic.selectTab(); // MP2: light tick on notification row tap
                        pendingNavigationPathRef.current = path;
                        onClose();
                        // A-ha moment: opening an aggregated "people loved your post /
                        // supported your alert" notification is peak social validation.
                        const reviewTrigger = appReviewTriggerForNotification(row);
                        if (reviewTrigger) {
                          setTimeout(() => { void requestAppReview({ userId, trigger: reviewTrigger }); }, 900);
                        }
                      }}
                      style={styles.row}
                    >
                      <View style={[styles.dot, row.read === true && styles.dotRead]} />
                      <View style={styles.rowText}>
                        <Text style={[styles.message, row.read !== true && styles.messageUnread]}>
                          {notificationHubText(row)}
                        </Text>
                        <Text style={styles.time}>{notificationTimeAgo(row.created_at)}</Text>
                      </View>
                    </Pressable>
                  );
                })
              : null}
            </ScrollView>
            {statusMessage ? <NativeToast message={statusMessage} onDismiss={() => setStatusMessage(null)} /> : null}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.backdrop,
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 320,
    maxWidth: "86%",
    paddingTop: 76,
    // Solid drawer: a translucent panel ghosted the screen behind it and made the
    // white-background illustration read as a floating card. Solid white is cleaner
    // and lets the illustration blend seamlessly.
    backgroundColor: huddleColors.canvas,
    borderRightWidth: 1,
    borderRightColor: huddleColors.divider,
    ...huddleShadows.glassElevation2,
  },
  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x4,
  },
  title: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x6,
  },
  loading: {
    paddingVertical: huddleSpacing.x6,
  },
  empty: {
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x9,
  },
  emptyIllustration: {
    // Natural ~3:2 landscape ratio of the asset, sized large so it reads as a
    // proper illustration (was 132×132 square → tiny letterboxed image).
    width: 232,
    height: 155,
  },
  emptyText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
    borderRadius: huddleRadii.field,
  },
  dot: {
    width: 9,
    height: 9,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: huddleColors.blue,
  },
  dotRead: {
    backgroundColor: "rgba(74, 73, 101, 0.22)",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  messageUnread: {
    fontFamily: "Urbanist-600",
    color: huddleColors.text,
  },
  time: {
    marginTop: 2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
});
