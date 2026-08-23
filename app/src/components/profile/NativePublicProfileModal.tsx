import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { useNativeSwipeDownToClose } from "../../lib/useNativeSwipeDownToClose";
import { NativeSpinner } from "../NativeSpinner";
import { useEffect, useRef, useState } from "react";
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  blockNativePublicProfileUser,
  fetchNativePublicProfileIsFriend,
  fetchNativePublicProfile,
  sendNativePublicProfileStarChat,
  sendNativePublicProfileWave,
  type NativePublicProfile,
} from "../../lib/nativePublicProfile";
import { invalidateNativeDiscoveryRelationshipCache } from "../../lib/nativeChat";
import { invalidateNativeBlockCascade } from "../../lib/nativeBlockCascade";
import { subscribeNativeVerifyIdentityUpdated } from "../../lib/nativeVerifyIdentity";
import { haptic } from "../../lib/nativeHaptics";
import { nativeSafeErrorCopy } from "../../lib/nativeSafeErrorCopy";
import { getFreshNativeAccessToken } from "../../lib/nativeFunctionClient";
import { useNativeLoadingDeadline } from "../../lib/useNativeLoadingDeadline";
import { createSingleRealtimeChannel } from "../../lib/realtimeChannelManager";
import { loadNativeStoreProducts, nativeMembershipPriceDisplay, type NativeStoreProductId, type NativeStoreProductState } from "../../lib/nativeStoreSubscriptions";
import { quotaConfig } from "../../lib/quotaConfig_v1";
import { huddleButtons, huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";
import { NativePublicProfileContent } from "./NativePublicProfileContent";
import { NativeShareCardModal } from "../share/NativeShareCardModal";
import { buildProfileShareCard } from "../../lib/shareCardData";
import { NativeLoadingState } from "../NativeLoadingState";
import { NativeEngagementSparkleInline } from "../NativeProfileAvatar";
import { AppConfirmModal, AppDestructiveSlideConfirm, AppModalActionRow, AppModalButton, AppModalIconButton } from "../nativeModalPrimitives";
import { nativeModalStyles } from "../nativeModalPrimitives.styles";

type NativePublicProfileModalProps = {
  accessToken: string | null;
  viewerUserId?: string | null;
  fallbackData?: Record<string, unknown> | null;
  hideActions?: boolean;
  hideMatchedActions?: boolean;
  heroPresentation?: "card" | "full-bleed";
  memberNumber?: number | null;
  onBlocked?: (blockedUserId: string) => Promise<void> | void;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  onProfileResolved?: (profile: NativePublicProfile) => void;
  onStar?: () => void | Promise<void>;
  onWave?: () => void | Promise<void>;
  open: boolean;
  sessionKey?: string | null;
  showStar?: boolean;
  showWave?: boolean;
  profileUserId: string | null;
};

export function NativePublicProfileModal({ accessToken, fallbackData, heroPresentation = "full-bleed", hideActions, hideMatchedActions, memberNumber, onBlocked, onClose, onNavigate, onProfileResolved, onStar, onWave, open, profileUserId, sessionKey, showStar, showWave, viewerUserId }: NativePublicProfileModalProps) {
  const insets = useSafeAreaInsets();
  const { gesture, cardStyle, backdropStyle } = useNativeSwipeDownToClose({ open, onClose });
  const fallbackDataRef = useRef(fallbackData);
  const onProfileResolvedRef = useRef(onProfileResolved);
  const profileLoadAttemptRef = useRef(0);
  const profileForceNextAttemptRef = useRef(false);
  fallbackDataRef.current = fallbackData;
  onProfileResolvedRef.current = onProfileResolved;
  const [resolvedProfile, setResolvedProfile] = useState<NativePublicProfile | null>(null);
  const [resolvedProfileUserId, setResolvedProfileUserId] = useState<string | null>(null);
  const resolvedProfileUserIdRef = useRef(resolvedProfileUserId);
  resolvedProfileUserIdRef.current = resolvedProfileUserId;
  // Never render a profile resolved for the previous target while this modal is reused.
  const profile = resolvedProfileUserId === profileUserId ? resolvedProfile : null;
  const profileIdentityPending = Boolean(open && profileUserId && resolvedProfileUserId !== profileUserId);
  const [resolvedMemberNumber, setResolvedMemberNumber] = useState<number | null>(memberNumber ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileLoadVersion, setProfileLoadVersion] = useState(0);
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      profileLoadAttemptRef.current += 1;
      profileForceNextAttemptRef.current = true;
      setLoading(false);
      if (!profile) setError("Unable to load profile.");
    },
  });
  const [notice, setNotice] = useState("");
  const [confirmStar, setConfirmStar] = useState(false);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [actionBusy, setActionBusy] = useState<"star" | "block" | "wave" | null>(null);
  const starActionIdRef = useRef<string | null>(null);
  const waveActionIdRef = useRef<string | null>(null);
  const [confirmStarMessage, setConfirmStarMessage] = useState<string | null>(null);
  const [premiumTier, setPremiumTier] = useState<"plus" | "gold" | null>(null);
  const [starsExhaustedOpen, setStarsExhaustedOpen] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const isOwnProfile = Boolean(viewerUserId && profileUserId && viewerUserId === profileUserId);
  const canInteract = Boolean(!hideActions && viewerUserId && profileUserId && viewerUserId !== profileUserId);
  const canFriendChat = canInteract && isFriend;
  const canProfileStar = canInteract && !hideMatchedActions && !isFriend;
  const canWave = Boolean(showWave && viewerUserId && profileUserId && viewerUserId !== profileUserId);
  // Discover can expose Star while matched-profile actions stay hidden; use the shared profile flow unless a caller explicitly overrides it.
  const canStar = Boolean(showStar && viewerUserId && profileUserId && viewerUserId !== profileUserId && !isFriend);

  useEffect(() => {
    starActionIdRef.current = null;
    waveActionIdRef.current = null;
  }, [profileUserId]);

  // Header paw waves on a loop — same swing as the Discover CTA paw.
  const pawSwingSV = useSharedValue(0);
  useEffect(() => {
    if (!open || !canWave) { pawSwingSV.value = 0; return; }
    const easeSin = Easing.inOut(Easing.sin);
    pawSwingSV.value = withRepeat(
      withSequence(
        withTiming(-20, { duration: 200, easing: easeSin }),
        withTiming(20, { duration: 220, easing: easeSin }),
        withTiming(-16, { duration: 200, easing: easeSin }),
        withTiming(16, { duration: 200, easing: easeSin }),
        withTiming(0, { duration: 180, easing: easeSin }),
        withDelay(2200, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
  }, [open, canWave, pawSwingSV]);
  const pawSwingStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${pawSwingSV.value}deg` }] }));

  useEffect(() => {
    if (!open || !profileUserId) return undefined;
    return subscribeNativeVerifyIdentityUpdated((event) => {
      if (!event.verified || event.userId !== profileUserId) return;
      setResolvedProfile((current) => current ? { ...current, isVerified: true } : current);
    });
  }, [open, profileUserId]);

  useEffect(() => {
    if (!open) return;
    setResolvedMemberNumber(memberNumber ?? null);
    if (!profileUserId) {
      setResolvedProfile(null);
      setResolvedProfileUserId(null);
      resolvedProfileUserIdRef.current = null;
      setError("Profile is unavailable.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const attempt = ++profileLoadAttemptRef.current;
    const isCurrentAttempt = () => !cancelled && profileLoadAttemptRef.current === attempt;
    const targetChanged = resolvedProfileUserIdRef.current !== profileUserId;
    if (targetChanged) {
      setResolvedProfile(null);
      setResolvedProfileUserId(null);
      resolvedProfileUserIdRef.current = null;
    }
    setError("");
    setNotice("");
    setConfirmStar(false);
    setConfirmBlock(false);
    setPremiumTier(null);
    setStarsExhaustedOpen(false);
    setIsFriend(false);

    setLoading(true);
    let showedCachedProfile = false;

    void (async () => {
      const scope = { sessionKey, viewerId: viewerUserId ?? null };
      // Profile paint is cache/fallback-first and must not wait for auth
      // hydration. Relationship enrichment can resolve independently.
      void getFreshNativeAccessToken(accessToken).then((freshAccessToken) => (
        viewerUserId && viewerUserId !== profileUserId && freshAccessToken
          ? fetchNativePublicProfileIsFriend(profileUserId, freshAccessToken).catch(() => false)
          : false
      )).then((activeMatch) => {
        if (isCurrentAttempt()) setIsFriend(activeMatch);
      });
      const cachedProfile = await fetchNativePublicProfile({ accessToken, fallbackData: fallbackDataRef.current, force: profileForceNextAttemptRef.current, profileUserId, ...scope });
      if (!isCurrentAttempt()) return;

      if (cachedProfile) {
        profileForceNextAttemptRef.current = false;
        showedCachedProfile = true;
        setResolvedProfile(cachedProfile);
        setResolvedProfileUserId(profileUserId);
        resolvedProfileUserIdRef.current = profileUserId;
        setError("");
        setResolvedMemberNumber(memberNumber ?? cachedProfile.memberNumber ?? null);
        setLoading(false);
        onProfileResolvedRef.current?.(cachedProfile);
        return;
      }
      if (!showedCachedProfile) {
        setResolvedProfile(null);
        setResolvedProfileUserId(null);
        resolvedProfileUserIdRef.current = null;
        setError("Profile is unavailable.");
      } else {
        setError("");
      }
    })().catch(() => {
      if (isCurrentAttempt()) {
        setError(showedCachedProfile ? "Unable to refresh profile. Pull back and try again." : "Unable to load profile.");
      }
    }).finally(() => {
      if (isCurrentAttempt()) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, viewerUserId, memberNumber, open, profileLoadVersion, sessionKey, profileUserId]);

  // Live Likes counter: push likes_received_count updates straight into the open
  // modal so the number ticks up in real time as new likes land, no refetch needed.
  useEffect(() => {
    if (!open || !profileUserId) return undefined;
    const handle = createSingleRealtimeChannel(`native-public-profile-likes:${profileUserId}`, (channel) => (
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profileUserId}` },
        (payload) => {
          const nextLikes = Number((payload.new as { likes_received_count?: number | null })?.likes_received_count ?? NaN);
          if (Number.isNaN(nextLikes)) return;
          setResolvedProfile((current) => current ? {
            ...current,
            engagementStats: { groups: current.engagementStats?.groups ?? 0, friends: current.engagementStats?.friends ?? 0, likes: nextLikes },
          } : current);
        },
      )
    ));
    return () => { void handle.dispose(); };
  }, [open, profileUserId]);

  const handleStar = async () => {
    if (!viewerUserId || !profileUserId || actionBusy) return;
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
      const message = "Please sign in again to send a Star.";
      setConfirmStarMessage(message);
      setNotice(message);
      return;
    }
    setActionBusy("star");
    setConfirmStarMessage(null);
    setNotice("");
    try {
      const actionId = starActionIdRef.current
        ?? `star:${profileUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
      starActionIdRef.current = actionId;
      const result = await sendNativePublicProfileStarChat(viewerUserId, profileUserId, profile?.displayName || "Conversation", actionId, freshAccessToken);
      if (result.status === "sent") {
        starActionIdRef.current = null;
        invalidateNativeDiscoveryRelationshipCache(viewerUserId);
        setNotice("Star sent");
        setConfirmStar(false);
        setTimeout(() => {
          onNavigate?.(`/chat-dialogue?room=${encodeURIComponent(result.roomId)}&name=${encodeURIComponent(profile?.displayName || "Conversation")}&with=${encodeURIComponent(profileUserId)}&returnTo=${encodeURIComponent("/chats?tab=friends")}`);
          onClose();
        }, 900);
        return;
      }
      if (result.status === "free_tier") {
        starActionIdRef.current = null;
        setConfirmStar(false);
        setPremiumTier("plus");
        return;
      }
      if (result.status === "exhausted") {
        starActionIdRef.current = null;
        if (result.upgradeTier === "gold") {
          setConfirmStar(false);
          setPremiumTier("gold");
          return;
        }
        setConfirmStar(false);
        setConfirmStarMessage(null);
        setStarsExhaustedOpen(true);
        return;
      }
      if (result.status === "blocked") {
        starActionIdRef.current = null;
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
    if (!viewerUserId || !profileUserId || actionBusy) return;
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
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
      const actionId = waveActionIdRef.current
        ?? `wave:${profileUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
      waveActionIdRef.current = actionId;
      const result = await sendNativePublicProfileWave(viewerUserId, profileUserId, actionId, freshAccessToken);
      if (result.status === "sent" || result.status === "duplicate") {
        waveActionIdRef.current = null;
        invalidateNativeDiscoveryRelationshipCache(viewerUserId);
        haptic.success(); // MP6: confirm wave landed
        setNotice(result.matchCreated ? "" : "Wave sent");
        return;
      }
      if (result.status === "blocked") {
        waveActionIdRef.current = null;
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
    if (!profileUserId || actionBusy) return;
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) {
      setNotice("Please sign in again to block this user.");
      setConfirmBlock(false);
      return;
    }
    const targetUserId = profileUserId;
    const viewerId = viewerUserId;
    haptic.destructive(); // MP6: heavy tick on block commit
    setActionBusy("block");
    setNotice("");
    setConfirmBlock(false);
    try {
      await blockNativePublicProfileUser(targetUserId, viewerId, freshAccessToken);
      invalidateNativeDiscoveryRelationshipCache(viewerId);
      void invalidateNativeBlockCascade({ userId: viewerId });
      await Promise.resolve(onBlocked?.(targetUserId));
      onClose();
    } catch (error) {
      haptic.error();
      setNotice(nativeSafeErrorCopy(error, "Unable to block user right now"));
    } finally {
      setActionBusy(null);
    }
  };

  const handleEditOwnProfile = () => {
    onClose();
    onNavigate?.("/edit-profile");
  };

  const handleOpenFriendChat = () => {
    if (!profileUserId) return;
    const name = profile?.displayName || "Conversation";
    onClose();
    onNavigate?.(`/chat-dialogue?with=${encodeURIComponent(profileUserId)}&name=${encodeURIComponent(name)}`);
  };

  return (
    <Modal presentationStyle="overFullScreen" animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <GestureHandlerRootView style={styles.ghRoot}>
      <View style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea, styles.profileModalSafeArea, { backgroundColor: "transparent", paddingTop: insets.top + huddleSpacing.x6, paddingBottom: insets.bottom }]}>
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, backdropStyle]} />
        <Pressable accessibilityLabel="Close profile" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
        <Reanimated.View style={[styles.profileModalCard, cardStyle]}>
          <GestureDetector gesture={gesture}>
            <View>
              <View style={styles.grabber} />
              <View style={styles.profileModalHeader}>
            <View style={styles.headerCopy}>
              {profile ? (
                <View style={styles.headerTitleRow}>
                  <NativeEngagementSparkleInline engagement={profile.engagement} size={huddleType.body} style={styles.headerTitleSparkle} />
                  <Text numberOfLines={1} style={styles.headerTitle}>{profile.displayName}</Text>
                  {isFriend && !isOwnProfile ? (
                    <View style={styles.matchedChip}>
                      <Text style={styles.matchedChipText}>Friend</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {profile?.socialId ? <Text numberOfLines={1} style={styles.headerSocial}>@{profile.socialId}</Text> : null}
            </View>
            <View style={styles.headerActions}>
              {/* Star left of Wave: use the shared profile Star confirm/upgrade flow unless a caller explicitly owns the action. */}
              {canStar ? (
                <AppModalIconButton
                  accessibilityLabel="Send Star"
                  disabled={Boolean(actionBusy)}
                  onPress={() => {
                    if (onStar) {
                      void onStar();
                      return;
                    }
                    setConfirmStar(true);
                  }}
                >
                  {actionBusy === "star" ? <NativeSpinner tone="muted" /> : <ProfileStarIcon size={20} />}
                </AppModalIconButton>
              ) : null}
              {canWave ? (
                <AppModalIconButton
                  accessibilityLabel="Send Wave"
                  disabled={Boolean(actionBusy)}
                  onPress={() => { void handleWave(); }}
                >
                  {actionBusy === "wave" ? <NativeSpinner tone="accent" /> : <Reanimated.View style={pawSwingStyle}><MaterialCommunityIcons color={huddleColors.blue} name="paw" size={22} style={styles.headerWaveIcon} /></Reanimated.View>}
                </AppModalIconButton>
              ) : null}
              {canProfileStar ? (
                <AppModalIconButton
                  accessibilityLabel="Send Star"
                  disabled={actionBusy === "star"}
                  onPress={() => setConfirmStar(true)}
                >
                  {actionBusy === "star" ? <NativeSpinner tone="muted" /> : <ProfileStarIcon size={20} />}
                </AppModalIconButton>
              ) : null}
              {canFriendChat ? (
                <AppModalIconButton accessibilityLabel={`Message ${profile?.displayName || "friend"}`} onPress={handleOpenFriendChat}>
                  <Feather color={huddleColors.blue} name="message-circle" size={21} />
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
              {isOwnProfile && profile ? (
                <AppModalIconButton accessibilityLabel="Share your huddle card" onPress={() => setShareCardOpen(true)}>
                  <Feather color={huddleColors.blue} name="share" size={20} />
                </AppModalIconButton>
              ) : null}
              {isOwnProfile ? (
                <AppModalIconButton accessibilityLabel="Edit profile" onPress={handleEditOwnProfile}>
                  <Feather color={huddleColors.blue} name="edit-2" size={21} />
                </AppModalIconButton>
              ) : null}
              <AppModalIconButton accessibilityLabel="Close profile" onPress={onClose}>
                <Feather color={huddleColors.text} name="x" size={24} />
              </AppModalIconButton>
            </View>
              </View>
            </View>
          </GestureDetector>
            {(loading || profileIdentityPending) && !profile ? (
              <NativeLoadingState variant="inline" />
            ) : profile ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.profileModalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.profileModalScroll}
              >
                <NativePublicProfileContent accessToken={accessToken} currentUserId={viewerUserId} heroPresentation={heroPresentation} memberNumber={resolvedMemberNumber} profile={profile} sessionKey={sessionKey} />
                {error ? <Text style={styles.refreshNoticeText}>{error}</Text> : null}
                {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
              </ScrollView>
            ) : error ? (
              <View style={styles.state}>
                <Text style={styles.stateTitle}>Profile</Text>
                <Text style={styles.stateText}>{error}</Text>
                <Pressable onPress={() => setProfileLoadVersion((current) => current + 1)} style={({ pressed }) => [styles.button, pressed ? huddleButtons.pressed : null]}>
                  <Text style={styles.buttonText}>Retry</Text>
                </Pressable>
                <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed ? huddleButtons.pressed : null]}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
              </View>
            ) : null}
        </Reanimated.View>
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
        <StarsExhaustedModal open={starsExhaustedOpen} onClose={() => setStarsExhaustedOpen(false)} />
        {isOwnProfile && profile && shareCardOpen ? (
          <NativeShareCardModal
            data={buildProfileShareCard({
              id: profile.userId,
              displayName: profile.displayName,
              socialId: profile.socialId,
              avatarUrl: profile.photoUrl,
              tier: profile.membershipTier,
              isVerified: profile.isVerified,
              createdAt: profile.createdAt,
              memberNumber: profile.memberNumber,
              engagementTier: profile.engagement?.tier,
              experienceYears: profile.experienceYears,
              petExperience: profile.petExperience,
              roleLabels: profile.availabilityStatus,
              groupCount: profile.engagementStats?.groups,
              friendCount: profile.engagementStats?.friends,
              pets: profile.petHeads.map((pet) => ({ name: pet.name || "Pet", species: pet.species, photoUri: pet.photoUrl, photoPosition: pet.photoPosition })),
            })}
            visible={shareCardOpen}
            onClose={() => setShareCardOpen(false)}
          />
        ) : null}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ProfileStarIcon({ size }: { size: number }) {
  return (
    <View style={[styles.profileStarIcon, { width: size, height: size }]}>
      <FontAwesome5 color={huddleColors.coral} name="star" size={size} />
      <FontAwesome5 color={huddleColors.subscriptionAddonLime} name="star" size={Math.max(1, size - 3)} solid style={styles.profileStarIconFill} />
    </View>
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
                  {loading ? <NativeSpinner tone="primary" /> : <Text style={styles.confirmStarSendGoldText}>Send Star</Text>}
                </Pressable>
              </View>
            </AppModalActionRow>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ProfileUpgradeModal({ onClose, onUpgrade, tier }: { onClose: () => void; onUpgrade: () => void; tier: "plus" | "gold" | null }) {
  const insets = useSafeAreaInsets();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [storeProducts, setStoreProducts] = useState<Record<NativeStoreProductId, NativeStoreProductState> | null>(null);
  useEffect(() => {
    if (!tier) return;
    let active = true;
    void loadNativeStoreProducts({ allowCache: true }).then((products) => {
      if (active) setStoreProducts(products);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tier]);
  if (!tier) return null;
  const isGold = tier === "gold";
  const caps = quotaConfig.capsByTier[tier];
  const themeColor = isGold ? huddleColors.membershipUpgradeGold : huddleColors.membershipUpgradePlus;
  const pricing = nativeMembershipPriceDisplay(tier, billing, storeProducts);
  const features: Array<{ icon: keyof typeof Feather.glyphMap; title: string; subtitle: string }> = isGold ? [
    { icon: "globe", title: "Max Discovery", subtitle: "Keep discovering without the usual limits." },
    { icon: "trending-up", title: "Top Profile Boost", subtitle: "Priority placement in Discover and Care." },
    { icon: "star", title: `${caps.starsPerMonth} Stars / month`, subtitle: "Your fastest way to connect." },
    { icon: "radio", title: `Broadcasts · ${caps.broadcastRadiusKm}km · ${caps.broadcastDurationHours}h`, subtitle: "Your widest reach, for even longer." },
    { icon: "sliders", title: "All Filters", subtitle: "Every filter unlocked. Less noise, better matches." },
    { icon: "video", title: "Video Uploads", subtitle: "huddle＊ exclusive." },
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
              {billing !== "annual" ? <Text style={[styles.upgradeDiscountBadge, { backgroundColor: themeColor }]}>-{pricing.discountPct}%</Text> : null}
            </Pressable>
          </View>
          <ScrollView bounces={false} contentContainerStyle={styles.upgradeBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.upgradeHeadline}>{isGold ? "Upgrade to huddle＊" : "Upgrade to huddle+"}</Text>
            <Text style={styles.upgradeSubheadline}>{isGold ? "Activate now to send stars and become a top profile in your area and find more connections!" : "Activate now to send stars and find 2x more connections!"}</Text>
            <Text style={styles.upgradePrice}>{pricing.price}<Text style={styles.upgradePriceUnit}> /mo</Text></Text>
            {pricing.annualNote ? <Text style={styles.upgradeAnnualNote}>{pricing.annualNote}</Text> : null}
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
              <Text style={[styles.upgradeCtaText, { color: themeColor }]}>{isGold ? "Upgrade to huddle＊" : "Upgrade to huddle+"}</Text>
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

export function StarsExhaustedModal({ onClose, open }: { onClose: () => void; open: boolean }) {
  if (!open) return null;
  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent visible={open}>
      <Pressable accessibilityLabel="Close Stars notice" onPress={onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={nativeModalStyles.appConfirmCard}>
            <View style={styles.starsExhaustedHeader}>
              <Text style={[nativeModalStyles.appConfirmTitle, styles.starsExhaustedTitle]}>Take a quick breather</Text>
              <AppModalIconButton accessibilityLabel="Close Stars notice" onPress={onClose}>
                <Feather color={huddleColors.text} name="x" size={22} />
              </AppModalIconButton>
            </View>
            <Text style={nativeModalStyles.appConfirmBody}>You've used up your Stars for now, but hang tight—they'll reset with your next membership cycle.</Text>
          </View>
        </Pressable>
      </Pressable>
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
  ghRoot: {
    flex: 1,
  },
  dim: {
    backgroundColor: huddleColors.backdrop,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.sectionDividerStrong,
    marginTop: huddleSpacing.x2,
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
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  headerTitleSparkle: {
    marginRight: 4,
    flexShrink: 0,
  },
  headerActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: huddleSpacing.x3,
  },
  headerWaveIcon: {
    transform: [{ rotate: "0deg" }],
  },
  headerTitle: {
    flexShrink: 1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  matchedChip: {
    flexShrink: 0,
    marginLeft: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: 3,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.premiumGoldSoft,
    borderWidth: 1,
    borderColor: huddleColors.premiumGold,
  },
  matchedChipText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.premiumGold,
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
  refreshNoticeText: {
    marginTop: huddleSpacing.x3,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.subtext,
  },
  pressed: {
    opacity: 0.88,
  },
  profileStarIcon: {
    alignItems: "center",
    justifyContent: "center",
  },
  profileStarIconFill: {
    position: "absolute",
  },
  confirmStarSendWrap: {
    flex: 1,
    minWidth: 0,
  },
  confirmStarSendHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: huddleRadii.button,
    backgroundColor: huddleColors.coral,
  },
  confirmStarSendGoldButton: {
    flex: 1,
    height: 48,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.coral,
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
  starsExhaustedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  starsExhaustedTitle: {
    flex: 1,
    minWidth: 0,
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
