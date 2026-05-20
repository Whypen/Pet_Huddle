import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  Linking,
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
import { LinearGradient } from "expo-linear-gradient";
import type { Session } from "@supabase/supabase-js";
import { isValidPhoneNumber } from "libphonenumber-js";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppConfirmModal,
  AppModalCard,
  AppModalCloseButton,
} from "../components/nativeModalPrimitives";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativeTurnstile } from "../components/NativeTurnstile";
import type { NativeLegalPageContent } from "../content/nativeLegalPages";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import signupDobImage from "../../assets/Sign up/Signup_DOB.png";
import signupNameImage from "../../assets/Sign up/Signup_Name.png";
import signupVerifyImage from "../../assets/Sign up/Signup_verify.png";
import verifyEmailImage from "../../assets/Verify-Email.png";
import {
  authSignupNative,
  checkIdentifierRegistered,
  checkSocialIdTaken,
  clearNativeSignupDraft,
  confirmPreSignupVerify,
  emptyNativeSignupDraft,
  getPreSignupVerifyStatus,
  loadNativeSignupDraft,
  saveNativeSignupDraft,
  sendPreSignupVerify,
  type NativeSignupDraft,
  type NativeSignupStep,
  type NativeSignupVerifyLink,
} from "../lib/nativeSignup";
import { haptic } from "../lib/nativeHaptics";
import { supabase } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

const turnstileSiteKey =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ||
  process.env.VITE_TURNSTILE_SITE_KEY ||
  "0x4AAAAAAC1AMILxX8-lFNmm";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{1,14}$/;
const socialIdPattern = /^[A-Za-z0-9_.-]{6,15}$/;
const RESEND_COOLDOWN_SECS = 40;
const POLL_INTERVAL_MS = 5000; // EC5: throttled from 3s → 5s to reduce battery during email-confirmation step
const SIGNUP_SESSION_RETRY_COUNT = 12;
const SIGNUP_SESSION_RETRY_DELAY_MS = 250;
const SETPROFILE_PREFILL_KEY = "setprofile_prefill";
const SIGNUP_FLOW_STATE_KEY = "huddle_signup_flow_state_v1";
const VERIFY_IDENTITY_NAV_KEY = "huddle_vi_nav";
const appEnv = String(process.env.EXPO_PUBLIC_APP_ENV || process.env.VITE_APP_ENV || "").toLowerCase();
const shouldBypassDuplicateCheck =
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  (
    appEnv === "test" ||
    appEnv === "testing" ||
    String(process.env.EXPO_PUBLIC_E2E_MODE || process.env.VITE_E2E_MODE || "false") === "true"
  );
const monthOptions = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type NativeSignupScreenProps = {
  initialVerifyLink?: NativeSignupVerifyLink | null;
  onCancel: () => void;
  onOpenWebPath: (path: string) => void;
  onSignedIn: (
    session: Session,
    nextPath: string,
    webLocalStorage?: Record<string, string>,
    webSessionStorage?: Record<string, string>,
  ) => void;
};

type FieldErrors = Record<string, string | undefined>;
type DobPickerKind = "month" | "day" | "year";
type ButtonVariant = "primary" | "secondary" | "ghost";
type LegalModalTarget = "terms" | "privacy";
const legalModalTargets = {
  terms: "/terms",
  privacy: "/privacy",
} as const;

const pad2 = (value: string) => value.padStart(2, "0");

function parseDob(value: string) {
  if (!value) return null;
  let yyyy: number;
  let mm: number;
  let dd: number;
  if (value.includes("-")) {
    [yyyy, mm, dd] = value.split("-").map((part) => Number(part));
  } else {
    const [p1, p2, p3] = value.split("/").map((part) => Number(part));
    if (!p1 || !p2 || !p3) return null;
    yyyy = p3;
    mm = p1;
    dd = p2;
    if (p1 > 12 && p2 <= 12) {
      dd = p1;
      mm = p2;
    }
  }
  if (!yyyy || !mm || !dd) return null;
  const parsed = new Date(yyyy, mm - 1, dd);
  if (parsed.getFullYear() !== yyyy || parsed.getMonth() !== mm - 1 || parsed.getDate() !== dd) return null;
  return parsed;
}

function dobPartsFromStored(value: string) {
  const parsed = parseDob(value);
  if (!parsed) {
    if (value.includes("-")) {
      const [year = "", month = "", day = ""] = value.split("-");
      return { year, month, day };
    }
    return { year: "", month: "", day: "" };
  }
  return {
    year: String(parsed.getFullYear()),
    month: pad2(String(parsed.getMonth() + 1)),
    day: pad2(String(parsed.getDate())),
  };
}

function isAtLeastAge(value: string, age: number) {
  const parsed = parseDob(value);
  if (!parsed) return false;
  const now = new Date();
  const years = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();
  const actualAge = monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate()) ? years - 1 : years;
  return actualAge >= age;
}

function isValidDob(value: string) {
  const parsed = parseDob(value);
  if (!parsed) return false;
  const year = parsed.getFullYear();
  return year >= 1900 && year <= 3000;
}

function isNotFutureDob(value: string) {
  const parsed = parseDob(value);
  if (!parsed) return false;
  return parsed.getTime() <= Date.now();
}

function isValidSignupPhone(value: string) {
  const normalized = value.trim();
  if (!phonePattern.test(normalized)) return false;
  try {
    return isValidPhoneNumber(normalized);
  } catch {
    return false;
  }
}

function resolveSignupError(message: string) {
  if (message === "account_unavailable") {
    return "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake.";
  }
  if (message === "signup_temporarily_unavailable") {
    return "Signup is temporarily unavailable. Please try again later.";
  }
  if (message.includes("signup_proof")) {
    return "Email verification expired. Please verify your email again.";
  }
  if (message.includes("turnstile") || message.includes("human")) {
    return "Complete human verification first.";
  }
  if (message === "email_send_failed" || message === "send_failed" || message === "network_error") {
    return "We couldn't send a verification email. Check your connection and tap Resend.";
  }
  return message || "Account creation failed. Please try again.";
}

function mapSigninFailureMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  if (
    normalized.includes("load failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network_error") ||
    normalized.includes("timeout") ||
    normalized.includes("fetch")
  ) {
    return "Sign in is taking too long. Please try again.";
  }
  return message || "Couldn't sign you in.";
}

function normalizeStorageOwner(owner: string | null | undefined) {
  return String(owner || "").trim().toLowerCase().replace(/[^a-z0-9_.@-]/g, "");
}

function buildScopedStorageKey(base: string, owner: string | null | undefined) {
  const normalizedOwner = normalizeStorageOwner(owner);
  return normalizedOwner ? `${base}:${normalizedOwner}` : base;
}

function stepNumber(step: NativeSignupStep) {
  if (step === "emailConfirmation" || step === "name") return 3;
  if (step === "verifyDecision") return 4;
  return step === "credentials" ? 2 : 1;
}

function StepPill({ step }: { step: NativeSignupStep }) {
  return (
    <View pointerEvents="none" style={styles.stepHeader}>
      <View style={styles.progressTrack} />
      <LinearGradient
        colors={["#2145CF", "#3A5FE8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.progressFill, { width: `${stepNumber(step) * 25}%` }]}
      />
      <Text style={styles.stepText}>Step {stepNumber(step)} of 4</Text>
    </View>
  );
}

function SignupHeroImage({ source, compact, flush, trimmed }: { source: ImageSourcePropType; compact?: boolean; flush?: boolean; trimmed?: boolean }) {
  return <Image source={source} resizeMode="contain" style={[styles.heroImage, compact ? styles.heroImageCompact : null, trimmed ? styles.heroImageTrimmed : null, flush ? styles.heroImageFlush : null]} />;
}

function SignupButton({
  compact,
  disabled,
  hitSlop,
  label,
  leadingIcon,
  loading,
  loadingLabel,
  onPress,
  secondary,
  variant,
}: {
  compact?: boolean;
  disabled?: boolean;
  hitSlop?: number;
  label: string;
  leadingIcon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  onPress: () => void;
  secondary?: boolean;
  variant?: ButtonVariant;
}) {
  const resolvedVariant: ButtonVariant = variant ?? (secondary ? "secondary" : "primary");
  return (
    <Pressable
      disabled={disabled || loading}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        resolvedVariant === "primary"
          ? styles.primaryButton
          : resolvedVariant === "ghost"
            ? styles.ghostButton
            : styles.secondaryButton,
        compact ? styles.compactButton : null,
        pressed && !(disabled || loading) ? styles.pressed : null,
        disabled || loading ? styles.disabled : null,
      ]}
    >
      {loading && loadingLabel ? (
        <Text style={resolvedVariant === "primary" ? styles.primaryButtonLabel : resolvedVariant === "ghost" ? styles.ghostButtonLabel : styles.secondaryButtonLabel}>{loadingLabel}</Text>
      ) : loading ? (
        <ActivityIndicator color={resolvedVariant === "primary" ? huddleColors.onPrimary : huddleColors.blue} />
      ) : (
        <View style={styles.buttonLabelRow}>
          {leadingIcon}
          <Text style={resolvedVariant === "primary" ? styles.primaryButtonLabel : resolvedVariant === "ghost" ? styles.ghostButtonLabel : styles.secondaryButtonLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Field({
  autoCapitalize = "none",
  error,
  keyboardType,
  label,
  leadingIcon,
  onChangeText,
  onFocus,
  placeholder = "",
  disabled,
  secureTextEntry,
  trailing,
  value,
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  label: string;
  leadingIcon?: ReactNode;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  trailing?: ReactNode;
  value: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        editable={!disabled}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        placeholder={placeholder}
        placeholderTextColor={huddleColors.mutedText}
        secureTextEntry={secureTextEntry}
        style={[
          styles.field,
          leadingIcon ? styles.fieldWithLeadingIcon : null,
          trailing ? styles.fieldWithTrailingIcon : null,
          focused ? styles.fieldFocused : null,
          error ? styles.fieldError : null,
          disabled ? styles.fieldDisabled : null,
        ]}
        value={value}
      />
      {leadingIcon ? <View pointerEvents="none" style={styles.fieldLeadingIcon}>{leadingIcon}</View> : null}
      {trailing ? <View style={styles.fieldTrailingIcon}>{trailing}</View> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function NativeSignupLegalModalContent({ page, onClose }: { page: NativeLegalPageContent; onClose: () => void }) {
  return (
    <View style={styles.legalModalContent}>
      <View style={styles.legalModalStickyHeader}>
        <Text style={styles.legalModalTitle}>{page.title}</Text>
        <Pressable
          hitSlop={huddleSpacing.x2}
          onPress={onClose}
          style={({ pressed }) => [styles.legalModalClose, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={24} color={huddleColors.text} />
        </Pressable>
      </View>
      <ScrollView
        bounces
        contentContainerStyle={styles.legalModalScrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={styles.legalModalScroll}
      >
        {page.intro.map((paragraph, index) => (
          <Text key={`intro-${index}`} style={styles.legalModalBody}>{paragraph}</Text>
        ))}
        {page.sections.map((section) => (
          <View key={section.title} style={styles.legalModalSection}>
            <Text style={styles.legalModalSectionTitle}>{section.title}</Text>
            {section.body.map((paragraph, index) => (
              <Text key={`${section.title}-${index}`} style={styles.legalModalBody}>{paragraph}</Text>
            ))}
            {section.bullets?.map((bullet, index) => (
              <View key={`${section.title}-bullet-${index}`} style={styles.legalModalBulletRow}>
                <Text style={styles.legalModalBulletDot}>•</Text>
                <Text style={styles.legalModalBulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.legalModalMeta}>{page.effectiveDate}</Text>
      </ScrollView>
    </View>
  );
}

export function NativeSignupScreen({ initialVerifyLink, onCancel, onOpenWebPath, onSignedIn }: NativeSignupScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const modalMaxHeight = Math.round(windowHeight * 0.8);
  const [step, setStep] = useState<NativeSignupStep>(initialVerifyLink ? "emailConfirmation" : "dob");
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [profileOnboardingCompleted, setProfileOnboardingCompleted] = useState(false);
  const [draft, setDraft] = useState<NativeSignupDraft>(emptyNativeSignupDraft);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [manualCheck, setManualCheck] = useState<"idle" | "checking" | "not_yet">("idle");
  const continueShakeAnim = useRef(new Animated.Value(0)).current;
  const [lastSendSentEmail, setLastSendSentEmail] = useState<boolean | null>(null);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [changeEmailConfirmOpen, setChangeEmailConfirmOpen] = useState(false);
  const [updatesChecked, setUpdatesChecked] = useState(true);
  const [dobPicker, setDobPicker] = useState<DobPickerKind | null>(null);
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState("");
  const [signupBlockedMessage, setSignupBlockedMessage] = useState("");
  const [socialAvailability, setSocialAvailability] = useState<"idle" | "checking" | "available" | "taken" | "failed">("idle");
  const [socialRetryNonce, setSocialRetryNonce] = useState(0);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinPasswordVisible, setSigninPasswordVisible] = useState(false);
  const [signinLoading, setSigninLoading] = useState(false);
  const [signinError, setSigninError] = useState("");
  const [focusedSigninField, setFocusedSigninField] = useState<"email" | "password" | null>(null);
  const signinPasswordInputRef = useRef<TextInput | null>(null);
  const signupScrollRef = useRef<ScrollView | null>(null);
  const [dismissedDuplicateKey, setDismissedDuplicateKey] = useState<string | null>(null);
  const [legalModalTarget, setLegalModalTarget] = useState<LegalModalTarget | null>(null);
  const [verificationSubmitted, setVerificationSubmitted] = useState(false);
  const handledInitialVerifyLink = useRef(false);
  const stepTransition = useRef(new Animated.Value(1)).current;

  const updateDraft = useCallback((next: Partial<NativeSignupDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  useEffect(() => {
    let active = true;
    void loadNativeSignupDraft().then((saved) => {
      if (!active) return;
      setDraft((current) => ({ ...current, ...saved }));
      if (saved.password) setConfirmPassword(saved.password);
      setVerificationSubmitted(Boolean(saved.verificationSubmitted));
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthSession(data.session ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthSession(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const userId = authSession?.user?.id;
    if (!userId) {
      setProfileOnboardingCompleted(false);
      return () => {
        active = false;
      };
    }
    const loadProfileState = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("onboarding_completed").limit(20)
          .eq("id", userId)
          .maybeSingle();
        if (active) setProfileOnboardingCompleted(data?.onboarding_completed === true);
      } catch {
        if (active) setProfileOnboardingCompleted(false);
      }
    };
    void loadProfileState();
    return () => {
      active = false;
    };
  }, [authSession?.user?.id]);

  useEffect(() => {
    if (!loaded) return;
    void saveNativeSignupDraft({ ...draft, turnstileToken });
  }, [draft, loaded, turnstileToken]);

  useEffect(() => {
    stepTransition.setValue(0);
    Animated.timing(stepTransition, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, stepTransition]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (manualCheck !== "not_yet") return;
    Animated.sequence([
      Animated.timing(continueShakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(continueShakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(continueShakeAnim, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(continueShakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(continueShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [continueShakeAnim, manualCheck]);

  const normalizedEmail = draft.email.trim().toLowerCase();
  const oauthProvider = String(authSession?.user?.app_metadata?.provider || "");
  const isOAuthOnboarding = Boolean(authSession?.user && oauthProvider && oauthProvider !== "email" && !profileOnboardingCompleted);
  const oauthEmail = String(authSession?.user?.email || "").trim().toLowerCase();
  const duplicateKey = `${normalizedEmail}|${draft.phone.trim()}`;
  const phoneValid = isValidSignupPhone(draft.phone);
  const passwordRequirementError = isOAuthOnboarding
    ? undefined
    : draft.password.length < 8
      ? "Minimum 8 characters"
      : !/[A-Z]/.test(draft.password)
        ? "Must include uppercase letter"
        : !/[0-9]/.test(draft.password)
          ? "Must include number"
          : !/[!@#$%^&*]/.test(draft.password)
            ? "Must include special character"
            : undefined;
  const confirmPasswordError = !isOAuthOnboarding && confirmPassword && confirmPassword !== draft.password ? "Passwords do not match" : undefined;
  const dobParts = useMemo(() => dobPartsFromStored(draft.dob), [draft.dob]);
  const assembledDob = dobParts.year && dobParts.month && dobParts.day ? `${dobParts.year}-${pad2(dobParts.month)}-${pad2(dobParts.day)}` : "";
  const allDobSelected = Boolean(dobParts.year && dobParts.month && dobParts.day);
  const isCalendarDobValid = allDobSelected ? isValidDob(assembledDob) : false;
  const isFutureDobValid = allDobSelected ? isNotFutureDob(assembledDob) : false;
  const isUnder13 = allDobSelected && isCalendarDobValid && isFutureDobValid ? !isAtLeastAge(assembledDob, 13) : false;
  const isUnder16But13 = allDobSelected && isCalendarDobValid && isFutureDobValid && !isUnder13 ? !isAtLeastAge(assembledDob, 16) : false;
  const liveDobError = allDobSelected
    ? isUnder13
      ? "You must be at least 13 years old to use Huddle."
      : !isCalendarDobValid || !isFutureDobValid
        ? "Invalid date"
        : undefined
    : errors.dob;
  const liveDobWarning = !liveDobError && isUnder16But13 ? "You must be 16+ to access Discover feature on Chats." : undefined;
  const canContinueDob = Boolean(allDobSelected && isCalendarDobValid && isFutureDobValid && !isUnder13);
  const canContinueCredentials = Boolean(
    (isOAuthOnboarding || emailPattern.test(normalizedEmail)) &&
    phoneValid &&
    (isOAuthOnboarding || (
      draft.password.length >= 8 &&
      /[A-Z]/.test(draft.password) &&
      /[0-9]/.test(draft.password) &&
      /[!@#$%^&*]/.test(draft.password) &&
      confirmPassword === draft.password &&
      turnstileToken.trim()
    )) &&
    !signupBlockedMessage &&
    (isOAuthOnboarding ? !duplicateDetected : true) &&
    !checkingDuplicate &&
    (shouldBypassDuplicateCheck || !duplicateCheckError) &&
    !busy,
  );
  const canContinueName = Boolean(
    draft.displayName.trim() &&
    socialIdPattern.test(draft.socialId.trim()) &&
    socialAvailability !== "checking" &&
    socialAvailability !== "failed" &&
    !busy,
  );
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - 13;
  const yearOptions = useMemo(
    () => Array.from({ length: maxYear - 1900 + 1 }, (_, index) => String(maxYear - index)),
    [maxYear],
  );
  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, index) => pad2(String(index + 1))), []);

  useEffect(() => {
    if (isOAuthOnboarding && oauthEmail && draft.email !== oauthEmail) {
      updateDraft({ email: oauthEmail });
    }
  }, [draft.email, isOAuthOnboarding, oauthEmail, updateDraft]);

  useEffect(() => {
    setDuplicateDetected(false);
    setDuplicateCheckError("");
    setSignupBlockedMessage("");
    const trimmedEmail = normalizedEmail;
    const trimmedPhone = draft.phone.trim();
    if (shouldBypassDuplicateCheck) {
      setCheckingDuplicate(false);
      return;
    }
    if ((!isOAuthOnboarding && !emailPattern.test(trimmedEmail)) || !isValidSignupPhone(trimmedPhone)) {
      setCheckingDuplicate(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const duplicate = await checkIdentifierRegistered(isOAuthOnboarding ? "" : trimmedEmail, trimmedPhone);
        if (cancelled) return;
        if (duplicate?.blocked) {
          setSignupBlockedMessage(String(duplicate.public_message || "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake."));
          return;
        }
        if (duplicate?.review_required) {
          setDuplicateCheckError("Signup is temporarily unavailable. Please try again later.");
          return;
        }
        const registered = Boolean(duplicate?.registered);
        setDuplicateDetected(registered);
        if (registered && isOAuthOnboarding) {
          setDuplicateCheckError("This phone number is already used by another account");
        } else if (registered && dismissedDuplicateKey !== `${trimmedEmail}|${trimmedPhone}`) {
          setSigninEmail(trimmedEmail);
          setShowSignInModal(true);
        } else if (!registered) {
          setShowSignInModal(false);
        }
      } catch {
        if (!cancelled) setDuplicateCheckError(isOAuthOnboarding ? "Could not verify phone right now. Please retry." : "Could not verify account details right now. Please retry.");
      } finally {
        if (!cancelled) setCheckingDuplicate(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dismissedDuplicateKey, draft.phone, isOAuthOnboarding, normalizedEmail]);

  useEffect(() => {
    if (!duplicateDetected || isOAuthOnboarding || dismissedDuplicateKey === duplicateKey || !emailPattern.test(normalizedEmail)) return;
    setSigninEmail(normalizedEmail);
    setShowSignInModal(true);
  }, [dismissedDuplicateKey, duplicateDetected, duplicateKey, isOAuthOnboarding, normalizedEmail]);

  useEffect(() => {
    setDismissedDuplicateKey(null);
    setSigninError("");
  }, [draft.phone, normalizedEmail]);

  const legalModalPage = legalModalTarget ? getNativeLegalPage(legalModalTargets[legalModalTarget]) : null;

  useEffect(() => {
    const social = draft.socialId.trim();
    setErrors((current) => ({ ...current, socialId: undefined }));
    if (!social) {
      setSocialAvailability("idle");
      return;
    }
    if (!socialIdPattern.test(social)) {
      setSocialAvailability("idle");
      setErrors((current) => ({ ...current, socialId: "Use 6-15 letters, numbers, underscore, hyphen, or dot" }));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSocialAvailability("checking");
      try {
        const taken = await checkSocialIdTaken(social);
        if (cancelled) return;
        if (taken) {
          setSocialAvailability("taken");
          setErrors((current) => ({ ...current, socialId: "Oops! This Social ID was taken" }));
          return;
        }
        setSocialAvailability("available");
        setErrors((current) => ({ ...current, socialId: undefined }));
      } catch {
        if (!cancelled) {
          setSocialAvailability("failed");
          setErrors((current) => ({ ...current, socialId: "Could not verify Social ID right now. Please retry." }));
        }
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.socialId, socialRetryNonce]);

  const applyVerifyStatus = useCallback((status: {
    verified?: boolean;
    expired?: boolean;
    signup_proof?: string | null;
    email?: string | null;
    token?: string | null;
    auth_confirmed?: boolean;
  } | null | undefined) => {
    const nextEmail = String(status?.email || normalizedEmail || draft.presignupEmail || "").trim().toLowerCase();
    const nextToken = String(status?.token || draft.presignupToken || "").trim();
    if (status?.expired) {
      updateDraft({ signupProof: "", presignupToken: "", presignupEmail: nextEmail });
      setMessage("This link has expired for your protection. No worries — click below to send a new one.");
      return false;
    }
    if (nextToken || nextEmail) {
      updateDraft({ presignupToken: nextToken, presignupEmail: nextEmail || draft.presignupEmail });
    }
    if (status?.verified && status.signup_proof) {
      updateDraft({
        email: nextEmail || normalizedEmail,
        signupProof: String(status.signup_proof || ""),
        presignupToken: nextToken,
        presignupEmail: nextEmail || normalizedEmail,
      });
      setMessage("");
      haptic.success(); // EC1: tactile confirmation when email-verified state is detected (polling or manual)
      setStep("name");
      return true;
    }
    return false;
  }, [draft.presignupEmail, draft.presignupToken, normalizedEmail, updateDraft]);

  const recoverAuthConfirmedSignup = useCallback(async (emailOverride?: string | null) => {
    const email = String(emailOverride || normalizedEmail || draft.presignupEmail || "").trim().toLowerCase();
    if (!email || !draft.password.trim()) {
      setMessage("Please go back and re-enter your signup details.");
      return false;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: draft.password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("session_missing");
      updateDraft({ email, signupProof: "", presignupToken: "", presignupEmail: email });
      setMessage("");
      setStep("name");
      return true;
    } catch {
      setMessage("Could not continue sign up in this app. Please try again.");
      return false;
    }
  }, [draft.password, draft.presignupEmail, normalizedEmail, updateDraft]);

  const lookupStatus = useCallback(async () => {
    const email = normalizedEmail || draft.presignupEmail;
    if (!email) return false;
    try {
      const status = await getPreSignupVerifyStatus(email, draft.presignupToken || undefined);
      if (status?.auth_confirmed) {
        return await recoverAuthConfirmedSignup(status.email || email);
      }
      return applyVerifyStatus(status);
    } catch {
      return false;
    }
  }, [applyVerifyStatus, draft.presignupEmail, draft.presignupToken, normalizedEmail, recoverAuthConfirmedSignup]);

  useEffect(() => {
    if (step !== "emailConfirmation") return;
    const interval = setInterval(() => {
      void lookupStatus();
    }, POLL_INTERVAL_MS);
    void lookupStatus();
    return () => clearInterval(interval);
  }, [lookupStatus, step]);

  const handleVerifyLink = useCallback(async (link: NativeSignupVerifyLink) => {
    if (!link.token) return;
    setStep("emailConfirmation");
    setBusy(true);
    setMessage("Confirming your email…");
    try {
      const status = await confirmPreSignupVerify(link.token, link.email || normalizedEmail);
      if (status?.auth_confirmed) {
        await recoverAuthConfirmedSignup(status.email || link.email || normalizedEmail);
        return;
      }
      const applied = applyVerifyStatus(status);
      if (!applied && status?.expired) {
        setMessage("This link has expired for your protection. No worries — click below to send a new one.");
      } else if (!applied) {
        setMessage("That verification link is no longer usable. Click below to send a fresh one.");
      }
    } catch {
      setMessage("That verification link is no longer usable. Click below to send a fresh one.");
    } finally {
      setBusy(false);
    }
  }, [applyVerifyStatus, normalizedEmail, recoverAuthConfirmedSignup]);

  useEffect(() => {
    if (!loaded || !initialVerifyLink || handledInitialVerifyLink.current) return;
    handledInitialVerifyLink.current = true;
    void handleVerifyLink(initialVerifyLink);
  }, [handleVerifyLink, initialVerifyLink, loaded]);

  const setDobPart = (part: "year" | "month" | "day", value: string) => {
    const digits = value.replace(/\D/g, "");
    const next = {
      ...dobParts,
      [part]: part === "year" ? digits.slice(0, 4) : digits.slice(0, 2),
    };
    const assembled = next.year && next.month && next.day ? `${next.year}-${pad2(next.month)}-${pad2(next.day)}` : "";
    updateDraft({ dob: assembled || `${next.year}${next.month || next.day ? `-${next.month}-${next.day}` : ""}` });
    setErrors((current) => ({ ...current, dob: undefined }));
  };

  const selectDobPart = (part: DobPickerKind, value: string) => {
    setDobPart(part, value);
    setDobPicker(null);
  };

  const dobPickerOptions = useMemo(() => {
    if (dobPicker === "month") {
      return monthOptions.map((label, index) => ({ label, value: pad2(String(index + 1)) }));
    }
    if (dobPicker === "day") {
      return dayOptions.map((value) => ({ label: String(Number(value)), value }));
    }
    if (dobPicker === "year") {
      return yearOptions.map((value) => ({ label: value, value }));
    }
    return [];
  }, [dayOptions, dobPicker, yearOptions]);

  const selectedDobValue = dobPicker ? dobParts[dobPicker] : "";

  const validateDob = () => {
    const assembled = `${dobParts.year}-${pad2(dobParts.month)}-${pad2(dobParts.day)}`;
    if (!dobParts.year || !dobParts.month || !dobParts.day || !isValidDob(assembled) || !isNotFutureDob(assembled)) {
      haptic.error();
      setErrors({ dob: "Enter a valid date of birth." });
      return false;
    }
    if (!isAtLeastAge(assembled, 13)) {
      haptic.error();
      setErrors({ dob: "You must be at least 13 years old to use Huddle." });
      return false;
    }
    updateDraft({ dob: assembled });
    return true;
  };

  const continueDob = () => {
    if (!validateDob()) return;
    setErrors({});
    setStep("credentials");
  };

  const validateCredentials = () => {
    const next: FieldErrors = {};
    if (!isOAuthOnboarding && !emailPattern.test(normalizedEmail)) next.email = "Invalid email format";
    if (!phonePattern.test(draft.phone.trim())) next.phone = "Invalid phone format";
    else if (!phoneValid) next.phone = "Your phone number is invalid";
    if (!isOAuthOnboarding) {
      if (draft.password.length < 8) next.password = "Minimum 8 characters";
      if (!/[A-Z]/.test(draft.password)) next.password = "Must include uppercase letter";
      if (!/[0-9]/.test(draft.password)) next.password = "Must include number";
      if (!/[!@#$%^&*]/.test(draft.password)) next.password = "Must include special character";
      if (confirmPassword !== draft.password) next.confirmPassword = "Passwords do not match";
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) haptic.error();
    return ok;
  };

  const continueCredentials = async () => {
    setMessage("");
    if (!validateCredentials()) return;
    if (signupBlockedMessage) {
      setMessage(signupBlockedMessage);
      return;
    }
    if (duplicateDetected) {
      if (!isOAuthOnboarding) {
        setSigninEmail(normalizedEmail);
        setShowSignInModal(true);
      }
      return;
    }
    if (!shouldBypassDuplicateCheck && duplicateCheckError) return;
    if (isOAuthOnboarding) {
      updateDraft({
        email: oauthEmail || normalizedEmail,
        phone: draft.phone.trim(),
      });
      setStep("name");
      return;
    }
    if (!turnstileToken.trim()) {
      setMessage("Human verification is still loading. Please try again in a moment.");
      return;
    }
    if (shouldBypassDuplicateCheck) {
      updateDraft({ email: normalizedEmail, phone: draft.phone.trim() });
      setStep("name");
      return;
    }
    setBusy(true);
    try {
      const existingProof = await getPreSignupVerifyStatus(normalizedEmail).catch(() => null);
      if (existingProof?.verified && existingProof.signup_proof) {
        updateDraft({ signupProof: String(existingProof.signup_proof), email: normalizedEmail, phone: draft.phone.trim() });
        setStep("name");
        return;
      }
      const duplicate = await checkIdentifierRegistered(normalizedEmail, draft.phone.trim());
      if (duplicate?.blocked) {
        setMessage(String(duplicate.public_message || "Your Huddle account is unavailable. Contact support@huddle.pet if you think this is a mistake."));
        return;
      }
      if (duplicate?.review_required) {
        setMessage("Signup is temporarily unavailable. Please try again later.");
        return;
      }
      if (duplicate?.registered) {
        setSigninEmail(normalizedEmail);
        setShowSignInModal(true);
        setMessage(duplicate.field === "phone" ? "This phone number is already registered." : "This email is already registered.");
        return;
      }
      updateDraft({ email: normalizedEmail, phone: draft.phone.trim(), turnstileToken });
      const sent = await sendPreSignupVerify({
        email: normalizedEmail,
        currentToken: draft.presignupToken,
        turnstileToken,
        forceNewToken: true,
      });
      setLastSendSentEmail(sent.email_sent !== false);
      updateDraft({
        presignupToken: String(sent.token || draft.presignupToken || ""),
        presignupEmail: String(sent.email || normalizedEmail).trim().toLowerCase(),
      });
      setCooldown(RESEND_COOLDOWN_SECS);
      setMessage(sent.email_sent === false ? "A recent verification email is already active. Check your inbox to continue." : "");
      setStep("emailConfirmation");
    } catch (error) {
      setLastSendSentEmail(null);
      setMessage(error instanceof Error ? resolveSignupError(error.message) : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const resendEmail = async () => {
    if (cooldown > 0 || busy) return;
    if (!normalizedEmail) {
      setStep("credentials");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const sent = await sendPreSignupVerify({
        email: normalizedEmail,
        currentToken: draft.presignupToken,
        turnstileToken,
        forceNewToken: true,
      });
      setLastSendSentEmail(sent.email_sent !== false);
      updateDraft({
        presignupToken: String(sent.token || draft.presignupToken || ""),
        presignupEmail: String(sent.email || normalizedEmail).trim().toLowerCase(),
      });
      setCooldown(RESEND_COOLDOWN_SECS);
      setMessage("");
      haptic.success(); // EC1: Resend success
    } catch {
      setLastSendSentEmail(null);
      setMessage("We couldn't send a verification email. Check your connection and tap Resend.");
      haptic.error(); // EC1: Resend failure
    } finally {
      setBusy(false);
    }
  };

  const openMailInbox = async () => {
    haptic.selectTab(); // EC1: tap on Open Mail
    // EC3: include Gmail/Outlook fallbacks on iOS too — many iOS users default away from Apple Mail.
    const inboxUrls = Platform.OS === "android"
      ? ["googlegmail://co", "ms-outlook://mail/inbox"]
      : ["message://", "googlegmail://co", "ms-outlook://mail/inbox"];
    for (const inboxUrl of inboxUrls) {
      try {
        const canOpen = await Linking.canOpenURL(inboxUrl);
        if (!canOpen) continue;
        await Linking.openURL(inboxUrl);
        return;
      } catch {
        // Try next candidate.
      }
    }
    setMessage("Open your mail app manually, then return here after verifying.");
  };

  const manualContinue = async () => {
    setManualCheck("checking");
    const verified = await lookupStatus();
    if (!verified) {
      haptic.warning(); // EC2: tactile cue when verification not yet detected
      setManualCheck("not_yet");
      setTimeout(() => setManualCheck("idle"), 3000);
    }
  };

  const changeEmail = () => {
    updateDraft({ signupProof: "", presignupToken: "", presignupEmail: "" });
    setTurnstileToken("");
    setCooldown(0);
    setLastSendSentEmail(null);
    setMessage("");
    setStep("credentials");
  };

  const closeSignInModal = () => {
    setShowSignInModal(false);
    setSigninError("");
    setDismissedDuplicateKey(duplicateKey);
  };

  const submitDuplicateSignIn = async () => {
    setSigninError("");
    if (!emailPattern.test(signinEmail.trim().toLowerCase())) {
      setSigninError("Enter a valid email address.");
      return;
    }
    if (!signinPassword) {
      setSigninError("Enter your password.");
      return;
    }
    setSigninLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: signinEmail.trim().toLowerCase(),
        password: signinPassword,
      });
      if (error) throw error;
      if (!data.session) throw new Error("session_missing");
      await clearNativeSignupDraft();
      setShowSignInModal(false);
      haptic.success();
      onSignedIn(data.session, "/");
    } catch (error) {
      setSigninError(mapSigninFailureMessage(error instanceof Error ? error.message : "Couldn't sign you in."));
    } finally {
      setSigninLoading(false);
    }
  };

  const validateName = () => {
    const next: FieldErrors = {};
    if (!draft.displayName.trim()) next.displayName = "Enter your display name.";
    if (!socialIdPattern.test(draft.socialId.trim())) {
      next.socialId = "Use 6-15 letters, numbers, underscore, hyphen, or dot";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const continueName = async () => {
    setMessage("");
    if (!validateName()) return;
    setBusy(true);
    const recoverCreatedSignupSession = async () => {
      if (!normalizedEmail || !draft.password.trim()) return false;
      const recovered = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: draft.password,
      });
      if (!recovered.data.session?.user) return false;
      updateDraft({
        displayName: draft.displayName.trim(),
        socialId: draft.socialId.trim(),
      });
      await completeSignup("/verify-identity", recovered.data.session);
      return true;
    };
    try {
      const { data: existingAuth } = await supabase.auth.getSession();
      if (existingAuth.session?.user) {
        updateDraft({
          displayName: draft.displayName.trim(),
          socialId: draft.socialId.trim(),
        });
        await completeSignup("/verify-identity", existingAuth.session);
        return;
      }
      if (socialAvailability !== "available") {
        const taken = await checkSocialIdTaken(draft.socialId.trim());
        if (taken) {
          if (await recoverCreatedSignupSession()) return;
          setErrors({ socialId: "Oops! This Social ID was taken" });
          return;
        }
      }
      let signupProof = draft.signupProof.trim();
      if (!signupProof && normalizedEmail) {
        const recoveredProof = await getPreSignupVerifyStatus(normalizedEmail, draft.presignupToken || undefined).catch(() => null);
        if (recoveredProof?.verified && recoveredProof.signup_proof) {
          signupProof = String(recoveredProof.signup_proof || "").trim();
          updateDraft({
            signupProof,
            presignupToken: String(recoveredProof.token || draft.presignupToken || ""),
            presignupEmail: String(recoveredProof.email || normalizedEmail).trim().toLowerCase(),
          });
        }
      }
      if (!signupProof) {
        setMessage("Please go back and complete email verification again.");
        return;
      }
      const result = await authSignupNative({
        email: normalizedEmail,
        password: draft.password,
        options: {
          emailRedirectTo: "https://huddle.pet/auth/callback",
          data: {
            display_name: draft.displayName.trim(),
            social_id: draft.socialId.trim(),
            phone: draft.phone.trim(),
            dob: draft.dob,
          },
        },
        signup_proof: signupProof,
      });
      if (!result.session) throw new Error("signup_session_missing");
      updateDraft({ turnstileToken: "", signupProof: "" });
      await completeSignup("/verify-identity", result.session);
    } catch (error) {
      if (await recoverCreatedSignupSession().catch(() => false)) return;
      setMessage(error instanceof Error ? resolveSignupError(error.message) : "Account creation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const waitForSignupSession = async () => {
    for (let attempt = 0; attempt < SIGNUP_SESSION_RETRY_COUNT; attempt += 1) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) return data.session;
      await new Promise((resolve) => setTimeout(resolve, SIGNUP_SESSION_RETRY_DELAY_MS));
    }
    return null;
  };

  const completeSignup = async (nextPath: string, sessionOverride?: Session | null) => {
    setBusy(true);
    const session = sessionOverride ?? (nextPath === "/verify-identity" ? await waitForSignupSession() : (await supabase.auth.getSession()).data.session);
    if (!session) {
      setBusy(false);
      setMessage("Still preparing your account session. Please try again in a moment.");
      return;
    }
    const owner = normalizeStorageOwner(draft.email);
    const setProfilePrefill = {
      prefill_owner: owner,
      form_data: {
        display_name: draft.displayName.trim(),
        social_id: draft.socialId.trim(),
        phone: draft.phone.trim(),
        dob: draft.dob,
        legal_name: "",
      },
      display_name: draft.displayName.trim(),
      social_id: draft.socialId.trim(),
      phone: draft.phone.trim(),
      dob: draft.dob,
      legal_name: "",
    };
    const serializedSetProfilePrefill = JSON.stringify(setProfilePrefill);
    const webLocalStorage = nextPath === "/set-profile" || nextPath === "/verify-identity"
      ? {
          auth_login_identifier: owner,
          [SETPROFILE_PREFILL_KEY]: serializedSetProfilePrefill,
          [buildScopedStorageKey(SETPROFILE_PREFILL_KEY, owner)]: serializedSetProfilePrefill,
        }
      : undefined;
    const webSessionStorage: Record<string, string> | undefined = nextPath === "/verify-identity"
      ? {
          [SIGNUP_FLOW_STATE_KEY]: "verify_identity",
          [VERIFY_IDENTITY_NAV_KEY]: JSON.stringify({
            backTo: "/signup/verify",
            returnTo: "/set-profile",
          }),
        }
      : nextPath === "/set-profile"
        ? { [SIGNUP_FLOW_STATE_KEY]: "signup" }
        : undefined;
    await clearNativeSignupDraft();
    setBusy(false);
    haptic.success();
    onSignedIn(session, nextPath, webLocalStorage, webSessionStorage);
  };

  const resetAndCancel = async () => {
    await clearNativeSignupDraft();
    onCancel();
  };

  if (!loaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={huddleColors.blue} />
      </View>
    );
  }

  const credentialsHint = duplicateDetected
    ? isOAuthOnboarding
      ? "This phone number is already used by another account"
      : "This email or phone number is already registered"
    : checkingDuplicate
      ? isOAuthOnboarding ? "Checking phone…" : "Checking account details…"
      : signupBlockedMessage
        ? "Signup is currently unavailable for this account"
        : duplicateCheckError
          ? isOAuthOnboarding ? duplicateCheckError : "Could not verify account details right now. Please retry."
          : !isOAuthOnboarding && !turnstileToken.trim()
            ? "Preparing verification…"
            : !isOAuthOnboarding && passwordRequirementError
              ? passwordRequirementError
              : !isOAuthOnboarding && confirmPasswordError
                ? confirmPasswordError
            : errors.phone || (draft.phone.trim() && !phoneValid)
              ? isOAuthOnboarding ? "Phone number length is not valid for the selected country" : "Enter a valid phone number"
              : "Complete all required fields to continue";

  const scrollBottomPadding = step === "credentials"
    ? insets.bottom + 184
    : step === "emailConfirmation" || step === "verifyDecision"
      ? insets.bottom + 184
      : step === "dob" && isUnder13
        ? insets.bottom + 190
        : insets.bottom + 112;
  const showEmailRecoveryCopy = message.includes("expired") || message.includes("no longer usable");
  const showEmailSendError = message.includes("couldn't send a verification email");
  const emailResendDisabled = cooldown > 0 || busy || (!draft.presignupToken.trim() && !turnstileToken.trim());
  const stepAnimatedStyle = {
    opacity: stepTransition,
    transform: [
      {
        translateX: stepTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  const scrollCredentialsFieldIntoSafeZone = (y: number) => {
    setTimeout(() => {
      signupScrollRef.current?.scrollTo({
        y: Math.max(0, y - 120),
        animated: true,
      });
    }, 80);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboardView}>
        <View style={styles.signupTopBar}>
          <Pressable
            onPress={() => {
              if (step === "dob") {
                void resetAndCancel();
              } else if (step === "credentials") {
                setStep("dob");
              } else if (step === "emailConfirmation") {
                setChangeEmailConfirmOpen(true);
              } else if (step === "name") {
                setStep("credentials");
              } else {
                setStep("name");
              }
            }}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
          >
            <Feather name="arrow-left" size={24} color="rgba(74,73,101,0.55)" />
          </Pressable>
          <StepPill step={step} />
          <View style={styles.headerButton} />
        </View>

        <Animated.ScrollView
          ref={signupScrollRef}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          style={stepAnimatedStyle}
          contentContainerStyle={[
            styles.scrollContent,
            step === "name" ? styles.nameScrollContent : null,
            { paddingBottom: scrollBottomPadding },
          ]}
        >
          {step === "dob" ? (
            <View style={styles.panel}>
              <SignupHeroImage trimmed source={signupDobImage} />
              <Text style={styles.title}>When were you born?</Text>
              <Text style={styles.body}>
                Huddle is a cozy corner where you can <Text style={styles.bodyStrong}>Discover</Text> pet lovers, use{" "}
                <Text style={styles.bodyStrong}>Social</Text> to share thoughts, and <Text style={styles.bodyStrong}>Chat</Text> directly with trusted friends, nannies, groomers, and vets.
              </Text>
              <Text style={styles.body}>
                This helps keep our community safe and trusted for everyone.
              </Text>
              <View style={styles.formStack}>
                <View style={styles.dobGroup}>
                  <Text style={styles.label}>Date of birth</Text>
                  <View style={styles.dobRow}>
                    <Pressable onPress={() => { haptic.selectTab(); setDobPicker(dobPicker === "month" ? null : "month"); }} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectMonth, liveDobError ? styles.dobSelectError : null, pressed ? styles.pressed : null]}>
                      <Text numberOfLines={1} style={[styles.dobSelectText, !dobParts.month ? styles.dobPlaceholderText : null]}>
                        {dobParts.month ? monthOptions[Math.max(0, Number(dobParts.month) - 1)] : "Month"}
                      </Text>
                      <Feather name="chevron-down" size={18} color="rgba(66,73,101,0.45)" />
                    </Pressable>
                    <Pressable onPress={() => { haptic.selectTab(); setDobPicker(dobPicker === "day" ? null : "day"); }} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectDay, liveDobError ? styles.dobSelectError : null, pressed ? styles.pressed : null]}>
                      <Text numberOfLines={1} style={[styles.dobSelectText, !dobParts.day ? styles.dobPlaceholderText : null]}>
                        {dobParts.day ? String(Number(dobParts.day)) : "Day"}
                      </Text>
                      <Feather name="chevron-down" size={18} color="rgba(66,73,101,0.45)" />
                    </Pressable>
                    <Pressable onPress={() => { haptic.selectTab(); setDobPicker(dobPicker === "year" ? null : "year"); }} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectYear, liveDobError ? styles.dobSelectError : null, pressed ? styles.pressed : null]}>
                      <Text numberOfLines={1} style={[styles.dobSelectText, !dobParts.year ? styles.dobPlaceholderText : null]}>
                        {dobParts.year || "Year"}
                      </Text>
                      <Feather name="chevron-down" size={18} color="rgba(66,73,101,0.45)" />
                    </Pressable>
                  </View>
                  {dobPicker ? (
                    <View
                      style={[
                        styles.inlineDobPicker,
                        dobPicker === "month" ? styles.inlineDobPickerMonth : dobPicker === "day" ? styles.inlineDobPickerDay : styles.inlineDobPickerYear,
                      ]}
                    >
                      <ScrollView nestedScrollEnabled style={styles.inlineDobPickerScroll}>
                        {dobPickerOptions.map((option) => (
                          <Pressable
                            key={option.value}
                            onPress={() => selectDobPart(dobPicker, option.value)}
                            style={({ pressed }) => [
                              styles.inlineDobPickerOption,
                              selectedDobValue === option.value ? styles.inlineDobPickerOptionSelected : null,
                              pressed ? styles.pressed : null,
                            ]}
                          >
                            {selectedDobValue === option.value ? (
                              <View style={styles.inlineDobPickerCheckSlot}>
                                <Feather name="check" size={16} color={huddleColors.text} />
                              </View>
                            ) : (
                              <View style={styles.inlineDobPickerCheckSlot} />
                            )}
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.inlineDobPickerText,
                                selectedDobValue === option.value ? styles.inlineDobPickerTextSelected : null,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                  <Text style={styles.helperTextInline}>Don't worry— your full birthday is kept safe with us.</Text>
                  {liveDobError ? <Text style={styles.errorText}>{liveDobError}</Text> : null}
                  {liveDobWarning ? <Text style={styles.helperTextInline}>{liveDobWarning}</Text> : null}
                </View>
              </View>
            </View>
          ) : null}

          {step === "credentials" ? (
            <View style={styles.panel}>
              <Text style={styles.title}>Your login details</Text>
              <Text style={styles.body}>We'll use these to keep your account secure.</Text>
              <View style={styles.formStack}>
                <Field
                  label="Email"
                  value={isOAuthOnboarding ? oauthEmail : draft.email}
                  onChangeText={(value) => updateDraft({ email: value })}
                  onFocus={() => scrollCredentialsFieldIntoSafeZone(120)}
                  keyboardType="email-address"
                  leadingIcon={<Feather name="mail" size={16} color="rgba(74,73,101,0.55)" />}
                  error={errors.email}
                  disabled={isOAuthOnboarding}
                />
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Phone Number</Text>
                  <NativePhoneField
                    defaultCountryCode="HK"
                    error={Boolean(errors.phone || (draft.phone.trim() && !phoneValid))}
                    onChangeText={(phone) => updateDraft({ phone })}
                    value={draft.phone}
                  />
                  {errors.phone ? <Text style={styles.errorText}>{isOAuthOnboarding ? "Phone number length is not valid for the selected country" : "Your phone number is invalid"}</Text> : null}
                  {!errors.phone && draft.phone.trim() && !phoneValid ? (
                    <Text style={styles.errorText}>{isOAuthOnboarding ? "Phone number length is not valid for the selected country" : "Your phone number is invalid"}</Text>
                  ) : null}
                  {!errors.phone && checkingDuplicate ? <Text style={styles.helperTextInline}>Checking account details…</Text> : null}
                  {!errors.phone && !checkingDuplicate && duplicateDetected ? (
                    <Text style={styles.errorText}>
                      {isOAuthOnboarding ? "This phone number is already used by another account" : "This email or phone number is already registered"}
                    </Text>
                  ) : null}
                  {!errors.phone && !checkingDuplicate && duplicateCheckError ? <Text style={styles.errorText}>{duplicateCheckError}</Text> : null}
                </View>
                {!isOAuthOnboarding ? (
                  <>
                    <Field
                      label="Password"
                      value={draft.password}
                      onChangeText={(value) => updateDraft({ password: value })}
                      onFocus={() => scrollCredentialsFieldIntoSafeZone(260)}
                      secureTextEntry={!passwordVisible}
                      leadingIcon={<Feather name="lock" size={16} color="rgba(74,73,101,0.55)" />}
                      trailing={
                        <Pressable onPress={() => setPasswordVisible((visible) => !visible)} style={styles.passwordEyeButton}>
                          <Feather name={passwordVisible ? "eye-off" : "eye"} size={16} color="rgba(74,73,101,0.55)" />
                        </Pressable>
                      }
                      error={errors.password || passwordRequirementError}
                    />
                    <Field
                      label="Confirm Password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => scrollCredentialsFieldIntoSafeZone(360)}
                      secureTextEntry={!confirmPasswordVisible}
                      leadingIcon={<Feather name="lock" size={16} color="rgba(74,73,101,0.55)" />}
                      trailing={
                        <Pressable onPress={() => setConfirmPasswordVisible((visible) => !visible)} style={styles.passwordEyeButton}>
                          <Feather name={confirmPasswordVisible ? "eye-off" : "eye"} size={16} color="rgba(74,73,101,0.55)" />
                        </Pressable>
                      }
                        error={errors.confirmPassword || confirmPasswordError}
                    />
                  </>
                ) : null}
                <View style={styles.legalStack}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: updatesChecked }}
                    onPress={() => setUpdatesChecked((checked) => !checked)}
                    style={({ pressed }) => [styles.checkboxRow, pressed ? styles.pressed : null]}
                  >
                    <View style={[styles.checkbox, updatesChecked ? styles.checkboxChecked : null]}>
                      {updatesChecked ? <Feather name="check" size={18} color="#FFFFFF" /> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>
                      I agree to receive emails from Huddle for pet care, community news, and product updates.
                    </Text>
                  </Pressable>
                  <Text style={styles.legalText}>
                    By tapping Continue, you agree to our{" "}
                    <Text style={styles.legalLink} onPress={() => setLegalModalTarget("terms")}>Terms of Service</Text>{" "}
                    and{" "}
                    <Text style={styles.legalLink} onPress={() => setLegalModalTarget("privacy")}>Privacy Policy</Text>.
                  </Text>
                </View>
                {!isOAuthOnboarding ? (
                  <NativeTurnstile
                    action="send_pre_signup_verify"
                    onError={setMessage}
                    onToken={(token) => {
                      setTurnstileToken(token);
                      if (token) setMessage("");
                    }}
                    siteKey={turnstileSiteKey}
                  />
                ) : null}
                {signupBlockedMessage ? <Text style={styles.errorText}>{signupBlockedMessage}</Text> : null}
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
              </View>
            </View>
          ) : null}

          {step === "emailConfirmation" ? (
            <View style={[styles.panel, styles.emailConfirmationPanel]}>
              {busy ? (
                <View style={styles.sendingRow}>
                  <ActivityIndicator color={huddleColors.blue} />
                  <Text style={styles.sendingText}>{message.includes("Confirming") ? "Confirming…" : "Sending…"}</Text>
                </View>
              ) : null}
              <Text style={styles.title}>Verify your email</Text>
              <Text style={[styles.body, styles.emailConfirmationBody]}>
                {showEmailSendError || showEmailRecoveryCopy ? (
                  message
                ) : (
                  <>
                    We&apos;ve sent a link to <Text style={styles.bodyStrong}>{normalizedEmail || "your email"}</Text>. Please check your inbox to continue.
                  </>
                )}
              </Text>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={verifyEmailImage}
                style={styles.signupInlineImage}
              />
              <View style={styles.emailInlineActions}>
                <SignupButton
                  label="Open Mail"
                  leadingIcon={<Feather name="mail" size={16} color={huddleColors.onPrimary} />}
                  onPress={() => void openMailInbox()}
                />
              </View>
            </View>
          ) : null}

          {step === "name" ? (
            <View style={styles.panel}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={signupNameImage}
                style={styles.signupNameInlineImage}
              />
              <Text style={styles.title}>Set your profile name</Text>
              <Text style={styles.body}>
                This is how you&apos;ll be mentioned in conversations and identified on the <Text style={styles.bodyStrong}>Map</Text>, where we all work together to spot stray or lost pets and share{" "}
                <Text style={styles.bodyStrong}>Danger Alerts</Text> to keep our pack safe.
              </Text>
              <View style={styles.formStack}>
                <Field label="Display name" value={draft.displayName} onChangeText={(value) => updateDraft({ displayName: value })} autoCapitalize="words" error={errors.displayName} />
                <Field label="Social ID" value={draft.socialId} onChangeText={(value) => updateDraft({ socialId: value })} error={errors.socialId} />
                {!errors.socialId && socialAvailability === "checking" ? <Text style={styles.helperTextInline}>Checking Social ID…</Text> : null}
                {!errors.socialId && socialAvailability === "available" ? <Text style={styles.successText}>Social ID is available</Text> : null}
                {socialAvailability === "failed" && !errors.socialId ? (
                  <Pressable onPress={() => setSocialRetryNonce((value) => value + 1)}>
                    <Text style={styles.retryLinkText}>Retry check</Text>
                  </Pressable>
                ) : null}
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
              </View>
            </View>
          ) : null}

          {step === "verifyDecision" ? (
            <View style={styles.panel}>
              <SignupHeroImage compact source={signupVerifyImage} />
              <Text style={styles.title}>Identity verification</Text>
              <Text style={styles.body}>
                Build the safest community for our pets and earn your <Text style={styles.bodyStrong}>Verified</Text> badge by completing a quick identity check.
              </Text>
              <View style={styles.infoCard}>
                <View style={styles.infoTitleRow}>
                  <Feather name="shield" size={20} color={huddleColors.blue} />
                  <Text style={styles.infoTitle}>Trusted to care</Text>
                </View>
                <Text style={styles.infoBody}>
                  Let the community know you can be trusted for care and advice, and that you&apos;re ready to help any pet in need.{"\n"}Trust starts with you.
                </Text>
              </View>
              {message ? <Text style={styles.errorText}>{message}</Text> : null}
            </View>
          ) : null}
        </Animated.ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step === "dob" ? (
            isUnder13 ? (
              <SignupButton variant="secondary" label="Return to Sign In" onPress={() => void resetAndCancel()} />
            ) : (
              <SignupButton disabled={!canContinueDob} label="Continue" onPress={continueDob} />
            )
          ) : null}
          {step === "credentials" ? (
            <View style={styles.buttonStack}>
              <SignupButton disabled={!canContinueCredentials} label="Continue" loading={busy} onPress={() => void continueCredentials()} />
              {!canContinueCredentials && !busy ? <Text style={styles.footerHint}>{credentialsHint}</Text> : null}
            </View>
          ) : null}
          {step === "emailConfirmation" ? (
            <View style={styles.buttonStack}>
              <Animated.View style={{ transform: [{ translateX: continueShakeAnim }] }}>
                <SignupButton
                  compact
                  variant="secondary"
                  label={manualCheck === "checking" ? "Checking…" : manualCheck === "not_yet" ? "Not verified yet" : draft.signupProof.trim() ? "Continue" : "I've verified, continue"}
                  disabled={manualCheck === "checking" || busy}
                  onPress={() => void manualContinue()}
                />
              </Animated.View>
              {normalizedEmail ? (
                <View style={styles.emailFooterLinks}>
                  <Text style={styles.emailFooterSeparator}>{normalizedEmail}</Text>
                  <Text style={styles.emailFooterSeparator}>·</Text>
                  <Pressable onPress={() => setChangeEmailConfirmOpen(true)} hitSlop={8}>
                    <Text style={styles.emailFooterLinkText}>Wrong email?</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.emailFooterLinks}>
                <Pressable disabled={emailResendDisabled} onPress={() => void resendEmail()} hitSlop={8}>
                  <Text style={[styles.emailFooterLinkText, emailResendDisabled ? styles.emailFooterLinkDisabled : null]}>
                    {cooldown > 0 ? `Didn't get it? Resend (${cooldown}s)` : busy ? "Didn't get it? Sending..." : "Didn't get it? Resend"}
                  </Text>
                </Pressable>
              </View>
              {manualCheck === "not_yet" ? (
                <Text style={styles.footerHint}>Check your inbox, then try again.</Text>
              ) : showEmailSendError ? (
                <Text style={styles.footerHint}>{message}</Text>
              ) : null}
            </View>
          ) : null}
          {step === "name" ? <SignupButton disabled={!canContinueName} label="Continue" loading={busy} loadingLabel="Checking…" onPress={() => void continueName()} /> : null}
          {step === "verifyDecision" ? (
            <View style={styles.buttonStack}>
              <SignupButton label="Start Verification" loading={busy} loadingLabel="Starting…" onPress={() => void completeSignup("/verify-identity")} />
              <SignupButton
                hitSlop={8}
                variant={verificationSubmitted ? "secondary" : "ghost"}
                label={verificationSubmitted ? "Continue" : "Skip for now"}
                onPress={() => {
                  if (verificationSubmitted) {
                    void completeSignup("/set-profile");
                    return;
                  }
                  setSkipConfirmOpen(true);
                }}
              />
            </View>
          ) : null}
        </View>

        <Modal animationType="fade" transparent visible={showSignInModal} onRequestClose={closeSignInModal}>
          <Pressable style={styles.modalBackdrop} onPress={closeSignInModal}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalKeyboard}>
              <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
                <Pressable
                  hitSlop={huddleSpacing.x2}
                  onPress={closeSignInModal}
                  style={({ pressed }) => [styles.appModalClose, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={24} color={huddleColors.text} />
                </Pressable>
                <Text style={styles.modalTitle}>Already Registered</Text>
                <Text style={styles.modalBody}>This email or phone number is already registered</Text>
                <View style={styles.modalStack}>

                  <View style={styles.modalFieldGroup}>
                    <Text style={styles.modalFieldLabel}>Email</Text>
                    <TextInput
                      value={signinEmail}
                      onFocus={() => setFocusedSigninField("email")}
                      onChangeText={(next) => {
                        setSigninEmail(next);
                        setSigninError("");
                      }}
                      onBlur={() => setFocusedSigninField(null)}
                      onSubmitEditing={() => signinPasswordInputRef.current?.focus()}
                      placeholder="name@email.com"
                      placeholderTextColor={huddleColors.mutedText}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      returnKeyType="next"
                      textContentType="username"
                      editable={!signinLoading}
                      style={[
                        styles.supportField,
                        focusedSigninField === "email" ? styles.supportFieldFocused : null,
                        signinError ? styles.supportFieldError : null,
                      ]}
                    />
                  </View>

                  <View style={styles.modalFieldGroup}>
                    <Text style={styles.modalFieldLabel}>Password</Text>
                    <View
                      style={[
                        styles.supportField,
                        styles.signinPasswordField,
                        focusedSigninField === "password" ? styles.supportFieldFocused : null,
                        signinError ? styles.supportFieldError : null,
                      ]}
                    >
                      <TextInput
                        ref={signinPasswordInputRef}
                        value={signinPassword}
                        onFocus={() => setFocusedSigninField("password")}
                        onChangeText={(next) => {
                          setSigninPassword(next);
                          setSigninError("");
                        }}
                        onBlur={() => setFocusedSigninField(null)}
                        onSubmitEditing={() => void submitDuplicateSignIn()}
                        placeholder="Password"
                        placeholderTextColor={huddleColors.mutedText}
                        returnKeyType="done"
                        secureTextEntry={!signinPasswordVisible}
                        textContentType="password"
                        editable={!signinLoading}
                        style={styles.signinPasswordInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={signinPasswordVisible ? "Hide password" : "Show password"}
                        disabled={signinLoading}
                        onPress={() => setSigninPasswordVisible((visible) => !visible)}
                        style={({ pressed }) => [styles.passwordEyeButton, pressed ? styles.pressed : null]}
                      >
                        <Feather name={signinPasswordVisible ? "eye-off" : "eye"} size={17} color="rgba(74,73,101,0.55)" />
                      </Pressable>
                    </View>
                  </View>

                  <Pressable onPress={() => onOpenWebPath("/reset-password")} style={({ pressed }) => [styles.forgotPasswordButton, pressed ? styles.pressed : null]}>
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </Pressable>
                  {signinError ? <Text style={styles.errorText}>{signinError}</Text> : null}
                  <Pressable
                    disabled={!signinEmail || !signinPassword || signinLoading}
                    onPress={() => void submitDuplicateSignIn()}
                    style={({ pressed }) => [
                      styles.modalPrimaryButton,
                      pressed && !signinLoading ? styles.pressed : null,
                      !signinEmail || !signinPassword || signinLoading ? styles.disabled : null,
                    ]}
                  >
                    {signinLoading ? (
                      <ActivityIndicator color={huddleColors.onPrimary} />
                    ) : (
                      <Text style={styles.modalPrimaryButtonLabel}>Sign in</Text>
                    )}
                  </Pressable>
                </View>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>

        <Modal animationType="fade" transparent visible={Boolean(legalModalPage)} onRequestClose={() => setLegalModalTarget(null)}>
          <View style={nativeModalStyles.appModalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setLegalModalTarget(null)} />
            <SafeAreaView pointerEvents="box-none" style={nativeModalStyles.appModalSafeArea}>
              <View style={[styles.legalModalCard, { height: modalMaxHeight }]}>
                {legalModalPage ? <NativeSignupLegalModalContent page={legalModalPage} onClose={() => setLegalModalTarget(null)} /> : null}
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        <AppConfirmModal
          open={changeEmailConfirmOpen}
          title="Use a different email?"
          body="You'll restart the verification process with the new address."
          confirm="Change email"
          onConfirm={() => { setChangeEmailConfirmOpen(false); changeEmail(); }}
          onCancel={() => setChangeEmailConfirmOpen(false)}
        />

        <Modal animationType="fade" transparent visible={skipConfirmOpen} onRequestClose={() => setSkipConfirmOpen(false)}>
          <Pressable style={styles.confirmationBackdrop} onPress={() => setSkipConfirmOpen(false)}>
            <Pressable style={styles.confirmationCard} onPress={(event) => event.stopPropagation()}>
              <Text style={styles.confirmationTitle}>Skip identity verification?</Text>
              <Text style={styles.confirmationBody}>Unverified users have limited access to certain community features and may appear less trustworthy to others.</Text>
              <View style={styles.confirmationActions}>
                <Pressable onPress={() => setSkipConfirmOpen(false)} style={({ pressed }) => [styles.confirmationButton, styles.confirmationSecondaryButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.confirmationSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={() => void completeSignup("/set-profile")} style={({ pressed }) => [styles.confirmationButton, styles.confirmationPrimaryButton, pressed ? styles.pressed : null]}>
                  <Text style={styles.confirmationPrimaryText}>Yes, skip verification</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
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
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  header: {
    height: huddleLayout.headerHeight,
    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: huddleColors.divider,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
    color: huddleColors.text,
  },
  signupTopBar: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    paddingHorizontal: 20,
    paddingTop: 40,
    gap: huddleSpacing.x4,
  },
  nameScrollContent: {
    paddingTop: 0,
  },
  stepHeader: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 3,
    backgroundColor: huddleColors.blue,
  },
  progressTrack: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  stepText: {
    fontFamily: "Urbanist-400",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(74,73,101,0.55)",
  },
  panel: {
    gap: 8,
    backgroundColor: "transparent",
  },
  emailConfirmationPanel: {
    gap: 0,
  },
  emailConfirmationBody: {
    marginTop: huddleSpacing.x2,
  },
  heroImage: {
    width: "100%",
    height: 270,
    marginTop: -8,
    marginBottom: 16,
  },
  heroImageTrimmed: {
    height: 220,
    marginTop: -28,
    marginBottom: 0,
  },
  heroImageFlush: {
    marginTop: 0,
    marginBottom: 0,
  },
  heroImageCompact: {
    height: 170,
    marginBottom: 16,
  },
  signupInlineImage: {
    width: "100%",
    height: 214,
    marginTop: 0,
    marginBottom: 0,
  },
  signupNameInlineImage: {
    width: "100%",
    height: 214,
    marginTop: 0,
    marginBottom: 0,
  },
  mailIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(33,69,207,0.07)",
  },
  title: {
    fontFamily: "Urbanist-600",
    fontSize: 28,
    lineHeight: 31,
    color: huddleColors.text,
  },
  body: {
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(74,73,101,0.70)",
  },
  bodyStrong: {
    fontFamily: "Urbanist-600",
    color: huddleColors.text,
  },
  dobGroup: {
    gap: huddleSpacing.x2,
    zIndex: 4,
  },
  formStack: {
    marginTop: 24,
    gap: 24,
  },
  legalStack: {
    gap: 12,
  },
  dobRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  fieldGroup: {
    flex: 1,
    gap: huddleSpacing.x2,
    position: "relative",
  },
  label: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  dobSelectField: {
    height: huddleLayout.fieldHeight,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.62)",
    borderRadius: huddleRadii.field,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
  },
  dobSelectMonth: {
    width: "38.5%",
  },
  dobSelectDay: {
    width: "28.2%",
  },
  dobSelectYear: {
    width: "28.2%",
  },
  dobSelectError: {
    ...huddleFieldStates.error,
  },
  dobSelectText: {
    flex: 1,
    minWidth: 0,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
  },
  dobPlaceholderText: {
    color: huddleColors.mutedText,
  },
  inlineDobPicker: {
    position: "absolute",
    bottom: huddleLayout.fieldHeight + huddleSpacing.x3,
    zIndex: 10,
    width: "38.5%",
    maxHeight: 260,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.32)",
    borderRadius: huddleRadii.field,
    backgroundColor: "#FFFFFF",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    overflow: "hidden",
  },
  inlineDobPickerScroll: {
    maxHeight: 260,
  },
  inlineDobPickerMonth: {
    left: 0,
  },
  inlineDobPickerDay: {
    left: "40.8%",
    width: "28.2%",
  },
  inlineDobPickerYear: {
    right: 0,
    width: "28.2%",
  },
  inlineDobPickerOption: {
    minHeight: 32,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 8,
    paddingVertical: 6,
  },
  inlineDobPickerOptionSelected: {
    backgroundColor: "transparent",
  },
  inlineDobPickerCheckSlot: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  inlineDobPickerText: {
    fontFamily: "Urbanist-500",
    fontSize: 14,
    lineHeight: 20,
    color: huddleColors.text,
    flex: 1,
    minWidth: 0,
  },
  inlineDobPickerTextSelected: {
    color: huddleColors.text,
  },
  field: {
    height: huddleLayout.fieldHeight,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.24)",
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    includeFontPadding: false,
    color: huddleColors.text,
    textAlignVertical: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: huddleColors.neutralShadow,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 5, height: 5 },
    elevation: 1,
  },
  fieldWithLeadingIcon: {
    paddingLeft: 42,
  },
  fieldWithTrailingIcon: {
    paddingRight: 44,
  },
  fieldLeadingIcon: {
    position: "absolute",
    left: 16,
    top: 44,
    zIndex: 2,
  },
  fieldTrailingIcon: {
    position: "absolute",
    right: 10,
    top: 34,
    zIndex: 2,
  },
  passwordEyeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldFocused: {
    ...huddleFieldStates.focused,
  },
  fieldError: {
    ...huddleFieldStates.error,
  },
  fieldDisabled: {
    opacity: 0.72,
  },
  helperText: {
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.mutedText,
    marginTop: 0,
  },
  helperTextInline: {
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.mutedText,
  },
  sendingRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  sendingText: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  errorText: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  successText: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: "#15803D",
  },
  checkboxRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  checkbox: {
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
  checkboxChecked: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(74,73,101,0.80)",
  },
  legalText: {
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 18,
    color: "rgba(74,73,101,0.60)",
  },
  legalLink: {
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  buttonStack: {
    gap: huddleSpacing.x3,
  },
  emailInlineActions: {
    marginTop: 0,
    gap: huddleSpacing.x3,
  },
  emailFooterLinks: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    columnGap: huddleSpacing.x2,
    rowGap: huddleSpacing.x1,
  },
  emailFooterLinkText: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  emailFooterLinkDisabled: {
    color: huddleColors.mutedText,
  },
  emailFooterSeparator: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
  buttonLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x2,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  ghostButton: {
    ...huddleButtons.base,
    ...huddleButtons.ghost,
  },
  compactButton: {
    minHeight: 48,
  },
  primaryButtonLabel: {
    ...huddleButtons.label,
    lineHeight: 22,
    color: huddleColors.onPrimary,
  },
  secondaryButtonLabel: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  ghostButtonLabel: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  disabled: {
    ...huddleButtons.disabled,
  },
  pressed: {
    ...huddleButtons.pressed,
  },
  footer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    elevation: 30,
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x3,
    backgroundColor: huddleColors.glassOverlay,
    borderTopWidth: 1,
    borderTopColor: huddleColors.divider,
  },
  footerHint: {
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: 11,
    lineHeight: 15,
    color: huddleColors.mutedText,
  },
  retryLinkText: {
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  forgotPasswordButton: {
    minHeight: 32,
    alignSelf: "flex-end",
    justifyContent: "center",
  },
  forgotPasswordText: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.blue,
  },
  infoCard: {
    borderWidth: 1,
    borderColor: "rgba(33,69,207,0.18)",
    borderRadius: 20,
    padding: 16,
    gap: huddleSpacing.x2,
    marginTop: 20,
    backgroundColor: "rgba(33,69,207,0.06)",
  },
  infoTitle: {
    fontFamily: "Urbanist-600",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.text,
  },
  infoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoBody: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(74,73,101,0.70)",
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
    gap: huddleSpacing.x2,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassHeader,
  },
  modalStack: {
    marginTop: huddleSpacing.x2,
    gap: huddleSpacing.x3,
  },
  modalTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 18,
    lineHeight: 24,
    color: huddleColors.text,
  },
  modalBody: {
    fontFamily: "Urbanist-500",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(74,73,101,0.70)",
  },
  confirmationBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x4,
    backgroundColor: huddleColors.backdrop,
  },
  confirmationCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: huddleRadii.modal,
    padding: huddleSpacing.x5,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation2,
  },
  confirmationTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.h4,
    lineHeight: huddleType.h4Line,
    color: huddleColors.text,
    textAlign: "center",
  },
  confirmationBody: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
    textAlign: "center",
  },
  confirmationActions: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    marginTop: huddleSpacing.x5,
  },
  confirmationButton: {
    flex: 1,
    ...huddleButtons.base,
  },
  confirmationPrimaryButton: {
    ...huddleButtons.primary,
  },
  confirmationSecondaryButton: {
    ...huddleButtons.secondary,
  },
  confirmationPrimaryText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
    textAlign: "center",
  },
  confirmationSecondaryText: {
    ...huddleButtons.label,
    color: huddleColors.text,
    textAlign: "center",
  },
  modalFieldGroup: {
    gap: 8,
  },
  modalFieldLabel: {
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.text,
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
  supportFieldFocused: {
    ...huddleFieldStates.focused,
  },
  supportFieldError: {
    ...huddleFieldStates.error,
  },
  signinPasswordField: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 0,
    paddingRight: huddleSpacing.x3,
  },
  signinPasswordInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
  },
  modalPrimaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  modalPrimaryButtonLabel: {
    ...huddleButtons.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.onPrimary,
  },
  appModalPrimaryButtonLabel: {
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.onPrimary,
  },
  appModalSecondaryButtonLabel: {
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 18,
    color: huddleColors.text,
  },
  modalActions: {
    gap: huddleSpacing.x3,
  },
  legalModalSafeArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    paddingVertical: huddleSpacing.x7,
  },
  legalModalCard: {
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation2,
  },
  legalModalContent: {
    flex: 1,
  },
  legalModalStickyHeader: {
    minHeight: 56,
    paddingHorizontal: huddleSpacing.x5,
    paddingVertical: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: huddleColors.divider,
    backgroundColor: "#FFFFFF",
  },
  legalModalClose: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  legalModalScroll: {
    flex: 1,
  },
  legalModalScrollContent: {
    paddingHorizontal: huddleSpacing.x5,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x7,
  },
  legalModalTitle: {
    flex: 1,
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 28,
    color: huddleColors.text,
  },
  legalModalSection: {
    marginTop: huddleSpacing.x5,
  },
  legalModalSectionTitle: {
    marginBottom: huddleSpacing.x2,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  legalModalBody: {
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.text,
  },
  legalModalBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
    marginBottom: huddleSpacing.x2,
  },
  legalModalBulletDot: {
    width: 12,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.blue,
  },
  legalModalBulletText: {
    flex: 1,
    fontFamily: "Urbanist-400",
    fontSize: huddleType.label,
    lineHeight: 22,
    color: huddleColors.text,
  },
  legalModalMeta: {
    marginTop: huddleSpacing.x5,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 18,
    color: huddleColors.mutedText,
  },
});
