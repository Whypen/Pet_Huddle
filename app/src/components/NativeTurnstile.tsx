import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { NativeTurnstileAction } from "../lib/nativeTurnstile";
import { createNativeTurnstileSource } from "../lib/nativeTurnstile";
import { huddleColors, huddleFieldStates, huddleType } from "../theme/huddleDesignTokens";

type NativeTurnstileMessage = {
  type?: string;
  token?: string;
  message?: string;
};

type NativeTurnstileProps = {
  action: NativeTurnstileAction;
  error?: boolean;
  compact?: boolean;
  hidden?: boolean;
  siteKey: string;
  onError: (message: string) => void;
  onToken: (token: string) => void;
};

const turnstileUserCopy = (value: unknown) => {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("not configured")) return "Security check is unavailable. Please update the app.";
  if (raw.includes("timed out") || raw.includes("timeout")) return "Security check timed out. Try again.";
  if (raw.includes("expired")) return "Security check expired. Try again.";
  if (raw.includes("network") || raw.includes("fetch")) return "Security check could not connect. Check your connection.";
  return "Security check failed to load. Try again.";
};

export function NativeTurnstile({ action, compact = false, error = false, hidden = false, siteKey, onError, onToken }: NativeTurnstileProps) {
  const [rendered, setRendered] = useState(false);
  const source = useMemo(() => createNativeTurnstileSource(siteKey, action, hidden), [action, hidden, siteKey]);

  const handleMessage = useCallback((rawMessage: string) => {
    let payload: NativeTurnstileMessage = {};
    try {
      payload = JSON.parse(rawMessage) as NativeTurnstileMessage;
    } catch {
      payload = {};
    }

    if (payload.type === "turnstile-rendered") {
      setRendered(true);
      return;
    }

    if (payload.type === "turnstile-token") {
      const token = String(payload.token || "").trim();
      onToken(token);
      return;
    }

    if (payload.type === "turnstile-expired") {
      onToken("");
      onError("Security check expired. Try again.");
      return;
    }

    if (payload.type === "turnstile-error") {
      const message = turnstileUserCopy(payload.message);
      onToken("");
      onError(message);
    }
  }, [onError, onToken]);

  return (
    <View
      pointerEvents={hidden ? "none" : "auto"}
      style={[
        styles.box,
        compact ? styles.boxCompact : null,
        hidden ? styles.boxHidden : null,
        error && !hidden ? styles.boxError : null,
      ]}
    >
      {siteKey ? <WebView
        bounces={false}
        cacheEnabled
        containerStyle={styles.container}
        domStorageEnabled
        javaScriptEnabled
        onMessage={(event) => handleMessage(event.nativeEvent.data)}
        originWhitelist={["*"]}
        scrollEnabled={false}
        sharedCookiesEnabled
        source={source}
        style={[styles.webView, compact ? styles.webViewCompact : null, hidden ? styles.webViewHidden : null]}
        thirdPartyCookiesEnabled
      /> : null}
      {!hidden && !siteKey ? <Text style={styles.unavailable}>Security check is unavailable. Please update the app.</Text> : null}
      {!hidden && siteKey && !rendered ? <Text style={styles.status}>Preparing verification…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 72,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  boxCompact: {
    minHeight: 76,
    overflow: "hidden",
  },
  boxHidden: {
    height: 1,
    minHeight: 1,
    maxHeight: 1,
    overflow: "hidden",
    opacity: 0,
  },
  boxError: {
    ...huddleFieldStates.error,
  },
  container: {
    backgroundColor: "transparent",
  },
  webView: {
    height: 72,
    backgroundColor: "transparent",
  },
  webViewCompact: {
    height: 76,
    transform: [{ scale: 0.86 }],
    width: "116%",
    marginLeft: "-8%",
  },
  webViewHidden: {
    height: 1,
    width: 1,
  },
  status: {
    position: "absolute",
    left: 14,
    bottom: 8,
    color: huddleColors.mutedText,
    fontSize: huddleType.helper,
    fontWeight: "600",
  },
  unavailable: {
    color: huddleColors.validationRed,
    fontSize: huddleType.helper,
    fontWeight: "600",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
