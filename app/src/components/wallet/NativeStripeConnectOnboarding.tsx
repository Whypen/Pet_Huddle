import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { createNativeFunctionHeaders } from "../../lib/nativeFunctionClient";
import { supabaseUrl } from "../../lib/supabase";
import { huddleModalTokens } from "../nativeModalPrimitives.styles";
import { huddleButtons, huddleColors, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../../theme/huddleDesignTokens";

type NativeStripeConnectOnboardingProps = {
  accessToken?: string | null;
  accountId?: string | null;
  userId?: string | null;
  visible?: boolean;
  onReadyStateChange?: (ready: boolean) => void;
  onExit?: () => void;
  onError?: (message: string) => void;
};

type ConnectLinkResponse = {
  url?: string;
  error?: string;
  code?: string;
  detail?: string;
};

const STRIPE_RETURN_URL = "https://huddle.pet/carerprofile/stripe-return";
const STRIPE_REFRESH_URL = "https://huddle.pet/carerprofile/stripe-refresh";

const parseJsonResponse = async <T,>(response: Response): Promise<T> => {
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as T & { code?: string; detail?: string; error?: string; message?: string } : {} as T & { code?: string; detail?: string; error?: string; message?: string };
  if (!response.ok) {
    throw new Error([parsed.code, parsed.error, parsed.detail, parsed.message, `wallet_http_${response.status}`].filter(Boolean).join(": "));
  }
  return parsed as T;
};

const walletErrorCopy = (error: unknown) => {
  const raw = String(error instanceof Error ? error.message : error || "").toLowerCase();
  if (raw.includes("unauthorized") || raw.includes("missing_access_token")) return "Please sign in again before setting up wallet.";
  if (raw.includes("profile_missing")) return "Finish your profile before setting up wallet.";
  if (raw.includes("wallet_link_unavailable")) return "Could not open Stripe onboarding in this simulator. Please retry.";
  if (raw.includes("connect") && raw.includes("enabled")) return "Stripe Connect is not enabled for this account yet.";
  if (raw.includes("stripe") && raw.includes("secret")) return "Stripe wallet is not configured on the server yet.";
  if (raw.includes("account_missing")) return "Preparing payout wallet. Please retry in a moment.";
  if (raw.includes("rate_limited") || raw.includes("too many")) return "Too many wallet attempts. Please wait a moment and retry.";
  return error instanceof Error && error.message ? error.message : "Wallet setup could not open. Please retry.";
};

export function NativeStripeConnectOnboarding({
  accessToken,
  visible = true,
  onReadyStateChange,
  onExit,
  onError,
}: NativeStripeConnectOnboardingProps) {
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState("");
  const launchInFlightRef = useRef(false);
  const activeRef = useRef(false);

  const finish = useCallback(() => {
    setBusy(false);
    setOpened(false);
    setError("");
    launchInFlightRef.current = false;
    onExit?.();
  }, [onExit]);

  const refreshStatus = useCallback(async () => {
    if (!accessToken) throw new Error("missing_access_token");
    const response = await fetch(`${supabaseUrl}/functions/v1/refresh-stripe-account-status`, {
      method: "POST",
      headers: createNativeFunctionHeaders(accessToken),
      body: JSON.stringify({}),
    });
    await parseJsonResponse<Record<string, unknown>>(response);
  }, [accessToken]);

  const launchOnboarding = useCallback(async () => {
    if (launchInFlightRef.current) return;
    launchInFlightRef.current = true;
    setBusy(true);
    setError("");
    onReadyStateChange?.(true);
    try {
      if (!accessToken) throw new Error("missing_access_token");
      const response = await fetch(`${supabaseUrl}/functions/v1/create-stripe-connect-link`, {
        method: "POST",
        headers: createNativeFunctionHeaders(accessToken),
        body: JSON.stringify({
          action: "create_link",
          returnUrl: STRIPE_RETURN_URL,
          refreshUrl: STRIPE_REFRESH_URL,
        }),
      });
      const data = await parseJsonResponse<ConnectLinkResponse>(response);
      if (!data.url) throw new Error(data.error || data.code || "wallet_link_missing");
      const canOpen = await Linking.canOpenURL(data.url).catch(() => true);
      if (!canOpen) throw new Error("wallet_link_unavailable");
      await Linking.openURL(data.url);
      setOpened(true);
    } catch (nextError) {
      const message = walletErrorCopy(nextError);
      setError(message);
      onError?.(message);
      launchInFlightRef.current = false;
    } finally {
      setBusy(false);
      onReadyStateChange?.(false);
    }
  }, [accessToken, onError, onReadyStateChange]);

  useEffect(() => {
    activeRef.current = visible;
    if (!visible) {
      setBusy(false);
      setOpened(false);
      setError("");
      launchInFlightRef.current = false;
      onReadyStateChange?.(false);
      return;
    }
    void launchOnboarding();
  }, [launchOnboarding, onReadyStateChange, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const linkSubscription = Linking.addEventListener("url", (event) => {
      const url = String(event.url || "");
      if (!url.includes("/carerprofile/stripe-return") && !url.includes("/carerprofile/stripe-refresh")) return;
      void refreshStatus().finally(finish);
    });
    const appSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || !activeRef.current || !opened) return;
      void refreshStatus().catch(() => undefined);
    });
    return () => {
      linkSubscription.remove();
      appSubscription.remove();
    };
  }, [finish, opened, refreshStatus, visible]);

  if (!visible) return null;
  return (
    <Modal animationType="fade" onRequestClose={finish} transparent visible={visible}>
      <Pressable onPress={finish} style={styles.backdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.card}>
          <Text style={styles.title}>Set Up Wallet</Text>
          <Text style={styles.body}>
            {opened
              ? "Complete Stripe onboarding in the secure browser, then return to Huddle."
              : "Preparing secure Stripe onboarding."}
          </Text>
          {busy ? <ActivityIndicator color={huddleColors.blue} style={styles.spinner} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            {error ? (
              <Pressable accessibilityRole="button" onPress={() => void launchOnboarding()} style={({ pressed }) => [styles.primaryButton, pressed ? huddleButtons.pressed : null]}>
                <Text style={styles.primaryText}>Retry</Text>
              </Pressable>
            ) : null}
            {opened ? (
              <Pressable accessibilityRole="button" onPress={() => void refreshStatus().finally(finish)} style={({ pressed }) => [styles.primaryButton, pressed ? huddleButtons.pressed : null]}>
                <Text style={styles.primaryText}>I've finished</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={finish} style={({ pressed }) => [styles.secondaryButton, pressed ? huddleButtons.pressed : null]}>
              <Text style={styles.secondaryText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleModalTokens.color.modalBackdrop,
    padding: huddleSpacing.x5,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.modal,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.canvas,
    padding: huddleSpacing.x5,
    ...huddleShadows.glassElevation1,
  },
  title: {
    color: huddleColors.text,
    fontFamily: "Urbanist-800",
    fontSize: huddleType.h3,
    lineHeight: huddleType.h3Line,
    textAlign: "center",
  },
  body: {
    color: huddleColors.subtext,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: 22,
    textAlign: "center",
  },
  spinner: {
    marginVertical: huddleSpacing.x2,
  },
  error: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    textAlign: "center",
  },
  actions: {
    gap: huddleSpacing.x2,
    marginTop: huddleSpacing.x2,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  secondaryText: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
});
