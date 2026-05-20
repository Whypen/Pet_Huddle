import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  huddleColors,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";
import {
  fetchNativeNotificationsWithToken,
  firstNotificationText,
  markAllNativeNotificationsReadWithToken,
  NativeNotificationRow,
  notificationDestinationPath,
  notificationTimeAgo,
  readCachedNativeNotifications,
  writeNativeNotificationsCache,
  writeNativeUnreadNotificationCountCache,
} from "../lib/nativeNotifications";
import { haptic } from "../lib/nativeHaptics";

type NativeNotificationsPanelProps = {
  open: boolean;
  accessToken?: string | null;
  sessionKey?: string | null;
  userId: string | null;
  onClose: () => void;
  onMarkedRead: () => void;
  onNavigate: (path: string) => void;
};

export function NativeNotificationsPanel({ open, accessToken, sessionKey, userId, onClose, onMarkedRead, onNavigate }: NativeNotificationsPanelProps) {
  const [rows, setRows] = useState<NativeNotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const panelOpenGenerationRef = useRef(0);
  const openRef = useRef(open);
  const wasOpenRef = useRef(false);
  const markReadInFlightKeyRef = useRef<string | null>(null);
  const markReadInFlightUserRef = useRef<string | null>(null);
  const lastMarkedReadKeyRef = useRef<string | null>(null);
  const panelSessionKeyRef = useRef(sessionKey || (userId ? `${userId}:0` : "anon:0"));
  const currentPanelSessionKey = sessionKey || (userId ? `${userId}:0` : "anon:0");
  panelSessionKeyRef.current = currentPanelSessionKey;

  useEffect(() => {
    openRef.current = open;
    if (open && !wasOpenRef.current) {
      panelOpenGenerationRef.current += 1;
    }
    wasOpenRef.current = open;
  }, [open]);

  const markReadAfterRowsKnown = useCallback(async () => {
    if (!openRef.current || !userId || !accessToken) return;
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
      onMarkedRead();
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
  }, [accessToken, currentPanelSessionKey, onMarkedRead, userId]);

  const loadRows = useCallback(async () => {
    if (!userId || !accessToken) {
      return;
    }
    const requestSessionKey = currentPanelSessionKey;
    const cachedRows = await readCachedNativeNotifications(userId, { sessionKey: requestSessionKey });
    if (panelSessionKeyRef.current !== requestSessionKey) return;
    if (cachedRows) setRows(cachedRows);
    setLoading(!cachedRows);
    setStatusMessage(null);
    try {
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
      if (panelSessionKeyRef.current === requestSessionKey) setLoading(false);
    }
  }, [accessToken, currentPanelSessionKey, markReadAfterRowsKnown, userId]);

  useEffect(() => {
    if (!open) return;
    void loadRows();
  }, [loadRows, open]);

  const todayRows = useMemo(() => rows.slice(0, 80), [rows]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <Pressable accessibilityLabel="Close notifications" onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <Pressable accessibilityLabel="Close" hitSlop={huddleSpacing.x2} onPress={onClose} style={styles.closeButton}>
              <Feather color={huddleColors.iconMuted} name="x" size={22} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={huddleColors.blue} />
              </View>
            ) : null}
            {statusMessage ? (
              <View style={styles.statusBanner}>
                <Feather color={huddleColors.blue} name="info" size={16} />
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
            ) : null}
            {!loading && todayRows.length === 0 ? (
              <View style={styles.empty}>
                <Feather color={huddleColors.mutedText} name="bell" size={28} />
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
                        onClose();
                        onNavigate(path);
                      }}
                      style={styles.row}
                    >
                      <View style={[styles.dot, row.read === true && styles.dotRead]} />
                      <View style={styles.rowText}>
                        <Text style={[styles.message, row.read !== true && styles.messageUnread]}>
                          {firstNotificationText(row.message, row.body, row.title)}
                        </Text>
                        <Text style={styles.time}>{notificationTimeAgo(row.created_at)}</Text>
                      </View>
                    </Pressable>
                  );
                })
              : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-start",
    backgroundColor: huddleColors.backdrop,
  },
  panel: {
    width: 320,
    maxWidth: "86%",
    height: "100%",
    paddingTop: 76,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
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
    borderRadius: huddleRadii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
  },
  body: {
    paddingHorizontal: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x6,
  },
  loading: {
    paddingVertical: huddleSpacing.x6,
  },
  statusBanner: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    backgroundColor: "rgba(33, 69, 207, 0.08)",
  },
  statusText: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 17,
    color: huddleColors.text,
  },
  empty: {
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x8,
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
