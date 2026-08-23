import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import { Animated, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isCancelledResponse, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { Session } from "@supabase/supabase-js";
import { NativeBrandMedia } from "../components/NativeBrandMedia";
import { NativeGlassCircle } from "../components/NativeGlassCircle";
import { NativeGlassSurface } from "../components/NativeGlassSurface";
import { NativeLegalText } from "../components/NativeLegalText";
import { NativeSpinner } from "../components/NativeSpinner";
import { NativeTurnstile } from "../components/NativeTurnstile";
import type { NativeLegalPageContent } from "../content/nativeLegalPages";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { huddleButtons, huddleColors, huddleFieldStates, huddleFormFields, huddleLayout, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { haptic } from "../lib/nativeHaptics";
import { useErrorShake } from "../components/motion/useErrorShake";
import { getNativeBiometricAvailability, hasNativeBiometricSessionHint, restoreNativeBiometricSession } from "../lib/nativeBiometricAuth";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { createNativeFunctionHeaders, installNativeAuthSession, noteNativeAuthState, signOutNativeAuthSession } from "../lib/nativeFunctionClient";
import { APPLE_RESET_NOT_AVAILABLE_COPY, APPLE_SIGN_IN_REQUIRED_COPY } from "../lib/nativeAuthAccountType";
import { NATIVE_OAUTH_PROVIDER_CONFIG, nativeOAuthResetNotAvailableCopy, nativeOAuthSignInRequiredCopy, type NativeOAuthProvider } from "../lib/nativeOAuthProviders";
import { resolveNativeOAuthAccount, type NativeOAuthResolution } from "../lib/nativeOAuthResolution";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { getNativeSignInDeviceContext } from "../lib/nativeSignInDevice";
import { getNativeTurnstileSiteKey } from "../lib/nativeTurnstile";
import huddleBlueLogo from "../../assets/huddle-blue.png";
import brandLogoFallback from "../../assets/APP/brandlogofallback.png";
import brandLogoVideo from "../../assets/APP/brandlogo.mp4";
import appleIcon from "../../assets/apple-icon.png";
import { loadNativeSignupDraft, saveNativeSignupDraft } from "../lib/nativeSignup";

type NativeAuthScreenProps = {
  onAuthenticated: (
    session: Session,
    options?: {
      source?: NativeOAuthProvider | "email" | "biometric";
      oauthResolution?: NativeOAuthResolution;
    },
  ) => void;
  onCreateAccount: (prefill?: { email?: string }) => void;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

type AuthFocusedField = "email" | "password" | null;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const supportReplyEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_LOGO_MEDIA_SIZE = 96;
const SOCIAL_CIRCLE_SIZE = 46;
// assets/APP/brandlogo.mp4 and brandlogofallback.png are tightly cropped
// (~99% of their own canvas is glyph, verified via alpha bbox scan) — near-zero
// padding, unlike the older huddle-video/huddle-video-fallback-transparent assets.
const AUTH_LOGO_BOUNDS = { x: 2 / 747, y: 0, width: (744 - 2) / 747, height: 1022 / 1024 };
// "huddle" wordmark sits directly beneath the brand mark, sized to the 24px heading tier.
const AUTH_HEADING_WORDMARK_HEIGHT = huddleType.h2;
const AUTH_HEADING_WORDMARK_WIDTH = Math.round(AUTH_HEADING_WORDMARK_HEIGHT * (1905 / 455));
const googleSignInWebClientId = String(Constants.expoConfig?.extra?.googleSignInWebClientId || process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN_WEB_CLIENT_ID || "").trim();
const googleSignInIosClientId = String(Constants.expoConfig?.extra?.googleSignInIosClientId || process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN_IOS_CLIENT_ID || "").trim();
const googleSignInIosUrlScheme = String(Constants.expoConfig?.extra?.googleSignInIosUrlScheme || process.env.GOOGLE_SIGN_IN_IOS_URL_SCHEME || "").trim();
const googleSignInConfigured = Boolean(googleSignInWebClientId && (Platform.OS !== "ios" || (googleSignInIosClientId && googleSignInIosUrlScheme)));
const logNativeOAuthFailure = (provider: NativeOAuthProvider, stage: "native_picker" | "native_token" | "supabase_session" | "oauth_resolution", error: unknown) => {
  const code = String(error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code || "" : "")
    .replace(/[^a-z0-9_.-]/gi, "")
    .slice(0, 64);
  if (__DEV__) console.warn("[native-auth] oauth_failed", {
    provider,
    stage,
    ...(code ? { code } : {}),
  });
};
const nativeTurnstileSubmitErrorMessage = (value: unknown, fallback: string) => {
  return nativeSafeErrorCopy(value, fallback);
};

const openNativeMailInbox = async () => {
  haptic.selectTab();
  const inboxUrls = Platform.OS === "android" ? ["googlegmail://co", "ms-outlook://mail/inbox"] : ["message://", "googlegmail://co", "ms-outlook://mail/inbox"];

  for (const inboxUrl of inboxUrls) {
    try {
      const canOpen = await Linking.canOpenURL(inboxUrl);
      if (!canOpen) continue;
      await Linking.openURL(inboxUrl);
      return true;
    } catch {
      // Try the next installed mail client.
    }
  }

  return false;
};
const legalModalTargets = {
  terms: {
    title: "Terms",
    path: "/terms",
  },
  privacy: {
    title: "Privacy Policy",
    path: "/privacy",
  },
  cookies: {
    title: "Cookies Policy",
    path: "/cookies",
  },
} as const;

type LegalModalTarget = keyof typeof legalModalTargets;
type AppModalTarget = "support" | "resetPassword" | LegalModalTarget;

type SupportErrors = {
  message?: string;
  replyEmail?: string;
};

type SupportFocusedField = "subject" | "message" | "replyEmail" | null;

function getNativeSignInErrorCopy(error?: unknown) {
  const raw = error instanceof Error ? String(error.message || "").trim() : error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "").trim() : String(error || "").trim();
  if (!raw) return "Couldn't sign in. Please try again.";
  if (raw === "Need help? Click Forgot Password to reset it.") return raw;
  if (raw === APPLE_SIGN_IN_REQUIRED_COPY || raw === nativeOAuthSignInRequiredCopy("google")) return raw;

  const lower = raw.toLowerCase();

  if (lower.includes("apple_oauth_required") || lower.includes("apple sign in")) {
    return nativeOAuthSignInRequiredCopy("apple");
  }
  if (lower.includes("google_oauth_required") || lower.includes("google sign-in")) {
    return nativeOAuthSignInRequiredCopy("google");
  }
  if (lower.includes("invalid login credentials")) {
    return "Need help? Click Forgot Password to reset it.";
  }
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Confirm your email first, then sign in again.";
  }

  return nativeSafeErrorCopy(raw, "Couldn't sign in. Please try again.");
}

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Google">
      <Path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.1-1.3 3.3-5.1 3.3-3.1 0-5.6-2.6-5.6-5.7s2.5-5.7 5.6-5.7c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 6.9 2.3 2.8 6.4 2.8 11.6S6.9 20.9 12 20.9c6.9 0 8.6-4.9 8.6-7.4 0-.5-.1-1-.2-1.3H12z" />
      <Path fill="#34A853" d="M3.6 7.2l2.9 2.1C7.2 7.7 9.3 6 12 6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.6 3.2 14.5 2.3 12 2.3 8.5 2.3 5.4 4.3 3.6 7.2z" />
      <Path fill="#4A90E2" d="M12 20.9c2.5 0 4.6-.8 6.1-2.1l-2.8-2.2c-.8.6-1.9 1-3.3 1-2.7 0-4.9-1.8-5.7-4.2l-2.9 2.2C5.2 18.9 8.3 20.9 12 20.9z" />
      <Path fill="#FBBC05" d="M6.3 13.4c-.2-.6-.3-1.1-.3-1.8s.1-1.2.3-1.8L3.4 7.6C2.9 8.7 2.6 10.1 2.6 11.6s.3 2.9.8 4.1l2.9-2.3z" />
    </Svg>
  );
}

const isRetryableNativeNetworkError = (error: unknown) => {
  const raw = error instanceof Error ? String(error.message || "") : error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : String(error || "");
  const normalized = raw.toLowerCase();
  return normalized.includes("network request failed") || normalized.includes("fetch failed") || normalized.includes("network_error");
};

function NativeSignInErrorText({ message, style }: { message: string; style: object }) {
  if (message === "Need help? Click Forgot Password to reset it.") {
    return (
      <Text style={style}>
        Need help? Click <Text style={styles.errorTextBold}>Forgot Password</Text> to reset it.
      </Text>
    );
  }

  return <Text style={style}>{message}</Text>;
}

function NativeSupportModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [wantsReply, setWantsReply] = useState(false);
  const [replyEmail, setReplyEmail] = useState("");
  const [errors, setErrors] = useState<SupportErrors>({});
  const [focusedSupportField, setFocusedSupportField] = useState<SupportFocusedField>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const messageInputRef = useRef<TextInput | null>(null);
  const replyEmailInputRef = useRef<TextInput | null>(null);

  const requiresReplyEmail = wantsReply;

  const clearError = useCallback((field: keyof SupportErrors) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const validateSupportForm = useCallback(() => {
    const nextErrors: SupportErrors = {};
    if (!message.trim()) {
      nextErrors.message = "Please tell us how we can help.";
    }
    if (requiresReplyEmail) {
      const trimmedEmail = replyEmail.trim();
      if (!trimmedEmail) {
        nextErrors.replyEmail = "Enter your email if you want a reply.";
      } else if (!supportReplyEmailPattern.test(trimmedEmail)) {
        nextErrors.replyEmail = "Enter a valid email address.";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [message, replyEmail, requiresReplyEmail]);

  const resetSupportForm = useCallback(() => {
    setSubject("");
    setMessage("");
    setWantsReply(false);
    setReplyEmail("");
    setErrors({});
    setSubmitError("");
    setTicketNumber(null);
    setTurnstileToken("");
    setTurnstileError("");
  }, []);

  const submitSupport = useCallback(async () => {
    if (submitting) return;
    setSubmitError("");
    if (!validateSupportForm()) return;
    if (!turnstileToken.trim()) {
      setTurnstileError(turnstileError || "Complete human verification first.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/submit-support-ticket`, {
        method: "POST",
        headers: createNativeFunctionHeaders(),
        body: JSON.stringify({
          name: "Guest",
          email: wantsReply ? replyEmail.trim() : "noreply@huddle.pet",
          subject: subject.trim() || "Support Request",
          message: message.trim(),
          wants_reply: wantsReply,
          turnstile_token: turnstileToken.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        ticket_number?: string;
        error?: string;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(nativeTurnstileSubmitErrorMessage(body?.error || body?.message || `Support submit failed with HTTP ${response.status}.`, "Couldn't send your message. Please try again."));
      }
      setTicketNumber(body?.ticket_number || "received");
      setSubject("");
      setMessage("");
      setReplyEmail("");
      setWantsReply(false);
      setErrors({});
      setTurnstileToken("");
      setTurnstileError("");
      setTurnstileResetKey((key) => key + 1);
    } catch (error) {
      setSubmitError(nativeTurnstileSubmitErrorMessage(error, "Couldn't send your message. Please try again."));
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }, [message, replyEmail, subject, submitting, turnstileError, turnstileToken, validateSupportForm, wantsReply]);

  if (ticketNumber) {
    return (
      <View style={styles.supportSuccess}>
        <Text style={styles.supportTitle}>Message sent!</Text>
        <Text style={styles.supportSuccessText}>Your ticket number is {ticketNumber}.</Text>
      </View>
    );
  }

  return (
    <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.supportScrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.supportPanel}>
        <Text style={styles.supportTitle}>Need help with huddle?</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Subject</Text>
          <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
            value={subject}
            onFocus={() => setFocusedSupportField("subject")}
            onBlur={() => setFocusedSupportField(null)}
            onChangeText={(next) => {
              setSubject(next);
              setSubmitError("");
            }}
            onSubmitEditing={() => messageInputRef.current?.focus()}
            placeholder="Subject (optional)"
            placeholderTextColor={huddleColors.mutedText}
            returnKeyType="next"
            editable={!submitting}
            style={[styles.supportField, focusedSupportField === "subject" ? styles.supportFieldFocused : null]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            ref={messageInputRef}
            value={message}
            onFocus={() => setFocusedSupportField("message")}
            onChangeText={(next) => {
              setMessage(next);
              setSubmitError("");
              if (next.trim()) clearError("message");
            }}
            onBlur={() => {
              setFocusedSupportField(null);
              if (!message.trim())
                setErrors((current) => ({
                  ...current,
                  message: "Please tell us how we can help.",
                }));
            }}
            placeholder="How can we help?"
            placeholderTextColor={huddleColors.mutedText}
            editable={!submitting}
            multiline
            scrollEnabled
            textAlignVertical="top"
            style={[styles.supportField, styles.supportTextArea, focusedSupportField === "message" ? styles.supportFieldFocused : null, errors.message ? styles.supportFieldError : null]}
          />
          {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
        </View>

        <Pressable
          accessibilityLabel="Stay in touch via email"
          disabled={submitting}
          onPress={() => {
            const next = !wantsReply;
            setWantsReply(next);
            setSubmitError("");
            if (!next) clearError("replyEmail");
          }}
          style={({ pressed }) => [styles.supportCheckboxRow, pressed && !submitting ? styles.pressed : null]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: wantsReply }}
        >
          <View style={[styles.supportCheckbox, wantsReply ? styles.supportCheckboxChecked : null]}>{wantsReply ? <Feather name="check" size={16} color={huddleColors.onPrimary} /> : null}</View>
          <Text style={styles.supportCheckboxLabel}>Stay in touch via email</Text>
        </Pressable>

        {requiresReplyEmail ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
              ref={replyEmailInputRef}
              value={replyEmail}
              onFocus={() => setFocusedSupportField("replyEmail")}
              onChangeText={(next) => {
                setReplyEmail(next);
                setSubmitError("");
                if (supportReplyEmailPattern.test(next.trim())) clearError("replyEmail");
              }}
              onBlur={() => {
                setFocusedSupportField(null);
                const trimmed = replyEmail.trim();
                if (!trimmed) {
                  setErrors((current) => ({
                    ...current,
                    replyEmail: "Enter your email if you want a reply.",
                  }));
                } else if (!supportReplyEmailPattern.test(trimmed)) {
                  setErrors((current) => ({
                    ...current,
                    replyEmail: "Enter a valid email address.",
                  }));
                }
              }}
              onSubmitEditing={() => void submitSupport()}
              placeholder="name@email.com"
              placeholderTextColor={huddleColors.mutedText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
              editable={!submitting}
              style={[styles.supportField, focusedSupportField === "replyEmail" ? styles.supportFieldFocused : null, errors.replyEmail ? styles.supportFieldError : null]}
            />
            {errors.replyEmail ? <Text style={styles.errorText}>{errors.replyEmail}</Text> : null}
          </View>
        ) : null}

        <View style={styles.turnstileGroup}>
          <NativeTurnstile
            action="support_ticket"
            key={`auth-support-turnstile-${turnstileResetKey}`}
            onError={setTurnstileError}
            onToken={(token) => {
              setTurnstileToken(token);
              if (token) setTurnstileError("");
            }}
            siteKey={getNativeTurnstileSiteKey()}
          />
          {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
        </View>
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <View style={styles.supportButtonStack}>
          <Pressable accessibilityLabel="Send support message" accessibilityRole="button" disabled={submitting} onPress={() => void submitSupport()} style={({ pressed }) => [styles.supportPrimaryButton, pressed && !submitting ? styles.pressed : null, submitting ? styles.disabled : null]}>
            {submitting ? <NativeSpinner tone="primary" /> : <Text style={styles.primaryLabel}>Send</Text>}
          </Pressable>
          <Pressable
            accessibilityLabel="Cancel support"
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => {
              resetSupportForm();
              onClose();
            }}
            style={({ pressed }) => [styles.supportSecondaryButton, pressed && !submitting ? styles.pressed : null]}
          >
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

export function NativeResetPasswordModal({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [focused, setFocused] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const normalizedInitialEmail = useMemo(() => initialEmail.trim().toLowerCase(), [initialEmail]);

  useEffect(() => {
    if (!normalizedInitialEmail) return;
    setEmail((current) => (current.trim() ? current : normalizedInitialEmail));
  }, [normalizedInitialEmail]);

  const submitReset = useCallback(async () => {
    setSubmitError("");
    if (!emailPattern.test(normalizedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (!turnstileToken.trim()) {
      setTurnstileError(turnstileError || "Complete human verification first.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-reset-password`, {
        method: "POST",
        headers: createNativeFunctionHeaders(),
        body: JSON.stringify({
          email: normalizedEmail,
          redirectTo: "https://huddle.pet/auth/callback?type=recovery&next=/update-password",
          turnstile_token: turnstileToken.trim(),
          turnstile_action: "reset_password",
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        public_message?: string;
        code?: string;
      } | null;
      if (!response.ok) {
        throw new Error(nativeTurnstileSubmitErrorMessage(body?.public_message || body?.code || body?.error || body?.message || `Reset failed with HTTP ${response.status}.`, "Couldn't send that reset email just now."));
      }
      const oauthCode = String(body?.code || body?.error || "")
        .trim()
        .toLowerCase();
      if (oauthCode === "apple_oauth_required" || oauthCode === "google_oauth_required" || body?.public_message === APPLE_RESET_NOT_AVAILABLE_COPY || body?.public_message === nativeOAuthResetNotAvailableCopy("google")) {
        setSubmitError(oauthCode === "google_oauth_required" ? nativeOAuthResetNotAvailableCopy("google") : nativeOAuthResetNotAvailableCopy("apple"));
        setTurnstileToken("");
        setTurnstileResetKey((key) => key + 1);
        return;
      }
      setSentEmail(normalizedEmail);
      setTurnstileToken("");
      setTurnstileError("");
      setTurnstileResetKey((key) => key + 1);
      setEmailError("");
    } catch (error) {
      setSubmitError(nativeTurnstileSubmitErrorMessage(error, "Couldn't send that reset email just now."));
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }, [normalizedEmail, turnstileError, turnstileToken]);

  if (sentEmail) {
    return (
      <View style={styles.resetSuccess}>
        <Text style={styles.supportTitle}>Check your inbox</Text>
        <Text style={styles.supportSuccessText}>If that email is in Huddle, we've sent a reset link.</Text>
        <Pressable accessibilityLabel="Check email" accessibilityRole="button" disabled={submitting} onPress={() => void openNativeMailInbox()} style={({ pressed }) => [styles.supportPrimaryButton, pressed && !submitting ? styles.pressed : null, submitting ? styles.disabled : null]}>
          <View style={styles.primaryButtonContentRow}>
            <Feather name="mail" size={16} color={huddleColors.onPrimary} />
            <Text style={styles.primaryLabel}>Check email</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Send another reset link"
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => {
            setSentEmail("");
            setTurnstileToken("");
            setTurnstileError("");
            setSubmitError("");
          }}
          style={({ pressed }) => [styles.linkButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.authForgotLabel}>Send another link</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.supportScrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.supportPanel}>
        <Text style={styles.supportTitle}>Reset password</Text>
        <Text style={styles.resetBodyText}>Enter your email to receive a reset link.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
            value={email}
            onFocus={() => setFocused(true)}
            onChangeText={(next) => {
              setEmail(next);
              setSubmitError("");
              if (emailPattern.test(next.trim().toLowerCase())) setEmailError("");
            }}
            onBlur={() => {
              setFocused(false);
              if (!emailPattern.test(normalizedEmail)) setEmailError("Enter a valid email address.");
            }}
            onSubmitEditing={() => void submitReset()}
            placeholder="name@email.com"
            placeholderTextColor={huddleColors.mutedText}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="done"
            textContentType="username"
            editable={!submitting}
            style={[styles.supportField, focused ? styles.supportFieldFocused : null, emailError ? styles.supportFieldError : null]}
          />
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
        </View>

        <View style={styles.turnstileGroup}>
          <NativeTurnstile
            action="reset_password"
            compact
            key={`reset-password-turnstile-${turnstileResetKey}`}
            onError={setTurnstileError}
            onToken={(token) => {
              setTurnstileToken(token);
              if (token) setTurnstileError("");
            }}
            siteKey={getNativeTurnstileSiteKey()}
          />
          {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable accessibilityLabel="Send reset link" accessibilityRole="button" disabled={submitting} onPress={() => void submitReset()} style={({ pressed }) => [styles.supportPrimaryButton, pressed && !submitting ? styles.pressed : null, submitting ? styles.disabled : null]}>
          {submitting ? (
            <NativeSpinner tone="primary" />
          ) : (
            <View style={styles.primaryButtonContentRow}>
              <Feather name="mail" size={16} color={huddleColors.onPrimary} />
              <Text style={styles.primaryLabel}>Send reset link</Text>
            </View>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function NativeAuthLegalModalContent({ page }: { page: NativeLegalPageContent }) {
  return (
    <View style={styles.legalContent}>
      <View style={styles.legalStickyHeader}>
        <Text style={styles.legalTitle}>{page.title}</Text>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={() => null} pointerEvents="none" style={styles.legalHeaderClosePlaceholder} />
      </View>
      <ScrollView bounces contentContainerStyle={styles.legalScrollContent} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator style={styles.legalScroll}>
        {page.intro.map((paragraph, index) => (
          <NativeLegalText key={`intro-${index}`} style={styles.legalBody}>{paragraph}</NativeLegalText>
        ))}
        {page.sections.map((section) => (
          <View key={section.title} style={styles.legalSection}>
            <Text style={styles.legalSectionTitle}>{section.title}</Text>
            {section.body.map((paragraph, index) => (
              <NativeLegalText key={`${section.title}-${index}`} style={styles.legalBody}>{paragraph}</NativeLegalText>
            ))}
            {section.bullets?.map((bullet, index) => (
              <View key={`${section.title}-bullet-${index}`} style={styles.legalBulletRow}>
                <Text style={styles.legalBulletDot}>•</Text>
                <NativeLegalText style={styles.legalBulletText}>{bullet}</NativeLegalText>
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.legalMeta}>Updated: {page.effectiveDate}</Text>
      </ScrollView>
    </View>
  );
}

export function NativeAuthScreen({ onAuthenticated, onCreateAccount }: NativeAuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const modalMaxHeight = Math.round(windowHeight * 0.8);
  const emailInputRef = useRef<TextInput | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appModalTarget, setAppModalTarget] = useState<AppModalTarget | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusedAuthField, setFocusedAuthField] = useState<AuthFocusedField>(null);
  const [authError, setAuthError] = useState("");
  const [signinPasswordVisible, setSigninPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const { shake: triggerSignInShake, shakeStyle: signInShakeStyle } = useErrorShake();
  const appleAvailable = Platform.OS === "ios";
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [biometricDeviceSupported, setBiometricDeviceSupported] = useState(false);
  const [biometricAccountEnabled, setBiometricAccountEnabled] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const showBiometricLogin = biometricDeviceSupported && biometricAccountEnabled;
  const legalPage = appModalTarget === "terms" || appModalTarget === "privacy" || appModalTarget === "cookies" ? getNativeLegalPage(legalModalTargets[appModalTarget].path) : null;

  useEffect(() => {
    let active = true;
    if (!googleSignInConfigured) {
      setGoogleAvailable(false);
      return () => {
        active = false;
      };
    }

    if (Platform.OS === "android") {
      GoogleSignin.configure({
        webClientId: googleSignInWebClientId,
        offlineAccess: false,
      });
      void GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false })
        .then((available) => {
          if (active) setGoogleAvailable(Boolean(available));
        })
        .catch(() => {
          if (active) setGoogleAvailable(false);
        });
    } else {
      void Linking.canOpenURL(`${googleSignInIosUrlScheme}:/`)
        .then((hasNativeReturnScheme) => {
          if (!active) return;
          if (!hasNativeReturnScheme) {
            setGoogleAvailable(false);
            return;
          }
          GoogleSignin.configure({
            webClientId: googleSignInWebClientId,
            iosClientId: googleSignInIosClientId,
            offlineAccess: false,
          });
          setGoogleAvailable(true);
        })
        .catch(() => {
          if (active) setGoogleAvailable(false);
        });
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getNativeBiometricAvailability()
      .then((availability) => {
        if (!active) return;
        setBiometricDeviceSupported(availability.available);
      })
      .catch(() => {
        if (active) setBiometricDeviceSupported(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void hasNativeBiometricSessionHint().then((enabled) => {
      if (active) setBiometricAccountEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const validate = useCallback(() => {
    const nextErrors: FieldErrors = {};
    if (!emailPattern.test(normalizedEmail)) nextErrors.email = "Enter a valid email address.";
    if (password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [normalizedEmail, password.length]);

  const handleEmailSignIn = useCallback(async () => {
    setAuthError("");
    if (!validate()) {
      triggerSignInShake();
      requestAnimationFrame(() => {
        if (!emailPattern.test(normalizedEmail)) {
          emailInputRef.current?.focus();
          return;
        }
        passwordInputRef.current?.focus();
      });
      return;
    }
    setLoading(true);
    try {
      const device = await getNativeSignInDeviceContext();
      const response = await fetch(`${supabaseUrl}/functions/v1/auth-login`, {
        method: "POST",
        headers: {
          ...createNativeFunctionHeaders(),
          "User-Agent": device.userAgent,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          device_id: device.deviceId,
          client_device_label: device.deviceLabel,
          timezone: device.timezone,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: {
          session?: {
            access_token?: string;
            refresh_token?: string;
          } | null;
        };
        error?: string;
        message?: string;
        public_message?: string;
        code?: string;
      } | null;
      if (!response.ok) throw new Error(body?.public_message || body?.code || body?.error || body?.message || "login_failed");
      const sessionTokens = body?.data?.session;
      if (!sessionTokens?.access_token || !sessionTokens.refresh_token) throw new Error("session_missing");
      const session = await installNativeAuthSession({
        access_token: sessionTokens.access_token,
        refresh_token: sessionTokens.refresh_token,
      });
      haptic.success();
      onAuthenticated(session, { source: "email" });
    } catch (error) {
      haptic.error();
      setAuthError(getNativeSignInErrorCopy(error));
    } finally {
      setLoading(false);
    }
  }, [normalizedEmail, onAuthenticated, password, triggerSignInShake, validate]);

  const getNativeOAuthIdToken = useCallback(async (provider: NativeOAuthProvider) => {
    if (provider === "apple") {
      if (Platform.OS !== "ios") throw new Error("apple_sign_in_not_available");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) throw new Error("apple_identity_token_missing");
      return credential.identityToken;
    }

    if (!googleSignInConfigured) throw new Error("google_sign_in_not_configured");
    if (Platform.OS === "ios" && !googleSignInIosUrlScheme) throw new Error("google_sign_in_not_configured");
    await GoogleSignin.signOut().catch((error) => {
      logNativeOAuthFailure("google", "native_picker", error);
      return undefined;
    });
    let result: Awaited<ReturnType<typeof GoogleSignin.signIn>>;
    try {
      result = await GoogleSignin.signIn();
    } catch (error) {
      logNativeOAuthFailure("google", "native_picker", error);
      throw error;
    }
    if (isCancelledResponse(result)) {
      const cancelledError = new Error("google_sign_in_cancelled") as Error & { code?: string };
      cancelledError.code = statusCodes.SIGN_IN_CANCELLED;
      throw cancelledError;
    }
    if (!isSuccessResponse(result)) throw new Error("google_sign_in_incomplete");
    const signInToken = result.data.idToken || "";
    if (signInToken) return signInToken;
    let tokens: Awaited<ReturnType<typeof GoogleSignin.getTokens>>;
    try {
      tokens = await GoogleSignin.getTokens();
    } catch (error) {
      logNativeOAuthFailure("google", "native_token", error);
      throw error;
    }
    if (!tokens.idToken) throw new Error("google_identity_token_missing");
    return tokens.idToken;
  }, []);

  const handleNativeOAuthSignIn = useCallback(
    async (provider: NativeOAuthProvider) => {
      setAuthError("");
      setLoading(true);
      try {
        const token = await getNativeOAuthIdToken(provider);
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider,
          token,
        });
        if (error) logNativeOAuthFailure(provider, "supabase_session", error);
        if (error) throw error;
        if (!data.session) throw new Error("session_missing");
        noteNativeAuthState(data.session);
        const oauthResolution = await resolveNativeOAuthAccount(provider, data.session.access_token);
        if (oauthResolution.state === "registered_conflict") {
          logNativeOAuthFailure(provider, "oauth_resolution", new Error(oauthResolution.public_message || "registered_conflict"));
        }
        if (oauthResolution.state === "registered_conflict") {
          await signOutNativeAuthSession({ scope: "local" }).catch(() => undefined);
          throw new Error(oauthResolution.public_message || "This email already has a huddle account. Continue with the original sign-in method.");
        }
        haptic.success();
        onAuthenticated(data.session, { source: provider, oauthResolution });
      } catch (error) {
        haptic.error();
        const code = String(error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code || "" : "");
        const raw = String(error instanceof Error ? error.message : error || "").toLowerCase();
        if (code === statusCodes.SIGN_IN_CANCELLED || raw === "google_sign_in_cancelled") {
          setAuthError("");
        } else {
          logNativeOAuthFailure(provider, "native_token", error);
          const label = NATIVE_OAUTH_PROVIDER_CONFIG[provider].label;
          setAuthError(nativeSafeErrorCopy(error, `Couldn't start ${label} sign in.`));
        }
      } finally {
        setLoading(false);
      }
    },
    [getNativeOAuthIdToken, onAuthenticated],
  );

  const handleBiometricLogin = useCallback(async () => {
    setAuthError("");
    setLoading(true);
    try {
      const session = await restoreNativeBiometricSession();
      haptic.success();
      onAuthenticated(session, { source: "biometric" });
    } catch (error) {
      haptic.error();
      const raw = String(error instanceof Error ? error.message : error || "").toLowerCase();
      if (raw.includes("not_enrolled")) {
        setAuthError("Set up Face ID or Touch ID on this device first.");
      } else if (raw.includes("missing") || raw.includes("invalid")) {
        setBiometricAccountEnabled(false);
        setAuthError("Biometric sign in needs to be set up again.");
      } else {
        setAuthError("Biometric sign in could not be completed. Continue with email.");
      }
    } finally {
      setLoading(false);
    }
  }, [onAuthenticated]);

  const handleCreateAccount = useCallback(async () => {
    const prefillEmail = normalizedEmail;
    if (prefillEmail && emailPattern.test(prefillEmail)) {
      try {
        const currentDraft = await loadNativeSignupDraft({
          includePassword: false,
        });
        await saveNativeSignupDraft({ ...currentDraft, email: prefillEmail }, { includePassword: false });
      } catch {
        // Best-effort prefill only.
      }
    }
    setEmail("");
    setPassword("");
    onCreateAccount(prefillEmail ? { email: prefillEmail } : undefined);
  }, [normalizedEmail, onCreateAccount]);

  const openResetPassword = useCallback(() => {
    setAppModalTarget("resetPassword");
  }, []);

  return (
    <View style={styles.screenRoot}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }]} />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={styles.contentScroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <View style={styles.topBarSpacer} />
              <Pressable onPress={() => setAppModalTarget("support")} style={({ pressed }) => [styles.helpButton, pressed ? styles.pressed : null]} accessibilityRole="button" accessibilityLabel="Help">
                <Text style={styles.helpLabel}>Help</Text>
              </Pressable>
            </View>

            <View style={styles.authCenterRegion}>
              <View style={styles.brandBlock}>
                <NativeBrandMedia
                  size={AUTH_LOGO_MEDIA_SIZE}
                  windowHeight={AUTH_LOGO_MEDIA_SIZE}
                  style={styles.logoWindow}
                  videoSource={brandLogoVideo}
                  fallbackSource={brandLogoFallback}
                  bounds={AUTH_LOGO_BOUNDS}
                />
                <Image source={huddleBlueLogo} resizeMode="contain" style={styles.headingWordmarkStacked} />
                <Text style={styles.dictionaryLabel}>noun — /ˈhʌd.əl/</Text>
                <Text style={styles.subheadingText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  a circle that knows first, acts fast.
                </Text>
              </View>

              <NativeGlassSurface intensity="chrome" style={styles.card}>
                <View style={styles.fieldGroup}>
                  <View style={[styles.authIconField, focusedAuthField === "email" ? styles.supportFieldFocused : null, errors.email ? styles.supportFieldError : null]}>
                    <Feather name="mail" size={17} color="rgba(74,73,101,0.55)" style={styles.authFieldIcon} />
                    <TextInput numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                      textBreakStrategy="simple"
                      value={email}
                      ref={emailInputRef}
                      onFocus={() => setFocusedAuthField("email")}
                      onChangeText={(next) => {
                        setEmail(next);
                        setAuthError("");
                        if (errors.email && emailPattern.test(next.trim().toLowerCase())) {
                          setErrors((current) => ({
                            ...current,
                            email: undefined,
                          }));
                        }
                      }}
                      onBlur={() => {
                        setFocusedAuthField(null);
                        if (!emailPattern.test(normalizedEmail)) {
                          setErrors((current) => ({
                            ...current,
                            email: "Enter a valid email address.",
                          }));
                        }
                      }}
                      placeholder="Email"
                      placeholderTextColor={huddleColors.mutedText}
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      keyboardType="email-address"
                      multiline={false}
                      scrollEnabled
                      onSubmitEditing={() => passwordInputRef.current?.focus()}
                      returnKeyType="next"
                      textContentType="username"
                      editable={!loading}
                      style={styles.authFieldInput}
                    />
                  </View>
                  {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
                </View>

                <View style={styles.fieldGroup}>
                  <View style={[styles.authIconField, focusedAuthField === "password" ? styles.supportFieldFocused : null, errors.password || authError ? styles.supportFieldError : null]}>
                    <Feather name="lock" size={17} color="rgba(74,73,101,0.55)" style={styles.authFieldIcon} />
                    <TextInput numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                      textBreakStrategy="simple"
                      ref={passwordInputRef}
                      value={password}
                      onFocus={() => setFocusedAuthField("password")}
                      onChangeText={(next) => {
                        setPassword(next);
                        setAuthError("");
                        if (errors.password && next.length >= 8) {
                          setErrors((current) => ({
                            ...current,
                            password: undefined,
                          }));
                        }
                      }}
                      onBlur={() => {
                        setFocusedAuthField(null);
                        if (password.length < 8) {
                          setErrors((current) => ({
                            ...current,
                            password: "Password must be at least 8 characters.",
                          }));
                        }
                      }}
                      onSubmitEditing={() => void handleEmailSignIn()}
                      returnKeyType="done"
                      placeholder="Password"
                      placeholderTextColor={huddleColors.mutedText}
                      autoComplete="current-password"
                      multiline={false}
                      scrollEnabled
                      secureTextEntry={!signinPasswordVisible}
                      textContentType="password"
                      editable={!loading}
                      style={styles.authFieldInput}
                    />
                    <Pressable
                      disabled={loading}
                      onPress={() => {
                        setSigninPasswordVisible((visible) => !visible);
                        requestAnimationFrame(() => passwordInputRef.current?.focus());
                      }}
                      style={({ pressed }) => [styles.authPasswordRevealButton, pressed && !loading ? styles.pressed : null]}
                      accessibilityRole="button"
                      accessibilityLabel={signinPasswordVisible ? "Hide password" : "Show password"}
                    >
                      <Feather name={signinPasswordVisible ? "eye-off" : "eye"} size={19} color="rgba(74,73,101,0.55)" />
                    </Pressable>
                  </View>
                  {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
                </View>

                <Pressable accessibilityLabel="Forgot password" accessibilityRole="button" disabled={loading} onPress={openResetPassword} style={({ pressed }) => [styles.authForgotButton, pressed && !loading ? styles.pressed : null]}>
                  <Text style={styles.authForgotLabel}>Forgot password?</Text>
                </Pressable>

                {authError ? <NativeSignInErrorText message={authError} style={styles.errorText} /> : null}

                <Animated.View style={[signInShakeStyle, { marginTop: huddleSpacing.x3 }]}>
                  <Pressable accessibilityLabel="Sign in" accessibilityRole="button" disabled={loading} onPress={() => void handleEmailSignIn()} style={({ pressed }) => [styles.primaryButton, pressed && !loading ? styles.pressed : null, loading ? styles.disabled : null]}>
                    {loading ? <NativeSpinner tone="primary" /> : <Text style={styles.primaryLabel}>Sign in</Text>}
                  </Pressable>
                </Animated.View>

                <Pressable accessibilityLabel="Create an account" accessibilityRole="button" disabled={loading} onPress={() => void handleCreateAccount()} style={({ pressed }) => [styles.createAccountLink, pressed && !loading ? styles.pressed : null]}>
                  <Text style={styles.createAccountText}>
                    New here? <Text style={styles.createAccountTextBold}>Create an account</Text>
                  </Text>
                </Pressable>

                {showBiometricLogin || appleAvailable || googleAvailable ? (
                  <>
                    <View style={[styles.dividerRow, { marginTop: huddleSpacing.x3 }]} pointerEvents="none">
                      <View style={styles.divider} />
                      <Text style={styles.dividerText}>or continue with</Text>
                      <View style={styles.divider} />
                    </View>
                    <View style={styles.socialRow}>
                      {showBiometricLogin ? (
                        <Pressable accessibilityLabel="Continue with Passkey" accessibilityRole="button" disabled={loading} onPress={() => void handleBiometricLogin()} style={({ pressed }) => [styles.socialCircleWrap, pressed && !loading ? styles.pressed : null]}>
                          <NativeGlassCircle fallbackTint="rgba(255,255,255,0.42)" glassOpacity={0.82} highlightOpacity={0.42} materialTint="rgba(255,255,255,0.18)" rimColor="rgba(255,255,255,0.54)" size={SOCIAL_CIRCLE_SIZE} tint="rgba(255,255,255,0.18)">
                            <MaterialCommunityIcons name="face-recognition" size={19} color={huddleColors.text} />
                          </NativeGlassCircle>
                        </Pressable>
                      ) : null}
                      {appleAvailable ? (
                        <Pressable
                          accessibilityLabel="Continue with Apple"
                          accessibilityRole="button"
                          disabled={loading}
                          onPress={() => void handleNativeOAuthSignIn("apple")}
                          style={({ pressed }) => [styles.socialCircleWrap, pressed && !loading ? styles.pressed : null]}
                        >
                          <NativeGlassCircle fallbackTint="rgba(255,255,255,0.42)" glassOpacity={0.82} highlightOpacity={0.42} materialTint="rgba(255,255,255,0.18)" rimColor="rgba(255,255,255,0.54)" size={SOCIAL_CIRCLE_SIZE} tint="rgba(255,255,255,0.18)">
                            <Image resizeMode="contain" source={appleIcon} style={styles.appleLogoOnlyButton} />
                          </NativeGlassCircle>
                        </Pressable>
                      ) : null}
                      {googleAvailable ? (
                        <Pressable accessibilityLabel="Continue with Google" accessibilityRole="button" disabled={loading} onPress={() => void handleNativeOAuthSignIn("google")} style={({ pressed }) => [styles.socialCircleWrap, pressed && !loading ? styles.pressed : null]}>
                          <NativeGlassCircle fallbackTint="rgba(255,255,255,0.42)" glassOpacity={0.82} highlightOpacity={0.42} materialTint="rgba(255,255,255,0.18)" rimColor="rgba(255,255,255,0.54)" size={SOCIAL_CIRCLE_SIZE} tint="rgba(255,255,255,0.18)">
                            <GoogleIcon size={18} />
                          </NativeGlassCircle>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </NativeGlassSurface>
            </View>

            <View style={[styles.footer, { paddingBottom: huddleSpacing.x4 + insets.bottom }]}>
              <Text style={styles.footerText}>
                By continuing, you agree to our{" "}
                <Text style={styles.footerLink} onPress={() => setAppModalTarget("terms")}>
                  Terms of Service
                </Text>
                . Learn how we process your data in{" "}
                <Text style={styles.footerLink} onPress={() => setAppModalTarget("privacy")}>
                  Privacy Policy
                </Text>{" "}
                and{" "}
                <Text style={styles.footerLink} onPress={() => setAppModalTarget("cookies")}>
                  Cookies Policy
                </Text>
                .
              </Text>
            </View>
          </ScrollView>

          <Modal animationType="fade" transparent visible={appModalTarget !== null} onRequestClose={() => setAppModalTarget(null)}>
            <View style={styles.appModalBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setAppModalTarget(null)} />
              <SafeAreaView
                pointerEvents="box-none"
                style={[
                  styles.appModalSafeArea,
                  appModalTarget === "support" || appModalTarget === "resetPassword"
                    ? {
                        paddingTop: insets.top + 28,
                        paddingBottom: insets.bottom + 28,
                      }
                    : {
                        paddingTop: insets.top + 68,
                        paddingBottom: insets.bottom + 28,
                      },
                ]}
              >
                <View style={appModalTarget === "support" || appModalTarget === "resetPassword" ? [styles.supportModalCard, { maxHeight: modalMaxHeight }] : [styles.legalModalCard, { height: modalMaxHeight }]}>
                  <Pressable hitSlop={huddleSpacing.x2} onPress={() => setAppModalTarget(null)} style={({ pressed }) => [styles.appModalClose, appModalTarget === "terms" || appModalTarget === "privacy" || appModalTarget === "cookies" ? styles.legalModalClose : null, pressed ? styles.pressed : null]} accessibilityRole="button" accessibilityLabel="Close">
                    <Feather name="x" size={24} color={huddleColors.text} />
                  </Pressable>
                  {appModalTarget === "support" ? <NativeSupportModal onClose={() => setAppModalTarget(null)} /> : appModalTarget === "resetPassword" ? <NativeResetPasswordModal initialEmail={normalizedEmail} /> : legalPage ? <NativeAuthLegalModalContent page={legalPage} /> : null}
                </View>
              </SafeAreaView>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  keyboardView: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x2,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: huddleSpacing.x2,
  },
  topBarSpacer: {
    width: 54,
    height: 44,
  },
  helpButton: {
    minWidth: 48,
    height: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  helpLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: 24,
    color: huddleColors.iconSubtle,
  },
  authCenterRegion: {
    flex: 1,
    justifyContent: "center",
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x5,
  },
  logoWindow: {
    marginBottom: huddleSpacing.x1,
  },
  brandBlock: {
    width: "84%",
    alignSelf: "center",
    alignItems: "flex-start",
    marginBottom: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x1,
  },
  headingWordmarkStacked: {
    width: AUTH_HEADING_WORDMARK_WIDTH,
    height: AUTH_HEADING_WORDMARK_HEIGHT,
    marginTop: 2,
  },
  dictionaryLabel: {
    fontFamily: "Urbanist-400Italic",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
    marginTop: huddleSpacing.x1,
  },
  subheadingText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
  },
  createAccountLink: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  createAccountText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.text,
  },
  createAccountTextBold: {
    fontFamily: "Urbanist-700",
    color: huddleColors.blue,
  },
  card: {
    width: "84%",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.glass,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    gap: huddleSpacing.x2,
    ...huddleShadows.glassHeader,
  },
  appleLogoOnlyButton: {
    height: 21,
    width: 16,
  },
  socialRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: huddleSpacing.x4,
  },
  socialCircleWrap: {
    width: SOCIAL_CIRCLE_SIZE,
    height: SOCIAL_CIRCLE_SIZE,
    borderRadius: SOCIAL_CIRCLE_SIZE / 2,
    ...huddleShadows.glassElevation2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(66,73,101,0.20)",
  },
  dividerText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    color: huddleColors.mutedText,
  },
  fieldGroup: {
    gap: huddleSpacing.x2,
  },
  label: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.text,
  },
  field: {
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    color: huddleColors.text,
    backgroundColor: "rgba(255,255,255,0.72)",
    overflow: "hidden",
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
  },
  fieldError: {
    ...huddleFieldStates.error,
  },
  errorTextBold: {
    fontFamily: "Urbanist-800",
  },
  errorText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryLabel: {
    ...huddleButtons.label,
    fontSize: huddleType.body,
    lineHeight: huddleType.h4Line,
    color: huddleColors.onPrimary,
  },
  primaryButtonContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  secondaryLabel: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  linkButton: {
    minHeight: huddleLayout.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  linkLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    color: huddleColors.blue,
  },
  mutedLinkLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    color: huddleColors.mutedText,
  },
  footer: {
    width: "90%",
    alignSelf: "center",
    alignItems: "center",
  },
  footerText: {
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 20,
    color: "rgba(66,73,101,0.72)",
    textAlign: "center",
  },
  footerLink: {
    fontFamily: "Urbanist-600",
    color: huddleColors.blue,
  },
  pressed: {
    ...huddleButtons.pressed,
  },
  disabled: {
    ...huddleButtons.disabled,
  },
  authForgotButton: {
    minHeight: 32,
    alignSelf: "flex-start",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  authForgotLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.blue,
  },
  appModalBackdrop: {
    flex: 1,
    backgroundColor: huddleColors.backdrop,
  },
  appModalSafeArea: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x4,
  },
  appModalCard: {
    flex: 1,
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation2,
  },
  legalModalCard: {
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation2,
  },
  legalScroll: {
    flex: 1,
  },
  legalContent: {
    flex: 1,
  },
  legalStickyHeader: {
    minHeight: 48,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x2,
    paddingBottom: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: huddleColors.divider,
    backgroundColor: "#FFFFFF",
  },
  supportModalCard: {
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation2,
  },
  appModalClose: {
    position: "absolute",
    top: huddleSpacing.x3,
    right: huddleSpacing.x3,
    zIndex: 5,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  legalModalClose: {
    top: huddleSpacing.x2,
    right: huddleSpacing.x5,
  },
  legalHeaderClosePlaceholder: {
    width: 44,
    height: 44,
  },
  appModalWebView: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  legalScrollContent: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x7,
  },
  legalTitle: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 28,
    color: huddleColors.text,
  },
  legalSection: {
    marginTop: huddleSpacing.x4,
  },
  legalSectionTitle: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  legalBody: {
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.text,
  },
  legalBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
  },
  legalBulletDot: {
    width: 12,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.blue,
  },
  legalBulletText: {
    flex: 1,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.text,
  },
  legalMeta: {
    marginTop: huddleSpacing.x5,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  supportScrollContent: {
    padding: huddleSpacing.x4,
    paddingTop: huddleSpacing.x5,
    paddingBottom: huddleSpacing.x7,
  },
  supportPanel: {
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x3,
    gap: huddleSpacing.x4,
  },
  supportTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 28,
    color: huddleColors.text,
  },
  supportField: {
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    overflow: "hidden",
    color: huddleColors.text,
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  authIconField: {
    height: 52,
    minHeight: 52,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingLeft: huddleSpacing.x4,
    paddingRight: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  authFieldIcon: {
    marginRight: huddleSpacing.x2,
  },
  authFieldInput: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    height: 52,
    paddingVertical: 0,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
    includeFontPadding: false,
    textAlignVertical: "center",
    overflow: "hidden",
  },
  authPasswordRevealButton: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  supportFieldFocused: {
    ...huddleFieldStates.focused,
  },
  supportFieldError: {
    ...huddleFieldStates.error,
  },
  supportTextArea: {
    height: huddleFormFields.multilineHeight,
    maxHeight: huddleFormFields.multilineHeight,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x3,
  },
  supportCheckboxRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  supportCheckbox: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.26)",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.85,
    shadowRadius: 13,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  supportCheckboxChecked: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  supportCheckboxLabel: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  turnstileBox: {
    minHeight: 74,
    overflow: "hidden",
  },
  turnstileGroup: {
    gap: huddleSpacing.x2,
  },
  turnstileContainer: {
    height: 74,
    backgroundColor: "transparent",
  },
  turnstileWebView: {
    height: 74,
    backgroundColor: "transparent",
  },
  turnstileStatus: {
    position: "absolute",
    left: 2,
    bottom: 0,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  supportButtonStack: {
    gap: huddleSpacing.x3,
    paddingTop: huddleSpacing.x1,
  },
  supportSecondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  supportPrimaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  supportSuccess: {
    minHeight: 220,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    paddingTop: huddleSpacing.x7,
    paddingBottom: huddleSpacing.x7,
    gap: huddleSpacing.x3,
    backgroundColor: "#FFFFFF",
  },
  supportSuccessText: {
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 24,
    color: huddleColors.text,
  },
  resetBodyText: {
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(66,73,101,0.72)",
  },
  resetSuccess: {
    padding: huddleSpacing.x6,
    gap: huddleSpacing.x3,
  },
});
