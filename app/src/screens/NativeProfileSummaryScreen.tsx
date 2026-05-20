import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from "react-native";
import strayCatImage from "../../assets/stray-cat-notification.png";
import strayDogImage from "../../assets/stray-dog-notification.png";
import { createNativeFunctionHeaders } from "../lib/nativeFunctionClient";
import { NativePublicProfileModal } from "../components/profile/NativePublicProfileModal";
import { AppModalCloseButton, SlideToConfirm } from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { useShakeAnimation } from "../lib/nativeAnimations";
import { Animated as RNAnimated } from "react-native";
import { haptic } from "../lib/nativeHaptics";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  subscribeNativeProfileSummary,
  writeNativeProfileSummaryCache,
  type NativeProfileSummary,
  type NativeQuotaSnapshot,
} from "../lib/nativeProfileSummary";
import { Image as ExpoImage } from "expo-image";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { isNativeVerifiedProfile } from "../lib/nativeVerificationGate";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleImageDefaults,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
  huddleVerifyIdentity,
} from "../theme/huddleDesignTokens";

type NativeProfileSummaryScreenProps = {
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
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
  vet?: boolean | null;
  email?: boolean | null;
  email_enabled?: boolean | null;
};

type RowIcon =
  | { family: "feather"; name: keyof typeof Feather.glyphMap; rotate?: string; slashed?: boolean }
  | { family: "material"; name: keyof typeof MaterialCommunityIcons.glyphMap; rotate?: string; slashed?: boolean };

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

const settingsRestHeaders = (accessToken: string, extra?: Record<string, string>) => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: supabaseAnonKey,
  ...extra,
});

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
    return String((parsed as { message?: unknown }).message || fallback);
  }
  return typeof parsed === "string" && parsed ? parsed : fallback;
};

const settingsRestUrl = (table: string) => new URL(`${supabaseUrl}/rest/v1/${table}`);

const fetchNotificationPrefsWithToken = async (userId: string, accessToken?: string | null) => {
  const token = requireSettingsAccessToken(accessToken);
  const url = settingsRestUrl("notification_preferences");
  url.searchParams.set("select", "push_enabled,pause_all,social,chats,map,pets,vet,email,email_enabled");
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
  const token = requireSettingsAccessToken(accessToken);
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
      vet: next.services,
      email_enabled: next.systems,
      email: next.systems,
    }),
  });
  const parsed = await parseSettingsRestJson(response);
  if (!response.ok) throw new Error(settingsRestError(parsed, response.statusText));
};

const upsertPushTokenWithToken = async (userId: string, tokenValue: string, deviceId: string, accessToken?: string | null) => {
  const token = requireSettingsAccessToken(accessToken);
  const url = settingsRestUrl("push_tokens");
  url.searchParams.set("on_conflict", "user_id,token");
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: settingsRestHeaders(token, {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      user_id: userId,
      token: tokenValue,
      platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
      device_id: deviceId,
      is_active: true,
      last_used_at: new Date().toISOString(),
    }),
  });
  const parsed = await parseSettingsRestJson(response);
  if (!response.ok) throw new Error(settingsRestError(parsed, response.statusText));
};

const patchProfileWithToken = async (userId: string, payload: Record<string, unknown>, accessToken?: string | null) => {
  const token = requireSettingsAccessToken(accessToken);
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
  if (tier === "gold" || tier === "huddle gold" || tier.startsWith("gold_")) return "gold";
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
  if (tier === "gold") return "Huddle Gold";
  if (tier === "plus") return "Huddle+";
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
  services: row ? row.vet !== false : DEFAULT_PREFS.services,
  systems: row ? Boolean(row.email_enabled ?? row.email ?? true) : DEFAULT_PREFS.systems,
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

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") return "permission_denied";

  const projectId = readProjectId();
  if (!projectId) return "project_id_missing";

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token.data) return "token_missing";

  const deviceId = await getOrCreateNativeDeviceId();
  await upsertPushTokenWithToken(userId, token.data, deviceId, accessToken);
  await patchProfileWithToken(userId, { fcm_token: token.data }, accessToken);
  return "registered";
};

export function NativeProfileSummaryScreen({ userId, accessToken, sessionKey, onBack, onNavigate, onSignOut }: NativeProfileSummaryScreenProps) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<NativeProfileSummary | null>(null);
  const [quota, setQuota] = useState<NativeQuotaSnapshot | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<"push" | "map" | "logout" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
  const [publicProfileOpen, setPublicProfileOpen] = useState(false);

  const loadProfile = useCallback(async () => {
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
      if (cached) {
        setProfile(cached.profile);
        setQuota(cached.quota);
        setLoading(false);
      }
      try {
        const [profileSummary, prefsResult] = await Promise.all([
          fetchNativeProfileSummary(userId, { force: false, accessToken, sessionKey }),
          fetchNotificationPrefsWithToken(userId, accessToken),
        ]);

        setProfile(profileSummary.profile);
        setQuota(profileSummary.quota);
        const nextPrefs = prefsFromRow(prefsResult);
        setPrefs(nextPrefs);
        setLoadError(null);
        setLoading(false);
        if (!prefsResult && userId) await upsertNotificationPrefsWithToken(userId, DEFAULT_PREFS, accessToken);
      } catch (error) {
        console.warn("Native profile summary unavailable", { userId, error });
        setLoadError("We couldn't load your account summary. Please try again.");
        setLoading(false);
      }
    }, [accessToken, sessionKey, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!userId) return;
    return subscribeNativeProfileSummary(userId, ({ profile: nextProfile, quota: nextQuota }) => {
      setProfile(nextProfile);
      setQuota(nextQuota);
    });
  }, [userId]);

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

  const persistPrivacy = useCallback(async (next: { nonSocial: boolean; hideFromMap: boolean }, key: string) => {
    if (!userId) return;
    const previous = profile;
    setProfile((current) => current ? { ...current, non_social: next.nonSocial, hide_from_map: next.hideFromMap } : current);
    setSavingKey(key);
    try {
      await patchProfileWithToken(userId, { non_social: next.nonSocial, hide_from_map: next.hideFromMap }, accessToken);
      if (previous) {
        const nextProfile = { ...previous, non_social: next.nonSocial, hide_from_map: next.hideFromMap };
        await writeNativeProfileSummaryCache(userId, { profile: nextProfile, quota }, { sessionKey });
      }
    } catch {
      setProfile(previous);
    }
    setSavingKey(null);
  }, [accessToken, profile, quota, sessionKey, userId]);

  const handlePushToggle = useCallback((next: boolean) => {
    if (prefs.push_enabled && !next) {
      setConfirmMode("push");
      return;
    }
    void (async () => {
      const previous = prefs;
      const nextPrefs = { ...prefs, push_enabled: next };
      const saved = await persistPrefs(nextPrefs, "push");
      if (!saved) return;
      if (!next || !userId) return;
      setSavingKey("push");
      try {
        await registerPushForDevice(userId, accessToken);
      } catch {
        setPrefs(previous);
      }
      setSavingKey(null);
    })();
  }, [accessToken, persistPrefs, prefs, userId]);

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
    const pushEnabled = prefs.push_enabled;
    return [
      { icon: { family: "feather", name: "bell" } as RowIcon, label: "Push notifications", enabled: pushEnabled, key: "push_enabled" as const, disabled: false },
      { icon: { family: "material", name: "paw" } as RowIcon, label: "Pets", enabled: pushEnabled && prefs.pets, key: "pets" as const, disabled: !pushEnabled },
      { icon: { family: "feather", name: "message-square" } as RowIcon, label: "Social", enabled: pushEnabled && prefs.social, key: "social" as const, disabled: !pushEnabled },
      { icon: { family: "feather", name: "users" } as RowIcon, label: "Chats", enabled: pushEnabled && prefs.chats, key: "chats" as const, disabled: !pushEnabled },
      { icon: { family: "feather", name: "map-pin" } as RowIcon, label: "Map alerts", enabled: pushEnabled && prefs.map, key: "map" as const, disabled: !pushEnabled },
      { icon: { family: "feather", name: "heart" } as RowIcon, label: "Care", enabled: pushEnabled && prefs.services, key: "services" as const, disabled: !pushEnabled },
      { icon: { family: "feather", name: "settings" } as RowIcon, label: "Systems", enabled: prefs.systems, key: "systems" as const, disabled: false },
    ];
  }, [prefs]);

  const submitDeleteAccount = useCallback(async () => {
    if (deleteConfirm !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("auth_required");
      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: "POST",
        headers: {
          ...createNativeFunctionHeaders(accessToken),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(body?.error || body?.message || "delete_failed");
      setDeleteOpen(false);
      setDeleteConfirm("");
      onSignOut();
    } catch {
      setDeleteError("We couldn't delete your account. Please retry.");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirm, onSignOut]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.state}>
          <ActivityIndicator color={huddleColors.blue} size="small" />
          <Text style={styles.stateText}>Loading profile...</Text>
        </View>
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
            <View style={[styles.avatar, isNativeVerifiedProfile(profile) && styles.avatarVerified]}>
              {profile?.avatar_url ? (
                <ExpoImage
                  accessibilityIgnoresInvertColors
                  source={{ uri: profile.avatar_url }}
                  style={styles.avatarImage}
                  contentFit={huddleImageDefaults.contentFit}
                  cachePolicy={huddleImageDefaults.cachePolicy}
                  transition={huddleImageDefaults.transition}
                  priority="high"
                />
              ) : (
                <Text style={styles.avatarInitials}>{display.initials}</Text>
              )}
            </View>
            <View style={[styles.verifiedBadge, isNativeVerifiedProfile(profile) && styles.verifiedBadgeActive]}>
              <Feather color={isNativeVerifiedProfile(profile) ? huddleColors.onPrimary : huddleColors.mutedText} name="shield" size={13} />
            </View>
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
                  <Feather color={display.starsRemaining > 0 ? huddleColors.premiumGold : huddleColors.mutedText} name="star" size={12} />
                  <Text style={[styles.starsPillText, display.starsRemaining <= 0 && styles.starsPillTextEmpty]}>{display.starsRemaining}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        <Text style={styles.sectionLabel}>MEMBERSHIP</Text>
        <View style={styles.group}>
          <ActionRow icon="star" label="Manage Membership" value={display.tierLabel} onPress={() => onNavigate("/premium")} />
        </View>

        <Text style={styles.sectionLabel}>VISIBILITY</Text>
        <View style={styles.group}>
          <ToggleRow
            disabled={savingKey !== null}
            icon={profile?.non_social === true
              ? { family: "material", name: "hand-wave", rotate: "-20deg", slashed: true }
              : { family: "material", name: "hand-wave", rotate: "-20deg" }}
            label="Appear in Discovery"
            loading={savingKey === "discovery"}
            enabled={profile?.non_social !== true}
            onPress={() => void persistPrivacy({ nonSocial: profile?.non_social !== true, hideFromMap: profile?.hide_from_map === true }, "discovery")}
          />
          <Divider />
          <ToggleRow
            disabled={savingKey !== null}
            icon={{ family: "feather", name: profile?.hide_from_map === true ? "eye-off" : "eye" }}
            label="Incognito on Map"
            loading={savingKey === "map-privacy"}
            enabled={profile?.hide_from_map === true}
            onPress={() => void persistPrivacy({ nonSocial: profile?.non_social === true, hideFromMap: profile?.hide_from_map !== true }, "map-privacy")}
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
                    handlePushToggle(!prefs.push_enabled);
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

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <ActionRow icon="edit-3" label="Edit profile" onPress={() => onNavigate("/edit-profile")} />
          <Divider />
          <ActionRow icon="shield" label="Identity Verification" value={display.verification} onPress={() => onNavigate("/verify-identity")} />
          <Divider />
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
        onChangeConfirm={(value) => {
          setDeleteConfirm(value);
          if (deleteError) setDeleteError("");
        }}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteConfirm("");
          setDeleteError("");
        }}
        onConfirm={() => void submitDeleteAccount()}
        open={deleteOpen}
      />
      <NativePublicProfileModal
        accessToken={accessToken ?? null}
        currentUserId={userId}
        memberNumber={null}
        sessionKey={sessionKey}
        onClose={() => setPublicProfileOpen(false)}
        open={publicProfileOpen}
        userId={userId}
      />
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
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.actionRow}>
      <View style={styles.rowIcon}>
        <Feather color={danger ? huddleColors.validationRed : huddleColors.iconMuted} name={icon} size={17} />
      </View>
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>{label}</Text>
      {value ? <Text numberOfLines={1} style={styles.actionValue}>{value}</Text> : null}
      {disabled ? null : <Feather color={huddleColors.mutedText} name="chevron-right" size={17} />}
    </Pressable>
  );
}

function RowIconGlyph({ color, icon, size = 17 }: { color: string; icon: RowIcon; size?: number }) {
  const style = icon.rotate ? { transform: [{ rotate: icon.rotate }] } : undefined;
  const glyph = icon.family === "material"
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
        <ActivityIndicator color={huddleColors.blue} size="small" />
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
  onChangeConfirm,
  onClose,
  onConfirm,
  open,
}: {
  busy: boolean;
  confirm: string;
  error: string;
  onChangeConfirm: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  const canConfirm = confirm.trim().toUpperCase() === "DELETE";
  const [shakeAnim, triggerShake] = useShakeAnimation();
  const onDisabledPress = () => {
    haptic.error();
    triggerShake();
  };
  return (
    <Modal animationType="fade" onRequestClose={busy ? undefined : onClose} transparent visible={open}>
      <Pressable onPress={busy ? undefined : onClose} style={[nativeModalStyles.appModalBackdrop, nativeModalStyles.appModalSafeArea]}>
        <Pressable onPress={(event) => event.stopPropagation()} style={nativeModalStyles.appConfirmBoundary}>
          <View style={[nativeModalStyles.appConfirmCard, styles.deleteAccountCard]}>
            <AppModalCloseButton onPress={busy ? () => undefined : onClose} />
            <Text style={[nativeModalStyles.appConfirmTitle, styles.deleteAccountTitle]}>Delete Account</Text>
            <Text style={nativeModalStyles.appConfirmBody}>Type DELETE to confirm permanent deletion.</Text>
            <TextInput
              autoCapitalize="characters"
              editable={!busy}
              onChangeText={onChangeConfirm}
              placeholder="DELETE"
              placeholderTextColor={huddleColors.mutedText}
              style={[styles.deleteInput, error ? styles.deleteInputError : null]}
              value={confirm}
            />
            {error ? <Text style={styles.deleteErrorText}>{error}</Text> : null}
            <RNAnimated.View style={{ transform: [{ translateX: shakeAnim }], marginTop: 4 }}>
              <SlideToConfirm
                busy={busy}
                disabled={!canConfirm}
                label="Slide to Delete Account"
                onCommit={onConfirm}
                onDisabledPress={onDisabledPress}
                tone="destructive"
              />
            </RNAnimated.View>
          </View>
        </Pressable>
      </Pressable>
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
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
  },
  stateText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
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
  avatar: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
    backgroundColor: huddleColors.mutedCanvas,
    borderWidth: 2,
    borderColor: "rgba(198, 202, 214, 0.78)",
  },
  avatarVerified: {
    borderColor: huddleColors.blue,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
  },
  avatarInitials: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
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
    backgroundColor: huddleColors.mutedCanvas,
  },
  verifiedBadgeActive: {
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
  actionValue: {
    maxWidth: 124,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.subtext,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#DDE2EE",
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
  deleteInput: {
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
