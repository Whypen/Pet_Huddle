import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { NativeSpinner } from "./NativeSpinner";
import { NativePetMultiSelectCarousel } from "./NativePetMultiSelectCarousel";
import { NativeProfileAvatar } from "./NativeProfileAvatar";
import { NativeVerifiedBadge } from "./NativeVerifiedBadge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInRight, FadeOutLeft, LinearTransition, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import {
  fetchNativeProfileSummary,
  clearNativeProfileSummaryCache,
  readCachedNativeProfileSummary,
  patchNativeProfileSummaryCache,
  subscribeNativeProfileSummary,
  type NativeProfileSummary as NativeProfile,
  type NativeQuotaSnapshot,
} from "../lib/nativeProfileSummary";
import { ensureNativeDirectChatRoom, matchedSummaryToInboxRow, resolveNativeChatInboxRowNavigation } from "../lib/nativeChat";
import { writeNativeChatSelectedRowHandoff } from "../lib/nativeChatHandoff";
import { freshnessRegistry } from "../lib/nativeFreshnessRegistry";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import { addNativeFamilySharedPets, fetchNativeFamilySharedPetCandidates, type NativeFamilySharedPet } from "../lib/nativeFamilyPets";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { readCachedNativeHuddleRewardProgress, refreshNativeHuddleRewardProgress, type NativeHuddleRewardProgress } from "../lib/nativeHuddleRewards";
import { markNativeHuddleRewardCelebrated, resolveNativeHuddleRewardCelebration, type NativeHuddleRewardCelebrationTarget } from "../lib/nativeHuddleRewardCelebration";
import { NativeHuddleRewardCelebration } from "./NativeHuddleRewardCelebration";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { haptic } from "../lib/nativeHaptics";
import { nativeFreshImageKey, nativeFreshImageUri } from "../lib/nativeImageFreshness";
import { normalizeNativeProfilePhotoPresentationCrop } from "../lib/nativeProfilePhotos";
import { resolveNativeProfileImageUrlAsync } from "../lib/nativeStorageUrlCache";
import { formatNativeAddonPrice, loadNativeStoreProducts, type NativeStoreProductId, type NativeStoreProductState } from "../lib/nativeStoreSubscriptions";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { subscribeNativeVerifyIdentityUpdated } from "../lib/nativeVerifyIdentity";
import { huddleButtons, huddleColors, huddleFamilyAccount, huddleFieldStates, huddleFormFields, huddleGlassControls, huddleLayers, huddleLayout, huddleMotion, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { NativePublicProfileModal } from "./profile/NativePublicProfileModal";
import { NativeSupportScreen } from "../screens/NativeSupportScreen";
import { NativeHuddleFriendsSheet, type NativeHuddleFriendsSegment } from "./friends/NativeHuddleFriendsSheet";
import { AppModalActionRow, AppModalButton, AppModalCloseButton, AppModalField, AppModalToggleRow, SlideToConfirm } from "./nativeModalPrimitives";
import { huddleModalTokens, nativeModalStyles, nativeModalStyles as modalPrimitiveStyles } from "./nativeModalPrimitives.styles";

type NativeSettingsDrawerProps = {
  accessToken?: string | null;
  careMarketIsActive?: boolean;
  openFamilyIntent?: number;
  openAddFriendCodeIntent?: { code: string; invite?: string; nonce: number } | null;
  open: boolean;
  sessionKey?: string | null;
  userId: string | null;
  onClose: () => void;
  onOpen: () => void;
  onNavigate: (path: string) => void;
  onOpenSupport?: () => void;
  onSignOut: () => void;
};

type SettingsRow = {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  iconNode?: ReactNode;
  badge?: string;
  value?: string;
  danger?: boolean;
  muted?: boolean;
  onPress: () => void;
};

const tierLabel = (value?: string | null) => {
  const tier = String(value || "free").toLowerCase();
  if (tier === "gold" || tier === "huddle＊" || tier.startsWith("gold_")) return "huddle＊";
  if (
    tier === "plus" ||
    tier === "premium" ||
    tier === "huddle+" ||
    tier === "huddle plus" ||
    tier.startsWith("plus_") ||
    tier.startsWith("premium_")
  ) return "huddle+";
  return "Free";
};

const normalizedTier = (value?: string | null) => {
  const tier = String(value || "free").toLowerCase();
  if (tier === "gold" || tier === "huddle＊" || tier.startsWith("gold_")) return "gold";
  if (tier === "plus" || tier === "premium" || tier === "huddle+" || tier === "huddle plus" || tier.startsWith("plus_") || tier.startsWith("premium_")) return "plus";
  return "free";
};

const starQuotaLimit = (value?: string | null) => {
  const tier = normalizedTier(value);
  if (tier === "gold") return 10;
  if (tier === "plus") return 4;
  return 0;
};

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const nativeFamilyRpc = async <T,>(fn: string, params: Record<string, unknown>, accessToken?: string | null) => {
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, accessToken);
  if (error) throw error;
  return data as T;
};

const MAX_FAMILY_MEMBERS = 4;
type NativeFamilyViewerRole = "owner" | "member" | "invitee" | "none";

type NativeFamilyProfileLite = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  social_id: string | null;
  tier?: string | null;
  effective_tier?: string | null;
  family_slots?: number | null;
};

type NativeFamilyInviteRow = {
  family_member_id: string;
  status: "pending" | "accepted";
  created_at?: string | null;
  profile?: NativeFamilyProfileLite | null;
  owner_profile?: NativeFamilyProfileLite | null;
};

type NativeFamilyState = {
  code?: string | null;
  viewer_role: NativeFamilyViewerRole;
  owner_id: string | null;
  owner_profile: NativeFamilyProfileLite | null;
  accepted_members: NativeFamilyInviteRow[];
  pending_invites: NativeFamilyInviteRow[];
  pending_invite: NativeFamilyInviteRow | null;
  quota_used: number;
  quota_limit: number;
  can_invite: boolean;
  can_cancel: boolean;
  can_remove: boolean;
  can_accept: boolean;
  can_decline: boolean;
  can_leave: boolean;
};

type NativeFamilySearchResult = NativeFamilyProfileLite & { tier: string | null };
type NativeFamilyActionCode =
  | "invited"
  | "accepted"
  | "declined"
  | "cancelled"
  | "removed"
  | "left"
  | "already_family"
  | "invite_already_pending"
  | "already_in_other_family"
  | "quota_full"
  | "upgrade_required"
  | "blocked"
  | "not_found"
  | "not_allowed"
  | "invalid_state";

type NativeFamilyActionResult = {
  code?: NativeFamilyActionCode | string | null;
  family_member_id?: string | null;
  quota_used?: number | null;
  quota_limit?: number | null;
};

const coerceNonNegativeInt = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

type NativeFamilySummary = {
  usedSlots: number;
  totalSlots: number;
  hasPendingInvite?: boolean;
  showQuota?: boolean;
};

const familyActionMessages: Record<string, string> = {
  quota_full: "You've reached your family member limit.",
  upgrade_required: "You've reached your family member limit.",
  already_family: "They're already in your family.",
  invite_already_pending: "Invite already sent.",
  already_in_other_family: "They're already in another Family Account.",
  blocked: "This person can't be added.",
  not_allowed: "This person can't be added.",
  not_found: "This person can't be added.",
  invalid_state: "This invite is no longer available.",
  missing_access_token: "Please sign in again.",
};

const familyActionMessage = (code: unknown, fallback = "Please try again.") => (
  familyActionMessages[String(code || "")] || fallback
);

const withNativeFamilyLoadTimeout = <T,>(promise: Promise<T>) => (
  Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("family_account_load_timeout")), 10000);
    }),
  ])
);

const fetchNativeFamilyAccountState = (accessToken?: string | null) =>
  nativeFamilyRpc<NativeFamilyState>("get_native_family_account_state", {}, accessToken);

const searchNativeFamilyInviteCandidates = (query: string, accessToken?: string | null) =>
  nativeFamilyRpc<NativeFamilySearchResult[]>("search_native_family_invite_candidates", {
    p_query: query,
    p_limit: 10,
  }, accessToken);

const createNativeFamilyInvite = (inviteeUserId: string, allowPetSharing: boolean, accessToken?: string | null) =>
  nativeFamilyRpc<NativeFamilyActionResult>("create_native_family_invite", {
    p_invitee_user_id: inviteeUserId,
    p_allow_pet_sharing: allowPetSharing,
  }, accessToken);

const runNativeFamilyAction = async (
  fn: string,
  params: Record<string, unknown>,
  accessToken?: string | null,
) => {
  const result = await nativeFamilyRpc<NativeFamilyActionResult>(fn, params, accessToken);
  const code = String(result?.code || "");
  if (!["invited", "accepted", "declined", "cancelled", "removed", "left"].includes(code)) {
    const error = new Error(code || "family_action_failed") as Error & { code?: string };
    error.code = code;
    throw error;
  }
  return result;
};

function NativeFamilyAvatarButton({
  avatarUrl,
  disabled,
  onPress,
}: {
  avatarUrl?: string | null;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raw = String(avatarUrl || "").trim();
    if (!raw) {
      setResolvedUrl(null);
      return () => {
        cancelled = true;
      };
    }
    void resolveNativeProfileImageUrlAsync(raw, 60 * 60, { defaultBucket: "profile_photos" })
      .then((url) => {
        if (!cancelled) setResolvedUrl(url || raw);
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(raw);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  return (
    <Pressable
      accessibilityLabel="Open profile"
      accessibilityRole="button"
      disabled={disabled || !onPress}
      hitSlop={huddleSpacing.x2}
      onPress={onPress}
      style={styles.familyMemberAvatar}
    >
      {resolvedUrl ? (
        <ExpoImage accessibilityIgnoresInvertColors key={nativeFreshImageKey(resolvedUrl, avatarUrl || resolvedUrl)} source={{ uri: nativeFreshImageUri(resolvedUrl, avatarUrl || resolvedUrl) }} style={styles.familyMemberAvatarImage} contentFit="cover" cachePolicy="memory-disk" transition={120} />
      ) : (
        <Feather color={huddleColors.mutedText} name="user" size={18} />
      )}
    </Pressable>
  );
}

const DRAWER_PANEL_OFFSCREEN = 320;

export function NativeSettingsDrawer({ accessToken, careMarketIsActive = false, openAddFriendCodeIntent, openFamilyIntent, open, sessionKey, userId, onClose, onOpen, onNavigate, onSignOut }: NativeSettingsDrawerProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // Right-slide drawer animation. `rendered` keeps the Modal mounted through the
  // close animation; panelX slides the right-anchored panel in/out, backdrop fades.
  const [rendered, setRendered] = useState(open);
  const panelX = useSharedValue(open ? 0 : DRAWER_PANEL_OFFSCREEN);
  const backdropOpacity = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    if (open) {
      setRendered(true);
      panelX.value = withTiming(0, { duration: reduceMotion ? 0 : 240 });
      backdropOpacity.value = withTiming(1, { duration: reduceMotion ? 0 : 180 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: reduceMotion ? 0 : 160 });
      panelX.value = withTiming(DRAWER_PANEL_OFFSCREEN, { duration: reduceMotion ? 0 : 200 }, (finished) => {
        if (finished) runOnJS(setRendered)(false);
      });
    }
  }, [open, reduceMotion, panelX, backdropOpacity]);
  const panelAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateX: panelX.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const [profile, setProfile] = useState<NativeProfile | null>(null);
  const [quota, setQuota] = useState<NativeQuotaSnapshot | null>(null);
  const [profileHydratedForOpen, setProfileHydratedForOpen] = useState(false);
  const [familyStatePreview, setFamilyStatePreview] = useState<NativeFamilyState | null>(null);
  const [familySummary, setFamilySummary] = useState<NativeFamilySummary | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [huddleFriendsOpen, setHuddleFriendsOpen] = useState(false);
  const [huddleFriendsSegment, setHuddleFriendsSegment] = useState<NativeHuddleFriendsSegment>("code");
  const [huddleFriendsNonce, setHuddleFriendsNonce] = useState(0);
  const [addFriendInitialCode, setAddFriendInitialCode] = useState("");
  const [addFriendInviteToken, setAddFriendInviteToken] = useState("");
  const [carerGateOpen, setCarerGateOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [huddleRewardsOpen, setHuddleRewardsOpen] = useState(false);
  const [huddleRewardProgress, setHuddleRewardProgress] = useState<NativeHuddleRewardProgress | null>(null);
  const [celebrationTarget, setCelebrationTarget] = useState<NativeHuddleRewardCelebrationTarget | null>(null);
  const [hasCarerProfile, setHasCarerProfile] = useState(false);
  const [hasListedCarerProfile, setHasListedCarerProfile] = useState(false);
  const [familyInviteProfileUserId, setFamilyInviteProfileUserId] = useState<string | null>(null);
  const [familyInviteProfileFallbackData, setFamilyInviteProfileFallbackData] = useState<Record<string, unknown> | null>(null);
  // One NativePublicProfileModal serves both callers. Family invites open it
  // read-only; a friend opens it with the same actions Chats gives a matched peer.
  const [profileSheetSource, setProfileSheetSource] = useState<"family" | "friend">("family");
  const consumedFamilyIntentRef = useRef(0);
  const refreshErrorRef = useRef<{ family?: string; profile?: string }>({});

  const resetDrawerData = useCallback(() => {
    const emptyProfile: NativeProfile | null = null;
    const emptyQuota: NativeQuotaSnapshot | null = null;
    const emptyFamilySummary: NativeFamilySummary | null = null;
    setProfile(emptyProfile);
    setQuota(emptyQuota);
    setFamilyStatePreview(null);
    setFamilySummary(emptyFamilySummary);
    refreshErrorRef.current = {};
  }, []);

  const applyFamilyStatePreview = useCallback((state: NativeFamilyState | null) => {
    setFamilyStatePreview(state);
    if (!state) {
      setFamilySummary(null);
      return;
    }
    const acceptedMemberCount = 1 + (Array.isArray(state.accepted_members) ? state.accepted_members.length : 0);
    const ownerQuotaUsed = coerceNonNegativeInt(state.quota_used);
    const showQuota = state.viewer_role === "owner" && !state.pending_invite;
    setFamilySummary({
      usedSlots: showQuota ? Math.max(1, ownerQuotaUsed) : Math.max(1, acceptedMemberCount),
      totalSlots: Math.max(1, coerceNonNegativeInt(state.quota_limit)),
      hasPendingInvite: Boolean(state.pending_invite),
      showQuota,
    });
  }, []);

  const loadDrawerFamilyState = useCallback(async () => {
    if (!userId) {
      applyFamilyStatePreview(null);
      return null;
    }
    try {
      const state = await withNativeFamilyLoadTimeout(fetchNativeFamilyAccountState(accessToken));
      applyFamilyStatePreview(state);
      return state;
    } catch {
      refreshErrorRef.current = { ...refreshErrorRef.current, family: "family_refresh_failed" };
      return null;
    }
  }, [accessToken, applyFamilyStatePreview, userId]);

  const shouldHydrateProfile = open || familyOpen;

  useEffect(() => {
    if (!shouldHydrateProfile) return;
    if (!userId) {
      resetDrawerData();
      return;
    }
    let cancelled = false;
    let freshProfileApplied = false;
    const applyProfileSummary = (
      { profile: nextProfile, quota: nextQuota }: { profile: NativeProfile | null; quota: NativeQuotaSnapshot | null },
      source: "cache" | "fresh",
    ) => {
      if (cancelled) return;
      if (source === "cache" && freshProfileApplied) return;
      if (source === "fresh") freshProfileApplied = true;
      setProfile(nextProfile);
      setQuota(nextQuota);
      setProfileHydratedForOpen(true);
      if (nextProfile?.avatar_url) {
        void ExpoImage.prefetch(nativeFreshImageUri(nextProfile.avatar_url, nextProfile.avatar_url));
      }
    };

    void readCachedNativeProfileSummary(userId, { sessionKey }).then((cached) => {
      if (cached) applyProfileSummary(cached, "cache");
    });
    void fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey }).then((summary) => applyProfileSummary(summary, "fresh"), () => {
      if (!cancelled) {
        refreshErrorRef.current = { ...refreshErrorRef.current, profile: "profile_refresh_failed" };
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, resetDrawerData, sessionKey, shouldHydrateProfile, userId]);

  useEffect(() => {
    if (!shouldHydrateProfile || !userId) return undefined;
    return subscribeNativeProfileSummary(userId, ({ profile: nextProfile, quota: nextQuota }) => {
      setProfile(nextProfile);
      setQuota(nextQuota);
    }, { sessionKey });
  }, [sessionKey, shouldHydrateProfile, userId]);

  // Verification refreshes are authoritative server results. Keep the drawer's
  // retained profile state in step with that result, including a downgrade, so
  // reopening Settings cannot briefly show a badge the identity screen removed.
  useEffect(() => {
    if (!userId) return undefined;
    return subscribeNativeVerifyIdentityUpdated((event) => {
      if (event.userId !== userId || typeof event.verified !== "boolean") return;
      const verificationStatus = event.verified ? "verified" : (event.snapshot?.verificationStatus || "pending");
      const verificationPatch = { is_verified: event.verified, verification_status: verificationStatus };
      setProfile((current) => current ? { ...current, ...verificationPatch } : current);
      void patchNativeProfileSummaryCache(userId, verificationPatch, { sessionKey });
    });
  }, [sessionKey, userId]);

  // Existing profiles remain accessible even if identity verification later changes.
  // Listed state separately controls the orange active-carer icon.
  useEffect(() => {
    if (!shouldHydrateProfile || !userId) {
      setHasCarerProfile(false);
      setHasListedCarerProfile(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getFreshNativeAccessToken(accessToken);
        if (!token || cancelled) return;
        // Orange = an *active/listed* carer profile (not a half-saved draft).
        const url = `${supabaseUrl}/rest/v1/pet_care_profiles?select=user_id,listed&user_id=eq.${encodeURIComponent(userId)}&limit=1`;
        const response = await fetch(url, { headers: createNativeAuthenticatedHeaders(token) });
        if (!response.ok || cancelled) return;
        const rows = (await response.json().catch(() => [])) as Array<{ listed?: boolean | null }>;
        if (!cancelled) {
          const carerProfile = Array.isArray(rows) ? rows[0] : null;
          setHasCarerProfile(Boolean(carerProfile));
          setHasListedCarerProfile(carerProfile?.listed === true);
        }
      } catch {
        // Non-critical: leave the icon in its default state on failure.
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, shouldHydrateProfile, userId]);

  useEffect(() => {
    if ((!open && !familyOpen) || !userId) return;
    void loadDrawerFamilyState();
  }, [familyOpen, loadDrawerFamilyState, open, userId]);

  useEffect(() => {
    if (!open) {
      setProfileHydratedForOpen(false);
      setLegalOpen(false);
      setFamilyOpen(false);
      setHuddleFriendsOpen(false);
      setCarerGateOpen(false);
      setSupportOpen(false);
      setHuddleRewardsOpen(false);
    }
  }, [open]);

  const displayName = profile?.display_name || profile?.email || "User";
  const tierValue = profileHydratedForOpen ? quota?.effective_tier || quota?.tier || profile?.effective_tier || profile?.tier : null;
  const starTierValue = profile?.tier || "free";
  const membershipLabel = profileHydratedForOpen ? tierLabel(tierValue) : "Loading";
  const membershipTier = normalizedTier(tierValue);
  const realTier = normalizedTier(starTierValue);
  const starUsed = numberValue(quota?.stars_used_cycle ?? quota?.stars_month_used);
  const starExtras = numberValue(quota?.extra_stars ?? quota?.extras_stars);
  const starLimit = starQuotaLimit(starTierValue);
  const starRemaining = Math.max(0, starLimit - starUsed) + starExtras;
  const starQuotaLabel = String(Math.max(0, starRemaining));
  const showStarQuotaPill = !(realTier === "free" && starRemaining <= 0);
  const familySummaryLabel = familySummary && !(familySummary.usedSlots === 1 && familySummary.totalSlots === 1)
    ? familySummary.showQuota ? `(${familySummary.usedSlots}/${familySummary.totalSlots})` : String(familySummary.usedSlots)
    : undefined;
  const familyInviteBadge = familySummary?.hasPendingInvite ? "You're invited" : undefined;
  const isVerified = profileHydratedForOpen && isNativeVerifiedProfile(profile);

  const openPath = useCallback((path: string) => {
    haptic.selectTab();
    onClose();
    onNavigate(path);
  }, [onClose, onNavigate]);

  const openSupportModal = useCallback(() => {
    haptic.selectTab();
    setLegalOpen(false);
    setSupportOpen(true);
  }, []);

  const openFamilyAccount = useCallback(() => {
    setLegalOpen(false);
    setFamilyOpen(true);
  }, []);

  const openHuddleFriends = useCallback((segment: NativeHuddleFriendsSegment = "code", code = "", invite = "") => {
    setLegalOpen(false);
    setAddFriendInitialCode(code);
    setAddFriendInviteToken(invite);
    setHuddleFriendsSegment(segment);
    setHuddleFriendsNonce((value) => value + 1);
    setHuddleFriendsOpen(true);
  }, []);

  const openFamilyUpgrade = useCallback(() => {
    setFamilyOpen(false);
    openPath("/premium");
  }, [openPath]);

  const openCarerProfile = useCallback(() => {
    if (isVerified || hasCarerProfile) {
      openPath("/carerprofile");
      return;
    }
    setLegalOpen(false);
    setCarerGateOpen(true);
  }, [hasCarerProfile, isVerified, openPath]);

  const openVerifyIdentity = useCallback(() => {
    setCarerGateOpen(false);
    openPath("/verify-identity");
  }, [openPath]);

  useEffect(() => {
    if (!shouldHydrateProfile || !userId) {
      setHuddleRewardProgress(null);
      return;
    }
    let cancelled = false;
    void readCachedNativeHuddleRewardProgress(userId, { sessionKey }).then((cached) => {
      if (!cancelled && cached) setHuddleRewardProgress(cached);
    });
    void refreshNativeHuddleRewardProgress(userId, { accessToken, force: true, sessionKey }).then((progress) => {
      if (!cancelled) setHuddleRewardProgress(progress);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, sessionKey, shouldHydrateProfile, userId]);

  // The promo engine rolls `state` back to "progress" as soon as a higher
  // milestone exists, so the reward moment is driven off a newly granted
  // reward rather than off `state === "completed"`.
  useEffect(() => {
    if (!open || !userId || !huddleRewardProgress) return undefined;
    let cancelled = false;
    void resolveNativeHuddleRewardCelebration(userId, huddleRewardProgress).then((target) => {
      if (cancelled || !target) return;
      setCelebrationTarget(target);
      void markNativeHuddleRewardCelebrated(userId, target.key);
      // The grant is already authoritative in Postgres. Force every shared
      // profile/quota consumer onto that new tier now, rather than waiting for
      // a stale six-hour profile cache or the next app foreground.
      freshnessRegistry.invalidate(sessionKey, [
        "profile_summary",
        "tier_quota_restrictions",
        "viewer_location_scope",
        "map_shell",
        "discover_cards",
      ]);
      void clearNativeProfileSummaryCache(userId)
        .then(() => fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey }))
        .catch(() => undefined);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [accessToken, huddleRewardProgress, open, sessionKey, userId]);

  const mainRows = useMemo<Array<SettingsRow[]>>(
    () => [
      [
        { label: "Manage Membership", icon: "star", onPress: () => openPath("/premium") },
        { label: "Family Account", icon: "users", badge: familyInviteBadge, value: familySummaryLabel, onPress: openFamilyAccount },
        { label: "huddle friends", icon: "user-plus", onPress: () => openHuddleFriends("code") },
      ],
      [
        {
          label: "Identity Verification",
          iconNode: (
            <View style={[styles.identityIconBadge, isVerified ? styles.identityIconBadgeVerified : null]}>
              <Feather color={isVerified ? huddleColors.onPrimary : huddleColors.iconMuted} name="shield" size={isVerified ? 12 : 18} />
            </View>
          ),
          value: isVerified ? "Verified" : undefined,
          onPress: () => openPath("/verify-identity?from=settings"),
        },
        ...(careMarketIsActive ? [{
          label: "Care Profile",
          // Filled coral heart once a carer profile exists ("active carer"); grey outline otherwise.
          iconNode: (
            <MaterialCommunityIcons
              color={hasListedCarerProfile ? huddleColors.coral : huddleColors.iconMuted}
              name={hasListedCarerProfile ? "heart" : "heart-outline"}
              size={18}
            />
          ),
          onPress: openCarerProfile,
        } as SettingsRow] : []),
        { label: "Account Settings", icon: "user", onPress: () => openPath("/settings") },
      ],
      [
        { label: "Help & Support", icon: "help-circle", onPress: openSupportModal },
        { label: "Legal Information", icon: "file-text", onPress: () => setLegalOpen(true) },
      ],
      [{ label: "Log out", icon: "log-out", danger: true, onPress: onSignOut }],
    ],
    [careMarketIsActive, familyInviteBadge, familySummaryLabel, hasListedCarerProfile, isVerified, onSignOut, openCarerProfile, openFamilyAccount, openHuddleFriends, openPath, openSupportModal],
  );


  const legalRows = useMemo<SettingsRow[]>(
    () => [
      { label: "Privacy Policy", icon: "shield", onPress: () => openPath("/privacy") },
      { label: "Privacy Choices", icon: "shield", onPress: () => openPath("/privacy-choices") },
      { label: "Personal Information Collection Notice", icon: "file-text", onPress: () => openPath("/collection-notice") },
      { label: "Terms of Service", icon: "file-text", onPress: () => openPath("/terms") },
      { label: "Community Guidelines", icon: "file-text", onPress: () => openPath("/community-guidelines") },
      { label: "Cookies and Similar Technologies Notice", icon: "file-text", onPress: () => openPath("/cookies") },
      ...(careMarketIsActive ? [{
        label: "Care Agreement",
        iconNode: <MaterialCommunityIcons color={huddleColors.iconMuted} name="paw-outline" size={18} />,
        onPress: () => openPath("/service-provider-agreement"),
      } as SettingsRow,
      {
        label: "Care Service Booking Terms",
        iconNode: <MaterialCommunityIcons color={huddleColors.iconMuted} name="paw-outline" size={18} />,
        onPress: () => openPath("/booking-terms"),
      } as SettingsRow] : []),
    ],
    [careMarketIsActive, openPath],
  );

  const closeFamilyAccount = useCallback(() => {
    setFamilyOpen(false);
  }, []);

  const closeFamilyAccountForMembership = useCallback(() => {
    setFamilyOpen(false);
    openFamilyUpgrade();
  }, [openFamilyUpgrade]);

  useEffect(() => {
    if (!openFamilyIntent) return;
    if (consumedFamilyIntentRef.current === openFamilyIntent) return;
    consumedFamilyIntentRef.current = openFamilyIntent;
    setLegalOpen(false);
    onOpen();
  }, [onOpen, openFamilyIntent]);

  useEffect(() => {
    const code = String(openAddFriendCodeIntent?.code || "").replace(/\D/g, "").slice(0, 6);
    const invite = String(openAddFriendCodeIntent?.invite || "");
    if (!openAddFriendCodeIntent?.nonce || (!code && !invite)) return;
    openHuddleFriends("scan", code, invite);
    onOpen();
  }, [onOpen, openAddFriendCodeIntent?.code, openAddFriendCodeIntent?.invite, openAddFriendCodeIntent?.nonce, openHuddleFriends]);

  return (
    <>
      <Modal animationType="none" onRequestClose={onClose} transparent visible={rendered}>
        <Animated.View style={[styles.backdrop, backdropAnimStyle]}>
          <Pressable accessibilityLabel="Close settings" onPress={onClose} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.panel, panelAnimStyle]}>
            <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + huddleSpacing.x7 + huddleSpacing.x5 }]} showsVerticalScrollIndicator={false}>
              {legalOpen ? (
                <>
                  <Pressable accessibilityLabel="Back to settings" onPress={() => setLegalOpen(false)} style={styles.backRow}>
                    <Feather color={huddleColors.iconMuted} name="chevron-left" size={19} />
                    <Text style={styles.backLabel}>Legal Information</Text>
                  </Pressable>
                  <View style={styles.group}>
                    {legalRows.map((row, index) => (
                      <DrawerRow key={row.label} last={index === legalRows.length - 1} row={row} />
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Pressable accessibilityLabel="Edit profile" onPress={() => openPath("/edit-profile")} style={styles.profileRow}>
                    <View>
                      <NativeProfileAvatar
                        uri={profile?.avatar_url}
                        presentationCrop={normalizeNativeProfilePhotoPresentationCrop((profile?.photos as Record<string, unknown> | null)?.avatar_presentation)}
                        userId={profile?.id}
                        version={profile?.updated_at}
                        size={48}
                        verified={isVerified}
                        name={displayName}
                        engagement={profile?.engagement ?? null}
                      />
                      {isVerified ? (
                        <NativeVerifiedBadge compact size={20} style={styles.avatarBadge} />
                      ) : null}
                    </View>
                    <View style={styles.profileText}>
                      <Text numberOfLines={1} style={styles.profileName}>{displayName}</Text>
                      <View pointerEvents="none" style={styles.pillRow}>
                        <View
                          style={[
                            styles.tierPill,
                            membershipTier === "gold" && styles.tierPillGold,
                            membershipTier === "plus" && styles.tierPillPlus,
                          ]}
                        >
                          <Text numberOfLines={1} style={[styles.tierPillText, membershipTier !== "free" && styles.pillTextOnDark]}>
                            {membershipLabel}
                          </Text>
                        </View>
                        {showStarQuotaPill ? (
                          <View style={[styles.starsPill, starRemaining <= 0 && styles.starsPillEmpty]}>
                            <Text numberOfLines={1} style={[styles.starsPillText, starRemaining <= 0 && styles.starsPillTextEmpty]}>
                              {starQuotaLabel} ⭐
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Feather color={huddleColors.mutedText} name="chevron-right" size={17} />
                  </Pressable>

                  {huddleRewardProgress?.visible ? (
                    <Pressable
                      accessibilityLabel={`Open Huddle Rewards. ${Math.max(0, huddleRewardProgress.friend_count ?? 0)} of ${huddleRewardProgress.friend_target ?? 0} friends added.`}
                      accessibilityRole="button"
                      onPress={() => setHuddleRewardsOpen(true)}
                      style={styles.huddleRewardsBanner}
                    >
                      {huddleRewardProgress.goal_type === "add_friend" && huddleRewardProgress.friend_target ? (
                        <Text
                          adjustsFontSizeToFit
                          minimumFontScale={0.65}
                          numberOfLines={1}
                          style={[
                            styles.huddleRewardsRemaining,
                            huddleRewardProgress.state === "completed" ? { color: promoAccentColor(huddleRewardProgress) } : null,
                          ]}
                        >
                          {huddleRewardProgress.state === "completed"
                            ? Math.max(1, huddleRewardProgress.reward_months ?? 1)
                            : Math.max(0, huddleRewardProgress.friend_target - (huddleRewardProgress.friend_count ?? 0))}
                        </Text>
                      ) : null}
                      <View style={styles.huddleRewardsCopy}>
                        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.huddleRewardsTitle}>
                          {huddleRewardProgress.state === "completed" && huddleRewardProgress.reward_tier === "gold"
                            ? `${Math.max(1, huddleRewardProgress.reward_months ?? 1) === 1 ? "month" : "months"} of`
                            : huddleRewardProgress.state === "completed"
                              ? "Bonus unlocked"
                              : (huddleRewardProgress.drawer_headline || "Friends to add")}
                        </Text>
                        {huddleRewardProgress.state === "completed" ? (
                          <Text numberOfLines={1} style={styles.huddleRewardsMeta}>
                            {huddleRewardProgress.reward_tier === "gold"
                              ? <><Text style={[styles.huddleRewardsAccent, { color: promoAccentColor(huddleRewardProgress) }]}>huddle＊</Text> · free</>
                              : "Your reward is active"}
                          </Text>
                        ) : huddleRewardProgress.goal_type === "add_friend" && huddleRewardProgress.friend_target ? (
                          <>
                            <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.huddleRewardsMeta}>
                              for <Text style={[styles.huddleRewardsAccent, { color: promoAccentColor(huddleRewardProgress) }]}>{huddleRewardProgress.reward_tier === "gold" ? "huddle＊" : "huddle+"}</Text>
                            </Text>
                            <View style={styles.huddleRewardsSegments}>
                              {Array.from({ length: 10 }, (_, index) => (
                                <View
                                  key={index}
                                  style={[
                                    styles.huddleRewardsSegment,
                                    index < Math.round(Math.min(1, Math.max(0,
                                      ((huddleRewardProgress.friend_count ?? 0) - (huddleRewardProgress.friend_progress_start ?? 0))
                                      / Math.max(1, (huddleRewardProgress.friend_target ?? 1) - (huddleRewardProgress.friend_progress_start ?? 0)),
                                    )) * 10)
                                      ? { backgroundColor: promoAccentColor(huddleRewardProgress) }
                                      : null,
                                  ]}
                                />
                              ))}
                            </View>
                          </>
                        ) : (
                          <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.huddleRewardsMeta}>
                            Earn <Text style={styles.huddleRewardsAccent}>{huddleRewardProgress.reward_tier === "gold" ? "huddle＊" : "huddle+"}</Text>
                          </Text>
                        )}
                      </View>
                      <View pointerEvents="none" style={styles.huddleRewardsChevron}>
                        <Feather color={huddleColors.onPrimary} name="chevron-right" size={18} />
                      </View>
                    </Pressable>
                  ) : null}

                  {mainRows.map((group, groupIndex) => (
                    <View key={groupIndex} style={styles.group}>
                      {group.map((row, index) => (
                        <DrawerRow key={row.label} last={index === group.length - 1} row={row} />
                      ))}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </Animated.View>
          <NativeCarerGateModal
            isOpen={carerGateOpen}
            onClose={() => setCarerGateOpen(false)}
            onVerify={openVerifyIdentity}
          />
          <NativeSupportDrawerModal
            accessToken={accessToken}
            accountEmail={profile?.email ?? null}
            isOpen={supportOpen}
            onClose={() => setSupportOpen(false)}
          />
          <NativeHuddleRewardCelebration
            accentColor={celebrationTarget
              ? promoAccentForTier(huddleRewardProgress?.accent_template, celebrationTarget.rewardTier)
              : huddleColors.lime}
            target={celebrationTarget}
            onClose={() => {
              setCelebrationTarget(null);
              if (!userId) return;
              void refreshNativeHuddleRewardProgress(userId, { accessToken, force: true, sessionKey })
                .then(setHuddleRewardProgress)
                .catch(() => undefined);
            }}
          />
          <NativeHuddleRewardsSheet
            progress={huddleRewardProgress}
            isOpen={huddleRewardsOpen}
            onClose={() => setHuddleRewardsOpen(false)}
            onOpenAddFriend={() => {
              setHuddleRewardsOpen(false);
              openHuddleFriends("code");
            }}
            onNavigate={(path) => {
              setHuddleRewardsOpen(false);
              onClose();
              onNavigate(path);
            }}
          />
          <NativeFamilyAccountSheet
            accessToken={accessToken}
            currentProfile={profile}
            currentUserId={userId}
            initialState={familyStatePreview}
            isOpen={familyOpen}
            quotaTier={tierValue}
            familySummary={familySummary}
            onFamilySummaryChange={setFamilySummary}
            onClose={closeFamilyAccount}
            onOpenMembership={closeFamilyAccountForMembership}
            onOpenProfile={(profileRow) => {
              setFamilyInviteProfileFallbackData({
                id: profileRow.id,
                avatar_url: profileRow.avatar_url,
                display_name: profileRow.display_name,
                social_id: profileRow.social_id,
                effective_tier: profileRow.effective_tier,
                tier: profileRow.tier,
              });
              setProfileSheetSource("family");
              setFamilyInviteProfileUserId(profileRow.id);
            }}
          />
          <NativeHuddleFriendsSheet
            accessToken={accessToken}
            currentProfile={profile}
            currentUserId={userId}
            initialCode={addFriendInitialCode}
            initialInviteToken={addFriendInviteToken}
            initialSegment={huddleFriendsSegment}
            isOpen={huddleFriendsOpen}
            onClose={() => setHuddleFriendsOpen(false)}
            onDiscoveryChanged={(enabled) => {
              setProfile((current) => current ? { ...current, contact_discovery_enabled: enabled } : current);
              if (userId) void patchNativeProfileSummaryCache(userId, { contact_discovery_enabled: enabled }, { sessionKey });
            }}
            onNeedsPhoneVerification={() => { setHuddleFriendsOpen(false); openPath("/settings"); }}
            onOpenChatRoom={(roomId, peerUserId) => {
              setHuddleFriendsOpen(false);
              onClose();
              onNavigate(`/chat-dialogue?room=${encodeURIComponent(roomId)}&with=${encodeURIComponent(peerUserId)}&returnTo=${encodeURIComponent("/chats?tab=friends")}`);
            }}
            onOpenPeerChat={(peer) => {
              // Same link Chats uses, so a friend with no room yet still opens one.
              const row = matchedSummaryToInboxRow(peer);
              // Chats hands the dialogue its row before navigating. Without it the
              // header mounts with no peer data, shows the route avatar, then swaps
              // to the "Animal Friend" fallback once the profile fetch lands.
              writeNativeChatSelectedRowHandoff({ row, sessionKey, userId });
              void resolveNativeChatInboxRowNavigation(
                row,
                (targetUserId, targetName) => ensureNativeDirectChatRoom(targetUserId, targetName, { accessToken, actorId: userId }),
              ).then((path) => {
                setHuddleFriendsOpen(false);
                onClose();
                onNavigate(path);
              }).catch(() => undefined);
            }}
            onOpenPeerProfile={(peer) => {
              setProfileSheetSource("friend");
              setFamilyInviteProfileFallbackData({
                id: peer.peerUserId,
                display_name: peer.displayName,
                avatar_url: peer.avatarUrl,
                is_verified: peer.isVerified,
                social_id: peer.socialId,
                updated_at: peer.matchedAt,
              });
              setFamilyInviteProfileUserId(peer.peerUserId);
            }}
            openNonce={huddleFriendsNonce}
          />
        </Animated.View>
      </Modal>
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        viewerUserId={userId}
        fallbackData={familyInviteProfileFallbackData}
        hideActions={profileSheetSource === "family"}
        hideMatchedActions={profileSheetSource === "friend"}
        onClose={() => {
          setFamilyInviteProfileUserId(null);
          setFamilyInviteProfileFallbackData(null);
        }}
        onNavigate={onNavigate}
        open={Boolean(familyInviteProfileUserId)}
        profileUserId={familyInviteProfileUserId}
        sessionKey={sessionKey}
      />
    </>
  );
}

function DrawerRow({ row, last }: { row: SettingsRow; last: boolean }) {
  const onRowPress = () => {
    // MP10/MP11: every drawer row gets a tactile tick. Danger rows (sign-out/delete) feel heavier.
    if (row.danger) haptic.destructive(); else haptic.selectTab();
    row.onPress();
  };
  return (
    <Pressable onPress={onRowPress} style={[styles.row, !last && styles.rowBorder]}>
      {row.iconNode ?? (row.icon ? <Feather color={row.danger ? huddleColors.validationRed : row.muted ? huddleColors.mutedText : huddleColors.iconMuted} name={row.icon} size={17} /> : null)}
      <Text ellipsizeMode="tail" numberOfLines={1} style={[styles.rowLabel, row.danger && styles.rowDanger, row.muted && styles.rowMuted]}>{row.label}</Text>
      {row.badge ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rowBadge}>{row.badge}</Text> : null}
      {row.value ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.rowValue}>{row.value}</Text> : null}
    </Pressable>
  );
}

function NativeCarerGateModal({ isOpen, onClose, onVerify }: { isOpen: boolean; onClose: () => void; onVerify: () => void }) {
  if (!isOpen) return null;
  return (
    <View style={[styles.carerGateOverlay, modalPrimitiveStyles.appModalSafeArea]}>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      <Pressable onPress={(event) => event.stopPropagation()} style={[modalPrimitiveStyles.appModalCard, styles.carerGateCard]}>
        <View style={styles.carerGateCopy}>
          <Text style={styles.carerGateTitle}>Identity verification required</Text>
          <Text style={styles.carerGateBody}>Finish verification to start offering trusted pet care.</Text>
        </View>
        <View style={styles.carerGateActions}>
          <Pressable onPress={onClose} style={styles.carerGateSecondary}>
            <Text style={styles.carerGateSecondaryText}>Not now</Text>
          </Pressable>
          <Pressable onPress={onVerify} style={styles.carerGatePrimary}>
            <Text style={styles.carerGatePrimaryText}>Verify now</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

function NativeSupportDrawerModal({
  accessToken,
  accountEmail,
  isOpen,
  onClose,
}: {
  accessToken?: string | null;
  accountEmail?: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <View style={styles.supportDrawerOverlay}>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.supportDrawerCard}>
        <Pressable
          accessibilityLabel="Close support modal"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.supportDrawerClose}
        >
          <Feather color={huddleColors.iconMuted} name="x" size={22} />
        </Pressable>
        <NativeSupportScreen
          accessToken={accessToken}
          accountEmail={accountEmail}
          onCancel={onClose}
        />
      </Pressable>
    </View>
  );
}

const promoAccentForTier = (template: NativeHuddleRewardProgress["accent_template"], tier: NativeHuddleRewardProgress["reward_tier"]) => {
  if (template === "orange") return huddleColors.coral;
  if (template === "lime") return huddleColors.lime;
  return tier === "gold" ? huddleColors.coral : huddleColors.lime;
};
const promoAccentColor = (progress: NativeHuddleRewardProgress) => promoAccentForTier(progress.accent_template, progress.reward_tier);

function NativeHuddleRewardsSheet({
  progress,
  isOpen,
  onClose,
  onOpenAddFriend,
  onNavigate,
}: {
  progress: NativeHuddleRewardProgress | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenAddFriend: () => void;
  onNavigate: (path: string) => void;
}) {
  if (!isOpen || !progress?.visible) return null;
  const goalRoutes: Record<string, string> = {
    get_verified: "/verify-identity",
    complete_profile: "/edit-profile",
    add_first_pet: "/edit-pet-profile",
    become_listed_carer: "/carerprofile",
    complete_care_booking: "/service",
  };
  const goalRoute = goalRoutes[progress.goal_type || ""];
  const tierLabel = progress.reward_tier === "gold" ? "huddle＊" : "huddle+";
  const isNumericGoal = progress.goal_type === "add_friend" && Boolean(progress.friend_target);
  const currentCount = Math.max(0, progress.friend_count ?? 0);
  const progressStart = Math.max(0, progress.friend_progress_start ?? 0);
  const targetCount = Math.max(1, progress.friend_target ?? 1);
  const remainingCount = Math.max(0, targetCount - currentCount);
  const progressPercent = Math.min(100, Math.max(0, ((currentCount - progressStart) / Math.max(1, targetCount - progressStart)) * 100));
  const accentColor = promoAccentColor(progress);
  const ctaForeground = accentColor === huddleColors.coral ? huddleColors.onPrimary : huddleColors.text;
  return (
    <View style={styles.rewardsOverlay}>
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      <Pressable onPress={(event) => event.stopPropagation()} style={styles.rewardsCard}>
        <View style={styles.rewardsBody}>
          <Pressable accessibilityLabel="Close huddle Rewards" onPress={onClose} style={styles.rewardsClose}>
            <Feather color={huddleColors.onPrimary} name="x" size={24} />
          </Pressable>
          {progress.state !== "completed" && isNumericGoal ? (
            <View style={styles.rewardsMetricRow}>
              <Text
                numberOfLines={1} lineBreakMode="tail" lineBreakStrategyIOS="none"
                style={[
                  styles.rewardsMetric,
                  { color: accentColor },
                  remainingCount >= 1000 ? styles.rewardsMetricFourDigits : remainingCount >= 100 ? styles.rewardsMetricThreeDigits : null,
                ]}
              >
                {remainingCount}
              </Text>
              <Text style={styles.rewardsMetricUnit}>friends{"\n"}to go</Text>
            </View>
          ) : null}
          <Text numberOfLines={2} style={styles.rewardsTitle}>
            {progress.state === "completed" ? "Bonus unlocked." : (progress.title || "Grow your Huddle.")}
          </Text>
          <Text numberOfLines={1} style={[styles.rewardsRewardLine, { color: accentColor }]}>
            {progress.state === "completed" ? `${tierLabel} is active.` : `Earn ${tierLabel}.`}
          </Text>
          {progress.state !== "completed" && isNumericGoal ? (
            <View style={styles.rewardsSegments}>
              {Array.from({ length: 10 }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.rewardsSegment,
                    index < Math.round((progressPercent / 100) * 10) ? { backgroundColor: accentColor } : null,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
        {progress.state === "completed" ? null : progress.goal_type === "add_friend" || goalRoute ? (
          <Pressable
            accessibilityRole="button"
            onPress={progress.goal_type === "add_friend" ? onOpenAddFriend : () => onNavigate(goalRoute)}
            style={[styles.rewardsCta, { backgroundColor: accentColor }]}
          >
            <Text numberOfLines={1} style={[styles.rewardsCtaText, { color: ctaForeground }]}>{progress.cta_label || "Get started"}</Text>
            <Feather color={ctaForeground} name="arrow-right" size={22} />
          </Pressable>
        ) : null}
        <View style={styles.rewardsFooter}>
          <Text numberOfLines={2} style={styles.rewardsFooterText}>
            {progress.state === "completed"
              ? `Your ${tierLabel} reward is already active.`
              : (progress.body || `${progress.reward_months || 1} month of ${tierLabel}, on the house.`)}
          </Text>
          {progress.eligibility_terms ? (
            <Text numberOfLines={3} style={styles.rewardsTermsText}>{progress.eligibility_terms}</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function NativeFamilyAccountSheet({
  accessToken,
  currentProfile,
  currentUserId,
  initialState,
  isOpen,
  quotaTier,
  familySummary,
  onFamilySummaryChange,
  onClose,
  onOpenMembership,
  onOpenProfile,
}: {
  accessToken?: string | null;
  currentProfile: NativeProfile | null;
  currentUserId: string | null;
  initialState?: NativeFamilyState | null;
  isOpen: boolean;
  quotaTier?: string | null;
  familySummary?: NativeFamilySummary | null;
  onFamilySummaryChange?: (summary: NativeFamilySummary | null) => void;
  onClose: () => void;
  onOpenMembership: () => void;
  onOpenProfile?: (profile: NativeFamilyProfileLite) => void;
}) {
  const reduceFamilyMotion = useReducedMotion();
  const [familyState, setFamilyState] = useState<NativeFamilyState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [results, setResults] = useState<NativeFamilySearchResult[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<NativeFamilySearchResult | null>(null);
  const [allowPetSharing, setAllowPetSharing] = useState(false);
  const [sharedPetCandidates, setSharedPetCandidates] = useState<NativeFamilySharedPet[]>([]);
  const [sharedPetStepOpen, setSharedPetStepOpen] = useState(false);
  const [selectedSharedPetIds, setSelectedSharedPetIds] = useState<string[]>([]);
  const [addingSharedPets, setAddingSharedPets] = useState(false);
  const [mutatingMemberId, setMutatingMemberId] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [storeProducts, setStoreProducts] = useState<Record<NativeStoreProductId, NativeStoreProductState> | null>(null);

  const loadFamilyState = useCallback(async (includeSharedPetCandidates = true) => {
    const uid = String(currentUserId || "").trim();
    if (!uid) return;
    setLoading(true);
    setLoadError("");
    try {
      const state = await Promise.race([
        fetchNativeFamilyAccountState(accessToken),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("family_account_load_timeout")), 10000);
        }),
      ]);
      const acceptedMemberCount = 1 + (Array.isArray(state?.accepted_members) ? state.accepted_members.length : 0);
      const ownerQuotaUsed = coerceNonNegativeInt(state?.quota_used);
      const showQuota = state?.viewer_role === "owner" && !state?.pending_invite;
      const nextSummary = {
        usedSlots: showQuota ? Math.max(1, ownerQuotaUsed) : Math.max(1, acceptedMemberCount),
        totalSlots: Math.max(1, coerceNonNegativeInt(state?.quota_limit)),
        hasPendingInvite: Boolean(state?.pending_invite),
        showQuota,
      };
      setFamilyState(state);
      onFamilySummaryChange?.(nextSummary);
      if (includeSharedPetCandidates && (state?.viewer_role === "owner" || state?.viewer_role === "member")) {
        const candidates = await fetchNativeFamilySharedPetCandidates(accessToken).catch(() => [] as NativeFamilySharedPet[]);
        setSharedPetCandidates(Array.isArray(candidates) ? candidates : []);
      } else if (includeSharedPetCandidates) {
        setSharedPetCandidates([]);
      }
    } catch {
      setLoadError("Could not load Family Account. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, currentUserId, onFamilySummaryChange]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialState) {
      setFamilyState(initialState);
      setLoadError("");
    }
    void loadFamilyState();
  }, [initialState, isOpen, loadFamilyState]);

  useEffect(() => {
    if (!slotOpen) return undefined;
    let active = true;
    void loadNativeStoreProducts({ allowCache: true }).then((products) => {
      if (active) setStoreProducts(products);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [slotOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchOpen(false);
      setSlotOpen(false);
      setQuery("");
      setSearchFocused(false);
      setResults([]);
      setInviting(null);
      setInviteTarget(null);
      setAllowPetSharing(false);
      setSharedPetCandidates([]);
      setSharedPetStepOpen(false);
      setSelectedSharedPetIds([]);
      setAddingSharedPets(false);
      setMutatingMemberId(null);
      setLeaveConfirmOpen(false);
      setLoadError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!searchOpen || !query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      const q = query.trim().replace(/^@/, "");
      void searchNativeFamilyInviteCandidates(q, accessToken)
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => {
          setLoadError("Search failed. Please try again.");
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [accessToken, query, searchOpen]);

  const fallbackOwnerProfile: NativeFamilyProfileLite | null = currentProfile && currentUserId ? {
    id: currentUserId,
    display_name: currentProfile.display_name ?? null,
    avatar_url: currentProfile.avatar_url ?? null,
    social_id: currentProfile.social_id ?? null,
    tier: currentProfile.tier ?? null,
    effective_tier: currentProfile.effective_tier ?? quotaTier ?? null,
    family_slots: currentProfile.family_slots ?? 0,
  } : null;
  const pendingInvite = familyState?.pending_invite ?? null;
  const isViewerMember = familyState?.viewer_role === "member" && !pendingInvite;
  const displayRole: "owner" | "member" = isViewerMember ? "member" : "owner";
  const displayTotalSlots = Math.max(1, coerceNonNegativeInt(familyState?.quota_limit ?? familySummary?.totalSlots));
  const ownerProfileSource = familyState?.owner_profile ?? null;
  const displayOwner = isViewerMember
    ? ownerProfileSource
    : ownerProfileSource?.id === currentUserId && fallbackOwnerProfile
    ? {
      ...ownerProfileSource,
      display_name: fallbackOwnerProfile.display_name || ownerProfileSource.display_name,
      avatar_url: fallbackOwnerProfile.avatar_url || ownerProfileSource.avatar_url,
      social_id: fallbackOwnerProfile.social_id || ownerProfileSource.social_id,
      tier: fallbackOwnerProfile.tier || ownerProfileSource.tier,
      effective_tier: fallbackOwnerProfile.effective_tier || ownerProfileSource.effective_tier,
      family_slots: fallbackOwnerProfile.family_slots ?? ownerProfileSource.family_slots,
    }
    : fallbackOwnerProfile ?? ownerProfileSource;
  const acceptedRows = familyState?.accepted_members ?? [];
  const pendingRows = familyState?.pending_invites ?? [];
  const memberProfiles = [
    ...(displayOwner ? [displayOwner] : []),
    ...(pendingInvite ? [] : acceptedRows
      .map((row) => row.profile)
      .filter((profile): profile is NativeFamilyProfileLite => Boolean(profile?.id && profile.id !== displayOwner?.id))),
  ];
  const ownerVisibleUsedSlots = memberProfiles.length + (displayRole === "owner" ? pendingRows.length : 0);
  const showFamilyQuotaInTitle = displayRole === "owner" && !(ownerVisibleUsedSlots === 1 && displayTotalSlots === 1);
  const familyTitleText = showFamilyQuotaInTitle ? `Family Members (${ownerVisibleUsedSlots}/${displayTotalSlots})` : "Family Members";
  const canAddMember = displayRole === "owner" && familyState?.can_invite === true;

  const handleAddPress = useCallback(() => {
    if (!currentUserId) return;
    if (displayRole !== "owner") {
      Alert.alert("Family Account", "Only the family owner can add members. To add members, you'll need to leave this family.");
      return;
    }

    if (canAddMember) {
      setSlotOpen(false);
      setQuery("");
      setResults([]);
      setSearchOpen(true);
      return;
    }

    setSearchOpen(false);
    setSlotOpen(true);
  }, [canAddMember, currentUserId, displayRole]);

  const runAction = useCallback(async (fn: string, params: Record<string, unknown>, busyId: string, fallback: string) => {
    setMutatingMemberId(busyId);
    try {
      await runNativeFamilyAction(fn, params, accessToken);
      await loadFamilyState();
    } catch (error) {
      Alert.alert(fallback, familyActionMessage((error as { code?: string })?.code || (error as Error)?.message));
    } finally {
      setMutatingMemberId(null);
    }
  }, [accessToken, loadFamilyState]);

  const removeMember = useCallback((familyMemberId: string) => (
    runAction("remove_native_family_member", { p_family_member_id: familyMemberId }, familyMemberId, "Could not remove member")
  ), [runAction]);

  const cancelInvite = useCallback((familyMemberId: string) => (
    runAction("cancel_native_family_invite", { p_family_member_id: familyMemberId }, familyMemberId, "Could not cancel invite")
  ), [runAction]);

  const openLeaveConfirm = useCallback(() => {
    if (familyState?.viewer_role !== "member") return;
    setLeaveConfirmOpen(true);
  }, [familyState?.viewer_role]);

  const quitFamily = useCallback(async () => {
    if (!familyState || !currentUserId || familyState.can_leave !== true) return;
    setLeaveConfirmOpen(false);
    setMutatingMemberId(currentUserId);
    try {
      await runNativeFamilyAction("leave_native_family", {}, accessToken);
      onClose();
    } catch (error) {
      Alert.alert("Could not quit family", familyActionMessage((error as { code?: string })?.code || (error as Error)?.message));
    } finally {
      setMutatingMemberId(null);
    }
  }, [accessToken, currentUserId, familyState, onClose]);
  const leaveFamilyOwnerName = pendingInvite?.owner_profile?.display_name || familyState?.owner_profile?.display_name || "your family owner";

  const respondToInvite = useCallback(async (action: "accept" | "decline") => {
    const familyMemberId = pendingInvite?.family_member_id;
    if (!familyMemberId) return;
    setMutatingMemberId(familyMemberId);
    try {
      await runNativeFamilyAction(
        action === "accept" ? "accept_native_family_invite" : "decline_native_family_invite",
        { p_family_member_id: familyMemberId },
        accessToken,
      );
      if (action === "accept") {
        const candidates = await fetchNativeFamilySharedPetCandidates(accessToken).catch(() => [] as NativeFamilySharedPet[]);
        await loadFamilyState(false);
        const nextCandidates = Array.isArray(candidates) ? candidates : [];
        setSharedPetCandidates(nextCandidates);
        setSharedPetStepOpen(nextCandidates.length > 0);
        setSelectedSharedPetIds([]);
      } else {
        await loadFamilyState();
      }
    } catch (error) {
      Alert.alert(action === "accept" ? "Could not join family" : "Could not update invite", familyActionMessage((error as { code?: string })?.code || (error as Error)?.message));
    } finally {
      setMutatingMemberId(null);
    }
  }, [accessToken, loadFamilyState, pendingInvite?.family_member_id]);

  const sendInvite = useCallback(async (target: NativeFamilySearchResult) => {
    const uid = String(currentUserId || "").trim();
    if (!uid) return;
    setInviting(target.id);
    try {
      const result = await createNativeFamilyInvite(target.id, allowPetSharing, accessToken);
      if (result?.code !== "invited") {
        const error = new Error(String(result?.code || "family_action_failed")) as Error & { code?: string };
        error.code = String(result?.code || "family_action_failed");
        throw error;
      }
      setSearchOpen(false);
      setInviteTarget(null);
      setAllowPetSharing(false);
      setQuery("");
      setResults([]);
      await loadFamilyState();
    } catch (error) {
      Alert.alert("Could not send invite", familyActionMessage((error as { code?: string })?.code || (error as Error)?.message));
    } finally {
      setInviting(null);
    }
  }, [accessToken, allowPetSharing, currentUserId, loadFamilyState]);

  const addSharedPets = useCallback(async () => {
    if (selectedSharedPetIds.length === 0) return;
    setAddingSharedPets(true);
    try {
      await addNativeFamilySharedPets(selectedSharedPetIds, accessToken);
      setSharedPetStepOpen(false);
      setSelectedSharedPetIds([]);
      await loadFamilyState();
    } catch {
      setLoadError("Please try again.");
    } finally {
      setAddingSharedPets(false);
    }
  }, [accessToken, loadFamilyState, selectedSharedPetIds]);

  if (!isOpen) return null;

  const ownerTier = normalizedTier(familyState?.owner_profile?.effective_tier || quotaTier || currentProfile?.effective_tier || familyState?.owner_profile?.tier || currentProfile?.tier);
  const sharePerksFeatures = [
    "Your filters access",
    "Broadcast range & duration",
    "More Discovery",
    ...(ownerTier === "gold" ? ["Top Profile Visibility"] : []),
  ];
  const isMaxFamilyCapacity = displayTotalSlots >= MAX_FAMILY_MEMBERS;
  const sharePerksPrice = formatNativeAddonPrice("huddle_family_extra_monthly", storeProducts?.huddle_family_extra_monthly);
  const searchHasError = query.trim().length > 0 && results.length === 0;
  const familyJourneyKey = sharedPetStepOpen && sharedPetCandidates.length > 0
    ? "shared-pets"
    : slotOpen
      ? "share-perks"
      : searchOpen && inviteTarget
        ? "invite"
        : searchOpen
          ? "search"
          : "family";

  return (
    <View style={[styles.familyModalOverlay, modalPrimitiveStyles.appModalSafeArea]}>
        <Pressable onPress={slotOpen ? () => setSlotOpen(false) : onClose} style={StyleSheet.absoluteFill} />
          <Pressable onPress={(event) => event.stopPropagation()} style={[modalPrimitiveStyles.appModalCard, styles.familyCard, slotOpen && styles.sharePerksCard]}>
            {!slotOpen ? (
              <AppModalCloseButton onPress={sharedPetStepOpen ? () => {
                setSharedPetStepOpen(false);
                setSelectedSharedPetIds([]);
              } : searchOpen ? () => {
                if (inviteTarget) {
                  setInviteTarget(null);
                  setAllowPetSharing(false);
                  return;
                }
                setSearchOpen(false);
              } : onClose} />
            ) : null}
            <Animated.View
              entering={reduceFamilyMotion ? undefined : FadeInRight.duration(huddleMotion.durations.base)}
              exiting={reduceFamilyMotion ? undefined : FadeOutLeft.duration(huddleMotion.durations.base)}
              key={familyJourneyKey}
              layout={reduceFamilyMotion ? undefined : LinearTransition.duration(huddleMotion.durations.base)}
              style={styles.familyJourney}
            >
            {sharedPetStepOpen && sharedPetCandidates.length > 0 ? (
              <View style={styles.familyJourneyStep}>
                <View style={styles.familyHeader}>
                  <View style={styles.familyHeaderCopy}>
                    <Text style={styles.familyTitle}>Add shared pets</Text>
                  </View>
                </View>
                <NativePetMultiSelectCarousel
                  onSelect={(pet) => setSelectedSharedPetIds((current) => current.includes(pet.id)
                    ? current.filter((id) => id !== pet.id)
                    : [...current, pet.id])}
                  pets={sharedPetCandidates}
                  selectedPetIds={selectedSharedPetIds}
                />
                <AppModalActionRow>
                  <AppModalButton disabled={addingSharedPets} onPress={() => {
                    setSharedPetStepOpen(false);
                    setSelectedSharedPetIds([]);
                    void loadFamilyState(false);
                  }} variant="secondary">Not now</AppModalButton>
                  <AppModalButton disabled={selectedSharedPetIds.length === 0} loading={addingSharedPets} onPress={() => void addSharedPets()}>Add shared pets</AppModalButton>
                </AppModalActionRow>
              </View>
            ) : slotOpen ? (
              <>
                <View style={styles.sharePerksStripe}>
                  <Feather color={huddleColors.onPrimary} name="users" size={huddleFamilyAccount.headerIconSize} />
                  <Text style={styles.sharePerksTitle}>Share Perks</Text>
                  <Text style={styles.sharePerksMeta}>
                    {isMaxFamilyCapacity ? "Max. capacity reached" : sharePerksPrice}
                  </Text>
                </View>
                <View style={styles.sharePerksBody}>
                  <Text style={styles.familyBody}>Mirrors tier's access to exclusive features</Text>
                  {sharePerksFeatures.map((feature) => (
                    <View key={feature} style={styles.sharePerksFeature}>
                      <View style={styles.sharePerksCheck}>
                        <Feather color={huddleColors.onPrimary} name="check" size={huddleFamilyAccount.featureCheckIconSize} />
                      </View>
                      <Text style={styles.sharePerksFeatureText}>{feature}</Text>
                    </View>
                  ))}
                  <Pressable
                    disabled={isMaxFamilyCapacity}
                    onPress={() => {
                      setSlotOpen(false);
                      setSearchOpen(false);
                      onOpenMembership();
                    }}
                    style={[styles.familyPrimary, isMaxFamilyCapacity && styles.familyPrimaryDisabled]}
                  >
                    <Text style={styles.familyPrimaryText}>{isMaxFamilyCapacity ? "Max. capacity reached" : "Purchase Member Slot"}</Text>
                  </Pressable>
                  <Pressable onPress={() => setSlotOpen(false)} style={styles.familySecondaryTextOnly}>
                    <Text style={styles.familySecondaryText}>Maybe later</Text>
                  </Pressable>
                </View>
              </>
            ) : searchOpen && inviteTarget ? (
              <View style={styles.familyJourneyStep}>
                <View style={styles.familyHeader}>
                  <View style={styles.familyHeaderCopy}>
                    <Text style={styles.familyTitle}>Invite</Text>
                  </View>
                </View>
                <View style={styles.familyMemberRow}>
                  <NativeFamilyAvatarButton avatarUrl={inviteTarget.avatar_url} onPress={() => onOpenProfile?.(inviteTarget)} />
                  <View style={styles.familyMemberCopy}>
                    <Text numberOfLines={1} style={styles.familyMemberName}>{inviteTarget.display_name || "Unknown user"}</Text>
                    {inviteTarget.social_id ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.familyMemberRole}>@{inviteTarget.social_id}</Text> : null}
                  </View>
                </View>
                <AppModalToggleRow label="Allow pet sharing" onChange={setAllowPetSharing} value={allowPetSharing} />
                <Text style={nativeModalStyles.appModalMutedBody}>You cannot change it later.</Text>
                <AppModalButton loading={inviting === inviteTarget.id} onPress={() => void sendInvite(inviteTarget)}>Invite</AppModalButton>
              </View>
            ) : searchOpen ? (
              <View style={styles.familyJourneyStep}>
                <View style={styles.familyHeader}>
                  <View style={styles.familyHeaderCopy}>
                    <Text style={styles.familyTitle}>Search user</Text>
                  </View>
              </View>
              <AppModalField
                  error={searchHasError}
                  focused={searchFocused}
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={() => setSearchFocused(false)}
                  onChangeText={setQuery}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Username / Social ID"
                  value={query}
                />
              <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
                {results.map((result) => (
                    <View key={result.id} style={styles.familyMemberRow}>
                    <NativeFamilyAvatarButton avatarUrl={result.avatar_url} onPress={() => onOpenProfile?.(result)} />
                    <View style={styles.familyMemberCopy}>
                      <Text numberOfLines={1} style={styles.familyMemberName}>{result.display_name || "Unknown user"}</Text>
                      {result.social_id ? <Text ellipsizeMode="tail" numberOfLines={1} style={styles.familyMemberRole}>@{result.social_id}</Text> : null}
                    </View>
                    <Pressable
                      accessibilityLabel={inviting === result.id ? "Inviting" : `Invite ${result.display_name ?? "user"}`}
                      disabled={inviting === result.id}
                      onPress={() => {
                        setAllowPetSharing(false);
                        setInviteTarget(result);
                      }}
                      style={styles.familyInviteButton}
                    >
                      {inviting === result.id ? <NativeSpinner tone="accent" /> : <Feather color={huddleColors.blue} name="user-plus" size={huddleFamilyAccount.inviteIconSize} />}
                    </Pressable>
                  </View>
                ))}
                {query.length > 0 && results.length === 0 ? (
                  <Text style={styles.searchStateText}>No users found</Text>
                ) : null}
              </ScrollView>
              </View>
            ) : (
              <>
                <View style={styles.familyHeader}>
                  <View style={styles.familyHeaderCopy}>
                    <Text style={styles.familyTitle}>{familyTitleText}</Text>
                    <Text style={styles.familyBody}>Shared perks, not shared stars or quotas</Text>
                  </View>
                </View>

                {loading ? (
                  <View style={styles.familyMembers}>
                    <NativeSpinner tone="accent" size="md" />
                  </View>
                ) : loadError ? (
                  <View style={styles.familyMembers}>
                    <Text style={styles.familyEmpty}>{loadError}</Text>
                    <Pressable onPress={() => void loadFamilyState()} style={styles.familySecondaryTextOnly}>
                      <Text style={styles.familySecondaryText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.familyMembers}>
                    {memberProfiles.map((member, index) => {
                      const isOwner = member.id === displayOwner?.id;
                      const isCurrentUser = member.id === currentUserId;
                      const acceptedRow = acceptedRows.find((row) => row.profile?.id === member.id);
                      const canOwnerRemove = displayRole === "owner" && !isOwner && Boolean(acceptedRow?.family_member_id);
                      const canMemberQuitHere = displayRole === "member" && isCurrentUser && !isOwner;

                      return (
                        <View key={member.id}>
                          <View style={styles.familyMemberRow}>
                            <NativeFamilyAvatarButton avatarUrl={member.avatar_url} onPress={() => onOpenProfile?.(member)} />
                            <View style={styles.familyMemberCopy}>
                              <Text numberOfLines={1} style={styles.familyMemberName}>{member.display_name || "Unknown user"}</Text>
                              <Text style={styles.familyMemberRole}>{isOwner ? "Owner" : isCurrentUser ? "You" : "Member"}</Text>
                            </View>
                            {canOwnerRemove ? (
                              <Pressable
                                accessibilityLabel="Remove member"
                                disabled={mutatingMemberId === acceptedRow?.family_member_id}
                                onPress={() => void removeMember(String(acceptedRow?.family_member_id || ""))}
                                style={styles.familyRemoveButton}
                              >
                                {mutatingMemberId === acceptedRow?.family_member_id ? <NativeSpinner tone="muted" /> : <Feather color={huddleColors.validationRed} name="user-minus" size={huddleFamilyAccount.rowActionIconSize} />}
                              </Pressable>
                            ) : null}
                            {canMemberQuitHere ? (
                              <Pressable
                                accessibilityLabel="Quit family"
                                disabled={mutatingMemberId === member.id}
                                hitSlop={huddleSpacing.x2}
                                onPress={openLeaveConfirm}
                                style={styles.familyRemoveButton}
                              >
                                {mutatingMemberId === member.id ? <NativeSpinner tone="muted" /> : <Feather color={huddleColors.validationRed} name="log-out" size={huddleFamilyAccount.rowActionIconSize} />}
                              </Pressable>
                            ) : null}
                          </View>
                          {pendingInvite && index === 0 ? (
                            <View style={styles.familyInviteBanner}>
                              <View style={styles.familyInviteBannerCopy}>
                                <Text numberOfLines={2} style={styles.familyInviteBannerText}>
                              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.familyInviteBannerName}>{pendingInvite.owner_profile?.display_name || "A huddle member"}</Text>
                                  {" invited you to join their family!"}
                                </Text>
                              </View>
                              <View style={styles.familyInviteBannerActions}>
                                <Pressable accessibilityRole="button" disabled={mutatingMemberId === pendingInvite.family_member_id} onPress={() => void respondToInvite("decline")} style={[styles.familyInviteBannerSecondary, mutatingMemberId === pendingInvite.family_member_id ? huddleButtons.disabled : null]}>
                                  {mutatingMemberId === pendingInvite.family_member_id ? <NativeSpinner tone="secondary" /> : <Text style={styles.familyInviteBannerSecondaryText}>Not now</Text>}
                                </Pressable>
                                <Pressable accessibilityRole="button" disabled={mutatingMemberId === pendingInvite.family_member_id} onPress={() => void respondToInvite("accept")} style={[styles.familyInviteBannerPrimary, mutatingMemberId === pendingInvite.family_member_id ? huddleButtons.disabled : null]}>
                                  {mutatingMemberId === pendingInvite.family_member_id ? <NativeSpinner tone="primary" /> : <Text style={styles.familyInviteBannerPrimaryText}>Join</Text>}
                                </Pressable>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                    {displayRole === "owner" && pendingRows.map((row) => {
                      const member = row.profile;
                      if (!member?.id) return null;
                      return (
                        <View key={row.family_member_id} style={styles.familyMemberRow}>
                          <NativeFamilyAvatarButton avatarUrl={member.avatar_url} onPress={() => onOpenProfile?.(member)} />
                          <View style={styles.familyMemberCopy}>
                            <Text numberOfLines={1} style={styles.familyMemberName}>{member.display_name || "Unknown user"}</Text>
                            <Text style={styles.familyMemberRole}>Pending</Text>
                          </View>
                          <Pressable
                            accessibilityLabel="Cancel invite"
                            disabled={mutatingMemberId === row.family_member_id}
                            onPress={() => void cancelInvite(row.family_member_id)}
                            style={styles.familyRemoveButton}
                          >
                            {mutatingMemberId === row.family_member_id ? <NativeSpinner tone="muted" /> : <Feather color={huddleColors.validationRed} name="x" size={huddleFamilyAccount.rowActionIconSize} />}
                          </Pressable>
                        </View>
                      );
                    })}
                    {!memberProfiles.length ? (
                      <Text style={styles.familyEmpty}>No members yet.</Text>
                    ) : null}
                  </View>
                )}

                {sharedPetCandidates.length > 0 ? (
                  <AppModalButton onPress={() => setSharedPetStepOpen(true)} variant="secondary">Add shared pets</AppModalButton>
                ) : null}

                {(displayRole === "owner" || displayRole === "member") ? (
                  <View style={styles.familyAddRow}>
                    <Pressable
                      accessibilityLabel={displayRole === "member" ? "Only owner can add members" : canAddMember ? "Add member" : "Purchase member slot"}
                      onPress={handleAddPress}
                      style={[styles.familyAddButton, displayRole === "member" && styles.familyPrimaryDisabled]}
                    >
                      <Feather color={huddleColors.onPrimary} name="plus" size={huddleFamilyAccount.rowActionIconSize} />
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
            </Animated.View>
          </Pressable>
        {leaveConfirmOpen ? (
          <View style={styles.familyInlineConfirmOverlay}>
            <Pressable onPress={() => setLeaveConfirmOpen(false)} style={StyleSheet.absoluteFill} />
            <Pressable onPress={(event) => event.stopPropagation()} style={[modalPrimitiveStyles.appModalCard, styles.familyInlineConfirmCard]}>
              <Text style={styles.familyInlineConfirmTitle}>Leave Family?</Text>
              <Text style={styles.familyInlineConfirmBody}>Are you sure? You will lose all the perks shared by {leaveFamilyOwnerName}.</Text>
              <SlideToConfirm
                busy={mutatingMemberId === currentUserId}
                label="Slide to Leave Family"
                onCommit={() => void quitFamily()}
                tone="destructive"
              />
            </Pressable>
          </View>
        ) : null}
    </View>
	  );
	}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "flex-end",
    backgroundColor: huddleColors.backdrop,
  },
  panel: {
    width: 268,
    maxWidth: "70%",
    height: "100%",
    paddingTop: 68,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderLeftWidth: 1,
    borderLeftColor: huddleColors.divider,
    ...huddleShadows.glassElevation2,
  },
  body: {
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x5,
    gap: huddleSpacing.x3,
  },
  profileRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  avatarBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blue,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  profileName: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: 21,
    color: huddleColors.text,
  },
  huddleRewardsBanner: {
    minHeight: 82,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.card,
    paddingLeft: huddleSpacing.x3,
    paddingRight: 30,
    paddingVertical: huddleSpacing.x2,
    backgroundColor: huddleColors.blue,
  },
  huddleRewardsRemaining: {
    width: 45,
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-800",
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.2,
    textAlign: "center",
  },
  huddleRewardsCopy: {
    flex: 1,
    minWidth: 0,
  },
  huddleRewardsTitle: {
    fontFamily: "Urbanist-800",
    fontSize: 15,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  huddleRewardsMeta: {
    marginTop: 2,
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 16,
    color: huddleColors.onPrimary,
  },
  huddleRewardsAccent: {
    color: huddleColors.lime,
    fontFamily: "Urbanist-800",
  },
  huddleRewardsSegments: {
    height: 4,
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
  },
  huddleRewardsSegment: {
    flex: 1,
    minWidth: 0,
    height: 4,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.membershipUpgradeDivider,
  },
  huddleRewardsChevron: {
    position: "absolute",
    top: 10,
    right: 8,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: "center",
    padding: huddleSpacing.x5,
    backgroundColor: huddleColors.backdrop,
  },
  rewardsCard: {
    width: "100%",
    maxWidth: 420,
    overflow: "hidden",
    alignSelf: "center",
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.blue,
  },
  rewardsBody: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x4,
  },
  rewardsTitle: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-800",
    fontSize: 30,
    lineHeight: 33,
    letterSpacing: -0.7,
    color: huddleColors.onPrimary,
  },
  rewardsClose: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    position: "absolute",
    zIndex: 2,
    right: huddleSpacing.x3,
    top: huddleSpacing.x3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  rewardsMetricRow: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingRight: 48,
  },
  rewardsMetric: {
    fontFamily: "Urbanist-800",
    fontSize: 108,
    lineHeight: 112,
    letterSpacing: -4,
    color: huddleColors.onPrimary,
  },
  rewardsMetricThreeDigits: {
    fontSize: 88,
    lineHeight: 96,
    letterSpacing: -3,
  },
  rewardsMetricFourDigits: {
    fontSize: 68,
    lineHeight: 78,
    letterSpacing: -2,
  },
  rewardsMetricUnit: {
    color: huddleColors.onPrimary,
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 27,
  },
  rewardsRewardLine: {
    marginTop: 2,
    color: huddleColors.lime,
    fontFamily: "Urbanist-800",
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  rewardsSegments: {
    height: 6,
    flexDirection: "row",
    gap: 5,
    marginTop: huddleSpacing.x5,
  },
  rewardsSegment: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.membershipUpgradeDivider,
  },
  rewardsCta: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x5,
    backgroundColor: huddleColors.lime,
  },
  rewardsCtaText: {
    flex: 1,
    minWidth: 0,
    color: huddleColors.text,
    fontFamily: "Urbanist-800",
    fontSize: 18,
    lineHeight: 22,
  },
  rewardsFooter: {
    minHeight: 54,
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x2,
    backgroundColor: huddleColors.blue,
  },
  rewardsFooterText: {
    color: huddleColors.membershipUpgradeTextSoft,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
  },
  rewardsTermsText: {
    color: huddleColors.membershipUpgradeTextSoft,
    fontFamily: "Urbanist-500",
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.76,
  },
  familyInviteBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: huddleColors.divider,
    padding: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
  },
  familyInviteBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  familyInviteBannerText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.text,
  },
  familyInviteBannerName: {
    fontFamily: "Urbanist-800",
    color: huddleColors.text,
  },
  familyInviteBannerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x1,
  },
  familyInviteBannerSecondary: {
    minHeight: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.button,
    paddingHorizontal: huddleSpacing.x2,
    backgroundColor: huddleColors.mutedCanvas,
  },
  familyInviteBannerPrimary: {
    minHeight: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.button,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.blue,
  },
  familyInviteBannerSecondaryText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.text,
  },
  familyInviteBannerPrimaryText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.onPrimary,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  tierPill: {
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#ECEFF4",
  },
  tierPillPlus: {
    backgroundColor: "#5BA4F5",
  },
  tierPillGold: {
    backgroundColor: "#FF6A55",
  },
  tierPillText: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 15,
    color: "#6E7386",
  },
  pillTextOnDark: {
    color: huddleColors.onPrimary,
  },
  starsPill: {
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#E4E8F2",
    backgroundColor: huddleColors.canvas,
  },
  starsPillEmpty: {
    borderColor: "#C6CAD6",
    backgroundColor: "transparent",
  },
  starsPillText: {
    fontFamily: "Urbanist-700",
    fontSize: 11,
    lineHeight: 14,
    color: "#4A4965",
  },
  starsPillTextEmpty: {
    color: "#98A0B8",
  },
  group: {
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.divider,
  },
  identityIconBadge: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  identityIconBadgeVerified: {
    backgroundColor: huddleColors.blue,
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x3,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
  },
  rowLabel: {
    flexShrink: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  rowDanger: {
    color: huddleColors.validationRed,
  },
  rowMuted: {
    color: huddleColors.mutedText,
  },
  rowBadge: {
    overflow: "hidden",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.meta,
    lineHeight: huddleType.metaLine,
    color: huddleColors.onPrimary,
    backgroundColor: huddleColors.blue,
  },
  rowValue: {
    flexShrink: 1,
    minWidth: 0,
    marginLeft: "auto",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    color: huddleColors.mutedText,
  },
  backRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backLabel: {
    fontFamily: "Urbanist-700",
    fontSize: 15,
    color: huddleColors.text,
  },
  carerGateCard: {
    width: "100%",
    padding: huddleModalTokens.spacing.x5,
    gap: huddleModalTokens.spacing.x5,
  },
  carerGateOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    backgroundColor: huddleColors.backdrop,
  },
  supportDrawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 24, 38, 0.42)",
    paddingHorizontal: 18,
  },
  supportDrawerCard: {
    width: "100%",
    maxWidth: 390,
    maxHeight: "80%",
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: huddleColors.canvas,
  },
  supportDrawerClose: {
    position: "absolute",
    top: 18,
    right: 18,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 247, 251, 0.95)",
  },
  carerGateCopy: {
    gap: huddleModalTokens.spacing.x2,
  },
  carerGateTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 16,
    lineHeight: 21,
    color: huddleColors.text,
  },
  carerGateBody: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.subtext,
  },
  carerGateActions: {
    flexDirection: "row",
    gap: huddleModalTokens.spacing.x3,
  },
  carerGateSecondary: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  carerGateSecondaryText: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  carerGatePrimary: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  carerGatePrimaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  familyModalBackdrop: {
    flex: 1,
    backgroundColor: huddleColors.backdrop,
  },
  familyModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: huddleLayers.modalBackdrop,
    elevation: huddleLayers.modalBackdrop,
    backgroundColor: huddleColors.backdrop,
  },
  familyInlineConfirmBackdrop: {
    zIndex: huddleLayers.nestedBackdrop,
    elevation: huddleLayers.nestedBackdrop,
    backgroundColor: huddleColors.backdrop,
  },
  familyInlineConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: huddleLayers.nestedModal,
    elevation: huddleLayers.nestedModal,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleModalTokens.spacing.x4,
  },
  familyInlineConfirmCard: {
    width: "100%",
    gap: huddleModalTokens.spacing.x4,
    padding: huddleModalTokens.spacing.x5,
  },
  familyInlineConfirmTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  familyInlineConfirmBody: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  familyCard: {
    width: "100%",
    paddingHorizontal: huddleModalTokens.spacing.x4,
    paddingTop: huddleModalTokens.spacing.x5,
    paddingBottom: huddleModalTokens.spacing.x5,
  },
  familyJourney: {
    width: "100%",
  },
  familyJourneyStep: {
    width: "100%",
    gap: huddleSpacing.x4,
  },
  sharePerksCard: {
    overflow: "hidden",
    paddingBottom: huddleModalTokens.spacing.x5,
  },
  familyHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  familyHeaderCopy: {
    flex: 1,
    paddingRight: huddleSpacing.x3,
  },
  familyTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  familyBody: {
    marginTop: huddleSpacing.x1,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  familyMembers: {
    width: "100%",
    marginTop: huddleSpacing.x3,
    gap: huddleSpacing.x2,
  },
  familyMemberRow: {
    minHeight: huddleLayout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  familyMemberAvatar: {
    width: huddleSpacing.x7,
    height: huddleSpacing.x7,
    borderRadius: huddleRadii.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.mutedCanvas,
  },
  familyMemberAvatarImage: {
    width: "100%",
    height: "100%",
  },
  familyMemberCopy: {
    flex: 1,
    minWidth: 0,
  },
  familyMemberName: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  familyMemberRole: {
    flexShrink: 1,
    marginTop: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  familyRemoveButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
  },
  familyEmpty: {
    width: "100%",
    paddingVertical: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  familyAddRow: {
    width: "100%",
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  familyAddButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blue,
  },
  familyActionItem: {
    flex: 1,
  },
  familyInviteButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResults: {
    width: "100%",
    maxHeight: huddleFamilyAccount.searchResultsMaxHeight,
    marginTop: huddleSpacing.x3,
  },
  searchStateText: {
    width: "100%",
    paddingVertical: huddleSpacing.x3,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  sharePerksStripe: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    marginTop: -huddleSpacing.x5,
    marginHorizontal: -huddleSpacing.x4,
    marginBottom: huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    backgroundColor: huddleColors.blue,
  },
  sharePerksTitle: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  sharePerksMeta: {
    marginLeft: "auto",
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.membershipUpgradeTextSoft,
  },
  sharePerksBody: {
    width: "100%",
  },
  sharePerksFeature: {
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  sharePerksCheck: {
    width: huddleFamilyAccount.featureCheckSize,
    height: huddleFamilyAccount.featureCheckSize,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.subscriptionAddonLime,
  },
  sharePerksFeatureText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  addCodeOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
  },
  addCodeKeyboard: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  addCodeCard: {
    width: "100%",
    maxWidth: 420,
    padding: huddleSpacing.x4,
    borderRadius: huddleRadii.sheet,
    backgroundColor: huddleColors.glassOverlay,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    ...huddleShadows.glassElevation2,
  },
  codeIntroBanner: {
    alignItems: "center",
    backgroundColor: huddleColors.primarySoftFill,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "space-between",
    marginTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
  },
  codeIntroText: {
    color: huddleColors.blue,
    flex: 1,
    fontFamily: huddleButtons.label.fontFamily,
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
  },
  codeIntroClose: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: huddleLayout.minTouch,
    minWidth: huddleLayout.minTouch,
  },
  addCodeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: huddleSpacing.x3,
  },
  addCodeTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  addCodeSubtitle: {
    marginTop: 2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  addCodeClose: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  addCodeIdentity: {
    marginTop: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  addCodeIdentityCopy: {
    flex: 1,
    minWidth: 0,
  },
  addCodeName: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  addCodeSocial: {
    marginTop: 2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  addCodeLoading: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFrame: {
    alignSelf: "center",
    marginTop: huddleSpacing.x4,
    padding: huddleSpacing.x4,
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
  },
  huddleCodeText: {
    marginTop: huddleSpacing.x3,
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h2,
    lineHeight: huddleType.h2Line,
    letterSpacing: 3,
    color: huddleColors.text,
  },
  addCodeActions: {
    marginTop: huddleSpacing.x4,
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  addCodePrimary: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  addCodePrimaryDisabled: {
    ...huddleButtons.disabled,
  },
  addCodePrimaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  addCodeSecondary: {
    ...huddleGlassControls.surface,
    minWidth: 96,
    minHeight: huddleLayout.minTouch,
    paddingHorizontal: huddleSpacing.x3,
    borderRadius: huddleRadii.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  addCodeSecondaryText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.blue,
  },
  addCodeFooterActions: {
    marginTop: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addCodeTextButton: {
    minHeight: huddleLayout.minTouch,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x2,
  },
  addCodeTextButtonLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.blue,
  },
  addCodeDangerText: {
    color: huddleColors.validationRed,
  },
  addCodeNotice: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.success,
  },
  addCodeError: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: huddleFormFields.errorSize,
    lineHeight: huddleFormFields.errorLine,
    color: huddleColors.validationRed,
  },
  addCodeInputWrap: {
    marginTop: huddleSpacing.x4,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x3,
    paddingTop: huddleSpacing.x2,
  },
  addCodeInputLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleFormFields.labelSize,
    lineHeight: huddleFormFields.labelLine,
    color: huddleColors.mutedText,
  },
  addCodeInput: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: 34,
    paddingVertical: 0,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.labelLine,
    letterSpacing: 2,
    color: huddleColors.text,
    overflow: "hidden",
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: huddleSpacing.x4,
    backgroundColor: "rgba(20,24,38,0.82)",
  },
  scannerCard: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 0.72,
    borderRadius: huddleRadii.sheet,
    overflow: "hidden",
    backgroundColor: huddleColors.text,
  },
  scannerHeader: {
    height: 56,
    paddingLeft: huddleSpacing.x4,
    paddingRight: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(20,24,38,0.92)",
  },
  scannerTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    color: huddleColors.onPrimary,
  },
  scannerCamera: {
    flex: 1,
  },
  scannerReticle: {
    position: "absolute",
    left: "18%",
    right: "18%",
    top: "32%",
    bottom: "22%",
    borderWidth: 2,
    borderColor: huddleColors.subscriptionAddonLime,
    borderRadius: huddleRadii.glass,
  },
  familyPrimary: {
    width: "100%",
    ...huddleButtons.base,
    ...huddleButtons.primary,
    marginTop: huddleSpacing.x5,
  },
  familyPrimaryDisabled: {
    ...huddleButtons.disabled,
  },
  familyPrimaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  familySecondaryTextOnly: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: huddleSpacing.x2,
  },
  familySecondary: {
    ...huddleButtons.base,
    ...huddleButtons.ghost,
    marginTop: huddleSpacing.x2,
  },
  familySecondaryText: {
    ...huddleButtons.label,
    color: huddleColors.mutedText,
  },
});
