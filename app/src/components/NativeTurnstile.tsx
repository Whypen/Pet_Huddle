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
  siteKey: string;
  onError: (message: string) => void;
  onToken: (token: string) => void;
};

export function NativeTurnstile({ action, compact = false, error = false, siteKey, onError, onToken }: NativeTurnstileProps) {
  const [rendered, setRendered] = useState(false);
  const source = useMemo(() => createNativeTurnstileSource(siteKey, action), [action, siteKey]);

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
      onError("Verification expired. Please complete it again.");
      return;
    }

    if (payload.type === "turnstile-error") {
      onToken("");
      onError(payload.message || "Verification failed to load. Please retry.");
    }
  }, [onError, onToken]);

  return (
    <View style={[styles.box, compact ? styles.boxCompact : null, error ? styles.boxError : null]}>
      <WebView
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
        style={[styles.webView, compact ? styles.webViewCompact : null]}
        thirdPartyCookiesEnabled
      />
      {!rendered ? <Text style={styles.status}>Preparing verification…</Text> : null}
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
  status: {
    position: "absolute",
    left: 14,
    bottom: 8,
    color: huddleColors.mutedText,
    fontSize: huddleType.helper,
    fontWeight: "600",
  },
});
