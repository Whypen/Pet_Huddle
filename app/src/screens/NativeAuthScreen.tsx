import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Feather from "@expo/vector-icons/Feather";
import { useEventListener } from "expo";
import * as AppleAuthentication from "expo-apple-authentication";
import { useVideoPlayer, VideoView } from "expo-video";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { NativeTurnstile } from "../components/NativeTurnstile";
import type { NativeLegalPageContent } from "../content/nativeLegalPages";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import { huddleButtons, huddleColors, huddleFieldStates, huddleLayout, huddleRadii, huddleShadows, huddleSpacing, huddleType } from "../theme/huddleDesignTokens";
import { haptic } from "../lib/nativeHaptics";
import { useShakeAnimation } from "../lib/nativeAnimations";
import {
  getNativeBiometricAvailability,
  hasNativeBiometricSessionHint,
  restoreNativeBiometricSession,
} from "../lib/nativeBiometricAuth";
import { supabase, supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { createNativeFunctionHeaders } from "../lib/nativeFunctionClient";
import appleIcon from "../../assets/apple-icon.png";
import huddleVideoFallback from "../../assets/huddle-video-fallback-transparent.png";
import huddleVideo from "../../assets/huddle-video.mp4";
import { checkIdentifierRegistered, loadNativeSignupDraft, saveNativeSignupDraft } from "../lib/nativeSignup";

type NativeAuthScreenProps = {
  onAuthenticated: (session: Session) => void;
  onCreateAccount: (prefill?: { email?: string }) => void;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

type AuthFocusedField = "email" | "password" | null;
type EmailModalStep = "choice" | "signin";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const supportReplyEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const turnstileSiteKey =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ||
  process.env.VITE_TURNSTILE_SITE_KEY ||
  "0x4AAAAAAC1AMILxX8-lFNmm";
const AUTH_LOGO_MEDIA_SIZE = 160;
const legalModalTargets = {
  terms: {
    title: "Terms",
    path: "/terms",
  },
  privacy: {
    title: "Privacy Policy",
    path: "/privacy",
  },
} as const;

type LegalModalTarget = keyof typeof legalModalTargets;
type AppModalTarget = "support" | "resetPassword" | LegalModalTarget;

type SupportErrors = {
  message?: string;
  replyEmail?: string;
};

type SupportFocusedField = "subject" | "message" | "replyEmail" | null;

function getNativeSignInErrorCopy(message?: string | null) {
  const raw = String(message || "").trim();
  if (!raw) return "Couldn't sign in. Please try again.";

  const lower = raw.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Need help? Click Forgot Password to reset it.";
  }

  return raw;
}

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

function NativeSupportModal({
  onClose,
}: {
  onClose: () => void;
}) {
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
      const body = (await response.json().catch(() => null)) as { ticket_number?: string; error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || body?.message || `Support submit failed with HTTP ${response.status}.`);
      }
      setTicketNumber(body?.ticket_number || "received");
      setSubject("");
      setMessage("");
      setReplyEmail("");
      setWantsReply(false);
      setErrors({});
      setTurnstileToken("");
      setTurnstileError("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't send your message. Please try again.");
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
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.supportScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.supportPanel}>
        <Text style={styles.supportTitle}>Need help with huddle?</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Subject</Text>
          <TextInput
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
              if (!message.trim()) setErrors((current) => ({ ...current, message: "Please tell us how we can help." }));
            }}
            placeholder="How can we help?"
            placeholderTextColor={huddleColors.mutedText}
            editable={!submitting}
            multiline
            scrollEnabled
            textAlignVertical="top"
            style={[
              styles.supportField,
              styles.supportTextArea,
              focusedSupportField === "message" ? styles.supportFieldFocused : null,
              errors.message ? styles.supportFieldError : null,
            ]}
          />
          {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
        </View>

        <Pressable
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
          <View style={[styles.supportCheckbox, wantsReply ? styles.supportCheckboxChecked : null]}>
            {wantsReply ? <Feather name="check" size={16} color={huddleColors.onPrimary} /> : null}
          </View>
          <Text style={styles.supportCheckboxLabel}>Stay in touch via email</Text>
        </Pressable>

        {requiresReplyEmail ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
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
                  setErrors((current) => ({ ...current, replyEmail: "Enter your email if you want a reply." }));
                } else if (!supportReplyEmailPattern.test(trimmed)) {
                  setErrors((current) => ({ ...current, replyEmail: "Enter a valid email address." }));
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
              style={[
                styles.supportField,
                focusedSupportField === "replyEmail" ? styles.supportFieldFocused : null,
                errors.replyEmail ? styles.supportFieldError : null,
              ]}
            />
            {errors.replyEmail ? <Text style={styles.errorText}>{errors.replyEmail}</Text> : null}
          </View>
        ) : null}

        <View style={styles.turnstileGroup}>
          <NativeTurnstile
            action="support_ticket"
            onError={setTurnstileError}
            onToken={(token) => {
              setTurnstileToken(token);
              if (token) setTurnstileError("");
            }}
            siteKey={turnstileSiteKey}
          />
          {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
        </View>
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <View style={styles.supportButtonStack}>
          <Pressable
            disabled={submitting}
            onPress={() => void submitSupport()}
            style={({ pressed }) => [styles.supportPrimaryButton, pressed && !submitting ? styles.pressed : null, submitting ? styles.disabled : null]}
          >
            {submitting ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.primaryLabel}>Send</Text>}
          </Pressable>
          <Pressable
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

function NativeResetPasswordModal() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

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
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || body?.message || `Reset failed with HTTP ${response.status}.`);
      }
      setSentEmail(normalizedEmail);
      setTurnstileToken("");
      setTurnstileError("");
      setEmailError("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Couldn't send that reset email just now.");
    } finally {
      setSubmitting(false);
    }
  }, [normalizedEmail, turnstileError, turnstileToken]);

  if (sentEmail) {
    return (
      <View style={styles.resetSuccess}>
        <Text style={styles.supportTitle}>Check your inbox</Text>
        <Text style={styles.supportSuccessText}>We sent a password reset link to {sentEmail}.</Text>
        <Pressable
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
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.supportScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.supportPanel}>
        <Text style={styles.supportTitle}>Reset password</Text>
        <Text style={styles.resetBodyText}>Enter your email to receive a reset link.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
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
            onError={setTurnstileError}
            onToken={(token) => {
              setTurnstileToken(token);
              if (token) setTurnstileError("");
            }}
            siteKey={turnstileSiteKey}
          />
          {turnstileError ? <Text style={styles.errorText}>{turnstileError}</Text> : null}
        </View>

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          disabled={submitting}
          onPress={() => void submitReset()}
          style={({ pressed }) => [styles.supportPrimaryButton, pressed && !submitting ? styles.pressed : null, submitting ? styles.disabled : null]}
        >
          {submitting ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.primaryLabel}>Send reset link</Text>}
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
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={() => null}
          pointerEvents="none"
          style={styles.legalHeaderClosePlaceholder}
        />
      </View>
      <ScrollView
        bounces
        contentContainerStyle={styles.legalScrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={styles.legalScroll}
      >
        {page.intro.map((paragraph, index) => (
          <Text key={`intro-${index}`} style={styles.legalBody}>
            {paragraph}
          </Text>
        ))}
        {page.sections.map((section) => (
          <View key={section.title} style={styles.legalSection}>
            <Text style={styles.legalSectionTitle}>{section.title}</Text>
            {section.body.map((paragraph, index) => (
              <Text key={`${section.title}-${index}`} style={styles.legalBody}>
                {paragraph}
              </Text>
            ))}
            {section.bullets?.map((bullet, index) => (
              <View key={`${section.title}-bullet-${index}`} style={styles.legalBulletRow}>
                <Text style={styles.legalBulletDot}>•</Text>
                <Text style={styles.legalBulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.legalMeta}>{page.effectiveDate}</Text>
      </ScrollView>
    </View>
  );
}

export function NativeAuthScreen({ onAuthenticated, onCreateAccount }: NativeAuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const modalMaxHeight = Math.round(windowHeight * 0.8);
  const passwordInputRef = useRef<TextInput | null>(null); // AU1: focus next on email submit
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalStep, setEmailModalStep] = useState<EmailModalStep>("choice");
  const [appModalTarget, setAppModalTarget] = useState<AppModalTarget | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [focusedAuthField, setFocusedAuthField] = useState<AuthFocusedField>(null);
  const [authError, setAuthError] = useState("");
  const [signinPasswordVisible, setSigninPasswordVisible] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFrameReady, setVideoFrameReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signInShakeAnim, triggerSignInShake] = useShakeAnimation();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [biometricDeviceSupported, setBiometricDeviceSupported] = useState(false);
  const [biometricAccountEnabled, setBiometricAccountEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometric Sign In");

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const showBiometricLogin = biometricDeviceSupported && biometricAccountEnabled;
  const legalPage = appModalTarget === "terms" || appModalTarget === "privacy"
    ? getNativeLegalPage(legalModalTargets[appModalTarget].path)
    : null;
  const logoPlayer = useVideoPlayer(huddleVideo, (player) => {
    player.loop = true;
    player.muted = true;
    player.timeUpdateEventInterval = 0.1;
    player.play();
  });
  useEventListener(logoPlayer, "statusChange", ({ status, error }) => {
    if (status === "error" || error) {
      setVideoFailed(true);
      setVideoReady(false);
      setVideoFrameReady(false);
    }
  });
  useEventListener(logoPlayer, "sourceLoad", () => {
    setVideoFailed(false);
    setVideoReady(true);
    setVideoFrameReady(false);
  });
  useEventListener(logoPlayer, "timeUpdate", ({ currentTime }) => {
    if (currentTime > 0) {
      setVideoFrameReady(true);
    }
  });

  useEffect(() => {
    let active = true;
    void AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setAppleAvailable(available);
      })
      .catch(() => {
        if (active) setAppleAvailable(false);
      });
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
        setBiometricLabel(availability.label);
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
    if (!emailPattern.test(normalizedEmail)) nextErrors.email = "Check that email? We don't see it in huddle.";
    if (password.length < 8) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [normalizedEmail, password.length]);

  const handleEmailSignIn = useCallback(async () => {
    setAuthError("");
    if (!validate()) {
      haptic.error();
      triggerSignInShake();
      return;
    }
    setLoading(true);
    try {
      const identifierCheck = await checkIdentifierRegistered(normalizedEmail, "");
      if (!identifierCheck?.registered) {
        setErrors((current) => ({
          ...current,
          email: "Check that email? We don't see it in huddle.",
          password: undefined,
        }));
        setAuthError("");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("session_missing");
      haptic.success();
      onAuthenticated(data.session);
    } catch (error) {
      haptic.error();
      setAuthError(getNativeSignInErrorCopy(error instanceof Error ? error.message : null));
    } finally {
      setLoading(false);
    }
  }, [normalizedEmail, onAuthenticated, password, triggerSignInShake, validate]);

  const handleAppleSignIn = useCallback(async () => {
    setAuthError("");
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error("apple_identity_token_missing");
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) throw error;
      if (!data.session) throw new Error("session_missing");
      haptic.success();
      onAuthenticated(data.session);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Couldn't start Apple sign in.";
      haptic.error();
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  }, [onAuthenticated]);

  const handleBiometricLogin = useCallback(async () => {
    setAuthError("");
    setLoading(true);
    try {
      const session = await restoreNativeBiometricSession();
      haptic.success();
      onAuthenticated(session);
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

  const openEmailChoice = useCallback(() => {
    setAuthError("");
    setErrors({});
    setEmailModalStep("choice");
    setEmailModalOpen(true);
  }, []);

  const openSignInStep = useCallback(() => {
    setAuthError("");
    setErrors({});
    setEmailModalStep("signin");
  }, []);

  const closeEmailModal = useCallback(() => {
    setEmailModalOpen(false);
    setAuthError("");
    setErrors({});
    setFocusedAuthField(null);
    setEmailModalStep("choice");
  }, []);

  const handleCreateAccount = useCallback(async () => {
    const prefillEmail = normalizedEmail;
    if (prefillEmail && emailPattern.test(prefillEmail)) {
      try {
        const currentDraft = await loadNativeSignupDraft();
        await saveNativeSignupDraft({ ...currentDraft, email: prefillEmail });
      } catch {
        // Best-effort prefill only.
      }
    }
    closeEmailModal();
    setEmail("");
    setPassword("");
    onCreateAccount(prefillEmail ? { email: prefillEmail } : undefined);
  }, [closeEmailModal, normalizedEmail, onCreateAccount]);

  const openResetPassword = useCallback(() => {
    closeEmailModal();
    setAppModalTarget("resetPassword");
  }, [closeEmailModal]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Pressable
            onPress={() => setAppModalTarget("support")}
            style={({ pressed }) => [styles.helpButton, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Help"
          >
            <Text style={styles.helpLabel}>Help</Text>
          </Pressable>
        </View>

        <View style={[styles.content, { paddingBottom: 72 + insets.bottom }]}>
          <View style={styles.brandBlock}>
            <View style={styles.logoWindow}>
              <Image source={huddleVideoFallback} resizeMode="contain" style={styles.logoFallbackImage} />
              {videoReady && !videoFailed ? (
                <View pointerEvents="none" style={[styles.logoVideoClip, videoFrameReady ? null : styles.logoVideoLoading]}>
                  <VideoView
                    player={logoPlayer}
                    nativeControls={false}
                    fullscreenOptions={{ enable: false }}
                    contentFit="contain"
                    style={styles.logoVideo}
                  />
                </View>
              ) : null}
            </View>
            <Text style={styles.brandName}>huddle</Text>
          </View>

          <View style={styles.card}>
            <Pressable
              disabled={loading}
              onPress={openEmailChoice}
              style={({ pressed }) => [styles.authChoiceButton, pressed && !loading ? styles.pressed : null]}
            >
              <View style={styles.authChoiceInner}>
                <View style={styles.choiceIconSlot}>
                  <Feather name="mail" size={16} color={huddleColors.text} />
                </View>
                <Text style={styles.authChoiceLabel}>Continue with Email</Text>
              </View>
            </Pressable>

            {appleAvailable ? (
              <Pressable
                disabled={loading}
                onPress={() => void handleAppleSignIn()}
                style={({ pressed }) => [styles.authChoiceButton, pressed && !loading ? styles.pressed : null]}
              >
                <View style={styles.authChoiceInner}>
                  <View style={styles.choiceIconSlot}>
                    <Image source={appleIcon} resizeMode="contain" style={styles.appleIcon} />
                  </View>
                  <Text style={styles.authChoiceLabel}>Continue with Apple</Text>
                </View>
              </Pressable>
            ) : null}

            {showBiometricLogin ? (
              <Pressable
                disabled={loading}
                onPress={() => void handleBiometricLogin()}
                style={({ pressed }) => [styles.authChoiceButton, pressed && !loading ? styles.pressed : null]}
              >
                <View style={styles.authChoiceInner}>
                  <View style={styles.choiceIconSlot}>
                    <Feather name="shield" size={17} color={huddleColors.text} />
                  </View>
                  <Text style={styles.authChoiceLabel}>Continue with {biometricLabel}</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: 20 + insets.bottom }]}>
          <Text style={styles.footerText}>By continuing, you agree to huddle's</Text>
          <Text style={styles.footerText}>
            <Text style={styles.footerLink} onPress={() => setAppModalTarget("terms")}>
              Terms
            </Text>{" "}
            and{" "}
            <Text style={styles.footerLink} onPress={() => setAppModalTarget("privacy")}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>

        <Modal
          animationType="fade"
          transparent
          visible={emailModalOpen}
          onRequestClose={closeEmailModal}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeEmailModal}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
              <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
                <Pressable
                  hitSlop={huddleSpacing.x2}
                  onPress={closeEmailModal}
                  style={({ pressed }) => [
                    styles.appModalClose,
                    appModalTarget === "terms" || appModalTarget === "privacy" ? styles.legalModalClose : null,
                    pressed ? styles.pressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={24} color={huddleColors.text} />
                </Pressable>
                <Text style={styles.modalTitle}>{emailModalStep === "choice" ? "Continue with Email" : "Sign in"}</Text>

                <View style={styles.modalStack}>
                  {emailModalStep === "choice" ? (
                    <>
                      <Pressable
                        disabled={loading}
                        onPress={openSignInStep}
                        style={({ pressed }) => [styles.primaryButton, pressed && !loading ? styles.pressed : null, loading ? styles.disabled : null]}
                      >
                        <Text style={styles.primaryLabel}>Sign in</Text>
                      </Pressable>

                      <Pressable
                        disabled={loading}
                        onPress={handleCreateAccount}
                        style={({ pressed }) => [styles.modalSecondaryButton, pressed && !loading ? styles.pressed : null, loading ? styles.disabled : null]}
                      >
                        <Text style={styles.secondaryLabel}>Create account</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Email</Text>
                      <TextInput
                        value={email}
                        onFocus={() => setFocusedAuthField("email")}
                        onChangeText={(next) => {
                          setEmail(next);
                          setAuthError("");
                          if (errors.email && emailPattern.test(next.trim().toLowerCase())) {
                            setErrors((current) => ({ ...current, email: undefined }));
                          }
                        }}
                        onBlur={() => {
                          setFocusedAuthField(null);
                          if (!emailPattern.test(normalizedEmail)) {
                            setErrors((current) => ({ ...current, email: "Check that email? We don't see it in huddle." }));
                          }
                        }}
                        placeholder="name@email.com"
                        placeholderTextColor={huddleColors.mutedText}
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect={false}
                        keyboardType="email-address"
                        onSubmitEditing={() => passwordInputRef.current?.focus()}
                        returnKeyType="next"
                        textContentType="username"
                        editable={!loading}
                        style={[
                          styles.supportField,
                          focusedAuthField === "email" ? styles.supportFieldFocused : null,
                          errors.email ? styles.supportFieldError : null,
                        ]}
                      />
                      {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Password</Text>
                      <View
                        style={[
                          styles.authPasswordField,
                          focusedAuthField === "password" ? styles.supportFieldFocused : null,
                          errors.password || authError ? styles.supportFieldError : null,
                        ]}
                      >
                        <TextInput
                          ref={passwordInputRef}
                          value={password}
                          onFocus={() => setFocusedAuthField("password")}
                          onChangeText={(next) => {
                            setPassword(next);
                            setAuthError("");
                            if (errors.password && next.length >= 8) {
                              setErrors((current) => ({ ...current, password: undefined }));
                            }
                          }}
                          onBlur={() => {
                            setFocusedAuthField(null);
                            if (password.length < 8) {
                              setErrors((current) => ({ ...current, password: "Enter your password." }));
                            }
                          }}
                          onSubmitEditing={() => void handleEmailSignIn()}
                          returnKeyType="done"
                          placeholder="Password"
                          placeholderTextColor={huddleColors.mutedText}
                          autoComplete="current-password"
                          secureTextEntry={!signinPasswordVisible}
                          textContentType="password"
                          editable={!loading}
                          style={styles.authPasswordInput}
                        />
                        <Pressable
                          disabled={loading}
                          onPress={() => setSigninPasswordVisible((visible) => !visible)}
                          style={({ pressed }) => [styles.authPasswordRevealButton, pressed && !loading ? styles.pressed : null]}
                          accessibilityRole="button"
                          accessibilityLabel={signinPasswordVisible ? "Hide password" : "Show password"}
                        >
                          <Feather name={signinPasswordVisible ? "eye-off" : "eye"} size={19} color="rgba(74,73,101,0.55)" />
                        </Pressable>
                      </View>
                      {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
                    </View>

                    {authError ? <NativeSignInErrorText message={getNativeSignInErrorCopy(authError)} style={styles.errorText} /> : null}

                    <Animated.View style={{ transform: [{ translateX: signInShakeAnim }] }}>
                      <Pressable
                        disabled={loading}
                        onPress={() => void handleEmailSignIn()}
                        style={({ pressed }) => [styles.primaryButton, pressed && !loading ? styles.pressed : null, loading ? styles.disabled : null]}
                      >
                        {loading ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.primaryLabel}>Sign in</Text>}
                      </Pressable>
                    </Animated.View>

                    <Pressable
                      disabled={loading}
                      onPress={openResetPassword}
                      style={({ pressed }) => [styles.authForgotButton, pressed && !loading ? styles.pressed : null]}
                    >
                      <Text style={styles.authForgotLabel}>Forgot password?</Text>
                    </Pressable>

                    <Pressable
                      disabled={loading}
                      onPress={handleCreateAccount}
                      style={({ pressed }) => [styles.authForgotButton, pressed && !loading ? styles.pressed : null]}
                    >
                      <Text style={styles.authForgotLabel}>{authError ? "New here? Create an account" : "Create account"}</Text>
                    </Pressable>
                    </>
                  )}
                  </View>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>

        <Modal
          animationType="fade"
          transparent
          visible={appModalTarget !== null}
          onRequestClose={() => setAppModalTarget(null)}
        >
          <View style={styles.appModalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setAppModalTarget(null)} />
            <SafeAreaView
              pointerEvents="box-none"
              style={[
                styles.appModalSafeArea,
                appModalTarget === "support" || appModalTarget === "resetPassword"
                  ? { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }
                  : { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 28 },
              ]}
            >
              <View
                style={
                  appModalTarget === "support" || appModalTarget === "resetPassword"
                    ? [styles.supportModalCard, { maxHeight: modalMaxHeight }]
                    : [styles.legalModalCard, { height: modalMaxHeight }]
                }
              >
                <Pressable
                  hitSlop={huddleSpacing.x2}
                  onPress={() => setAppModalTarget(null)}
                  style={({ pressed }) => [
                    styles.appModalClose,
                    appModalTarget === "terms" || appModalTarget === "privacy" ? styles.legalModalClose : null,
                    pressed ? styles.pressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={24} color={huddleColors.text} />
                </Pressable>
                {appModalTarget === "support" ? (
                  <NativeSupportModal onClose={() => setAppModalTarget(null)} />
                ) : appModalTarget === "resetPassword" ? (
                  <NativeResetPasswordModal />
                ) : legalPage ? (
                  <NativeAuthLegalModalContent page={legalPage} />
                ) : null}
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
  },
  topBar: {
    position: "absolute",
    top: 16,
    right: 28,
    left: 28,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    fontSize: 17,
    lineHeight: 24,
    color: "rgba(66,73,101,0.54)",
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: huddleSpacing.x6,
  },
  logoWindow: {
    width: 160,
    height: 132,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -18,
    overflow: "hidden",
  },
  logoFallbackImage: {
    position: "absolute",
    width: AUTH_LOGO_MEDIA_SIZE,
    height: AUTH_LOGO_MEDIA_SIZE,
  },
  logoVideoClip: {
    position: "absolute",
    width: AUTH_LOGO_MEDIA_SIZE,
    height: AUTH_LOGO_MEDIA_SIZE,
    overflow: "hidden",
    backgroundColor: huddleColors.canvas,
  },
  logoVideo: {
    position: "absolute",
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    backgroundColor: huddleColors.canvas,
  },
  logoVideoLoading: {
    opacity: 0,
  },
  brandName: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.blue,
  },
  card: {
    width: "88%",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: 24,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x3,
    gap: huddleSpacing.x3,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation2,
  },
  authChoiceButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
    width: "100%",
  },
  authChoiceInner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
  },
  choiceIconSlot: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceIcon: {
    width: 20,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    color: huddleColors.text,
    textAlign: "center",
  },
  appleIcon: {
    width: 16,
    height: 16,
  },
  authChoiceLabel: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
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
    height: huddleLayout.fieldHeight,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: 15,
    color: huddleColors.text,
    backgroundColor: "rgba(255,255,255,0.72)",
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
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  modalSecondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
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
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    paddingTop: huddleSpacing.x2,
    paddingHorizontal: 28,
    backgroundColor: huddleColors.canvas,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x5,
    backgroundColor: huddleColors.backdrop,
  },
  modalKeyboard: {
    width: "100%",
  },
  modalCard: {
    width: "100%",
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    borderRadius: huddleRadii.sheet,
    padding: huddleSpacing.x5,
    gap: huddleSpacing.x4,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassHeader,
  },
  modalTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
  },
  modalStack: {
    gap: huddleSpacing.x3,
  },
  authForgotButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  authForgotLabel: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 18,
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
    minHeight: 52,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  authPasswordField: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingLeft: huddleSpacing.x4,
    paddingRight: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  authPasswordInput: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 0,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
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
    height: 108,
    maxHeight: 108,
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
