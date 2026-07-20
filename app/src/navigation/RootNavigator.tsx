import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { AppState, Linking, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { useEventListener } from "expo";
import * as Notifications from "expo-notifications";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeBottomNav, type NativeBottomTab } from "../components/NativeBottomNav";
import { NativeGlobalHeader } from "../components/NativeGlobalHeader";
import { NativeSettingsDrawer } from "../components/NativeSettingsDrawer";
import { NativeNotificationsPanel } from "../components/NativeNotificationsPanel";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { huddleButtons, huddleColors, huddleLayout, huddleRadii, huddleSpacing } from "../theme/huddleDesignTokens";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { NativeAuthScreen } from "../screens/NativeAuthScreen";
import { NativeChatsScreen } from "../screens/NativeChatsScreen";
import { NativeChatDialogueScreen } from "../screens/NativeChatDialogueScreen";
import { NativeEditProfileScreen } from "../screens/NativeEditProfileScreen";
import { NativeHomeScreen } from "../screens/NativeHomeScreen";
import { NativeMapScreen } from "../screens/NativeMapScreen";
import { NativePetDetailsScreen } from "../screens/NativePetDetailsScreen";
import { NativeCarerProfileScreen } from "../screens/NativeCarerProfileScreen";
import { NativeManageSubscriptionScreen } from "../screens/NativeManageSubscriptionScreen";
import { NativeSecuritySettingsScreen } from "../screens/NativeSecuritySettingsScreen";
import { NativeProfileSummaryScreen } from "../screens/NativeProfileSummaryScreen";
import { NativeServiceScreen } from "../screens/NativeServiceScreen";
import { NativeServiceChatScreen } from "../screens/NativeServiceChatScreen";
import { NativeSetPetScreen } from "../screens/NativeSetPetScreen";
import { NativeSignupScreen } from "../screens/NativeSignupScreen";
import { NativeSocialScreen } from "../screens/NativeSocialScreen";
import { NativeSupportScreen } from "../screens/NativeSupportScreen";
import { NativeVerifyIdentityScreen } from "../screens/NativeVerifyIdentityScreen";
import { WebShellScreen } from "../screens/WebShellScreen";
import { consumeNativeSupabaseAuthRedirect, isNativeAuthRedirectUrl } from "../lib/nativeAuthRedirect";
import { clearNativeSignupDraft } from "../lib/nativeSignup";
import { fetchNativeChatUnreadTotal } from "../lib/nativeChat";
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
import { createNativeSessionKey } from "../lib/nativeFreshnessRegistry";
import { resolveNativeSettingsDrawerNavigation, type NativeSettingsOverlayName } from "../lib/nativeVerifyIdentityRouteOwnership";
import { fetchNativeUnreadNotificationCountWithToken, notificationDestinationPath, readCachedNativeUnreadNotificationCount } from "../lib/nativeNotifications";
import { createSingleRealtimeChannel } from "../lib/realtimeChannelManager";
import huddleVideoFallback from "../../assets/huddle-video-fallback-transparent.png";
import huddleVideo from "../../assets/huddle-video.mp4";

type NativeRoute = NativeBootRoute;

const NativeEditProfileRoute = NativeEditProfileScreen as NativeLooseScreen;
const BOOT_LOGO_MEDIA_SIZE = 160;
const BOOT_SNAPSHOT_RETRY_DELAY_MS = 600;
const BOOT_RECOVERABLE_COPY = "We’re having trouble loading your account right now.";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_native_onboarding_snapshot`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
        "content-type": "application/json",
      },
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

const nativeRestHeaders = (accessToken: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: supabaseAnonKey,
  ...extra,
});

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

const registerNativePushForSession = async (userId: string, accessToken: string) => {
  if (!Device.isDevice) return "physical_device_required";

  const prefsUrl = new URL(`${supabaseUrl}/rest/v1/notification_preferences`);
  prefsUrl.searchParams.set("select", "push_enabled,pause_all");
  prefsUrl.searchParams.set("user_id", `eq.${userId}`);
  prefsUrl.searchParams.set("limit", "1");
  const prefsResponse = await fetch(prefsUrl.toString(), { headers: nativeRestHeaders(accessToken) });
  const prefsRaw = await prefsResponse.text();
  const prefsParsed = prefsRaw ? JSON.parse(prefsRaw) as Array<{ push_enabled?: boolean | null; pause_all?: boolean | null }> : [];
  if (!prefsResponse.ok) throw new Error("push_preferences_load_failed");
  const prefs = Array.isArray(prefsParsed) ? prefsParsed[0] : null;
  if (prefs?.push_enabled === false || prefs?.pause_all === true) return "push_disabled";

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") return "permission_denied";

  const projectId = readNativePushProjectId();
  if (!projectId) return "project_id_missing";
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token.data) return "token_missing";

  const deviceId = await getOrCreateRootPushDeviceId();
  const pushUrl = new URL(`${supabaseUrl}/rest/v1/push_tokens`);
  pushUrl.searchParams.set("on_conflict", "user_id,token");
  const pushResponse = await fetch(pushUrl.toString(), {
    method: "POST",
    headers: nativeRestHeaders(accessToken, {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({
      user_id: userId,
      token: token.data,
      platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
      device_id: deviceId,
      is_active: true,
      last_used_at: new Date().toISOString(),
    }),
  });
  if (!pushResponse.ok) throw new Error("push_token_upsert_failed");

  const profileUrl = new URL(`${supabaseUrl}/rest/v1/profiles`);
  profileUrl.searchParams.set("id", `eq.${userId}`);
  const profileResponse = await fetch(profileUrl.toString(), {
    method: "PATCH",
    headers: nativeRestHeaders(accessToken, {
      "content-type": "application/json",
      prefer: "return=minimal",
    }),
    body: JSON.stringify({ fcm_token: token.data }),
  });
  if (!profileResponse.ok) throw new Error("push_profile_update_failed");
  return "registered";
};

export function NativeBootBrandMedia({
  mode,
  onRetry,
  onBackToLogin,
}: {
  mode: "loading" | "recoverable";
  onRetry?: () => void;
  onBackToLogin?: () => void;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const player = useVideoPlayer(huddleVideo, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    nextPlayer.timeUpdateEventInterval = 0.1;
    nextPlayer.play();
  });

  useEventListener(player, "statusChange", ({ status, error }) => {
    if (status === "error" || error) {
      setVideoFailed(true);
      setVideoReady(false);
      setVideoFrameReady(false);
    }
  });
  useEventListener(player, "sourceLoad", () => {
    setVideoFailed(false);
    setVideoReady(true);
    setVideoFrameReady(false);
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime > 0) {
      setVideoFrameReady(true);
    }
  });

  return (
    <View style={styles.bootBrandScreen}>
      <View style={styles.bootBrandCenter}>
        <View style={styles.bootLogoWindow}>
          <Image source={huddleVideoFallback} resizeMode="contain" style={styles.bootLogoFallbackImage} />
          {videoReady && !videoFailed ? (
            <View pointerEvents="none" style={[styles.bootLogoVideoClip, videoFrameReady ? null : styles.bootLogoVideoLoading]}>
              <VideoView
                player={player}
                nativeControls={false}
                fullscreenOptions={{ enable: false }}
                contentFit="contain"
                style={styles.bootLogoVideo}
              />
            </View>
          ) : null}
        </View>
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
  path.startsWith("/service-provider-agreement") ||
  path.startsWith("/booking-terms");

const normalizePath = (path: string): NativeRoute => {
  if (path.startsWith("/signup")) return "/signup";
  if (path.startsWith("/settings/security") || path.startsWith("/security-settings") || path.startsWith("/passkey")) return "/security-settings";
  if (isNativeLegalPath(path)) return "/legal";
  if (path.startsWith("/pet-details")) return "/pet-details";
  if (path.startsWith("/edit-pet-profile") || path.startsWith("/edit-pet")) return "/edit-pet-profile";
  if (path.startsWith("/verify-identity")) return "/verify-identity";
  if (path.startsWith("/set-profile")) return "/set-profile";
  if (path.startsWith("/set-pet")) return "/set-pet";
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
  if (raw.startsWith("/")) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "huddle:") {
      const hostPath = parsed.hostname ? `/${parsed.hostname}` : "";
      const pathname = parsed.pathname || "";
      const path = `${hostPath}${pathname}` || "/";
      return `${path}${parsed.search || ""}`;
    }
    if (parsed.hostname === "huddle.pet" || parsed.hostname === "www.huddle.pet") {
      return `${parsed.pathname || "/"}${parsed.search || ""}`;
    }
  } catch {
    return null;
  }
  return null;
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

type NativeLooseScreen = (props: Record<string, unknown>) => ReactElement | null;
const NativeSecuritySettingsRoute = NativeSecuritySettingsScreen as unknown as NativeLooseScreen;
const NativeManageSubscriptionRoute = NativeManageSubscriptionScreen as unknown as NativeLooseScreen;
const NativeCarerProfileRoute = NativeCarerProfileScreen as unknown as NativeLooseScreen;


function NativeLegalRoute({ onClose, path }: { onClose: () => void; path: string }) {
  const page = getNativeLegalPage(path) as Record<string, unknown> | null;
  const title = String(page?.title || "Legal Information");
  const updated = page?.updatedAt || page?.updated || page?.effectiveDate;
  const sections = Array.isArray(page?.sections) ? page.sections as Array<Record<string, unknown>> : [];

  const renderBody = (body: unknown, keyPrefix: string) => {
    const values = Array.isArray(body) ? body : body ? [body] : [];
    return values.map((item, index) => (
      <Text key={`${keyPrefix}-${index}`} style={styles.legalBody}>
        {String(item)}
      </Text>
    ));
  };

  return (
    <View style={styles.legalRoute}>
      <Pressable accessibilityLabel="Close legal page" accessibilityRole="button" onPress={onClose} style={styles.legalCloseButton}>
        <Text style={styles.legalCloseText}>×</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.legalContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.legalTitle}>{title}</Text>
        {updated ? <Text style={styles.legalMeta}>Updated {String(updated)}</Text> : null}
        {sections.length > 0 ? (
          sections.map((section, index) => (
            <View key={`${String(section.title || "section")}-${index}`} style={styles.legalSection}>
              {section.title ? <Text style={styles.legalSectionTitle}>{String(section.title)}</Text> : null}
              {renderBody(section.body ?? section.items ?? section.copy ?? section.content, `section-${index}`)}
            </View>
          ))
        ) : (
          <Text style={styles.legalBody}>This legal page is not available in this build.</Text>
        )}
      </ScrollView>
    </View>
  );
}

export function RootNavigator() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [authBootChecked, setAuthBootChecked] = useState(false);
  const [route, setRoute] = useState<NativeRoute>("/");
  const [routePath, setRoutePath] = useState("/");
  const [onboarding, setOnboarding] = useState<NativeOnboardingSnapshot | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [cancelSignupOpen, setCancelSignupOpen] = useState(false);
  const [cancelSignupBusy, setCancelSignupBusy] = useState(false);
  const [cancelSignupError, setCancelSignupError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsOverlay, setSettingsOverlay] = useState<NativeSettingsOverlayName | null>(null);
  const [familySettingsIntent, setFamilySettingsIntent] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [pendingInboundPath, setPendingInboundPath] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [verifyIdentityReturnToSettings, setVerifyIdentityReturnToSettings] = useState(false);
  const lastBrowsingRouteRef = useRef<{ path: string; route: NativeRoute }>({ path: "/", route: "/" });
  const legalReturnRouteRef = useRef<{ path: string; route: NativeRoute }>({ path: "/", route: "/" });
  const chatReadHintAppliedRef = useRef<Set<string>>(new Set());
  const chatUnreadVersionRef = useRef(0);
  const authRedirectInFlightRef = useRef<string | null>(null);
  const currentSessionRef = useRef<NativeSessionIdentity | null>(null);
  const sessionGenerationRef = useRef(0);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const chatBadgeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingLoadInFlightRef = useRef<string | null>(null);
  const lastLoadedOnboardingSessionKeyRef = useRef<string | null>(null);
  const pushRegistrationSessionKeyRef = useRef<string | null>(null);
  const latestRouteRef = useRef<NativeRoute>("/");
  const latestProfileExistsRef = useRef<boolean | null>(null);
  const latestOnboardingRef = useRef<NativeOnboardingSnapshot | null>(null);

  latestRouteRef.current = route;
  latestProfileExistsRef.current = onboarding?.profileExists ?? null;
  latestOnboardingRef.current = onboarding;

  const activateSession = useCallback((nextSession: Session, phase = "session") => {
    const nextIdentity = getNativeSessionIdentity(nextSession);
    const isNewActiveUserSession = Boolean(nextIdentity) && !isSameNativeSessionUser(currentSessionRef.current, nextIdentity);
    let nextGeneration = sessionGenerationRef.current;
    if (isNewActiveUserSession) {
      nextGeneration += 1;
      sessionGenerationRef.current = nextGeneration;
      setSessionGeneration(nextGeneration);
      void clearNativeSignupDraft();
    }
    if (!isSameNativeSessionUser(currentSessionRef.current, nextIdentity)) {
      setOnboarding(null);
      setOnboardingError("");
      lastLoadedOnboardingSessionKeyRef.current = null;
    }
    currentSessionRef.current = nextIdentity;
    setSession(nextSession);
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
    if (__DEV__) {
      console.log("NATIVE_AUTH_CLEAR_SESSION", {
        reason,
        event,
      });
    }
    currentSessionRef.current = null;
    onboardingLoadInFlightRef.current = null;
    lastLoadedOnboardingSessionKeyRef.current = null;
    setSession(null);
    setOnboarding(null);
    setOnboardingError("");
  }, []);

  const isCurrentSession = useCallback((expected: NativeSessionIdentity | null) => {
    return isSameNativeSessionIdentity(currentSessionRef.current, expected);
  }, []);

  const loadOnboarding = useCallback(async (nextSession: Session, options?: LoadOnboardingOptions) => {
    const expected = getNativeSessionIdentity(nextSession);
    if (!expected || !isCurrentSession(expected)) return;
    const loadKey = createNativeSessionKey(expected.userId, sessionGenerationRef.current);
    if (!options?.force && lastLoadedOnboardingSessionKeyRef.current === loadKey) return;
    if (onboardingLoadInFlightRef.current === loadKey) return;
    onboardingLoadInFlightRef.current = loadKey;
    setOnboardingLoading(true);
    if (!latestOnboardingRef.current) setOnboardingError("");
    try {
      let result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
      if (!isCurrentSession(expected)) return;
      if (result.error || !result.data) {
        result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
      }
      if (!isCurrentSession(expected)) return;
      if (result.error || !result.data) {
        await wait(BOOT_SNAPSHOT_RETRY_DELAY_MS);
        if (!isCurrentSession(expected)) return;
        result = await fetchNativeOnboardingSnapshotWithToken(expected.accessToken);
      }
      if (!isCurrentSession(expected)) return;

      if (result.error || !result.data) {
        console.warn("Native onboarding snapshot unavailable", { userId: expected.userId, error: result.error });
        if (!latestOnboardingRef.current) {
          setOnboardingError(BOOT_RECOVERABLE_COPY);
        }
        return;
      }

      setOnboarding(result.data);
      lastLoadedOnboardingSessionKeyRef.current = loadKey;
      setOnboardingError("");
      if (__DEV__) {
        console.log("NATIVE_ONBOARDING_SNAPSHOT_SUCCESS", {
          userId: expected.userId,
          profileExists: result.data.profileExists,
          ownsPets: result.data.ownsPets,
          activePetCount: result.data.activePetCount,
        });
      }
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
        const { data } = await supabase.auth.getSession();
        const nextSession = data.session ?? null;
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
        const { data: userData, error } = await supabase.auth.getUser(sessionForBoot.access_token);
        if (!alive) return;
        if (!isCurrentSession(identityForBoot)) return;
        if (error) {
          if (isInvalidAuthTokenError(error)) {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession(sessionForBoot);
            if (!alive) return;
            if (refreshError || !refreshed.session) {
              clearSessionState("get_user_refresh_failed", "INITIAL_SESSION");
              await supabase.auth.signOut();
              return;
            }

            sessionForBoot = refreshed.session;
            const refreshedIdentity = getNativeSessionIdentity(sessionForBoot);
            if (!refreshedIdentity) {
              clearSessionState("get_user_refresh_missing_identity", "INITIAL_SESSION");
              await supabase.auth.signOut();
              return;
            }
            identityForBoot = refreshedIdentity;
            currentSessionRef.current = identityForBoot;

            const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.getUser(sessionForBoot.access_token);
            if (!alive) return;
            if (!isCurrentSession(identityForBoot)) return;
            if (refreshedUserError || refreshedUserData.user?.id !== sessionForBoot.user.id) {
              clearSessionState("get_user_invalid_after_refresh", "INITIAL_SESSION");
              await supabase.auth.signOut();
              return;
            }
            activateSession(sessionForBoot, "cold_boot_refreshed");
            return;
          }
          console.warn("Native auth token validation unavailable; keeping current session", { userId: identityForBoot.userId, error });
          activateSession(sessionForBoot, "cold_boot_get_user_unavailable");
          return;
        }
        if (userData.user?.id !== sessionForBoot.user.id) {
          clearSessionState("get_user_mismatch", "INITIAL_SESSION");
          await supabase.auth.signOut();
          return;
        }
        activateSession(sessionForBoot, "cold_boot");
      } finally {
        if (alive) setAuthBootChecked(true);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
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
        }
        return;
      }
      activateSession(nextSession, "auth_state_change");
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [activateSession, clearSessionState, isCurrentSession]);

  const handleAuthRedirectUrl = useCallback(async (url: string | null | undefined) => {
    if (!isNativeAuthRedirectUrl(url)) return;
    const rawUrl = String(url || "");
    if (authRedirectInFlightRef.current === rawUrl) return;
    authRedirectInFlightRef.current = rawUrl;
    try {
      const result = await consumeNativeSupabaseAuthRedirect(rawUrl);
      if (!result.ok) {
        console.warn("Native auth callback failed", result.error);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) {
        activateSession(data.session, "auth_redirect");
        await loadOnboarding(data.session);
        const nextPath = result.type === "recovery" ? result.next || "/" : "/";
        const expected = getNativeSessionIdentity(data.session);
        if (!isCurrentSession(expected)) return;
        setRoutePath(nextPath);
        setRoute(normalizePath(nextPath));
      }
    } finally {
      authRedirectInFlightRef.current = null;
    }
  }, [activateSession, isCurrentSession, loadOnboarding]);

  const handleInboundUrl = useCallback((url: string | null | undefined) => {
    if (isNativeAuthRedirectUrl(url)) {
      void handleAuthRedirectUrl(url);
      return;
    }
    const path = nativePathFromInboundUrl(url);
    if (path) setPendingInboundPath(path);
  }, [handleAuthRedirectUrl]);

  useEffect(() => {
    void Linking.getInitialURL().then(handleInboundUrl);
    const subscription = Linking.addEventListener("url", (event) => {
      handleInboundUrl(event.url);
    });
    return () => {
      subscription.remove();
    };
  }, [handleInboundUrl]);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const path = nativePathFromNotificationResponse(response);
      if (path) setPendingInboundPath(path);
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = nativePathFromNotificationResponse(response);
      if (path) setPendingInboundPath(path);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const userId = session?.user?.id ?? null;
  const sessionKey = userId ? createNativeSessionKey(userId, sessionGeneration) : null;

  useEffect(() => {
    if (!userId || !session?.access_token || !sessionKey) return;
    if (pushRegistrationSessionKeyRef.current === sessionKey) return;
    pushRegistrationSessionKeyRef.current = sessionKey;
    void registerNativePushForSession(userId, session.access_token).catch((error) => {
      pushRegistrationSessionKeyRef.current = null;
      if (__DEV__) {
        console.warn("NATIVE_PUSH_REGISTRATION_FAILED", {
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    });
  }, [session?.access_token, sessionKey, userId]);

  const refreshNotificationCount = useCallback(async () => {
    if (!userId || !session?.access_token) {
      setNotificationCount(0);
      return;
    }
    const requestSessionKey = sessionKey;
    const cachedCount = requestSessionKey ? await readCachedNativeUnreadNotificationCount(userId, { sessionKey: requestSessionKey }) : null;
    if (cachedCount !== null && sessionKey === requestSessionKey) setNotificationCount(cachedCount);
    try {
      const count = await fetchNativeUnreadNotificationCountWithToken(userId, session.access_token, {
        sessionKey: requestSessionKey,
        cacheWriteGuard: () => sessionKey === requestSessionKey,
      });
      if (sessionKey === requestSessionKey) setNotificationCount(count);
    } catch {
      // Notification badges must not block navigation.
    }
  }, [session?.access_token, sessionKey, userId]);

  const refreshChatUnreadCount = useCallback(async () => {
    if (!userId || !session?.access_token) {
      setChatUnreadCount(0);
      return;
    }
	    const requestSessionKey = sessionKey;
    const requestUnreadVersion = chatUnreadVersionRef.current;
	    try {
	      const count = await fetchNativeChatUnreadTotal(userId, {
        accessToken: session.access_token,
        sessionKey: requestSessionKey,
        force: true,
        cacheWriteGuard: () => sessionKey === requestSessionKey,
      });
	      if (sessionKey === requestSessionKey && chatUnreadVersionRef.current === requestUnreadVersion) setChatUnreadCount(count);
    } catch {
      // Chat badges must not block navigation.
    }
  }, [session?.access_token, sessionKey, userId]);

  useEffect(() => {
    void refreshNotificationCount();
    void refreshChatUnreadCount();
  }, [refreshChatUnreadCount, refreshNotificationCount]);

  useEffect(() => {
    chatReadHintAppliedRef.current.clear();
  }, [routePath]);

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
    const handle = createSingleRealtimeChannel(channelName, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: `user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_chat_invites", filter: `invitee_user_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "group_join_requests" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_members" }, refresh));
    return () => {
      if (chatBadgeRefreshTimerRef.current) {
        clearTimeout(chatBadgeRefreshTimerRef.current);
        chatBadgeRefreshTimerRef.current = null;
      }
      void handle.dispose();
    };
  }, [refreshChatUnreadCount, refreshNotificationCount, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNotificationCount();
      if (state === "active") void refreshChatUnreadCount();
    });
    return () => subscription.remove();
  }, [refreshChatUnreadCount, refreshNotificationCount]);

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

  const onNavigate = useCallback((path: string, options?: NativeNavigateOptions) => {
    if (path.startsWith("/settings") && path.includes("family=1")) {
      setSettingsOverlay(null);
      setSettingsOpen(true);
      setFamilySettingsIntent((current) => current + 1);
      return;
    }
    if (path.startsWith("/notifications")) {
      setNotificationsOpen(true);
      return;
    }
    if (path.startsWith("/support")) {
      setSupportOpen(true);
      return;
    }

    const fromSettings = path.startsWith("/verify-identity") && path.includes("from=settings");
    setVerifyIdentityReturnToSettings(fromSettings);

    const nextRoute = normalizePath(path);
    if (nextRoute === "/legal" && route !== "/legal") {
      legalReturnRouteRef.current = { path: routePath, route };
    }
    if (nextRoute === "/" || nextRoute === "/social" || nextRoute === "/chats" || nextRoute === "/service" || nextRoute === "/map") {
      lastBrowsingRouteRef.current = { path, route: nextRoute };
    }
    setRoutePath(path);
    setRoute(nextRoute);
    if (userId && options?.refreshOnboarding === true) {
      if (session) void loadOnboarding(session, { force: true });
    }
  }, [loadOnboarding, route, routePath, session, userId]);

  useEffect(() => {
    if (!session || !pendingInboundPath) return;
    const path = pendingInboundPath;
    setPendingInboundPath(null);
    onNavigate(path);
  }, [onNavigate, pendingInboundPath, session]);

  const handleSettingsDrawerNavigate = useCallback((path: string) => {
    const resolution = resolveNativeSettingsDrawerNavigation(path);
    if (resolution.closeSettings) setSettingsOpen(false);
    if (resolution.overlay) {
      setSettingsOverlay(resolution.overlay);
      return;
    }
    if (resolution.path) onNavigate(resolution.path);
  }, [onNavigate]);

  const handleSettingsOverlayNavigate = useCallback((path: string) => {
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
      return result.data.profileExists === false;
    }

    console.warn("Native onboarding cancel recheck unavailable", { userId: expected.userId, error: result.error });
    if (!latestOnboardingRef.current) setOnboardingError(BOOT_RECOVERABLE_COPY);
    return false;
  }, [isCurrentSession, session]);

  const confirmCancelSignup = useCallback(async () => {
    if (cancelSignupBusy) return;
    setCancelSignupError("");
    if (!userId || !session?.access_token) {
      setCancelSignupError("We couldn't find an active session. Please sign in again before cancelling signup.");
      return;
    }
    setCancelSignupBusy(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {},
      });
      if (error) throw error;
      setCancelSignupOpen(false);
      await supabase.auth.signOut();
    } catch (error) {
      setCancelSignupError(error instanceof Error ? error.message : "We couldn't cancel signup right now. Please try again.");
    } finally {
      setCancelSignupBusy(false);
    }
  }, [cancelSignupBusy, session?.access_token, userId]);

  const resolvedRoute = resolveNativeBootRoute(session, route, onboarding);

  useEffect(() => {
    if (resolvedRoute.route === "/chat-dialogue" || resolvedRoute.route === "/service-chat" || resolvedRoute.route === "/chats") {
      void refreshChatUnreadCount();
    }
  }, [refreshChatUnreadCount, resolvedRoute.route, routePath]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("NATIVE_ROUTE_CHANGE", { route: resolvedRoute.route, routePath, userId });
    if (resolvedRoute.route === "/edit-profile" || resolvedRoute.route === "/set-profile") {
      console.log("NATIVE_EDIT_PROFILE_ROUTE_PROPS", {
        userId,
        hasInitialSession: Boolean(session),
        initialSessionUserId: session?.user?.id ?? null,
        hasAccessToken: Boolean(session?.access_token),
        hasRefreshToken: Boolean(session?.refresh_token),
      });
    }
  }, [resolvedRoute.route, routePath, session, userId]);

  if (!authBootChecked) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia mode="loading" />
      </View>
    );
  }

  if (resolvedRoute.route === "auth" || !session || !userId) {
    if (route === "/signup") {
      return (
        <View style={styles.root}>
          <NativeSignupScreen
            onCancel={() => setRoute("/")}
            onOpenWebPath={(path) => { setRoutePath(path); setRoute(normalizePath(path)); }}
            onSignedIn={(nextSession, nextPath) => {
              const nextRoute = normalizePath(nextPath);
              activateSession(nextSession, "fresh_login_signed_in");
              setRoutePath(nextPath);
              setRoute(nextRoute);
              void loadOnboarding(nextSession);
            }}
          />
        </View>
      );
    }

    return (
      <View style={styles.root}>
        <NativeAuthScreen
          onAuthenticated={(nextSession) => {
            activateSession(nextSession, "fresh_login_authenticated");
            setRoutePath("/");
            setRoute("/");
            void loadOnboarding(nextSession);
          }}
          onCreateAccount={() => setRoute("/signup")}
        />
      </View>
    );
  }

  if ((onboardingLoading || resolvedRoute.needsOnboardingSnapshot) && !onboardingError) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia mode="loading" />
      </View>
    );
  }

  if (onboardingError) {
    return (
      <View style={styles.root}>
        <NativeBootBrandMedia
          mode="recoverable"
          onRetry={() => {
            if (session) void loadOnboarding(session);
          }}
          onBackToLogin={() => {
            void supabase.auth.signOut();
          }}
        />
      </View>
    );
  }

  const effectiveRoute = resolvedRoute.route;
  const verifyIdentityFromOnboarding = onboarding?.profileExists === false;

  const routeParams = new URLSearchParams(routePath.split("?")[1] || "");
  const activePetId = routeParams.get("id");

  const screen =
    effectiveRoute === "/verify-identity" ? (
      <NativeVerifyIdentityScreen
        initialSession={session}
        sessionKey={sessionKey}
        userId={userId}
        hideProfileFooter={verifyIdentityReturnToSettings}
        onBack={() => {
          if (verifyIdentityFromOnboarding) {
            void confirmNoProfileBeforeCancelSignup().then((confirmedNoProfile) => {
              if (confirmedNoProfile) setCancelSignupOpen(true);
            });
            return;
          }
          const previous = lastBrowsingRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
          if (verifyIdentityReturnToSettings) {
            setVerifyIdentityReturnToSettings(false);
            setSettingsOpen(true);
          }
        }}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/set-profile" ? (
      <NativeEditProfileRoute
        accessToken={session.access_token}
        initialSession={session}
        mode="onboarding"
        sessionKey={sessionKey}
        userId={userId}
        onNavigate={onNavigate}
        onGoBack={() => setRoute("/verify-identity")}
      />
    ) : effectiveRoute === "/set-pet" ? (
      <NativeSetPetScreen
        accessToken={session.access_token}
        onboardingMode
        userId={userId}
        onNavigate={onNavigate}
        onGoBack={() => setRoute("/set-profile")}
      />
    ) : effectiveRoute === "/social" ? (
      <NativeSocialScreen
        userId={userId}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        onNavigate={onNavigate}
        onScrollTopRef={socialScrollTopRef}
      />
    ) : effectiveRoute === "/service-chat" ? (
      <NativeServiceChatScreen
        key={routePath}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        search={routePath.split("?")[1] || ""}
        userId={userId}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/chat-dialogue" ? (
      <NativeChatDialogueScreen
        key={routePath}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        userId={userId}
        search={routePath.split("?")[1] || ""}
        onNavigate={onNavigate}
        onRoomRead={(roomId, unreadHint) => {
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
      <NativeChatsScreen
        accessToken={session.access_token}
        sessionKey={sessionKey}
        userId={userId}
        search={routePath.startsWith("/chats?") ? routePath.split("?")[1] : "tab=discover"}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/service" ? (
      <NativeServiceScreen userId={userId} accessToken={session.access_token} sessionKey={sessionKey} onNavigate={onNavigate} />
    ) : effectiveRoute === "/map" ? (
      <NativeMapScreen
        accessToken={session.access_token}
        sessionKey={sessionKey}
        userId={userId}
        search={routePath.startsWith("/map?") ? routePath.split("?")[1] : ""}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/security-settings" ? (
      <NativeSecuritySettingsScreen initialSession={session} onBack={() => setRoute("/profile")} />
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
          const previous = lastBrowsingRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
        }}
        onGoBack={() => {
          const previous = lastBrowsingRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
        }}
        onClose={() => {
          const previous = lastBrowsingRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
        }}
      />
    ) : effectiveRoute === "/carerprofile" ? (
      <NativeCarerProfileRoute
        userId={userId}
        session={session}
        initialSession={session}
        onNavigate={onNavigate}
        onBack={() => setRoute("/profile")}
        onGoBack={() => setRoute("/profile")}
        onClose={() => setRoute("/profile")}
      />
    ) : effectiveRoute === "/edit-profile" ? (
      <NativeEditProfileRoute
        accessToken={session.access_token}
        initialSession={session}
        mode="edit"
        sessionKey={sessionKey}
        userId={userId}
        onNavigate={onNavigate}
        onGoBack={() => {
          const previous = lastBrowsingRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
        }}
      />
    ) : effectiveRoute === "/pet-details" ? (
      <NativePetDetailsScreen
        accessToken={session.access_token}
        petId={activePetId}
        sessionKey={sessionKey}
        userId={userId}
        onNavigate={onNavigate}
      />
    ) : effectiveRoute === "/edit-pet-profile" ? (
      <NativeSetPetScreen
        accessToken={session.access_token}
        onboardingMode={false}
        petId={activePetId}
        userId={userId}
        onNavigate={onNavigate}
        onGoBack={() => activePetId ? onNavigate(`/pet-details?id=${activePetId}`) : setRoute("/profile")}
      />
    ) : effectiveRoute === "/legal" ? (
      <NativeLegalRoute
        path={routePath}
        onClose={() => {
          const previous = legalReturnRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
        }}
      />
    ) : effectiveRoute === "/profile" ? (
      <NativeProfileSummaryScreen
        userId={userId}
        accessToken={session.access_token}
        sessionKey={sessionKey}
        onBack={() => {
          const previous = lastBrowsingRouteRef.current;
          setRoutePath(previous.path);
          setRoute(previous.route);
          setSettingsOpen(true);
        }}
        onNavigate={onNavigate}
        onSignOut={() => void supabase.auth.signOut()}
      />
    ) : (
      <NativeHomeScreen
        userId={userId}
        accessToken={session.access_token}
        sessionGeneration={sessionGeneration}
        sessionKey={sessionKey}
        onNavigate={onNavigate}
      />
    );

  const isMainChromeRoute = effectiveRoute === "/" || effectiveRoute === "/social" || effectiveRoute === "/chats" || effectiveRoute === "/service" || effectiveRoute === "/map";
  const isSettingsChromeRoute = effectiveRoute === "/edit-profile" || effectiveRoute === "/pet-details" || effectiveRoute === "/edit-pet-profile" || effectiveRoute === "/legal" || effectiveRoute === "/carerprofile" || effectiveRoute === "/premium";
  const canShowChrome = onboarding?.profileExists === true;
  const showBottomNav = canShowChrome && isMainChromeRoute;
  const showGlobalChrome = canShowChrome && (isMainChromeRoute || isSettingsChromeRoute);
  const homeHeaderOffset = huddleLayout.headerHeight + huddleSpacing.x3;

  return (
    <View style={styles.root}>
      <View style={[styles.screenHost, showGlobalChrome && effectiveRoute !== "/map" ? { paddingTop: homeHeaderOffset } : null]}>
        {screen}
      </View>
      {showGlobalChrome ? (
        <NativeGlobalHeader
          notificationCount={notificationCount}
          onLogoPress={() => onNavigate("/")}
          onNotificationsPress={() => setNotificationsOpen(true)}
          onSettingsPress={() => setSettingsOpen(true)}
          showSettings
        />
      ) : null}
      {showBottomNav ? <NativeBottomNav activeTab={tabForPath(effectiveRoute)} chatUnreadCount={chatUnreadCount} onNavigate={onNavigate} onReselect={handleTabReselect} /> : null}
      {settingsOverlay === "account" ? (
        <View style={styles.settingsOverlayHost}>
          <NativeProfileSummaryScreen
            userId={userId}
            accessToken={session.access_token}
            sessionKey={sessionKey}
            onBack={() => {
              setSettingsOverlay(null);
              setSettingsOpen(true);
            }}
            onNavigate={handleSettingsOverlayNavigate}
            onSignOut={() => {
              setSettingsOverlay(null);
              setSettingsOpen(false);
              void supabase.auth.signOut();
            }}
          />
        </View>
      ) : null}
      {showGlobalChrome || settingsOpen ? (
        <NativeSettingsDrawer
          accessToken={session.access_token}
          openFamilyIntent={familySettingsIntent}
          open={settingsOpen}
          sessionKey={sessionKey}
          userId={userId}
          onClose={() => setSettingsOpen(false)}
          onOpen={() => setSettingsOpen(true)}
          onNavigate={handleSettingsDrawerNavigate}
          onOpenSupport={() => setSupportOpen(true)}
          onSignOut={() => {
            setSettingsOpen(false);
            void supabase.auth.signOut();
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
        onNavigate={onNavigate}
      />
      <Modal animationType="fade" onRequestClose={() => setSupportOpen(false)} transparent visible={supportOpen}>
        <View style={styles.supportModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSupportOpen(false)} />
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.supportModalCard}>
            <Pressable
              accessibilityLabel="Close support modal"
              accessibilityRole="button"
              onPress={() => setSupportOpen(false)}
              style={styles.supportModalClose}
            >
              <Text style={styles.supportModalCloseText}>×</Text>
            </Pressable>
            <NativeSupportScreen
              accessToken={session.access_token}
              accountEmail={session.user.email ?? null}
              onCancel={() => setSupportOpen(false)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  settingsOverlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    backgroundColor: huddleColors.canvas,
  },
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  screenHost: {
    flex: 1,
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
  bootLogoFallbackImage: {
    position: "absolute",
    width: BOOT_LOGO_MEDIA_SIZE,
    height: BOOT_LOGO_MEDIA_SIZE,
  },
  bootLogoVideoClip: {
    position: "absolute",
    width: BOOT_LOGO_MEDIA_SIZE,
    height: BOOT_LOGO_MEDIA_SIZE,
    overflow: "hidden",
    backgroundColor: huddleColors.canvas,
  },
  bootLogoVideo: {
    position: "absolute",
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    backgroundColor: huddleColors.canvas,
  },
  bootLogoVideoLoading: {
    opacity: 0,
  },
  bootRecoverableContent: {
    width: "100%",
    maxWidth: 340,
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
  bootRecoverableActions: {
    width: "100%",
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
  legalRoute: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  legalCloseButton: {
    position: "absolute",
    top: huddleLayout.headerHeight + huddleSpacing.x2,
    right: huddleSpacing.x4,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.mutedCanvas,
  },
  legalCloseText: {
    fontFamily: "Urbanist-600",
    fontSize: 26,
    lineHeight: 30,
    color: huddleColors.iconMuted,
  },
  legalContent: {
    paddingTop: huddleLayout.headerHeight + huddleSpacing.x5,
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
    borderRadius: huddleRadii.field,
  },
  registeredDestructiveLabel: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  registeredCancelButton: {
    flex: 1,
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    borderRadius: huddleRadii.field,
  },
  registeredCancelLabel: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  pressed: huddleButtons.pressed,
  disabled: huddleButtons.disabled,
});
