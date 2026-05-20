import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import Reanimated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  blockNativePublicProfileUser,
  fetchNativeProfileMemberNumber,
  fetchNativePublicProfile,
  sendNativePublicProfileStarChat,
  sendNativePublicProfileWave,
  type NativePublicProfile,
} from "../../lib/nativePublicProfile";
import { invalidateNativeDiscoveryRelationshipCache } from "../../lib/nativeChat";
import { haptic } from "../../lib/nativeHaptics";
import { quotaConfig } from "../../lib/quotaConfig_v1";
import { huddleButtons, huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativePublicProfileContent } from "./NativePublicProfileContent";
import { NativeLoadingState } from "../NativeLoadingState";
import { AppConfirmModal, AppDestructiveSlideConfirm, AppModalActionRow, AppModalButton, AppModalIconButton } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

type NativePublicProfileModalProps = {
  accessToken: string | null;
  currentUserId?: string | null;
  hideActions?: boolean;
  hideMatchedActions?: boolean;
  memberNumber?: number | null;
  onBlocked?: (blockedUserId: string) => Promise<void> | void;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onStar?: () => void | Promise<void>;
  onWave?: () => void | Promise<void>;
  open: boolean;
  sessionKey?: string | null;
  showStar?: boolean;
  showWave?: boolean;
  userId: string | null;
};

export function NativePublicProfileModal({ accessToken, currentUserId, hideActions, hideMatchedActions, memberNumber, onBlocked, onClose, onNavigate, onStar, onWave, open, sessionKey, showStar, showWave, userId }: NativePublicProfileModalProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativePublicProfile | null>(null);
  const [resolvedMemberNumber, setResolvedMemberNumber] = useState<number | null>(memberNumber ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmStar, setConfirmStar] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [actionBusy, setActionBusy] = useState<"star" | "block" | "wave" | null>(null);
  const [confirmStarMessage, setConfirmStarMessage] = useState<string | null>(null);
  const [premiumTier, setPremiumTier] = useState<"plus" | "gold" | null>(null);
  const canInteract = Boolean(!hideActions && currentUserId && accessToken && userId && currentUserId !== userId);
  const canProfileStar = canInteract && !hideMatchedActions;
  const canWave = Boolean(showWave && currentUserId && accessToken && userId && currentUserId !== userId);
  // When the modal is opened from Discover (hideActions=true) but the parent still wants to expose Star
  // via showStar+onStar (delegating to the existing confirm-star flow), render the Star button on the left of Wave.
  const canStar = Boolean(showStar && currentUserId && accessToken && userId && currentUserId !== userId);

  useEffect(() => {
    if (!open) return;
    setResolvedMemberNumber(memberNumber ?? null);
    if (!userId) {
      setProfile(null);
      setError("Profile is unavailable.");
      setLoading(false);
      return;
    }
    if (!accessToken) {
      setError("Unable to load profile.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError("");
    setNotice("");
    setConfirmStar(false);
    setConfirmBlock(false);
    setPremiumTier(null);

    setLoading(true);
    let showedCachedProfile = false;

    void (async () => {
      const scope = { sessionKey, viewerId: currentUserId ?? null };
      const cachedProfile = await fetchNativePublicProfile({ accessToken, force: false, userId, ...scope });
      if (cancelled) return;

      if (cachedProfile) {
        showedCachedProfile = true;
        setProfile(cachedProfile);
        setError("");
        setResolvedMemberNumber(memberNumber ?? null);
        setLoading(false);
      }

      if (cachedProfile && memberNumber == null) {
        void fetchNativeProfileMemberNumber(cachedProfile.userId, cachedProfile.createdAt, accessToken).then((value) => {
          if (!cancelled) setResolvedMemberNumber(value);
        }).catch(() => {
          if (!cancelled) setResolvedMemberNumber(null);
        });
      }

      const freshProfile = await fetchNativePublicProfile({ accessToken, force: true, userId, ...scope });
      if (cancelled) return;
      setProfile(freshProfile);
      setError(freshProfile ? "" : "Profile is unavailable.");
      if (freshProfile && memberNumber == null) {
        void fetchNativeProfileMemberNumber(freshProfile.userId, freshProfile.createdAt, accessToken).then((value) => {
          if (!cancelled) setResolvedMemberNumber(value);
        }).catch(() => {
          if (!cancelled) setResolvedMemberNumber(null);
        });
      }
    })().catch(() => {
      if (!cancelled) {
        setError(showedCachedProfile ? "Unable to refresh profile. Pull back and try again." : "Unable to load profile.");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUserId, memberNumber, open, sessionKey, userId]);

  const handleStar = async () => {
    if (!currentUserId || !userId || actionBusy) return;
    if (!accessToken) {
      const message = "Please sign in again to send a Star.";
      setConfirmStarMessage(message);
      setNotice(message);
      return;
    }
    setActionBusy("star");
    setConfirmStarMessage(null);
    setNotice("");
    try {
      const result = await sendNativePublicProfileStarChat(currentUserId, userId, profile?.displayName || "Conversation", accessToken);
      if (result.status === "sent") {
        invalidateNativeDiscoveryRelationshipCache(currentUserId);
        setNotice("Star sent");
        setConfirmStar(false);
        setTimeout(() => {
          onNavigate?.(`/chat-dialogue?room=${encodeURIComponent(result.roomId)}&name=${encodeURIComponent(profile?.displayName || "Conversation")}&with=${encodeURIComponent(userId)}&returnTo=${encodeURIComponent("/chats?tab=friends")}`);
          onClose();
        }, 900);
        return;
      }
      if (result.status === "free_tier") {
        setConfirmStar(false);
        setPremiumTier("plus");
        return;
      }
      if (result.status === "exhausted") {
        if (result.upgradeTier === "gold") {
          setConfirmStar(false);
          setPremiumTier("gold");
          return;
        }
        const message = "You're out of Stars for now.";
        setConfirmStarMessage(message);
        setNotice(message);
        return;
      }
      if (result.status === "blocked") {
        setConfirmStarMessage("You can't send a Star to this user right now.");
        setNotice("You can't send a Star to this user right now.");
        return;
      }
      setConfirmStarMessage(result.reason || "Unable to send Star right now. Try again in a moment.");
      setNotice(result.reason || "Unable to send Star right now. Try again in a moment.");
    } catch (error) {
      const message = "Unable to send Star right now. Try again in a moment.";
      setConfirmStarMessage(message);
      setNotice(message);
    } finally {
      setActionBusy(null);
    }
  };

  const handleWave = async () => {
    if (!currentUserId || !userId || actionBusy) return;
    if (!accessToken) {
      setNotice("Please sign in again to send a Wave.");
      return;
    }
    haptic.primaryConfirm(); // MP6: tactile commit on Wave press
    setActionBusy("wave");
    setNotice("");
    try {
      if (onWave) {
        await Promise.resolve(onWave());
        return;
      }
      const result = await sendNativePublicProfileWave(currentUserId, userId, accessToken);
      if (result.status === "sent" || result.status === "duplicate") {
        invalidateNativeDiscoveryRelationshipCache(currentUserId);
        haptic.success(); // MP6: confirm wave landed
        setNotice(result.matchCreated ? "It's a match" : "Wave sent");
        return;
      }
      if (result.status === "blocked") {
        haptic.error();
        setNotice("Cannot send a Wave to this user");
        return;
      }
      haptic.error();
      setNotice("Unable to send Wave right now");
    } catch {
      haptic.error();
      setNotice("Unable to send Wave right now");
    } finally {
      setActionBusy(null);
    }
  };

  const handleBlock = async () => {
    if (!userId || actionBusy) return;
    if (!accessToken) {
      setNotice("Please sign in again to block this user.");
      setConfirmBlock(false);
      return;
    }
    const targetUserId = userId;
    const viewerId = currentUserId;
    haptic.destructive(); // MP6: heavy tick on block commit
    setActionBusy("block");
    setNotice("");
    setConfirmBlock(false);
    try {
      await blockNativePublicProfileUser(targetUserId, viewerId, accessToken);
      invalidateNativeDiscoveryRelationshipCache(viewerId);
      await Promise.resolve(onBlocked?.(targetUserId));
      onClose();
    } catch (error) {
      haptic.error();
      const message = error instanceof Error && error.message ? error.message : "Unable to block user right now";
      setNotice(message);
    } finally {
      setActionBusy(null);
    }
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
              {/* Star left of Wave — same FontAwesome5 filled star, premiumGold, used everywhere across the app for consistency. */}
              {canStar ? (
                <AppModalIconButton
                  accessibilityLabel="Send Star"
                  disabled={Boolean(actionBusy)}
                  onPress={() => { void (onStar && onStar()); }}
                >
                  {actionBusy === "star" ? <ActivityIndicator color={huddleColors.premiumGold} size="small" /> : <FontAwesome5 color={huddleColors.premiumGold} name="star" size={20} solid />}
                </AppModalIconButton>
              ) : null}
              {canWave ? (
                <AppModalIconButton
                  accessibilityLabel="Send Wave"
                  disabled={Boolean(actionBusy)}
                  onPress={() => { void handleWave(); }}
                >
                  {actionBusy === "wave" ? <ActivityIndicator color={huddleColors.blue} size="small" /> : <MaterialCommunityIcons color={huddleColors.blue} name="hand-wave" size={22} style={styles.headerWaveIcon} />}
                </AppModalIconButton>
              ) : null}
              {canProfileStar ? (
                <AppModalIconButton
                  accessibilityLabel="Send Star"
                  disabled={actionBusy === "star"}
                  onPress={() => setConfirmStar(true)}
                >
                  {actionBusy === "star" ? <ActivityIndicator color={huddleColors.premiumGold} size="small" /> : <FontAwesome5 color={huddleColors.premiumGold} name="star" size={20} solid />}
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
            {loading && !profile ? (
              <NativeLoadingState variant="inline" />
            ) : profile ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.profileModalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.profileModalScroll}
              >
                <NativePublicProfileContent accessToken={accessToken} currentUserId={currentUserId} memberNumber={resolvedMemberNumber} profile={profile} sessionKey={sessionKey} />
                {error ? <Text style={styles.noticeText}>{error}</Text> : null}
                {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
              </ScrollView>
            ) : error ? (
              <View style={styles.state}>
                <Text style={styles.stateTitle}>Profile</Text>
                <Text style={styles.stateText}>{error}</Text>
                <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed ? huddleButtons.pressed : null]}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
              </View>
            ) : null}
        </View>
        <ProfileStarConfirmModal
          body="This starts a conversation immediately."
          loading={actionBusy === "star"}
          message={confirmStarMessage}
          onCancel={() => { setConfirmStar(false); setConfirmStarMessage(null); }}
          onConfirm={() => void handleStar()}
          open={confirmStar}
          title="Use a Star to connect?"
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
        <ProfileUpgradeModal
          onClose={() => setPremiumTier(null)}
          onUpgrade={() => {
            setPremiumTier(null);
            onNavigate?.("/premium");
          }}
          tier={premiumTier}
        />
      </View>
    </Modal>
  );
}

function ProfileStarConfirmModal({
  body,
  loading,
  message,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  body: string;
  loading?: boolean;
  message?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const pulse = useSharedValue(0);
  const haloOpacity = useSharedValue(0);
  const buttonRef = useRef<View | null>(null);

  useEffect(() => {
    if (loading) {
      haloOpacity.value = withTiming(1, { duration: 200 });
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0, { duration: 600 })), -1, false);
      return;
    }
    haloOpacity.value = withTiming(0, { duration: 200 });
    pulse.value = withTiming(0, { duration: 200 });
  }, [haloOpacity, loading, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value * (0.55 + pulse.value * 0.25),
    transform: [{ scale: 1.04 + pulse.value * 0.04 }],
  }));

  if (!open) return null;

  return (
    <Modal animationType="fade" onRequestClose={loading ? undefined : onCancel} transparent visible={open}>
      <Pressable style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]} onPress={loading ? undefined : onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={nativeModalStyles.appConfirmCard}>
            <Text style={nativeModalStyles.appConfirmTitle}>{title}</Text>
            <Text style={nativeModalStyles.appConfirmBody}>{body}</Text>
            {message ? <Text style={nativeModalStyles.appModalError}>{message}</Text> : null}
            <AppModalActionRow>
              <AppModalButton disabled={loading} variant="secondary" onPress={onCancel}>Cancel</AppModalButton>
              <View ref={buttonRef} collapsable={false} style={styles.confirmStarSendWrap}>
                <Reanimated.View pointerEvents="none" style={[styles.confirmStarSendHalo, haloStyle]} />
                <Pressable
                  accessibilityLabel="Send Star"
                  accessibilityRole="button"
                  disabled={loading}
                  onPress={onConfirm}
                  style={({ pressed }) => [styles.confirmStarSendGoldButton, loading ? styles.confirmStarSendGoldButtonDisabled : null, pressed ? styles.pressed : null]}
                >
                  {loading ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Text style={styles.confirmStarSendGoldText}>Send Star</Text>}
                </Pressable>
              </View>
            </AppModalActionRow>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ProfileUpgradeModal({ onClose, onUpgrade, tier }: { onClose: () => void; onUpgrade: () => void; tier: "plus" | "gold" | null }) {
  const insets = useSafeAreaInsets();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  if (!tier) return null;
  const isGold = tier === "gold";
  const plan = quotaConfig.stripePlans[tier];
  const caps = quotaConfig.capsByTier[tier];
  const themeColor = isGold ? huddleColors.membershipUpgradeGold : huddleColors.membershipUpgradePlus;
  const monthly = plan.monthly.amount;
  const annual = plan.annual.amount;
  const annualPerMonth = annual / 12;
  const displayPrice = billing === "annual" ? annualPerMonth : monthly;
  const discountPct = Math.round((1 - annualPerMonth / monthly) * 100);
  const features: Array<{ icon: keyof typeof Feather.glyphMap; title: string; subtitle: string }> = isGold ? [
    { icon: "globe", title: "Max Discovery", subtitle: "Keep discovering without the usual limits." },
    { icon: "trending-up", title: "Top Profile Boost", subtitle: "Priority placement in Discover and Care." },
    { icon: "star", title: `${caps.starsPerMonth} Stars / month`, subtitle: "Your fastest way to connect." },
    { icon: "radio", title: `Broadcasts · ${caps.broadcastRadiusKm}km · ${caps.broadcastDurationHours}h`, subtitle: "Your widest reach, for even longer." },
    { icon: "sliders", title: "All Filters", subtitle: "Every filter unlocked. Less noise, better matches." },
    { icon: "video", title: "Video Uploads", subtitle: "Gold exclusive." },
    { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
  ] : [
    { icon: "users", title: "Open Discovery", subtitle: "Double the chances. Better matches." },
    { icon: "trending-up", title: "Profile Boost", subtitle: "Get seen earlier in Discover and Care." },
    { icon: "star", title: `${caps.starsPerMonth} Stars / month`, subtitle: "Reach out without waiting." },
    { icon: "radio", title: `Broadcasts · ${caps.broadcastRadiusKm}km · ${caps.broadcastDurationHours}h`, subtitle: "Reach more nearby members for longer." },
    { icon: "globe", title: "Advanced Filters", subtitle: "Sharper search. Better fit." },
    { icon: "users", title: "Family Sharing", subtitle: "Extend your plan benefits to one other account (except Stars)." },
  ];

  return (
    <Modal presentationStyle="overFullScreen" animationType="fade" transparent visible={Boolean(tier)} onRequestClose={onClose}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, { paddingTop: insets.top + huddleSpacing.x6, paddingBottom: insets.bottom }]}>
        <Pressable accessibilityLabel="Close membership" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Pressable style={[styles.upgradeCard, { backgroundColor: themeColor }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.upgradeBillingRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: billing === "monthly" }} onPress={() => setBilling("monthly")} style={[styles.upgradeBillingTab, billing !== "monthly" && styles.upgradeBillingTabInactive]}>
              <Text style={[styles.upgradeBillingText, billing !== "monthly" && { color: themeColor }]}>Monthly</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: billing === "annual" }} onPress={() => setBilling("annual")} style={[styles.upgradeBillingTab, billing !== "annual" && styles.upgradeBillingTabInactive]}>
              <Text style={[styles.upgradeBillingText, billing !== "annual" && { color: themeColor }]}>Annually</Text>
              {billing !== "annual" ? <Text style={[styles.upgradeDiscountBadge, { backgroundColor: themeColor }]}>-{discountPct}%</Text> : null}
            </Pressable>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.upgradeBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.upgradeHeadline}>{isGold ? "Upgrade to Huddle Gold" : "Upgrade to Huddle+"}</Text>
            <Text style={styles.upgradeSubheadline}>{isGold ? "Activate now to send stars and become a top profile in your area and find more connections!" : "Activate now to send stars and find 2x more connections!"}</Text>
            <Text style={styles.upgradePrice}>USD${displayPrice.toFixed(2)}<Text style={styles.upgradePriceUnit}> /mo</Text></Text>
            {billing === "annual" ? <Text style={styles.upgradeAnnualNote}>USD${annual.toFixed(2)} billed yearly</Text> : null}
            <View style={styles.upgradeDivider} />
            <View style={styles.upgradeFeatureList}>
              {features.map((feature) => (
                <View key={feature.title} style={styles.upgradeFeatureRow}>
                  <Feather color={huddleColors.onPrimary} name={feature.icon} size={22} />
                  <View style={styles.upgradeFeatureCopy}>
                    <Text style={styles.upgradeFeatureTitle}>{feature.title}</Text>
                    <Text style={styles.upgradeFeatureSubtitle}>{feature.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={onUpgrade} style={styles.upgradeCta}>
              <Text style={[styles.upgradeCtaText, { color: themeColor }]}>{isGold ? "Upgrade to Huddle Gold" : "Upgrade to Huddle+"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.upgradeLaterButton}>
              <Text style={styles.upgradeLaterText}>Maybe later</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
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
  if (destructive) {
    return (
      <AppDestructiveSlideConfirm
        body={body}
        busy={Boolean(loading)}
        message={message}
        onClose={onCancel}
        onConfirm={onConfirm}
        open={open}
        slideLabel={`Slide to ${confirm}`}
        title={title}
      />
    );
  }
  return <AppConfirmModal body={body} confirm={confirm} loading={loading} message={message} onCancel={onCancel} onConfirm={onConfirm} open={open} title={title} />;
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
  headerWaveIcon: {
    transform: [{ rotate: "-20deg" }],
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
  pressed: {
    opacity: 0.88,
  },
  confirmStarSendWrap: {
    flex: 1,
    minWidth: 0,
  },
  confirmStarSendHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: huddleRadii.button,
    backgroundColor: huddleColors.premiumGold,
  },
  confirmStarSendGoldButton: {
    flex: 1,
    height: 48,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.premiumGold,
  },
  confirmStarSendGoldButtonDisabled: {
    opacity: 0.55,
  },
  confirmStarSendGoldText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  upgradeCard: {
    width: "100%",
    maxWidth: 390,
    maxHeight: "100%",
    overflow: "hidden",
    borderRadius: huddleRadii.glass,
    borderWidth: 1.5,
    borderColor: huddleColors.membershipUpgradeBorder,
    ...huddleShadows.glassElevation2,
  },
  upgradeBillingRow: {
    minHeight: 44,
    flexDirection: "row",
  },
  upgradeBillingTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x1,
  },
  upgradeBillingTabInactive: {
    backgroundColor: huddleColors.canvas,
  },
  upgradeBillingText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  upgradeDiscountBadge: {
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.onPrimary,
  },
  upgradeBody: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x3,
  },
  upgradeHeadline: {
    fontFamily: "Urbanist-800",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    color: huddleColors.onPrimary,
  },
  upgradeSubheadline: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.membershipUpgradeTextSoft,
  },
  upgradePrice: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-800",
    fontSize: huddleType.h1,
    lineHeight: huddleType.h1Line,
    color: huddleColors.onPrimary,
  },
  upgradePriceUnit: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.membershipUpgradeTextSoft,
  },
  upgradeAnnualNote: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.membershipUpgradeTextMuted,
  },
  upgradeDivider: {
    height: 1,
    marginTop: huddleSpacing.x4,
    backgroundColor: huddleColors.membershipUpgradeDivider,
  },
  upgradeFeatureList: {
    marginTop: huddleSpacing.x3,
  },
  upgradeFeatureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  upgradeFeatureCopy: {
    flex: 1,
    minWidth: 0,
  },
  upgradeFeatureTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  upgradeFeatureSubtitle: {
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.membershipUpgradeTextSoft,
  },
  upgradeCta: {
    minHeight: 50,
    marginTop: huddleSpacing.x5,
    borderRadius: huddleRadii.glass,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  upgradeCtaText: {
    ...huddleButtons.label,
  },
  upgradeLaterButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: huddleSpacing.x2,
  },
  upgradeLaterText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.membershipUpgradeTextFaint,
  },
});
