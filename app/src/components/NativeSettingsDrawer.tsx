import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  type NativeProfileSummary as NativeProfile,
  type NativeQuotaSnapshot,
} from "../lib/nativeProfileSummary";
import { nativeExactTokenRpc } from "../lib/nativeExactTokenRequest";
import { haptic } from "../lib/nativeHaptics";
import { resolveNativeProfileImageUrlAsync } from "../lib/nativeStorageUrlCache";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import { huddleButtons, huddleColors, huddleFieldStates, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { NativePublicProfileModal } from "./profile/NativePublicProfileModal";
import { AppDestructiveSlideConfirm } from "./nativeModalPrimitives";
import { nativeModalStyles } from "./nativeModalPrimitives.styles";
import { huddleModalTokens, styles as modalPrimitiveStyles } from "../../huddle Design System/native-modal-primitives.styles";

type NativeSettingsDrawerProps = {
  accessToken?: string | null;
  openFamilyIntent?: number;
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
  if (tier === "gold" || tier === "huddle gold" || tier.startsWith("gold_")) return "Huddle Gold";
  if (
    tier === "plus" ||
    tier === "premium" ||
    tier === "huddle+" ||
    tier === "huddle plus" ||
    tier.startsWith("plus_") ||
    tier.startsWith("premium_")
  ) return "Huddle+";
  return "Free";
};

const normalizedTier = (value?: string | null) => {
  const tier = String(value || "free").toLowerCase();
  if (tier === "gold" || tier === "huddle gold" || tier.startsWith("gold_")) return "gold";
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
const cleanToken = (value?: string | null) => String(value || "").trim();

const requireNativeFamilyAccessToken = (accessToken?: string | null) => {
  const token = cleanToken(accessToken);
  if (!token) throw new Error("missing_access_token");
  return token;
};

const nativeFamilyRpc = async <T,>(fn: string, params: Record<string, unknown>, accessToken?: string | null) => {
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, requireNativeFamilyAccessToken(accessToken));
  if (error) throw error;
  return data as T;
};

const MAX_FAMILY_MEMBERS = 4;
const SHARE_PERKS_FALLBACK_PRICE = 4.99;
const SHARE_PERKS_FALLBACK_CURRENCY = "US$";
const SHARE_PERKS_LIME = "#7CFF6B";

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
        <ExpoImage accessibilityIgnoresInvertColors source={{ uri: resolvedUrl }} style={styles.familyMemberAvatarImage} contentFit="cover" cachePolicy="memory-disk" transition={120} />
      ) : (
        <Feather color={huddleColors.mutedText} name="user" size={18} />
      )}
    </Pressable>
  );
}

export function NativeSettingsDrawer({ accessToken, openFamilyIntent, open, sessionKey, userId, onClose, onOpen, onNavigate, onOpenSupport, onSignOut }: NativeSettingsDrawerProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativeProfile | null>(null);
  const [quota, setQuota] = useState<NativeQuotaSnapshot | null>(null);
  const [familyStatePreview, setFamilyStatePreview] = useState<NativeFamilyState | null>(null);
  const [familySummary, setFamilySummary] = useState<NativeFamilySummary | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [carerGateOpen, setCarerGateOpen] = useState(false);
  const [familyInviteProfileUserId, setFamilyInviteProfileUserId] = useState<string | null>(null);
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
    if (!userId || !accessToken) {
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
    const applyProfileSummary = ({ profile: nextProfile, quota: nextQuota }: { profile: NativeProfile | null; quota: NativeQuotaSnapshot | null }) => {
      if (cancelled) return;
      setProfile(nextProfile);
      setQuota(nextQuota);
      if (nextProfile?.avatar_url) {
        void ExpoImage.prefetch(nextProfile.avatar_url);
      }
    };

    void readCachedNativeProfileSummary(userId, { sessionKey }).then((cached) => {
      if (cached) applyProfileSummary(cached);
    });
    void fetchNativeProfileSummary(userId, { force: false, accessToken, sessionKey }).then(applyProfileSummary, () => {
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
    });
  }, [shouldHydrateProfile, userId]);

  useEffect(() => {
    if (!userId || !accessToken) return;
    void loadDrawerFamilyState();
  }, [accessToken, loadDrawerFamilyState, userId]);

  useEffect(() => {
    if (!open) {
      setLegalOpen(false);
    }
  }, [open]);

  const displayName = profile?.display_name || profile?.email || "User";
  const tierValue = quota?.effective_tier || quota?.tier || profile?.effective_tier || profile?.tier;
  const starTierValue = profile?.tier || "free";
  const membershipLabel = tierLabel(tierValue);
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
  const isVerified = isNativeVerifiedProfile(profile);

  const openPath = useCallback((path: string) => {
    haptic.selectTab();
    onClose();
    onNavigate(path);
  }, [onClose, onNavigate]);

  const openSupportModal = useCallback(() => {
    haptic.selectTab();
    onClose();
    onOpenSupport?.();
  }, [onClose, onOpenSupport]);

  const openFamilyAccount = useCallback(() => {
    setLegalOpen(false);
    setFamilyOpen(true);
    onClose();
  }, [onClose]);

  const openFamilyUpgrade = useCallback(() => {
    setFamilyOpen(false);
    openPath("/premium");
  }, [openPath]);

  const openCarerProfile = useCallback(() => {
    if (isVerified) {
      openPath("/carerprofile");
      return;
    }
    onClose();
    setCarerGateOpen(true);
  }, [isVerified, onClose, openPath]);

  const openVerifyIdentity = useCallback(() => {
    setCarerGateOpen(false);
    openPath("/verify-identity");
  }, [openPath]);

  const mainRows = useMemo<Array<SettingsRow[]>>(
    () => [
      [
        { label: "Manage Membership", icon: "star", onPress: () => openPath("/premium") },
        { label: "Family Account", icon: "users", badge: familyInviteBadge, value: familySummaryLabel, onPress: openFamilyAccount },
      ],
      [
        {
          label: "Identity Verification",
          iconNode: (
            <View style={[styles.identityIconBadge, isVerified ? styles.identityIconBadgeVerified : styles.identityIconBadgeUnverified]}>
              <Feather color={huddleColors.onPrimary} name="shield" size={12} />
            </View>
          ),
          value: isVerified ? "Verified" : undefined,
          onPress: () => openPath("/verify-identity?from=settings"),
        },
        {
          label: "Care Profile",
          icon: "heart",
          onPress: openCarerProfile,
        },
        { label: "Account Settings", icon: "user", onPress: () => openPath("/settings") },
      ],
      [
        { label: "Help & Support", icon: "help-circle", onPress: openSupportModal },
        { label: "Legal Information", icon: "file-text", onPress: () => setLegalOpen(true) },
      ],
      [{ label: "Log out", icon: "log-out", danger: true, onPress: onSignOut }],
    ],
    [familyInviteBadge, familySummaryLabel, isVerified, onSignOut, openCarerProfile, openFamilyAccount, openPath, openSupportModal],
  );


  const legalRows = useMemo<SettingsRow[]>(
    () => [
      { label: "Privacy Policy", icon: "shield", onPress: () => openPath("/privacy") },
      { label: "Privacy Choices", icon: "shield", onPress: () => openPath("/privacy-choices") },
      { label: "Terms of Service", icon: "file-text", onPress: () => openPath("/terms") },
      { label: "Community Guidelines", icon: "file-text", onPress: () => openPath("/community-guidelines") },
      { label: "Cookies Notice", icon: "file-text", onPress: () => openPath("/cookies") },
      {
        label: "Care Provider Agreement",
        iconNode: <MaterialCommunityIcons color={huddleColors.iconMuted} name="paw-outline" size={18} />,
        onPress: () => openPath("/service-provider-agreement"),
      },
      {
        label: "Care Service Booking Terms",
        iconNode: <MaterialCommunityIcons color={huddleColors.iconMuted} name="paw-outline" size={18} />,
        onPress: () => openPath("/booking-terms"),
      },
    ],
    [openPath],
  );

  const closeFamilyAccount = useCallback(() => {
    setFamilyOpen(false);
    onOpen();
  }, [onOpen]);

  const closeFamilyAccountForMembership = useCallback(() => {
    setFamilyOpen(false);
    openFamilyUpgrade();
  }, [openFamilyUpgrade]);

  useEffect(() => {
    if (!openFamilyIntent) return;
    if (consumedFamilyIntentRef.current === openFamilyIntent) return;
    consumedFamilyIntentRef.current = openFamilyIntent;
    setLegalOpen(false);
    void loadDrawerFamilyState();
    onOpen();
  }, [loadDrawerFamilyState, onOpen, openFamilyIntent]);

  return (
    <>
      <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
        <Pressable accessibilityLabel="Close settings" onPress={onClose} style={styles.backdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.panel}>
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
                      <View style={[styles.avatar, isVerified && styles.avatarVerified]}>
                        {profile?.avatar_url ? (
                          <ExpoImage
                            source={{ uri: profile.avatar_url }}
                            style={styles.avatarImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={120}
                          />
                        ) : (
                          <>
                            <Feather color={huddleColors.mutedText} name="user" size={24} />
                            <Text style={styles.avatarHiddenText}>{displayName.trim().slice(0, 1).toUpperCase() || "U"}</Text>
                          </>
                        )}
                      </View>
                      <View style={[styles.avatarBadge, isVerified && styles.avatarBadgeVerified]}>
                        <Feather color={isVerified ? huddleColors.onPrimary : huddleColors.mutedText} name="shield" size={12} />
                      </View>
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
          </Pressable>
        </Pressable>
      </Modal>
      <NativeFamilyAccountSheet
        accessToken={accessToken}
        currentProfile={profile}
        currentUserId={userId}
        isOpen={familyOpen}
        quotaTier={tierValue}
        familySummary={familySummary}
        onFamilySummaryChange={setFamilySummary}
        onClose={closeFamilyAccount}
        onOpenMembership={closeFamilyAccountForMembership}
        onOpenProfile={setFamilyInviteProfileUserId}
      />
      <NativeCarerGateModal
        isOpen={carerGateOpen}
        onClose={() => setCarerGateOpen(false)}
        onVerify={openVerifyIdentity}
      />
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        currentUserId={userId}
        hideActions
        onClose={() => setFamilyInviteProfileUserId(null)}
        onNavigate={onNavigate}
        open={Boolean(familyInviteProfileUserId)}
        sessionKey={sessionKey}
        userId={familyInviteProfileUserId}
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
      <Text style={[styles.rowLabel, row.danger && styles.rowDanger, row.muted && styles.rowMuted]}>{row.label}</Text>
      {row.badge ? <Text style={styles.rowBadge}>{row.badge}</Text> : null}
      {row.value ? <Text style={styles.rowValue}>{row.value}</Text> : null}
    </Pressable>
  );
}

function NativeCarerGateModal({ isOpen, onClose, onVerify }: { isOpen: boolean; onClose: () => void; onVerify: () => void }) {
  if (!isOpen) return null;
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={isOpen}>
      <Pressable onPress={onClose} style={[styles.familyModalBackdrop, modalPrimitiveStyles.appModalSafeArea]}>
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
      </Pressable>
    </Modal>
  );
}

function NativeFamilyAccountSheet({
  accessToken,
  currentProfile,
  currentUserId,
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
  isOpen: boolean;
  quotaTier?: string | null;
  familySummary?: NativeFamilySummary | null;
  onFamilySummaryChange?: (summary: NativeFamilySummary | null) => void;
  onClose: () => void;
  onOpenMembership: () => void;
  onOpenProfile?: (userId: string) => void;
}) {
  const [familyState, setFamilyState] = useState<NativeFamilyState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [results, setResults] = useState<NativeFamilySearchResult[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [mutatingMemberId, setMutatingMemberId] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const loadFamilyState = useCallback(async () => {
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
    } catch {
      setLoadError("Could not load Family Account. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, currentUserId, onFamilySummaryChange]);

  useEffect(() => {
    if (!isOpen) return;
    void loadFamilyState();
  }, [isOpen, loadFamilyState]);

  useEffect(() => {
    if (!isOpen) {
      setSearchOpen(false);
      setSlotOpen(false);
      setQuery("");
      setSearchFocused(false);
      setResults([]);
      setInviting(null);
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
      await loadFamilyState();
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
      await runNativeFamilyAction("create_native_family_invite", { p_invitee_user_id: target.id }, accessToken);
      setSearchOpen(false);
      setQuery("");
      setResults([]);
      await loadFamilyState();
    } catch (error) {
      Alert.alert("Could not send invite", familyActionMessage((error as { code?: string })?.code || (error as Error)?.message));
    } finally {
      setInviting(null);
    }
  }, [accessToken, currentUserId, loadFamilyState]);

  if (!isOpen) return null;

  const ownerTier = normalizedTier(familyState?.owner_profile?.effective_tier || quotaTier || currentProfile?.effective_tier || familyState?.owner_profile?.tier || currentProfile?.tier);
  const sharePerksFeatures = [
    "Your filters access",
    "Broadcast range & duration",
    "More Discovery",
    ...(ownerTier === "gold" ? ["Top Profile Visibility"] : []),
  ];
  const isMaxFamilyCapacity = displayTotalSlots >= MAX_FAMILY_MEMBERS;
  const searchHasError = query.trim().length > 0 && results.length === 0;

  return (
    <>
      <Modal animationType="slide" onRequestClose={slotOpen ? () => setSlotOpen(false) : onClose} transparent visible={isOpen}>
        <Pressable onPress={slotOpen ? () => setSlotOpen(false) : onClose} style={[styles.familyModalBackdrop, modalPrimitiveStyles.appModalSafeArea]}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[modalPrimitiveStyles.appModalCard, styles.familyCard, slotOpen && styles.sharePerksCard]}>
            {!slotOpen ? (
              <Pressable
                accessibilityLabel={searchOpen ? "Close search" : "Close family account"}
                onPress={searchOpen ? () => setSearchOpen(false) : onClose}
                style={modalPrimitiveStyles.appModalClose}
              >
                <Feather color={huddleColors.iconMuted} name="x" size={18} />
              </Pressable>
            ) : null}
            {slotOpen ? (
              <>
                <View style={styles.sharePerksStripe}>
                  <Feather color={huddleColors.onPrimary} name="users" size={18} />
                  <Text style={styles.sharePerksTitle}>Share Perks</Text>
                  <Text style={styles.sharePerksMeta}>
                    {isMaxFamilyCapacity ? "Max. capacity reached" : `${SHARE_PERKS_FALLBACK_CURRENCY}${SHARE_PERKS_FALLBACK_PRICE.toFixed(2)}/mo`}
                  </Text>
                </View>
                <View style={styles.sharePerksBody}>
                  <Text style={styles.familyBody}>Mirrors tier's access to exclusive features</Text>
                  {sharePerksFeatures.map((feature) => (
                    <View key={feature} style={styles.sharePerksFeature}>
                      <View style={styles.sharePerksCheck}>
                        <Feather color={huddleColors.onPrimary} name="check" size={10} />
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
            ) : searchOpen ? (
              <>
                <View style={styles.familyHeader}>
                  <View style={styles.familyHeaderCopy}>
                    <Text style={styles.familyTitle}>Search user</Text>
                  </View>
              </View>
              <View
                style={[
                  styles.searchFieldWrap,
                  searchFocused && styles.searchFieldFocused,
                  searchHasError && styles.searchFieldError,
                ]}
              >
                <Feather color={huddleColors.mutedText} name="search" size={15} />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={() => setSearchFocused(false)}
                  onChangeText={setQuery}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Username / Social ID"
                  placeholderTextColor={huddleModalTokens.color.mutedText}
                  style={styles.searchField}
                  value={query}
                />
              </View>
              <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
                {results.map((result) => (
                    <View key={result.id} style={styles.familyMemberRow}>
                    <NativeFamilyAvatarButton avatarUrl={result.avatar_url} onPress={() => onOpenProfile?.(result.id)} />
                    <View style={styles.familyMemberCopy}>
                      <Text numberOfLines={1} style={styles.familyMemberName}>{result.display_name || "Unknown user"}</Text>
                      {result.social_id ? <Text style={styles.familyMemberRole}>@{result.social_id}</Text> : null}
                    </View>
                    <Pressable
                      accessibilityLabel={inviting === result.id ? "Inviting" : `Invite ${result.display_name ?? "user"}`}
                      disabled={inviting === result.id}
                      onPress={() => void sendInvite(result)}
                      style={styles.familyInviteButton}
                    >
                      {inviting === result.id ? <ActivityIndicator color={huddleColors.blue} size="small" /> : <Feather color={huddleColors.blue} name="user-plus" size={15} />}
                    </Pressable>
                  </View>
                ))}
                {query.length > 0 && results.length === 0 ? (
                  <Text style={styles.searchStateText}>No users found</Text>
                ) : null}
              </ScrollView>
              </>
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
                    <ActivityIndicator color={huddleColors.blue} />
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
                            <NativeFamilyAvatarButton avatarUrl={member.avatar_url} onPress={() => onOpenProfile?.(member.id)} />
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
                                {mutatingMemberId === acceptedRow?.family_member_id ? <ActivityIndicator color={huddleColors.validationRed} size="small" /> : <Feather color={huddleColors.validationRed} name="user-minus" size={17} />}
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
                                {mutatingMemberId === member.id ? <ActivityIndicator color={huddleColors.validationRed} size="small" /> : <Feather color={huddleColors.validationRed} name="log-out" size={17} />}
                              </Pressable>
                            ) : null}
                          </View>
                          {pendingInvite && index === 0 ? (
                            <View style={styles.familyInviteBanner}>
                              <View style={styles.familyInviteBannerCopy}>
                                <Text numberOfLines={2} style={styles.familyInviteBannerText}>
                                  <Text style={styles.familyInviteBannerName}>{pendingInvite.owner_profile?.display_name || "A Huddle member"}</Text>
                                  {" invited you to join their family!"}
                                </Text>
                              </View>
                              <View style={styles.familyInviteBannerActions}>
                                <Pressable accessibilityRole="button" disabled={mutatingMemberId === pendingInvite.family_member_id} onPress={() => void respondToInvite("decline")} style={styles.familyInviteBannerSecondary}>
                                  {mutatingMemberId === pendingInvite.family_member_id ? <ActivityIndicator color={huddleColors.text} size="small" /> : <Text style={styles.familyInviteBannerSecondaryText}>Not now</Text>}
                                </Pressable>
                                <Pressable accessibilityRole="button" disabled={mutatingMemberId === pendingInvite.family_member_id} onPress={() => void respondToInvite("accept")} style={styles.familyInviteBannerPrimary}>
                                  {mutatingMemberId === pendingInvite.family_member_id ? <ActivityIndicator color={huddleColors.onPrimary} size="small" /> : <Text style={styles.familyInviteBannerPrimaryText}>Join</Text>}
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
                          <NativeFamilyAvatarButton avatarUrl={member.avatar_url} onPress={() => onOpenProfile?.(member.id)} />
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
                            {mutatingMemberId === row.family_member_id ? <ActivityIndicator color={huddleColors.validationRed} size="small" /> : <Feather color={huddleColors.validationRed} name="x" size={17} />}
                          </Pressable>
                        </View>
                      );
                    })}
                    {!memberProfiles.length ? (
                      <Text style={styles.familyEmpty}>No members yet.</Text>
                    ) : null}
                  </View>
                )}

                {(displayRole === "owner" || displayRole === "member") ? (
                  <View style={styles.familyAddRow}>
                    <Pressable
                      accessibilityLabel={displayRole === "member" ? "Only owner can add members" : canAddMember ? "Add member" : "Purchase member slot"}
                      onPress={handleAddPress}
                      style={[styles.familyAddButton, displayRole === "member" && styles.familyPrimaryDisabled]}
                    >
                      <Feather color={huddleColors.onPrimary} name="plus" size={17} />
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
          </Pressable>
          <AppDestructiveSlideConfirm
            body={`Are you sure? You will lose all the perks shared by ${leaveFamilyOwnerName}.`}
            onClose={() => setLeaveConfirmOpen(false)}
            onConfirm={() => void quitFamily()}
            open={leaveConfirmOpen}
            slideLabel="Slide to Leave Family"
            title="Leave Family?"
          />
        </Pressable>
	      </Modal>
	    </>
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.mutedCanvas,
  },
  avatarVerified: {
    borderWidth: 2,
    borderColor: huddleColors.blue,
  },
  avatarHiddenText: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
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
    backgroundColor: huddleColors.mutedCanvas,
  },
  avatarBadgeVerified: {
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
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.button,
    paddingHorizontal: huddleSpacing.x2,
    backgroundColor: huddleColors.mutedCanvas,
  },
  familyInviteBannerPrimary: {
    minHeight: 34,
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
  identityIconBadgeUnverified: {
    backgroundColor: "#A1A4A9",
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
  familyInlineConfirmBackdrop: {
    zIndex: 10,
    elevation: 10,
    backgroundColor: huddleColors.backdrop,
  },
  familyCard: {
    width: "100%",
    paddingHorizontal: huddleModalTokens.spacing.x4,
    paddingTop: huddleModalTokens.spacing.x5,
    paddingBottom: huddleModalTokens.spacing.x5,
  },
  sharePerksCard: {
    overflow: "hidden",
    paddingBottom: huddleModalTokens.spacing.x5,
  },
  familyClose: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
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
    fontSize: 16,
    lineHeight: 21,
    color: huddleColors.text,
  },
  familyBody: {
    marginTop: 3,
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  familyMembers: {
    width: "100%",
    marginTop: huddleSpacing.x3,
    gap: huddleSpacing.x2,
  },
  familyMemberRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  familyMemberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
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
    fontSize: 13,
    lineHeight: 17,
    color: huddleColors.text,
  },
  familyMemberRole: {
    marginTop: 1,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    color: huddleColors.mutedText,
  },
  familyRemoveButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
  },
  familyEmpty: {
    width: "100%",
    paddingVertical: huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: 13,
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
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.blue,
  },
  familyActionItem: {
    flex: 1,
  },
  familyInviteButton: {
    width: huddleModalTokens.size.minTouch,
    height: huddleModalTokens.size.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  searchFieldWrap: {
    width: "100%",
    marginTop: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    minHeight: huddleModalTokens.size.fieldHeight,
    borderRadius: huddleModalTokens.radius.field,
    paddingHorizontal: huddleModalTokens.spacing.x4,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: huddleModalTokens.color.fieldBorder,
    shadowColor: huddleModalTokens.color.neutralShadow,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  searchFieldFocused: {
    ...huddleFieldStates.focused,
  },
  searchFieldError: {
    ...huddleFieldStates.error,
  },
  searchField: {
    flex: 1,
    minHeight: huddleModalTokens.size.fieldHeight,
    paddingVertical: 0,
    fontFamily: huddleModalTokens.type.bodyFamily,
    fontSize: huddleModalTokens.type.inputSize,
    lineHeight: huddleModalTokens.type.inputLine,
    color: huddleModalTokens.color.text,
  },
  searchResults: {
    width: "100%",
    maxHeight: 220,
    marginTop: huddleSpacing.x3,
  },
  searchStateText: {
    width: "100%",
    paddingVertical: huddleSpacing.x3,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: 13,
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
    fontFamily: "Urbanist-700",
    fontSize: 15,
    color: huddleColors.onPrimary,
  },
  sharePerksMeta: {
    marginLeft: "auto",
    fontFamily: "Urbanist-600",
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
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
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SHARE_PERKS_LIME,
  },
  sharePerksFeatureText: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    color: huddleColors.text,
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
