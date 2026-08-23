import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Alert, AppState, BackHandler, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { NativeLegalText } from "../components/NativeLegalText";
import type { Session } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import { FullWindowOverlay } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeBottomNav, type NativeBottomTab } from "../components/NativeBottomNav";
import { useNativeCareMarket } from "../lib/nativeCareMarket";
import { NativeFadeIn } from "../components/motion/NativeMotion";
import { nativeHardwareBackTarget, nativePathForHuddleWebPath } from "../lib/nativeInternalLinks";
import { canonicalizeNativeProfilePetPath, completeNativeRecoveryDismissal, consumeNativeInboundDestination, enqueueNativeInboundDestination, nativeNavigationOverlayStateFor, nativeRouteTransition, nativeSignupResumePath, nativeSignupStepFromPath, recordNativeRouteHistory, removeNativeInboundDestination, replaceNativeRouteHistory, resolveNativeEffectiveRoute, restoreNativeRouteHistory, type NativeInboundDestination } from "../lib/nativeNavigationState";
import { clearNativeNewChatSignal, readNativeNewChatSignal } from "../lib/nativeNewChatSignal";
import { hideNativeReturnBanner, subscribeNativeBanner, type NativeBannerPayload } from "../lib/nativeBannerBus";
import { NativeReturnBanner } from "../components/NativeReturnBanner";
import { NativeToast } from "../components/NativeToast";
import { hideNativeWindowToast, showNativeWindowToast, subscribeNativeWindowToast, type NativeWindowToastPayload } from "../lib/nativeToastBus";
import { NativeGlobalHeader } from "../components/NativeGlobalHeader";
import { NativeSettingsDrawer } from "../components/NativeSettingsDrawer";
import { NativeNotificationsPanel } from "../components/NativeNotificationsPanel";
import { NativeCareInterestSheet } from "../components/NativeCareInterestSheet";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleFieldStates, huddleLayout, huddleRadii, huddleShadows, huddleSocial, huddleSpacing } from "../theme/huddleDesignTokens";
import { getNativeLegalPage, type NativeLegalPageContent } from "../content/nativeLegalPages";
import { consumeNativeSupabaseAuthRedirect, isNativeAuthRedirectUrl } from "../lib/nativeAuthRedirect";
import { clearNativeSignupDraft, parseNativeSignupVerifyUrl } from "../lib/nativeSignup";
import { fetchNativeChatUnreadTotal, fetchNativeMatchedRailSummary, preloadNativeChatsInboxOnAppStart } from "../lib/nativeChat";
import { cacheNativeLocationCoordinates, getNativeCurrentCoordinates, getNativeForegroundLocationPermissionDetail, subscribeNativeLocationPermissionDetail, watchNativeLocation } from "../lib/nativeLocation";
import { getNativeCameraPermissionDetail, getNativeMediaLibrarySavePermissionDetail, getNativePhotoLibraryPermissionDetail } from "../lib/nativeMediaPermissions";
import { getNativeNotificationPermissionDetail, requestNativeNotificationPermissionDetail } from "../lib/nativeNotificationPermissions";
import { getNativeContactPermissionDetail } from "../lib/nativeContactPermissions";
import { clearNativeMapCaches, fetchNativeMapPeopleV2, fetchVisibleMapPinShells, purgeNativeMapPersistentCaches } from "../lib/nativeMapData";
import { setNativeMapWarmCenter } from "../lib/nativeMapConfig";
import { fetchNativeServiceProviders } from "../lib/nativeService";
import { returnNativeUserOutNow, syncNativePrivateUserLocation } from "../lib/nativeMapMutations";
import { clearAllNativeActiveSessionActivities, clearNativeActiveSessionActionAuth, endHomePresenceActivity, OUT_NOW_CONTINUE_REQUEST_KEY } from "../lib/nativeActiveSessions";
import { hydrateNativeActiveSessions } from "../lib/nativeActiveSessionHydration";
import { recordAppReviewSession } from "../lib/nativeAppReview";
import {
  preloadNativeHomeCommunityBundle,
  preloadNativeHomeNearbyPeople,
  preloadNativeHomePets,
} from "../screens/NativeHomeScreen";
import {
  getNativeSessionIdentity,
  isSameNativeSessionIdentity,
  isSameNativeSessionUser,
  parseNativeOnboardingSnapshot,
  resolveNativeBootRoute,
  type NativeBootRoute,
  type NativeOnboardingSnapshot,
  type NativeSessionIdentity,
} from "../lib/nativeAuthBoot";
import { createNativeSessionKey, freshnessRegistry, type RefreshSurface } from "../lib/nativeFreshnessRegistry";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { nativePasswordPolicyError } from "../lib/nativePasswordSecurity";
import { getNativeTurnstileSiteKey } from "../lib/nativeTurnstile";
import { clearNativeAuthState, createFreshNativeFunctionHeaders, createNativeAuthenticatedHeaders, getFreshNativeAccessToken, getFreshNativeSession, noteNativeAuthState, refreshNativeSessionOnce, setNativeAuthRefreshForeground, signOutNativeAuthSession, subscribeNativeAuthState } from "../lib/nativeFunctionClient";
import { registerNativePushTokenForSession } from "../lib/nativePushRegistration";
import {
  nativeNotificationAction,
  nativeNotificationActionErrorCopy,
  notificationActionResponseKey,
  notificationResponseId,
  registerNativeNotificationActions,
} from "../lib/nativeNotificationActions";
import { resolveNativeSettingsDrawerNavigation, type NativeSettingsOverlayName } from "../lib/nativeVerifyIdentityRouteOwnership";
import { fetchNativeUnreadNotificationCountWithToken, markNativeFriendRequestNotificationsReadWithToken, notificationDestinationPath, readCachedNativeUnreadNotificationCount, verifyNativeNotificationOwnershipWithToken } from "../lib/nativeNotifications";
import { NativeLeftEdgeSwipe } from "../components/NativeLeftEdgeSwipe";
import { clearNativeProfileSummaryCache, fetchNativeProfileSummary, isNativeProfileAtLeastAge, readCachedNativeProfileSummary } from "../lib/nativeProfileSummary";
import { createSinglePrivateBroadcastChannel, createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import { preloadNativeStoreProducts } from "../lib/nativeStoreSubscriptions";
import { recordNativeSurfaceVisit, type NativeUsageSurface } from "../lib/nativeSurfaceUsage";
import { clearNativeOnboardingHero, isNativeOnboardingHeroPending } from "../lib/nativeOnboardingHero";
import { NativeOnboardingHeroScreen } from "../screens/NativeOnboardingHeroScreen";
import { NativeOpeningIntroScreen } from "../screens/NativeOpeningIntroScreen";
import { hasSeenNativeOpeningIntro } from "../lib/nativeOpeningIntro";
import { NativeSocialScreen, warmNativeSocialFirstPageCache } from "../screens/NativeSocialScreen";
import { readNativeChatsLastTabHandoff } from "../lib/nativeChatHandoff";
import { isNativeOAuthProvider, type NativeOAuthProvider } from "../lib/nativeOAuthProviders";
import type { NativeOAuthResolution } from "../lib/nativeOAuthResolution";
import { readCachedNativeViewerScope, resolveNativeViewerScope } from "../lib/nativeViewerScope";

type NativeRoute = NativeBootRoute;
type NativeLooseScreen = (props: Record<string, unknown>) => ReactElement | null;
type NativeMainRoute = "/" | "/social" | "/chats" | "/service" | "/map";
const isCareAvailabilityRoute = (path: string) => {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/service"
    || pathname === "/carerprofile"
    || pathname === "/carer-profile"
    || pathname === "/booking-terms"
    || pathname === "/service-agreement"
    || pathname === "/service-provider-agreement";
};

const NATIVE_MAIN_ROUTES: NativeMainRoute[] = ["/", "/social", "/chats", "/service", "/map"];
const isNativeMainRoute = (route: NativeRoute): route is NativeMainRoute => NATIVE_MAIN_ROUTES.includes(route as NativeMainRoute);

const NativeAuthRoute = (props: Record<string, unknown>) => {
  const { NativeAuthScreen } = require("../screens/NativeAuthScreen") as typeof import("../screens/NativeAuthScreen");
  const Screen = NativeAuthScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeCarerProfileRoute = (props: Record<string, unknown>) => {
  const { NativeCarerProfileScreen } = require("../screens/NativeCarerProfileScreen") as typeof import("../screens/NativeCarerProfileScreen");
  const Screen = NativeCarerProfileScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeChatDialogueRoute = (props: Record<string, unknown>) => {
  const { NativeChatDialogueScreen } = require("../screens/NativeChatDialogueScreen") as typeof import("../screens/NativeChatDialogueScreen");
  const Screen = NativeChatDialogueScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeChatsRoute = (props: Record<string, unknown>) => {
  const { NativeChatsScreen } = require("../screens/NativeChatsScreen") as typeof import("../screens/NativeChatsScreen");
  const Screen = NativeChatsScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeEditProfileRoute = (props: Record<string, unknown>) => {
  const { NativeEditProfileScreen } = require("../screens/NativeEditProfileScreen") as typeof import("../screens/NativeEditProfileScreen");
  const Screen = NativeEditProfileScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeHomeRoute = (props: Record<string, unknown>) => {
  const { NativeHomeScreen } = require("../screens/NativeHomeScreen") as typeof import("../screens/NativeHomeScreen");
  const Screen = NativeHomeScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeManageSubscriptionRoute = (props: Record<string, unknown>) => {
  const { NativeManageSubscriptionScreen } = require("../screens/NativeManageSubscriptionScreen") as typeof import("../screens/NativeManageSubscriptionScreen");
  const Screen = NativeManageSubscriptionScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeMapRoute = (props: Record<string, unknown>) => {
  const { NativeMapScreen } = require("../screens/NativeMapScreen") as typeof import("../screens/NativeMapScreen");
  const Screen = NativeMapScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativePetDetailsRoute = (props: Record<string, unknown>) => {
  const { NativePetDetailsScreen } = require("../screens/NativePetDetailsScreen") as typeof import("../screens/NativePetDetailsScreen");
  const Screen = NativePetDetailsScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeProfileSummaryRoute = (props: Record<string, unknown>) => {
  const { NativeProfileSummaryScreen } = require("../screens/NativeProfileSummaryScreen") as typeof import("../screens/NativeProfileSummaryScreen");
  const Screen = NativeProfileSummaryScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeSecuritySettingsRoute = (props: Record<string, unknown>) => {
  const { NativeSecuritySettingsScreen } = require("../screens/NativeSecuritySettingsScreen") as typeof import("../screens/NativeSecuritySettingsScreen");
  const Screen = NativeSecuritySettingsScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeServiceChatRoute = (props: Record<string, unknown>) => {
  const { NativeServiceChatScreen } = require("../screens/NativeServiceChatScreen") as typeof import("../screens/NativeServiceChatScreen");
  const Screen = NativeServiceChatScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeServiceRoute = (props: Record<string, unknown>) => {
  const { NativeServiceScreen } = require("../screens/NativeServiceScreen") as typeof import("../screens/NativeServiceScreen");
  const Screen = NativeServiceScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeSetPetRoute = (props: Record<string, unknown>) => {
  const { NativeSetPetScreen } = require("../screens/NativeSetPetScreen") as typeof import("../screens/NativeSetPetScreen");
  const Screen = NativeSetPetScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeSignupRoute = (props: Record<string, unknown>) => {
  const { NativeSignupScreen } = require("../screens/NativeSignupScreen") as typeof import("../screens/NativeSignupScreen");
  const Screen = NativeSignupScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeSocialRoute = (props: Record<string, unknown>) => {
  const Screen = NativeSocialScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const prewarmNativeMainTabRoutes = () => {
  const prewarmers = [
    () => { require("../screens/NativeChatsScreen") as typeof import("../screens/NativeChatsScreen"); },
    () => { require("../screens/NativeServiceScreen") as typeof import("../screens/NativeServiceScreen"); },
    () => { require("../screens/NativeMapScreen") as typeof import("../screens/NativeMapScreen"); },
  ];
  let cancelled = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const run = (index: number) => {
    if (cancelled || index >= prewarmers.length) return;
    requestAnimationFrame(() => {
      if (cancelled) return;
      prewarmers[index]();
      const timer = setTimeout(() => run(index + 1), 32);
      timers.push(timer);
    });
  };
  run(0);
  return () => {
    cancelled = true;
    timers.forEach((timer) => clearTimeout(timer));
  };
};
const NativeSupportRoute = (props: Record<string, unknown>) => {
  const { NativeSupportScreen } = require("../screens/NativeSupportScreen") as typeof import("../screens/NativeSupportScreen");
  const Screen = NativeSupportScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const NativeVerifyIdentityRoute = (props: Record<string, unknown>) => {
  const { NativeVerifyIdentityScreen } = require("../screens/NativeVerifyIdentityScreen") as typeof import("../screens/NativeVerifyIdentityScreen");
  const Screen = NativeVerifyIdentityScreen as unknown as NativeLooseScreen;
  return <Screen {...props} />;
};
const BOOT_LOGO_MEDIA_SIZE = 160;
// SecureStore/auth initialization must never leave the app on an empty boot
// surface. If iOS does not resolve the stored session promptly, fail open to
// the sign-in screen; a late valid session can still activate normally.
const BOOT_AUTH_SESSION_MAX_MS = 4000;
// Background warming has a four-second completion deadline for deferred work
// such as push maintenance and post-signup prompts. It never gates signed-in
// navigation; visible routes own their cache-first paint independently.
const BOOT_SURFACE_PREWARM_MAX_MS = 4000;
// Give Home's critical requests the first network window, then start every
// other main-tab warm even if a slow Home dependency is still pending.
const BOOT_HOME_PRIORITY_WINDOW_MS = 700;
const BOOT_SNAPSHOT_RETRY_DELAY_MS = 600;
const BOOT_RECOVERABLE_COPY = "We’re having trouble loading your account right now.";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getNativeBootSession = async () => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("auth_boot_session_timeout")), BOOT_AUTH_SESSION_MAX_MS);
  });
  return Promise.race([getFreshNativeSession(), timeout]);
};


const nativeErrorMessage = (error: unknown) => String((error as { message?: unknown })?.message || error || "unknown");

const nativeBootLog = (event: string, payload?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log(`[HUDDLE_NATIVE_BOOT] ${event}`, payload ?? {});
};

const isRecoveryAuthRedirect = (value: string | null | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.searchParams.get("type") === "recovery" || new URLSearchParams(url.hash.replace(/^#/, "")).get("type") === "recovery";
  } catch {
    return String(value).includes("type=recovery");
  }
};

const isInvalidAuthTokenError = (error: unknown) => {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof record.status === "number" ? record.status : typeof record.statusCode === "number" ? record.statusCode : null;
  const code = String(record.code || record.error_code || "").toLowerCase();
  const message = String(record.message || error || "").toLowerCase();

  return (
    status === 401 ||
    code.includes("invalid") && (code.includes("jwt") || code.includes("token") || code.includes("session")) ||
    message.includes("invalid jwt") ||
    message.includes("jwt expired") ||
    message.includes("invalid token") ||
    message.includes("session not found")
  );
};

const fetchNativeOnboardingSnapshotWithToken = async (accessToken: string): Promise<{ data: NativeOnboardingSnapshot | null; error: unknown | null }> => {
  try {
    const freshAccessToken = await getFreshNativeAccessToken(accessToken);
    if (!freshAccessToken) return { data: null, error: "auth_required" };
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_native_onboarding_snapshot`, {
      method: "POST",
      headers: createNativeAuthenticatedHeaders(freshAccessToken, {
        "content-type": "application/json",
      }),
      body: "{}",
    });

    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (!response.ok) return { data: null, error: parsed ?? raw ?? response.statusText };
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    const snapshot = parseNativeOnboardingSnapshot(row);
    return { data: snapshot, error: snapshot ? null : "native_onboarding_snapshot_invalid_shape" };
  } catch (error) {
    return { data: null, error };
  }
};

const nativeRestHeaders = (accessToken: string, extra: Record<string, string> = {}) =>
  createNativeAuthenticatedHeaders(accessToken, extra);

const readNativePushProjectId = () => {
  const easProjectId = Constants.easConfig?.projectId;
  const expoExtra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const expoProjectId = expoExtra?.eas?.projectId;
  return typeof easProjectId === "string"
    ? easProjectId
    : typeof expoProjectId === "string"
      ? expoProjectId
      : null;
};

const getOrCreateRootPushDeviceId = async () => {
  const key = "huddle:native:device-id";
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const next = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(key, next);
  return next;
};

const LEGACY_PENDING_NOTIFICATION_ACTION_RESPONSES_KEY = "huddle:native:pending-notification-actions:v1";
const pendingNotificationActionResponsesKey = (userId: string) =>
  `huddle:native:pending-notification-actions:v2:${encodeURIComponent(userId)}`;
let pendingNotificationActionStorageMutation: Promise<void> = Promise.resolve();

const serializePendingNotificationActionStorageMutation = <T,>(work: () => Promise<T>): Promise<T> => {
  const result = pendingNotificationActionStorageMutation.then(work, work);
  pendingNotificationActionStorageMutation = result.then(() => undefined, () => undefined);
  return result;
};

const readPendingNotificationActionResponses = async (userId: string) => {
  const storageKey = pendingNotificationActionResponsesKey(userId);
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return [] as Notifications.NotificationResponse[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as Notifications.NotificationResponse[] : [];
  } catch {
    await AsyncStorage.removeItem(storageKey);
    return [] as Notifications.NotificationResponse[];
  }
};

const persistPendingNotificationActionResponse = async (response: Notifications.NotificationResponse, userId: string) => {
  const responseKey = notificationActionResponseKey(response);
  if (!responseKey || !userId) return;
  await serializePendingNotificationActionStorageMutation(async () => {
    const current = await readPendingNotificationActionResponses(userId);
    const next = [...current.filter((item) => notificationActionResponseKey(item) !== responseKey), response].slice(-10);
    await AsyncStorage.setItem(pendingNotificationActionResponsesKey(userId), JSON.stringify(next));
  });
};

const removePendingNotificationActionResponse = async (responseKey: string, userId: string) => {
  if (!responseKey || !userId) return;
  await serializePendingNotificationActionStorageMutation(async () => {
    const storageKey = pendingNotificationActionResponsesKey(userId);
    const current = await readPendingNotificationActionResponses(userId);
    const next = current.filter((item) => notificationActionResponseKey(item) !== responseKey);
    if (next.length > 0) await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    else await AsyncStorage.removeItem(storageKey);
  });
};

const clearPendingNotificationActionResponses = async (userId: string | null | undefined) => {
  if (!userId) return;
  await serializePendingNotificationActionStorageMutation(() =>
    AsyncStorage.removeItem(pendingNotificationActionResponsesKey(userId)));
};

const ensureNativePushNotificationChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("huddle-push", {
    name: "huddle alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2145CF",
  });
};

const registerNativePushForSession = async (userId: string, accessToken: string) => {
  if (!Device.isDevice) return "physical_device_required";
  const freshAccessToken = await getFreshNativeAccessToken(accessToken);
  if (!freshAccessToken) throw new Error("auth_required");

  const prefsUrl = new URL(`${supabaseUrl}/rest/v1/notification_preferences`);
  prefsUrl.searchParams.set("select", "push_enabled,pause_all");
  prefsUrl.searchParams.set("user_id", `eq.${userId}`);
  prefsUrl.searchParams.set("limit", "1");
  const prefsResponse = await fetch(prefsUrl.toString(), { headers: nativeRestHeaders(freshAccessToken) });
  const prefsRaw = await prefsResponse.text();
  const prefsParsed = prefsRaw ? JSON.parse(prefsRaw) as Array<{ push_enabled?: boolean | null; pause_all?: boolean | null }> : [];
  if (!prefsResponse.ok) throw new Error("push_preferences_load_failed");
  const prefs = Array.isArray(prefsParsed) ? prefsParsed[0] : null;
  if (prefs?.push_enabled === false || prefs?.pause_all === true) return "push_disabled";

  const permission = await requestNativeNotificationPermissionDetail();
  if (permission.state !== "granted") return "permission_denied";

  await ensureNativePushNotificationChannel();

  const projectId = readNativePushProjectId();
  if (!projectId) return "project_id_missing";
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token.data) return "token_missing";

  const deviceId = await getOrCreateRootPushDeviceId();
  await registerNativePushTokenForSession({
    accessToken: freshAccessToken,
    deviceId,
    token: token.data,
  });
  return "registered";
};

export function NativeBootBrandMedia({
  animate = true,
  mode,
  onRetry,
  onBackToLogin,
}: {
  animate?: boolean;
  mode: "loading" | "recoverable";
  onRetry?: () => void;
  onBackToLogin?: () => void;
}) {
  const { NativeBrandMedia } = require("../components/NativeBrandMedia") as typeof import("../components/NativeBrandMedia");
  return (
    <View style={styles.bootBrandScreen}>
      <View style={styles.bootBrandCenter}>
        <NativeBrandMedia disableVideo={!animate} size={BOOT_LOGO_MEDIA_SIZE} windowHeight={132} style={styles.bootLogoWindow} />
        {mode === "recoverable" ? (
          <View style={styles.bootRecoverableContent}>
            <Text style={styles.bootRecoverableCopy}>{BOOT_RECOVERABLE_COPY}</Text>
            <View style={styles.bootRecoverableActions}>
              <Pressable
                accessibilityRole="button"
                onPress={onRetry}
                style={({ pressed }) => [styles.bootRetryButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.bootRetryLabel}>Try again</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onBackToLogin}
                style={({ pressed }) => [styles.bootBackButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.bootBackLabel}>Back to login</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

type NativeNavigateOptions = {
  preserveHistory?: boolean;
  refreshOnboarding?: boolean;
};

type LoadOnboardingOptions = {
  force?: boolean;
};

const tabForPath = (path: NativeRoute): NativeBottomTab | null => {
  if (path === "/") return "home";
  if (path === "/social") return "social";
  if (path === "/chats") return "chats";
  if (path === "/service") return "service";
  if (path === "/map") return "map";
  return null;
};

const isNativeLegalPath = (path: string) =>
  path.startsWith("/privacy") ||
  path.startsWith("/privacy-choices") ||
  path.startsWith("/collection-notice") ||
  path.startsWith("/terms") ||
  path.startsWith("/community-guidelines") ||
  path.startsWith("/cookies") ||
  path.startsWith("/service-agreement") ||
  path.startsWith("/service-provider-agreement") ||
  path.startsWith("/booking-terms");

const normalizePath = (path: string): NativeRoute => {
  path = canonicalizeNativeProfilePetPath(path);
  if (path.startsWith("/signup")) return "/signup";
  if (path.startsWith("/settings/security") || path.startsWith("/security-settings") || path.startsWith("/passkey")) return "/security-settings";
  if (isNativeLegalPath(path)) return "/legal";
  if (path.startsWith("/pet-details")) return "/pet-details";
  if (path.startsWith("/edit-pet-profile") || path.startsWith("/edit-pet")) return "/edit-pet-profile";
  if (path.startsWith("/verify-identity")) return "/verify-identity";
  if (path.startsWith("/edit-profile")) return "/edit-profile";
  if (path.startsWith("/social")) return "/social";
  if (path.startsWith("/chat-dialogue")) return "/chat-dialogue";
  if (path.startsWith("/service-chat")) return "/service-chat";
  if (path.startsWith("/chats")) return "/chats";
  if (path.startsWith("/service")) return "/service";
  if (path.startsWith("/map")) return "/map";
  if (path.startsWith("/premium") || path.startsWith("/manage-subscription")) return "/premium";
  if (path.startsWith("/carerprofile") || path.startsWith("/carer-profile")) return "/carerprofile";
  if (path.startsWith("/profile") || path.startsWith("/settings")) return "/profile";
  return "/";
};

const nativePathFromInboundUrl = (url: string | null | undefined) => {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/")) return nativePathForHuddleWebPath(raw);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "huddle:") {
      const hostPath = parsed.hostname ? `/${parsed.hostname}` : "";
      const pathname = parsed.pathname || "";
      const path = `${hostPath}${pathname}` || "/";
      return nativePathForHuddleWebPath(`${path}${parsed.search || ""}`);
    }
    if (parsed.hostname === "huddle.pet" || parsed.hostname === "www.huddle.pet") {
      return nativePathForHuddleWebPath(`${parsed.pathname || "/"}${parsed.search || ""}`);
    }
  } catch {
    return null;
  }
  return null;
};

const isUnknownNativeHuddleUrl = (url: string | null | undefined) => {
  const raw = String(url || "").trim();
  if (!raw) return false;
  if (raw.startsWith("/")) return nativePathForHuddleWebPath(raw) === null;
  try {
    const parsed = new URL(raw);
    const isHuddleUrl = parsed.protocol === "huddle:" || parsed.hostname === "huddle.pet" || parsed.hostname === "www.huddle.pet";
    return isHuddleUrl && nativePathFromInboundUrl(raw) === null;
  } catch {
    return false;
  }
};

const nativePathFromNotificationResponse = (response: Notifications.NotificationResponse | null) => {
  const content = response?.notification.request.content;
  const data = content?.data as Record<string, unknown> | undefined;
  if (!content || !data) return null;
  return notificationDestinationPath({
    id: "push-response",
    title: content.title ?? null,
    body: content.body ?? null,
    type: typeof data.type === "string" ? data.type : typeof data.kind === "string" ? data.kind : null,
    href: typeof data.href === "string" ? data.href : null,
    metadata: data,
    data,
  });
};

function NativeLegalRoute({ onClose, path }: { onClose: () => void; path: string }) {
  const canonicalPath = path.startsWith("/service-agreement") ? "/service-provider-agreement" : path;
  const page = getNativeLegalPage(canonicalPath) as NativeLegalPageContent | null;

  return (
    <View style={styles.legalRoute}>
      <Pressable accessibilityLabel="Close legal page" accessibilityRole="button" hitSlop={12} onPress={onClose} style={styles.legalCloseButton}>
        <Text style={styles.legalCloseText}>×</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.legalTitle}>{page?.title || "Legal Information"}</Text>
        {page ? (
          <>
            {page.intro.map((paragraph, index) => (
              <NativeLegalText key={`intro-${index}`} style={styles.legalBody}>{paragraph}</NativeLegalText>
            ))}
            {page.sections.map((section, index) => (
              <View key={`${section.title}-${index}`} style={styles.legalSection}>
                <Text style={styles.legalSectionTitle}>{section.title}</Text>
                {section.body.map((paragraph, paragraphIndex) => (
                  <NativeLegalText key={`section-${index}-${paragraphIndex}`} style={styles.legalBody}>{paragraph}</NativeLegalText>
                ))}
                {section.bullets?.map((bullet, bulletIndex) => (
                  <View key={`section-${index}-bullet-${bulletIndex}`} style={styles.legalBulletRow}>
                    <Text style={styles.legalBulletDot}>•</Text>
                    <NativeLegalText style={styles.legalBulletText}>{bullet}</NativeLegalText>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.legalBody}>This legal page is not available in this build.</Text>
        )}
        {page?.effectiveDate ? <Text style={styles.legalMeta}>Updated: {page.effectiveDate}</Text> : null}
      </ScrollView>
    </View>
  );
}

export function RootNavigator() {
  const insets = useSafeAreaInsets();
  const bootBrandStartedAtRef = useRef(Date.now());
  const [bootBrandAnimationExpired, setBootBrandAnimationExpired] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authBootChecked, setAuthBootChecked] = useState(false);
  const [route, setRoute] = useState<NativeRoute>("/");
  const [routePath, setRoutePath] = useState("/");
  // A notification can target the exact same Map URL twice. Route text alone
  // does not re-render in that case, so carry a distinct navigation intent.
  const [mapAlertNavigationIntent, setMapAlertNavigationIntent] = useState(0);
  const [mountedMainRoutes, setMountedMainRoutes] = useState<Set<NativeMainRoute>>(() => new Set(["/"]));
  const [outNowContinueIntent, setOutNowContinueIntent] = useState(0);
  const [onboardingHeroVisible, setOnboardingHeroVisible] = useState(false);
  // Pre-auth opening film. Device-scoped, so it is checked once at boot rather
  // than waiting on a session that does not exist yet.
  // Tri-state: null means "not yet known". The film must never be decided from a
  // half-resolved boot — a signed-in returning user would otherwise glimpse it,
  // and a first-timer would glimpse the auth screen before it appeared.
  const [openingIntroDecision, setOpeningIntroDecision] = useState<boolean | null>(null);
  const openingIntroColdStartCheckedRef = useRef(false);

  useEffect(() => {
    // Wait for the session to resolve before deciding anything.
    if (!authBootChecked) return;
    // A session arriving after a slow boot must dismiss the opening immediately.
    if (session) {
      setOpeningIntroDecision(false);
      return;
    }
    // opening.mp4 is a cold-start introduction, never a sign-out transition.
    // Once this initial decision has been made, later SIGNED_OUT events go
    // directly to Auth without reading or replaying the intro.
    if (openingIntroColdStartCheckedRef.current) return;
    openingIntroColdStartCheckedRef.current = true;
    let cancelled = false;
    void hasSeenNativeOpeningIntro().then((seen) => {
      if (!cancelled) setOpeningIntroDecision(!seen);
    });
    return () => { cancelled = true; };
  }, [authBootChecked, session]);
  const [onboarding, setOnboarding] = useState<NativeOnboardingSnapshot | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [bootHomeReadySessionKey, setBootHomeReadySessionKey] = useState<string | null>(null);
  const [bootSurfacePrewarmSessionKey, setBootSurfacePrewarmSessionKey] = useState<string | null>(null);
  const [cancelSignupOpen, setCancelSignupOpen] = useState(false);
  const [cancelSignupBusy, setCancelSignupBusy] = useState(false);
  const [cancelSignupError, setCancelSignupError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsOverlay, setSettingsOverlay] = useState<NativeSettingsOverlayName | null>(null);
  const [familySettingsIntent, setFamilySettingsIntent] = useState(0);
  const [addFriendCodeIntent, setAddFriendCodeIntent] = useState<{ code: string; invite?: string; nonce: number } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [friendRequestUnread, setFriendRequestUnread] = useState(false);
  // Gold dot on Chats: a Star created a room and sent nothing, so unread_count can
  // never surface it. Cleared as soon as the person lands on Chats.
  const [newChatPending, setNewChatPending] = useState(false);
  // The top rail lives at window level so it hugs the safe area directly under
  // the Dynamic Island, sits above every screen and the header, and is not
  // unmounted by navigation.
  const [banner, setBanner] = useState<NativeBannerPayload | null>(null);
  const [windowToast, setWindowToast] = useState<NativeWindowToastPayload | null>(null);
  useEffect(() => {
    const remainingMs = Math.max(0, BOOT_SURFACE_PREWARM_MAX_MS - (Date.now() - bootBrandStartedAtRef.current));
    const timer = setTimeout(() => setBootBrandAnimationExpired(true), remainingMs);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => subscribeNativeBanner((payload) => {
    setBanner(payload);
    if (payload) setWindowToast(null);
  }), []);
  useEffect(() => subscribeNativeWindowToast((payload) => {
    setWindowToast(payload);
    if (payload) setBanner(null);
  }), []);
  // Measured from NativeGlobalHeader's actual onLayout height so screenHost's
  // offset always matches the header exactly, regardless of device safe-area inset.
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(huddleLayout.headerHeight + huddleSpacing.x6);
  const [pendingInboundDestinations, setPendingInboundDestinations] = useState<NativeInboundDestination[]>([]);
  const [coldStartInboundReady, setColdStartInboundReady] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const supportReturnSurfaceRef = useRef<"account" | "settings-drawer" | null>(null);
  const editProfileReturnToAccountWithDrawerRef = useRef(false);
  const visibleRouteBackRef = useRef<(() => void) | null>(null);
  const [recoveryPasswordPending, setRecoveryPasswordPending] = useState(false);
  const [recoveryPasswordBusy, setRecoveryPasswordBusy] = useState(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");
  const [recoveryPasswordError, setRecoveryPasswordError] = useState("");
  const [recoveryTurnstileToken, setRecoveryTurnstileToken] = useState("");
  const [recoveryTurnstileError, setRecoveryTurnstileError] = useState("");
  const [recoveryTurnstileResetKey, setRecoveryTurnstileResetKey] = useState(0);
  const [recoveryFocusedField, setRecoveryFocusedField] = useState<"password" | "confirm" | null>(null);
  const [verifyIdentityReturnToSettings, setVerifyIdentityReturnToSettings] = useState(false);
  const [profileReturnToSettings, setProfileReturnToSettings] = useState(false);
  const [signupVerifyReturnActive, setSignupVerifyReturnActive] = useState(false);
  const [oauthSignupActive, setOauthSignupActive] = useState(false);
  const [postSignupCarePending, setPostSignupCarePending] = useState<{ accessToken: string; userId: string } | null>(null);
  const [postSignupCareOpen, setPostSignupCareOpen] = useState(false);
  const lastBrowsingRouteRef = useRef<{ path: string; route: NativeRoute }>({ path: "/", route: "/" });
  // Tracks the route the user was actually on before the current one (one level of
  // history), so detail pages can return to where they came from rather than the last
  // main tab. Unlike lastBrowsingRouteRef this updates for ANY route, not just tabs.
  const previousRouteRef = useRef<{ path: string; route: NativeRoute }>({ path: "/", route: "/" });
  const currentRouteSnapshotRef = useRef<{ path: string; route: NativeRoute }>({ path: "/", route: "/" });
  const routeHistoryRef = useRef<Array<{ path: string; route: NativeRoute }>>([]);
  const legalReturnRouteRef = useRef<{ path: string; route: NativeRoute }>({ path: "/", route: "/" });
  const chatReadHintAppliedRef = useRef<Set<string>>(new Set());
  const chatUnreadVersionRef = useRef(0);
  const authRedirectInFlightRef = useRef<string | null>(null);
  const unregisteredIdentityNoticeSessionRef = useRef<string | null>(null);
  const currentSessionRef = useRef<NativeSessionIdentity | null>(null);
  const sessionGenerationRef = useRef(0);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const chatBadgeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingLoadInFlightRef = useRef<string | null>(null);
  const lastLoadedOnboardingSessionKeyRef = useRef<string | null>(null);
  const pushRegistrationSessionKeyRef = useRef<string | null>(null);
  const pendingNotificationResponsesRef = useRef<Notifications.NotificationResponse[]>([]);
  const notificationResponseHandlerRef = useRef<((response: Notifications.NotificationResponse | null) => Promise<boolean>) | null>(null);
  const notificationResponseDrainRef = useRef<(() => Promise<void>) | null>(null);
  const refreshCareMarketRef = useRef<(() => Promise<{ is_active: boolean }>) | null>(null);
  const drainingNotificationResponsesRef = useRef(false);
  const notificationCountRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const handledNotificationResponseKeysRef = useRef<Set<string>>(new Set());
  const processingNotificationResponseKeysRef = useRef<Set<string>>(new Set());
  const socialBootWarmSessionKeyRef = useRef<string | null>(null);
  const latestSessionKeyRef = useRef<string | null>(null);
  const mountedMainRoutesSessionKeyRef = useRef<string | null>(null);
  const latestRouteRef = useRef<NativeRoute>("/");
  const latestProfileExistsRef = useRef<boolean | null>(null);
  const latestOnboardingRef = useRef<NativeOnboardingSnapshot | null>(null);

  latestRouteRef.current = route;
  latestProfileExistsRef.current = onboarding?.profileExists ?? null;
  latestOnboardingRef.current = onboarding;

  useEffect(() => {
    setNativeAuthRefreshForeground(AppState.currentState === "active");
    if (AppState.currentState === "active") void purgeNativeMapPersistentCaches();
    const authRefreshSubscription = AppState.addEventListener("change", (state) => {
      setNativeAuthRefreshForeground(state === "active");
      if (state === "active") void purgeNativeMapPersistentCaches();
    });
    return () => {
      authRefreshSubscription.remove();
      setNativeAuthRefreshForeground(false);
    };
  }, []);

  useEffect(() => {
    const refreshPermissionTruth = () => {
      void Promise.allSettled([
        getNativeForegroundLocationPermissionDetail(),
        getNativeCameraPermissionDetail(),
        getNativePhotoLibraryPermissionDetail(),
        getNativeMediaLibrarySavePermissionDetail(),
        getNativeContactPermissionDetail(),
        Device.isDevice ? getNativeNotificationPermissionDetail() : Promise.resolve(),
      ]);
    };
    refreshPermissionTruth();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermissionTruth();
    });
    return () => subscription.remove();
  }, []);

  const activateSession = useCallback((nextSession: Session, phase = "session") => {
    noteNativeAuthState(nextSession);
    const nextIdentity = getNativeSessionIdentity(nextSession);
    const isNewActiveUserSession = Boolean(nextIdentity) && !isSameNativeSessionUser(currentSessionRef.current, nextIdentity);
    let nextGeneration = sessionGenerationRef.current;
    if (isNewActiveUserSession) {
      nextGeneration += 1;
      sessionGenerationRef.current = nextGeneration;
      setSessionGeneration(nextGeneration);
      routeHistoryRef.current = [];
      void clearNativeSignupDraft();
    }
    if (!isSameNativeSessionUser(currentSessionRef.current, nextIdentity)) {
      setOnboarding(null);
      setOnboardingError("");
      lastLoadedOnboardingSessionKeyRef.current = null;
    }
    currentSessionRef.current = nextIdentity;
    setSession(nextSession);
    nativeBootLog("active_session", {
      phase,
      userId: nextIdentity?.userId ?? null,
      sessionGeneration: nextGeneration,
      route: latestRouteRef.current,
      profileExists: latestProfileExistsRef.current,
    });
    if (__DEV__ && nextIdentity) {
      console.log("NATIVE_AUTH_ACTIVE_SESSION", {
        phase,
        userId: nextIdentity.userId,
        sessionGeneration: nextGeneration,
        sessionKey: createNativeSessionKey(nextIdentity.userId, nextGeneration),
        route: latestRouteRef.current,
        profileExists: latestProfileExistsRef.current,
      });
    }
  }, []);

  const clearSessionState = useCallback((reason = "clear_session", event: string | null = null) => {
    clearNativeAuthState();
    nativeBootLog("clear_session", { reason, event });
    if (__DEV__) {
      console.log("NATIVE_AUTH_CLEAR_SESSION", {
        reason,
        event,
      });
    }
    const previousUserId = currentSessionRef.current?.userId ?? null;
    currentSessionRef.current = null;
    routeHistoryRef.current = [];
    pendingNotificationResponsesRef.current = [];
    handledNotificationResponseKeysRef.current.clear();
    processingNotificationResponseKeysRef.current.clear();
    setPendingInboundDestinations([]);
    onboardingLoadInFlightRef.current = null;
    lastLoadedOnboardingSessionKeyRef.current = null;
    setSession(null);
    setOnboarding(null);
    setOnboardingError("");
    setRecoveryPasswordPending(false);
    setRecoveryNewPassword("");
    setRecoveryConfirmPassword("");
    setRecoveryPasswordError("");
    setOauthSignupActive(false);
    setPostSignupCarePending(null);
    setPostSignupCareOpen(false);
    setNotificationsOpen(false);
    setSupportOpen(false);
    setOnboardingHeroVisible(false);
    setCancelSignupOpen(false);
    void clearPendingNotificationActionResponses(previousUserId);
    void AsyncStorage.removeItem(LEGACY_PENDING_NOTIFICATION_ACTION_RESPONSES_KEY);
    void clearNativeSignupDraft();
  }, []);

  const isCurrentSession = useCallback((expected: NativeSessionIdentity | null) => {
    return isSameNativeSessionIdentity(currentSessionRef.current, expected);
  }, []);

  const loadOnboarding = useCallback(async (nextSession: Session, options?: LoadOnboardingOptions): Promise<NativeOnboardingSnapshot | null> => {
    const expected = getNativeSessionIdentity(nextSession);
    if (!expected || !isCurrentSession(expected)) return null;
    const loadKey = createNativeSessionKey(expected.userId, sessionGenerationRef.current);
    if (!options?.force && lastLoadedOnboardingSessionKeyRef.current === loadKey) return latestOnboardingRef.current;
    if (onboardingLoadInFlightRef.current === loadKey) return null;
    onboardingLoadInFlightRef.current = loadKey;
    setOnboardingLoading(true);
    if (!latestOnboardingRef.current) setOnboardingError("");
    nativeBootLog("onboarding_snapshot_start", {
      userId: expected.userId,
      force: Boolean(options?.force),
      loadKey,
    });
    try {
      let result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
      if (!isCurrentSession(expected)) return null;
      if (result.error || !result.data) {
        result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
      }
      if (!isCurrentSession(expected)) return null;
      if (result.error || !result.data) {
        await wait(BOOT_SNAPSHOT_RETRY_DELAY_MS);
        if (!isCurrentSession(expected)) return null;
        result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
      }
      if (!isCurrentSession(expected)) return null;

      if (result.error || !result.data) {
        nativeBootLog("onboarding_snapshot_failed", {
          userId: expected.userId,
          error: nativeErrorMessage(result.error),
        });
        if (__DEV__) console.warn("Native onboarding snapshot unavailable", { error: nativeErrorMessage(result.error) });
        if (!latestOnboardingRef.current) {
          setOnboardingError(BOOT_RECOVERABLE_COPY);
        }
        return null;
      }

      setOnboarding(result.data);
      lastLoadedOnboardingSessionKeyRef.current = loadKey;
      setOnboardingError("");
      nativeBootLog("onboarding_snapshot_success", {
        userId: expected.userId,
        profileExists: result.data.profileExists,
        ownsPets: result.data.ownsPets,
        activePetCount: result.data.activePetCount,
      });
      if (__DEV__) {
        console.log("NATIVE_ONBOARDING_SNAPSHOT_SUCCESS", {
          userId: expected.userId,
          profileExists: result.data.profileExists,
          ownsPets: result.data.ownsPets,
          activePetCount: result.data.activePetCount,
        });
      }
      return result.data;
    } finally {
      if (onboardingLoadInFlightRef.current === loadKey) {
        onboardingLoadInFlightRef.current = null;
      }
      if (isCurrentSession(expected)) setOnboardingLoading(false);
    }
  }, [isCurrentSession]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        nativeBootLog("auth_boot_start");
        const bootSession = await getNativeBootSession();
        const nextSession = bootSession?.session ?? null;
        nativeBootLog("auth_get_session_result", {
          hasSession: Boolean(nextSession),
          userId: nextSession?.user?.id ?? null,
        });
        if (!nextSession) {
          if (alive && !currentSessionRef.current) clearSessionState("cold_boot_no_session", "INITIAL_SESSION");
          return;
        }
        const expected = getNativeSessionIdentity(nextSession);
        if (!expected) return;
        if (currentSessionRef.current && !isSameNativeSessionIdentity(currentSessionRef.current, expected)) return;
        currentSessionRef.current = expected;
        let sessionForBoot = nextSession;
        let identityForBoot = expected;
        nativeBootLog("auth_get_user_start", { userId: identityForBoot.userId });
        const { data: userData, error } = await supabase.auth.getUser(sessionForBoot.access_token);
        if (!alive) return;
        if (!isCurrentSession(identityForBoot)) return;
        if (error) {
          nativeBootLog("auth_get_user_error", {
            userId: identityForBoot.userId,
            error: nativeErrorMessage(error),
            invalidToken: isInvalidAuthTokenError(error),
          });
          if (isInvalidAuthTokenError(error)) {
            const refreshedSession = await refreshNativeSessionOnce(sessionForBoot);
            if (!alive) return;
            if (!refreshedSession) {
              clearSessionState("get_user_refresh_failed", "INITIAL_SESSION");
              await signOutNativeAuthSession();
              return;
            }

            sessionForBoot = refreshedSession;
            const refreshedIdentity = getNativeSessionIdentity(sessionForBoot);
            if (!refreshedIdentity) {
              clearSessionState("get_user_refresh_missing_identity", "INITIAL_SESSION");
              await signOutNativeAuthSession();
              return;
            }
            identityForBoot = refreshedIdentity;
            currentSessionRef.current = identityForBoot;

            const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.getUser(sessionForBoot.access_token);
            if (!alive) return;
            if (!isCurrentSession(identityForBoot)) return;
            if (refreshedUserError || refreshedUserData.user?.id !== sessionForBoot.user.id) {
              clearSessionState("get_user_invalid_after_refresh", "INITIAL_SESSION");
              await signOutNativeAuthSession();
              return;
            }
            activateSession(sessionForBoot, "cold_boot_refreshed");
            return;
          }
          if (__DEV__) console.warn("Native auth token validation unavailable; keeping current session", { error: nativeErrorMessage(error) });
          activateSession(sessionForBoot, "cold_boot_get_user_unavailable");
          return;
        }
        if (userData.user?.id !== sessionForBoot.user.id) {
          nativeBootLog("auth_get_user_mismatch", {
            sessionUserId: sessionForBoot.user.id,
            responseUserId: userData.user?.id ?? null,
          });
          clearSessionState("get_user_mismatch", "INITIAL_SESSION");
          await signOutNativeAuthSession();
          return;
        }
        activateSession(sessionForBoot, "cold_boot");
      } catch (error) {
        nativeBootLog("auth_boot_error", { error: nativeErrorMessage(error) });
        if (__DEV__) console.warn("Native auth boot unavailable; keeping recoverable boot state", { error: nativeErrorMessage(error) });
        if (!latestOnboardingRef.current) setOnboardingError(BOOT_RECOVERABLE_COPY);
      } finally {
        nativeBootLog("auth_boot_done");
        if (alive) setAuthBootChecked(true);
      }
    })();

    const unsubscribeAuthState = subscribeNativeAuthState((event, nextSession) => {
      void (async () => {
      if (!nextSession) {
        const eventName = String(event);
        if (__DEV__) {
          console.log("NATIVE_AUTH_NULL_SESSION", {
            event: eventName,
            hadCurrentSession: Boolean(currentSessionRef.current),
          });
        }
        if (eventName === "SIGNED_OUT" || eventName === "USER_DELETED") {
          clearSessionState("auth_state_null_session", eventName);
          setRoute("/");
          setRoutePath("/");
          setSettingsOpen(false);
          setSettingsOverlay(null);
          await clearAllNativeActiveSessionActivities();
          await clearNativeActiveSessionActionAuth();
          await clearNativeMapCaches();
        }
        return;
      }
      if (latestRouteRef.current === "/signup" && String(event) === "SIGNED_IN") {
        nativeBootLog("defer_signup_auth_state", { event: String(event) });
        return;
      }
      if (currentSessionRef.current?.userId && currentSessionRef.current.userId !== nextSession.user.id) {
        await clearAllNativeActiveSessionActivities();
        await clearNativeActiveSessionActionAuth();
        await clearNativeMapCaches();
      }
      activateSession(nextSession, "auth_state_change");
      })();
    });

    return () => {
      alive = false;
      unsubscribeAuthState();
    };
  }, [activateSession, clearSessionState, isCurrentSession]);

  const handleAuthRedirectUrl = useCallback(async (url: string | null | undefined) => {
    if (!isNativeAuthRedirectUrl(url)) return;
    const rawUrl = String(url || "");
    if (authRedirectInFlightRef.current === rawUrl) return;
    authRedirectInFlightRef.current = rawUrl;
    const isRecovery = isRecoveryAuthRedirect(rawUrl);
    if (isRecovery) {
      setRecoveryPasswordPending(true);
      setRecoveryPasswordError("");
      setRecoveryNewPassword("");
      setRecoveryConfirmPassword("");
    }
    try {
      const result = await consumeNativeSupabaseAuthRedirect(rawUrl);
      if (!result.ok) {
        if (isRecovery) setRecoveryPasswordPending(false);
        if (__DEV__) console.warn("Native auth callback failed", nativeErrorMessage(result.error));
        return;
      }
      const fresh = await getFreshNativeSession();
      if (fresh?.session.user?.id) {
        activateSession(fresh.session, "auth_redirect");
        if (result.type === "recovery") {
          setRecoveryPasswordPending(true);
          return;
        }
        await loadOnboarding(fresh.session);
        const nextPath = "/";
        const expected = getNativeSessionIdentity(fresh.session);
        if (!isCurrentSession(expected)) return;
        setRoutePath(nextPath);
        setRoute(normalizePath(nextPath));
      }
    } finally {
      authRedirectInFlightRef.current = null;
    }
  }, [activateSession, isCurrentSession, loadOnboarding]);

  const enqueueInboundDestination = useCallback((path: string, source: NativeInboundDestination["source"]) => {
    setPendingInboundDestinations((queue) => enqueueNativeInboundDestination(queue, { path, source }));
  }, []);

  const openNotificationInbox = useCallback(() => {
    setSettingsOpen(false);
    setSettingsOverlay(null);
    setSupportOpen(false);
    setNotificationsOpen(true);
  }, []);

  const handleInboundUrl = useCallback((url: string | null | undefined, source: NativeInboundDestination["source"] = "live-url") => {
    if (isNativeAuthRedirectUrl(url)) {
      void handleAuthRedirectUrl(url);
      return;
    }
    const path = nativePathFromInboundUrl(url);
    if (path) {
      enqueueInboundDestination(path, source);
      return;
    }
    if (isUnknownNativeHuddleUrl(url)) {
      Alert.alert(
        "Link unavailable",
        "This Huddle link isn't supported in the app yet. You can stay here and choose where to go.",
        [{ text: "OK" }],
      );
    }
  }, [enqueueInboundDestination, handleAuthRedirectUrl]);

  useEffect(() => {
    void registerNativeNotificationActions().catch((error) => {
      if (__DEV__) console.warn("Native notification action registration failed", nativeErrorMessage(error));
    });
  }, []);

  const handleNotificationResponse = useCallback(async (response: Notifications.NotificationResponse | null) => {
    if (!response) return true;
    const responseKey = notificationActionResponseKey(response);
    if (
      !responseKey
      || handledNotificationResponseKeysRef.current.has(responseKey)
      || processingNotificationResponseKeysRef.current.has(responseKey)
    ) return true;

    const action = nativeNotificationAction(response);
    const defaultPath = nativePathFromNotificationResponse(response);
    const activeUserId = session?.user?.id ?? null;
    if (!activeUserId) {
      if (!pendingNotificationResponsesRef.current.some((pending) => notificationActionResponseKey(pending) === responseKey)) {
        pendingNotificationResponsesRef.current.push(response);
      }
      return true;
    }
    if (action === "open") {
      processingNotificationResponseKeysRef.current.add(responseKey);
      const notificationId = notificationResponseId(response);
      if (notificationId) {
        const ownership = await verifyNativeNotificationOwnershipWithToken(
          notificationId,
          activeUserId,
          session?.access_token || "",
        );
        if (currentSessionRef.current?.userId !== activeUserId) {
          processingNotificationResponseKeysRef.current.delete(responseKey);
          return true;
        }
        if (ownership === "owned" && defaultPath) {
          const responseData = response.notification.request.content.data as Record<string, unknown> | undefined;
          if (responseData?.domain === "care_market" || responseData?.kind === "market_open") {
            await refreshCareMarketRef.current?.();
          }
          enqueueInboundDestination(defaultPath, "notification");
        } else {
          openNotificationInbox();
        }
      } else {
        // Legacy pushes without a server-owned notification id must never replay
        // route labels or record ids across accounts. The generic inbox is safe.
        openNotificationInbox();
      }
      processingNotificationResponseKeysRef.current.delete(responseKey);
      handledNotificationResponseKeysRef.current.add(responseKey);
      void Notifications.clearLastNotificationResponseAsync();
      return true;
    }
    if (action === "unknown") {
      handledNotificationResponseKeysRef.current.add(responseKey);
      void Notifications.clearLastNotificationResponseAsync();
      if (__DEV__) console.warn("Ignored unknown native notification action", { identifier: response.actionIdentifier });
      return true;
    }
    processingNotificationResponseKeysRef.current.add(responseKey);
    const notificationId = notificationResponseId(response);
    if (!notificationId) {
      processingNotificationResponseKeysRef.current.delete(responseKey);
      handledNotificationResponseKeysRef.current.add(responseKey);
      if (__DEV__) console.warn("Native notification action is missing its notification id", { action });
      void Notifications.clearLastNotificationResponseAsync();
      Alert.alert(
        "Open huddle to continue",
        "This notification cannot complete the action directly. Open it to continue safely.",
        [{
          text: defaultPath ? "Open notification" : "OK",
          onPress: () => {
            openNotificationInbox();
            void notificationResponseDrainRef.current?.();
          },
        }],
        { onDismiss: () => void notificationResponseDrainRef.current?.() },
      );
      return false;
    }
    await persistPendingNotificationActionResponse(response, activeUserId).catch((error) => {
      if (__DEV__) console.warn("Native notification action persistence failed", nativeErrorMessage(error));
    });
    try {
      const { data, error } = await supabase.rpc("execute_notification_action", {
        p_notification_id: notificationId,
        p_action: action,
        p_user_text: action === "reply" ? response.userText || "" : null,
      });
      if (error) throw error;
      if (currentSessionRef.current?.userId !== activeUserId) {
        await removePendingNotificationActionResponse(responseKey, activeUserId).catch(() => undefined);
        return true;
      }

      const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
      if (result.ok === false) throw new Error("notification_action_failed");
      const resultPath = defaultPath || (typeof result.href === "string" ? result.href : null);
      if (resultPath) enqueueInboundDestination(resultPath, "notification");
      processingNotificationResponseKeysRef.current.delete(responseKey);
      handledNotificationResponseKeysRef.current.add(responseKey);
      await removePendingNotificationActionResponse(responseKey, activeUserId).catch(() => undefined);
      void notificationCountRefreshRef.current?.();
      void Notifications.clearLastNotificationResponseAsync();
      return true;
    } catch (error) {
      processingNotificationResponseKeysRef.current.delete(responseKey);
      if (currentSessionRef.current?.userId !== activeUserId) {
        await removePendingNotificationActionResponse(responseKey, activeUserId).catch(() => undefined);
        return true;
      }
      if (__DEV__) console.warn("Native notification action failed", {
        action,
        message: error instanceof Error ? error.message : String(error || "unknown"),
        notificationId,
      });
      // Clear Apple's retained response, but keep the value in this closure so
      // Retry can safely re-run the same idempotent server action.
      void Notifications.clearLastNotificationResponseAsync();
      Alert.alert("Action unavailable", nativeNotificationActionErrorCopy(error), [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            void removePendingNotificationActionResponse(responseKey, activeUserId);
            void notificationResponseDrainRef.current?.();
          },
        },
        {
          text: "Open notification",
          onPress: () => {
            void removePendingNotificationActionResponse(responseKey, activeUserId);
            openNotificationInbox();
            void notificationResponseDrainRef.current?.();
          },
        },
        {
          text: "Try again",
          onPress: () => {
            void notificationResponseHandlerRef.current?.(response).then((handled) => {
              if (handled) void notificationResponseDrainRef.current?.();
            });
          },
        },
      ], {
        cancelable: true,
        onDismiss: () => {
          void removePendingNotificationActionResponse(responseKey, activeUserId);
          void notificationResponseDrainRef.current?.();
        },
      });
      return false;
    }
  }, [enqueueInboundDestination, openNotificationInbox, session?.access_token, session?.user?.id]);

  notificationResponseHandlerRef.current = handleNotificationResponse;

  const drainPendingNotificationResponses = useCallback(async () => {
    if (!session?.user?.id || drainingNotificationResponsesRef.current) return;
    drainingNotificationResponsesRef.current = true;
    try {
      while (pendingNotificationResponsesRef.current.length > 0) {
        const response = pendingNotificationResponsesRef.current.shift() ?? null;
        const handled = await handleNotificationResponse(response);
        // Keep later actions queued while the user decides how to recover this one.
        if (!handled) break;
      }
    } finally {
      drainingNotificationResponsesRef.current = false;
    }
  }, [handleNotificationResponse, session?.user?.id]);

  notificationResponseDrainRef.current = drainPendingNotificationResponses;

  useEffect(() => {
    const activeUserId = session?.user?.id;
    if (!activeUserId) return undefined;
    let cancelled = false;
    void AsyncStorage.removeItem(LEGACY_PENDING_NOTIFICATION_ACTION_RESPONSES_KEY);
    void readPendingNotificationActionResponses(activeUserId).then((responses) => {
      if (cancelled) return;
      for (const response of responses) {
        const responseKey = notificationActionResponseKey(response);
        if (responseKey && !pendingNotificationResponsesRef.current.some((pending) => notificationActionResponseKey(pending) === responseKey)) {
          pendingNotificationResponsesRef.current.push(response);
        }
      }
      void notificationResponseDrainRef.current?.();
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    void drainPendingNotificationResponses();
  }, [drainPendingNotificationResponses, session?.user?.id]);

  useEffect(() => {
    void Linking.getInitialURL()
      .then((url) => handleInboundUrl(url, "initial-url"))
      .finally(() => setColdStartInboundReady(true));
    const subscription = Linking.addEventListener("url", (event) => {
      handleInboundUrl(event.url, "live-url");
    });
    return () => {
      subscription.remove();
    };
  }, [handleInboundUrl]);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(handleNotificationResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response);
    });
    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);

  const userId = session?.user?.id ?? null;
  const { is_active: careMarketIsActive, resolved: careMarketResolved, refresh: refreshCareMarket } = useNativeCareMarket({ accessToken: session?.access_token, userId });
  refreshCareMarketRef.current = refreshCareMarket;
  const refreshCareAfterLocationSave = useCallback(async () => {
    const wasActive = careMarketIsActive;
    const next = await refreshCareMarket();
    if (wasActive && !next.is_active) {
      showNativeWindowToast({ message: "You have changed your profile location to a new city where Care is not available yet. We’ll notify you when Care opens in your city." });
    }
  }, [careMarketIsActive, refreshCareMarket]);

  // Gold "new chat" dot. Unconditional hooks, placed after userId exists and well
  // above any early return. routePath is the raw path, set before any branching.
  useEffect(() => {
    if (!userId) { setNewChatPending(false); return; }
    let active = true;
    void readNativeNewChatSignal(userId).then((pending) => { if (active) setNewChatPending(pending); });
    return () => { active = false; };
  }, [userId, routePath]);

  useEffect(() => {
    if (!userId || !routePath.startsWith("/chats")) return;
    setNewChatPending(false);
    void clearNativeNewChatSignal(userId);
  }, [routePath, userId]);
  const sessionKey = userId ? createNativeSessionKey(userId, sessionGeneration) : null;
  latestSessionKeyRef.current = sessionKey;

  useEffect(() => {
    if (!userId || !session?.access_token || !sessionKey || bootSurfacePrewarmSessionKey !== sessionKey) return;
    let alive = true;
    let appIsActive = AppState.currentState === "active";
    let permissionGranted = false;
    let stopWatching: (() => void) | null = null;
    let processing = false;
    let queuedCoordinates: { lat: number; lng: number } | null = null;

    const processCoordinates = async (coords: { lat: number; lng: number }) => {
      queuedCoordinates = coords;
      if (processing) return;
      processing = true;
      try {
        while (alive && queuedCoordinates) {
          const next = queuedCoordinates;
          queuedCoordinates = null;
          cacheNativeLocationCoordinates(next);
          setNativeMapWarmCenter([next.lng, next.lat]);
          await Promise.allSettled([
            syncNativePrivateUserLocation(userId, next, { accessToken: session.access_token }),
            resolveNativeViewerScope({
              userId,
              accessToken: session.access_token,
              devicePoint: next,
              sessionKey,
              force: true,
            }),
          ]);
        }
      } finally {
        processing = false;
      }
    };

    const reconcileWatcher = () => {
      const shouldWatch = alive && appIsActive && permissionGranted;
      if (!shouldWatch) {
        stopWatching?.();
        stopWatching = null;
        return;
      }
      if (stopWatching) return;
      stopWatching = watchNativeLocation((coords) => {
        void processCoordinates(coords);
      }, { distanceInterval: 250 });
    };

    const unsubscribePermission = subscribeNativeLocationPermissionDetail((detail) => {
      permissionGranted = detail.state === "granted";
      reconcileWatcher();
    });
    void getNativeForegroundLocationPermissionDetail().then((detail) => {
      if (!alive) return;
      permissionGranted = detail.state === "granted";
      reconcileWatcher();
    }).catch(() => undefined);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      appIsActive = state === "active";
      reconcileWatcher();
    });

    return () => {
      alive = false;
      queuedCoordinates = null;
      stopWatching?.();
      unsubscribePermission();
      appStateSubscription.remove();
    };
  }, [bootSurfacePrewarmSessionKey, session?.access_token, sessionKey, userId]);

  useEffect(() => {
    if (!sessionKey) {
      mountedMainRoutesSessionKeyRef.current = null;
      setMountedMainRoutes(new Set(["/"]));
      return;
    }
    if (mountedMainRoutesSessionKeyRef.current !== sessionKey) {
      mountedMainRoutesSessionKeyRef.current = sessionKey;
      setMountedMainRoutes(new Set(isNativeMainRoute(route) ? [route] : ["/"]));
      return;
    }
    if (!isNativeMainRoute(route)) return;
    setMountedMainRoutes((current) => {
      if (current.has(route)) return current;
      const next = new Set(current);
      next.add(route);
      return next;
    });
  }, [route, sessionKey]);

  useEffect(() => {
    if (!userId || !session?.access_token || !sessionKey) return;
    // Push token maintenance is important but not first paint. Starting its
    // preferences request alongside Home made it compete for the same cold
    // network window on physical devices.
    if (bootSurfacePrewarmSessionKey !== sessionKey) return;
    if (pushRegistrationSessionKeyRef.current === sessionKey) return;
    pushRegistrationSessionKeyRef.current = sessionKey;
    void registerNativePushForSession(userId, session.access_token).catch((error) => {
      pushRegistrationSessionKeyRef.current = null;
      if (__DEV__) {
        if (__DEV__) console.warn("NATIVE_PUSH_REGISTRATION_FAILED", {
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    });
  }, [bootSurfacePrewarmSessionKey, session?.access_token, sessionKey, userId]);

  useEffect(() => {
    if (session && userId && sessionKey) return;
    setBootHomeReadySessionKey(null);
    setBootSurfacePrewarmSessionKey(null);
  }, [session, sessionKey, userId]);

  useEffect(() => {
    if (!userId || !session?.access_token || !sessionKey) return;
    void hydrateNativeActiveSessions({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      sessionKey,
      userId,
    }).catch((error) => {
      if (__DEV__) console.warn("NATIVE_ACTIVE_SESSION_HYDRATION_FAILED", {
        message: error instanceof Error ? error.message : String(error || "unknown"),
        sessionKey,
      });
    });
  }, [session?.access_token, session?.refresh_token, sessionKey, userId]);

  const refreshNotificationCount = useCallback(async (options?: { force?: boolean }) => {
    if (!userId || !session?.access_token) {
      setNotificationCount(0);
      return;
    }
    const requestSessionKey = sessionKey;
    const cachedCount = requestSessionKey ? await readCachedNativeUnreadNotificationCount(userId, { sessionKey: requestSessionKey }) : null;
    if (cachedCount !== null && sessionKey === requestSessionKey) setNotificationCount(cachedCount);
    try {
      const fetchCount = () => fetchNativeUnreadNotificationCountWithToken(userId, session.access_token, {
          sessionKey: requestSessionKey,
          cacheWriteGuard: () => sessionKey === requestSessionKey,
          onFriendRequestUnreadChange: (unread) => {
            if (sessionKey === requestSessionKey) setFriendRequestUnread(unread);
          },
        });
      const result = requestSessionKey && options?.force === false
        ? await freshnessRegistry.runOnce(requestSessionKey, "notification_unread", fetchCount)
        : null;
      // runOnce intentionally returns no value when this surface already
      // refreshed. In that case the cache written by that canonical refresh is
      // the truth; do not turn a dedupe decision into a second network read.
      const count = result?.value ?? cachedCount ?? await fetchCount();
      if (requestSessionKey) freshnessRegistry.markRefreshed(requestSessionKey, "notification_unread");
      if (sessionKey === requestSessionKey) setNotificationCount(count);
    } catch {
      // Notification badges must not block navigation.
    }
  }, [onboarding?.onboardingCompleted, session?.access_token, sessionKey, userId]);

  notificationCountRefreshRef.current = refreshNotificationCount;

  const refreshChatUnreadCount = useCallback(async (options?: { force?: boolean }) => {
    if (!userId || !session?.access_token) {
      setChatUnreadCount(0);
      return;
    }
    const requestSessionKey = sessionKey;
    const requestUnreadVersion = chatUnreadVersionRef.current;
    try {
      const fetchCount = () => fetchNativeChatUnreadTotal(userId, {
          accessToken: session.access_token,
          sessionKey: requestSessionKey,
          force: options?.force !== false,
          cacheWriteGuard: () => sessionKey === requestSessionKey,
        });
      const result = requestSessionKey && options?.force === false
        ? await freshnessRegistry.runOnce(requestSessionKey, "chat_unread", fetchCount)
        : null;
      const count = result?.value ?? await fetchCount();
      if (requestSessionKey) freshnessRegistry.markRefreshed(requestSessionKey, "chat_unread");
      if (sessionKey === requestSessionKey && chatUnreadVersionRef.current === requestUnreadVersion) setChatUnreadCount(count);
    } catch {
      // Chat badges must not block navigation.
    }
  }, [session?.access_token, sessionKey, userId]);

  useEffect(() => {
    void refreshNotificationCount({ force: false });
    // Boot mount: share the dedicated unread RPC's short cache / in-flight with
    // the chats preload + Home sweep instead of forcing a duplicate scan.
    void refreshChatUnreadCount({ force: false });
  }, [refreshChatUnreadCount, refreshNotificationCount]);

  useEffect(() => {
    // Do not spend signed-in surface work while signup/onboarding is still in
    // progress. Completion is the exact handoff: brand transition starts,
    // Home warms underneath it, then the app is revealed.
    if (!userId || !session?.access_token || !sessionKey || onboarding?.onboardingCompleted !== true) return;
    if (socialBootWarmSessionKeyRef.current === sessionKey) return;
    socialBootWarmSessionKeyRef.current = sessionKey;
    // App-open signal for the review-prompt activation gate (sessions + distinct days).
    void recordAppReviewSession(userId);
    const requestSessionKey = sessionKey;
    const requestAccessToken = session.access_token;
    const warmStartedAt = Date.now();
    let active = true;
    let homeBrandReleased = false;
    let bootGateReleased = false;
    const releaseHomeBrand = (reason: "complete" | "deadline") => {
      if (homeBrandReleased) return;
      homeBrandReleased = true;
      nativeBootLog("home_brand_release", {
        elapsedMs: Date.now() - warmStartedAt,
        reason,
        sessionKey: requestSessionKey,
      });
      if (latestSessionKeyRef.current === requestSessionKey) setBootHomeReadySessionKey(requestSessionKey);
    };
    const releaseBootGate = (reason: "complete" | "deadline") => {
      if (bootGateReleased) return;
      bootGateReleased = true;
      // The full prewarm deadline is also the absolute escape hatch for the
      // visible brand transition. It can never remain above the app forever.
      releaseHomeBrand(reason);
      nativeBootLog("surface_prewarm_gate_release", {
        elapsedMs: Date.now() - warmStartedAt,
        reason,
        sessionKey: requestSessionKey,
      });
      if (latestSessionKeyRef.current === requestSessionKey) setBootSurfacePrewarmSessionKey(requestSessionKey);
    };
    // This deadline starts at the authenticated handoff, not at process launch.
    // A signed-out user may spend longer than four seconds in opening.mp4, Auth
    // or signup; deducting that time would release this transition immediately
    // and recreate the white frame we are explicitly covering.
    const bootGateTimer = setTimeout(() => releaseBootGate("deadline"), BOOT_SURFACE_PREWARM_MAX_MS);

    void (async () => {
      const cacheWriteGuard = () => active && latestSessionKeyRef.current === requestSessionKey;
      const runSurface = async <T,>(surface: RefreshSurface, task: () => Promise<T>): Promise<T | undefined> => {
        const result = await freshnessRegistry.runOnce(requestSessionKey, surface, async () => {
          if (!cacheWriteGuard()) throw new Error("stale_boot_session");
          const value = await task();
          if (!cacheWriteGuard()) throw new Error("stale_boot_session");
          return value;
        });
        return result.value;
      };
      nativeBootLog("surface_prewarm_start", { sessionKey: requestSessionKey });

      // Home owns the first network window. Each request is also registered as
      // the session's canonical refresh so Home's mount-time sweep joins/skips it.
      const profileWarm = runSurface("profile_summary", () => fetchNativeProfileSummary(userId, {
        accessToken: requestAccessToken,
        force: true,
        sessionKey: requestSessionKey,
        cacheWriteGuard,
      })).catch(() => undefined);
      const petsWarm = runSurface("active_pets", () => preloadNativeHomePets(userId, {
        accessToken: requestAccessToken,
        force: true,
        sessionKey: requestSessionKey,
        cacheWriteGuard,
      })).catch(() => undefined);
      const nearbyWarm = runSurface("nearby_out_snapshot", async () => {
        const payload = await preloadNativeHomeNearbyPeople({
          userId,
          accessToken: requestAccessToken,
          sessionKey: requestSessionKey,
        });
        if (!payload) throw new Error("nearby_out_snapshot_unavailable");
        return payload;
      }).catch(() => undefined);
      const scopeWarm = runSurface("viewer_location_scope", async () => {
        const cached = await readCachedNativeViewerScope(userId, { sessionKey: requestSessionKey }).catch(() => null);
        if (cached) {
          if (cached.primaryPoint) setNativeMapWarmCenter([cached.primaryPoint.lng, cached.primaryPoint.lat]);
          return cached;
        }
        // One canonical location read owns both Home and Map startup. The old
        // standalone map warmer raced this path, causing two permission reads,
        // GPS lookups and viewer-scope RPCs on the same launch.
        const permission = await getNativeForegroundLocationPermissionDetail().catch(() => ({ canAskAgain: true, state: "unknown" as const }));
        const coords = permission.state === "granted"
          ? await getNativeCurrentCoordinates({ accuracy: "balanced" }).catch(() => null)
          : null;
        if (coords) setNativeMapWarmCenter([coords.lng, coords.lat]);
        return resolveNativeViewerScope({
          userId,
          accessToken: requestAccessToken,
          devicePoint: coords,
          sessionKey: requestSessionKey,
          force: true,
        });
      }).catch(() => undefined);

      const homeCommunityWarm = (async () => {
        await Promise.allSettled([profileWarm, scopeWarm]);
        if (!cacheWriteGuard()) return;
        const [profileSnapshot, resolvedScope] = await Promise.all([
          readCachedNativeProfileSummary(userId, { sessionKey: requestSessionKey }).catch(() => null),
          readCachedNativeViewerScope(userId, { sessionKey: requestSessionKey }).catch(() => null),
        ]);
        const effectiveTier = profileSnapshot?.profile?.effective_tier ?? profileSnapshot?.profile?.tier ?? null;
        if (!effectiveTier || !cacheWriteGuard()) return;
        const loaded = await runSurface("discover_cards", () => preloadNativeHomeCommunityBundle({
          userId,
          accessToken: requestAccessToken,
          effectiveTier,
          sessionKey: requestSessionKey,
          cacheWriteGuard,
          includeDiscover: isNativeProfileAtLeastAge(profileSnapshot?.profile?.dob, 16) !== false,
          viewerScope: resolvedScope ?? null,
        }));
        if (loaded) freshnessRegistry.markRefreshed(requestSessionKey, "groups_invites");
      })().catch(() => undefined);

      const homeFirstPaintWarm = Promise.allSettled([profileWarm, petsWarm, nearbyWarm, scopeWarm, homeCommunityWarm]);
      // Home and the persistent route shell are already mounted underneath the
      // brand surface. Reveal them as soon as Home's critical first-paint work
      // settles; Social, Chats, Map and Care continue warming independently.
      void homeFirstPaintWarm.then(() => releaseHomeBrand("complete"));

      // Keep Home first without starving an immediate tap into another tab.
      // Secondary warming begins when Home is ready or after this short priority
      // window, whichever comes first, and continues after the four-second gate.
      await Promise.race([homeFirstPaintWarm, wait(BOOT_HOME_PRIORITY_WINDOW_MS)]);
      if (!cacheWriteGuard()) return;
      // Secondary warming is intentionally staged. Hidden tabs must not create
      // a burst of unrelated requests while the visible Home route is still
      // settling on a cold connection.
      const immediatelyWarmable = (async () => {
        await Promise.allSettled([
          preloadNativeStoreProducts(),
          // Chats: preload friends, groups, and service/care conversation mirrors.
          runSurface("chat_inbox_summary", () => preloadNativeChatsInboxOnAppStart({
            accessToken: requestAccessToken,
            sessionKey: requestSessionKey,
            userId,
            cacheWriteGuard,
          })),
        ]);
        if (!cacheWriteGuard()) return;
        await runSurface("matched_rail_summary", () => fetchNativeMatchedRailSummary({ accessToken: requestAccessToken, userId })).catch(() => undefined);
      })();

      const scopeDependentWarm = (async () => {
        await immediatelyWarmable;
        await Promise.allSettled([profileWarm, scopeWarm]);
        if (!cacheWriteGuard()) return;
        const [cachedProfileSnapshot, resolvedScope] = await Promise.all([
          readCachedNativeProfileSummary(userId, { sessionKey: requestSessionKey }).catch(() => null),
          readCachedNativeViewerScope(userId, { sessionKey: requestSessionKey }).catch(() => null),
        ]);
        const cachedProfile = cachedProfileSnapshot?.profile ?? null;
        await Promise.allSettled([
          runSurface("social_first_page_shell", () => warmNativeSocialFirstPageCache({
            accessToken: requestAccessToken,
            sessionKey: requestSessionKey,
            userId,
            viewerScope: resolvedScope ?? null,
          })),
        // Map: prefetch GPS (only when permission is already granted, so we never
        // prompt at boot) then warm the pin shell at the resolved center, matching
        // the map's cold-start center priority (GPS -> stored pin -> profile city).
          runSurface("map_shell", async () => {
            let mapCenter: [number, number] | null = resolvedScope?.primaryPoint
              ? [resolvedScope.primaryPoint.lng, resolvedScope.primaryPoint.lat]
              : null;
            if (!mapCenter && typeof cachedProfile?.last_lat === "number" && typeof cachedProfile?.last_lng === "number") {
              mapCenter = [cachedProfile.last_lng, cachedProfile.last_lat];
            }
            if (!mapCenter && typeof cachedProfile?.latitude === "number" && typeof cachedProfile?.longitude === "number") {
              mapCenter = [cachedProfile.longitude, cachedProfile.latitude];
            }
            if (!mapCenter || !cacheWriteGuard()) return [];
            // Seed the session warm center so the map's first paint lands on the user
            // instead of the hardcoded default, even before the screen resolves GPS itself.
            setNativeMapWarmCenter(mapCenter);
            return Promise.all([
              fetchVisibleMapPinShells(mapCenter, 5000, {
                accessToken: requestAccessToken,
                viewerId: userId,
                sessionKey: requestSessionKey,
                cacheWriteGuard,
              }).catch(() => undefined),
              fetchNativeMapPeopleV2(mapCenter, 5000, {
                accessToken: requestAccessToken,
                viewerId: userId,
                sessionKey: requestSessionKey,
                cacheWriteGuard,
              }).catch(() => undefined),
            ]);
          }),
        // Care List: warm the service-providers list at the viewer's anchor so the Care
        // tab paints from cache instead of cold-loading. Mirrors NativeServiceScreen's
        // careViewerScope derivation so the cache key matches what the screen reads.
        ]);
        if (!cacheWriteGuard()) return;
        await runSurface("service_cards", async () => {
            if (!resolvedScope || !cacheWriteGuard()) return;
            const viewerCountry = resolvedScope.countryName || resolvedScope.country || resolvedScope.profileCountryName || resolvedScope.profileCountry || null;
            const accountAnchor = resolvedScope.primaryPoint ?? resolvedScope.profilePoint ?? null;
            const careViewerScope = {
              ...resolvedScope,
              city: resolvedScope.city ?? resolvedScope.profileLocationName ?? null,
              country: viewerCountry,
              countryCode: resolvedScope.countryCode ?? resolvedScope.profileCountryCode ?? null,
              countryName: viewerCountry,
              district: resolvedScope.district ?? resolvedScope.profileDistrict ?? null,
              primaryPoint: accountAnchor,
            };
            await fetchNativeServiceProviders({
              userId,
              accessToken: requestAccessToken,
              sessionKey: requestSessionKey,
              anchor: careViewerScope.primaryPoint ?? null,
              viewerCountry,
              viewerScope: careViewerScope,
              cacheWriteGuard,
            });
          }).catch(() => undefined);
      })();
      await Promise.allSettled([homeFirstPaintWarm, scopeDependentWarm]);
    })().catch(() => {
      if (socialBootWarmSessionKeyRef.current === requestSessionKey) socialBootWarmSessionKeyRef.current = null;
    }).finally(() => {
      clearTimeout(bootGateTimer);
      nativeBootLog("surface_prewarm_done", {
        elapsedMs: Date.now() - warmStartedAt,
        sessionKey: requestSessionKey,
      });
      releaseBootGate("complete");
    });

    return () => {
      active = false;
      clearTimeout(bootGateTimer);
    };
  }, [onboarding?.onboardingCompleted, session?.access_token, sessionKey, userId]);

  useEffect(() => {
    if (!userId || !session?.access_token) return;
    let cancelPrewarm: (() => void) | null = null;
    const timer = setTimeout(() => {
      cancelPrewarm = prewarmNativeMainTabRoutes();
    }, 300);
    return () => {
      clearTimeout(timer);
      cancelPrewarm?.();
    };
  }, [session?.access_token, userId]);

  useEffect(() => {
    chatReadHintAppliedRef.current.clear();
  }, [routePath]);

  // Keep a one-level route history so detail screens can return to the actual page the
  // user came from (e.g. /edit-profile opened from /profile returns to /profile, not Home).
  useEffect(() => {
    if (currentRouteSnapshotRef.current.path === routePath) return;
    previousRouteRef.current = currentRouteSnapshotRef.current;
    currentRouteSnapshotRef.current = { path: routePath, route };
  }, [route, routePath]);

  useEffect(() => {
    if (!userId) return;
    const channelName = `native-notifications-${userId}`;
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { void refreshNotificationCount(); },
      ));
    return () => { void handle.dispose(); };
  }, [refreshNotificationCount, userId]);

  useEffect(() => {
    if (!userId || !session?.access_token) return;
    const refresh = () => {
      if (profileRefreshTimerRef.current) clearTimeout(profileRefreshTimerRef.current);
      const requestSessionKey = sessionKey;
      const requestAccessToken = session.access_token;
      profileRefreshTimerRef.current = setTimeout(() => {
        profileRefreshTimerRef.current = null;
        void fetchNativeProfileSummary(userId, {
          accessToken: requestAccessToken,
          force: true,
          sessionKey: requestSessionKey,
          cacheWriteGuard: () => sessionKey === requestSessionKey,
        }).catch(() => undefined);
      }, 450);
    };
    const channelName = `native-profile-summary-${userId}`;
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        refresh,
      ));
    return () => {
      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
        profileRefreshTimerRef.current = null;
      }
      void handle.dispose();
    };
  }, [session?.access_token, sessionKey, userId]);

  useEffect(() => {
    if (!userId) return;
    const channelName = `native-chat-badges-${userId}`;
    const refresh = () => {
      if (chatBadgeRefreshTimerRef.current) clearTimeout(chatBadgeRefreshTimerRef.current);
      chatBadgeRefreshTimerRef.current = setTimeout(() => {
        chatBadgeRefreshTimerRef.current = null;
        void refreshChatUnreadCount();
        void refreshNotificationCount();
      }, 450);
    };
    const handle = createSinglePrivateBroadcastChannel(
      channelName,
      `user:${userId}:inbox`,
      refresh,
      (status) => {
        if (status === "SUBSCRIBED") refresh();
      },
    );
    const filteredHandle = createSingleRealtimeChannel(
      `${channelName}:filtered`,
      (channel) => channel
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_chat_invites", filter: `invitee_user_id=eq.${userId}` }, refresh),
    );
    return () => {
      if (chatBadgeRefreshTimerRef.current) {
        clearTimeout(chatBadgeRefreshTimerRef.current);
        chatBadgeRefreshTimerRef.current = null;
      }
      void handle.dispose();
      void filteredHandle.dispose();
    };
  }, [refreshChatUnreadCount, refreshNotificationCount, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotificationCount();
      if (state === "active") void refreshChatUnreadCount();
      if (state === "active" && userId && session?.access_token && sessionKey) {
        void hydrateNativeActiveSessions({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          sessionKey,
          userId,
        }).catch((error) => {
          if (__DEV__) console.warn("NATIVE_ACTIVE_SESSION_HYDRATION_RESUME_FAILED", {
            message: error instanceof Error ? error.message : String(error || "unknown"),
            sessionKey,
          });
        });
      }
    });
    return () => subscription.remove();
  }, [refreshChatUnreadCount, refreshNotificationCount, session?.access_token, session?.refresh_token, sessionKey, userId]);

  // One-shot welcome hero: keep it armed even if signup completed into Verify Identity
  // and the user force-quits before Home renders.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void isNativeOnboardingHeroPending(userId, session?.access_token, onboarding?.signupWelcomePending).then((pending) => {
      if (active && pending) setOnboardingHeroVisible(true);
    });
    return () => { active = false; };
  }, [onboarding?.signupWelcomePending, session?.access_token, sessionKey, userId]);

  useEffect(() => {
    if (!userId || !session) {
      setOnboarding(null);
      setOnboardingLoading(false);
      setOnboardingError("");
      return;
    }
    if (onboarding || onboardingLoading || onboardingError) return;
    void loadOnboarding(session);
  }, [loadOnboarding, onboarding, onboardingError, onboardingLoading, session, userId]);

  const applyNavigationOverlayState = useCallback((intent: Parameters<typeof nativeNavigationOverlayStateFor>[0]) => {
    const next = nativeNavigationOverlayStateFor(intent);
    setSettingsOpen(next.settingsOpen);
    setSettingsOverlay(next.settingsOverlay);
    setNotificationsOpen(next.notificationsOpen);
    setSupportOpen(next.supportOpen);
  }, []);

  const closeSupport = useCallback(() => {
    setSupportOpen(false);
    const returnSurface = supportReturnSurfaceRef.current;
    supportReturnSurfaceRef.current = null;
    if (returnSurface === "account") applyNavigationOverlayState("account");
    if (returnSurface === "settings-drawer") applyNavigationOverlayState("settings-drawer");
  }, [applyNavigationOverlayState]);

  const openSupport = useCallback(() => {
    supportReturnSurfaceRef.current = settingsOverlay === "account"
      ? "account"
      : settingsOpen
        ? "settings-drawer"
        : null;
    applyNavigationOverlayState("support");
  }, [applyNavigationOverlayState, settingsOpen, settingsOverlay]);

  const restorePreviousRoute = useCallback(() => {
    const { target, previous } = restoreNativeRouteHistory(routeHistoryRef.current, { path: "/", route: "/" as NativeRoute });
    previousRouteRef.current = previous;
    currentRouteSnapshotRef.current = target;
    setRoutePath(target.path);
    setRoute(target.route);
    return target;
  }, []);

  const replaceCurrentRoute = useCallback((path: string) => {
    const transition = replaceNativeRouteHistory(routeHistoryRef.current, currentRouteSnapshotRef.current, path, normalizePath);
    previousRouteRef.current = transition.previous;
    currentRouteSnapshotRef.current = transition.current;
    setRoutePath(transition.current.path);
    setRoute(transition.current.route);
    return transition.current;
  }, []);

  const onNavigate = useCallback((path: string, options?: NativeNavigateOptions) => {
    if (path.startsWith("/active-session/returned")) {
      replaceCurrentRoute("/");
      void (async () => {
        const freshAccessToken = await getFreshNativeAccessToken(session?.access_token || null);
        if (!freshAccessToken) return;
        const returned = await returnNativeUserOutNow({ accessToken: freshAccessToken });
        await endHomePresenceActivity({ finalMessage: returned.finalMessage });
      })();
      return;
    }
    if (path.startsWith("/active-session/continue")) {
      // Persist the renewal request before Home mounts. The old order mounted
      // Home first, allowing its one-shot reader to miss the write entirely.
      void (async () => {
        await AsyncStorage.setItem(OUT_NOW_CONTINUE_REQUEST_KEY, "1");
        setOutNowContinueIntent((current) => current + 1);
        replaceCurrentRoute("/");
      })();
      return;
    }
    if (path.startsWith("/add-friend")) {
      const params = (() => {
        try {
          return new URL(`huddle://local${path}`).searchParams;
        } catch {
          return null;
        }
      })();
      const code = String(params?.get("code") || "").replace(/\D/g, "").slice(0, 6);
      const rawInvite = String(params?.get("invite") || "").trim().toLowerCase();
      const invite = /^[0-9a-f]{64}$/.test(rawInvite) ? rawInvite : "";
      applyNavigationOverlayState("settings-drawer");
      if (code || invite) setAddFriendCodeIntent({ code, invite, nonce: Date.now() });
      return;
    }
    if (path.startsWith("/settings") && path.includes("family=1")) {
      applyNavigationOverlayState("settings-drawer");
      setFamilySettingsIntent((current) => current + 1);
      return;
    }
    if (path.startsWith("/notifications")) {
      applyNavigationOverlayState("notifications");
      return;
    }
    if (path.startsWith("/support")) {
      openSupport();
      return;
    }

    // A real destination must never remain hidden under stale navigation chrome.
    setProfileReturnToSettings(path.startsWith("/profile") && settingsOpen);
    applyNavigationOverlayState("destination");
    const fromSettings = path.startsWith("/verify-identity") && path.includes("from=settings");
    setVerifyIdentityReturnToSettings(fromSettings);

    const transition = nativeRouteTransition({ path: routePath, route }, path, normalizePath);
    const nextRoute = transition.current.route;
    if (nextRoute === "/map" && /(?:^|[?&])(alert|thread)=/.test(path)) {
      setMapAlertNavigationIntent((current) => current + 1);
    }
    recordNativeRouteHistory(routeHistoryRef.current, transition.previous, transition.current, options);
    previousRouteRef.current = transition.previous;
    currentRouteSnapshotRef.current = transition.current;
    if (nextRoute === "/legal" && route !== "/legal") {
      legalReturnRouteRef.current = { path: routePath, route };
    }
    if (nextRoute !== "/verify-identity" && nextRoute !== "/signup") {
      setSignupVerifyReturnActive(false);
    }
    if (nextRoute === "/" || nextRoute === "/social" || nextRoute === "/chats" || nextRoute === "/service" || nextRoute === "/map") {
      lastBrowsingRouteRef.current = { path, route: nextRoute };
    }
    setRoutePath(path);
    setRoute(nextRoute);
    if (userId) {
      const usageSurface: NativeUsageSurface | null =
        nextRoute === "/social" ? "social" :
          nextRoute === "/service" ? "service" :
            nextRoute === "/chats" ? "chats" :
              nextRoute === "/map" ? "map" : null;
      if (usageSurface) {
        requestAnimationFrame(() => {
          void recordNativeSurfaceVisit(userId, usageSurface);
        });
      }
    }
    if (userId && options?.refreshOnboarding === true) {
      if (session) void loadOnboarding(session, { force: true });
    }
  }, [applyNavigationOverlayState, loadOnboarding, openSupport, replaceCurrentRoute, route, routePath, session, settingsOpen, userId]);

  useEffect(() => {
    if (!coldStartInboundReady || pendingInboundDestinations.length === 0) return;
    const { destination } = consumeNativeInboundDestination(pendingInboundDestinations);
    if (!destination) return;
    const path = destination.path;
    if (!session && parseNativeSignupVerifyUrl(path)) {
      setPendingInboundDestinations((queue) => removeNativeInboundDestination(queue, destination));
      setRoutePath(path);
      setRoute("/signup");
      return;
    }
    if (!session && isNativeLegalPath(path)) {
      setPendingInboundDestinations((queue) => removeNativeInboundDestination(queue, destination));
      setRoutePath(path);
      setRoute("/legal");
      return;
    }
    if (!session) return;
    // A session exists the moment auth succeeds, which is BEFORE pet/profile
    // onboarding finishes. Dispatching an add-friend link here would yank a brand
    // new signup out of setup, so it stays queued until onboarding completes.
    if (path.startsWith("/add-friend") && onboarding?.onboardingCompleted !== true) return;
    setPendingInboundDestinations((queue) => removeNativeInboundDestination(queue, destination));
    onNavigate(path);
  }, [coldStartInboundReady, onboarding?.onboardingCompleted, onNavigate, pendingInboundDestinations, session]);

  const dismissRecoveryPassword = useCallback(async () => {
    if (recoveryPasswordBusy) return;
    setRecoveryPasswordBusy(true);
    try {
      const next = await completeNativeRecoveryDismissal(() => signOutNativeAuthSession({ scope: "local" }));
      setRecoveryPasswordPending(next.recoveryPasswordPending);
      setRecoveryPasswordError("");
      setRecoveryNewPassword("");
      setRecoveryConfirmPassword("");
      setRecoveryFocusedField(null);
    } catch (error) {
      setRecoveryPasswordError(nativeSafeErrorCopy(error, "We couldn't cancel password reset just yet. Please try again."));
    } finally {
      setRecoveryPasswordBusy(false);
    }
  }, [recoveryPasswordBusy]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (recoveryPasswordPending) {
        void dismissRecoveryPassword();
        return true;
      }
      if (supportOpen) {
        closeSupport();
        return true;
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        return true;
      }
      if (settingsOverlay) {
        if (settingsOverlay === "account") {
          applyNavigationOverlayState("settings-drawer");
        } else {
          setSettingsOverlay(null);
        }
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      // NativeSignupScreen owns its visible internal step stack. Returning false
      // lets that later-mounted handler run instead of leaving the whole flow.
      if (route === "/signup") return false;
      if (visibleRouteBackRef.current) {
        visibleRouteBackRef.current();
        return true;
      }
      const target = nativeHardwareBackTarget(route, routePath);
      if (!target) return false;
      if (target === "history") {
        restorePreviousRoute();
      } else {
        onNavigate(target);
      }
      return true;
    });
    return () => subscription.remove();
  }, [applyNavigationOverlayState, closeSupport, dismissRecoveryPassword, notificationsOpen, onNavigate, recoveryPasswordPending, restorePreviousRoute, route, routePath, settingsOpen, settingsOverlay, supportOpen]);

  const handleSettingsDrawerNavigate = useCallback((path: string) => {
    const resolution = resolveNativeSettingsDrawerNavigation(path);
    if (resolution.closeSettings) setSettingsOpen(false);
    if (resolution.overlay) {
      applyNavigationOverlayState(resolution.overlay === "account" ? "account" : "destination");
      return;
    }
    if (resolution.path) onNavigate(resolution.path);
  }, [applyNavigationOverlayState, onNavigate]);

  const handleSettingsOverlayNavigate = useCallback((path: string) => {
    editProfileReturnToAccountWithDrawerRef.current = path.startsWith("/edit-profile?focus=identity");
    setSettingsOverlay(null);
    onNavigate(path);
  }, [onNavigate]);

  // SO6: scroll-to-top callback exposed by NativeSocialScreen; called when Social tab is re-pressed
  const socialScrollTopRef = useRef<(() => void) | null>(null);
  const handleTabReselect = useCallback((tab: NativeBottomTab) => {
    if (tab === "social") socialScrollTopRef.current?.();
  }, []);

  const confirmNoProfileBeforeCancelSignup = useCallback(async () => {
    if (!session) return false;
    const expected = getNativeSessionIdentity(session);
    if (!expected || !isCurrentSession(expected)) return false;
    const result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
    if (!isCurrentSession(expected)) return false;

    if (result.data) {
      setOnboarding(result.data);
      lastLoadedOnboardingSessionKeyRef.current = createNativeSessionKey(expected.userId, sessionGenerationRef.current);
      setOnboardingError("");
      return result.data.registeredIdentity === false;
    }

    if (__DEV__) console.warn("Native onboarding cancel recheck unavailable", { error: nativeErrorMessage(result.error) });
    if (!latestOnboardingRef.current) setOnboardingError(BOOT_RECOVERABLE_COPY);
    return false;
  }, [isCurrentSession, session]);

  const confirmCancelSignup = useCallback(async () => {
    if (cancelSignupBusy) return;
    setCancelSignupError("");
    const freshAccessToken = await getFreshNativeAccessToken(session?.access_token);
    if (!freshAccessToken) {
      setCancelSignupError("We couldn't find an active session. Please sign in again before cancelling signup.");
      return;
    }
    setCancelSignupBusy(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        headers: await createFreshNativeFunctionHeaders(freshAccessToken, { functionName: "delete-account", routeToken: session?.access_token }),
        body: { action: "confirm_delete" },
      });
      if (error) throw error;
      setCancelSignupOpen(false);
      await signOutNativeAuthSession({ scope: "local" });
    } catch (error) {
      setCancelSignupError(nativeSafeErrorCopy(error, "We couldn't cancel signup right now. Please try again."));
    } finally {
      setCancelSignupBusy(false);
    }
  }, [cancelSignupBusy, session?.access_token]);

  const submitRecoveryPassword = useCallback(async () => {
    setRecoveryPasswordError("");
    const password = recoveryNewPassword;
    const confirmPassword = recoveryConfirmPassword;
    if (!password || !confirmPassword) {
      setRecoveryPasswordError("Don't forget this bit.");
      return;
    }
    const policyError = nativePasswordPolicyError(password);
    if (policyError) {
      setRecoveryPasswordError(policyError);
      return;
    }
    if (password !== confirmPassword) {
      setRecoveryPasswordError("Passwords do not match.");
      return;
    }
    if (!recoveryTurnstileToken.trim()) {
      setRecoveryTurnstileError("Complete human verification first.");
      return;
    }
    const freshAccessToken = await getFreshNativeAccessToken(session?.access_token);
    if (!freshAccessToken) {
      setRecoveryPasswordError("We can't find your active reset session. Please request a fresh reset link.");
      return;
    }

    setRecoveryPasswordBusy(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-change-password`, {
        method: "POST",
        headers: await createFreshNativeFunctionHeaders(freshAccessToken, { functionName: "auth-change-password", routeToken: session?.access_token }),
        body: JSON.stringify({
          password,
          turnstile_token: recoveryTurnstileToken.trim(),
          turnstile_action: "change_password",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || body?.message || "password_change_failed");
      }
      setRecoveryPasswordPending(false);
      setRecoveryNewPassword("");
      setRecoveryConfirmPassword("");
      setRecoveryPasswordError("");
      setRecoveryTurnstileToken("");
      setRecoveryTurnstileError("");
      const latestSessionData = await getFreshNativeSession();
      if (latestSessionData?.session) await loadOnboarding(latestSessionData.session, { force: true });
      const nextPath = "/";
      setRoutePath(nextPath);
      setRoute(normalizePath(nextPath));
    } catch (error) {
      setRecoveryTurnstileToken("");
      setRecoveryTurnstileResetKey((value) => value + 1);
      setRecoveryPasswordError(nativeSafeErrorCopy(error, "We couldn't update your password just yet. Try saving it again later."));
    } finally {
      setRecoveryPasswordBusy(false);
    }
  }, [loadOnboarding, recoveryConfirmPassword, recoveryNewPassword, recoveryTurnstileToken, session]);

  const resolvedRoute = resolveNativeBootRoute(session, route, onboarding);

  useEffect(() => {
    if (
      !postSignupCarePending ||
      !sessionKey ||
      postSignupCarePending.userId !== userId ||
      route !== "/" ||
      routePath !== "/" ||
      resolvedRoute.route !== "/" ||
      onboarding?.onboardingCompleted !== true ||
      onboardingLoading ||
      !careMarketResolved ||
      careMarketIsActive ||
      bootSurfacePrewarmSessionKey !== sessionKey
    ) return;
    const timer = setTimeout(() => {
      setPostSignupCarePending(null);
      setPostSignupCareOpen(true);
    }, 260);
    return () => clearTimeout(timer);
  }, [
    bootSurfacePrewarmSessionKey,
    careMarketIsActive,
    careMarketResolved,
    onboarding?.onboardingCompleted,
    onboardingLoading,
    postSignupCarePending,
    resolvedRoute.route,
    route,
    routePath,
    sessionKey,
    userId,
  ]);

  useEffect(() => {
    if (!session || !onboarding || onboarding.registeredIdentity || oauthSignupActive || signupVerifyReturnActive) return;
    const sessionNoticeKey = `${session.user.id}:${session.access_token}`;
    if (unregisteredIdentityNoticeSessionRef.current === sessionNoticeKey) return;
    unregisteredIdentityNoticeSessionRef.current = sessionNoticeKey;
    setRoutePath(nativeSignupResumePath(onboarding.signupResumeState));
    setRoute("/signup");
    Alert.alert(
      "Finish setting up your account",
      "Your sign-in is safe, but your Huddle profile setup isn't complete yet. Continue setup now, or sign out and come back later.",
      [
        { text: "Sign out", style: "cancel", onPress: () => void signOutNativeAuthSession({ scope: "local" }) },
        { text: "Continue setup" },
      ],
      { cancelable: false },
    );
  }, [oauthSignupActive, onboarding, session, signupVerifyReturnActive]);

  useEffect(() => {
    if (!oauthSignupActive || !session || !onboarding) return;
    if (!onboarding.registeredIdentity) {
      if (route !== "/signup" || routePath !== "/signup") {
        setRoutePath("/signup");
        setRoute("/signup");
      }
      return;
    }
    setOauthSignupActive(false);
    if (!onboarding.onboardingCompleted) {
      const nextSignupPath = nativeSignupResumePath(onboarding.signupResumeState);
      if (routePath !== nextSignupPath) {
        setRoutePath(nextSignupPath);
        setRoute("/signup");
      }
      return;
    }
    if (route === "/signup" || routePath.startsWith("/signup")) {
      setRoutePath("/");
      setRoute("/");
    }
  }, [oauthSignupActive, onboarding, route, routePath, session]);

  useEffect(() => {
    if (!session || !onboarding || signupVerifyReturnActive) return;
    if (onboarding.registeredIdentity !== true || onboarding.onboardingCompleted !== false) return;
    const nextSignupPath = nativeSignupResumePath(onboarding.signupResumeState);
    if (routePath === nextSignupPath && route === "/signup") return;
    setOauthSignupActive(false);
    setRoutePath(nextSignupPath);
    setRoute("/signup");
  }, [onboarding, route, routePath, session, signupVerifyReturnActive]);

  useEffect(() => {
    if (signupVerifyReturnActive) return;
    if (!onboarding?.onboardingCompleted) return;
    if (resolvedRoute.route !== "/" || route !== "/signup") return;
    setRoutePath("/");
    setRoute("/");
  }, [onboarding?.onboardingCompleted, resolvedRoute.route, route, signupVerifyReturnActive]);

  useEffect(() => {
    if (resolvedRoute.route === "/chat-dialogue" || resolvedRoute.route === "/service-chat" || resolvedRoute.route === "/chats") {
      void refreshChatUnreadCount();
    }
  }, [refreshChatUnreadCount, resolvedRoute.route, routePath]);

  useEffect(() => {
    if (!friendRequestUnread || resolvedRoute.route !== "/chats" || !userId || !session?.access_token) return;
    const params = new URLSearchParams(routePath.split("?")[1] || "");
    if ((params.get("tab") || "friends") !== "friends") return;
    setFriendRequestUnread(false);
    void markNativeFriendRequestNotificationsReadWithToken(userId, session.access_token)
      .then(() => refreshNotificationCount())
      .catch(() => undefined);
  }, [friendRequestUnread, refreshNotificationCount, resolvedRoute.route, routePath, session?.access_token, userId]);

  useEffect(() => {
    const bootSurfacePrewarmPending = Boolean(session && userId && sessionKey && bootSurfacePrewarmSessionKey !== sessionKey);
    nativeBootLog("route_state", {
      authBootChecked,
      route: resolvedRoute.route,
      routePath,
      userId,
      hasSession: Boolean(session),
      onboardingLoading,
      bootSurfacePrewarmPending,
      needsOnboardingSnapshot: resolvedRoute.needsOnboardingSnapshot,
      onboardingError: onboardingError || null,
    });
    if (!__DEV__) return;
    console.log("NATIVE_ROUTE_CHANGE", { route: resolvedRoute.route, routePath, userId });
    if (resolvedRoute.route === "/edit-profile") {
      console.log("NATIVE_EDIT_PROFILE_ROUTE_PROPS", {
        userId,
        hasInitialSession: Boolean(session),
        initialSessionUserId: session?.user?.id ?? null,
        hasAccessToken: Boolean(session?.access_token),
        hasRefreshToken: Boolean(session?.refresh_token),
      });
    }
  }, [authBootChecked, bootSurfacePrewarmSessionKey, onboardingError, onboardingLoading, resolvedRoute.needsOnboardingSnapshot, resolvedRoute.route, routePath, session, sessionKey, userId]);

  // A signed-out app also waits here while the first-run flag is read, so the
  // brand loading mark covers that moment instead of a blank frame or a flash of
  // the auth screen. Signed-in users render as soon as auth resolves; background
  // surface warming must never delay their first usable route.
  if (
    !authBootChecked
    || (!session && openingIntroDecision === null)
  ) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
      </View>
    );
  }

  // Decided, signed-out, first run. Replaces the screen beneath it rather than
  // overlaying one: mounting auth behind would leave its brand mark looping
  // unseen and reveal it mid-animation, so the film warms that asset itself.
  if (openingIntroDecision) {
    return (
      <View style={styles.root}>
        <NativeOpeningIntroScreen onFinish={() => setOpeningIntroDecision(false)} />
      </View>
    );
  }

  if (
    oauthSignupActive &&
    session &&
    userId &&
    (!onboarding || (onboarding.registeredIdentity === true && onboarding.onboardingCompleted === true && route === "/signup"))
  ) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
      </View>
    );
  }

  if (oauthSignupActive && session && userId && resolvedRoute.route === "auth" && route !== "/signup") {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
      </View>
    );
  }

  if (
    session &&
    userId &&
    onboarding?.registeredIdentity === true &&
    onboarding.onboardingCompleted === false &&
    !signupVerifyReturnActive &&
    (route !== "/signup" || routePath !== nativeSignupResumePath(onboarding.signupResumeState))
  ) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
      </View>
    );
  }

  // Legal deep links are public: render the canonical native document before
  // authentication rather than sending a signed-out user back to Auth.
  if (!session && isNativeLegalPath(routePath)) {
    return (
      <View style={styles.root}>
        <NativeLegalRoute
          path={routePath}
          onClose={() => {
            setRoutePath("/");
            setRoute("/");
          }}
        />
      </View>
    );
  }

  if (resolvedRoute.route === "auth" || !session || !userId) {
    if (recoveryPasswordPending) {
      return (
        <View style={styles.root}>
          <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
        </View>
      );
    }
    if (route === "/signup") {
      const signupVerifyLink = parseNativeSignupVerifyUrl(routePath);
      return (
        <View style={styles.root}>
          <NativeSignupRoute
            initialVerifyLink={signupVerifyLink}
            initialResumeStep={nativeSignupStepFromPath(routePath)}
            resumeNotificationTransition={routePath.includes("resume=notificationTransition")}
            resumeLocationTransition={routePath.includes("resume=locationTransition")}
            resumeQuickProfile={signupVerifyReturnActive || routePath.includes("resume=quickProfile")}
            onCancel={() => {
              setSignupVerifyReturnActive(false);
              setOauthSignupActive(false);
              setRoutePath("/");
              setRoute("/");
            }}
            onOpenWebPath={onNavigate}
            onSignedIn={(nextSession: Session, nextPath: string, signupVerifyReturnActive?: boolean, completedOnboarding?: NativeOnboardingSnapshot) => {
              const nextRoute = normalizePath(nextPath);
              setSignupVerifyReturnActive(signupVerifyReturnActive === true);
              setOauthSignupActive(false);
              activateSession(nextSession, "fresh_login_signed_in");
              setOnboarding(completedOnboarding ?? null);
              setOnboardingError("");
              setSettingsOpen(false);
              setSettingsOverlay(null);
              setNotificationsOpen(false);
              setPostSignupCareOpen(false);
              setPostSignupCarePending(
                completedOnboarding?.careInterestPending
                  ? { accessToken: nextSession.access_token, userId: nextSession.user.id }
                  : null,
              );
              setSupportOpen(false);
              setCancelSignupOpen(false);
              setRoutePath(nextPath);
              setRoute(nextRoute);
              if (nextSession.user?.id) void clearNativeProfileSummaryCache(nextSession.user.id);
              void loadOnboarding(nextSession, { force: true });
            }}
          />
          <Modal animationType="fade" onRequestClose={closeSupport} transparent visible={supportOpen}>
            <View style={styles.supportModalBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeSupport} />
              <Pressable onPress={(event) => event.stopPropagation()} style={styles.supportModalCard}>
                <Pressable accessibilityLabel="Close support modal" accessibilityRole="button" onPress={closeSupport} style={styles.supportModalClose}>
                  <Text style={styles.supportModalCloseText}>×</Text>
                </Pressable>
                <NativeSupportRoute accessToken={null} accountEmail={null} onCancel={closeSupport} />
              </Pressable>
            </View>
          </Modal>
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <NativeAuthRoute
          onAuthenticated={(nextSession: Session, options?: { source?: NativeOAuthProvider | "email" | "biometric"; oauthResolution?: NativeOAuthResolution }) => {
            const fromOAuth = isNativeOAuthProvider(options?.source);
            setOauthSignupActive(fromOAuth);
            activateSession(nextSession, "fresh_login_authenticated");
            setRoutePath("/");
            setRoute("/");
            if (fromOAuth && options?.oauthResolution) {
              if (options.oauthResolution.state === "new_oauth_signup") {
                setRoutePath("/signup");
                setRoute("/signup");
                return;
              }
              setOauthSignupActive(false);
              if (options.oauthResolution.state === "registered_incomplete") {
                void loadOnboarding(nextSession, { force: true }).then((snapshot) => {
                  setRoutePath(nativeSignupResumePath(snapshot?.signupResumeState));
                  setRoute("/signup");
                });
                return;
              }
              void loadOnboarding(nextSession, { force: true });
              return;
            }
            void loadOnboarding(nextSession, { force: fromOAuth }).then((snapshot) => {
              if (!fromOAuth || !snapshot) return;
              if (!snapshot.registeredIdentity) {
                setRoutePath("/signup");
                setRoute("/signup");
                return;
              }
              setOauthSignupActive(false);
              if (!snapshot.onboardingCompleted) {
                setRoutePath(nativeSignupResumePath(snapshot.signupResumeState));
                setRoute("/signup");
              }
            });
          }}
          onCreateAccount={() => {
            setRoutePath("/signup");
            setRoute("/signup");
          }}
        />
      </View>
    );
  }

  if (recoveryPasswordPending) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
        <Modal animationType="fade" onRequestClose={dismissRecoveryPassword} transparent visible>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.recoveryBackdrop}>
            <ScrollView contentContainerStyle={styles.recoveryBackdrop} keyboardShouldPersistTaps="handled">
            <View style={styles.recoveryCard}>
              <Pressable
                accessibilityLabel="Cancel password reset"
                accessibilityRole="button"
                disabled={recoveryPasswordBusy}
                hitSlop={8}
                onPress={() => void dismissRecoveryPassword()}
                style={styles.recoveryClose}
              >
                <Text style={styles.recoveryCloseLabel}>×</Text>
              </Pressable>
              <Text style={styles.recoveryTitle}>Set a new password</Text>
              <Text style={styles.recoveryBody}>Choose a fresh password to finish resetting your huddle account.</Text>
              <View style={styles.recoveryFields}>
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!recoveryPasswordBusy}
                  onBlur={() => setRecoveryFocusedField(null)}
                  onChangeText={(value) => {
                    setRecoveryNewPassword(value);
                    if (recoveryPasswordError) setRecoveryPasswordError("");
                  }}
                  onFocus={() => setRecoveryFocusedField("password")}
                  placeholder="New password"
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="next"
                  secureTextEntry
                  style={[
                    styles.recoveryInput,
                    recoveryFocusedField === "password" ? styles.recoveryInputFocused : null,
                    recoveryPasswordError ? styles.recoveryInputError : null,
                  ]}
                  value={recoveryNewPassword}
                />
                <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!recoveryPasswordBusy}
                  onBlur={() => setRecoveryFocusedField(null)}
                  onChangeText={(value) => {
                    setRecoveryConfirmPassword(value);
                    if (recoveryPasswordError) setRecoveryPasswordError("");
                  }}
                  onFocus={() => setRecoveryFocusedField("confirm")}
                  onSubmitEditing={() => void submitRecoveryPassword()}
                  placeholder="Confirm password"
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="done"
                  secureTextEntry
                  style={[
                    styles.recoveryInput,
                    recoveryFocusedField === "confirm" ? styles.recoveryInputFocused : null,
                    recoveryPasswordError ? styles.recoveryInputError : null,
                  ]}
                  value={recoveryConfirmPassword}
                />
              </View>
              <NativeTurnstile
                action="change_password"
                key={`recovery-password-turnstile-${recoveryTurnstileResetKey}`}
                onError={setRecoveryTurnstileError}
                onToken={(token) => {
                  setRecoveryTurnstileToken(token);
                  if (token) setRecoveryTurnstileError("");
                }}
              siteKey={getNativeTurnstileSiteKey()}
              />
              {recoveryTurnstileError ? <Text style={styles.recoveryError}>{recoveryTurnstileError}</Text> : null}
              {recoveryPasswordError ? <Text style={styles.recoveryError}>{recoveryPasswordError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={recoveryPasswordBusy || !recoveryNewPassword || !recoveryConfirmPassword || !recoveryTurnstileToken.trim()}
                onPress={() => void submitRecoveryPassword()}
                style={({ pressed }) => [
                  styles.recoveryPrimaryButton,
                  pressed && !recoveryPasswordBusy ? styles.pressed : null,
                  recoveryPasswordBusy || !recoveryNewPassword || !recoveryConfirmPassword || !recoveryTurnstileToken.trim() ? styles.disabled : null,
                ]}
              >
                {recoveryPasswordBusy ? <NativeSpinner tone="primary" /> : <Text style={styles.recoveryPrimaryLabel}>Save password</Text>}
              </Pressable>
            </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  if ((onboardingLoading || resolvedRoute.needsOnboardingSnapshot) && !onboardingError) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia animate={!bootBrandAnimationExpired} mode="loading" />
      </View>
    );
  }

  if (onboardingError) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia
          animate={!bootBrandAnimationExpired}
          mode="recoverable"
          onRetry={() => {
            if (session) void loadOnboarding(session);
          }}
          onBackToLogin={() => {
            void signOutNativeAuthSession({ scope: "local" });
          }}
        />
      </View>
    );
  }

  const resolvedEffectiveRoute = resolveNativeEffectiveRoute(route, resolvedRoute.route, signupVerifyReturnActive);
  const effectiveRoute = (!careMarketResolved || !careMarketIsActive) && isCareAvailabilityRoute(routePath)
    ? "/"
    : resolvedEffectiveRoute;
  const verifyIdentityFromSignup = signupVerifyReturnActive && route === "/verify-identity";
  const verifyIdentityFromOnboarding = onboarding?.registeredIdentity === false;

  const routeParams = new URLSearchParams(routePath.split("?")[1] || "");
  const activePetId = routeParams.get("id");
  const activeCarerProfileUserId = routeParams.get("id") || routeParams.get("user") || routeParams.get("userId");
  const verifyReturnTo = routeParams.get("returnTo");
  const verifyProfileContinuePath = verifyReturnTo === "/" ? "/" : "/signup?resume=quickProfile";

  const handleVerifyIdentityBack = () => {
    if (verifyIdentityFromSignup) {
      setRoutePath("/signup?resume=quickProfile");
      setRoute("/signup");
      return;
    }
    if (verifyIdentityFromOnboarding) {
      void confirmNoProfileBeforeCancelSignup().then((confirmedNoProfile) => {
        if (confirmedNoProfile) setCancelSignupOpen(true);
      });
      return;
    }
    restorePreviousRoute();
    if (verifyIdentityReturnToSettings) {
      setVerifyIdentityReturnToSettings(false);
      applyNavigationOverlayState("settings-drawer");
    }
  };
  const handleEditPetBack = () => {
    if (activePetId) {
      onNavigate(`/pet-details?id=${activePetId}`);
      return;
    }
    restorePreviousRoute();
  };
  const handleEditProfileBack = () => {
    restorePreviousRoute();
    if (!editProfileReturnToAccountWithDrawerRef.current) return;
    editProfileReturnToAccountWithDrawerRef.current = false;
    applyNavigationOverlayState("account-with-settings-drawer");
  };
  const handleProfileBack = () => {
    restorePreviousRoute();
    if (profileReturnToSettings) applyNavigationOverlayState("settings-drawer");
    setProfileReturnToSettings(false);
  };
  visibleRouteBackRef.current = effectiveRoute === "/verify-identity"
    ? handleVerifyIdentityBack
    : effectiveRoute === "/edit-pet-profile"
      ? handleEditPetBack
      : effectiveRoute === "/edit-profile"
        ? handleEditProfileBack
      : effectiveRoute === "/profile"
        ? handleProfileBack
        : null;

  const screen =
    effectiveRoute === "/signup" ? (
      <NativeSignupRoute
        initialVerifyLink={null}
        initialResumeStep={nativeSignupStepFromPath(routePath)}
        resumeNotificationTransition={routePath.includes("resume=notificationTransition")}
        resumeLocationTransition={routePath.includes("resume=locationTransition")}
        resumeQuickProfile={signupVerifyReturnActive || routePath.includes("resume=quickProfile")}
        onCancel={() => {
          setSignupVerifyReturnActive(false);
          setOauthSignupActive(false);
          setRoutePath("/");
          setRoute("/");
        }}
        onOpenWebPath={onNavigate}
        onSignedIn={(nextSession: Session, nextPath: string, signupVerifyReturnActive?: boolean, completedOnboarding?: NativeOnboardingSnapshot) => {
          const nextRoute = normalizePath(nextPath);
          setSignupVerifyReturnActive(signupVerifyReturnActive === true);
          setOauthSignupActive(false);
          activateSession(nextSession, "fresh_login_signed_in");
          setOnboarding(completedOnboarding ?? null);
          setOnboardingError("");
          setSettingsOpen(false);
          setSettingsOverlay(null);
          setNotificationsOpen(false);
          setPostSignupCareOpen(false);
          setPostSignupCarePending(
            completedOnboarding?.careInterestPending
              ? { accessToken: nextSession.access_token, userId: nextSession.user.id }
              : null,
          );
          setSupportOpen(false);
          setCancelSignupOpen(false);
          setRoutePath(nextPath);
          setRoute(nextRoute);
          if (nextSession.user?.id) void clearNativeProfileSummaryCache(nextSession.user.id);
          void loadOnboarding(nextSession, { force: true });
        }}
      />
    ) : effectiveRoute === "/verify-identity" ? (
      <NativeVerifyIdentityRoute
        initialSession={session}
        sessionKey={sessionKey}
        userId={userId}
        hideProfileFooter={verifyIdentityReturnToSettings}
        profileContinueLabel={verifyProfileContinuePath === "/" ? "Continue to huddle" : undefined}
        profileContinuePath={verifyProfileContinuePath}
        onBack={handleVerifyIdentityBack}
        friendRequestUnread={friendRequestUnread}
        onNavigate={onNavigate}
        onOpenSupport={openSupport}
      />
    ) : effectiveRoute === "/social" ? (
      <NativeSocialRoute
        userId={userId}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        search={routePath.startsWith("/social?") ? routePath.split("?")[1] : ""}
        onNavigate={onNavigate}
        onScrollTopRef={socialScrollTopRef}
      />
    ) : effectiveRoute === "/service-chat" ? (
      <NativeServiceChatRoute
        key={routePath}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        search={routePath.split("?")[1] || ""}
        userId={userId}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/chat-dialogue" ? (
      <NativeChatDialogueRoute
        key={routePath}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        userId={userId}
        search={routePath.split("?")[1] || ""}
        onNavigate={onNavigate}
        onRoomRead={(roomId: string, unreadHint?: number) => {
          chatUnreadVersionRef.current += 1;
          const readHintKey = `${routePath}:${roomId}:${unreadHint || 0}`;
          if (typeof unreadHint === "number" && unreadHint > 0 && !chatReadHintAppliedRef.current.has(readHintKey)) {
            chatReadHintAppliedRef.current.add(readHintKey);
            setChatUnreadCount((current) => Math.max(0, current - unreadHint));
          }
          void refreshChatUnreadCount();
        }}
        onGoBack={() => {
          void refreshChatUnreadCount();
          const params = new URLSearchParams(routePath.split("?")[1] || "");
          const returnTo = params.get("returnTo");
          const fallback = params.get("with")
            ? "/chats?tab=friends"
            : "/chats?tab=groups";
          onNavigate(returnTo || fallback);
        }}
      />
    ) : effectiveRoute === "/chats" ? (
      <NativeChatsRoute
        accessToken={session.access_token}
        careMarketIsActive={careMarketIsActive}
        sessionKey={sessionKey}
        userId={userId}
        search={routePath.startsWith("/chats?")
          ? routePath.split("?")[1]
          : `tab=${readNativeChatsLastTabHandoff({ sessionKey, userId }) || "friends"}`}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/service" ? (
      <NativeServiceRoute userId={userId} accessToken={session.access_token} sessionKey={sessionKey} onNavigate={onNavigate} />
    ) : effectiveRoute === "/map" ? (
      <NativeMapRoute
        accessToken={session.access_token}
        sessionKey={sessionKey}
        userId={userId}
        search={routePath.startsWith("/map?") ? routePath.split("?")[1] : ""}
        alertFocusIntent={mapAlertNavigationIntent}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/security-settings" ? (
      <NativeSecuritySettingsRoute initialSession={session} onBack={() => restorePreviousRoute()} />
    ) : effectiveRoute === "/premium" ? (
      <NativeManageSubscriptionRoute
        accessToken={session.access_token}
        userId={userId}
        sessionKey={sessionKey}
        session={session}
        initialSession={session}
        initialPlan={routePath.includes("tab=addons") ? "addons" : "gold"}
        onNavigate={onNavigate}
        onBack={() => {
          restorePreviousRoute();
        }}
        onGoBack={() => {
          restorePreviousRoute();
        }}
        onClose={() => {
          restorePreviousRoute();
        }}
      />
    ) : effectiveRoute === "/carerprofile" ? (
      <NativeCarerProfileRoute
        userId={userId}
        profileUserId={activeCarerProfileUserId}
        openProfessionalOnLoad={routeParams.get("mode") === "edit" && routeParams.get("section") === "professional"}
        sessionKey={sessionKey}
        session={session}
        initialSession={session}
        onNavigate={onNavigate}
        onBack={() => restorePreviousRoute()}
        onGoBack={() => restorePreviousRoute()}
        onClose={() => restorePreviousRoute()}
      />
    ) : effectiveRoute === "/edit-profile" ? (
      <NativeEditProfileRoute
        accessToken={session.access_token}
        focusField={routeParams.get("focus")}
        initialSession={session}
        mode="edit"
        onCareLocationSaved={refreshCareAfterLocationSave}
        sessionKey={sessionKey}
        userId={userId}
        onNavigate={onNavigate}
        onGoBack={handleEditProfileBack}
      />
    ) : effectiveRoute === "/pet-details" ? (
      <NativePetDetailsRoute
        accessToken={session.access_token}
        petId={activePetId}
        sessionKey={sessionKey}
        userId={userId}
        onGoBack={() => {
          restorePreviousRoute();
        }}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/edit-pet-profile" ? (
      <NativeSetPetRoute
        accessToken={session.access_token}
        onboardingMode={false}
        petId={activePetId}
        sessionKey={sessionKey}
        userId={userId}
        onNavigate={onNavigate}
        onGoBack={handleEditPetBack}
      />
    ) : effectiveRoute === "/legal" ? (
      <NativeLegalRoute
        path={routePath}
        onClose={() => {
          restorePreviousRoute();
        }}
      />
    ) : effectiveRoute === "/profile" ? (
      <NativeProfileSummaryRoute
        careMarketIsActive={careMarketIsActive}
        userId={userId}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        onBack={handleProfileBack}
        onNavigate={onNavigate}
        onOpenSupport={openSupport}
        onSignOut={() => void signOutNativeAuthSession({ scope: "local" })}
      />
    ) : (
      <NativeHomeRoute
        userId={userId}
        accessToken={session.access_token}
        sessionGeneration={sessionGeneration}
        sessionKey={sessionKey}
        outNowContinueIntent={outNowContinueIntent}
        onNavigate={onNavigate}
      />
    );

  const rendersHomeSurface = effectiveRoute === "/";
  const isMainChromeRoute = rendersHomeSurface || effectiveRoute === "/social" || effectiveRoute === "/chats" || effectiveRoute === "/service" || effectiveRoute === "/map";
  const isSettingsChromeRoute = effectiveRoute === "/edit-profile" || effectiveRoute === "/pet-details" || effectiveRoute === "/edit-pet-profile" || effectiveRoute === "/legal" || effectiveRoute === "/carerprofile" || effectiveRoute === "/premium";
  const showBottomNav = isMainChromeRoute;
  const showGlobalChrome = isMainChromeRoute || isSettingsChromeRoute;
  const signedInBrandTransitionPending = Boolean(
    session
    && userId
    && sessionKey
    && onboarding?.onboardingCompleted === true
    && bootHomeReadySessionKey !== sessionKey
  );

  return (
    <View style={styles.root}>
      <View style={styles.screenHost}>
        {(mountedMainRoutes.has("/") || effectiveRoute === "/") ? (
          <View accessibilityElementsHidden={effectiveRoute !== "/"} importantForAccessibility={effectiveRoute === "/" ? "auto" : "no-hide-descendants"} pointerEvents={effectiveRoute === "/" ? "auto" : "none"} style={[styles.mainRouteLayer, { paddingTop: measuredHeaderHeight }, effectiveRoute === "/" ? styles.mainRouteLayerActive : styles.mainRouteLayerInactive]}>
            <NativeFadeIn trigger={effectiveRoute === "/" ? "home-active" : "home-inactive"}>
              <NativeHomeRoute active={effectiveRoute === "/"} userId={userId} accessToken={session.access_token} sessionGeneration={sessionGeneration} sessionKey={sessionKey} outNowContinueIntent={outNowContinueIntent} onNavigate={onNavigate} />
            </NativeFadeIn>
          </View>
        ) : null}
        {(mountedMainRoutes.has("/social") || effectiveRoute === "/social") ? (
          <View accessibilityElementsHidden={effectiveRoute !== "/social"} importantForAccessibility={effectiveRoute === "/social" ? "auto" : "no-hide-descendants"} pointerEvents={effectiveRoute === "/social" ? "auto" : "none"} style={[styles.mainRouteLayer, { paddingTop: measuredHeaderHeight }, effectiveRoute === "/social" ? styles.mainRouteLayerActive : styles.mainRouteLayerInactive]}>
            <NativeFadeIn trigger={effectiveRoute === "/social" ? "social-active" : "social-inactive"}>
              <NativeSocialRoute active={effectiveRoute === "/social"} userId={userId} accessToken={session.access_token} sessionKey={sessionKey} search={effectiveRoute === "/social" && routePath.startsWith("/social?") ? routePath.split("?")[1] : ""} onNavigate={onNavigate} onScrollTopRef={socialScrollTopRef} />
            </NativeFadeIn>
          </View>
        ) : null}
        {(mountedMainRoutes.has("/chats") || effectiveRoute === "/chats") ? (
          <View accessibilityElementsHidden={effectiveRoute !== "/chats"} importantForAccessibility={effectiveRoute === "/chats" ? "auto" : "no-hide-descendants"} pointerEvents={effectiveRoute === "/chats" ? "auto" : "none"} style={[styles.mainRouteLayer, { paddingTop: measuredHeaderHeight }, effectiveRoute === "/chats" ? styles.mainRouteLayerActive : styles.mainRouteLayerInactive]}>
            <NativeFadeIn trigger={effectiveRoute === "/chats" ? "chats-active" : "chats-inactive"}>
              <NativeChatsRoute active={effectiveRoute === "/chats"} accessToken={session.access_token} careMarketIsActive={careMarketIsActive} friendRequestUnread={friendRequestUnread} sessionKey={sessionKey} userId={userId} search={effectiveRoute === "/chats" && routePath.startsWith("/chats?") ? routePath.split("?")[1] : `tab=${readNativeChatsLastTabHandoff({ sessionKey, userId }) || "friends"}`} onNavigate={onNavigate} />
            </NativeFadeIn>
          </View>
        ) : null}
        {(mountedMainRoutes.has("/service") || effectiveRoute === "/service") ? (
          <View accessibilityElementsHidden={effectiveRoute !== "/service"} importantForAccessibility={effectiveRoute === "/service" ? "auto" : "no-hide-descendants"} pointerEvents={effectiveRoute === "/service" ? "auto" : "none"} style={[styles.mainRouteLayer, { paddingTop: measuredHeaderHeight }, effectiveRoute === "/service" ? styles.mainRouteLayerActive : styles.mainRouteLayerInactive]}>
            <NativeFadeIn trigger={effectiveRoute === "/service" ? "service-active" : "service-inactive"}>
              <NativeServiceRoute active={effectiveRoute === "/service"} userId={userId} accessToken={session.access_token} sessionKey={sessionKey} onNavigate={onNavigate} />
            </NativeFadeIn>
          </View>
        ) : null}
        {(mountedMainRoutes.has("/map") || effectiveRoute === "/map") ? (
          <View accessibilityElementsHidden={effectiveRoute !== "/map"} importantForAccessibility={effectiveRoute === "/map" ? "auto" : "no-hide-descendants"} pointerEvents={effectiveRoute === "/map" ? "auto" : "none"} style={[styles.mainRouteLayer, effectiveRoute === "/map" ? styles.mainRouteLayerActive : styles.mainRouteLayerInactive]}>
            <NativeMapRoute active={effectiveRoute === "/map"} accessToken={session.access_token} sessionKey={sessionKey} userId={userId} search={effectiveRoute === "/map" && routePath.startsWith("/map?") ? routePath.split("?")[1] : ""} alertFocusIntent={mapAlertNavigationIntent} onNavigate={onNavigate} />
          </View>
        ) : null}
        {!isMainChromeRoute ? (
          <View style={[styles.detailRouteLayer, showGlobalChrome ? { paddingTop: measuredHeaderHeight } : null]}>
            <NativeFadeIn trigger={effectiveRoute}>{screen}</NativeFadeIn>
          </View>
        ) : null}
      </View>
      {showGlobalChrome ? (
        <NativeGlobalHeader
          notificationCount={notificationCount}
          onHeightChange={(height) => setMeasuredHeaderHeight(height + huddleSpacing.x2)}
          onLogoPress={() => onNavigate("/")}
          onNotificationsPress={() => applyNavigationOverlayState("notifications")}
          onSettingsPress={() => applyNavigationOverlayState("settings-drawer")}
          showSettings
        />
      ) : null}
      {showBottomNav ? <NativeBottomNav activeTab={tabForPath(effectiveRoute)} careMarketIsActive={careMarketIsActive} chatUnreadCount={chatUnreadCount} friendRequestUnread={friendRequestUnread} newChatPending={newChatPending} onNavigate={onNavigate} onReselect={handleTabReselect} /> : null}
      <NativeCareInterestSheet
        accessToken={postSignupCarePending?.accessToken || session.access_token}
        onClose={() => setPostSignupCareOpen(false)}
        onSkip={() => setPostSignupCareOpen(false)}
        onSuccessDismissed={() => setPostSignupCareOpen(false)}
        open={postSignupCareOpen}
        optional
      />
      {settingsOverlay === "account" ? (
        <View style={styles.settingsOverlayHost}>
          <NativeProfileSummaryRoute
            careMarketIsActive={careMarketIsActive}
            userId={userId}
            accessToken={session.access_token}
            sessionKey={sessionKey}
            onBack={() => {
              applyNavigationOverlayState("settings-drawer");
            }}
            onNavigate={handleSettingsOverlayNavigate}
            onOpenSupport={openSupport}
            onSignOut={() => {
              setSettingsOverlay(null);
              setSettingsOpen(false);
              void signOutNativeAuthSession({ scope: "local" });
            }}
          />
        </View>
      ) : null}
      {showGlobalChrome || settingsOpen ? (
        <NativeSettingsDrawer
          accessToken={session.access_token}
          careMarketIsActive={careMarketIsActive}
          openAddFriendCodeIntent={addFriendCodeIntent}
          openFamilyIntent={familySettingsIntent}
          open={settingsOpen}
          sessionKey={sessionKey}
          userId={userId}
          onClose={() => setSettingsOpen(false)}
          onOpen={() => applyNavigationOverlayState("settings-drawer")}
          onNavigate={handleSettingsDrawerNavigate}
          onOpenSupport={openSupport}
          onSignOut={() => {
            setSettingsOpen(false);
            void signOutNativeAuthSession({ scope: "local" });
          }}
        />
      ) : null}
      <NativeNotificationsPanel
        open={notificationsOpen}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        userId={notificationsOpen ? userId : null}
        onClose={() => setNotificationsOpen(false)}
        onMarkedRead={() => setNotificationCount(0)}
        onNavigate={(path: string) => {
          if (!isCareAvailabilityRoute(path)) {
            onNavigate(path);
            return;
          }
          void refreshCareMarket().then(() => onNavigate(path));
        }}
      />
      {showGlobalChrome && !notificationsOpen && !settingsOverlay ? (
        <NativeLeftEdgeSwipe
          onOpen={() => applyNavigationOverlayState("notifications")}
          // Social renders its own filter bar (search + topic tabs) directly below
          // the global header, inside the screen content. This catcher's `top` only
          // ever cleared the global header, so on Social it physically overlapped
          // the topic tab row — specifically the "All" tab, which sits at the
          // screen's left edge (x 16-45) inside this catcher's 28px-wide left-edge
          // zone (x 0-28), with a higher zIndex (60) and its own gesture-handler
          // Pan recognizer. That recognizer operates outside RN's core touch
          // responder system, so it could intermittently win the touch before
          // "All"'s Pressable ever saw it — invisible to any onPress/onTouchStart
          // instrumentation on the Pressable itself, and unrelated to (and
          // unfixable via) any ScrollView touch-arbitration prop. No other route
          // renders extra chrome in this band, so only Social needs the offset.
          top={insets.top + huddleLayout.headerHeight + (effectiveRoute === "/social" ? huddleSocial.filterBarHeight : 0)}
          bottom={huddleLayout.navHeight + insets.bottom}
        />
      ) : null}
      <Modal animationType="fade" onRequestClose={closeSupport} transparent visible={supportOpen}>
        <View style={styles.supportModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSupport} />
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.supportModalCard}>
            <Pressable
              accessibilityLabel="Close support modal"
              accessibilityRole="button"
              onPress={closeSupport}
              style={styles.supportModalClose}
            >
              <Text style={styles.supportModalCloseText}>×</Text>
            </Pressable>
            <NativeSupportRoute
              accessToken={session.access_token}
              accountEmail={session.user.email ?? null}
              onCancel={closeSupport}
            />
          </Pressable>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={cancelSignupOpen}
        onRequestClose={() => setCancelSignupOpen(false)}
      >
        <View style={styles.registeredBackdrop}>
          <Pressable disabled={cancelSignupBusy} style={StyleSheet.absoluteFill} onPress={() => setCancelSignupOpen(false)} />
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.registeredCard}>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              disabled={cancelSignupBusy}
              onPress={() => setCancelSignupOpen(false)}
              style={styles.registeredClose}
            >
              <Text style={styles.registeredCloseText}>×</Text>
            </Pressable>
            <Text style={styles.registeredTitle}>Your signup is completed. Do you wanna cancel sign up?</Text>
            <Text style={styles.registeredBody}>Cancelling removes this Huddle account and clears the unfinished profile record.</Text>
            {cancelSignupError ? <Text style={styles.registeredError}>{cancelSignupError}</Text> : null}
            <View style={styles.registeredActions}>
              <Pressable accessibilityRole="button" disabled={cancelSignupBusy} onPress={() => void confirmCancelSignup()} style={({ pressed }) => [styles.registeredDestructiveButton, pressed && !cancelSignupBusy ? styles.pressed : null, cancelSignupBusy ? styles.disabled : null]}>
                <Text style={styles.registeredDestructiveLabel}>{cancelSignupBusy ? "Cancelling..." : "Yes"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={cancelSignupBusy} onPress={() => setCancelSignupOpen(false)} style={({ pressed }) => [styles.registeredCancelButton, pressed && !cancelSignupBusy ? styles.pressed : null, cancelSignupBusy ? styles.disabled : null]}>
                <Text style={styles.registeredCancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </View>
      </Modal>

      {onboardingHeroVisible && rendersHomeSurface ? (
        <NativeOnboardingHeroScreen
          onContinue={() => {
            setOnboardingHeroVisible(false);
            void clearNativeOnboardingHero(userId, session.access_token).then(() => {
              if (session) void loadOnboarding(session, { force: true });
            });
          }}
        />
      ) : null}
      {signedInBrandTransitionPending ? (
        <View
          accessibilityViewIsModal
          importantForAccessibility="yes"
          pointerEvents="auto"
          style={styles.signedInBrandTransition}
        >
          <NativeBootBrandMedia mode="loading" />
        </View>
      ) : null}
      {banner || windowToast ? (
        Platform.OS === "ios" ? (
          <FullWindowOverlay>
            <View pointerEvents="box-none" style={styles.windowToastHost}>
              {banner ? (
                <NativeReturnBanner
                  elapsedSeconds={banner.elapsedSeconds}
                  onDismiss={() => { setBanner(null); hideNativeReturnBanner(); }}
                />
              ) : windowToast ? (
                <NativeToast
                  content={windowToast.content}
                  holdToPause={windowToast.holdToPause}
                  key={windowToast.id}
                  message={windowToast.message}
                  onDismiss={() => {
                    windowToast.onDismiss?.();
                    hideNativeWindowToast(windowToast.id);
                  }}
                  windowLevel
                />
              ) : null}
            </View>
          </FullWindowOverlay>
        ) : (
          <View pointerEvents="box-none" style={styles.windowToastHost}>
            {banner ? (
              <NativeReturnBanner
                elapsedSeconds={banner.elapsedSeconds}
                onDismiss={() => { setBanner(null); hideNativeReturnBanner(); }}
              />
            ) : windowToast ? (
              <NativeToast
                content={windowToast.content}
                holdToPause={windowToast.holdToPause}
                key={windowToast.id}
                message={windowToast.message}
                onDismiss={() => {
                  windowToast.onDismiss?.();
                  hideNativeWindowToast(windowToast.id);
                }}
                windowLevel
              />
            ) : null}
          </View>
        )
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  windowToastHost: {
    ...StyleSheet.absoluteFillObject,
    elevation: 10000,
    zIndex: 10000,
  },
  settingsOverlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    backgroundColor: huddleColors.canvas,
  },
  signedInBrandTransition: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.canvas,
    elevation: 20000,
    zIndex: 20000,
  },
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  screenHost: {
    flex: 1,
  },
  mainRouteLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: huddleColors.canvas,
  },
  mainRouteLayerActive: {
    opacity: 1,
    zIndex: 1,
  },
  mainRouteLayerInactive: {
    opacity: 0,
    zIndex: 0,
  },
  detailRouteLayer: {
    flex: 1,
  },
  routeLoadFailure: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x6,
  },
  routeLoadFailureTitle: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  routeLoadFailureCopy: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 20,
    marginTop: huddleSpacing.x2,
    textAlign: "center",
  },
  bootBrandScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  bootBrandCenter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
  },
  bootLogoWindow: {
    width: 160,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -18,
    overflow: "hidden",
  },
  bootRecoverableContent: {
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
    gap: huddleSpacing.x4,
    marginTop: huddleSpacing.x8,
  },
  bootRecoverableCopy: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  bootLoadingCopy: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    marginTop: huddleSpacing.x4,
    textAlign: "center",
  },
  bootRecoverableActions: {
    width: 238,
    gap: huddleSpacing.x3,
  },
  bootRetryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    width: "100%",
  },
  bootRetryLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  bootBackButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    width: "100%",
  },
  bootBackLabel: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  recoveryBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.backdrop,
    paddingHorizontal: huddleSpacing.x4,
  },
  recoveryCard: {
    position: "relative",
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    gap: huddleSpacing.x3,
  },
  recoveryClose: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    zIndex: 1,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
  },
  recoveryCloseLabel: {
    fontFamily: "Urbanist-600",
    fontSize: 28,
    lineHeight: 30,
    color: huddleColors.subtext,
  },
  recoveryTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 28,
    color: huddleColors.text,
    textAlign: "center",
  },
  recoveryBody: {
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 22,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  recoveryFields: {
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x2,
  },
  recoveryInput: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: 1,
    borderColor: "rgba(198, 202, 214, 0.9)",
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-600",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
    overflow: "hidden",
  },
  recoveryInputFocused: {
    ...huddleFieldStates.focused,
  },
  recoveryInputError: {
    ...huddleFieldStates.error,
  },
  recoveryError: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  recoveryPrimaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
    marginTop: huddleSpacing.x2,
  },
  recoveryPrimaryLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  legalRoute: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  legalCloseButton: {
    position: "absolute",
    top: huddleSpacing.x2,
    right: huddleSpacing.x5,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  legalCloseText: {
    fontFamily: "Urbanist-600",
    fontSize: 26,
    lineHeight: 30,
    color: huddleColors.iconMuted,
  },
  legalContent: {
    // The screen host already reserves global-header height. Match subscription's action row.
    paddingTop: huddleSpacing.x2 + 40 + huddleSpacing.x4,
    paddingHorizontal: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x9,
    gap: huddleSpacing.x3,
  },
  legalTitle: {
    fontFamily: "Urbanist-800",
    fontSize: 24,
    lineHeight: 30,
    color: "#141826",
  },
  legalMeta: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: "#747A90",
  },
  legalSection: {
    gap: huddleSpacing.x2,
  },
  legalSectionTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 16,
    lineHeight: 22,
    color: "#141826",
  },
  legalBody: {
    fontFamily: "Urbanist-400",
    fontSize: 14,
    lineHeight: 22,
    color: "#4B5168",
  },
  legalBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  legalBulletDot: {
    width: 14,
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 22,
    color: "#4B5168",
  },
  legalBulletText: {
    flex: 1,
    fontFamily: "Urbanist-400",
    fontSize: 14,
    lineHeight: 22,
    color: "#4B5168",
  },
  supportModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 24, 38, 0.42)",
    paddingHorizontal: 18,
  },
  supportModalCard: {
    width: "100%",
    maxWidth: 390,
    maxHeight: "80%",
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  supportModalClose: {
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
  supportModalCloseText: {
    fontSize: 24,
    lineHeight: 28,
    color: "#747A90",
  },
  registeredBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(20,24,38,0.28)",
  },
  registeredCard: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
    backgroundColor: "#FFFFFF",
    gap: 14,
    shadowColor: "#0057FF",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  registeredClose: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  registeredCloseText: {
    color: "#424965",
    fontFamily: "Urbanist-600",
    fontSize: 30,
    lineHeight: 34,
  },
  registeredTitle: {
    paddingRight: 48,
    color: "#424965",
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 28,
  },
  registeredBody: {
    color: "#4A4A4A",
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 22,
  },
  registeredError: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
  },
  registeredActions: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    paddingTop: huddleSpacing.x1,
  },
  registeredDestructiveButton: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.destructive,
  },
  registeredDestructiveLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  registeredCancelButton: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  registeredCancelLabel: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  pressed: huddleButtons.pressed,
  disabled: huddleButtons.disabled,
});
