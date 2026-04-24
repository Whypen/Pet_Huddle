import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { SafeAreaView } from "react-native-safe-area-context";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { WebView } from "react-native-webview";
import { NativePageHeader } from "../components/NativePageHeader";

const SHELL_URL = "https://huddle.pet";
const ALLOWED_HOSTS = new Set(["huddle.pet", "www.huddle.pet"]);
const APP_SCHEME = "huddle:";
const MAX_BRIDGE_FILE_BYTES = 20 * 1024 * 1024;
const APPROVED_NATIVE_CHROME_ROUTES = {
  "/support": {
    title: "Help & Support",
    nativeContentOnly: true,
  },
  "/privacy-choices": {
    title: "Your Privacy Choices",
    nativeContentOnly: true,
  },
} as const;

type ApprovedNativeRoutePath = keyof typeof APPROVED_NATIVE_CHROME_ROUTES;
const BRIDGE_BOOTSTRAP_SCRIPT = `
  (function () {
    if (window.__HUDDLE_NATIVE_BRIDGE_INSTALLED__) return true;
    window.__HUDDLE_NATIVE_BRIDGE_INSTALLED__ = true;
    window.__HUDDLE_NATIVE_SHELL__ = true;
    window.__HUDDLE_NATIVE_APPROVED_ROUTES__ = ${JSON.stringify(APPROVED_NATIVE_CHROME_ROUTES)};

    var getApprovedRouteMeta = function () {
      try {
        var map = window.__HUDDLE_NATIVE_APPROVED_ROUTES__ || {};
        var route = map[window.location.pathname];
        return route && route.nativeContentOnly ? route : null;
      } catch (error) {
        return null;
      }
    };

    try {
      Object.defineProperty(window, "__HUDDLE_NATIVE_CONTENT_ONLY__", {
        configurable: true,
        get: function () {
          var route = getApprovedRouteMeta();
          return route ? true : false;
        }
      });
    } catch (error) {}

    var notifyNativeRouteMeta = function () {
      try {
        if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== "function") return;
        var route = getApprovedRouteMeta();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "huddle-route-meta",
          pathname: window.location.pathname,
          title: route && typeof route.title === "string" ? route.title : null,
          nativeHeaderVisible: Boolean(route),
          nativeBottomNavVisible: false
        }));
      } catch (error) {}
    };

    var wrapHistoryMethod = function (methodName) {
      var original = window.history[methodName];
      if (typeof original !== "function") return;
      window.history[methodName] = function () {
        var result = original.apply(window.history, arguments);
        notifyNativeRouteMeta();
        return result;
      };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");
    window.addEventListener("popstate", notifyNativeRouteMeta);
    window.addEventListener("hashchange", notifyNativeRouteMeta);
    notifyNativeRouteMeta();

    var pendingShares = {};

    var makeRequestId = function () {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
      } catch (error) {}
      return "share-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    };

    var makeAbortError = function (message) {
      try {
        return new DOMException(message || "Share canceled", "AbortError");
      } catch (error) {
        var fallback = new Error(message || "Share canceled");
        fallback.name = "AbortError";
        return fallback;
      }
    };

    var handleShareResult = function (payload) {
      if (!payload || payload.type !== "huddle-native-share-result" || typeof payload.requestId !== "string") return;
      var pending = pendingShares[payload.requestId];
      if (!pending) return;
      delete pendingShares[payload.requestId];
      if (payload.completed) {
        pending.resolve();
        return;
      }
      if (payload.canceled) {
        pending.reject(makeAbortError(payload.error || "Share canceled"));
        return;
      }
      pending.reject(new Error(payload.error || "native_share_failed"));
    };

    window.addEventListener("huddle:native-message", function (event) {
      handleShareResult(event.detail);
    });
    window.addEventListener("message", function (event) {
      handleShareResult(event.data);
    });

    try {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: function (data) {
          return new Promise(function (resolve, reject) {
            var requestId = makeRequestId();
            pendingShares[requestId] = { resolve: resolve, reject: reject };
            try {
              if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== "function") {
                delete pendingShares[requestId];
                reject(new Error("native_share_unavailable"));
                return;
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: "huddle-share-sheet",
                requestId: requestId,
                title: data && typeof data.title === "string" ? data.title : undefined,
                text: data && typeof data.text === "string" ? data.text : undefined,
                url: data && typeof data.url === "string" ? data.url : undefined
              }));
            } catch (error) {
              delete pendingShares[requestId];
              reject(error instanceof Error ? error : new Error("native_share_unavailable"));
            }
          });
        }
      });
    } catch (error) {}

    if (typeof navigator.canShare !== "function") {
      try {
        Object.defineProperty(navigator, "canShare", {
          configurable: true,
          value: function () {
            return true;
          }
        });
      } catch (error) {}
    }

    return true;
  })();
`;

type WebBridgeMessage =
  | {
      type?: string;
      requestId?: string;
      url?: string;
      context?: string;
      forcePrompt?: boolean;
      title?: string;
      text?: string;
      accept?: string;
      multiple?: boolean;
      source?: "any" | "camera" | "photo-library";
      pathname?: string;
      nativeHeaderVisible?: boolean;
      nativeBottomNavVisible?: boolean;
    }
  | null;

type NativeBridgePayload =
  | {
      type: "huddle-native-link";
      url: string;
    }
  | {
      type: "huddle-native-resume";
    }
  | {
      type: "huddle-native-files";
      requestId: string;
      files?: NativePickedFile[];
      error?: string;
    }
  | {
      type: "huddle-native-push-registration";
      requestId: string;
      granted: boolean;
      denied?: boolean;
      token: string | null;
      platform: "ios" | "android" | "web";
      error?: string;
    }
  | {
      type: "huddle-native-share-result";
      requestId: string;
      completed?: boolean;
      canceled?: boolean;
      error?: string;
    }
  | {
      type: "huddle-route-meta";
      pathname: string;
      title: string | null;
      nativeHeaderVisible: boolean;
      nativeBottomNavVisible: boolean;
    };

type NativePushRegistrationPayload = Extract<NativeBridgePayload, { type: "huddle-native-push-registration" }>;

type NativeRouteChrome = {
  pathname: string;
  title: string | null;
  nativeHeaderVisible: boolean;
  nativeBottomNavVisible: boolean;
};

function pathnameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
    return parsed.pathname || "/";
  } catch {
    return null;
  }
}

function approvedNativeChromeForUrl(url: string): NativeRouteChrome {
  const pathname = pathnameFromUrl(url) || "/";
  const approved = pathname in APPROVED_NATIVE_CHROME_ROUTES
    ? APPROVED_NATIVE_CHROME_ROUTES[pathname as ApprovedNativeRoutePath]
    : null;

  return {
    pathname,
    title: approved?.title ?? null,
    nativeHeaderVisible: Boolean(approved),
    nativeBottomNavVisible: false,
  };
}

type NativePickedFile = {
  name?: string | null;
  type?: string | null;
  base64?: string | null;
  lastModified?: number | null;
};

function parseAcceptList(accept?: string) {
  return String(accept || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isMediaOnlyAccept(accept?: string) {
  const list = parseAcceptList(accept);
  if (list.length === 0) return false;
  return list.every((entry) => entry.startsWith("image/") || entry.startsWith("video/"));
}

function requestedMediaTypes(accept?: string): Array<ImagePicker.MediaType> {
  const list = parseAcceptList(accept);
  if (list.some((entry) => entry.startsWith("video/")) && !list.some((entry) => entry.startsWith("image/"))) {
    return ["videos"];
  }
  if (list.some((entry) => entry.startsWith("image/")) && !list.some((entry) => entry.startsWith("video/"))) {
    return ["images"];
  }
  return ["images", "videos"];
}

function currentPlatform(): "ios" | "android" | "web" {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return "web";
}

function readProjectId() {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easConfigProjectId = Constants.easConfig?.projectId;
  return typeof easConfigProjectId === "string"
    ? easConfigProjectId
    : typeof expoConfigProjectId === "string"
      ? expoConfigProjectId
      : null;
}

async function toBridgeFile(
  asset: {
    uri?: string | null;
    name?: string | null;
    mimeType?: string | null;
    size?: number | null;
    modifiedAt?: number | null;
  },
  fallbackName: string,
) {
  if (!asset.uri) {
    throw new Error("native_file_uri_missing");
  }

  const fileInfo = await FileSystem.getInfoAsync(asset.uri);
  const fileSize = fileInfo.exists && typeof fileInfo.size === "number" ? fileInfo.size : asset.size ?? null;
  if (typeof fileSize === "number" && fileSize > MAX_BRIDGE_FILE_BYTES) {
    throw new Error("native_file_too_large_for_bridge");
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    name: asset.name || fallbackName,
    type: asset.mimeType || "application/octet-stream",
    base64,
    lastModified: asset.modifiedAt ?? Date.now(),
  } satisfies NativePickedFile;
}

async function pickNativeFiles(options: {
  accept?: string;
  multiple?: boolean;
  source?: "any" | "camera" | "photo-library";
}) {
  const source = options.source || "any";
  const mediaTypes = requestedMediaTypes(options.accept);

  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error("camera_permission_denied");
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes,
      allowsEditing: false,
      quality: 0.6,
      videoMaxDuration: 10,
    });

    if (result.canceled) return [];

    return Promise.all(
      (result.assets || []).map((asset, index) =>
        toBridgeFile(
          {
            uri: asset.uri,
            name: asset.fileName ?? null,
            mimeType: asset.mimeType ?? null,
            size: asset.fileSize ?? null,
          },
          `camera-capture-${index + 1}`,
        ),
      ),
    );
  }

  if (source === "photo-library" || isMediaOnlyAccept(options.accept)) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error("media_library_permission_denied");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: false,
      allowsMultipleSelection: Boolean(options.multiple),
      quality: 0.8,
      selectionLimit: options.multiple ? 0 : 1,
    });

    if (result.canceled) return [];

    return Promise.all(
      (result.assets || []).map((asset, index) =>
        toBridgeFile(
          {
            uri: asset.uri,
            name: asset.fileName ?? null,
            mimeType: asset.mimeType ?? null,
            size: asset.fileSize ?? null,
          },
          `media-selection-${index + 1}`,
        ),
      ),
    );
  }

  const result = await DocumentPicker.getDocumentAsync({
    multiple: Boolean(options.multiple),
    copyToCacheDirectory: true,
    type: parseAcceptList(options.accept).length > 0 ? parseAcceptList(options.accept) : "*/*",
  });

  if (result.canceled) return [];

  return Promise.all(
    (result.assets || []).map((asset, index) =>
      toBridgeFile(
        {
          uri: asset.uri,
          name: asset.name ?? null,
          mimeType: asset.mimeType ?? null,
          size: asset.size ?? null,
          modifiedAt: typeof asset.lastModified === "number" ? asset.lastModified : null,
        },
        `document-selection-${index + 1}`,
      ),
    ),
  );
}

async function registerForPushNotifications(forcePrompt = false): Promise<NativePushRegistrationPayload> {
  const platform = currentPlatform();

  if (!Device.isDevice) {
    return {
      type: "huddle-native-push-registration",
      requestId: "",
      granted: false,
      denied: true,
      token: null,
      platform,
      error: "push_physical_device_required",
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (finalStatus !== "granted" && forcePrompt) {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return {
      type: "huddle-native-push-registration",
      requestId: "",
      granted: false,
      denied: true,
      token: null,
      platform,
    };
  }

  const projectId = readProjectId();
  if (!projectId) {
    return {
      type: "huddle-native-push-registration",
      requestId: "",
      granted: false,
      denied: false,
      token: null,
      platform,
      error: "push_project_id_missing",
    };
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return {
      type: "huddle-native-push-registration",
      requestId: "",
      granted: true,
      token: token.data || null,
      platform,
    };
  } catch (error) {
    return {
      type: "huddle-native-push-registration",
      requestId: "",
      granted: false,
      denied: false,
      token: null,
      platform,
      error: error instanceof Error ? error.message : "push_token_request_failed",
    };
  }
}

function notificationResponseUrl(response: Notifications.NotificationResponse | null) {
  const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
  const candidates = [
    data?.url,
    data?.href,
    data?.path,
    data?.deepLink,
    data?.link,
    data?.route,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return null;
}

function isAllowedShellHost(url: string) {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function isAppLink(url: string) {
  return String(url || "").toLowerCase().startsWith(APP_SCHEME);
}

function shouldOpenOutside(url: string) {
  const normalized = String(url || "").trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return false;
  if (lower.startsWith("about:") || lower.startsWith("javascript:") || lower.startsWith("data:")) return false;
  if (isAppLink(normalized)) return false;
  if (lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("sms:")) return true;
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return !isAllowedShellHost(normalized);
  }
  return true;
}

function isTopFrameRequest(request: { isTopFrame?: boolean }) {
  return request.isTopFrame !== false;
}

function createInjectedBridgeScript(payload: NativeBridgePayload) {
  const serialized = JSON.stringify(payload);
  return `
    (function () {
      var payload = ${serialized};
      try {
        window.dispatchEvent(new CustomEvent("huddle:native-message", { detail: payload }));
      } catch (error) {}
      try {
        window.postMessage(payload, "*");
      } catch (error) {}
      try {
        if (payload.type === "huddle-native-link" && payload.url) {
          window.dispatchEvent(new CustomEvent("huddle:native-link", { detail: { url: payload.url } }));
        }
      } catch (error) {}
      try {
        if (payload.type === "huddle-native-resume") {
          window.dispatchEvent(new CustomEvent("huddle:native-resume"));
        }
      } catch (error) {}
    })();
    true;
  `;
}

export function WebShellScreen() {
  const webViewRef = useRef<WebView>(null);
  const pageReadyRef = useRef(false);
  const pendingPayloadsRef = useRef<NativeBridgePayload[]>([]);
  const lastInboundUrlRef = useRef<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [routeChrome, setRouteChrome] = useState<NativeRouteChrome>(() => approvedNativeChromeForUrl(SHELL_URL));

  const shellUri = useMemo(() => SHELL_URL, []);

  const injectPayload = useCallback((payload: NativeBridgePayload) => {
    const script = createInjectedBridgeScript(payload);
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const queuePayload = useCallback((payload: NativeBridgePayload) => {
    if (!pageReadyRef.current) {
      pendingPayloadsRef.current.push(payload);
      return;
    }

    injectPayload(payload);
  }, [injectPayload]);

  const flushPendingPayloads = useCallback(() => {
    if (!pageReadyRef.current || pendingPayloadsRef.current.length === 0) return;

    const pending = [...pendingPayloadsRef.current];
    pendingPayloadsRef.current = [];
    pending.forEach((payload) => {
      injectPayload(payload);
    });
  }, [injectPayload]);

  const handleExternalOpen = useCallback(async (url: string) => {
    if (!shouldOpenOutside(url)) return;
    try {
      await Linking.openURL(url);
    } catch {
      // Keep the shell stable even when the OS cannot handle the target URL.
    }
  }, []);

  const handleInboundUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    if (lastInboundUrlRef.current === url) return;
    lastInboundUrlRef.current = url;
    queuePayload({
      type: "huddle-native-link",
      url,
    });
  }, [queuePayload]);

  useEffect(() => {
    let active = true;

    void Linking.getInitialURL().then((initialUrl) => {
      if (!active || !initialUrl) return;
      handleInboundUrl(initialUrl);
    });

    const linkingSubscription = Linking.addEventListener("url", (event) => {
      handleInboundUrl(event.url);
    });

    return () => {
      active = false;
      linkingSubscription.remove();
    };
  }, [handleInboundUrl]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      queuePayload({ type: "huddle-native-resume" });
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [queuePayload]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });

    return () => {
      backSubscription.remove();
    };
  }, [canGoBack]);

  useEffect(() => {
    let active = true;

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!active) return;
      handleInboundUrl(notificationResponseUrl(response));
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleInboundUrl(notificationResponseUrl(response));
    });

    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [handleInboundUrl]);

  const handleRetry = useCallback(() => {
    pageReadyRef.current = false;
    pendingPayloadsRef.current = [];
    setLoadError(null);
    setLoading(true);
    setReloadKey((current) => current + 1);
    void Linking.getInitialURL().then((initialUrl) => {
      handleInboundUrl(initialUrl);
    });
  }, [handleInboundUrl]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let payload: WebBridgeMessage = null;

    try {
      payload = JSON.parse(event.nativeEvent.data) as WebBridgeMessage;
    } catch {
      payload = null;
    }

    if (!payload || typeof payload.type !== "string") return;

    if (payload.type === "huddle-open-external-url" && typeof payload.url === "string") {
      void handleExternalOpen(payload.url);
      return;
    }

    if (payload.type === "huddle-pick-files" && typeof payload.requestId === "string") {
      void (async () => {
        try {
          const files = await pickNativeFiles({
            accept: payload.accept,
            multiple: payload.multiple,
            source: payload.source,
          });
          queuePayload({
            type: "huddle-native-files",
            requestId: payload.requestId!,
            files,
          });
        } catch (error) {
          queuePayload({
            type: "huddle-native-files",
            requestId: payload.requestId!,
            error: error instanceof Error ? error.message : "native_file_picker_failed",
          });
        }
      })();
      return;
    }

    if (payload.type === "huddle-request-push-registration" && typeof payload.requestId === "string") {
      void (async () => {
        const response = await registerForPushNotifications(Boolean(payload.forcePrompt));
        queuePayload({
          ...response,
          type: "huddle-native-push-registration",
          requestId: payload.requestId!,
        });
      })();
      return;
    }

    if (payload.type === "huddle-share-sheet" && typeof payload.requestId === "string") {
      void (async () => {
        try {
          const shareContent = [payload.text, payload.url].filter((entry): entry is string => Boolean(entry)).join(" ").trim();
          const result = await Share.share({
            title: payload.title,
            message: shareContent || payload.url || payload.title || "",
            url: payload.url,
          });

          queuePayload({
            type: "huddle-native-share-result",
            requestId: payload.requestId!,
            completed: result.action !== Share.dismissedAction,
            canceled: result.action === Share.dismissedAction,
            error: result.action === Share.dismissedAction ? "share_canceled" : undefined,
          });
        } catch (error) {
          const isAbort = error instanceof Error && error.name === "AbortError";
          queuePayload({
            type: "huddle-native-share-result",
            requestId: payload.requestId!,
            completed: false,
            canceled: isAbort,
            error: error instanceof Error ? error.message : "native_share_failed",
          });
        }
      })();
      return;
    }

    if (payload.type === "huddle-route-meta" && typeof payload.pathname === "string") {
      setRouteChrome({
        pathname: payload.pathname,
        title: typeof payload.title === "string" ? payload.title : null,
        nativeHeaderVisible: payload.nativeHeaderVisible === true,
        nativeBottomNavVisible: payload.nativeBottomNavVisible === true,
      });
    }
  }, [handleExternalOpen, queuePayload]);

  const handleNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    setRouteChrome(approvedNativeChromeForUrl(state.url));
  }, []);

  const handleNativeBack = useCallback(() => {
    if (canGoBack) {
      webViewRef.current?.goBack();
      return;
    }

    webViewRef.current?.injectJavaScript(`
      (function () {
        try {
          window.history.back();
        } catch (error) {}
      })();
      true;
    `);
  }, [canGoBack]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {routeChrome.nativeHeaderVisible && routeChrome.title ? (
          <NativePageHeader onBack={handleNativeBack} title={routeChrome.title} />
        ) : null}
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ uri: shellUri }}
          injectedJavaScriptBeforeContentLoaded={BRIDGE_BOOTSTRAP_SCRIPT}
          onMessage={handleMessage}
          onLoadStart={() => {
            pageReadyRef.current = false;
            setLoading(true);
            setLoadError(null);
          }}
          onLoadEnd={() => {
            pageReadyRef.current = true;
            setLoading(false);
            flushPendingPayloads();
          }}
          onError={(event) => {
            pageReadyRef.current = false;
            setLoading(false);
            setLoadError(event.nativeEvent.description || "Failed to load huddle.pet.");
          }}
          onHttpError={(event) => {
            pageReadyRef.current = false;
            setLoading(false);
            setLoadError(`HTTP ${event.nativeEvent.statusCode}`);
          }}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={(request) => {
            if (isAppLink(request.url)) {
              handleInboundUrl(request.url);
              return false;
            }

            if (isTopFrameRequest(request) && shouldOpenOutside(request.url)) {
              void handleExternalOpen(request.url);
              return false;
            }

            return true;
          }}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          startInLoadingState={false}
          style={styles.webView}
        />

        {loading ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#2f6fed" />
            <Text style={styles.loadingText}>Loading Huddle…</Text>
          </View>
        ) : null}

        {loadError ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Huddle couldn&apos;t load</Text>
            <Text style={styles.errorBody}>{loadError}</Text>
            <Pressable onPress={handleRetry} style={styles.retryButton}>
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: "#1f2937",
  },
  errorOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
    backgroundColor: "#ffffff",
  },
  errorTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4b5563",
    textAlign: "center",
  },
  retryButton: {
    minWidth: 132,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "#2f6fed",
  },
  retryLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
});
