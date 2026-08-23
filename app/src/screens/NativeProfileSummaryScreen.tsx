import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import {
  getNativeNotificationPermissionDetail,
  openNativeNotificationSettings,
  requestNativeNotificationPermissionDetail,
  subscribeNativeNotificationPermission,
} from "../lib/nativeNotificationPermissions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from "react-native";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeProfileAvatar } from "../components/NativeProfileAvatar";
import { NativeNavIcon } from "../components/NativeNavIcons";
import type { NativeBottomTab } from "../components/NativeBottomNav";
import { NativeVerifiedBadge } from "../components/NativeVerifiedBadge";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeCareInterestSheet } from "../components/NativeCareInterestSheet";
import strayCatImage from "../../assets/stray-cat-notification.png";
import strayDogImage from "../../assets/stray-dog-notification.png";
import { createFreshNativeFunctionHeaders, createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "../lib/nativeFunctionClient";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { AppKeyboardAvoidingView, AppModalCloseButton, SlideToConfirm } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { useErrorShake } from "../components/motion/useErrorShake";
import { Animated as RNAnimated } from "react-native";
import { haptic } from "../lib/nativeHaptics";
import { useNativeLoadingDeadline } from "../lib/useNativeLoadingDeadline";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { normalizeNativeProfilePhotoPresentationCrop } from "../lib/nativeProfilePhotos";
import { createLatestRequestGuard } from "../lib/nativeAsyncRace";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  writeNativeProfileSummaryCache,
  type NativeProfileSummary,
  type NativeQuotaSnapshot,
} from "../lib/nativeProfileSummary";
import { Image as ExpoImage } from "expo-image";
import { nativeFreshImageKey, nativeFreshImageUri } from "../lib/nativeImageFreshness";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { registerNativePushTokenForSession } from "../lib/nativePushRegistration";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleGlassControls,
  huddleImageDefaults,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
  huddleVerifyIdentity,
} from "../theme/huddleDesignTokens";

type NativeProfileSummaryScreenProps = {
  careMarketIsActive?: boolean;
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  onOpenSupport?: () => void;
  onBack?: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
};

type NotificationPrefs = {
  push_enabled: boolean;
  pets: boolean;
  social: boolean;
  chats: boolean;
  map: boolean;
  services: boolean;
  systems: boolean;
};

type NotificationPrefsRow = {
  push_enabled?: boolean | null;
  pause_all?: boolean | null;
  social?: boolean | null;
  chats?: boolean | null;
  map?: boolean | null;
  pets?: boolean | null;
  care?: boolean | null;
  systems?: boolean | null;
};

type RowIcon =
  | { family: "feather"; name: keyof typeof Feather.glyphMap; rotate?: string; slashed?: boolean }
  | { family: "material"; name: keyof typeof MaterialCommunityIcons.glyphMap; rotate?: string; slashed?: boolean }
  | { family: "nav"; tab: NativeBottomTab; slashed?: boolean };

type DeleteAccountErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  public_message?: string;
};

const DELETE_ACCOUNT_SUPPORT_CODES = new Set([
  "delete_account_cleanup_failed",
  "delete_account_storage_failed",
]);

const DELETE_ACCOUNT_ERROR_COPY: Record<string, string> = {
  active_care_booking: "Account deletion is paused. You have an active Care booking. Complete or cancel it first, then try again.",
  active_care_payment: "Account deletion is paused. A Care payment action is still processing. Please try again once it finishes.",
  open_care_dispute: "Account deletion is paused. You have an open Care dispute. Resolve it first, then try again.",
  pending_customer_refund: "Account deletion is paused. You have a pending Care refund. Please wait for the refund to finish before deleting your account.",
  pending_provider_payout: "Account deletion is paused. You have a pending Care payout. Please wait for the payout to finish before deleting your account.",
  delete_account_cleanup_failed: "We couldn't delete your account. Something on our side blocked the cleanup.",
  delete_account_storage_failed: "We couldn't finish deleting your account. Some photos or files could not be cleared yet.",
};

function getDeleteAccountError(body: DeleteAccountErrorBody | null) {
  const code = body?.code || body?.error || body?.message || "delete_failed";
  const message = body?.public_message || DELETE_ACCOUNT_ERROR_COPY[code] || nativeSafeErrorCopy(code, "We couldn't delete your account right now. Please try again.");
  return {
    message,
    support: DELETE_ACCOUNT_SUPPORT_CODES.has(code),
  };
}

const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  pets: true,
  social: true,
  chats: true,
  map: true,
  services: true,
  systems: true,
};

const cleanSettingsAccessToken = (accessToken?: string | null) => String(accessToken || "").trim();

const requireSettingsAccessToken = (accessToken?: string | null) => {
  const token = cleanSettingsAccessToken(accessToken);
  if (!token) throw new Error("missing_access_token");
  return token;
};

const settingsRestHeaders = (accessToken: string, extra?: Record<string, string>) =>
  createNativeAuthenticatedHeaders(accessToken, extra);

const parseSettingsRestJson = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const settingsRestError = (parsed: unknown, fallback: string) => {
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    return nativeSafeErrorCopy((parsed as { message?: unknown }).message, fallback);
  }
  return nativeSafeErrorCopy(parsed, fallback);
};

const settingsRestUrl = (table: string) => new URL(`${supabaseUrl}/rest/v1/${table}`);

const fetchNotificationPrefsWithToken = async (userId: string, accessToken?: string | null) => {
  const token = await getFreshNativeAccessToken(requireSettingsAccessToken(accessToken));
  if (!token) throw new Error("auth_required");
  const url = settingsRestUrl("notification_preferences");
  url.searchParams.set("select", "push_enabled,pause_all,social,chats,map,pets,care,systems");
  url.searchParams.set("user_id", `eq.${userId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    headers: settingsRestHeaders(token, { accept: "application/json" }),
  });
  const parsed = await parseSettingsRestJson(response);
  if (!response.ok) throw new Error(settingsRestError(parsed, response.statusText));
  return Array.isArray(parsed) ? (parsed[0] as NotificationPrefsRow | undefined) ?? null : null;
};

const upsertNotificationPrefsWithToken = async (userId: string, next: NotificationPrefs, accessToken?: string | null) => {
  const token = await getFreshNativeAccessToken(requireSettingsAccessToken(accessToken));
  if (!token) throw new Error("auth_required");
  const url = settingsRestUrl("notification_preferences");
  url.searchParams.set("on_conflict", "user_id");
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: settingsRestHeaders(token, {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      user_id: userId,
      push_enabled: next.push_enabled,
      pause_all: false,
      pets: next.pets,
      social: next.social,
      chats: next.chats,
      map: next.map,
      care: next.services,
      systems: next.systems,
    }),
  });
  const parsed = await parseSettingsRestJson(response);
  if (!response.ok) throw new Error(settingsRestError(parsed, response.statusText));
};

const patchProfileWithToken = async (userId: string, payload: Record<string, unknown>, accessToken?: string | null) => {
  const token = await getFreshNativeAccessToken(requireSettingsAccessToken(accessToken));
  if (!token) throw new Error("auth_required");
  const url = settingsRestUrl("profiles");
  url.searchParams.set("id", `eq.${userId}`);
  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: settingsRestHeaders(token, {
      "content-type": "application/json",
      prefer: "return=minimal",
    }),
    body: JSON.stringify(payload),
  });
  const parsed = await parseSettingsRestJson(response);
  if (!response.ok) throw new Error(settingsRestError(parsed, response.statusText));
};

const normalizeTier = (value?: string | null) => {
  const tier = String(value || "free").trim().toLowerCase();
  if (tier === "gold" || tier === "huddle＊" || tier.startsWith("gold_")) return "gold";
  if (
    tier === "plus" ||
    tier === "premium" ||
    tier === "huddle+" ||
    tier === "huddle plus" ||
    tier.startsWith("plus_") ||
    tier.startsWith("premium_")
  ) {
    return "plus";
  }
  return "free";
};

const tierLabel = (value?: string | null) => {
  const tier = normalizeTier(value);
  if (tier === "gold") return "huddle＊";
  if (tier === "plus") return "huddle+";
  return "Free";
};

const starQuotaLimit = (value?: string | null) => {
  const tier = normalizeTier(value);
  if (tier === "gold") return 10;
  if (tier === "plus") return 4;
  return 0;
};

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const verificationLabel = (profile: NativeProfileSummary | null) => {
  const status = String(profile?.verification_status || "").trim().toLowerCase();
  if (status === "verified") return "Verified";
  if (status === "pending") return "Pending";
  return "Not verified";
};

const prefsFromRow = (row: NotificationPrefsRow | null): NotificationPrefs => ({
  push_enabled: row ? row.push_enabled !== false && row.pause_all !== true : DEFAULT_PREFS.push_enabled,
  pets: row ? row.pets !== false : DEFAULT_PREFS.pets,
  social: row ? row.social === true : DEFAULT_PREFS.social,
  chats: row ? row.chats === true : DEFAULT_PREFS.chats,
  map: row ? row.map === true : DEFAULT_PREFS.map,
  services: row ? row.care !== false : DEFAULT_PREFS.services,
  systems: row ? row.systems !== false : DEFAULT_PREFS.systems,
});

const readProjectId = () => {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easConfigProjectId = Constants.easConfig?.projectId;
  return typeof easConfigProjectId === "string"
    ? easConfigProjectId
    : typeof expoConfigProjectId === "string"
      ? expoConfigProjectId
      : null;
};

const getOrCreateNativeDeviceId = async () => {
  const key = "huddle:native:device-id";
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const next = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(key, next);
  return next;
};

const registerPushForDevice = async (userId: string, accessToken?: string | null) => {
  requireSettingsAccessToken(accessToken);
  if (!Device.isDevice) return "physical_device_required";

  const permission = await requestNativeNotificationPermissionDetail();
  if (permission.state !== "granted") return "permission_denied";

  const projectId = readProjectId();
  if (!projectId) return "project_id_missing";

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token.data) return "token_missing";

  const deviceId = await getOrCreateNativeDeviceId();
  await registerNativePushTokenForSession({
    accessToken,
    deviceId,
    token: token.data,
  });
  return "registered";
};

const pushRegistrationErrorCopy = (result: string) => {
  if (result === "permission_denied") return "Push notifications are off. Allow notifications in your device settings, then try again.";
  if (result === "physical_device_required") return "Push notifications need a physical device.";
  return "Push notifications aren't available right now. Please try again later.";
};

export function NativeProfileSummaryScreen({ userId, accessToken, careMarketIsActive = false, sessionKey, onOpenSupport, onBack, onNavigate, onSignOut }: NativeProfileSummaryScreenProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativeProfileSummary | null>(null);
  const [quota, setQuota] = useState<NativeQuotaSnapshot | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [notificationPermission, setNotificationPermission] = useState<Awaited<ReturnType<typeof getNativeNotificationPermissionDetail>> | null>(null);
  const [pushEnablePending, setPushEnablePending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Backstop: a loading flag still true past the deadline means something
  // upstream never settled. Fall into this screen's normal retryable error
  // state rather than spinning forever. See useNativeLoadingDeadline.ts.
  useNativeLoadingDeadline(loading, {
    onTrip: () => {
      setLoading(false);
      setLoadError("We couldn't load your account summary. Please try again.");
    },
  });

  const [pushNotice, setPushNotice] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<"push" | "map" | "logout" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [careInterestOpen, setCareInterestOpen] = useState(false);

  const handleBackToSettingsDrawer = () => {
    if (onBack) {
      onBack();
      return;
    }
    void Linking.openURL("huddle:/settings").catch(() => {});
  };
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteErrorSupport, setDeleteErrorSupport] = useState(false);
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);
  const profileLoadGuardRef = useRef(createLatestRequestGuard());

  const loadProfile = useCallback(async () => {
      const requestKey = `${sessionKey || "no-session"}:${userId || "no-user"}`;
      const ticket = profileLoadGuardRef.current.begin(requestKey);
      if (!userId) {
        setProfile(null);
        setQuota(null);
        setPrefs(DEFAULT_PREFS);
        setLoading(false);
        setLoadError("Profile is unavailable.");
        return;
      }

      setLoading(true);
      setLoadError(null);

      const cached = await readCachedNativeProfileSummary(userId, { sessionKey });
      if (!profileLoadGuardRef.current.isCurrent(ticket)) return;
      if (cached) {
        setProfile(cached.profile);
        setQuota(cached.quota);
        setLoading(false);
      }
      try {
        const [profileSummary, prefsResult, permission] = await Promise.all([
          fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey }),
          fetchNotificationPrefsWithToken(userId, accessToken),
          getNativeNotificationPermissionDetail().catch(() => null),
        ]);
        if (!profileLoadGuardRef.current.isCurrent(ticket)) return;

        setProfile(profileSummary.profile);
        setQuota(profileSummary.quota);
        const nextPrefs = prefsFromRow(prefsResult);
        setPrefs(nextPrefs);
        setNotificationPermission(permission);
        setLoadError(null);
        setLoading(false);
        if (!prefsResult && userId) {
          await upsertNotificationPrefsWithToken(userId, DEFAULT_PREFS, accessToken);
          if (!profileLoadGuardRef.current.isCurrent(ticket)) return;
        }
      } catch (error) {
        if (!profileLoadGuardRef.current.isCurrent(ticket)) return;
        console.warn("Native profile summary unavailable");
        setLoadError("We couldn't load your account summary. Please try again.");
        setLoading(false);
      }
    }, [accessToken, sessionKey, userId]);

  useEffect(() => {
    const loadGuard = profileLoadGuardRef.current;
    void loadProfile();
    return () => loadGuard.invalidate();
  }, [loadProfile]);

  useEffect(() => {
    if (!userId) return;
    return subscribeNativeProfileSummary(userId, ({ profile: nextProfile, quota: nextQuota }) => {
      setProfile(nextProfile);
      setQuota(nextQuota);
    }, { sessionKey });
  }, [sessionKey, userId]);

  useEffect(() => subscribeNativeNotificationPermission(setNotificationPermission), []);

  const persistPrefs = useCallback(async (next: NotificationPrefs, key: string) => {
    if (!userId) return;
    const previous = prefs;
    setPrefs(next);
    setSavingKey(key);
    try {
      await upsertNotificationPrefsWithToken(userId, next, accessToken);
    } catch {
      setPrefs(previous);
      setSavingKey(null);
      return false;
    }
    setSavingKey(null);
    return true;
  }, [accessToken, prefs, userId]);

  const persistPrivacy = useCallback(async (next: { discoveryOptOut: boolean; mapHidden: boolean }, key: string) => {
    if (!userId) return;
    const previous = profile;
    // Incognito on Map = the new Hidden precision tier (same as choosing Hidden on the
    // map): map_precision='hidden' with hide_from_map=false (legacy full-off stays off).
    const mapPrecision = next.mapHidden ? "hidden" : "area";
    setProfile((current) => current ? { ...current, discovery_opt_out: next.discoveryOptOut, map_precision: mapPrecision, hide_from_map: false } : current);
    setSavingKey(key);
    try {
      await patchProfileWithToken(userId, { discovery_opt_out: next.discoveryOptOut, map_precision: mapPrecision, hide_from_map: false }, accessToken);
      if (previous) {
        const nextProfile = { ...previous, discovery_opt_out: next.discoveryOptOut, map_precision: mapPrecision, hide_from_map: false };
        await writeNativeProfileSummaryCache(userId, { profile: nextProfile, quota }, { sessionKey });
      }
    } catch {
      setProfile(previous);
    }
    setSavingKey(null);
  }, [accessToken, profile, quota, sessionKey, userId]);

  const enablePush = useCallback(async () => {
    if (!userId) return;
    setPushNotice(null);
    setSavingKey("push");
    try {
      const result = await registerPushForDevice(userId, accessToken);
      if (result !== "registered") {
        setPushNotice(pushRegistrationErrorCopy(result));
        return;
      }
      const saved = await persistPrefs({ ...prefs, push_enabled: true }, "push");
      if (!saved) setPushNotice(pushRegistrationErrorCopy("registration_failed"));
    } catch {
      setPushNotice(pushRegistrationErrorCopy("registration_failed"));
    } finally {
      setSavingKey(null);
    }
  }, [accessToken, persistPrefs, prefs, userId]);

  useEffect(() => {
    if (!pushEnablePending || notificationPermission?.state !== "granted") return;
    setPushEnablePending(false);
    void enablePush();
  }, [enablePush, notificationPermission?.state, pushEnablePending]);

  const handlePushToggle = useCallback((next: boolean) => {
    if (!next) {
      setConfirmMode("push");
      return;
    }
    void (async () => {
      setPushNotice(null);
      setSavingKey("push");
      try {
        const current = await getNativeNotificationPermissionDetail();
        setNotificationPermission(current);
        if (current.state === "granted") {
          await enablePush();
          return;
        }
        if (!current.canAskAgain) {
          setPushEnablePending(true);
          setPushNotice("Turn on Notifications for huddle in Settings.");
          await openNativeNotificationSettings(Constants.expoConfig?.android?.package);
          return;
        }
        const requested = await requestNativeNotificationPermissionDetail();
        setNotificationPermission(requested);
        if (requested.state === "granted") await enablePush();
      } catch {
        setPushNotice(pushRegistrationErrorCopy("registration_failed"));
      } finally {
        setSavingKey(null);
      }
    })();
  }, [enablePush]);

  const display = useMemo(() => {
    const displayName = profile?.display_name || profile?.email || "User";
    const initials = displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "U";
    const tierValue = quota?.effective_tier || quota?.tier || profile?.effective_tier || profile?.tier || "free";
    const starTierValue = profile?.tier || "free";
    const realTier = normalizeTier(starTierValue);
    const starUsed = numberValue(quota?.stars_used_cycle ?? quota?.stars_month_used);
    const starExtras = numberValue(quota?.extra_stars ?? quota?.extras_stars);
    const starsRemaining = Math.max(0, starQuotaLimit(starTierValue) - starUsed) + starExtras;

    return {
      displayName,
      initials,
      socialId: profile?.social_id ? `@${profile.social_id}` : null,
      tierValue,
      tier: normalizeTier(tierValue),
      tierLabel: tierLabel(tierValue),
      starsRemaining,
      showStarQuotaPill: !(realTier === "free" && starsRemaining <= 0),
      verification: verificationLabel(profile),
    };
  }, [profile, quota]);

  const turnOffImage = useMemo<ImageSourcePropType>(() => {
    const speciesSource = (profile?.pet_experience ?? []).join(" ").toLowerCase();
    const hasCatSpecies = /\bcat(s)?\b/.test(speciesSource) || /\bfeline(s)?\b/.test(speciesSource);
    const hasDogSpecies = /\bdog(s)?\b/.test(speciesSource) || /\bcanine(s)?\b/.test(speciesSource);
    return hasDogSpecies && !hasCatSpecies ? strayDogImage : strayCatImage;
  }, [profile?.pet_experience]);

  const notificationRows = useMemo(() => {
    const pushEnabled = prefs.push_enabled && notificationPermission?.state === "granted";
    return [
      { icon: { family: "feather", name: "bell" } as RowIcon, label: "Push notifications", enabled: pushEnabled, key: "push_enabled" as const, disabled: false },
      { icon: { family: "material", name: "paw" } as RowIcon, label: "Pets", enabled: pushEnabled && prefs.pets, key: "pets" as const, disabled: !pushEnabled },
      { icon: { family: "nav", tab: "social" } as RowIcon, label: "Social", enabled: pushEnabled && prefs.social, key: "social" as const, disabled: !pushEnabled },
      { icon: { family: "nav", tab: "chats" } as RowIcon, label: "Discover & Chats", enabled: pushEnabled && prefs.chats, key: "chats" as const, disabled: !pushEnabled },
      { icon: { family: "nav", tab: "map" } as RowIcon, label: "Map alerts", enabled: pushEnabled && prefs.map, key: "map" as const, disabled: !pushEnabled },
      ...(careMarketIsActive ? [{ icon: { family: "nav", tab: "service" } as RowIcon, label: "Care", enabled: pushEnabled && prefs.services, key: "services" as const, disabled: !pushEnabled }] : []),
      { icon: { family: "feather", name: "settings" } as RowIcon, label: "Systems", enabled: prefs.systems, key: "systems" as const, disabled: false },
    ];
  }, [careMarketIsActive, notificationPermission?.state, prefs]);

  const submitDeleteAccount = useCallback(async () => {
    if (deleteConfirm !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      setDeleteErrorSupport(false);
      return;
    }
    setDeleteBusy(true);
    setDeleteError("");
    setDeleteErrorSupport(false);
    try {
      const freshAccessToken = await getFreshNativeAccessToken(accessToken);
      if (!freshAccessToken) throw new Error("auth_required");
      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: "POST",
        headers: await createFreshNativeFunctionHeaders(freshAccessToken, { functionName: "delete-account", routeToken: accessToken }),
        body: JSON.stringify({ action: "confirm_delete" }),
      });
      const body = (await response.json().catch(() => null)) as DeleteAccountErrorBody | null;
      if (!response.ok) {
        const mapped = getDeleteAccountError(body);
        setDeleteErrorSupport(mapped.support);
        throw new Error(mapped.message);
      }
      setDeleteOpen(false);
      setDeleteConfirm("");
      onSignOut();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "We couldn't delete your account. Please retry."
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [accessToken, deleteConfirm, onSignOut]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <NativeLoadingState variant="centered" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.screen}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather color={huddleColors.mutedText} name="user" size={24} />
          </View>
          <Text style={styles.emptyTitle}>Account summary</Text>
          <Text style={styles.emptyCopy}>{loadError}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + huddleSpacing.x2 }]}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={handleBackToSettingsDrawer} style={styles.backButton}>
          <Feather color={huddleColors.iconSubtle} name="arrow-left" size={huddleVerifyIdentity.headerIconSize} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Account</Text>
        <View style={[styles.backButton, styles.headerSpacer]} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityHint="Opens your public profile preview"
          accessibilityLabel="View public profile"
          accessibilityRole="button"
          onPress={() => setPublicProfileOpen(true)}
          style={({ pressed }) => [styles.profileCard, pressed ? styles.pressed : null]}
        >
          <View>
            <NativeProfileAvatar
              presentationCrop={normalizeNativeProfilePhotoPresentationCrop((profile?.photos as Record<string, unknown> | null)?.avatar_presentation)}
              userId={profile?.id}
              uri={profile?.avatar_url}
              version={profile?.updated_at}
              size={64}
              verified={isNativeVerifiedProfile(profile)}
              name={display.initials}
              engagement={profile?.engagement ?? null}
            />
            {isNativeVerifiedProfile(profile) ? (
              <View style={styles.verifiedBadge}>
                <NativeVerifiedBadge compact variant="avatar" />
              </View>
            ) : null}
          </View>
          <View style={styles.identityText}>
            <Text numberOfLines={1} style={styles.displayName}>{display.displayName}</Text>
            {display.socialId ? <Text numberOfLines={1} style={styles.socialId}>{display.socialId}</Text> : null}
            <View style={styles.pillRow}>
              <View
                style={[
                  styles.tierPill,
                  display.tier === "gold" && styles.tierPillGold,
                  display.tier === "plus" && styles.tierPillPlus,
                ]}
              >
                <Text style={[styles.tierPillText, display.tier !== "free" && styles.tierPillTextActive]}>{display.tierLabel}</Text>
              </View>
              {display.showStarQuotaPill ? (
                <View style={[styles.starsPill, display.starsRemaining <= 0 && styles.starsPillEmpty]}>
                  <Feather color={display.starsRemaining > 0 ? huddleColors.coral : huddleColors.mutedText} name="star" size={12} />
                  <Text style={[styles.starsPillText, display.starsRemaining <= 0 && styles.starsPillTextEmpty]}>{display.starsRemaining}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        <Text style={styles.sectionLabel}>IDENTITY</Text>
        <View style={styles.group}>
          {typeof profile?.legal_name === "string" && profile.legal_name.trim() ? (
            <>
              <ActionRow icon="user" label="Legal name" value={profile.legal_name} disabled />
              <Divider />
            </>
          ) : null}
          <ActionRow
            icon="mail"
            label="Email"
            value={profile?.email || "—"}
            disabled
          />
          <Divider />
          <ActionRow
            icon="calendar"
            label="Date of birth"
            value={typeof profile?.dob === "string" && profile.dob.trim() ? profile.dob : "Add"}
            disabled
          />
          <Divider />
          <ActionRow
            icon="at-sign"
            label="Social ID"
            value={profile?.social_id ? `@${profile.social_id}` : "Add"}
            onPress={() => onNavigate("/edit-profile?focus=identity")}
          />
          <Divider />
          <ActionRow
            icon="phone"
            label="Phone"
            value={profile?.phone || "Add"}
            onPress={() => onNavigate("/edit-profile?focus=identity")}
          />
        </View>

        <Text style={styles.sectionLabel}>MEMBERSHIP</Text>
        <View style={styles.group}>
          <ActionRow icon="star" label="Manage Membership" value={display.tierLabel} onPress={() => onNavigate("/premium")} />
        </View>

        <Text style={styles.sectionLabel}>VISIBILITY</Text>
        <View style={styles.group}>
          <ToggleRow
            disabled={savingKey !== null}
            icon={profile?.discovery_opt_out === true
              ? { family: "nav", tab: "chats", slashed: true }
              : { family: "nav", tab: "chats" }}
            label="Open to Friends Matching"
            loading={savingKey === "discovery"}
            enabled={profile?.discovery_opt_out !== true}
            onPress={() => void persistPrivacy({ discoveryOptOut: profile?.discovery_opt_out !== true, mapHidden: profile?.map_precision === "hidden" }, "discovery")}
          />
          <Divider />
          <ToggleRow
            disabled={savingKey !== null}
            icon={{ family: "feather", name: profile?.map_precision === "hidden" ? "eye-off" : "eye" }}
            label="Incognito on Map"
            loading={savingKey === "map-privacy"}
            enabled={profile?.map_precision === "hidden"}
            onPress={() => void persistPrivacy({ discoveryOptOut: profile?.discovery_opt_out === true, mapHidden: profile?.map_precision !== "hidden" }, "map-privacy")}
          />
        </View>

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.group}>
          {notificationRows.map((row, index) => (
            <View key={row.label}>
              <ToggleRow
                disabled={savingKey !== null || row.disabled}
                icon={row.icon}
                label={row.label}
                loading={savingKey === row.key}
                enabled={row.enabled}
                onPress={() => {
                  if (row.key === "push_enabled") {
                    handlePushToggle(!row.enabled);
                    return;
                  }
                  if (row.key === "map" && prefs.map) {
                    setConfirmMode("map");
                    return;
                  }
                  void persistPrefs({ ...prefs, [row.key]: !prefs[row.key] }, row.key);
                }}
              />
              {index < notificationRows.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </View>
        {pushNotice ? <Text accessibilityLiveRegion="polite" style={styles.pushNotice}>{pushNotice}</Text> : null}

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <ActionRow icon="edit-3" label="Edit profile" onPress={() => onNavigate("/edit-profile")} />
          <Divider />
          <ActionRow icon="shield" label="Identity Verification" value={display.verification} onPress={() => onNavigate("/verify-identity")} />
          <Divider />
          {!careMarketIsActive ? (
            <>
              <ActionRow icon="heart" label="Care interest" onPress={() => setCareInterestOpen(true)} />
              <Divider />
            </>
          ) : null}
          <ActionRow icon="lock" label="Security" onPress={() => onNavigate("/settings/security")} />
          <Divider />
          <ActionRow
            danger
            icon="log-out"
            label="Log out"
            onPress={() => setConfirmMode("logout")}
          />
          <Divider />
          <ActionRow danger icon="trash-2" label="Delete Account" onPress={() => setDeleteOpen(true)} />
        </View>
      </ScrollView>
      <ConfirmModal
        imageSource={turnOffImage}
        mode={confirmMode}
        onClose={() => setConfirmMode(null)}
        onConfirm={() => {
          const mode = confirmMode;
          setConfirmMode(null);
          if (mode === "push") {
            void persistPrefs({ ...prefs, push_enabled: false }, "push");
            return;
          }
          if (mode === "map") {
            void persistPrefs({ ...prefs, map: false }, "map");
            return;
          }
          if (mode === "logout") {
            onSignOut();
          }
        }}
      />
      <DeleteAccountModal
        busy={deleteBusy}
        confirm={deleteConfirm}
        error={deleteError}
        errorHasSupport={deleteErrorSupport}
        onChangeConfirm={(value) => {
          setDeleteConfirm(value);
          if (deleteError) {
            setDeleteError("");
            setDeleteErrorSupport(false);
          }
        }}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteConfirm("");
          setDeleteError("");
          setDeleteErrorSupport(false);
        }}
        onConfirm={() => void submitDeleteAccount()}
        onOpenSupport={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteConfirm("");
          setDeleteError("");
          setDeleteErrorSupport(false);
          onOpenSupport?.();
        }}
        open={deleteOpen}
      />
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        viewerUserId={userId}
        memberNumber={null}
        sessionKey={sessionKey}
        onClose={() => setPublicProfileOpen(false)}
        onNavigate={onNavigate}
        open={publicProfileOpen}
        profileUserId={userId}
      />
      {!careMarketIsActive ? (
        <NativeCareInterestSheet
          accessToken={accessToken}
          onClose={() => setCareInterestOpen(false)}
          onSaved={() => void loadProfile()}
          open={careInterestOpen}
        />
      ) : null}
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  value,
  danger,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress?: () => void;
  value?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const interactive = Boolean(onPress) && !disabled;
  return (
    <Pressable accessibilityRole={interactive ? "button" : undefined} disabled={!interactive} onPress={onPress} style={styles.actionRow}>
      <View style={styles.rowIcon}>
        <Feather color={danger ? huddleColors.validationRed : huddleColors.iconMuted} name={icon} size={17} />
      </View>
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger, disabled && styles.actionLabelLocked]}>{label}</Text>
      {value ? <Text numberOfLines={1} style={[styles.actionValue, disabled && styles.actionValueLocked]}>{value}</Text> : null}
      {interactive ? <Feather color={huddleColors.mutedText} name="chevron-right" size={17} /> : null}
    </Pressable>
  );
}

function RowIconGlyph({ color, icon, size = 17 }: { color: string; icon: RowIcon; size?: number }) {
  const style = icon.family !== "nav" && icon.rotate ? { transform: [{ rotate: icon.rotate }] } : undefined;
  const glyph = icon.family === "nav"
    ? <NativeNavIcon color={color} size={size + 3} tab={icon.tab} />
    : icon.family === "material"
      ? <MaterialCommunityIcons color={color} name={icon.name} size={size + 1} style={style} />
      : <Feather color={color} name={icon.name} size={size} style={style} />;
  if (icon.slashed) {
    return (
      <View style={styles.slashedIconWrap}>
        {glyph}
        <View style={styles.iconSlash} />
      </View>
    );
  }
  return glyph;
}

function ToggleRow({
  disabled,
  enabled,
  icon,
  label,
  loading,
  onPress,
}: {
  disabled?: boolean;
  enabled: boolean;
  icon: RowIcon;
  label: string;
  loading?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "switch" : undefined}
      accessibilityState={{ checked: enabled, disabled: Boolean(disabled) }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.actionRow, disabled && styles.disabledRow]}
    >
      <View style={styles.rowIcon}>
        <RowIconGlyph color={huddleColors.iconMuted} icon={icon} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      {loading ? (
        <NativeSpinner tone="accent" size="md" />
      ) : (
        <View accessibilityLabel={`${label} ${enabled ? "on" : "off"}`} style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
          <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
        </View>
      )}
    </Pressable>
  );
}

function ConfirmModal({
  imageSource,
  mode,
  onClose,
  onConfirm,
}: {
  imageSource: ImageSourcePropType;
  mode: "push" | "map" | "logout" | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy = mode === "logout"
    ? { title: "Log out?", body: "You'll need to sign in again.", action: "Log out", danger: true }
    : mode === "map"
      ? { title: "Turn off map alerts?", body: "Missing-pet and nearby map alerts will be paused.", action: "Turn off", danger: false }
      : { title: "Turn off notifications?", body: "Real-time community and nearby map alerts will be paused.", action: "Turn off", danger: false };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={mode !== null}>
      <Pressable onPress={onClose} style={styles.modalBackdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.modalCard}>
          <Text style={styles.modalTitle}>{copy.title}</Text>
          <Text style={styles.modalBody}>{copy.body}</Text>
          {mode === "push" || mode === "map" ? (
            <Image accessibilityIgnoresInvertColors source={imageSource} style={styles.modalImage} />
          ) : null}
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.modalButton, styles.modalSecondaryButton, pressed && styles.pressed]}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.modalButton, styles.modalPrimaryButton, copy.danger && styles.modalDangerButton, pressed && styles.pressed]}>
              <Text style={styles.modalPrimaryText}>{copy.action}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function DeleteAccountModal({
  busy,
  confirm,
  error,
  errorHasSupport,
  onChangeConfirm,
  onClose,
  onConfirm,
  onOpenSupport,
  open,
}: {
  busy: boolean;
  confirm: string;
  error: string;
  errorHasSupport: boolean;
  onChangeConfirm: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onOpenSupport: () => void;
  open: boolean;
}) {
  const canConfirm = confirm.trim().toUpperCase() === "DELETE";
  const { shake: triggerShake, shakeStyle } = useErrorShake();
  const [inputFocused, setInputFocused] = useState(false);
  const modalScrollRef = useRef<ScrollView | null>(null);
  const onDisabledPress = () => {
    triggerShake();
  };
  const scrollDeleteFieldIntoView = useCallback(() => {
    setInputFocused(true);
    const scroll = () => modalScrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scroll);
    setTimeout(scroll, 120);
  }, []);
  return (
    <Modal animationType="fade" onRequestClose={busy ? undefined : onClose} transparent visible={open}>
      <AppKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
        <Pressable onPress={busy ? undefined : onClose} style={StyleSheet.absoluteFill} />
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={[nativeModalStyles.appConfirmCard, styles.deleteAccountCard]}>
            <AppModalCloseButton onPress={busy ? () => undefined : onClose} />
            <ScrollView keyboardShouldPersistTaps="handled" ref={modalScrollRef} showsVerticalScrollIndicator={false}>
              <Text style={[nativeModalStyles.appConfirmTitle, styles.deleteAccountTitle]}>Delete Account</Text>
              <Text style={nativeModalStyles.appConfirmBody}>
                This permanently removes your profile, photos, posts, pets, and chats. This can't be undone.{" "}
                <Text style={styles.deleteBodyStrong}>Care / Payment History records</Text>
                {" "}may be retained where required for payments, disputes, refunds, fraud prevention, legal, or accounting records. Type DELETE to confirm.
              </Text>
              <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                autoCapitalize="characters"
                editable={!busy}
                onBlur={() => setInputFocused(false)}
                onChangeText={onChangeConfirm}
                onFocus={scrollDeleteFieldIntoView}
                placeholder="DELETE"
                placeholderTextColor={huddleColors.mutedText}
                style={[styles.deleteInput, inputFocused ? styles.deleteInputFocused : null, error ? styles.deleteInputError : null]}
                value={confirm}
              />
              {error ? (
                <Text style={styles.deleteErrorText}>
                  {error}
                  {errorHasSupport ? (
                    <>
                      {" "}
                      <Text accessibilityRole="button" onPress={onOpenSupport} style={styles.deleteErrorLink}>
                        Contact Support
                      </Text>
                    </>
                  ) : null}
                </Text>
              ) : null}
              <RNAnimated.View style={[shakeStyle, { marginTop: 4 }]}>
                <SlideToConfirm
                  busy={busy}
                  disabled={!canConfirm}
                  label="Slide to Delete Account"
                  onCommit={onConfirm}
                  onDisabledPress={onDisabledPress}
                  tone="destructive"
                />
              </RNAnimated.View>
            </ScrollView>
          </View>
        </Pressable>
      </AppKeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 0,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  header: {
    minHeight: huddleLayout.headerHeight + huddleSpacing.x6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  backButton: {
    width: huddleVerifyIdentity.backButtonWidth,
    minHeight: huddleLayout.minTouch,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
    color: huddleColors.text,
  },
  headerSpacer: {
    opacity: 0,
  },
  content: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x9,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: "rgba(33, 69, 207, 0.08)",
  },
  emptyTitle: {
    marginTop: huddleSpacing.x4,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h3,
    lineHeight: 26,
    color: huddleColors.text,
  },
  emptyCopy: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x4,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.06)",
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x4,
    ...huddleShadows.glassElevation2,
  },
  verifiedBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: huddleColors.canvas,
    backgroundColor: huddleColors.blue,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
    flexShrink: 1,
  },
  socialId: {
    marginTop: 2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x2,
  },
  tierPill: {
    minHeight: 25,
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: "#ECEFF4",
  },
  tierPillPlus: {
    backgroundColor: "#5BA4F5",
  },
  tierPillGold: {
    backgroundColor: "#FF6A55",
  },
  tierPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: "#6E7386",
  },
  tierPillTextActive: {
    color: huddleColors.onPrimary,
  },
  starsPill: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: huddleRadii.pill,
    borderWidth: 1,
    borderColor: "#E4E8F2",
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x3,
  },
  starsPillEmpty: {
    borderColor: "#C6CAD6",
    backgroundColor: "transparent",
  },
  starsPillText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.text,
  },
  starsPillTextEmpty: {
    color: "#98A0B8",
  },
  sectionLabel: {
    marginTop: huddleSpacing.x5,
    marginBottom: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x1,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: 16,
    letterSpacing: 0,
    color: huddleColors.mutedText,
  },
  group: {
    overflow: "hidden",
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: "rgba(66, 73, 101, 0.06)",
    backgroundColor: huddleColors.canvas,
  },
  pushNotice: {
    marginTop: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  actionRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x3,
  },
  disabledRow: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
  rowIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(33, 69, 207, 0.07)",
  },
  slashedIconWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSlash: {
    position: "absolute",
    width: 25,
    height: 1.75,
    borderRadius: 1,
    backgroundColor: huddleColors.iconMuted,
    transform: [{ rotate: "45deg" }],
  },
  actionLabel: {
    flex: 1,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  actionLabelDanger: {
    color: huddleColors.validationRed,
  },
  actionLabelLocked: {
    color: huddleColors.mutedText,
  },
  actionValue: {
    maxWidth: 124,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.subtext,
  },
  actionValueLocked: {
    color: huddleColors.mutedText,
  },
  toggleTrack: {
    ...huddleGlassControls.toggleSurface,
    width: 42,
    height: 24,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 3,
  },
  toggleTrackOn: {
    backgroundColor: huddleColors.blue,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: huddleColors.canvas,
  },
  toggleThumbOn: {
    transform: [{ translateX: 18 }],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
    backgroundColor: huddleColors.divider,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleSpacing.x4,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    ...huddleShadows.glassElevation2,
  },
  modalTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
    textAlign: "center",
  },
  modalBody: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  modalImage: {
    width: "100%",
    height: 150,
    marginTop: huddleSpacing.x4,
    borderRadius: huddleRadii.card,
  },
  deleteAccountCard: {
    paddingTop: huddleSpacing.x8,
  },
  deleteAccountTitle: {
    paddingRight: huddleSpacing.x6,
  },
  deleteBodyStrong: {
    fontFamily: "Urbanist-700",
    color: huddleColors.text,
  },
  deleteInput: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: huddleLayout.fieldHeight,
    marginTop: huddleSpacing.x4,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: "rgba(198, 202, 214, 0.9)",
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: 22,
    color: huddleColors.text,
    overflow: "hidden",
  },
  deleteInputFocused: {
    ...huddleFieldStates.focused,
  },
  deleteInputError: {
    ...huddleFieldStates.error,
  },
  deleteErrorText: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  deleteErrorLink: {
    fontFamily: "Urbanist-700",
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  modalActions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  modalButton: {
    flex: 1,
    ...huddleButtons.base,
  },
  modalSecondaryButton: {
    ...huddleButtons.secondary,
  },
  modalPrimaryButton: {
    ...huddleButtons.primary,
  },
  modalDangerButton: {
    ...huddleButtons.destructive,
  },
  modalSecondaryText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  modalPrimaryText: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
});
