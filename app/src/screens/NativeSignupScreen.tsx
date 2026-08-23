import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNativeResponseWithTimeout as fetch } from "../lib/nativeTimeout";
import type { ReactNode } from "react";
import {
  Animated,
  AppState,
  BackHandler,
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
  type AppStateStatus,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import * as Device from "expo-device";
import { requestNativeNotificationPermissionDetail } from "../lib/nativeNotificationPermissions";
import { LinearGradient } from "expo-linear-gradient";
import type { Session } from "@supabase/supabase-js";
import { isValidPhoneNumber } from "libphonenumber-js";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AppConfirmModal,
  AppKeyboardAvoidingView as KeyboardAvoidingView,
  AppModalCard,
  AppModalCloseButton,
} from "../components/nativeModalPrimitives";
import { NativeFormTextField } from "../components/NativeFormField";
import { NativeLegalText } from "../components/NativeLegalText";
import { NativeLoadingState } from "../components/NativeLoadingState";
import { NativeSpinner } from "../components/NativeSpinner";
import { fetchNativeCareMarket } from "../lib/nativeCareMarket";
import { buildNativeProfileAreaCity, resolveNativeProfileMarketCity } from "../lib/nativeProfileLocation";
import { nativeModalStyles } from "../components/nativeModalPrimitives.styles";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { useErrorShake } from "../components/motion/useErrorShake";
import { NativeResetPasswordModal } from "./NativeAuthScreen";
import type { NativeLegalPageContent } from "../content/nativeLegalPages";
import { getNativeLegalPage } from "../content/nativeLegalPages";
import signupDobImage from "../../assets/Sign up/Signup_DOB.png";
import signupNameImage from "../../assets/Sign up/Signup_Name.png";
import verifyEmailImage from "../../assets/Verify-Email.png";
import notificationTransitionImage from "../../assets/Notifications/notification.png";
import {
  inferNativeCountryLabelFromPhone,
  nativeCountryOptions,
  SelectField,
} from "../components/profile/NativeProfileForm";
import { NativeBrandMedia } from "../components/NativeBrandMedia";
import { NativeSignupLocationStep } from "../components/NativeSignupLocationStep";
import { NativeSignupProgressBar } from "../components/NativeSignupProgressBar";
import { NativeHeroPhotoPicker } from "../components/NativeHeroPhotoPicker";
import { pickNativeProfilePhoto } from "../components/profile/NativeProfilePhotoPicker";
import { NativeProfilePhotoCropper, type NativePresentationCrop } from "../components/profile/NativeProfilePhotoCropper";
import {
  emptyNativeProfilePhotos,
  cleanupNativeProfilePhotoTemporaryAsset,
  getNativeProfilePhotoPublicUrl,
  isNativeProfilePhotoStoragePath,
  uploadNativeProfilePhotoAsset,
  type NativeProfileUploadAsset,
  type NativeSoloAspect,
} from "../lib/nativeProfilePhotos";
import { nativePetEmojiForLabel, nativePetFocusLabels } from "../lib/nativePetTaxonomy";
import {
  authSignupNative,
  checkIdentifierRegistered,
  checkSocialIdTaken,
  clearNativeSignupDraft,
  clearNativeSignupPassword,
  completeNativeSignupIdentity,
  completeNativeSignupProfile,
  confirmPreSignupVerify,
  emptyNativeSignupDraft,
  getPreSignupVerifyStatus,
  markNativeSignupLocation,
  loadNativeSignupDraft,
  markNativeSignupNotificationHandled,
  saveNativeSignupDraft,
  sendPreSignupVerify,
  hasUsablePreSignupProof,
  type NativeSignupDraft,
  type NativeSignupStep,
  type NativeSignupVerifyLink,
} from "../lib/nativeSignup";
import { armNativeOnboardingHero } from "../lib/nativeOnboardingHero";
import { haptic } from "../lib/nativeHaptics";
import { isReduceMotionActive } from "../lib/nativeReduceMotion";
import { nativePasswordPolicyError, nativePasswordSecurityError } from "../lib/nativePasswordSecurity";
import { nativeSafeErrorCopy } from "../lib/nativeSafeErrorCopy";
import { getNativeSignInDeviceContext } from "../lib/nativeSignInDevice";
import { logNativeProtectedActionFailure } from "../lib/nativeStorageCleanup";
import { parseNativeProfileImageStorageRef } from "../lib/nativeStorageUrlCache";
import { getNativeTurnstileSiteKey } from "../lib/nativeTurnstile";
import { trackNativeDeviceFingerprint } from "../lib/nativeVerifyIdentity";
import { createNativeFunctionHeaders, getFreshNativeSession, installNativeAuthSession, signOutNativeAuthSession, subscribeNativeAuthState } from "../lib/nativeFunctionClient";
import { supabase, supabaseUrl } from "../lib/supabase";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleLayout,
  huddleProfilePhotoSlots,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";


const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{1,14}$/;
const socialIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{4,13})[A-Za-z0-9]$/;
const socialIdErrorCopy = "Use 6-15 letters or numbers, with single dots, hyphens, or underscores inside.";
const RESEND_COOLDOWN_SECS = 40;
const POLL_INTERVAL_MS = 5000; // EC5: throttled from 3s → 5s to reduce battery during email-confirmation step
const POLL_WINDOW_MS = 2 * 60 * 1000;
const SIGNUP_SESSION_RETRY_COUNT = 12;
const SIGNUP_SESSION_RETRY_DELAY_MS = 250;
const SIGNUP_DRAFT_LOAD_TIMEOUT_MS = 3000;
const QUICK_PROFILE_RETURN_PATH = "/verify-identity?returnTo=/";
const QUICK_PROFILE_ROLE_WITH_PETS = "Pet Parent";
const QUICK_PROFILE_ROLE_WITHOUT_PETS = "Animal Friend (No Pet)";
const formatNativeEmailForInlineDisplay = (email: string) => {
  const value = email.trim();
  if (value.length <= 36) return value;
  const atIndex = value.lastIndexOf("@");
  const domain = atIndex > 0 ? value.slice(atIndex) : "";
  if (domain && domain.length < 24) {
    const localBudget = Math.max(8, 35 - domain.length);
    return `${value.slice(0, localBudget)}…${domain}`;
  }
  return `${value.slice(0, 17)}…${value.slice(-18)}`;
};
const isSavedQuickProfileAvatar = (value: string) => {
  const ref = parseNativeProfileImageStorageRef(value, { defaultBucket: "profile_photos" });
  return ref?.kind === "storage" && ref.bucket === "profile_photos" && isNativeProfilePhotoStoragePath(`profile_photos/${ref.objectPath}`);
};

type SignupVerifyLookupResult = "verified" | "not_yet" | "offline" | "expired" | "credentials_required";
type SignupNotificationTransitionState = {
  continueRequested: boolean;
  loading: boolean;
  promptRequested: boolean;
  session: Session | null;
  visible: boolean;
};

const emptySignupNotificationTransition: SignupNotificationTransitionState = {
  continueRequested: false,
  loading: false,
  promptRequested: false,
  session: null,
  visible: false,
};

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
  initialResumeStep?: NativeSignupStep | null;
  onCancel: () => void;
  onOpenWebPath: (path: string) => void;
  resumeLocationTransition?: boolean;
  resumeNotificationTransition?: boolean;
  resumeQuickProfile?: boolean;
  onSignedIn: (
    session: Session,
    nextPath: string,
    signupVerifyReturnActive?: boolean,
    completedOnboarding?: {
      profileExists: boolean;
      registeredIdentity: boolean;
      onboardingCompleted: boolean;
      ownsPets: boolean;
      activePetCount: number;
      signupResumeState?: string | null;
      signupNotificationPromptHandled?: boolean;
      signupWelcomePending?: boolean;
      careInterestPending?: boolean;
    },
  ) => void;
};

type FieldErrors = Record<string, string | undefined>;
type DobPickerKind = "month" | "day" | "year";
type ButtonVariant = "primary" | "secondary" | "ghost";
type LegalModalTarget = "terms" | "privacy";
type QuickProfileSubmitIntent = "verify" | "home";
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

function calculateAge(value: string) {
  const parsed = parseDob(value);
  if (!parsed) return null;
  const now = new Date();
  const years = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();
  return monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate()) ? years - 1 : years;
}

function formatDobForConfirmation(value: string) {
  const parsed = parseDob(value);
  if (!parsed) return "";
  return `${parsed.getDate()} ${monthOptions[parsed.getMonth()]} ${parsed.getFullYear()}`;
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
  if (message === "account_already_exists") {
    return "This email already has a Huddle account. Sign in instead.";
  }
  if (message === "signup_user_create_failed" || message === "signup_user_missing" || message === "signup_user_persist_failed") {
    return "We couldn't create your account yet. Please try again.";
  }
  if (message === "signup_session_unavailable") {
    return "Your account was created, but we couldn't sign you in yet. Please try again.";
  }
  if (message === "signup_proof_finalize_failed") {
    return "Your account was created, but we couldn't finish signup securely. Please try again.";
  }
  if (message === "account_unavailable") {
    return "Your huddle account is unavailable. Contact support if you think this is a mistake.";
  }
  if (message === "signup_temporarily_unavailable") {
    return "Signup is temporarily unavailable. Please try again later.";
  }
  if (message.includes("social_id_unavailable") || message.includes("23505")) {
    return "This Social ID is not available. Try another one.";
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
  return nativeSafeErrorCopy(message, "Account creation failed. Please try again.");
}

function resolveSignupThrownError(error: unknown, fallback = "Account creation failed. Please try again.") {
  if (error instanceof Error) return resolveSignupError(error.message);
  if (typeof error === "string") return resolveSignupError(error);
  return nativeSafeErrorCopy(error, fallback);
}

function mapSigninFailureMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed")) {
    return "Confirm your email first, then sign in again.";
  }
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
  return nativeSafeErrorCopy(message, "Couldn't sign you in.");
}

function mapSigninThrownError(error: unknown) {
  if (error instanceof Error) return mapSigninFailureMessage(error.message);
  if (typeof error === "string") return mapSigninFailureMessage(error);
  return nativeSafeErrorCopy(error, "Couldn't sign you in.");
}

async function signInWithHardenedNativeLogin(email: string, password: string) {
  const device = await getNativeSignInDeviceContext();
  const response = await fetch(`${supabaseUrl}/functions/v1/auth-login`, {
    method: "POST",
    headers: {
      ...createNativeFunctionHeaders(),
      "User-Agent": device.userAgent,
    },
    body: JSON.stringify({
      email,
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
  return session;
}

function isValidSocialId(value: string) {
  const socialId = value.trim();
  return socialIdPattern.test(socialId) && !/[._-]{2}/.test(socialId);
}

function SignupHeroImage({ source, compact, flush, trimmed }: { source: ImageSourcePropType; compact?: boolean; flush?: boolean; trimmed?: boolean }) {
  return <Image source={source} resizeMode="contain" style={[styles.heroImage, compact ? styles.heroImageCompact : null, trimmed ? styles.heroImageTrimmed : null, flush ? styles.heroImageFlush : null]} />;
}

const SIGNUP_STEP_ORDER_EMAIL: NativeSignupStep[] = ["dob", "credentials", "emailConfirmation", "name", "location", "quickProfile"];
const SIGNUP_STEP_ORDER_OAUTH: NativeSignupStep[] = ["dob", "credentials", "name", "location", "quickProfile"];
function signupProgress(step: NativeSignupStep, isOAuthOnboarding: boolean) {
  const order = isOAuthOnboarding ? SIGNUP_STEP_ORDER_OAUTH : SIGNUP_STEP_ORDER_EMAIL;
  const index = order.indexOf(step);
  return index < 0 ? 0 : (index + 1) / order.length;
}

function SignupButton({
  compact,
  disabled,
  hitSlop,
  label,
  labelNode,
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
  labelNode?: ReactNode;
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
      onPress={() => {
        if (resolvedVariant === "primary") haptic.primaryConfirm();
        else haptic.selectTab();
        onPress();
      }}
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
        <NativeSpinner tone={resolvedVariant === "primary" ? "primary" : "accent"} />
      ) : (
        <View style={styles.buttonLabelRow}>
          {leadingIcon}
          {labelNode ?? (
            <Text style={resolvedVariant === "primary" ? styles.primaryButtonLabel : resolvedVariant === "ghost" ? styles.ghostButtonLabel : styles.secondaryButtonLabel}>{label}</Text>
          )}
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
  onBlur,
  onFocus,
  placeholder = "",
  disabled,
  secureTextEntry,
  trailing,
  value,
}: {
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  error?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  label: string;
  leadingIcon?: ReactNode;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
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
                multiline={false}
                scrollEnabled
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                textBreakStrategy="simple"
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        editable={!disabled}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
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
          <NativeLegalText key={`intro-${index}`} style={styles.legalModalBody}>{paragraph}</NativeLegalText>
        ))}
        {page.sections.map((section) => (
          <View key={section.title} style={styles.legalModalSection}>
            <Text style={styles.legalModalSectionTitle}>{section.title}</Text>
            {section.body.map((paragraph, index) => (
              <NativeLegalText key={`${section.title}-${index}`} style={styles.legalModalBody}>{paragraph}</NativeLegalText>
            ))}
            {section.bullets?.map((bullet, index) => (
              <View key={`${section.title}-bullet-${index}`} style={styles.legalModalBulletRow}>
                <Text style={styles.legalModalBulletDot}>•</Text>
                <NativeLegalText style={styles.legalModalBulletText}>{bullet}</NativeLegalText>
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.legalModalMeta}>Updated: {page.effectiveDate}</Text>
      </ScrollView>
    </View>
  );
}

export function NativeSignupScreen({
  initialVerifyLink,
  initialResumeStep,
  onCancel,
  onOpenWebPath,
  onSignedIn,
  resumeLocationTransition = false,
  resumeNotificationTransition = false,
  resumeQuickProfile = false,
}: NativeSignupScreenProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const modalMaxHeight = Math.round(windowHeight * 0.8);
  const [step, setStep] = useState<NativeSignupStep>(initialResumeStep ?? (resumeQuickProfile ? "quickProfile" : resumeLocationTransition ? "location" : initialVerifyLink ? "emailConfirmation" : "dob"));
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [profileOnboardingCompleted, setProfileOnboardingCompleted] = useState(false);
  const [draft, setDraft] = useState<NativeSignupDraft>(emptyNativeSignupDraft);
  const [loaded, setLoaded] = useState(false);
  const [loadWarning, setLoadWarning] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [manualCheck, setManualCheck] = useState<"idle" | "checking" | "not_yet" | "offline" | "expired" | "credentials_required">("idle");
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  // Signup already assigns warning/error haptics per validation path; this hook
  // owns only the shared visual shake so those semantics are not doubled.
  const { shake: triggerShake, shakeStyle: continueShakeStyle } = useErrorShake(null);
  const [changeEmailConfirmOpen, setChangeEmailConfirmOpen] = useState(false);
  const [updatesChecked, setUpdatesChecked] = useState(false);
  const [dobPicker, setDobPicker] = useState<DobPickerKind | null>(null);
  const [duplicateDetected, setDuplicateDetected] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicateCheckedKey, setDuplicateCheckedKey] = useState("");
  const [duplicateCheckError, setDuplicateCheckError] = useState("");
  const [phoneValidationVisible, setPhoneValidationVisible] = useState(false);
  const [signupBlockedMessage, setSignupBlockedMessage] = useState("");
  const [passwordSecurityStatus, setPasswordSecurityStatus] = useState<"idle" | "checking" | "ok" | "failed">("idle");
  const [passwordSecurityError, setPasswordSecurityError] = useState("");
  const [passwordSecurityCheckedKey, setPasswordSecurityCheckedKey] = useState("");
  const [socialAvailability, setSocialAvailability] = useState<"idle" | "checking" | "available" | "taken" | "failed">("idle");
  const [socialAvailabilityCheckedKey, setSocialAvailabilityCheckedKey] = useState("");
  const [socialRetryNonce, setSocialRetryNonce] = useState(0);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
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
  const handledVerifyTokenRef = useRef<string | null>(null);
  const latestSignupRef = useRef({ email: "", presignupEmail: "", presignupToken: "", presignupResendKey: "", password: "" });
  const verifyStatusInFlightRef = useRef<{ email: string; request: Promise<SignupVerifyLookupResult> } | null>(null);
  const verifyStatusScopeRef = useRef({ appState, step });
  const hydratedIncompleteProfileRef = useRef<string | null>(null);
  const oauthSanitizedUserRef = useRef<string | null>(null);
  const stepTransition = useRef(new Animated.Value(1)).current;
  const dobCardAnim = useRef(new Animated.Value(0)).current;
  const [avatarUploadError, setAvatarUploadError] = useState(false);
  const [avatarCropAsset, setAvatarCropAsset] = useState<NativeProfileUploadAsset | null>(null);
  const [quickProfileSaving, setQuickProfileSaving] = useState(false);
  const [locationSubmitting, setLocationSubmitting] = useState(false);
  const [locationSubmitError, setLocationSubmitError] = useState("");
  const [notificationTransition, setNotificationTransition] = useState<SignupNotificationTransitionState>(emptySignupNotificationTransition);
  const notificationTransitionSessionRef = useRef<Session | null>(null);

  const updateDraft = useCallback((next: Partial<NativeSignupDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  useEffect(() => {
    let active = true;
    let settled = false;
    const timer = setTimeout(() => {
      if (!active || settled) return;
      settled = true;
      setDraft(emptyNativeSignupDraft);
      setLoadWarning("Couldn't load saved progress. Starting fresh.");
      setLoaded(true);
    }, SIGNUP_DRAFT_LOAD_TIMEOUT_MS);
    void getFreshNativeSession().then((fresh) => {
      const provider = String(fresh?.session.user?.app_metadata?.provider || "");
      const isOAuthSession = Boolean(fresh?.session.user && provider && provider !== "email");
      return loadNativeSignupDraft({ includePassword: !isOAuthSession });
    }).then((saved) => {
      if (!active || settled) return;
      settled = true;
      clearTimeout(timer);
      setDraft((current) => ({ ...current, ...saved }));
      if (saved.password) setConfirmPassword(saved.password);
      setLoaded(true);
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    void getFreshNativeSession().then((fresh) => {
      if (active) setAuthSession(fresh?.session ?? null);
    });
    const unsubscribeAuthState = subscribeNativeAuthState((_event, nextSession) => {
      setAuthSession(nextSession);
    });
    return () => {
      active = false;
      unsubscribeAuthState();
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
          .select("onboarding_completed")
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
    const session = authSession;
    if (!loaded || !resumeNotificationTransition || !session?.user) return;
    notificationTransitionSessionRef.current = session;
    setNotificationTransition({
      ...emptySignupNotificationTransition,
      loading: false,
      session,
      visible: true,
    });
  }, [authSession, loaded, resumeNotificationTransition]);

  useEffect(() => {
    let active = true;
    const userId = authSession?.user?.id;
    if (!loaded || resumeNotificationTransition || resumeLocationTransition || !userId || (!resumeQuickProfile && profileOnboardingCompleted) || hydratedIncompleteProfileRef.current === userId) {
      return () => {
        active = false;
      };
    }
    const hydrateIncompleteProfile = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("display_name,social_id,phone,dob,avatar_url,location_country,location_district,owns_pets,pet_experience,experience_years")
          .eq("id", userId)
          .maybeSingle();
        if (!active || !data?.display_name || !data?.social_id) return;
        const ownsPets = data.owns_pets === true;
        const petExperience = Array.isArray(data.pet_experience)
          ? data.pet_experience.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        hydratedIncompleteProfileRef.current = userId;
        updateDraft({
          displayName: String(data.display_name || "").trim(),
          socialId: String(data.social_id || "").trim(),
          phone: String(data.phone || draft.phone || "").trim(),
          dob: String(data.dob || draft.dob || "").trim(),
          avatarUri: String(data.avatar_url || draft.avatarUri || "").trim(),
          locationCountry: String(data.location_country || draft.locationCountry || "").trim(),
          locationDistrict: String(data.location_district || draft.locationDistrict || "").trim(),
          petExperienceMode: ownsPets ? "current" : petExperience.length > 0 ? "past" : draft.petExperienceMode || "",
          petExperienceKinds: petExperience.length > 0 ? petExperience : draft.petExperienceKinds,
          // Don't prefill the years field with a default 0 from a freshly-created
          // profile row — only hydrate a real, positive saved value.
          petExperienceYears: data.experience_years != null && Number(data.experience_years) > 0 ? String(data.experience_years) : draft.petExperienceYears,
        });
        setStep("quickProfile");
      } catch {
        // Keep the local draft; validation on Step 5 will show any missing fields.
      }
    };
    void hydrateIncompleteProfile();
    return () => {
      active = false;
    };
  }, [
    authSession?.user?.id,
    draft.avatarUri,
    draft.dob,
    draft.locationCountry,
    draft.locationDistrict,
    draft.petExperienceKinds,
    draft.petExperienceMode,
    draft.petExperienceYears,
    draft.phone,
    loaded,
    profileOnboardingCompleted,
    resumeLocationTransition,
    resumeNotificationTransition,
    resumeQuickProfile,
    updateDraft,
  ]);

  useEffect(() => {
    if (isReduceMotionActive()) {
      stepTransition.setValue(1);
      return;
    }
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
    if (manualCheck === "idle" || manualCheck === "checking") return;
    triggerShake();
  }, [manualCheck, triggerShake]);

  useEffect(() => {
    if (!loaded || step !== "quickProfile" || draft.locationCountry.trim()) return;
    const inferredCountry = inferNativeCountryLabelFromPhone(draft.phone);
    if (!inferredCountry) return;
    updateDraft({ locationCountry: inferredCountry });
  }, [draft.locationCountry, draft.phone, loaded, step, updateDraft]);

  const normalizedEmail = draft.email.trim().toLowerCase();
  verifyStatusScopeRef.current = { appState, step };
  const inlineEmail = formatNativeEmailForInlineDisplay(normalizedEmail);
  latestSignupRef.current = {
    email: normalizedEmail,
    presignupEmail: draft.presignupEmail,
    presignupToken: draft.presignupToken,
    presignupResendKey: draft.presignupResendKey,
    password: draft.password,
  };
  const oauthProvider = String(authSession?.user?.app_metadata?.provider || "");
  const isOAuthOnboarding = Boolean(authSession?.user && oauthProvider && oauthProvider !== "email");
  const oauthEmail = String(authSession?.user?.email || "").trim().toLowerCase();
  // A confirmed auth user can exist without a profile when signup stopped
  // between auth creation and identity completion. Resume that same session
  // in-place instead of sending the user through a duplicate-account loop.
  const currentSessionEmail = String(authSession?.user?.email || "").trim().toLowerCase();
  const hasCurrentEmailSession = Boolean(
    authSession?.user &&
      !isOAuthOnboarding &&
      currentSessionEmail &&
      (!normalizedEmail || normalizedEmail === currentSessionEmail),
  );
  const duplicateKey = `${normalizedEmail}|${draft.phone.trim()}`;
  const duplicateCheckKey = `${isOAuthOnboarding ? "oauth-phone" : normalizedEmail}|${draft.phone.trim()}`;
  const socialCheckKey = draft.socialId.trim().toLowerCase();
  const passwordSecurityKey = isOAuthOnboarding ? "" : draft.password;
  const phoneValid = isValidSignupPhone(draft.phone);
  const passwordRequirementError = isOAuthOnboarding
    ? undefined
    : nativePasswordPolicyError(draft.password) ?? undefined;
  const passwordLiveError = passwordRequirementError || passwordSecurityError || undefined;
  const confirmPasswordError = !isOAuthOnboarding && confirmPassword && confirmPassword !== draft.password ? "Passwords do not match" : undefined;
  const passwordDisplayError = errors.password || (passwordTouched && draft.password ? passwordLiveError : undefined);
  const confirmPasswordDisplayError = errors.confirmPassword || (confirmPasswordTouched && confirmPassword ? confirmPasswordError : undefined);
  const dobParts = useMemo(() => dobPartsFromStored(draft.dob), [draft.dob]);
  const assembledDob = dobParts.year && dobParts.month && dobParts.day ? `${dobParts.year}-${pad2(dobParts.month)}-${pad2(dobParts.day)}` : "";
  const allDobSelected = Boolean(dobParts.year && dobParts.month && dobParts.day);
  const isCalendarDobValid = allDobSelected ? isValidDob(assembledDob) : false;
  const isFutureDobValid = allDobSelected ? isNotFutureDob(assembledDob) : false;
  const isUnder13 = allDobSelected && isCalendarDobValid && isFutureDobValid ? !isAtLeastAge(assembledDob, 13) : false;
  const isUnder16But13 = allDobSelected && isCalendarDobValid && isFutureDobValid && !isUnder13 ? !isAtLeastAge(assembledDob, 16) : false;
  const liveDobError = allDobSelected
    ? isUnder13
      ? "You must be at least 13 years old to use huddle."
      : !isCalendarDobValid || !isFutureDobValid
        ? "Invalid date"
        : undefined
    : errors.dob;
  const canContinueDob = Boolean(allDobSelected && isCalendarDobValid && isFutureDobValid && !isUnder13);
  const showDobConfirmCard = Boolean(allDobSelected && isCalendarDobValid && isFutureDobValid);

  useEffect(() => {
    if (!loaded || !hasCurrentEmailSession || normalizedEmail || !currentSessionEmail) return;
    updateDraft({ email: currentSessionEmail });
  }, [currentSessionEmail, hasCurrentEmailSession, loaded, normalizedEmail, updateDraft]);

  const confirmedAge = showDobConfirmCard ? calculateAge(assembledDob) : null;
  // Age headline color tier + single body copy: brand blue (16+), coral (13–15), red (<13).
  const dobAgeColor = isUnder13 ? huddleColors.validationRed : isUnder16But13 ? huddleColors.coral : huddleColors.blue;
  const dobAgeBody = isUnder13
    ? "You must be 13 or above to use huddle."
    : isUnder16But13
      ? "Make sure your age looks right before moving on. Some features are available to people aged 16+."
      : "Make sure your age looks right before moving on.";
  useEffect(() => {
    if (!showDobConfirmCard) {
      dobCardAnim.setValue(0);
      return;
    }
    if (isReduceMotionActive()) {
      dobCardAnim.setValue(1);
      return;
    }
    dobCardAnim.setValue(0);
    Animated.timing(dobCardAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showDobConfirmCard, dobCardAnim]);
  const hasVerifiedSignupProof = Boolean(draft.signupProof.trim());
  const canContinueCredentials = Boolean(
    (isOAuthOnboarding || emailPattern.test(normalizedEmail)) &&
    phoneValid &&
    (isOAuthOnboarding || hasCurrentEmailSession || (
      draft.password.length >= 8 &&
      !passwordLiveError &&
      passwordSecurityStatus === "ok" &&
      passwordSecurityCheckedKey === passwordSecurityKey &&
      confirmPassword === draft.password &&
      (turnstileToken.trim() || hasVerifiedSignupProof)
    )) &&
    !signupBlockedMessage &&
    (isOAuthOnboarding ? !duplicateDetected : true) &&
    duplicateCheckedKey === duplicateCheckKey &&
    !checkingDuplicate &&
    !duplicateCheckError &&
    !busy,
  );
  const canContinueName = Boolean(
    draft.displayName.trim() &&
    isValidSocialId(draft.socialId) &&
    socialAvailability === "available" &&
    socialAvailabilityCheckedKey === socialCheckKey &&
    !busy,
  );
  const quickProfileNeedsYears = draft.petExperienceMode === "current" || draft.petExperienceMode === "past";
  const quickProfileYearsText = draft.petExperienceYears.trim();
  const quickProfileYearsValue = quickProfileYearsText === "" ? null : Number(quickProfileYearsText);
  const quickProfileYearsValid = !quickProfileNeedsYears || (
    /^\d{1,2}$/.test(quickProfileYearsText) &&
    quickProfileYearsValue !== null &&
    Number.isInteger(quickProfileYearsValue) &&
    quickProfileYearsValue >= 0 &&
    quickProfileYearsValue <= 99
  );
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentDay = new Date().getDate();
  // Year list is capped at currentYear - 13. The youngest selectable year still
  // allows an under-13 case (born that year but birthday not yet passed); that
  // now surfaces the age-gate message instead of silently clearing the picks.
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
    if (!loaded) return;
    const timer = setTimeout(() => {
      void saveNativeSignupDraft({ ...draft, turnstileToken }, { includePassword: !isOAuthOnboarding });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, isOAuthOnboarding, loaded, turnstileToken]);

  useEffect(() => {
    const userId = authSession?.user?.id || "";
    if (!loaded || !isOAuthOnboarding || !userId || oauthSanitizedUserRef.current === userId) return;
    oauthSanitizedUserRef.current = userId;
    setConfirmPassword("");
    setTurnstileToken("");
    setPasswordSecurityError("");
    setPasswordSecurityStatus("idle");
    setManualCheck("idle");
    updateDraft({
      email: oauthEmail,
      password: "",
      signupProof: "",
      presignupToken: "",
      presignupResendKey: "",
      presignupEmail: "",
      turnstileToken: "",
    });
    void clearNativeSignupPassword();
  }, [authSession?.user?.id, isOAuthOnboarding, loaded, oauthEmail, updateDraft]);

  useEffect(() => {
    setDuplicateDetected(false);
    setDuplicateCheckedKey("");
    setDuplicateCheckError("");
    setSignupBlockedMessage("");
    const trimmedEmail = normalizedEmail;
    const trimmedPhone = draft.phone.trim();
    if (hasCurrentEmailSession) {
      setCheckingDuplicate(false);
      setDuplicateCheckedKey(duplicateCheckKey);
      return;
    }
    if ((!isOAuthOnboarding && !emailPattern.test(trimmedEmail)) || !isValidSignupPhone(trimmedPhone)) {
      setCheckingDuplicate(false);
      return;
    }
    setCheckingDuplicate(true);
    let cancelled = false;
    const activeCheckKey = duplicateCheckKey;
    const timer = setTimeout(async () => {
      try {
        const duplicateEmail = isOAuthOnboarding ? "" : trimmedEmail;
        const duplicate = await checkIdentifierRegistered(duplicateEmail, trimmedPhone);
        if (cancelled) return;
        setDuplicateCheckedKey(activeCheckKey);
        if (duplicate?.blocked) {
          setSignupBlockedMessage(String(duplicate.public_message || "Your huddle account is unavailable. Contact support if you think this is a mistake."));
          return;
        }
        if (duplicate?.review_required) {
          setDuplicateCheckError("Signup is temporarily unavailable. Please try again later.");
          return;
        }
        const registered = Boolean(duplicate?.registered);
        setDuplicateDetected(registered);
        if (registered && isOAuthOnboarding) {
          setDuplicateCheckError("These account details are already used by another account.");
        } else if (registered && dismissedDuplicateKey !== `${trimmedEmail}|${trimmedPhone}`) {
          setSigninEmail(trimmedEmail);
          setShowSignInModal(true);
        } else if (!registered) {
          setShowSignInModal(false);
        }
      } catch {
        if (!cancelled) setDuplicateCheckError("Could not verify account details right now. Please retry.");
      } finally {
        if (!cancelled) setCheckingDuplicate(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dismissedDuplicateKey, draft.phone, duplicateCheckKey, hasCurrentEmailSession, isOAuthOnboarding, normalizedEmail]);

  useEffect(() => {
    setDismissedDuplicateKey(null);
    setSigninError("");
  }, [draft.phone, normalizedEmail]);

  useEffect(() => {
    setPasswordSecurityError("");
    setPasswordSecurityCheckedKey("");
    const password = draft.password;
    if (isOAuthOnboarding || !password.trim()) {
      setPasswordSecurityStatus("idle");
      return;
    }
    const policyError = nativePasswordPolicyError(password);
    if (policyError) {
      setPasswordSecurityStatus("idle");
      return;
    }
    let cancelled = false;
    setPasswordSecurityStatus("checking");
    const timer = setTimeout(async () => {
      const securityError = await nativePasswordSecurityError(password);
      if (cancelled) return;
      setPasswordSecurityError(securityError || "");
      setPasswordSecurityStatus(securityError ? "failed" : "ok");
      setPasswordSecurityCheckedKey(password);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.password, isOAuthOnboarding]);

  const legalModalPage = legalModalTarget ? getNativeLegalPage(legalModalTargets[legalModalTarget]) : null;

  useEffect(() => {
    const social = draft.socialId.trim().toLowerCase();
    setErrors((current) => ({ ...current, socialId: undefined }));
    setSocialAvailabilityCheckedKey("");
    if (!social) {
      setSocialAvailability("idle");
      return;
    }
    if (!isValidSocialId(social)) {
      setSocialAvailability("idle");
      setErrors((current) => ({ ...current, socialId: socialIdErrorCopy }));
      return;
    }
    let cancelled = false;
    setSocialAvailability("checking");
    const timer = setTimeout(async () => {
      try {
        const taken = await checkSocialIdTaken(social);
        if (cancelled) return;
        if (taken) {
          setSocialAvailability("taken");
          setErrors((current) => ({ ...current, socialId: "Oops! This Social ID was taken" }));
          return;
        }
        setSocialAvailability("available");
        setSocialAvailabilityCheckedKey(social);
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
    auth_confirmed?: boolean;
  } | null | undefined) => {
    const latest = latestSignupRef.current;
    const nextEmail = String(status?.email || latest.email || latest.presignupEmail || "").trim().toLowerCase();
    if (status?.expired) {
      updateDraft({ signupProof: "", presignupToken: "", presignupResendKey: "", presignupEmail: nextEmail });
      setMessage("This link has expired for your protection. No worries — click below to send a new one.");
      return false;
    }
    if (nextEmail) {
      updateDraft({ presignupEmail: nextEmail || latest.presignupEmail });
    }
    if (hasUsablePreSignupProof(status)) {
      updateDraft({
        email: nextEmail || latest.email,
        signupProof: String(status?.signup_proof || ""),
        presignupToken: "",
        presignupEmail: nextEmail || latest.email,
      });
      setMessage("");
      haptic.success(); // EC1: tactile confirmation when email-verified state is detected (polling or manual)
      setStep("name");
      return true;
    }
    return false;
  }, [updateDraft]);

  const recoverAuthConfirmedSignup = useCallback(async (emailOverride?: string | null) => {
    const latest = latestSignupRef.current;
    const email = String(emailOverride || latest.email || latest.presignupEmail || "").trim().toLowerCase();
    const password = latest.password.trim();
    if (!email || !password) {
      setMessage("Please go back and re-enter your signup details.");
      return "credentials_required" as SignupVerifyLookupResult;
    }
    try {
      await signInWithHardenedNativeLogin(email, password);
      updateDraft({ email, signupProof: "", presignupToken: "", presignupResendKey: "", presignupEmail: email });
      setMessage("");
      setStep("name");
      return "verified" as SignupVerifyLookupResult;
    } catch {
      setMessage("Could not continue sign up in this app. Please try again.");
      return "offline" as SignupVerifyLookupResult;
    }
  }, [updateDraft]);

  const lookupStatus = useCallback(async (): Promise<SignupVerifyLookupResult> => {
    const latest = latestSignupRef.current;
    const email = latest.email || latest.presignupEmail;
    if (!email) return "not_yet";
    const existing = verifyStatusInFlightRef.current;
    if (existing?.email === email) return existing.request;
    const request = (async (): Promise<SignupVerifyLookupResult> => {
      try {
        const status = await getPreSignupVerifyStatus(email, latest.presignupToken || undefined, latest.presignupResendKey || undefined);
        const current = latestSignupRef.current;
        const currentEmail = current.email || current.presignupEmail;
        const currentScope = verifyStatusScopeRef.current;
        if (currentEmail !== email || currentScope.step !== "emailConfirmation" || currentScope.appState !== "active") return "not_yet";
        if (status?.auth_confirmed) {
          return await recoverAuthConfirmedSignup(status.email || email);
        }
        if (status?.expired) {
          applyVerifyStatus(status);
          return "expired";
        }
        return applyVerifyStatus(status) ? "verified" : "not_yet";
      } catch {
        return "offline";
      }
    })();
    verifyStatusInFlightRef.current = { email, request };
    try {
      return await request;
    } finally {
      if (verifyStatusInFlightRef.current?.request === request) {
        verifyStatusInFlightRef.current = null;
      }
    }
  }, [applyVerifyStatus, recoverAuthConfirmedSignup]);

  useEffect(() => {
    if (step !== "emailConfirmation" || appState !== "active") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + POLL_WINDOW_MS;
    const poll = async () => {
      const result = await lookupStatus();
      if (cancelled || result === "verified" || result === "expired" || Date.now() >= deadline) return;
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [appState, lookupStatus, normalizedEmail, step]);

  useEffect(() => {
    if (step === "dob") setConfirmPassword("");
  }, [step]);

  const handleVerifyLink = useCallback(async (link: NativeSignupVerifyLink) => {
    const verifyToken = link.token.trim();
    if (!verifyToken || handledVerifyTokenRef.current === verifyToken) return;
    handledVerifyTokenRef.current = verifyToken;
    setStep("emailConfirmation");
    setBusy(true);
    setMessage("Confirming your email…");
    try {
      const status = await confirmPreSignupVerify(verifyToken, link.email || normalizedEmail);
      if (status?.auth_confirmed) {
        await recoverAuthConfirmedSignup(status.email || link.email || normalizedEmail);
        return;
      }
      const applied = applyVerifyStatus(status);
      if (!applied && status?.expired) {
        setMessage("This link has expired for your protection. No worries — click below to send a new one.");
      } else if (!applied) {
        if (handledVerifyTokenRef.current === verifyToken) handledVerifyTokenRef.current = null;
        setMessage("That verification link is no longer usable. Click below to send a fresh one.");
      }
    } catch {
      if (handledVerifyTokenRef.current === verifyToken) handledVerifyTokenRef.current = null;
      setMessage("That verification link is no longer usable. Click below to send a fresh one.");
    } finally {
      setBusy(false);
    }
  }, [applyVerifyStatus, normalizedEmail, recoverAuthConfirmedSignup]);

  useEffect(() => {
    if (!loaded || !initialVerifyLink) return;
    const nextToken = initialVerifyLink.token.trim();
    if (!nextToken || handledVerifyTokenRef.current === nextToken) return;
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
    haptic.selectTab();
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
  }, [currentDay, currentMonth, dayOptions, dobParts.month, dobParts.year, dobPicker, maxYear, yearOptions]);

  const selectedDobValue = dobPicker ? dobParts[dobPicker] : "";

  const validateDob = () => {
    const assembled = `${dobParts.year}-${pad2(dobParts.month)}-${pad2(dobParts.day)}`;
    if (!dobParts.year || !dobParts.month || !dobParts.day || !isValidDob(assembled) || !isNotFutureDob(assembled)) {
      haptic.error();
      triggerShake();
      setErrors({ dob: "Enter a valid date of birth." });
      return false;
    }
    if (!isAtLeastAge(assembled, 13)) {
      haptic.error();
      triggerShake();
      setErrors({ dob: "You must be at least 13 years old to use huddle." });
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

  const leaveApp = () => {
    // Under-13 age gate: exit on Android; iOS cannot quit programmatically, so
    // fall back to clearing the draft and returning to the auth landing.
    if (Platform.OS === "android") {
      BackHandler.exitApp();
      return;
    }
    void resetAndCancel();
  };

  const validateCredentials = () => {
    setPhoneValidationVisible(true);
    const next: FieldErrors = {};
    if (!hasCurrentEmailSession && !isOAuthOnboarding && !emailPattern.test(normalizedEmail)) next.email = "Invalid email format";
    if (!phonePattern.test(draft.phone.trim())) next.phone = "Invalid phone format";
    else if (!phoneValid) next.phone = "Your phone number is invalid";
    if (!isOAuthOnboarding && !hasCurrentEmailSession) {
      const passwordError = nativePasswordPolicyError(draft.password);
      if (passwordError || passwordSecurityError || passwordSecurityStatus === "checking" || passwordSecurityCheckedKey !== passwordSecurityKey) {
        next.password = passwordError || passwordSecurityError || "Checking password safety…";
      }
      if (confirmPassword !== draft.password) next.confirmPassword = "Passwords do not match";
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) { haptic.error(); triggerShake(); }
    return ok;
  };

  const continueCredentials = async () => {
    setMessage("");
    if (!validateCredentials()) return;
    if (hasCurrentEmailSession) {
      updateDraft({ email: currentSessionEmail, phone: draft.phone.trim() });
      setStep("name");
      return;
    }
    if (signupBlockedMessage) {
      setMessage(signupBlockedMessage);
      return;
    }
    if (duplicateCheckedKey !== duplicateCheckKey || checkingDuplicate) {
      setMessage("Checking account details. Please try again in a moment.");
      return;
    }
    if (duplicateDetected) {
      if (!isOAuthOnboarding) {
        setSigninEmail(normalizedEmail);
        setShowSignInModal(true);
      }
      return;
    }
    if (duplicateCheckError) return;
    if (isOAuthOnboarding) {
      updateDraft({
        email: oauthEmail || normalizedEmail,
        phone: draft.phone.trim(),
      });
      setStep("name");
      return;
    }
    setBusy(true);
    try {
      const existingProof = await getPreSignupVerifyStatus(normalizedEmail, draft.presignupToken || undefined).catch(() => null);
      if (existingProof?.verified && existingProof.signup_proof) {
        updateDraft({ signupProof: String(existingProof.signup_proof), email: normalizedEmail, phone: draft.phone.trim() });
        setStep("name");
        return;
      }
      if (!turnstileToken.trim()) {
        setMessage("Human verification is still loading. Please try again in a moment.");
        return;
      }
      const duplicate = await checkIdentifierRegistered(normalizedEmail, draft.phone.trim());
      if (duplicate?.blocked) {
        setMessage(String(duplicate.public_message || "Your huddle account is unavailable. Contact support if you think this is a mistake."));
        return;
      }
      if (duplicate?.review_required) {
        setMessage("Signup is temporarily unavailable. Please try again later.");
        return;
      }
      if (duplicate?.registered) {
        setSigninEmail(normalizedEmail);
        setShowSignInModal(true);
        setMessage("Welcome back — sign in to continue.");
        return;
      }
      updateDraft({ email: normalizedEmail, phone: draft.phone.trim(), turnstileToken: "" });
      const sent = await sendPreSignupVerify({
        email: normalizedEmail,
        resendKey: draft.presignupResendKey,
        turnstileToken,
        forceNewToken: true,
      });
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      handledVerifyTokenRef.current = null;
      updateDraft({
        presignupToken: "",
        presignupResendKey: String(sent.resend_key || ""),
        presignupEmail: String(sent.email || normalizedEmail).trim().toLowerCase(),
      });
      setCooldown(RESEND_COOLDOWN_SECS);
      setMessage(sent.email_sent === false ? "A recent verification email is already active. Check your inbox to continue." : "");
      setStep("emailConfirmation");
    } catch (error) {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setMessage(resolveSignupThrownError(error, "Something went wrong. Please try again."));
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
        resendKey: draft.presignupResendKey,
        turnstileToken,
        forceNewToken: true,
      });
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      handledVerifyTokenRef.current = null;
      updateDraft({
        presignupToken: "",
        presignupResendKey: String(sent.resend_key || ""),
        presignupEmail: String(sent.email || normalizedEmail).trim().toLowerCase(),
      });
      setCooldown(RESEND_COOLDOWN_SECS);
      setMessage("");
      haptic.success(); // EC1: Resend success
    } catch {
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
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

  const openSupport = () => {
    onOpenWebPath("/support");
  };

  const pickQuickProfileAvatar = async () => {
    haptic.selectTab();
    setAvatarUploadError(false);
    try {
      const picked = await pickNativeProfilePhoto({ soloAspect: "4:5" });
      if (!picked?.asset?.uri) return;
      // Hand off to the same interactive 4:5 hero cropper used for profile photos
      // instead of auto-cropping to a centred square.
      setAvatarCropAsset(picked.asset);
    } catch (error) {
      setAvatarUploadError(true);
      setErrors((current) => ({ ...current, avatar: nativeSafeErrorCopy(error, "Couldn't open your photo library. Try again.") }));
    }
  };

  const handleQuickProfileAvatarCropped = async (cropped: NativeProfileUploadAsset, _aspect: NativeSoloAspect | null, presentationCrop?: NativePresentationCrop) => {
    try {
      setErrors((current) => ({ ...current, avatar: undefined }));
      updateDraft({
        avatarUri: cropped.uri || "",
        avatarFileName: cropped.fileName || "",
        avatarMimeType: cropped.mimeType || "",
        avatarFileSize: typeof cropped.fileSize === "number" ? cropped.fileSize : null,
        avatarPresentation: presentationCrop ?? null,
      });
    } catch (error) {
      setAvatarUploadError(true);
      setErrors((current) => ({ ...current, avatar: nativeSafeErrorCopy(error, "Couldn't save that photo. Try again.") }));
    } finally {
      setAvatarCropAsset(null);
    }
  };

  const manualContinue = async () => {
    if (manualCheck === "credentials_required") {
      setManualCheck("idle");
      setStep("credentials");
      return;
    }
    setManualCheck("checking");
    const result = await lookupStatus();
    if (result !== "verified") {
      haptic.warning();
      setManualCheck(result);
      if (result !== "credentials_required") {
        setTimeout(() => setManualCheck("idle"), result === "offline" ? 4200 : 3000);
      }
    }
  };

  const changeEmail = () => {
    handledVerifyTokenRef.current = null;
    updateDraft({ signupProof: "", presignupToken: "", presignupResendKey: "", presignupEmail: "" });
    setTurnstileToken("");
    setConfirmPassword("");
    setCooldown(0);
    setMessage("");
    setManualCheck("idle");
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
      const session = await signInWithHardenedNativeLogin(signinEmail.trim().toLowerCase(), signinPassword);
      await clearNativeSignupDraft();
      setShowSignInModal(false);
      haptic.success();
      onSignedIn(session, "/");
    } catch (error) {
      setSigninError(mapSigninThrownError(error));
    } finally {
      setSigninLoading(false);
    }
  };

  const validateName = () => {
    const next: FieldErrors = {};
    if (!draft.displayName.trim()) next.displayName = "Enter your display name.";
    if (!isValidSocialId(draft.socialId)) {
      next.socialId = socialIdErrorCopy;
    } else if (socialAvailability === "checking") {
      next.socialId = "Checking Social ID…";
    } else if (socialAvailability === "taken") {
      next.socialId = "Oops! This Social ID was taken";
    } else if (socialAvailability !== "available" || socialAvailabilityCheckedKey !== draft.socialId.trim().toLowerCase()) {
      next.socialId = "Could not verify Social ID right now. Please retry.";
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) { haptic.error(); triggerShake(); }
    return ok;
  };

  const createEmailSignupSessionFromStep4 = async () => {
    const existing = (await getFreshNativeSession())?.session ?? null;
    if (existing?.user) {
      const existingProvider = String(existing.user.app_metadata?.provider || "");
      const existingEmail = String(existing.user.email || "").trim().toLowerCase();
      if (existingProvider && existingProvider !== "email") throw new Error("signup_session_mismatch");
      if (existingEmail && existingEmail !== normalizedEmail) throw new Error("signup_session_mismatch");
      return existing;
    }

    const signupProof = draft.signupProof.trim();
    if (!signupProof) {
      // The auth user can already exist when identity completion failed after
      // auth-signup consumed the one-time proof. Recover that confirmed
      // signup with the password already held for this signup attempt instead
      // of sending the user back through email verification.
      const password = latestSignupRef.current.password.trim();
      if (normalizedEmail && password) {
        try {
          const recovered = await signInWithHardenedNativeLogin(normalizedEmail, password);
          updateDraft({ email: normalizedEmail });
          return recovered;
        } catch {
          // If the auth user is not confirmed or the password is no longer
          // usable, retain the existing safe recovery message below.
        }
      }
      throw new Error("email_verification_required");
    }

    const result = await authSignupNative({
      email: normalizedEmail,
      password: draft.password,
      options: {
        emailRedirectTo: "https://huddle.pet/auth/callback",
        data: {
          huddle_native_signup_pending: "true",
          dob: draft.dob,
        },
      },
      signup_proof: signupProof,
      defer_profile_seed: true,
    });
    if (!result.session) throw new Error("signup_session_missing");
    updateDraft({ turnstileToken: "", signupProof: "" });
    return result.session;
  };

  const requestSignupNotificationPermission = async () => {
    // APNs registration is unavailable in the iOS Simulator. Avoid invoking
    // Expo Notifications there, where its persisted registration lookup needs
    // a Keychain entitlement that simulator builds do not provide.
    if (!Device.isDevice) return;
    try {
      await requestNativeNotificationPermissionDetail();
    } catch (error) {
      if (__DEV__) console.warn("[native-signup] notification_permission_prompt_failed", error);
    }
  };

  const finishSignupNotificationTransition = useCallback((session: Session) => {
    notificationTransitionSessionRef.current = null;
    setNotificationTransition(emptySignupNotificationTransition);
    setStep("location");
  }, []);

  const continueSignupNotificationTransition = useCallback(async () => {
    setNotificationTransition((current) => ({
      ...current,
      continueRequested: true,
      promptRequested: true,
    }));
    await requestSignupNotificationPermission();
    await markNativeSignupNotificationHandled().catch((error) => {
      if (__DEV__) console.warn("[native-signup] notification_transition_mark_failed", error);
    });
    const readySession = notificationTransitionSessionRef.current;
    if (readySession) finishSignupNotificationTransition(readySession);
  }, [finishSignupNotificationTransition]);

  useEffect(() => {
    const readySession = notificationTransitionSessionRef.current;
    if (!notificationTransition.visible || !notificationTransition.continueRequested || !readySession) return;
    finishSignupNotificationTransition(readySession);
  }, [finishSignupNotificationTransition, notificationTransition.continueRequested, notificationTransition.visible]);

  const validateAndAdvanceToQuickProfile = async () => {
    setMessage("");
    if (!validateName()) return;
    setBusy(true);
    notificationTransitionSessionRef.current = null;
    setNotificationTransition({
      ...emptySignupNotificationTransition,
      loading: true,
      visible: true,
    });
    try {
      const session = isOAuthOnboarding
        ? (await getFreshNativeSession())?.session ?? null
        : await createEmailSignupSessionFromStep4();
      if (!session?.user) throw new Error(isOAuthOnboarding ? "oauth_session_missing" : "signup_session_missing");
      const provider = String(session.user.app_metadata?.provider || "");
      if (isOAuthOnboarding && (!provider || provider === "email")) throw new Error("oauth_session_missing");
      if (!isOAuthOnboarding && provider && provider !== "email") throw new Error("signup_session_mismatch");
      const identity = await completeNativeSignupIdentity({
        display_name: draft.displayName.trim(),
        social_id: draft.socialId.trim().toLowerCase(),
        email: isOAuthOnboarding ? oauthEmail || normalizedEmail : normalizedEmail,
        phone: draft.phone.trim(),
        dob: draft.dob,
        marketing_opt_in_checked: updatesChecked,
      }, session.access_token);
      if (!identity?.id || identity.id !== session.user.id || identity.registered !== true) {
        throw new Error("profile_identity_failed");
      }
      updateDraft({
        email: isOAuthOnboarding ? oauthEmail || normalizedEmail : normalizedEmail,
        displayName: draft.displayName.trim(),
        socialId: draft.socialId.trim(),
      });
      notificationTransitionSessionRef.current = session;
      setNotificationTransition((current) => {
        return {
          ...current,
          loading: false,
          session,
          visible: true,
        };
      });
    } catch (error) {
      notificationTransitionSessionRef.current = null;
      setNotificationTransition(emptySignupNotificationTransition);
      setMessage(resolveSignupThrownError(error, "We couldn't prepare your account yet. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const saveQuickProfileForSession = async (session: Session, avatarPath: string) => {
    const petExperience = draft.petExperienceMode === "new" ? [] : draft.petExperienceKinds;
    const experienceYears = draft.petExperienceMode === "new" ? null : quickProfileYearsValue;
    const availabilityStatus = [draft.petExperienceMode === "current" ? QUICK_PROFILE_ROLE_WITH_PETS : QUICK_PROFILE_ROLE_WITHOUT_PETS];
    const locationCountry = draft.locationCountry.trim();
    const locationCity = resolveNativeProfileMarketCity({
      city: draft.locationCity,
      country: draft.locationCountry,
      district: draft.locationDistrict,
    });
    const locationDistrict = draft.locationDistrict.trim();
    const locationName = buildNativeProfileAreaCity(locationDistrict, locationCity, locationCountry);
    const photos = { ...emptyNativeProfilePhotos(), cover: avatarPath, avatar_presentation: draft.avatarPresentation };
    const avatarUrl = getNativeProfilePhotoPublicUrl(avatarPath);
    if (!avatarUrl) throw new Error("profile_photo_url_missing");

    const result = await completeNativeSignupProfile({
      avatar_url: avatarUrl,
      photos,
      location_country: locationCountry,
      location_city: locationCity || null,
      location_district: locationDistrict,
      location_name: locationName,
      owns_pets: draft.petExperienceMode === "current",
      availability_status: availabilityStatus,
      pet_experience: petExperience,
      experience_years: experienceYears,
      profile_editorial_v1: true,
    });

    if (!result?.id || result.id !== session.user.id) throw new Error("profile_upsert_failed");
  };

  const uploadQuickProfileAvatar = async (session: Session) => {
    const avatarUri = draft.avatarUri.trim();
    if (!avatarUri || !session.user?.id || !session.access_token) return false;
    if (isSavedQuickProfileAvatar(avatarUri)) {
      try {
        await saveQuickProfileForSession(session, avatarUri);
        setAvatarUploadError(false);
        setQuickProfileSaving(true);
        return true;
      } catch (error) {
        if (__DEV__) console.warn("[native-signup] profile_upsert_failed", error);
        setAvatarUploadError(false);
        setMessage(nativeSafeErrorCopy(error, "We couldn't save your profile yet. Please try again."));
        return false;
      }
    }
    let path = "";
    try {
      setQuickProfileSaving(true);
      path = await uploadNativeProfilePhotoAsset(
        session.user.id,
        "cover",
        {
          uri: avatarUri,
          fileName: draft.avatarFileName || null,
          mimeType: draft.avatarMimeType || null,
          fileSize: draft.avatarFileSize,
        },
        session.access_token,
      );
      await cleanupNativeProfilePhotoTemporaryAsset({
        uri: avatarUri,
        fileName: draft.avatarFileName || null,
      });
      updateDraft({
        avatarUri: path,
        avatarFileName: "",
        avatarMimeType: "",
        avatarFileSize: null,
      });
    } catch (error) {
      logNativeProtectedActionFailure("[native-signup] photo_upload_failed", error);
      setAvatarUploadError(true);
      setMessage(nativeSafeErrorCopy(error, "Profile photo upload failed. Please retry with this photo or choose another one."));
      return false;
    }

    try {
      await saveQuickProfileForSession(session, path);
      setAvatarUploadError(false);
      setQuickProfileSaving(true);
      return true;
    } catch (error) {
      if (__DEV__) console.warn("[native-signup] profile_upsert_failed", error);
      setAvatarUploadError(false);
      setMessage(nativeSafeErrorCopy(error, "We couldn't save your profile yet. Please try again."));
      return false;
    }
  };

  const continueQuickProfile = async (intent: QuickProfileSubmitIntent) => {
    setMessage("");
    setQuickProfileSaving(false);
    const nextErrors: FieldErrors = {};
    setAvatarUploadError(false);
    if (!draft.avatarUri.trim()) nextErrors.avatar = "Add your profile photo.";
    // Gender is optional (Apple Guideline 5.1.1(v)): request it, never require it.
    // Location is collected on the dedicated Location step (before this one), not here.
    if (!draft.petExperienceMode) nextErrors.petExperience = "Choose your pet experience.";
    if (quickProfileNeedsYears && !quickProfileYearsValid) nextErrors.petExperienceYears = "Use a whole number from 0 to 99.";
    if (draft.petExperienceMode !== "new" && draft.petExperienceKinds.length === 0) nextErrors.petExperienceKinds = "Choose at least one pet type.";
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      haptic.error();
      triggerShake();
      const firstErrorY: Record<string, number> = {
        avatar: 300,
        locationCountry: 620,
        locationDistrict: 700,
        petExperience: 860,
        petExperienceYears: 900,
        petExperienceKinds: 940,
      };
      scrollQuickProfileFieldIntoSafeZone(firstErrorY[firstError] ?? 700);
      return;
    }
    if (!draft.locationCountry.trim() || !draft.locationDistrict.trim()) {
      setStep("location");
      setLocationSubmitError("Choose your area before finishing your profile.");
      return;
    }
    setBusy(true);
    setQuickProfileSaving(true);
    const nextPath = intent === "verify" ? QUICK_PROFILE_RETURN_PATH : "/";
    try {
      const existingAuth = await getFreshNativeSession();
      const existingProvider = String(existingAuth?.session.user?.app_metadata?.provider || "");
      if (!existingAuth?.session.user) {
        throw new Error(isOAuthOnboarding ? "oauth_session_missing" : "signup_session_missing");
      }
      if (isOAuthOnboarding && (!existingProvider || existingProvider === "email")) throw new Error("oauth_session_missing");
      if (!isOAuthOnboarding && existingProvider && existingProvider !== "email") throw new Error("signup_session_missing");

      setQuickProfileSaving(true);
      updateDraft({
        email: isOAuthOnboarding ? oauthEmail || normalizedEmail : normalizedEmail,
        password: isOAuthOnboarding ? "" : draft.password,
        displayName: draft.displayName.trim(),
        socialId: draft.socialId.trim(),
        signupProof: "",
        presignupToken: "",
        presignupResendKey: "",
        presignupEmail: "",
        turnstileToken: "",
      });
      const uploaded = await uploadQuickProfileAvatar(existingAuth.session);
      if (!uploaded) return;
      const careSnapshot = await fetchNativeCareMarket(existingAuth.session.access_token).catch(() => null);
      // This prompt is an enhancement for a confirmed closed market only. A
      // transient market lookup failure must never turn an already-open market
      // into the closed-market signup experience.
      if (!careSnapshot || careSnapshot.is_active || careSnapshot.has_interest) {
        await completeSignup(nextPath, existingAuth.session);
        return;
      }
      // Finish signup first. RootNavigator will show the optional Care prompt
      // above the Home surface, so Quick Profile never remains underneath it.
      await completeSignup(nextPath, existingAuth.session, { careInterestPending: true });
    } catch (error) {
      if (isOAuthOnboarding) {
        setMessage(nativeSafeErrorCopy(error, "Couldn't finish Apple sign up. Please try Continue with Apple again."));
        return;
      }
      setMessage(nativeSafeErrorCopy(error, "Please go back and complete email verification again."));
    } finally {
      setBusy(false);
      setQuickProfileSaving(false);
    }
  };

  const waitForSignupSession = async () => {
    for (let attempt = 0; attempt < SIGNUP_SESSION_RETRY_COUNT; attempt += 1) {
      const fresh = await getFreshNativeSession();
      if (fresh?.accessToken) return fresh.session;
      await new Promise((resolve) => setTimeout(resolve, SIGNUP_SESSION_RETRY_DELAY_MS));
    }
    return null;
  };

  const completeSignup = async (
    nextPath: string,
    sessionOverride?: Session | null,
    options?: { careInterestPending?: boolean },
  ) => {
    setBusy(true);
    setQuickProfileSaving(true);
    const isVerifyIdentityPath = nextPath.startsWith("/verify-identity");
    const session = sessionOverride ?? (isVerifyIdentityPath ? await waitForSignupSession() : (await getFreshNativeSession())?.session ?? null);
    if (!session) {
      setBusy(false);
      setQuickProfileSaving(false);
      setMessage("Still preparing your account session. Please try again in a moment.");
      return;
    }
    await clearNativeSignupDraft();
    await armNativeOnboardingHero(session.user?.id);
    void trackNativeDeviceFingerprint("signup");
    setQuickProfileSaving(true);
    setBusy(false);
    haptic.success();
    onSignedIn(session, nextPath, isVerifyIdentityPath, {
      profileExists: true,
      registeredIdentity: true,
      onboardingCompleted: true,
      ownsPets: draft.petExperienceMode === "current",
      activePetCount: 0,
      signupResumeState: "complete",
      signupNotificationPromptHandled: true,
      signupWelcomePending: true,
      careInterestPending: options?.careInterestPending === true,
    });
  };

  const resetAndCancel = useCallback(async () => {
    await clearNativeSignupDraft();
    onCancel();
  }, [onCancel]);

  const handleVisibleBack = useCallback(() => {
    if (step === "quickProfile") setStep("location");
    else if (step === "dob") void resetAndCancel();
    else if (step === "credentials") {
      setConfirmPassword("");
      setStep("dob");
    } else if (step === "emailConfirmation") setChangeEmailConfirmOpen(true);
    else if (step === "name") setStep("credentials");
    else setStep("name");
  }, [resetAndCancel, step]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleVisibleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleVisibleBack]);

  const signOutFromQuickProfile = async () => {
    await clearNativeSignupDraft();
    await signOutNativeAuthSession({ scope: "local" }).catch(() => undefined);
    onCancel();
  };

  const submitSignupLocation = async (loc: { country: string; city: string; district: string; locationName: string }) => {
    setLocationSubmitError("");
    setLocationSubmitting(true);
    try {
      const fresh = await getFreshNativeSession();
      if (!fresh?.session.user) throw new Error(isOAuthOnboarding ? "oauth_session_missing" : "signup_session_missing");
      const result = await markNativeSignupLocation({
        location_country: loc.country,
        location_city: loc.city || undefined,
        location_district: loc.district,
        location_name: loc.locationName,
      });
      if (!result?.id || result.id !== fresh.session.user.id) throw new Error("location_transition_failed");
      updateDraft({ locationCountry: loc.country, locationCity: loc.city, locationDistrict: loc.district });
      setStep("quickProfile");
    } catch (error) {
      setLocationSubmitError(nativeSafeErrorCopy(error, "We couldn't save your location yet. Please try again."));
    } finally {
      setLocationSubmitting(false);
    }
  };

  const returnToSignupNotificationTransition = async () => {
    const session = authSession ?? (await getFreshNativeSession())?.session ?? null;
    if (!session?.user) {
      await signOutFromQuickProfile();
      return;
    }
    notificationTransitionSessionRef.current = session;
    setNotificationTransition({
      ...emptySignupNotificationTransition,
      loading: false,
      session,
      visible: true,
    });
  };

  if (!loaded) {
    return (
      <NativeLoadingState variant="centered" style={styles.loadingScreen} />
    );
  }

  if (notificationTransition.visible) {
    return (
      <View style={styles.notificationTransitionScreen}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.notificationTransitionSafeArea}>
          <View style={styles.signupTransitionTopBar}>
            <Pressable
              accessibilityLabel="Sign out"
              accessibilityRole="button"
              onPress={() => void signOutFromQuickProfile()}
              style={({ pressed }) => [styles.signupTopTextButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.signupTopTextLabel}>Sign out</Text>
            </Pressable>
            <View style={styles.headerButton} />
          </View>
          <View style={styles.notificationTransitionContent}>
            <Text style={[styles.title, styles.notificationTransitionTitle]}>Be there when a pet needs people</Text>
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={notificationTransitionImage}
              style={styles.notificationTransitionImage}
            />
            <Text style={[styles.body, styles.notificationTransitionBody]}>
              Turn on alerts for lost pets, strays, and street hazards near you — every small action can help make a pet safer.
            </Text>
          </View>
          <SignupButton
            disabled={notificationTransition.promptRequested}
            label="Continue"
            loadingLabel="Setting up your account…"
            loading={notificationTransition.continueRequested && notificationTransition.loading}
            onPress={() => void continueSignupNotificationTransition()}
          />
        </SafeAreaView>
      </View>
    );
  }

  if (step === "location") {
    return (
      <NativeSignupLocationStep
        initialCountry={draft.locationCountry}
        initialCity={draft.locationCity}
        initialDistrict={draft.locationDistrict}
        errorMessage={locationSubmitError}
        submitting={locationSubmitting}
        onBack={() => void returnToSignupNotificationTransition()}
        onSubmit={(loc) => void submitSignupLocation(loc)}
      />
    );
  }

  if (step === "quickProfile" && busy && quickProfileSaving) {
    return (
      <View style={styles.quickProfileSaveScreen}>
        <NativeBrandMedia size={160} windowHeight={132} />
        <View style={styles.quickProfileSaveProgressWrap}>
          <NativeSpinner tone="accent" size="lg" />
        </View>
      </View>
    );
  }

  const scrollBottomPadding = step === "credentials"
    ? insets.bottom + 184
    : step === "emailConfirmation" || step === "quickProfile"
      ? insets.bottom + 184
      : step === "dob" && isUnder13
        ? insets.bottom + 190
        : insets.bottom + 112;
  const showEmailRecoveryCopy = message.includes("expired") || message.includes("no longer usable");
  const showEmailSendError = message.includes("couldn't send a verification email");
  const emailResendDisabled = cooldown > 0 || busy || (!draft.presignupResendKey.trim() && !turnstileToken.trim());
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

  const scrollQuickProfileFieldIntoSafeZone = (y: number) => {
    setTimeout(() => {
      signupScrollRef.current?.scrollTo({
        y: Math.max(0, y - 96),
        animated: true,
      });
    }, 80);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <NativeSignupProgressBar progress={signupProgress(step, isOAuthOnboarding)} />
        <View style={styles.signupTopBar}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={handleVisibleBack}
            style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
          >
            <Feather name="arrow-left" size={24} color="rgba(74,73,101,0.55)" />
          </Pressable>
          <View />
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
            step === "quickProfile" ? styles.quickProfileScrollContent : null,
            { paddingBottom: scrollBottomPadding },
          ]}
        >
          {loadWarning ? <Text style={styles.loadWarningText}>{loadWarning}</Text> : null}
          {step === "dob" ? (
            <View style={styles.panel}>
              <SignupHeroImage trimmed source={signupDobImage} />
              <Text style={styles.title}>When were you born?</Text>
              <Text style={styles.body}>
                We ask once to keep huddle age-appropriate and trusted for every pet person.
              </Text>
              <View style={styles.formStack}>
                <View style={styles.dobGroup}>
                  <Text style={styles.label}>Date of birth</Text>
                  <View style={styles.dobRow}>
                    <Pressable accessibilityLabel="Choose birth month" accessibilityRole="button" onPress={() => { haptic.selectTab(); setDobPicker(dobPicker === "month" ? null : "month"); }} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectMonth, liveDobError ? styles.dobSelectError : null, pressed ? styles.pressed : null]}>
                      <Text numberOfLines={1} style={[styles.dobSelectText, !dobParts.month ? styles.dobPlaceholderText : null]}>
                        {dobParts.month ? monthOptions[Math.max(0, Number(dobParts.month) - 1)] : "Month"}
                      </Text>
                      <Feather name="chevron-down" size={18} color="rgba(66,73,101,0.45)" />
                    </Pressable>
                    <Pressable accessibilityLabel="Choose birth day" accessibilityRole="button" onPress={() => { haptic.selectTab(); setDobPicker(dobPicker === "day" ? null : "day"); }} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectDay, liveDobError ? styles.dobSelectError : null, pressed ? styles.pressed : null]}>
                      <Text numberOfLines={1} style={[styles.dobSelectText, !dobParts.day ? styles.dobPlaceholderText : null]}>
                        {dobParts.day ? String(Number(dobParts.day)) : "Day"}
                      </Text>
                      <Feather name="chevron-down" size={18} color="rgba(66,73,101,0.45)" />
                    </Pressable>
                    <Pressable accessibilityLabel="Choose birth year" accessibilityRole="button" onPress={() => { haptic.selectTab(); setDobPicker(dobPicker === "year" ? null : "year"); }} style={({ pressed }) => [styles.dobSelectField, styles.dobSelectYear, liveDobError ? styles.dobSelectError : null, pressed ? styles.pressed : null]}>
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
                  {liveDobError && !showDobConfirmCard ? <Text style={styles.errorText}>{liveDobError}</Text> : null}
                  {showDobConfirmCard && confirmedAge !== null ? (
                    <Animated.View style={[styles.dobConfirmCard, { opacity: dobCardAnim, transform: [{ translateY: dobCardAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
                      <Text style={[styles.dobConfirmTitle, { color: dobAgeColor }]}>You're {confirmedAge}</Text>
                      <Text style={[styles.dobConfirmBody, isUnder13 ? styles.dobConfirmBodyAlert : null]}>{dobAgeBody}</Text>
                      {!isUnder13 ? (
                        <Text style={styles.dobConfirmSafe}>Don't worry— your full birthday is kept safe with us.</Text>
                      ) : null}
                    </Animated.View>
                  ) : null}
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
                  onChangeText={(value) => {
                    setConfirmPassword("");
                    setErrors((current) => ({ ...current, email: undefined }));
                    updateDraft({ email: value, signupProof: "", presignupToken: "", presignupResendKey: "", presignupEmail: "" });
                    handledVerifyTokenRef.current = null;
                  }}
                  onFocus={() => scrollCredentialsFieldIntoSafeZone(120)}
                  keyboardType="email-address"
                  leadingIcon={<Feather name="mail" size={16} color="rgba(74,73,101,0.55)" />}
                  error={errors.email}
                  disabled={isOAuthOnboarding}
                />
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Phone Number</Text>
                  <NativePhoneField
                    error={Boolean(errors.phone || (phoneValidationVisible && draft.phone.trim() && !phoneValid))}
                    onBlur={() => setPhoneValidationVisible(true)}
                    onChangeText={(phone) => {
                      setPhoneValidationVisible(false);
                      setErrors((current) => ({ ...current, phone: undefined }));
                      updateDraft({ phone });
                    }}
                    onFocus={() => scrollCredentialsFieldIntoSafeZone(200)}
                    onOpenCountryPicker={() => scrollCredentialsFieldIntoSafeZone(200)}
                    placeholder="Choose country code"
                    value={draft.phone}
                  />
                  {errors.phone ? <Text style={styles.errorText}>Your phone number is invalid</Text> : null}
                  {!errors.phone && phoneValidationVisible && draft.phone.trim() && !phoneValid ? (
                    <Text style={styles.errorText}>Your phone number is invalid</Text>
                  ) : null}
                  {!errors.phone && checkingDuplicate ? <Text style={styles.helperTextInline}>Checking account details…</Text> : null}
                  {!errors.phone && !checkingDuplicate && duplicateDetected ? (
                    <Text style={styles.errorText}>
                      {isOAuthOnboarding ? "These account details are already used by another account." : "Welcome back — sign in to continue."}
                    </Text>
                  ) : null}
                  {!errors.phone && !checkingDuplicate && duplicateCheckError ? <Text style={styles.errorText}>{duplicateCheckError}</Text> : null}
                </View>
                {!isOAuthOnboarding ? (
                  <>
                    <Field
                      label="Password"
                      value={draft.password}
                      onChangeText={(value) => {
                        setPasswordTouched(false);
                        setConfirmPasswordTouched(false);
                        setConfirmPassword("");
                        setErrors((current) => ({ ...current, password: undefined, confirmPassword: undefined }));
                        updateDraft({ password: value });
                      }}
                      onBlur={() => setPasswordTouched(true)}
                      onFocus={() => scrollCredentialsFieldIntoSafeZone(260)}
                      secureTextEntry={!passwordVisible}
                      leadingIcon={<Feather name="lock" size={16} color="rgba(74,73,101,0.55)" />}
                      trailing={
                        <Pressable accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} accessibilityRole="button" onPress={() => setPasswordVisible((visible) => !visible)} style={styles.passwordEyeButton}>
                          <Feather name={passwordVisible ? "eye-off" : "eye"} size={16} color="rgba(74,73,101,0.55)" />
                        </Pressable>
                      }
                      error={passwordDisplayError}
                    />
                    {!passwordDisplayError && passwordTouched && draft.password && passwordSecurityStatus === "checking" ? (
                      <Text style={styles.helperTextInline}>Checking password safety…</Text>
                    ) : null}
                    <Field
                      label="Confirm Password"
                      value={confirmPassword}
                      onChangeText={(value) => {
                        setConfirmPasswordTouched(false);
                        setErrors((current) => ({ ...current, confirmPassword: undefined }));
                        setConfirmPassword(value);
                      }}
                      onBlur={() => setConfirmPasswordTouched(true)}
                      onFocus={() => scrollCredentialsFieldIntoSafeZone(360)}
                      secureTextEntry={!confirmPasswordVisible}
                      leadingIcon={<Feather name="lock" size={16} color="rgba(74,73,101,0.55)" />}
                      trailing={
                        <Pressable accessibilityLabel={confirmPasswordVisible ? "Hide confirm password" : "Show confirm password"} accessibilityRole="button" onPress={() => setConfirmPasswordVisible((visible) => !visible)} style={styles.passwordEyeButton}>
                          <Feather name={confirmPasswordVisible ? "eye-off" : "eye"} size={16} color="rgba(74,73,101,0.55)" />
                        </Pressable>
                      }
                      error={confirmPasswordDisplayError}
                    />
                  </>
                ) : null}
                <View style={styles.legalStack}>
                  <Pressable
                    accessibilityLabel="Receive huddle email updates"
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
                    key={`signup-turnstile-${turnstileResetKey}`}
                    onError={setMessage}
                    onToken={(token) => {
                      setTurnstileToken(token);
                      if (token) setMessage("");
                    }}
                    siteKey={getNativeTurnstileSiteKey()}
                  />
                ) : null}
                {signupBlockedMessage ? (
                  <View style={styles.inlineErrorActionRow}>
                    <Text style={[styles.errorText, styles.inlineErrorActionCopy]}>{signupBlockedMessage}</Text>
                    <Pressable accessibilityLabel="Contact support" accessibilityRole="button" hitSlop={8} onPress={openSupport}>
                      <Text style={styles.inlineErrorLink}>Contact support</Text>
                    </Pressable>
                  </View>
                ) : null}
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
              </View>
            </View>
          ) : null}

          {step === "emailConfirmation" ? (
            <View style={[styles.panel, styles.emailConfirmationPanel]}>
              {busy ? (
                <View style={styles.sendingRow}>
                  <NativeSpinner tone="accent" size="md" />
                  <Text style={styles.sendingText}>{message.includes("Confirming") ? "Confirming…" : "Sending…"}</Text>
                </View>
              ) : null}
              <Text style={styles.title}>Verify your email</Text>
              <Text style={[styles.body, styles.emailConfirmationBody]}>
                {showEmailSendError || showEmailRecoveryCopy ? (
                  message
                ) : (
                  <>
                    We&apos;ve sent a link to <Text style={styles.bodyStrong}>{inlineEmail || "your email"}</Text>. Please check your inbox to continue.
                  </>
                )}
              </Text>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={verifyEmailImage}
                style={styles.signupInlineImage}
              />
              <NativeTurnstile
                action="send_pre_signup_verify"
                hidden
                key={`signup-hidden-turnstile-${turnstileResetKey}`}
                onError={setMessage}
                onToken={(token) => {
                  setTurnstileToken(token);
                  if (token) setMessage("");
                }}
                siteKey={getNativeTurnstileSiteKey()}
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
                <Field
                  label="Display name"
                  value={draft.displayName}
                  onChangeText={(value) => {
                    setErrors((current) => ({ ...current, displayName: undefined }));
                    updateDraft({ displayName: value });
                  }}
                  onFocus={() => scrollCredentialsFieldIntoSafeZone(250)}
                  autoCapitalize="words"
                  error={errors.displayName}
                  placeholder="What should people call you?"
                />
                <Field
                  label="Social ID"
                  value={draft.socialId}
                  onChangeText={(value) => updateDraft({ socialId: value })}
                  onFocus={() => scrollCredentialsFieldIntoSafeZone(350)}
                  error={errors.socialId}
                  placeholder="How you'll appear on Social"
                />
                {!errors.socialId && socialAvailability === "checking" ? <Text style={styles.helperTextInline}>Checking Social ID…</Text> : null}
                {!errors.socialId && socialAvailability === "available" ? <Text style={styles.successText}>Social ID is available</Text> : null}
                {socialAvailability === "failed" && !errors.socialId ? (
                  <Pressable accessibilityLabel="Retry Social ID check" accessibilityRole="button" onPress={() => setSocialRetryNonce((value) => value + 1)}>
                    <Text style={styles.retryLinkText}>Retry check</Text>
                  </Pressable>
                ) : null}
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
              </View>
            </View>
          ) : null}

          {step === "quickProfile" ? (
            <View style={styles.quickProfilePanel}>
              <View style={styles.quickProfileContent}>
                <View style={styles.quickPhotoSection}>
                  <NativeHeroPhotoPicker
                    uri={draft.avatarUri}
                    presentationCrop={draft.avatarPresentation}
                    onPick={() => void pickQuickProfileAvatar()}
                    onRemove={() => updateDraft({ avatarUri: "", avatarFileName: "", avatarMimeType: "", avatarFileSize: null, avatarPresentation: null })}
                    badgeLabel="Profile Image"
                    emptyTitle="Add main photo"
                    emptyHelper="A clear photo of you. Eye contact. Daylight is your friend."
                    error={Boolean(avatarUploadError || errors.avatar)}
                  />
                  {errors.avatar || avatarUploadError ? <Text style={styles.quickPhotoErrorText}>{errors.avatar || "Profile photo upload failed. Please choose the photo again and retry."}</Text> : null}
                </View>
                <Text style={styles.title}>Almost done.</Text>
                <Text style={styles.body}>Set up the basics so Huddle feels like yours. You can update these anytime.</Text>

                <View style={styles.quickSection}>
                  <Text style={styles.quickSectionTitle}>Pet experience</Text>
                  {[
                    { value: "current" as const, title: "I have pets now" },
                    { value: "past" as const, title: "I've had pets before" },
                    { value: "new" as const, title: "I'm new to pets" },
                  ].map((option) => {
                    const selected = draft.petExperienceMode === option.value;
                    const selectedNeedsYears = selected && (option.value === "current" || option.value === "past");
                    return (
                      <View key={option.value} style={styles.quickExperienceOption}>
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          onPress={() => {
                            haptic.selectTab();
                            updateDraft({
                              petExperienceMode: option.value,
                              petExperienceKinds: option.value === "new" ? [] : draft.petExperienceKinds,
                              petExperienceYears: option.value === "new" ? "" : draft.petExperienceYears,
                            });
                            setErrors((current) => ({
                              ...current,
                              petExperience: undefined,
                              petExperienceYears: option.value === "new" ? undefined : current.petExperienceYears,
                              petExperienceKinds: option.value === "new" ? undefined : current.petExperienceKinds,
                            }));
                          }}
                          style={({ pressed }) => [styles.quickRadioCard, selected ? styles.quickRadioCardSelected : null, pressed ? styles.pressed : null]}
                        >
                          <View style={styles.quickRadioDot}>{selected ? <View style={styles.quickRadioDotInner} /> : null}</View>
                          <View style={styles.quickRadioTextWrap}>
                            {selectedNeedsYears ? (
                              <View style={styles.quickRadioInlineSentence}>
                                <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.quickRadioTitle, styles.quickRadioSentenceLead]}>{option.title} for</Text>
                                <TextInput
                                  multiline={false}
                                  scrollEnabled
                                  numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                                  textBreakStrategy="simple"
                                  accessibilityLabel={`${option.title} years`}
                                  keyboardType="number-pad"
                                  maxLength={2}
                                  onChangeText={(value) => {
                                    const nextValue = value.replace(/[^\d]/g, "").slice(0, 2);
                                    updateDraft({ petExperienceYears: nextValue });
                                    if (/^\d{1,2}$/.test(nextValue)) {
                                      setErrors((current) => ({ ...current, petExperienceYears: undefined }));
                                    }
                                  }}
                                  onFocus={() => scrollQuickProfileFieldIntoSafeZone(900)}
                                  returnKeyType="done"
                                  style={[
                                    styles.quickYearsUnderlineInput,
                                    errors.petExperienceYears ? styles.quickYearsUnderlineInputError : null,
                                  ]}
                                  value={draft.petExperienceYears}
                                />
                                <Text style={styles.quickRadioTitle}>years.</Text>
                              </View>
                            ) : (
                              <Text style={styles.quickRadioTitle}>{option.title}</Text>
                            )}
                          </View>
                        </Pressable>
                        {selected && (option.value === "current" || option.value === "past") ? (
                          <View style={styles.quickExperienceDetails}>
                            {errors.petExperienceYears ? <Text style={styles.errorText}>{errors.petExperienceYears}</Text> : null}
                            <Text style={styles.quickSectionTitle}>Which kinds?</Text>
                            <View style={styles.quickChipWrap}>
                              {nativePetFocusLabels.map((label) => {
                                const kindSelected = draft.petExperienceKinds.includes(label);
                                const nextKinds = kindSelected
                                  ? draft.petExperienceKinds.filter((item) => item !== label)
                                  : [...draft.petExperienceKinds, label];
                                return (
                                  <Pressable
                                    accessibilityRole="button"
                                    key={label}
                                    onPress={() => {
                                      haptic.selectTab();
                                      updateDraft({ petExperienceKinds: nextKinds });
                                      if (nextKinds.length > 0) setErrors((current) => ({ ...current, petExperienceKinds: undefined }));
                                    }}
                                    style={({ pressed }) => [styles.quickPetChip, kindSelected ? styles.quickChipSelected : null, pressed ? styles.pressed : null]}
                                  >
                                    <Text style={[styles.quickChipText, kindSelected ? styles.quickChipTextSelected : null]}>{nativePetEmojiForLabel(label)} {label}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                            {errors.petExperienceKinds ? <Text style={styles.errorText}>{errors.petExperienceKinds}</Text> : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  {errors.petExperience ? <Text style={styles.errorText}>{errors.petExperience}</Text> : null}
                </View>
                {message ? <Text style={styles.errorText}>{message}</Text> : null}
              </View>
            </View>
          ) : null}
        </Animated.ScrollView>

        <Animated.View style={[styles.footer, { paddingBottom: insets.bottom + 16 }, continueShakeStyle]}>
          {step === "dob" ? (
            isUnder13 ? (
              <SignupButton variant="secondary" label="Leave App" onPress={leaveApp} />
            ) : (
              <SignupButton disabled={!canContinueDob} label="Continue" onPress={continueDob} />
            )
          ) : null}
          {step === "credentials" ? (
            <View style={styles.buttonStack}>
              <SignupButton disabled={!canContinueCredentials} label="Continue" loading={busy} onPress={() => void continueCredentials()} />
            </View>
          ) : null}
          {step === "emailConfirmation" ? (
            <View style={styles.buttonStack}>
              <View>
                <SignupButton
                  compact
                  variant="secondary"
                  label={
                    manualCheck === "checking"
                      ? "Checking…"
                      : manualCheck === "not_yet"
                        ? "Not verified yet"
                        : manualCheck === "offline"
                          ? "Try again"
                          : manualCheck === "expired"
                            ? "Link expired"
                            : manualCheck === "credentials_required"
                              ? "Re-enter details"
                              : draft.signupProof.trim()
                                ? "Continue"
                                : "I've verified, continue"
                  }
                  disabled={manualCheck === "checking" || busy}
                  onPress={() => void manualContinue()}
                />
              </View>
              {normalizedEmail ? (
                <View style={styles.emailFooterLinks}>
                  <Text ellipsizeMode="middle" numberOfLines={1} style={[styles.emailFooterSeparator, styles.emailFooterAddress]}>{normalizedEmail}</Text>
                  <Text style={styles.emailFooterSeparator}>·</Text>
                  <Pressable accessibilityLabel="Use a different email" accessibilityRole="button" onPress={() => setChangeEmailConfirmOpen(true)} hitSlop={8}>
                    <Text style={styles.emailFooterLinkText}>Wrong email?</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.emailFooterLinks}>
                <Pressable accessibilityLabel="Resend verification email" accessibilityRole="button" disabled={emailResendDisabled} onPress={() => void resendEmail()} hitSlop={8}>
                  <Text style={[styles.emailFooterLinkText, emailResendDisabled ? styles.emailFooterLinkDisabled : null]}>
                    {cooldown > 0 ? `Didn't get it? Resend (${cooldown}s)` : busy ? "Didn't get it? Sending..." : "Didn't get it? Resend"}
                  </Text>
                </Pressable>
              </View>
              {manualCheck === "not_yet" ? (
                <Text style={styles.footerHint}>Check your inbox, then try again.</Text>
              ) : manualCheck === "offline" ? (
                <Text style={styles.footerHint}>We couldn't check right now. Check your connection and try again.</Text>
              ) : manualCheck === "expired" ? (
                <Text style={styles.footerHint}>This link expired. Send a fresh verification email.</Text>
              ) : manualCheck === "credentials_required" ? (
                <Text style={styles.footerHint}>Please re-enter your signup details to continue.</Text>
              ) : showEmailSendError ? (
                <Text style={styles.footerHint}>{message}</Text>
              ) : null}
            </View>
          ) : null}
          {step === "name" ? <SignupButton disabled={!canContinueName} label="Continue" loading={busy} loadingLabel="Checking…" onPress={validateAndAdvanceToQuickProfile} /> : null}
          {step === "quickProfile" ? (
            <View style={styles.buttonStack}>
              <SignupButton label="Get verified" disabled={busy} onPress={() => void continueQuickProfile("verify")} />
              <SignupButton
                hitSlop={8}
                variant="secondary"
                label="Go straight to huddle"
                labelNode={(
                  <Text style={styles.secondaryButtonLabel}>
                    Go straight to <Text style={styles.secondaryButtonBrandWord}>huddle</Text>
                  </Text>
                )}
                disabled={busy}
                onPress={() => void continueQuickProfile("home")}
              />
            </View>
          ) : null}
        </Animated.View>

        <Modal animationType="fade" transparent visible={showSignInModal} onRequestClose={closeSignInModal}>
          <View style={styles.modalBackdrop}>
            <Pressable accessibilityLabel="Close sign in" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={closeSignInModal} />
            <KeyboardAvoidingView behavior="padding" style={styles.modalKeyboard}>
              <View style={styles.modalCard}>
                <Pressable
                  hitSlop={huddleSpacing.x2}
                  onPress={closeSignInModal}
                  style={({ pressed }) => [styles.appModalClose, pressed ? styles.pressed : null]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Feather name="x" size={24} color={huddleColors.text} />
                </Pressable>
                <Text style={styles.modalTitle}>Welcome back</Text>
                <Text style={styles.modalBody}>Sign in to continue with your Huddle account.</Text>
                <View style={styles.modalStack}>

                  <View style={styles.modalFieldGroup}>
                    <Text style={styles.modalFieldLabel}>Email</Text>
                    <TextInput
                multiline={false}
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                scrollEnabled
                textBreakStrategy="simple"
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
                multiline={false}
                numberOfLines={1} lineBreakModeIOS="tail" lineBreakStrategyIOS="none"
                scrollEnabled
                textBreakStrategy="simple"
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

                  <Pressable
                    accessibilityLabel="Forgot password"
                    accessibilityRole="button"
                    onPress={() => {
                      setShowSignInModal(false);
                      setResetPasswordModalOpen(true);
                    }}
                    style={({ pressed }) => [styles.forgotPasswordButton, pressed ? styles.pressed : null]}
                  >
                    <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                  </Pressable>
                  {signinError ? <Text style={styles.errorText}>{signinError}</Text> : null}
                  <Pressable
                    accessibilityLabel="Sign in"
                    accessibilityRole="button"
                    disabled={!signinEmail || !signinPassword || signinLoading}
                    onPress={() => void submitDuplicateSignIn()}
                    style={({ pressed }) => [
                      styles.modalPrimaryButton,
                      pressed && !signinLoading ? styles.pressed : null,
                      !signinEmail || !signinPassword || signinLoading ? styles.disabled : null,
                    ]}
                  >
                    {signinLoading ? (
                      <NativeSpinner tone="primary" />
                    ) : (
                      <Text style={styles.modalPrimaryButtonLabel}>Sign in</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
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

        <Modal animationType="fade" transparent visible={resetPasswordModalOpen} onRequestClose={() => setResetPasswordModalOpen(false)}>
          <View style={nativeModalStyles.appModalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setResetPasswordModalOpen(false)} />
            <SafeAreaView
              pointerEvents="box-none"
              style={[
                nativeModalStyles.appModalSafeArea,
                { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
              ]}
            >
              <View style={[styles.resetPasswordModalCard, { maxHeight: modalMaxHeight }]}>
                <Pressable
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                  hitSlop={huddleSpacing.x2}
                  onPress={() => setResetPasswordModalOpen(false)}
                  style={({ pressed }) => [styles.appModalClose, pressed ? styles.pressed : null]}
                >
                  <Feather name="x" size={24} color={huddleColors.text} />
                </Pressable>
                <NativeResetPasswordModal initialEmail={signinEmail || normalizedEmail} />
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

      </KeyboardAvoidingView>

      <NativeProfilePhotoCropper
        avatarCrop
        asset={avatarCropAsset}
        aspect="4/5"
        initialPresentationCrop={draft.avatarPresentation}
        onCancel={() => setAvatarCropAsset(null)}
        onError={(message) => {
          setAvatarUploadError(true);
          setErrors((current) => ({ ...current, avatar: message }));
        }}
        onSave={handleQuickProfileAvatarCropped}
        soloAspect="4:5"
      />
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
  quickProfileSaveScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x6,
    backgroundColor: huddleColors.canvas,
  },
  quickProfileSaveProgressWrap: {
    marginTop: huddleSpacing.x5,
    alignItems: "center",
  },
  notificationTransitionScreen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  notificationTransitionSafeArea: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: huddleSpacing.x2,
    paddingBottom: 28,
  },
  signupTransitionTopBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notificationTransitionContent: {
    flex: 1,
    justifyContent: "center",
    gap: huddleSpacing.x4,
  },
  notificationTransitionTitle: {
    textAlign: "center",
  },
  notificationTransitionImage: {
    width: "100%",
    height: 300,
  },
  notificationTransitionBody: {
    textAlign: "center",
  },
  loadWarningText: {
    marginHorizontal: huddleSpacing.x4,
    marginBottom: huddleSpacing.x3,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
    textAlign: "center",
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
  signupTopTextButton: {
    minWidth: 64,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  signupTopTextLabel: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: 24,
    color: huddleColors.iconSubtle,
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
  quickProfileScrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
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
  dobConfirmCard: {
    marginTop: huddleSpacing.x5,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x4,
    gap: huddleSpacing.x3,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation1,
  },
  dobConfirmTitle: {
    fontFamily: "Urbanist-800",
    fontSize: 24,
    lineHeight: 30,
    color: huddleColors.text,
  },
  dobConfirmBody: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: 24,
    color: "rgba(74,73,101,0.78)",
  },
  dobConfirmBodyAlert: {
    fontFamily: "Urbanist-700",
    color: huddleColors.validationRed,
  },
  dobConfirmSafe: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.mutedText,
  },
  formStack: {
    marginTop: 24,
    gap: 24,
  },
  quickProfilePanel: {
    width: "100%",
    paddingBottom: huddleSpacing.x4,
  },
  quickPhotoSection: {
    alignItems: "center",
    marginBottom: huddleSpacing.x2,
  },
  quickPhotoErrorText: {
    marginTop: huddleSpacing.x2,
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    color: huddleColors.validationRed,
  },
  quickProfileContent: {
    paddingHorizontal: 20,
    gap: huddleSpacing.x4,
  },
  quickSection: {
    gap: huddleSpacing.x3,
  },
  quickSectionTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 14,
    lineHeight: 20,
    color: huddleColors.text,
  },
  quickSectionHelper: {
    marginTop: -huddleSpacing.x1,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    lineHeight: 17,
    color: huddleColors.subtext,
  },
  quickChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
  quickChip: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.38)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
  },
  quickPetChip: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.38)",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.86)",
  },
  quickChipSelected: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  quickChipText: {
    fontFamily: "Urbanist-600",
    fontSize: 13,
    lineHeight: 18,
    color: huddleColors.text,
  },
  quickChipTextSelected: {
    color: huddleColors.onPrimary,
  },
  quickRadioCard: {
    minHeight: 58,
    borderRadius: huddleRadii.card,
    borderWidth: 1,
    borderColor: "rgba(163,168,190,0.30)",
    padding: huddleSpacing.x3,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    backgroundColor: "rgba(255,255,255,0.90)",
  },
  quickRadioCardSelected: {
    borderColor: huddleColors.blue,
    backgroundColor: "rgba(33,69,207,0.06)",
  },
  quickExperienceOption: {
    gap: huddleSpacing.x3,
  },
  quickRadioDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: huddleColors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  quickRadioDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: huddleColors.blue,
  },
  quickRadioTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  quickRadioTitle: {
    fontFamily: "Urbanist-700",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.text,
  },
  quickRadioInlineSentence: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
    minWidth: 0,
  },
  quickRadioSentenceLead: {
    flexShrink: 1,
    minWidth: 0,
  },
  quickYearsUnderlineInput: {
    minWidth: 38,
    flexShrink: 1,
    height: 28,
    borderBottomWidth: 1,
    borderBottomColor: huddleColors.blue,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: "center",
    fontFamily: "Urbanist-800",
    fontSize: 15,
    lineHeight: 20,
    color: huddleColors.text,
    overflow: "hidden",
  },
  quickYearsUnderlineInputError: {
    borderBottomColor: huddleColors.fieldErrorBorder,
    shadowColor: huddleColors.fieldErrorRing,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  quickExperienceDetails: {
    gap: huddleSpacing.x3,
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
    flex: 1.35,
    flexBasis: 0,
  },
  dobSelectDay: {
    flex: 1,
    flexBasis: 0,
  },
  dobSelectYear: {
    flex: 1,
    flexBasis: 0,
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
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    maxHeight: huddleLayout.fieldHeight,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorder,
    borderRadius: huddleRadii.field,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: (huddleLayout.fieldHeight - 22) / 2,
    paddingBottom: (huddleLayout.fieldHeight - 22) / 2,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    includeFontPadding: false,
    color: huddleColors.text,
    textAlignVertical: "center",
    overflow: "hidden",
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
  inlineErrorActionRow: {
    gap: huddleSpacing.x1,
  },
  inlineErrorActionCopy: {
    marginBottom: 0,
  },
  inlineErrorLink: {
    fontFamily: "Urbanist-700",
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
    flexWrap: "nowrap",
    width: "100%",
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
  emailFooterAddress: {
    flexShrink: 1,
    minWidth: 0,
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
  secondaryButtonBrandWord: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-800",
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
  resetPasswordModalCard: {
    overflow: "hidden",
    borderRadius: huddleRadii.modal,
    backgroundColor: "#FFFFFF",
    ...huddleShadows.glassElevation2,
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
    flexShrink: 1,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontFamily: "Urbanist-500",
    fontSize: 16,
    lineHeight: 22,
    color: huddleColors.text,
    overflow: "hidden",
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
