import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  blockNativePublicProfileUser,
  fetchNativeProfileMemberNumber,
  fetchNativePublicProfile,
  sendNativePublicProfileStarChat,
  type NativePublicProfile,
} from "../../lib/nativePublicProfile";
import { supabase } from "../../lib/supabase";
import { huddleButtons, huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativePublicProfileContent } from "./NativePublicProfileContent";
import { NativeLoadingState } from "../NativeLoadingState";
import { AppConfirmModal, AppModalCard, AppModalIconButton } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

type NativePublicProfileModalProps = {
  hideActions?: boolean;
  memberNumber?: number | null;
  onBlocked?: (blockedUserId: string) => Promise<void> | void;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onWave?: () => void | Promise<void>;
  open: boolean;
  showWave?: boolean;
  userId: string | null;
};

export function NativePublicProfileModal({ hideActions, memberNumber, onBlocked, onClose, onNavigate, onWave, open, showWave, userId }: NativePublicProfileModalProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativePublicProfile | null>(null);
  const [resolvedMemberNumber, setResolvedMemberNumber] = useState<number | null>(memberNumber ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmStar, setConfirmStar] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [actionBusy, setActionBusy] = useState<"star" | "block" | null>(null);
  const [confirmStarMessage, setConfirmStarMessage] = useState<string | null>(null);
  const canInteract = Boolean(!hideActions && currentUserId && userId && currentUserId !== userId);
  const canWave = Boolean(showWave && currentUserId && userId && currentUserId !== userId);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setCurrentUserId(data.session?.user.id ?? null);
    }).catch(() => {
      if (active) setCurrentUserId(null);
    });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setProfile(null);
    setResolvedMemberNumber(memberNumber ?? null);
    if (!userId) {
      setError("Profile is unavailable.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setNotice("");
    setConfirmStar(false);
    setConfirmBlock(false);
    void fetchNativePublicProfile({ userId })
      .then((nextProfile) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setError(nextProfile ? "" : "Profile is unavailable.");
        setResolvedMemberNumber(memberNumber ?? null);
        if (nextProfile && memberNumber == null) {
          void fetchNativeProfileMemberNumber(nextProfile.userId, nextProfile.createdAt).then((value) => {
            if (!cancelled) setResolvedMemberNumber(value);
          }).catch(() => {
            if (!cancelled) setResolvedMemberNumber(null);
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setError("Unable to load profile.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memberNumber, open, userId]);

  const handleStar = async () => {
    if (!currentUserId || !userId || actionBusy) return;
    setActionBusy("star");
    setConfirmStarMessage(null);
    setNotice("");
    try {
      const result = await sendNativePublicProfileStarChat(currentUserId, userId, profile?.displayName || "Conversation");
      if (result.status === "sent") {
        setNotice("Star sent");
        setConfirmStar(false);
        setTimeout(() => {
          onNavigate?.(`/chat-dialogue?room=${encodeURIComponent(result.roomId)}&name=${encodeURIComponent(profile?.displayName || "Conversation")}&with=${encodeURIComponent(userId)}`);
          onClose();
        }, 900);
        return;
      }
      if (result.status === "free_tier") {
        setConfirmStar(false);
        onNavigate?.("/premium");
        return;
      }
      if (result.status === "exhausted") {
        const message = result.upgradeTier === "gold" ? "Upgrade to Huddle Gold for more Stars" : "Out of Stars";
        setConfirmStarMessage(message);
        setNotice(message);
        return;
      }
      if (result.status === "blocked") {
        setConfirmStarMessage("Cannot start chat with this user");
        setNotice("Cannot start chat with this user");
        return;
      }
      setConfirmStarMessage("Unable to open chat right now");
      setNotice("Unable to open chat right now");
    } catch {
      setConfirmStarMessage("Unable to open chat right now");
      setNotice("Unable to open chat right now");
    } finally {
      setActionBusy(null);
    }
  };

  const handleBlock = async () => {
    if (!userId || actionBusy) return;
    const targetUserId = userId;
    const viewerId = currentUserId;
    setActionBusy("block");
    setNotice("");
    setConfirmBlock(false);
    onClose();
    void Promise.resolve(onBlocked?.(targetUserId)).catch(() => undefined);
    void blockNativePublicProfileUser(targetUserId, viewerId)
      .then(() => Promise.resolve(onBlocked?.(targetUserId)))
      .catch(() => undefined)
      .finally(() => setActionBusy(null));
  };

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, styles.profileModalSafeArea, { paddingTop: insets.top + huddleSpacing.x6, paddingBottom: insets.bottom }]}>
        <Pressable accessibilityLabel="Close profile" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.profileModalCard}>
          <View style={styles.profileModalHeader}>
            <View style={styles.headerCopy}>
              {profile ? <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.headerTitle}>{profile.displayName}</Text> : null}
              {profile?.socialId ? <Text numberOfLines={1} style={styles.headerSocial}>@{profile.socialId}</Text> : null}
            </View>
            <View style={styles.headerActions}>
              {canWave ? (
                <AppModalIconButton
                  accessibilityLabel="Send Wave"
                  disabled={actionBusy === "star"}
                  onPress={() => { void Promise.resolve(onWave?.()); }}
                >
                  <Feather color={huddleColors.blue} name="send" size={21} />
                </AppModalIconButton>
              ) : null}
              {canInteract ? (
                <AppModalIconButton
                  accessibilityLabel="Send Star"
                  disabled={actionBusy === "star"}
                  onPress={() => setConfirmStar(true)}
                >
                  {actionBusy === "star" ? <ActivityIndicator color={huddleColors.blue} size="small" /> : <Feather color={huddleColors.blue} name="star" size={21} />}
                </AppModalIconButton>
              ) : null}
              {canInteract ? (
                <AppModalIconButton
                  accessibilityLabel="Block user"
                  disabled={actionBusy === "block"}
                  onPress={() => setConfirmBlock(true)}
                >
                  <Feather color={huddleColors.validationRed} name="slash" size={21} />
                </AppModalIconButton>
              ) : null}
              <AppModalIconButton accessibilityLabel="Close profile" onPress={onClose}>
                <Feather color={huddleColors.text} name="x" size={24} />
              </AppModalIconButton>
            </View>
          </View>
            {loading ? (
              <NativeLoadingState variant="inline" />
            ) : error ? (
              <View style={styles.state}>
                <Text style={styles.stateTitle}>Profile</Text>
                <Text style={styles.stateText}>{error}</Text>
                <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed ? huddleButtons.pressed : null]}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
              </View>
            ) : profile ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.profileModalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.profileModalScroll}
              >
                <NativePublicProfileContent memberNumber={resolvedMemberNumber} profile={profile} />
                {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
              </ScrollView>
            ) : null}
        </View>
        <ProfileConfirmModal
          body="This starts a conversation immediately."
          confirm="Send Star"
          loading={actionBusy === "star"}
          message={confirmStarMessage}
          onCancel={() => { setConfirmStar(false); setConfirmStarMessage(null); }}
          onConfirm={() => void handleStar()}
          open={confirmStar}
          title="Use a Star to connect?"
          variant="primary"
        />
        <ProfileConfirmModal
          body="You will no longer see their posts or alerts, and they will not be able to interact with you."
          confirm="Block"
          destructive
          loading={actionBusy === "block"}
          onCancel={() => setConfirmBlock(false)}
          onConfirm={() => void handleBlock()}
          open={confirmBlock}
          title={`Block ${profile?.displayName ?? "this user"}?`}
        />
      </View>
    </Modal>
  );
}

function ProfileConfirmModal({
  body,
  confirm,
  destructive,
  loading,
  message,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  body: string;
  confirm: string;
  destructive?: boolean;
  loading?: boolean;
  message?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  variant?: "primary";
}) {
  return <AppConfirmModal body={body} confirm={confirm} destructive={destructive} loading={loading} message={message} onCancel={onCancel} onConfirm={onConfirm} open={open} title={title} />;
}

const styles = StyleSheet.create({
  profileModalSafeArea: {
    alignItems: "center",
    paddingHorizontal: 0,
  },
  profileModalCard: {
    width: "100%",
    height: "100%",
    maxHeight: "100%",
    flexShrink: 1,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  profileModalHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x1,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x3,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: huddleSpacing.x1,
  },
  headerTitle: {
    flexShrink: 1,
    maxWidth: "86%",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  headerSocial: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  profileModalScroll: {
    flex: 1,
    minHeight: 0,
  },
  profileModalScrollContent: {
    paddingBottom: huddleSpacing.x6,
  },
  state: {
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
    padding: huddleSpacing.x5,
  },
  stateTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    color: huddleColors.text,
  },
  stateText: {
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.subtext,
  },
  button: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    minWidth: 120,
  },
  buttonText: {
    ...huddleButtons.label,
    color: huddleColors.blue,
  },
  noticeText: {
    marginTop: huddleSpacing.x3,
    textAlign: "center",
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.blue,
  },
});
