import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { WebView } from "react-native-webview";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../theme/tokens";

const SHELL_URL = "https://huddle.pet";
const ALLOWED_HOSTS = new Set(["huddle.pet", "www.huddle.pet"]);

// Phase 0 ownership marker:
// this screen is part of the fallback hybrid path in `/mobile`.
// it is intentionally kept intact while `/app` becomes the active native workspace.

type BridgeMessage =
  | {
      type?: string;
      url?: string;
    }
  | null;

function isAllowedShellHost(url: string) {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function shouldOpenOutside(url: string) {
  if (!url) return false;
  if (url === "about:blank" || url.startsWith("javascript:") || url.startsWith("data:")) return false;
  if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("sms:")) return true;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return !isAllowedShellHost(url);
  }
  return true;
}

export function WebShellScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const shellUri = useMemo(() => SHELL_URL, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });

    return () => subscription.remove();
  }, [canGoBack]);

  const handleExternalOpen = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Keep the shell stable even if the OS cannot open the target.
    }
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: BridgeMessage = null;

      try {
        payload = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        payload = null;
      }

      if (!payload || typeof payload.type !== "string") return;

      if (payload.type === "huddle-open-external-url" && typeof payload.url === "string") {
        void handleExternalOpen(payload.url);
      }
    },
    [handleExternalOpen],
  );

  const handleNavigationStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
  }, []);

  const handleRetry = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    setReloadKey((current) => current + 1);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: COLORS.white, paddingTop: insets.top ? 0 : 12 }}>
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ uri: shellUri }}
          onMessage={handleMessage}
          onLoadStart={() => {
            setLoading(true);
            setLoadError(null);
          }}
          onLoadEnd={() => {
            setLoading(false);
          }}
          onError={(event) => {
            setLoading(false);
            setLoadError(event.nativeEvent.description || "Failed to load Huddle.");
          }}
          onHttpError={(event) => {
            setLoading(false);
            setLoadError(`HTTP ${event.nativeEvent.statusCode}`);
          }}
          onNavigationStateChange={handleNavigationStateChange}
          onShouldStartLoadWithRequest={(request) => {
            if (shouldOpenOutside(request.url)) {
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
          style={{ flex: 1, backgroundColor: COLORS.white }}
        />

        {loading ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.94)",
              gap: 12,
            }}
          >
            <ActivityIndicator size="small" color={COLORS.brandBlue} />
            <Text style={{ color: COLORS.brandText, fontSize: 14, fontWeight: "600" }}>Loading Huddle…</Text>
          </View>
        ) : null}

        {loadError ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
              backgroundColor: COLORS.white,
              gap: 14,
            }}
          >
            <Text style={{ color: COLORS.brandText, fontSize: 18, fontWeight: "700", textAlign: "center" }}>
              Huddle couldn&apos;t load
            </Text>
            <Text style={{ color: "rgba(66,73,101,0.72)", fontSize: 14, lineHeight: 20, textAlign: "center" }}>
              {loadError}
            </Text>
            <Pressable
              onPress={handleRetry}
              style={{
                minWidth: 132,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: COLORS.brandBlue,
                paddingHorizontal: 18,
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
