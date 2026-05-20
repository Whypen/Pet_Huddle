import { Feather } from "@expo/vector-icons";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCameraDevice, useCameraPermission, type Frame } from "react-native-vision-camera";
import type { Face, FrameFaceDetectionOptions } from "react-native-vision-camera-face-detector";
import type { Session } from "@supabase/supabase-js";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { AppState, Image, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type AppStateStatus, type LayoutChangeEvent } from "react-native";
import type { CardFieldInput, confirmSetupIntent as confirmSetupIntentType, initStripe as initStripeType } from "@stripe/stripe-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import verifyIllustration from "../../assets/Sign up/Verify_1.jpg";
import huddleVideoFallback from "../../assets/huddle-video-fallback-transparent.png";
import huddleVideo from "../../assets/huddle-video.mp4";
import { NativeFormTextField } from "../components/NativeFormField";
import { NativePhoneField } from "../components/NativePhoneField";
import { NativeTurnstile } from "../components/NativeTurnstile";
import { AppConfirmModal } from "../components/nativeModalPrimitives";
import { DEFAULT_NATIVE_TURNSTILE_SITE_KEY } from "../lib/nativeTurnstile";
import {
  applyNativeStripeSetupIntentReturn,
  beginNativeVerifyIdentityCardSubmit,
  createNativeVerifyIdentityCardState,
  getNativeVerifyIdentityCardPollingDelayMs,
  markNativeVerifyIdentityCardReady,
  prepareNativeVerifyIdentityCardSetup,
  reconcileNativeVerifyIdentityCardStatus,
  reduceNativeVerifyIdentityCardState,
  shouldStopNativeVerifyIdentityCardPolling,
  type NativeVerifyIdentityCardState,
} from "../lib/nativeVerifyIdentityCardModel";
import {
  applyNativeVerifyIdentityHumanCaptureResult,
  beginNativeVerifyIdentityHumanCapture,
  completeNativeVerifyIdentityHumanModel,
  createNativeVerifyIdentityHumanState,
  reduceNativeVerifyIdentityHumanState,
  startNativeVerifyIdentityHumanModel,
  type NativeVerifyIdentityHumanState,
} from "../lib/nativeVerifyIdentityHumanModel";
import {
  buildNativeHumanResultPayload,
  classifyNativeHumanDetectorTimeout,
  createNativeHumanDetectionState,
  hasNativeHumanLivenessPass,
  processNativeHumanDetectorFrame,
  type NativeHumanDetectionState,
  type NativeHumanDetectorFailure,
} from "../lib/nativeVerifyIdentityHumanDetector";
import { getNativeHumanScanVisualState } from "../lib/nativeVerifyIdentityHumanVisualState";
import { haptic } from "../lib/nativeHaptics";
import { maskNativePhoneForOtpNotice } from "../lib/nativePhoneOtp";
import {
  createNativeVerifyIdentityPhoneOtpState,
  reduceNativeVerifyIdentityPhoneOtpState,
  resendNativeVerifyIdentityPhoneOtp,
  sendNativeVerifyIdentityPhoneOtp,
  verifyNativeVerifyIdentityPhoneOtpCode,
  type NativeVerifyIdentityPhoneOtpState,
} from "../lib/nativeVerifyIdentityPhoneOtpModel";
import {
  emitNativeVerifyIdentityUpdated,
  fetchNativeVerifyIdentityProfileStatus,
  fetchNativeVerifyIdentitySnapshot,
  NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT,
  readCachedNativeVerifyIdentityProfileStatus,
  refreshNativeVerifyIdentityProfileCache,
  setNativeVerifyIdentitySessionFallback,
  subscribeNativeVerifyIdentityUpdated,
  trackNativeDeviceFingerprint,
  type NativeDeviceFingerprintResult,
  type NativeVerifyIdentityProfileStatus,
  type NativeVerifyIdentitySnapshot,
} from "../lib/nativeVerifyIdentity";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormFields,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
  huddleVerifyIdentity,
} from "../theme/huddleDesignTokens";

const COMPLETE_BADGE = { label: "Complete", tone: "success" as const };

type StripeCardFieldModule = {
  CardField: React.ComponentType<{
    cardStyle?: Record<string, unknown>;
    onBlur?: () => void;
    onCardChange?: (details: CardFieldInput.Details) => void;
    onFocus?: () => void;
    placeholders?: CardFieldInput.Placeholders;
    postalCodeEnabled?: boolean;
    style?: unknown;
  }>;
};

// Avoid the Stripe package barrel here: it eagerly loads an unused component with
// a React 19-incompatible forwardRef signature, which surfaces as a redbox.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CardField } = require("@stripe/stripe-react-native/lib/commonjs/components/CardField.js") as StripeCardFieldModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { confirmSetupIntent } = require("@stripe/stripe-react-native/lib/commonjs/functions") as { confirmSetupIntent: typeof confirmSetupIntentType };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initStripe } = require("@stripe/stripe-react-native/lib/commonjs/components/StripeProvider") as { initStripe: typeof initStripeType };

const FaceDetectorCamera = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-vision-camera-face-detector").Camera;
  } catch {
    return null;
  }
})();


const TURNSTILE_SITE_KEY =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ||
  process.env.VITE_TURNSTILE_SITE_KEY ||
  DEFAULT_NATIVE_TURNSTILE_SITE_KEY;

type VerifyIdentityStep = "phone" | "human" | "card" | "final";
type ActiveCard = "phone" | "human" | "card" | null;
type HumanPoseStep = "center" | "left" | "right" | "done";
type HumanCompletedSteps = { center: boolean; left: boolean; right: boolean };
type HumanConfirmationDwell = {
  durationMs: number;
  step: Exclude<HumanPoseStep, "done">;
  startedAt: number;
  target: HumanPoseStep | "submit";
} | null;
type HumanSettlePhase = {
  durationMs: number;
  startedAt: number;
  target: Exclude<HumanPoseStep, "done"> | "submit";
  until: number;
} | null;

const HUMAN_CENTER_YAW_MAX = 8;
const HUMAN_SIDE_YAW_MIN = 12;
const HUMAN_CENTER_HOLD_MS = 1500;
const HUMAN_SIDE_HOLD_MS = 1000;
const HUMAN_FACE_MIN_WIDTH_RATIO = 0.16;
const HUMAN_FACE_MAX_WIDTH_RATIO = 0.78;
const HUMAN_FACE_MAX_ROLL = 24;
const HUMAN_FACE_MAX_PITCH = 24;
const HUMAN_OVAL_WIDTH = huddleVerifyIdentity.humanOvalWidth;
const HUMAN_OVAL_HEIGHT = huddleVerifyIdentity.humanOvalHeight;
const HUMAN_OVAL_RADIUS = huddleVerifyIdentity.humanOvalRadius;
const HUMAN_OVAL_BORDER_WIDTH = huddleVerifyIdentity.humanOvalBorderWidth;
const HUMAN_OVAL_SCRIM_WIDTH = huddleVerifyIdentity.humanOvalScrimWidth;
const HUMAN_DETECTOR_CALLBACK_TIMEOUT_MS = 3500;
const HUMAN_CAPTURE_TIMEOUT_MS = 40000;
const HUMAN_STEP_TIMEOUT_MS = 12000;
const HUMAN_NO_FACE_TIMEOUT_MS = 10000;
const HUMAN_BACKEND_SUBMIT_TIMEOUT_MS = 8000;
const HUMAN_CONFIRMATION_DWELL_MS = 650;
const HUMAN_SETTLE_MS = 420;
const HUMAN_STEP_YAW_START_GRACE_MS = 500;
const CARD_BACKEND_TIMEOUT_MS = 8000;
const CARD_SCROLL_TOP_Y = 560;
const CARD_SCROLL_INPUT_Y = 620;
const PHONE_OTP_OPTIMISTIC_COOLDOWN_SECONDS = 90;

const normalizeVerifyIdentityPhone = (value: string | null | undefined) => String(value || "").trim().replace(/[^\d+]/g, "");

const withNativeVerifyIdentityTimeout = async <T,>(
  task: Promise<T>,
  timeoutMs: number,
  code: string,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const HUMAN_DETECTOR_CONFIG = {
  centerHoldMs: HUMAN_CENTER_HOLD_MS,
  centerYawMax: HUMAN_CENTER_YAW_MAX,
  faceMaxPitch: HUMAN_FACE_MAX_PITCH,
  faceMaxRoll: HUMAN_FACE_MAX_ROLL,
  faceMaxWidthRatio: HUMAN_FACE_MAX_WIDTH_RATIO,
  faceMinWidthRatio: HUMAN_FACE_MIN_WIDTH_RATIO,
  ovalHeight: HUMAN_OVAL_HEIGHT,
  ovalWidth: HUMAN_OVAL_WIDTH,
  sideHoldMs: HUMAN_SIDE_HOLD_MS,
  sideYawMin: HUMAN_SIDE_YAW_MIN,
};

const nativeHumanDevLog = (label: string, payload: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log(`[NativeVerifyIdentity.human.${label}]`, payload);
};

const getHumanMonotonicNowMs = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
};

const withHumanSubmitTimeout = async <T,>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("human_submit_timeout")), HUMAN_BACKEND_SUBMIT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export function NativeVerifyIdentityScreen({
  initialActiveCard = null,
  initialSession = null,
  proofMode = false,
  hideProfileFooter = false,
  sessionKey = null,
  userId = null,
  onBack,
  onCancelSignup,
  onNavigate,
  onOpenSupport,
}: {
  initialActiveCard?: ActiveCard;
  initialSession?: Session | null;
  proofMode?: boolean;
  hideProfileFooter?: boolean;
  sessionKey?: string | null;
  userId?: string | null;
  onBack?: () => void;
  onCancelSignup?: () => void;
  onNavigate?: (path: string) => void;
  onOpenSupport?: (intent: typeof NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT) => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const humanCameraDevice = useCameraDevice("front");
  const { hasPermission: humanCameraGranted, requestPermission: requestHumanCameraPermission } = useCameraPermission();
  const faceDetectionOptions = useRef<FrameFaceDetectionOptions>({
    performanceMode: "accurate",
    landmarkMode: "all",
    contourMode: "none",
    classificationMode: "all",
    trackingEnabled: false,
    autoMode: false,
  }).current;
  const humanDetectionRef = useRef<NativeHumanDetectionState>(createNativeHumanDetectionState());
  const humanPreviewLayoutRef = useRef({ width: 0, height: 0 });
  const humanStepStartedAtRef = useRef(getHumanMonotonicNowMs());
  const humanConfirmationDwellRef = useRef<HumanConfirmationDwell>(null);
  const humanSettleRef = useRef<HumanSettlePhase>(null);
  const humanDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const humanSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const humanDwellGenerationRef = useRef(0);
  const activeCardRef = useRef<ActiveCard>(proofMode ? initialActiveCard : null);
  const humanStateNameRef = useRef<NativeVerifyIdentityHumanState["state"]>("idle");
  const [humanPoseStep, setHumanPoseStep] = useState<HumanPoseStep>("center");
  const [humanCompletedSteps, setHumanCompletedSteps] = useState<HumanCompletedSteps>({ center: false, left: false, right: false });
  const [humanConfirmationDwell, setHumanConfirmationDwell] = useState<HumanConfirmationDwell>(null);
  const [humanSettle, setHumanSettle] = useState<HumanSettlePhase>(null);
  const [humanFaceStatus, setHumanFaceStatus] = useState("Center your face in the oval.");
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const deviceCheckedRef = useRef(false);
  const prototypeEnabled = true;
  const [snapshot, setSnapshot] = useState<NativeVerifyIdentitySnapshot | null>(null);
  const [profileStatus, setProfileStatus] = useState<NativeVerifyIdentityProfileStatus | null>(null);
  const [phone, setPhone] = useState(proofMode && initialActiveCard === "phone" ? "+1 555 012 3456" : "");
  const [otpCode, setOtpCode] = useState(proofMode && initialActiveCard === "phone" ? "123456" : "");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [phoneState, setPhoneState] = useState<NativeVerifyIdentityPhoneOtpState>(() => createProofPhoneState(proofMode, initialActiveCard));
  const [cardState, setCardState] = useState<NativeVerifyIdentityCardState>(() => createProofCardState(proofMode));
  const [humanState, setHumanState] = useState<NativeVerifyIdentityHumanState>(() => createProofHumanState(proofMode, initialActiveCard));
  const [, setDeviceResult] = useState<NativeDeviceFingerprintResult | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingCardPolls, setPendingCardPolls] = useState(0);
  const [activeCard, setActiveCard] = useState<ActiveCard>(proofMode ? initialActiveCard : null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [cardSubmitAttempted, setCardSubmitAttempted] = useState(false);
  const [cardFieldTouched, setCardFieldTouched] = useState(false);
  const [cardFieldFocused, setCardFieldFocused] = useState(false);
  const [phoneChangePromptOpen, setPhoneChangePromptOpen] = useState(false);
  const [pendingPhoneValue, setPendingPhoneValue] = useState<string | null>(null);
  const [verifiedPhoneEditConfirmed, setVerifiedPhoneEditConfirmed] = useState(false);
  const verifyIdentityAccessToken = String(initialSession?.access_token || "").trim();

  useEffect(() => {
    setNativeVerifyIdentitySessionFallback(initialSession);
  }, [initialSession]);

  const prefillProfilePhone = String(profileStatus?.phone || "").trim();
  const prefillLegalName = String(profileStatus?.legalName || "").trim();
  useEffect(() => {
    if (proofMode || !prefillProfilePhone || phone.trim()) return;
    setPhone(prefillProfilePhone);
    setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, {
      type: "phone_changed",
      phone: prefillProfilePhone,
    }));
  }, [phone, prefillProfilePhone, proofMode]);

  useEffect(() => {
    if (proofMode || !prefillLegalName || cardState.legalName.trim()) return;
    setCardState((current) => reduceNativeVerifyIdentityCardState(current, {
      type: "legal_name_changed",
      legalName: prefillLegalName,
    }));
  }, [cardState.legalName, prefillLegalName, proofMode]);

  const locked = !prototypeEnabled;
  const currentPhoneKey = normalizeVerifyIdentityPhone(phone || phoneState.phone);
  const profilePhoneKey = normalizeVerifyIdentityPhone(profileStatus?.phone);
  const profilePhoneMatchesCurrent = Boolean(profilePhoneKey && (!currentPhoneKey || currentPhoneKey === profilePhoneKey));
  const phoneVerified = phoneState.state === "verified" || (profileStatus?.phoneVerificationStatus === "verified" && profilePhoneMatchesCurrent);
  // V9: haptic when phone becomes verified (catches AppState resume → background-verified case too)
  const phoneVerifiedRef = useRef(phoneVerified);
  useEffect(() => {
    if (!phoneVerifiedRef.current && phoneVerified) {
      haptic.success();
    }
    phoneVerifiedRef.current = phoneVerified;
  }, [phoneVerified]);
  const savedHumanPassed = snapshot?.humanStatus === "passed" || profileStatus?.humanStatus === "passed";
  const savedCardPassed = snapshot?.cardStatus === "passed" || profileStatus?.cardStatus === "passed" || Boolean(profileStatus?.cardVerified);
  const humanPassed = humanState.state === "passed" || savedHumanPassed;
  const cardPassed = cardState.state === "passed" || savedCardPassed;
  const effectiveHumanState: NativeVerifyIdentityHumanState = savedHumanPassed && humanState.state !== "capturing"
    ? { ...humanState, state: "passed", loading: false, error: null, failure: null }
    : humanState;
  const effectiveCardState: NativeVerifyIdentityCardState = savedCardPassed
    ? {
        ...cardState,
        state: "passed",
        loading: false,
        error: null,
        failure: null,
        cardBrand: cardState.cardBrand || snapshot?.cardBrand || profileStatus?.cardBrand || null,
        cardLast4: cardState.cardLast4 || snapshot?.cardLast4 || profileStatus?.cardLast4 || null,
        legalName: cardState.legalName || snapshot?.legalName || profileStatus?.legalName || "",
      }
    : cardState;
  const blockedSupportReady = Boolean(snapshot?.blockedIdentity.blocked || cardState.supportPathRequired);
  const blockedIdentity = snapshot?.blockedIdentity ?? (cardState.supportPathRequired ? { blocked: true, message: cardState.blockedMessage } : null);
  const overallStatus = snapshot?.verificationStatus ?? profileStatus?.verificationStatus ?? (phoneVerified || humanPassed || cardPassed ? "pending" : "unverified");
  const identityFullyVerified = String(overallStatus || "").toLowerCase() === "verified" || (phoneVerified && humanPassed && cardPassed);
  const activeStep: VerifyIdentityStep = phoneVerified ? (humanPassed ? (cardPassed ? "final" : "card") : "human") : "phone";
  const recommendedCard: Exclude<ActiveCard, null> = activeStep === "final" ? "card" : activeStep;

  const setError = useCallback((message: string | null) => {
    setScreenError(message);
  }, []);

  useEffect(() => {
    if (!identityFullyVerified || activeCard !== "human") return;
    setActiveCard(null);
  }, [activeCard, identityFullyVerified]);

  const setHumanDwell = useCallback((next: HumanConfirmationDwell) => {
    if (!next && humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    humanConfirmationDwellRef.current = next;
    setHumanConfirmationDwell(next);
  }, []);

  const setHumanSettlePhase = useCallback((next: HumanSettlePhase) => {
    if (!next && humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanSettleRef.current = next;
    setHumanSettle(next);
  }, []);

  const resetHumanStepEvaluation = useCallback((step: HumanPoseStep, mode: "full" | "step" = "step") => {
    const detection = humanDetectionRef.current;
    detection.noFaceFrames = 0;
    detection.rejectedFrames = 0;
    detection.stepStableMs = 0;
    detection.lastRejectReason = null;
    if (mode === "full" || step === "center") {
      detection.centerFrames = 0;
      detection.centerValidSinceMs = 0;
      if (mode === "full") detection.centerPassedAtMs = 0;
    }
    if (mode === "full" || step === "left") {
      detection.sideOneFrames = 0;
      detection.sideOneValidSinceMs = 0;
      if (mode === "full") {
        detection.sideOnePassedAtMs = 0;
        detection.maxSideOneYaw = 0;
      }
      detection.firstYawSign = 0;
    }
    if (mode === "full" || step === "right") {
      detection.sideTwoFrames = 0;
      detection.sideTwoValidSinceMs = 0;
      if (mode === "full") {
        detection.sideTwoPassedAtMs = 0;
        detection.maxSideTwoYaw = 0;
      }
    }
  }, []);

  const resetHumanRuntimeState = useCallback(() => {
    humanDwellGenerationRef.current += 1;
    if (humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    if (humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanDetectionRef.current = createNativeHumanDetectionState();
    humanStepStartedAtRef.current = getHumanMonotonicNowMs();
    setHumanDwell(null);
    setHumanSettlePhase(null);
    setHumanCompletedSteps({ center: false, left: false, right: false });
    setHumanPoseStep("center");
  }, [setHumanDwell, setHumanSettlePhase]);

  useEffect(() => {
    activeCardRef.current = activeCard;
    if (activeCard !== "human") {
      humanDwellGenerationRef.current += 1;
      setHumanDwell(null);
      setHumanSettlePhase(null);
    }
  }, [activeCard, setHumanDwell, setHumanSettlePhase]);

  useEffect(() => {
    humanStateNameRef.current = humanState.state;
    if (humanState.state !== "capturing") {
      humanDwellGenerationRef.current += 1;
      setHumanDwell(null);
      setHumanSettlePhase(null);
    }
  }, [humanState.state, setHumanDwell, setHumanSettlePhase]);

  useEffect(() => () => {
    humanDwellGenerationRef.current += 1;
    if (humanDwellTimerRef.current) {
      clearTimeout(humanDwellTimerRef.current);
      humanDwellTimerRef.current = null;
    }
    if (humanSettleTimerRef.current) {
      clearTimeout(humanSettleTimerRef.current);
      humanSettleTimerRef.current = null;
    }
    humanConfirmationDwellRef.current = null;
    humanSettleRef.current = null;
  }, []);

  useEffect(() => {
    if (proofMode) {
      setPhone(initialActiveCard === "phone" ? "+1 555 012 3456" : "");
      setOtpCode(initialActiveCard === "phone" ? "123456" : "");
      setPhoneState(createProofPhoneState(true, initialActiveCard));
      setHumanState(createProofHumanState(true, initialActiveCard));
      setCardState(createProofCardState(true));
      setPendingCardPolls(0);
      setScreenError(null);
      resetHumanRuntimeState();
    }
    setActiveCard(initialActiveCard);
  }, [initialActiveCard, proofMode, resetHumanRuntimeState]);

  useEffect(() => {
    if (!activeCard) return;
    const scrollY = activeCard === "phone" ? 500 : activeCard === "human" ? 360 : CARD_SCROLL_TOP_Y;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY, animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [activeCard]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      if (activeCardRef.current === "card") {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y: CARD_SCROLL_INPUT_Y, animated: true });
        });
      }
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const refreshAll = useCallback(async (source: "snapshot" | "phone" | "human" | "card" | "device_fingerprint" | "manual" = "manual") => {
    setBusy(true);
    try {
      const [nextSnapshot, nextProfile] = await Promise.all([
        fetchNativeVerifyIdentitySnapshot(),
        fetchNativeVerifyIdentityProfileStatus({ force: true, sessionKey, userId }),
        refreshNativeVerifyIdentityProfileCache({ accessToken: initialSession?.access_token, sessionKey, userId }),
      ]);
      setSnapshot(nextSnapshot);
      setProfileStatus(nextProfile);
      const nextProfilePhoneMatchesCurrent =
        Boolean(normalizeVerifyIdentityPhone(nextProfile.phone)) &&
        (!normalizeVerifyIdentityPhone(phone) || normalizeVerifyIdentityPhone(nextProfile.phone) === normalizeVerifyIdentityPhone(phone));
      if (nextProfile.phoneVerificationStatus === "verified" && nextProfilePhoneMatchesCurrent) {
        setPhoneState((current) => current.state === "verified"
          ? current
          : reduceNativeVerifyIdentityPhoneOtpState(current, { type: "verify_succeeded" }));
        setActiveCard((current) => current === "phone" ? null : current);
      }
      if (nextSnapshot.humanStatus === "passed" || nextProfile.humanStatus === "passed") {
        setHumanState((current) => current.state === "passed"
          ? current
          : { ...current, state: "passed", loading: false, error: null, failure: null });
        setHumanFaceStatus("Completed ✓");
        setHumanPoseStep("done");
        setHumanDwell(null);
        setHumanSettlePhase(null);
        setActiveCard((current) => current === "human" ? null : current);
      }
      if (nextSnapshot.cardStatus === "passed" || nextProfile.cardStatus === "passed" || nextProfile.cardVerified) {
        setCardState((current) => ({
          ...current,
          state: "passed",
          loading: false,
          error: null,
          failure: null,
          cardBrand: current.cardBrand || nextSnapshot.cardBrand || nextProfile.cardBrand || null,
          cardLast4: current.cardLast4 || nextSnapshot.cardLast4 || nextProfile.cardLast4 || null,
          legalName: current.legalName || nextSnapshot.legalName || nextProfile.legalName || "",
        }));
        setActiveCard((current) => current === "card" ? null : current);
      }
      emitNativeVerifyIdentityUpdated({ snapshot: nextSnapshot, source });
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "We couldn't refresh verification status.");
    } finally {
      setBusy(false);
    }
  }, [initialSession?.access_token, phone, sessionKey, setError, setHumanDwell, setHumanSettlePhase, userId]);
  const refreshAllRef = useRef(refreshAll);
  useEffect(() => {
    refreshAllRef.current = refreshAll;
  }, [refreshAll]);

  useEffect(() => {
    if (locked || proofMode) return undefined;
    const unsubscribe = subscribeNativeVerifyIdentityUpdated((event) => {
      if (event.snapshot) setSnapshot(event.snapshot);
    });
    void (async () => {
      const cached = await readCachedNativeVerifyIdentityProfileStatus({ sessionKey, userId }).catch(() => null);
      const nextProfile = cached ?? await fetchNativeVerifyIdentityProfileStatus({ sessionKey, userId }).catch(() => null);
      if (!nextProfile) return;
      setProfileStatus(nextProfile);
      if (nextProfile.phoneVerificationStatus === "verified") {
        setPhoneState((current) => current.state === "verified"
          ? current
          : reduceNativeVerifyIdentityPhoneOtpState(current, { type: "verify_succeeded" }));
      }
      if (nextProfile.humanStatus === "passed") {
        setHumanState((current) => current.state === "passed"
          ? current
          : { ...current, state: "passed", loading: false, error: null, failure: null });
        setHumanPoseStep("done");
        setHumanFaceStatus("Completed ✓");
      }
      if (nextProfile.cardStatus === "passed" || nextProfile.cardVerified) {
        setCardState((current) => ({
          ...current,
          state: "passed",
          loading: false,
          error: null,
          failure: null,
          cardBrand: current.cardBrand || nextProfile.cardBrand || null,
          cardLast4: current.cardLast4 || nextProfile.cardLast4 || null,
          legalName: current.legalName || nextProfile.legalName || "",
        }));
      }
    })();
    return unsubscribe;
  }, [locked, proofMode, sessionKey, userId]);

  useEffect(() => {
    if (locked) return undefined;
    const syncOnActive = (nextState: AppStateStatus) => {
      const wasInactive = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      const verificationFlowNeedsResume =
        cardState.state === "opening_3ds" ||
        cardState.state === "checking_card" ||
        cardState.state === "pending" ||
        humanState.state === "pending";
      if (!wasInactive || nextState !== "active" || humanState.state === "capturing" || !verificationFlowNeedsResume) return;
      void refreshAllRef.current("manual");
    };
    const subscription = AppState.addEventListener("change", syncOnActive);
    return () => {
      subscription.remove();
    };
  }, [cardState.state, humanState.state, locked]);

  useEffect(() => {
    if (locked || (phoneState.state !== "sent" && phoneState.state !== "failed") || phoneState.cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setPhoneState((current) => {
        if ((current.state !== "sent" && current.state !== "failed") || current.cooldownSeconds <= 0) return current;
        return reduceNativeVerifyIdentityPhoneOtpState(current, {
          type: "cooldown_ticked",
          seconds: current.cooldownSeconds - 1,
        });
      });
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [locked, phoneState.cooldownSeconds, phoneState.state]);

  const trackDevice = useCallback(async (quiet = false) => {
    const next = await trackNativeDeviceFingerprint("verify_identity_entry");
    setDeviceResult(next);
    if (!quiet && next.error) setError(next.error);
    if (!quiet) void refreshAll("device_fingerprint");
  }, [refreshAll, setError]);

  useEffect(() => {
    if (locked || proofMode || deviceCheckedRef.current) return;
    deviceCheckedRef.current = true;
    void trackDevice(true);
  }, [locked, proofMode, trackDevice]);

  const phoneTokenReady = !TURNSTILE_SITE_KEY || Boolean(turnstileToken) || proofMode;

  const applyPhoneValue = useCallback((value: string) => {
    setPhone(value);
    setOtpCode("");
    setTurnstileToken("");
    setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, { type: "phone_changed", phone: value }));
  }, []);

  const updatePhoneValue = useCallback((value: string) => {
    const nextPhoneKey = normalizeVerifyIdentityPhone(value);
    const changingVerifiedPhone =
      phoneVerified &&
      profilePhoneKey &&
      nextPhoneKey &&
      nextPhoneKey !== profilePhoneKey &&
      !verifiedPhoneEditConfirmed;
    if (changingVerifiedPhone) {
      setPendingPhoneValue(value);
      setPhoneChangePromptOpen(true);
      return;
    }
    applyPhoneValue(value);
  }, [applyPhoneValue, phoneVerified, profilePhoneKey, verifiedPhoneEditConfirmed]);

  const cancelVerifiedPhoneChange = useCallback(() => {
    setPendingPhoneValue(null);
    setPhoneChangePromptOpen(false);
  }, []);

  const confirmVerifiedPhoneChange = useCallback(() => {
    const next = pendingPhoneValue;
    setVerifiedPhoneEditConfirmed(true);
    setPendingPhoneValue(null);
    setPhoneChangePromptOpen(false);
    if (next != null) applyPhoneValue(next);
  }, [applyPhoneValue, pendingPhoneValue]);

  const sendOtp = useCallback(async (resend = false) => {
    if (!phoneTokenReady) {
      setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, {
        type: "send_failed",
        error: "Complete the security check to send code.",
        failure: "verification_required",
      }));
      setError(null);
      setActiveCard("phone");
      haptic.error();
      return;
    }
    const run = resend ? resendNativeVerifyIdentityPhoneOtp : sendNativeVerifyIdentityPhoneOtp;
    const optimisticPhone = phone.trim();
    setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, {
      type: "send_succeeded",
      phone: optimisticPhone,
      cooldownSeconds: current.cooldownSeconds > 0 ? current.cooldownSeconds : PHONE_OTP_OPTIMISTIC_COOLDOWN_SECONDS,
      maskedPhoneHint: current.maskedPhoneHint || maskNativePhoneForOtpNotice(optimisticPhone),
    }));
    const next = await run(phoneState, phone, turnstileToken, verifyIdentityAccessToken);
    setPhoneState(next);
    setError(null);
    if (next.error) {
      haptic.error(); // V4: OTP send failure
      setActiveCard("phone");
    } else {
      haptic.success(); // V4: OTP send success
      void refreshAll("phone");
    }
  }, [phone, phoneState, phoneTokenReady, refreshAll, setError, turnstileToken, verifyIdentityAccessToken]);

  const verifyOtp = useCallback(async () => {
    const next = await verifyNativeVerifyIdentityPhoneOtpCode(phoneState, otpCode, verifyIdentityAccessToken);
    setPhoneState(next);
    setError(null);
    if (next.error) {
      haptic.error(); // V4: OTP verify failure
      setActiveCard("phone");
    } else {
      haptic.success(); // V4: OTP verify success
      setActiveCard(null);
      void refreshAll("phone");
    }
  }, [otpCode, phoneState, refreshAll, setError, verifyIdentityAccessToken]);

  const prepareCard = useCallback(async () => {
    setActiveCard("card");
    setCardSubmitAttempted(true);

    if (!cardState.legalName.trim()) {
      const next = reduceNativeVerifyIdentityCardState(cardState, {
        type: "setup_failed",
        error: "Enter your legal name exactly as it appears on your card.",
        failure: "legal_name_missing",
      });
      setCardState(next);
      setError(null);
      return;
    }
    let next: NativeVerifyIdentityCardState;
    try {
      next = await withNativeVerifyIdentityTimeout(
        prepareNativeVerifyIdentityCardSetup(cardState, cardState.attemptId || ""),
        CARD_BACKEND_TIMEOUT_MS,
        "card_setup_timeout",
      );
    } catch {
      next = reduceNativeVerifyIdentityCardState(cardState, {
        type: "setup_failed",
        error: "Card setup is taking too long. Please try again.",
        failure: "stripe_timeout",
      });
    }
    if (next.publishableKey) {
      await initStripe({ publishableKey: next.publishableKey });
    }
    setCardState(next);
    setError(next.error || null);
  }, [cardState, setError]);

  const checkCard = useCallback(async () => {
    let next: NativeVerifyIdentityCardState;
    try {
      next = await withNativeVerifyIdentityTimeout(
        reconcileNativeVerifyIdentityCardStatus(cardState, {
          activeAttempt: cardState.state === "opening_3ds" || cardState.state === "checking_card",
          localFailedOrCancelled: cardState.state === "failed" || cardState.state === "cancelled",
        }),
        CARD_BACKEND_TIMEOUT_MS,
        "card_setup_timeout",
      );
    } catch {
      next = reduceNativeVerifyIdentityCardState(cardState, {
        type: "status_failed",
        error: "Card verification is taking too long. Please try again.",
        failure: "stripe_timeout",
      });
    }
    setCardState(next);
    setError(null);
    if (next.state !== "pending") setPendingCardPolls(0);
    if (next.state === "passed") setActiveCard(null);
    if (next.error) setActiveCard("card");
    void refreshAll("card");
  }, [cardState, refreshAll, setError]);

  useEffect(() => {
    if (locked || cardState.state !== "pending") return undefined;
    if (shouldStopNativeVerifyIdentityCardPolling(pendingCardPolls)) {
      const timedOut = reduceNativeVerifyIdentityCardState(cardState, {
        type: "status_failed",
        error: "Card verification is taking too long. Please try again.",
        failure: "stripe_timeout",
      });
      setCardState(timedOut);
      setError(null);
      setActiveCard("card");
      setPendingCardPolls(0);
      return undefined;
    }
    const timer = setTimeout(() => {
      void (async () => {
        let next: NativeVerifyIdentityCardState;
        try {
          next = await withNativeVerifyIdentityTimeout(
            reconcileNativeVerifyIdentityCardStatus(cardState, {
              activeAttempt: false,
              localFailedOrCancelled: false,
            }),
            CARD_BACKEND_TIMEOUT_MS,
            "card_setup_timeout",
          );
        } catch {
          next = reduceNativeVerifyIdentityCardState(cardState, {
            type: "status_failed",
            error: "Card verification is taking too long. Please try again.",
            failure: "stripe_timeout",
          });
        }
        setCardState(next);
        if (next.state === "pending") {
          setPendingCardPolls((current) => current + 1);
        } else {
          setPendingCardPolls(0);
          setError(null);
          void refreshAllRef.current("card");
        }
      })();
    }, getNativeVerifyIdentityCardPollingDelayMs(pendingCardPolls));
    return () => {
      clearTimeout(timer);
    };
  }, [cardState, locked, pendingCardPolls, setError]);

  const startHuman = useCallback(async () => {
    const granted = humanCameraGranted || await requestHumanCameraPermission();

    if (!granted) {
      const denied = reduceNativeVerifyIdentityHumanState(humanState, {
        type: "start_failed",
        error: "Please enable camera access to continue verification.",
        failure: "permission_denied",
      });
      setHumanState(denied);
      setHumanFaceStatus("Please enable camera access to continue verification.");
      setError(null);
      setActiveCard("human");
      return;
    }

    if (!humanCameraDevice) {
      const unavailable = reduceNativeVerifyIdentityHumanState(humanState, {
        type: "start_failed",
        error: "We couldn't find a camera on this device.",
        failure: "no_camera",
      });
      setHumanState(unavailable);
      setHumanFaceStatus("We couldn't find a camera on this device.");
      setError(null);
      setActiveCard("human");
      return;
    }

    if (!FaceDetectorCamera) {
      const unavailable = reduceNativeVerifyIdentityHumanState(humanState, {
        type: "start_failed",
        error: "We couldn't initialize face detection. Please rebuild the app and try again.",
        failure: "detector_unavailable",
      });
      setHumanState(unavailable);
      setHumanFaceStatus("We couldn't initialize face detection.");
      setError(null);
      setActiveCard("human");
      nativeHumanDevLog("detector_unavailable", {
        reason: "FaceDetectorCamera module unavailable",
      });
      return;
    }

    const next = await startNativeVerifyIdentityHumanModel(humanState);
    resetHumanRuntimeState();
    setHumanFaceStatus("Center your face in the oval.");
    setError(null);
    if (next.error) {
      setHumanState(next);
      setActiveCard("human");
      return;
    }
    setHumanState(beginNativeVerifyIdentityHumanCapture(next));
  }, [humanCameraDevice, humanCameraGranted, humanState, requestHumanCameraPermission, resetHumanRuntimeState, setError]);

  const beginHumanCapture = useCallback(() => {
    resetHumanRuntimeState();
    const next = beginNativeVerifyIdentityHumanCapture(humanState);
    setHumanState(next);
    setHumanFaceStatus("Center your face in the oval.");
    setError(next.error || null);
  }, [humanState, resetHumanRuntimeState, setError]);

  const retryHumanCurrentStep = useCallback(() => {
    if (!humanState.attemptId || !humanState.challenge) {
      void startHuman();
      return;
    }
    humanDwellGenerationRef.current += 1;
    setHumanDwell(null);
    setHumanSettlePhase(null);
    resetHumanStepEvaluation(humanPoseStep, "step");
    humanStepStartedAtRef.current = getHumanMonotonicNowMs();
    setHumanFaceStatus(
      humanPoseStep === "center"
        ? "Center your face."
        : humanPoseStep === "left"
          ? "Turn left slowly."
          : "Turn right slowly.",
    );
    setHumanState((current) => reduceNativeVerifyIdentityHumanState(current, { type: "capture_started" }));
    setError(null);
    nativeHumanDevLog("retry_step", {
      centerPassed: humanCompletedSteps.center,
      currentStep: humanPoseStep,
      leftPassed: humanCompletedSteps.left,
      reason: "retry_current_step",
      rightPassed: humanCompletedSteps.right,
      visualActiveStep: humanPoseStep,
    });
  }, [humanCompletedSteps.center, humanCompletedSteps.left, humanCompletedSteps.right, humanPoseStep, humanState.attemptId, humanState.challenge, resetHumanStepEvaluation, setError, setHumanDwell, setHumanSettlePhase, startHuman]);


  const submitCard = useCallback(async () => {
    const started = beginNativeVerifyIdentityCardSubmit(cardState);
    setCardState(started);
    if (started.error || !started.clientSecret) {
      setError(null);
      return;
    }

    let stripeResult;
    try {
      stripeResult = await withNativeVerifyIdentityTimeout(
        confirmSetupIntent(started.clientSecret, {
          paymentMethodType: "Card",
          paymentMethodData: {
            billingDetails: {
              name: started.legalName.trim() || undefined,
            },
          },
        } as never),
        CARD_BACKEND_TIMEOUT_MS,
        "stripe_timeout",
      );
    } catch {
      const timedOut = reduceNativeVerifyIdentityCardState(started, {
        type: "status_failed",
        error: "Card verification is taking too long. Please try again.",
        failure: "stripe_timeout",
      });
      setCardState(timedOut);
      setError(null);
      setActiveCard("card");
      return;
    }

    const returned = applyNativeStripeSetupIntentReturn(started, stripeResult as never);
    setCardState(returned);
    setError(null);

    let checked: NativeVerifyIdentityCardState;
    try {
      checked = await withNativeVerifyIdentityTimeout(
        reconcileNativeVerifyIdentityCardStatus(returned, {
          activeAttempt: true,
          currentSetupIntentId: returned.setupIntentId,
          localFailedOrCancelled: returned.state === "failed" || returned.state === "cancelled",
        }),
        CARD_BACKEND_TIMEOUT_MS,
        "card_setup_timeout",
      );
    } catch {
      checked = reduceNativeVerifyIdentityCardState(returned, {
        type: "status_failed",
        error: "Card verification is taking too long. Please try again.",
        failure: "stripe_timeout",
      });
    }
    setCardState(checked);
    setError(null);
    if (checked.error) {
      setActiveCard("card");
    } else {
      void refreshAll("card");
    }
  }, [cardState, refreshAll, setError]);

  const openBlockedSupportPath = useCallback(() => {
    const intent = NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT;
    onOpenSupport?.(intent);
    const subject = encodeURIComponent(intent.subject);
    const body = encodeURIComponent(intent.initialMessage);
    void Linking.openURL(`mailto:support@huddle.pet?subject=${subject}&body=${body}`).catch(() => {
      setError("Open Help & Support and send the prepared identity verification request.");
    });
  }, [onOpenSupport, setError]);

  const failHumanCapture = useCallback(async ({
    error,
    failure,
    faceStatus,
    poseStep,
    reason,
    score = 0.1,
  }: {
    error: string;
    failure: "detector_unavailable" | "movement_failed" | "no_face" | "timeout";
    faceStatus: string;
    poseStep: HumanPoseStep;
    reason: NativeHumanDetectorFailure | "movement_threshold_not_met" | null;
    score?: number;
  }) => {
    if (humanDetectionRef.current.finishing) return;
    humanDetectionRef.current.finishing = true;
    const detection = humanDetectionRef.current;
    const challengeType = humanState.challenge?.challengeType || "turn_left_right";
    const instruction = humanState.challenge?.instruction || "Slowly turn your head left, then right.";
    const resultPayload = buildNativeHumanResultPayload({
      challengeType,
      instruction,
      reason,
      state: detection,
      completed: false,
    });
    const captureResult = {
      attemptId: String(humanState.attemptId || ""),
      passed: false,
      score,
      resultPayload,
      evidencePath: null,
    } as never;
    setHumanDwell(null);
    setHumanPoseStep(poseStep);
    setHumanFaceStatus(faceStatus);
    setHumanState((current) => reduceNativeVerifyIdentityHumanState(current, {
      type: "capture_failed",
      error,
      failure,
      resultPayload,
    }));
    try {
      const completed = await withHumanSubmitTimeout(completeNativeVerifyIdentityHumanModel(humanState, captureResult));
      if (completed.state === "failed") setHumanState(completed);
    } catch {
      setError("Connection issue. Your check wasn't submitted.");
    }
    humanDetectionRef.current.finishing = false;
  }, [humanState, setError, setHumanDwell]);

  const finishHumanCapture = useCallback(async () => {
    if (humanDetectionRef.current.finishing) return;
    const detection = humanDetectionRef.current;
    const challengeType = humanState.challenge?.challengeType || "turn_left_right";
    const instruction = humanState.challenge?.instruction || "Slowly turn your head left, then right.";

    if (!hasNativeHumanLivenessPass(detection, HUMAN_DETECTOR_CONFIG)) {
      humanDetectionRef.current.finishing = true;
      const resultPayload = buildNativeHumanResultPayload({
        challengeType,
        instruction,
        reason: "movement_threshold_not_met",
        state: detection,
        completed: false,
      });
      const captureResult = {
        attemptId: String(humanState.attemptId || ""),
        passed: false,
        score: 0.22,
        resultPayload,
        evidencePath: null,
      } as never;
      setHumanFaceStatus("We couldn't complete verification. Please retry.");
      const captured = reduceNativeVerifyIdentityHumanState(humanState, {
        type: "capture_failed",
        error: "We couldn't complete verification. Please retry.",
        failure: "movement_failed",
        resultPayload,
      });
      setHumanState(captured);
      try {
        const completed = await withHumanSubmitTimeout(completeNativeVerifyIdentityHumanModel(humanState, captureResult));
        if (completed.state === "failed") setHumanState(completed);
      } catch {
        setError("Connection issue. Your check wasn't submitted.");
      }
      humanDetectionRef.current.finishing = false;
      return;
    }

    humanDetectionRef.current.finishing = true;

    const captureResult = {
      attemptId: String(humanState.attemptId || ""),
      passed: true,
      score: 0.92,
      resultPayload: buildNativeHumanResultPayload({
        challengeType,
        instruction,
        state: detection,
        completed: true,
      }),
      evidencePath: null,
    } as never;

    humanDwellGenerationRef.current += 1;
    humanStateNameRef.current = "pending";
    setHumanDwell(null);
    setHumanSettlePhase(null);
    const captured = applyNativeVerifyIdentityHumanCaptureResult(humanState, captureResult);
    setHumanState(captured);
    setHumanFaceStatus("Confirming your check… Almost done.");

    let completed: NativeVerifyIdentityHumanState;
    try {
      completed = await withHumanSubmitTimeout(completeNativeVerifyIdentityHumanModel(captured, captureResult));
    } catch {
      humanDetectionRef.current.finishing = false;
      humanStateNameRef.current = "failed";
      setHumanState(reduceNativeVerifyIdentityHumanState(captured, {
        type: "complete_failed",
        error: "Connection dropped before we could finish. Let's try again?",
        failure: "network",
      }));
      setHumanDwell(null);
      setHumanPoseStep("right");
      setHumanFaceStatus("Connection dropped before we could finish. Let's try again?");
      return;
    }
    setHumanState(completed);
    setError(completed.error || null);

    if (completed.error || completed.state === "failed") {
      humanDetectionRef.current.finishing = false;
      humanStateNameRef.current = "failed";
      setHumanDwell(null);
      setHumanPoseStep("right");
      setHumanFaceStatus("Let's try again with better lighting and slower turns.");
      return;
    }

    humanStateNameRef.current = "passed";
    setHumanPoseStep("done");
    setHumanFaceStatus("Completed ✓");
    void refreshAll("human");
  }, [humanState, refreshAll, setError, setHumanDwell, setHumanSettlePhase]);

  const scheduleHumanConfirmationDwell = useCallback(({
    actualHoldMs,
    requiredHoldMs,
    result,
    step,
    target,
    yaw,
  }: {
    actualHoldMs: number;
    requiredHoldMs: number;
    result: ReturnType<typeof processNativeHumanDetectorFrame>;
    step: Exclude<HumanPoseStep, "done">;
    target: Exclude<HumanPoseStep, "done"> | "submit";
    yaw?: number;
  }) => {
    if (humanDwellTimerRef.current) clearTimeout(humanDwellTimerRef.current);
    if (humanSettleTimerRef.current) clearTimeout(humanSettleTimerRef.current);
    humanSettleRef.current = null;
    setHumanSettle(null);

    humanDwellGenerationRef.current += 1;
    const dwellGeneration = humanDwellGenerationRef.current;
    const startedAt = getHumanMonotonicNowMs();
    const dwell: HumanConfirmationDwell = {
      durationMs: HUMAN_CONFIRMATION_DWELL_MS,
      startedAt,
      step,
      target,
    };
    humanConfirmationDwellRef.current = dwell;
    setHumanConfirmationDwell(dwell);
    setHumanCompletedSteps((current) => ({ ...current, [step]: true }));
    setHumanFaceStatus(
      step === "center"
        ? "Center confirmed."
        : step === "left"
          ? "Left confirmed."
          : "Right confirmed.",
    );

    nativeHumanDevLog("step_confirmed", {
      UI: `${step}_green_confirmation`,
      actualHoldMs,
      confirmationDwellMs: HUMAN_CONFIRMATION_DWELL_MS,
      currentStep: step,
      firstValidAt: result.debug.stepValidSinceMs || 0,
      reason: result.reason,
      requiredHoldMs,
      stepEnteredAt: humanStepStartedAtRef.current,
      stepPassedAt: result.debug.stepPassedAtMs || startedAt,
      transitionToNextStepAt: startedAt + HUMAN_CONFIRMATION_DWELL_MS,
      yaw,
    });

    humanDwellTimerRef.current = setTimeout(() => {
      if (
        humanDwellGenerationRef.current !== dwellGeneration ||
        humanConfirmationDwellRef.current !== dwell ||
        activeCardRef.current !== "human" ||
        humanStateNameRef.current !== "capturing" ||
        humanDetectionRef.current.finishing
      ) {
        return;
      }
      const transitionAt = getHumanMonotonicNowMs();
      setHumanDwell(null);
      const settleUntil = transitionAt + HUMAN_SETTLE_MS;
      const settle: HumanSettlePhase = {
        durationMs: HUMAN_SETTLE_MS,
        startedAt: transitionAt,
        target,
        until: settleUntil,
      };
      humanSettleRef.current = settle;
      setHumanSettle(settle);
      if (target === "submit") {
        resetHumanStepEvaluation("right", "step");
        setHumanFaceStatus("Get ready...");
        nativeHumanDevLog("step_transition", {
          UI: "settle_before_checking",
          confirmationDwellMs: transitionAt - startedAt,
          currentStep: step,
          reason: null,
          settleMs: HUMAN_SETTLE_MS,
          transitionToNextStepAt: transitionAt,
          visualActiveStep: "right",
          yawEvaluationEnabled: false,
          yaw,
        });
        humanSettleTimerRef.current = setTimeout(() => {
          if (
            humanDwellGenerationRef.current !== dwellGeneration ||
            humanSettleRef.current !== settle ||
            activeCardRef.current !== "human" ||
            humanStateNameRef.current !== "capturing" ||
            humanDetectionRef.current.finishing
          ) {
            return;
          }
          setHumanSettlePhase(null);
          setHumanPoseStep("done");
          setHumanFaceStatus("Validating");
          void finishHumanCapture();
        }, HUMAN_SETTLE_MS);
        return;
      }

      humanStepStartedAtRef.current = transitionAt;
      resetHumanStepEvaluation(target, "step");
      setHumanPoseStep(target);
      setHumanFaceStatus(target === "left" ? "Now turn left." : "Now turn right.");
      nativeHumanDevLog("step_transition", {
        UI: `${target}_prompt`,
        confirmationDwellMs: transitionAt - startedAt,
        currentStep: step,
        nextStep: target,
        reason: null,
        settleMs: HUMAN_SETTLE_MS,
        stepEnteredAt: humanStepStartedAtRef.current,
        transitionToNextStepAt: transitionAt,
        visualActiveStep: target,
        yawEvaluationEnabled: false,
        yaw,
      });
      humanSettleTimerRef.current = setTimeout(() => {
        if (
          humanDwellGenerationRef.current !== dwellGeneration ||
          humanSettleRef.current !== settle ||
          activeCardRef.current !== "human" ||
          humanStateNameRef.current !== "capturing" ||
          humanDetectionRef.current.finishing
        ) {
          return;
        }
        setHumanSettlePhase(null);
        setHumanFaceStatus(target === "left" ? "Turn left slowly." : "Turn right slowly.");
      }, HUMAN_SETTLE_MS);
    }, HUMAN_CONFIRMATION_DWELL_MS);
  }, [finishHumanCapture, resetHumanStepEvaluation, setHumanDwell, setHumanSettlePhase]);

  const handleDetectedFaces = useCallback((faces: Face[], frame?: Frame) => {
    if (activeCard !== "human" || humanState.state !== "capturing" || humanStateNameRef.current !== "capturing" || humanDetectionRef.current.finishing) return;
    if (humanConfirmationDwellRef.current) return;
    const nowMs = getHumanMonotonicNowMs();
    const settle = humanSettleRef.current;
    if (settle && nowMs < settle.until) {
      nativeHumanDevLog("frame_settle", {
        centerPassed: humanCompletedSteps.center,
        confirmationDwellMs: 0,
        currentStep: humanPoseStep,
        leftPassed: humanCompletedSteps.left,
        reason: "settling",
        rightPassed: humanCompletedSteps.right,
        settleMs: settle.until - nowMs,
        stepEnteredAt: humanStepStartedAtRef.current,
        visualActiveStep: settle.target,
        yawEvaluationEnabled: false,
      });
      return;
    }
    if (settle) setHumanSettlePhase(null);
    const stepAgeMs = nowMs - humanStepStartedAtRef.current;
    if ((humanPoseStep === "left" || humanPoseStep === "right") && stepAgeMs < HUMAN_SETTLE_MS + HUMAN_STEP_YAW_START_GRACE_MS) {
      nativeHumanDevLog("frame_step_start_grace", {
        centerPassed: humanCompletedSteps.center,
        confirmationDwellMs: 0,
        currentStep: humanPoseStep,
        leftPassed: humanCompletedSteps.left,
        reason: "step_start_grace",
        rightPassed: humanCompletedSteps.right,
        settleMs: Math.max(0, HUMAN_SETTLE_MS + HUMAN_STEP_YAW_START_GRACE_MS - stepAgeMs),
        stepEnteredAt: humanStepStartedAtRef.current,
        visualActiveStep: humanPoseStep,
        yawEvaluationEnabled: false,
      });
      return;
    }
    const preview = humanPreviewLayoutRef.current;
    if (preview.width <= 0 || preview.height <= 0) {
      humanDetectionRef.current.callbackFrames += 1;
      humanDetectionRef.current.lastRejectReason = "timeout";
      nativeHumanDevLog("frame_rejected", {
        callbackFired: true,
        reason: "preview_layout_unavailable",
        currentStep: humanPoseStep,
        stepEnteredAt: humanStepStartedAtRef.current,
      });
      return;
    }

    const result = processNativeHumanDetectorFrame(
      humanDetectionRef.current,
      faces,
      frame ?? null,
      preview,
      humanPoseStep,
      HUMAN_DETECTOR_CONFIG,
      nowMs,
    );
    humanDetectionRef.current = result.state;
    setHumanFaceStatus(result.status);
    nativeHumanDevLog("frame", {
      UI: humanPoseStep === "center" ? "center_full_ring" : humanPoseStep === "left" ? "left_half_arc" : humanPoseStep === "right" ? "right_half_arc" : "checking",
      callbackFired: true,
      ...result.debug,
      actualHoldMs: result.debug.stepStableMs || 0,
      confirmationDwellMs: 0,
      currentStep: humanPoseStep,
      firstValidAt: result.debug.stepValidSinceMs || 0,
      centerPassed: humanCompletedSteps.center,
      leftPassed: humanCompletedSteps.left,
      nextStep: result.nextPoseStep,
      requiredHoldMs: result.debug.requiredHoldMs || 0,
      rightPassed: humanCompletedSteps.right,
      settleMs: 0,
      stableFaceFrames: result.state.stableFaceFrames,
      centerFrames: result.state.centerFrames,
      sideOneFrames: result.state.sideOneFrames,
      sideTwoFrames: result.state.sideTwoFrames,
      firstYawSign: result.state.firstYawSign,
      stepEnteredAt: humanStepStartedAtRef.current,
      stepPassedAt: result.debug.stepPassedAtMs || 0,
      transitionToNextStepAt: 0,
      visualActiveStep: humanPoseStep,
      yawEvaluationEnabled: true,
    });
    if (result.reason === "same_side_repeat") {
      void failHumanCapture({
        error: "Show the opposite side and try again.",
        failure: "movement_failed",
        faceStatus: "Show the opposite side and try again.",
        poseStep: "right",
        reason: "same_side_repeat",
        score: 0.18,
      });
      return;
    }
    if (result.debug.stepPassed && result.nextPoseStep !== humanPoseStep) {
      scheduleHumanConfirmationDwell({
        actualHoldMs: result.debug.stepStableMs || 0,
        requiredHoldMs: result.debug.requiredHoldMs || (humanPoseStep === "center" ? HUMAN_CENTER_HOLD_MS : HUMAN_SIDE_HOLD_MS),
        result,
        step: humanPoseStep === "done" ? "right" : humanPoseStep,
        target: result.passed ? "submit" : result.nextPoseStep as Exclude<HumanPoseStep, "done">,
        yaw: result.debug.yaw,
      });
    }
  }, [activeCard, failHumanCapture, humanCompletedSteps.center, humanCompletedSteps.left, humanCompletedSteps.right, humanPoseStep, humanState.state, scheduleHumanConfirmationDwell, setHumanSettlePhase]);

  const continueVerification = useCallback(async () => {
    if (busy) return;
    if (activeStep === "phone") {
      setActiveCard("phone");
      if (phoneState.state === "sent" && otpCode.trim()) {
        await verifyOtp();
        return;
      }
      await sendOtp(phoneState.state === "failed" || phoneState.state === "sent");
      return;
    }
    if (activeStep === "human") {
      setActiveCard("human");
      if (humanState.state === "failed") {
        retryHumanCurrentStep();
        return;
      }
      if (humanState.state === "idle") {
        await startHuman();
        return;
      }
      if (humanState.state === "ready") {
        beginHumanCapture();
        return;
      }
      if (humanState.state === "capturing") {
        setError("Live camera access is required before this check can be completed here.");
        return;
      }
      await refreshAll("human");
      return;
    }
    if (activeStep === "card") {
      setActiveCard("card");
      if (blockedSupportReady) {
        openBlockedSupportPath();
        return;
      }
      if (cardState.state === "idle" || cardState.state === "failed" || cardState.state === "cancelled" || cardState.state === "blocked") {
        await prepareCard();
        return;
      }
      await checkCard();
      return;
    }
    await refreshAll("manual");
  }, [
    activeStep,
    beginHumanCapture,
    blockedSupportReady,
    busy,
    cardState.state,
    checkCard,
    humanState.state,
    openBlockedSupportPath,
    otpCode,
    phoneState.state,
    prepareCard,
    refreshAll,
    retryHumanCurrentStep,
    sendOtp,
    startHuman,
    verifyOtp,
    setError,
  ]);

  const headerStatus = useMemo(() => describeOverallChip(overallStatus), [overallStatus]);
  const phoneUnavailable = phoneState.state === "unavailable";
  const continueLabel = activeStep === "final" ? "Continue to Profile" : "Not now";

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "passed") return undefined;
    const timer = setTimeout(() => {
      setActiveCard(null);
    }, 1100);
    return () => clearTimeout(timer);
  }, [activeCard, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      if (humanDetectionRef.current.finishing) return;
      if (humanDetectionRef.current.callbackFrames > 0) return;
      const detection = humanDetectionRef.current;
      nativeHumanDevLog("detector_unavailable", {
        callbackFrames: detection.callbackFrames,
        reason: "callback timeout",
      });
      void failHumanCapture({
        error: "We couldn't initialize face detection. Please rebuild the app and try again.",
        failure: "detector_unavailable",
        faceStatus: "We couldn't initialize face detection.",
        poseStep: "center",
        reason: "detector_unavailable",
      });
    }, HUMAN_DETECTOR_CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      const detection = humanDetectionRef.current;
      if (detection.finishing) return;
      if (detection.noFaceFrames <= 0 || detection.stableFaceFrames > 0) return;
      void failHumanCapture({
        error: "No face detected. Make sure your face is visible and the lighting is clear.",
        failure: "no_face",
        faceStatus: "No face detected. Make sure your face is visible.",
        poseStep: "center",
        reason: "no_face",
      });
    }, HUMAN_NO_FACE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing" || humanPoseStep === "done") return undefined;
    humanStepStartedAtRef.current = getHumanMonotonicNowMs();
    const timer = setTimeout(() => {
      if (humanConfirmationDwellRef.current) return;
      if (humanDetectionRef.current.finishing || humanState.state !== "capturing") return;
      const copy = humanPoseStep === "center"
        ? {
            error: "We couldn't center your face.",
            faceStatus: "Make sure your face is inside the circle with good lighting.",
            poseStep: "center" as const,
          }
        : humanPoseStep === "left"
          ? {
              error: "We couldn't confirm the left turn.",
              faceStatus: "Turn your head slowly while keeping your face in the circle.",
              poseStep: "left" as const,
            }
          : {
              error: "We couldn't confirm the right turn.",
              faceStatus: "Turn your head slowly while keeping your face in the circle.",
              poseStep: "right" as const,
            };
      void failHumanCapture({
        error: copy.error,
        failure: "movement_failed",
        faceStatus: copy.faceStatus,
        poseStep: copy.poseStep,
        reason: "movement_failed",
        score: 0.18,
      });
    }, HUMAN_STEP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanPoseStep, humanState.state]);

  useEffect(() => {
    if (activeCard !== "human" || humanState.state !== "capturing") return undefined;
    const timer = setTimeout(() => {
      if (humanDetectionRef.current.finishing) return;
      const detection = humanDetectionRef.current;
      const failure = classifyNativeHumanDetectorTimeout(detection);
      nativeHumanDevLog("timeout", {
        callbackFrames: detection.callbackFrames,
        failure,
        noFaceFrames: detection.noFaceFrames,
        stableFaceFrames: detection.stableFaceFrames,
      });
      void failHumanCapture({
        error: failure === "no_face" ? "Center your face in the frame and try again." : "We couldn't complete verification. Please retry.",
        failure: failure === "no_face" ? "no_face" : "timeout",
        faceStatus: failure === "no_face" ? "No face detected. Move closer and center your face." : "We couldn't complete verification. Please retry.",
        poseStep: failure === "no_face" ? "center" : "right",
        reason: failure,
      });
    }, HUMAN_CAPTURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [activeCard, failHumanCapture, humanState.state]);

  if (locked) {
    return (
      <View style={[styles.lockedScreen, { paddingTop: huddleSpacing.x6 }]}>
        <Text style={styles.headerTitle}>Verify Identity</Text>
        <Text style={styles.lockedCopy}>Identity verification is temporarily unavailable. Please try again later.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + huddleSpacing.x2 }]}>
        <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onBack ?? onCancelSignup ?? (() => { /* V10: no-op fallback to avoid deep-link self-call flash */ })} style={styles.backButton}>
          <Feather color={huddleColors.iconSubtle} name="arrow-left" size={huddleVerifyIdentity.headerIconSize} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>Verify Identity</Text>
        <StatusPill label={headerStatus.label} tone={headerStatus.tone} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + huddleSpacing.x7 + keyboardHeight }]}
        showsVerticalScrollIndicator={false}
        style={styles.scroller}
      >
        <View style={styles.hero}>
          <Image accessibilityIgnoresInvertColors source={verifyIllustration} style={styles.illustration} />
          <Text style={styles.introCopy}>
            To help keep Huddle safe, we use a quick trust check to confirm you're a real person using your real identity. We only keep the verification result and limited metadata needed for safety and fraud prevention.
          </Text>
        </View>

        {screenError ? <ErrorBox message={screenError} /> : null}

        {blockedIdentity?.blocked ? (
          <View style={styles.blockedPanel}>
            <Text style={styles.blockedText}>{blockedIdentity.message || "Card verification could not be completed. Please try again."}</Text>
            <Pressable accessibilityRole="button" onPress={openBlockedSupportPath} hitSlop={8}>
              <Text style={styles.supportLink}>Help & Support</Text>
            </Pressable>
          </View>
        ) : null}

        <VerificationCard
          active={activeCard === "phone" || phoneUnavailable}
          badge={getPhoneBadge(phoneState, profileStatus?.phoneVerificationStatus)}
          disabled={phoneUnavailable}
          icon="phone"
          recommended={recommendedCard === "phone"}
          renderWhenDisabled={phoneUnavailable}
          title="Verify with phone number"
          onToggle={() => setActiveCard((current) => current === "phone" ? null : "phone")}
        >
          <PhonePanel
            busy={busy}
            onTurnstileError={(message) => {
              setTurnstileToken("");
              setPhoneState((current) => reduceNativeVerifyIdentityPhoneOtpState(current, {
                type: "send_failed",
                error: message,
                failure: "verification_required",
              }));
              setActiveCard("phone");
            }}
            onSend={() => void sendOtp(phoneState.state === "sent" || phoneState.state === "failed")}
            onToken={setTurnstileToken}
            onUpdateCode={(value) => setOtpCode(value.replace(/\D/g, "").slice(0, 6))}
            onUpdatePhone={updatePhoneValue}
            onVerify={() => void verifyOtp()}
            otpCode={otpCode}
            phone={phone}
            phoneState={phoneState}
            siteKey={TURNSTILE_SITE_KEY}
            tokenReady={phoneTokenReady}
          />
        </VerificationCard>

        <VerificationCard
          active={!humanPassed && !identityFullyVerified && activeCard === "human"}
          badge={humanPassed || identityFullyVerified ? COMPLETE_BADGE : getHumanBadge(effectiveHumanState)}
          disabled={humanPassed || identityFullyVerified}
          icon="user"
          recommended={recommendedCard === "human"}
          title="Verify You're Human"
          onToggle={() => setActiveCard((current) => current === "human" ? null : "human")}
        >
          <HumanPanel
            busy={busy}
            cameraGranted={humanCameraGranted}
            detectorReady={Boolean(FaceDetectorCamera)}
            device={humanCameraDevice}
            faceDetectionOptions={faceDetectionOptions}
            faceStatus={humanFaceStatus}
            humanState={effectiveHumanState}
            onCapture={beginHumanCapture}
            onCameraError={(error) => {
              nativeHumanDevLog("camera_runtime_error", {
                message: error instanceof Error ? error.message : String(error),
              });
              void failHumanCapture({
                error: "We couldn't start the camera. Please close other camera apps and try again.",
                failure: "detector_unavailable",
                faceStatus: "We couldn't start the camera. Please retry.",
                poseStep: "center",
                reason: "detector_unavailable",
              });
            }}
            onDetectorError={(error) => {
              nativeHumanDevLog("detector_render_error", {
                message: error instanceof Error ? error.message : String(error),
              });
              void failHumanCapture({
                error: "We couldn't initialize face detection. Please rebuild the app and try again.",
                failure: "detector_unavailable",
                faceStatus: "We couldn't initialize face detection.",
                poseStep: "center",
                reason: "detector_unavailable",
              });
            }}
            onFacesDetected={handleDetectedFaces}
            onLayoutCamera={(event) => {
              const { width, height } = event.nativeEvent.layout;
              humanPreviewLayoutRef.current = { width, height };
            }}
            onOpenSettings={() => void Linking.openSettings()}
            onStart={() => humanState.state === "failed" ? retryHumanCurrentStep() : void startHuman()}
            completedSteps={humanCompletedSteps}
            confirmationDwell={humanConfirmationDwell}
            settlePhase={humanSettle}
            poseStep={humanPoseStep}
          />
        </VerificationCard>

        <VerificationCard
          active={activeCard === "card"}
          badge={cardPassed || identityFullyVerified ? COMPLETE_BADGE : getCardBadge(effectiveCardState)}
          disabled={false}
          icon="credit-card"
          recommended={recommendedCard === "card"}
          renderWhenDisabled={cardPassed}
          title="Validate Identity"
          onToggle={() => setActiveCard((current) => current === "card" ? null : "card")}
        >
          <CardPanel
            blockedSupportReady={blockedSupportReady}
            cardState={effectiveCardState}
            readOnlyVerified={identityFullyVerified}
            showLegalNameError={cardSubmitAttempted || Boolean(effectiveCardState.error)}
            onLegalNameChange={(legalName) => {
              setCardSubmitAttempted(false);
              setCardState((current) => reduceNativeVerifyIdentityCardState(current, {
                type: "legal_name_changed",
                legalName,
              }));
            }}
            onCardCompleteChange={(complete) => {
              setCardFieldTouched(true);
              setCardState((current) => markNativeVerifyIdentityCardReady(
                reduceNativeVerifyIdentityCardState(current, { type: "card_complete_changed", cardComplete: complete })
              ));
            }}
            onCardFocusChange={setCardFieldFocused}
            onCheck={() => void checkCard()}
            onPrimary={() => void prepareCard()}
            onSubmit={() => void submitCard()}
            onSupport={openBlockedSupportPath}
            profileStatus={profileStatus}
            showCardFieldError={cardSubmitAttempted || cardFieldTouched || Boolean(effectiveCardState.error)}
            cardFieldFocused={cardFieldFocused}
          />
        </VerificationCard>

        <Text style={styles.lockCopy}>
          <Text style={styles.lockIcon}>🔒 </Text>
          Instead of collecting your personal data, we use your bank's security checks to verify you're a real person. Your card details stay encrypted and masked — never stored, never charged.
        </Text>

        {hideProfileFooter ? null : (
          <View style={styles.skipFooter}>
            <ActionButton label={continueLabel} onPress={() => onNavigate?.("/set-profile")} secondary={activeStep !== "final"} />
          </View>
        )}
      </ScrollView>
      <AppConfirmModal
        body="Changing your number will require verification."
        confirmLabel="Confirm"
        onCancel={cancelVerifiedPhoneChange}
        onConfirm={confirmVerifiedPhoneChange}
        open={phoneChangePromptOpen}
        title="Change phone number?"
      />
    </View>
  );
}

function VerificationCard({
  active,
  badge,
  children,
  disabled,
  icon,
  recommended,
  renderWhenDisabled,
  title,
  onToggle,
}: {
  active: boolean;
  badge: { label: string; tone: "success" | "error" | "muted" } | null;
  children: ReactNode;
  disabled?: boolean;
  icon: "phone" | "user" | "credit-card";
  recommended: boolean;
  renderWhenDisabled?: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <View style={[styles.verifyCard, active ? styles.verifyCardExpanded : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled), expanded: !disabled && active }}
        disabled={disabled}
        onPress={disabled ? undefined : onToggle}
        style={styles.cardHeader}
      >
        <Feather color={badge?.tone === "success" ? huddleColors.success : huddleColors.iconMuted} name={icon} size={huddleVerifyIdentity.cardIconSize} />
        <Text adjustsFontSizeToFit minimumFontScale={0.9} numberOfLines={1} style={styles.cardTitle}>{title}</Text>
        {badge ? <StatusPill label={badge.label} tone={badge.tone} /> : null}
      </Pressable>
      {active && (!disabled || renderWhenDisabled) ? (
        <View style={styles.expandedBody}>
          <View style={styles.cardDivider} />
          {children}
        </View>
      ) : null}
    </View>
  );
}

function getHumanPhoneErrorMessage(message?: string | null) {
  const raw = String(message || "").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (
    lower.includes("turnstile") ||
    lower.includes("captcha") ||
    lower.includes("verification_required") ||
    lower.includes("edge function") ||
    lower.includes("rpc") ||
    lower.includes("invalid") ||
    lower.includes("not configured") ||
    lower.includes("provider") ||
    lower.includes("native")
  ) {
    return "Complete the security check to send code.";
  }

  if (lower.includes("rate") || lower.includes("cooldown")) {
    return "Please wait a moment before requesting another code.";
  }

  if (lower.includes("expired")) return "That code expired. Please request a new one.";
  if (lower.includes("wrong") || lower.includes("incorrect")) return "That code looks wrong. Please try again.";
  return raw;
}

// V3: 6-cell OTP input with per-cell refs, backspace navigation, and paste support
function OtpCellInput({ value, onChangeValue, onComplete }: { value: string; onChangeValue: (v: string) => void; onComplete?: () => void }) {
  const OTP_LENGTH = 6;
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const cells = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const focusCell = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    inputRefs.current[clampedIndex]?.focus();
  };

  const handleChange = (text: string, index: number) => {
    // Handle paste: if multiple chars come in, distribute across cells
    const cleaned = text.replace(/\D/g, "").slice(0, OTP_LENGTH - index);
    if (cleaned.length > 1) {
      const newValue = (value.slice(0, index) + cleaned).slice(0, OTP_LENGTH);
      onChangeValue(newValue);
      const nextFocus = Math.min(index + cleaned.length, OTP_LENGTH - 1);
      focusCell(nextFocus);
      if (newValue.length === OTP_LENGTH) onComplete?.();
      return;
    }
    const digit = cleaned.slice(0, 1);
    const newValue = value.slice(0, index) + digit + value.slice(index + 1);
    onChangeValue(newValue);
    if (digit && index < OTP_LENGTH - 1) focusCell(index + 1);
    if (newValue.length === OTP_LENGTH && newValue.replace(/ /g, "").length === OTP_LENGTH) onComplete?.();
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace") {
      if (value[index]) {
        const newValue = value.slice(0, index) + "" + value.slice(index + 1);
        onChangeValue(newValue);
      } else if (index > 0) {
        focusCell(index - 1);
        const newValue = value.slice(0, index - 1) + "" + value.slice(index);
        onChangeValue(newValue);
      }
    }
  };

  return (
    <View style={otpStyles.otpRow}>
      {cells.map((digit, i) => (
        <Pressable key={i} onPress={() => focusCell(i)} style={otpStyles.otpCellWrap}>
          <TextInput
            ref={(ref) => { inputRefs.current[i] = ref; }}
            autoComplete="sms-otp"
            caretHidden
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            returnKeyType="done"
            selectionColor={huddleColors.blue}
            textContentType="oneTimeCode"
            value={digit}
            style={[otpStyles.otpCell, digit ? otpStyles.otpCellFilled : null]}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
            onFocus={() => {
              // Move focus to first empty cell or last cell
              const firstEmpty = cells.findIndex((c) => !c);
              if (firstEmpty !== -1 && firstEmpty < i) focusCell(firstEmpty);
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}

const otpStyles = StyleSheet.create({
  otpRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
    justifyContent: "center",
    marginVertical: huddleSpacing.x2,
  },
  otpCellWrap: {
    flex: 1,
    maxWidth: 48,
  },
  otpCell: {
    borderWidth: 1.5,
    borderColor: huddleColors.divider,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    height: 52,
    textAlign: "center",
    fontFamily: "Urbanist-600",
    fontSize: 22,
    color: huddleColors.text,
  },
  otpCellFilled: {
    borderColor: huddleColors.blue,
    backgroundColor: "rgba(91,109,255,0.06)",
  },
});

function PhonePanel({
  busy,
  onSend,
  onToken,
  onTurnstileError,
  onUpdateCode,
  onUpdatePhone,
  onVerify,
  otpCode,
  phone,
  phoneState,
  siteKey,
  tokenReady,
}: {
  busy: boolean;
  onSend: () => void;
  onToken: (token: string) => void;
  onTurnstileError: (message: string) => void;
  onUpdateCode: (value: string) => void;
  onUpdatePhone: (value: string) => void;
  onVerify: () => void;
  otpCode: string;
  phone: string;
  phoneState: NativeVerifyIdentityPhoneOtpState;
  siteKey: string;
  tokenReady: boolean;
}) {
  const otpSent = phoneState.state === "sent" || phoneState.state === "failed";
  const sendDisabled = phoneState.loading || busy || phoneState.cooldownSeconds > 0 || phoneState.state === "unavailable";
  const sendLabel = phoneState.loading && !otpSent
    ? "Sending…"
    : phoneState.cooldownSeconds > 0
      ? `Sent ${phoneState.cooldownSeconds}s`
      : otpSent
        ? "Resend"
        : "Send OTP";
  const codeReady = otpSent && otpCode.trim().length === 6;
  const turnstileError = Boolean(siteKey && phoneState.failure === "verification_required" && !tokenReady);

  return (
    <View style={styles.panelStack}>
      <View style={styles.phoneFieldBlock}>
        <Text style={styles.panelFieldLabelLarge}>Mobile number</Text>
        <NativePhoneField
          defaultCountryCode="HK"
          error={Boolean(phoneState.error)}
          onChangeText={onUpdatePhone}
          rightAccessory={
            <Pressable
              disabled={sendDisabled}
              onPress={onSend}
              style={({ pressed }) => [styles.inlineOtpButton, sendDisabled ? styles.inlineOtpButtonDisabled : null, pressed && !sendDisabled ? { opacity: 0.82 } : null]}
            >
              <Text style={[styles.inlineOtpButtonText, sendDisabled ? styles.inlineOtpButtonTextDisabled : null]}>{sendLabel}</Text>
            </Pressable>
          }
          rightAccessoryWidth={96}
          value={phone}
        />
        {phoneState.error ? <Text style={styles.fieldErrorSubtext}>{getHumanPhoneErrorMessage(phoneState.error)}</Text> : null}
        {phoneState.cooldownSeconds > 0 ? (
          <View style={styles.cooldownBarTrack}>
            <View style={[styles.cooldownBarFill, { width: `${(phoneState.cooldownSeconds / PHONE_OTP_OPTIMISTIC_COOLDOWN_SECONDS) * 100}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.otpBlock}>
        {siteKey ? <NativeTurnstile action="send_pre_signup_verify" error={turnstileError} siteKey={siteKey} onError={onTurnstileError} onToken={onToken} /> : null}
        {phoneState.maskedPhoneHint && otpSent ? (
          <Text style={styles.otpSentText}>Code sent to {phoneState.maskedPhoneHint}.</Text>
        ) : null}
      </View>
      {otpSent ? (
        <>
          <OtpCellInput value={otpCode} onChangeValue={onUpdateCode} onComplete={codeReady ? onVerify : undefined} />
          <ActionButton disabled={phoneState.loading || !codeReady} label={phoneState.loading ? "Verifying…" : "Verify code"} onPress={onVerify} secondary={!codeReady} />
        </>
      ) : null}
    </View>
  );
}

class HumanDetectorBoundary extends Component<
  { children: ReactNode; onError: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function HumanPendingBrandLoader() {
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
    if (currentTime > 0) setVideoFrameReady(true);
  });

  return (
    <View testID="human-pending-branded-loader" style={styles.humanPendingLoader}>
      <Image source={huddleVideoFallback} resizeMode="contain" style={styles.humanPendingLoaderFallback} />
      {videoReady && !videoFailed ? (
        <View pointerEvents="none" style={[styles.humanPendingLoaderVideoClip, videoFrameReady ? null : styles.humanPendingLoaderVideoLoading]}>
          <VideoView
            player={player}
            nativeControls={false}
            fullscreenOptions={{ enable: false }}
            contentFit="contain"
            style={styles.humanPendingLoaderVideo}
          />
        </View>
      ) : null}
    </View>
  );
}

function HumanPanel({
  busy,
  cameraGranted,
  completedSteps,
  confirmationDwell,
  detectorReady,
  device,
  faceDetectionOptions,
  faceStatus,
  humanState,
  onCapture,
  onCameraError,
  onDetectorError,
  onFacesDetected,
  onLayoutCamera,
  onOpenSettings,
  onStart,
  poseStep,
  settlePhase,
}: {
  busy: boolean;
  cameraGranted: boolean;
  completedSteps: HumanCompletedSteps;
  confirmationDwell: HumanConfirmationDwell;
  detectorReady: boolean;
  device: ReturnType<typeof useCameraDevice>;
  faceDetectionOptions: FrameFaceDetectionOptions;
  faceStatus: string;
  humanState: NativeVerifyIdentityHumanState;
  onCapture: () => void;
  onCameraError: (error: unknown) => void;
  onDetectorError: (error: unknown) => void;
  onFacesDetected: (faces: Face[], frame: Frame) => void;
  onLayoutCamera: (event: LayoutChangeEvent) => void;
  onOpenSettings: () => void;
  onStart: () => void;
  poseStep: HumanPoseStep;
  settlePhase: HumanSettlePhase;
}) {
  const permissionDenied = humanState.failure === "permission_denied" || humanState.failure === "no_camera" || cameraGranted === false;
  const detectorUnavailable = humanState.failure === "detector_unavailable" || !detectorReady;
  const capturing = humanState.state === "capturing";
  const pending = humanState.state === "pending";
  const passed = humanState.state === "passed";
  const ready = humanState.state === "ready";
  const completedOrFinishing = passed || poseStep === "done" || pending;
  const centerPassed = completedSteps.center || passed;
  const leftPassed = completedSteps.left || passed;
  const rightPassed = completedSteps.right || passed;
  const centerActive = poseStep === "center" && !centerPassed;
  const leftActive = poseStep === "left" && !leftPassed;
  const rightActive = poseStep === "right" && !rightPassed;
  const showDetectorCamera = capturing && !completedOrFinishing && cameraGranted && Boolean(device) && detectorReady;
  const showFailedArc = humanState.state === "failed" && !capturing && !pending && !confirmationDwell;
  const scanVisual = getNativeHumanScanVisualState({
    confirmationDwellStep: confirmationDwell?.step ?? null,
    currentStep: poseStep,
    failed: showFailedArc || pending || passed,
    settleTarget: settlePhase?.target ?? null,
  });
  const showPendingBrandLoader = pending;
  const showScanOverlay = !showPendingBrandLoader && !passed;
  const showCenterScanRing = showScanOverlay && (scanVisual.showCenterRing || (!showFailedArc && !showDetectorCamera && !leftActive && !rightActive && scanVisual.visualActiveStep !== "settle"));
  const showLeftScanArc = showScanOverlay && scanVisual.showLeftArc;
  const showRightScanArc = showScanOverlay && scanVisual.showRightArc;

  const buttonLabel = permissionDenied
    ? "Grant Camera Access"
    : passed
      ? "Verified"
      : pending
        ? "Validating"
        : detectorUnavailable
          ? "Face Check Unavailable"
          : capturing
            ? "Detecting…"
            : ready
              ? "Begin Check"
              : humanState.state === "failed"
                ? "Try again"
                : "Start Face Check";

  return (
    <View style={styles.panelStack}>
      <View style={styles.humanProgressRow}>
        <HumanProgressStep label="Center" done={centerPassed} active={centerActive} passed={centerPassed} />
        <HumanProgressStep label="Left" done={leftPassed} active={leftActive} passed={leftPassed} />
        <HumanProgressStep label="Right" done={rightPassed} active={rightActive} passed={rightPassed} />
      </View>

      <View onLayout={onLayoutCamera} style={[styles.humanCameraPreview, showDetectorCamera ? styles.humanCameraPreviewActive : null]}>
        {showDetectorCamera && device && FaceDetectorCamera ? (
          <HumanDetectorBoundary key={humanState.attemptId || "human-detector"} onError={onDetectorError}>
            <FaceDetectorCamera
              device={device}
              faceDetectionCallback={onFacesDetected}
              faceDetectionOptions={faceDetectionOptions}
              isActive
              onError={onCameraError}
              style={StyleSheet.absoluteFill}
            />
          </HumanDetectorBoundary>
        ) : null}
        <View style={styles.humanCameraOverlay}>
          {/* captureOverlay: dark scrim only exists while the live detector camera is active. */}
          {showDetectorCamera ? <View pointerEvents="none" style={styles.humanOvalScrim} /> : null}

          {showPendingBrandLoader ? <HumanPendingBrandLoader /> : null}

          {!showDetectorCamera && showScanOverlay ? <View pointerEvents="none" style={[styles.humanOvalBase, styles.humanOvalBaseIdle]} /> : null}
          {/* Center full ring */}
          {showCenterScanRing ? (
            <View pointerEvents="none" style={[
              styles.humanOvalSegment,
              styles.humanOvalCenterRing,
              scanVisual.centerColor === "done" || passed ? styles.humanOvalSegmentDone : scanVisual.centerColor === "active" ? styles.humanOvalSegmentActive : styles.humanOvalSegmentNeutral,
              permissionDenied || humanState.state === "failed" ? styles.humanOvalSegmentError : null,
            ]} />
          ) : null}
          {/* Left half arc */}
          {showLeftScanArc ? (
            <View pointerEvents="none" style={styles.humanOvalLeftClip}>
              <View style={[
                styles.humanOvalSegment,
                styles.humanOvalHalfRing,
                scanVisual.leftColor === "done" ? styles.humanOvalSegmentDone : styles.humanOvalSegmentActive,
                permissionDenied || humanState.state === "failed" ? styles.humanOvalSegmentError : null,
              ]} />
            </View>
          ) : null}
          {/* Right half arc */}
          {showRightScanArc ? (
            <View pointerEvents="none" style={styles.humanOvalRightClip}>
              <View style={[
                styles.humanOvalSegment,
                styles.humanOvalHalfRing,
                styles.humanOvalRightRing,
                scanVisual.rightColor === "done" ? styles.humanOvalSegmentDone : styles.humanOvalSegmentActive,
                permissionDenied || humanState.state === "failed" ? styles.humanOvalSegmentError : null,
              ]} />
            </View>
          ) : null}

          {!showDetectorCamera && showScanOverlay ? (
            <View style={styles.humanOvalEmptyIcon}>
              <Feather
                color={
                  passed
                    ? huddleColors.success
                    : permissionDenied || detectorUnavailable || humanState.state === "failed"
                      ? huddleColors.validationRed
                      : huddleColors.blue
                }
                name={passed ? "check" : "user"}
                size={34}
              />
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.humanInlineTitle}>
        {permissionDenied
          ? "Camera access needed"
          : pending
            ? "Confirming your check… Almost done."
            : detectorUnavailable
              ? "Face detection unavailable"
              : passed
                ? "Completed ✓"
                : faceStatus}
      </Text>
      <ActionButton
        disabled={busy || capturing || pending || passed || detectorUnavailable}
        label={buttonLabel}
        onPress={permissionDenied ? onOpenSettings : ready ? onCapture : onStart}
      />
    </View>
  );
}

function HumanProgressStep({ active, done, label, passed }: { active: boolean; done: boolean; label: string; passed: boolean }) {
  return (
    <View style={[
      styles.humanProgressStep,
      active ? styles.humanProgressStepActive : null,
      done ? styles.humanProgressStepDone : null,
      passed && done ? styles.humanProgressStepPassed : null,
    ]}>
      <View style={[
        styles.humanProgressDot,
        active ? styles.humanProgressDotActive : null,
        done ? styles.humanProgressDotDone : null,
        passed && done ? styles.humanProgressDotPassed : null,
      ]}>
        {done ? <Feather color={huddleColors.onPrimary} name="check" size={10} /> : null}
      </View>
      <Text style={[
        styles.humanProgressLabel,
        active ? styles.humanProgressLabelActive : null,
        done ? styles.humanProgressLabelDone : null,
        passed && done ? styles.humanProgressLabelPassed : null,
      ]}>
        {label}
      </Text>
    </View>
  );
}

function CardPanel({
  blockedSupportReady,
  cardFieldFocused,
  cardState,
  readOnlyVerified = false,
  onCardCompleteChange,
  onCheck,
  onCardFocusChange,
  onLegalNameChange,
  onPrimary,
  onSubmit,
  onSupport,
  profileStatus,
  showCardFieldError,
  showLegalNameError,
}: {
  blockedSupportReady: boolean;
  cardFieldFocused: boolean;
  cardState: NativeVerifyIdentityCardState;
  readOnlyVerified?: boolean;
  showLegalNameError?: boolean;
  showCardFieldError?: boolean;
  onCardCompleteChange: (complete: boolean) => void;
  onCardFocusChange: (focused: boolean) => void;
  onCheck: () => void;
  onLegalNameChange: (legalName: string) => void;
  onPrimary: () => void;
  onSubmit: () => void;
  onSupport: () => void;
  profileStatus: NativeVerifyIdentityProfileStatus | null;
}) {
  if (cardState.state === "passed" || readOnlyVerified) {
    return (
      <View style={styles.panelStack}>
        <NativeFormTextField
          autoCapitalize="words"
          editable={false}
          label="Legal Name"
          onChangeText={() => undefined}
          placeholder="Legal Name"
          value={cardState.legalName || profileStatus?.legalName || ""}
        />
      </View>
    );
  }

  const hasPreparedCard = Boolean(cardState.clientSecret && cardState.setupIntentId);
  const collecting = cardState.state === "collecting" || cardState.state === "ready" || cardState.state === "opening_3ds" || cardState.state === "checking_card" || cardState.state === "pending" || ((cardState.state === "failed" || cardState.state === "cancelled") && hasPreparedCard);
  const loading = cardState.loading || cardState.state === "creating_setup_intent" || cardState.state === "opening_3ds" || cardState.state === "checking_card";
  const legalNameMissing = showLegalNameError && !cardState.legalName.trim();
  const cardInputError = Boolean(showCardFieldError && cardState.failure === "card_incomplete") || Boolean(cardState.error);
  const canSubmit = !loading && cardState.cardComplete && Boolean(cardState.clientSecret) && Boolean(cardState.setupIntentId) && Boolean(cardState.legalName.trim());

  return (
    <View style={styles.panelStack}>
      <NativeFormTextField
        compact
        error={legalNameMissing ? " " : undefined}
        label="Legal name"
        onChangeText={onLegalNameChange}
        placeholder="Name on card"
        value={cardState.legalName}
      />
      <Text style={styles.fieldHelper}>Use your real legal name. We check this with your phone, card, and device signals to keep huddle safe.</Text>
      {cardState.state === "idle" || cardState.state === "failed" || cardState.state === "cancelled" || cardState.state === "blocked" ? (
        <>
          <ActionButton
            disabled={!cardState.legalName.trim()}
            label={cardState.state === "idle" ? "Add Details" : "Try a Different Card"}
            onPress={blockedSupportReady ? onSupport : onPrimary}
          />
          <Text style={styles.fieldHelperCentered}>No charge.</Text>
        </>
      ) : null}

      {collecting ? (
        <>
          <CardField
            cardStyle={{
              backgroundColor: huddleColors.canvas,
              borderColor: huddleColors.fieldBorder,
              borderRadius: huddleRadii.field,
              textColor: huddleColors.text,
              placeholderColor: huddleColors.mutedText,
              fontSize: huddleFormFields.valueSize,
            } as never}
            onBlur={() => onCardFocusChange(false)}
            onCardChange={(details) => onCardCompleteChange(Boolean(details.complete))}
            onFocus={() => onCardFocusChange(true)}
            placeholders={{ number: "Card number", expiration: "MM/YY", cvc: "CVC" }}
            postalCodeEnabled={false}
            style={[
              styles.stripeCardFieldWrap,
              cardFieldFocused ? styles.stripeCardFieldWrapFocused : null,
              cardInputError ? styles.stripeCardFieldWrapError : null,
            ]}
          />
          {cardState.state === "pending" ? (
            <View style={styles.pendingBox}>
              <Feather color={huddleColors.iconMuted} name="clock" size={huddleVerifyIdentity.panelIconSize} />
              <Text style={styles.pendingText}>We're confirming your card. This only takes a moment.</Text>
            </View>
          ) : null}
          <ActionButton disabled={!canSubmit} label={loading ? "Validating" : "Verify Card"} onPress={cardState.state === "pending" ? onCheck : onSubmit} secondary={!canSubmit} />
        </>
      ) : null}
      {blockedSupportReady ? <ActionButton label="Help & Support" onPress={onSupport} secondary /> : null}
    </View>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "error" | "muted" }) {
  return (
    <View style={[styles.statusPill, tone === "success" ? styles.statusSuccess : tone === "error" ? styles.statusError : styles.statusMuted]}>
      <Text style={[styles.statusLabel, tone === "success" ? styles.statusLabelSuccess : tone === "error" ? styles.statusLabelError : styles.statusLabelMuted]}>{label}</Text>
    </View>
  );
}

function ActionButton({ disabled, label, onPress, secondary }: { disabled?: boolean; label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, disabled || secondary ? styles.secondaryButton : huddleButtons.primary, pressed ? huddleButtons.pressed : null]}>
      <Text style={[styles.actionButtonText, disabled || secondary ? styles.secondaryButtonText : null]}>{label}</Text>
    </Pressable>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function describeOverallChip(status: string | null | undefined): { label: string; tone: "success" | "error" | "muted" } {
  if (status === "verified") return { label: "Verified", tone: "success" };
  if (status === "pending") return { label: "Pending", tone: "muted" };
  return { label: "Unverified", tone: "muted" };
}

function getPhoneBadge(state: NativeVerifyIdentityPhoneOtpState, profileStatus?: string | null) {
  if (profileStatus === "verified" || state.state === "verified") return { label: "Complete", tone: "success" as const };
  if (state.state === "unavailable") return { label: "Unavailable", tone: "muted" as const };
  if (state.state === "failed") return { label: "Action needed", tone: "error" as const };
  if (state.state === "sent" || state.loading) return { label: "Pending", tone: "muted" as const };
  return null;
}

function getHumanBadge(state: NativeVerifyIdentityHumanState) {
  if (state.state === "passed") return { label: "Complete", tone: "success" as const };
  if (state.state === "failed") return { label: "Action needed", tone: "error" as const };
  if (state.state === "pending" || state.state === "ready" || state.state === "capturing") return { label: "Pending", tone: "muted" as const };
  return null;
}

function getCardBadge(state: NativeVerifyIdentityCardState) {
  if (state.state === "passed") return { label: "Complete", tone: "success" as const };
  if (state.state === "failed" || state.state === "cancelled" || state.state === "blocked") return { label: "Action needed", tone: "error" as const };
  if (state.state === "pending" || state.state === "checking_card" || state.state === "opening_3ds" || state.state === "ready" || state.state === "collecting") return { label: "Pending", tone: "muted" as const };
  return null;
}

function createProofPhoneState(proofMode: boolean, activeCard: ActiveCard): NativeVerifyIdentityPhoneOtpState {
  if (!proofMode) return createNativeVerifyIdentityPhoneOtpState();
  if (activeCard === "phone") {
    return {
      ...createNativeVerifyIdentityPhoneOtpState("+1 555 012 3456"),
      state: "sent",
      cooldownSeconds: 42,
      maskedPhoneHint: "+1 •••• 3456",
    };
  }
  return {
    ...createNativeVerifyIdentityPhoneOtpState("+1 555 012 3456"),
    state: "verified",
    maskedPhoneHint: "+1 •••• 3456",
  };
}

function createProofHumanState(proofMode: boolean, activeCard: ActiveCard): NativeVerifyIdentityHumanState {
  const base = createNativeVerifyIdentityHumanState();
  if (!proofMode) return base;
  if (activeCard === "human") {
    return {
      ...base,
      state: "ready",
      attemptId: "proof-human-attempt",
      challenge: {
        challengeType: "turn_left_right",
        instruction: "Slowly turn your head left, then right.",
        issuedAt: new Date(0).toISOString(),
        expiresInSec: 120,
      },
    };
  }
  return { ...base, state: "passed" };
}

function createProofCardState(proofMode: boolean): NativeVerifyIdentityCardState {
  if (!proofMode) return createNativeVerifyIdentityCardState();
  return {
    ...createNativeVerifyIdentityCardState({ legalName: "", postalCode: "" }),
    state: "failed",
    error: "Card verification could not be completed. Please try again.",
    failure: "stripe_failed",
    cardComplete: false,
    clientSecret: "proof_client_secret",
  };
}

const styles = StyleSheet.create({
  skipFooter: {
    marginTop: huddleSpacing.x2,
  },
  screen: {
    flex: 1,
    backgroundColor: huddleColors.canvas,
  },
  lockedScreen: {
    flex: 1,
    paddingHorizontal: huddleSpacing.x5,
    gap: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
  },
  lockedCopy: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.subtext,
  },
  header: {
    minHeight: huddleLayout.headerHeight + huddleSpacing.x6,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
    zIndex: 2,
  },
  backButton: {
    width: huddleVerifyIdentity.backButtonWidth,
    minHeight: huddleLayout.minTouch,
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Urbanist-700",
    fontSize: huddleType.nativeHeaderTitle,
    lineHeight: huddleType.nativeHeaderTitleLine,
    color: huddleColors.text,
  },
  scroller: {
    flex: 1,
  },
  content: {
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x4,
  },
  hero: {
    alignItems: "center",
    gap: huddleSpacing.x4,
  },
  illustration: {
    width: huddleVerifyIdentity.illustrationWidth,
    height: huddleVerifyIdentity.illustrationHeight,
    resizeMode: "contain",
  },
  introCopy: {
    maxWidth: huddleVerifyIdentity.introMaxWidth,
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.subtext,
  },
  blockedPanel: {
    borderRadius: huddleRadii.glass,
    backgroundColor: huddleColors.validationSoft,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    ...huddleShadows.glassElevation1,
    ...huddleFieldStates.error,
  },
  blockedText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  supportLink: {
    marginTop: huddleSpacing.x3,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.blue,
    textDecorationLine: "underline",
  },
  verifyCard: {
    borderRadius: huddleRadii.sheet,
    backgroundColor: huddleColors.canvas,
    borderWidth: 1,
    borderColor: huddleColors.blueSoft,
    ...huddleShadows.glassElevation1,
  },
  verifyCardExpanded: {
    borderRadius: huddleRadii.sheet,
  },
  cardHeader: {
    minHeight: huddleVerifyIdentity.cardHeaderMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
  },
  cardTitle: {
    flex: 1,
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  expandedBody: {
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x4,
    gap: huddleSpacing.x4,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: huddleColors.divider,
  },
  statusPill: {
    borderRadius: huddleRadii.pill,
    paddingHorizontal: huddleSpacing.x2,
    paddingVertical: huddleSpacing.x1,
    minHeight: huddleVerifyIdentity.statusMinHeight,
    justifyContent: "center",
  },
  statusSuccess: {
    backgroundColor: huddleColors.successSoft,
  },
  statusError: {
    backgroundColor: huddleColors.validationSoft,
  },
  statusMuted: {
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.glassElevation1,
  },
  statusLabel: {
    fontFamily: "Urbanist-700",
    fontSize: huddleFormFields.labelSize,
    lineHeight: huddleFormFields.labelLine,
  },
  statusLabelSuccess: {
    color: huddleColors.success,
  },
  statusLabelError: {
    color: huddleColors.validationRed,
  },
  statusLabelMuted: {
    color: huddleColors.text,
  },
  panelStack: {
    gap: huddleSpacing.x3,
  },
  otpBlock: {
    gap: huddleSpacing.x2,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    padding: huddleSpacing.x3,
    backgroundColor: huddleColors.canvas,
  },
  phoneFieldBlock: {
    gap: huddleSpacing.x2,
  },
  panelFieldLabelLarge: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
  },
  fieldErrorSubtext: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.validationRed,
  },
  inlineOtpButton: {
    minHeight: 34,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: huddleSpacing.x3,
    backgroundColor: huddleColors.blue,
  },
  inlineOtpButtonDisabled: {
    backgroundColor: huddleColors.blueSoft,
  },
  inlineOtpButtonText: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.onPrimary,
  },
  inlineOtpButtonTextDisabled: {
    color: huddleColors.mutedText,
  },
  cooldownBarTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: huddleColors.mutedCanvas,
  },
  cooldownBarFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: huddleColors.blue,
  },
  humanCameraPreview: {
    height: 360,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderSoft,
    backgroundColor: huddleColors.canvas,
  },
  humanCameraPreviewActive: {
    backgroundColor: huddleColors.verifyCameraFallback,
    ...huddleFieldStates.focused,
  },
  humanCameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  humanPendingLoader: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.canvas,
  },
  humanPendingLoaderFallback: {
    position: "absolute",
    width: 156,
    height: 156,
  },
  humanPendingLoaderVideoClip: {
    position: "absolute",
    width: 156,
    height: 156,
    overflow: "hidden",
    backgroundColor: huddleColors.canvas,
  },
  humanPendingLoaderVideo: {
    position: "absolute",
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    backgroundColor: huddleColors.canvas,
  },
  humanPendingLoaderVideoLoading: {
    opacity: 0,
  },
  humanOvalScrim: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH + HUMAN_OVAL_SCRIM_WIDTH * 2,
    height: HUMAN_OVAL_HEIGHT + HUMAN_OVAL_SCRIM_WIDTH * 2,
    borderRadius: (HUMAN_OVAL_WIDTH + HUMAN_OVAL_SCRIM_WIDTH * 2) / 2,
    borderWidth: HUMAN_OVAL_SCRIM_WIDTH,
    borderColor: huddleColors.verifyCameraScrim,
    backgroundColor: "transparent",
  },
  humanOvalBase: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH,
    height: HUMAN_OVAL_HEIGHT,
    borderRadius: HUMAN_OVAL_RADIUS,
    borderWidth: 4,
    borderColor: huddleColors.verifyCameraBaseRing,
  },
  humanOvalBaseIdle: {
    backgroundColor: huddleColors.blueSoft,
    ...huddleFieldStates.focused,
  },
  humanOvalSegment: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH,
    height: HUMAN_OVAL_HEIGHT,
    borderRadius: HUMAN_OVAL_RADIUS,
    borderWidth: HUMAN_OVAL_BORDER_WIDTH,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  humanOvalCenterRing: {
    opacity: 0.82,
  },
  humanOvalHalfRing: {
    left: 0,
    top: 0,
  },
  humanOvalRightRing: {
    left: -HUMAN_OVAL_WIDTH / 2,
  },
  humanOvalLeftClip: {
    position: "absolute",
    left: "50%",
    marginLeft: -HUMAN_OVAL_WIDTH / 2,
    width: HUMAN_OVAL_WIDTH / 2,
    height: HUMAN_OVAL_HEIGHT,
    overflow: "hidden",
  },
  humanOvalRightClip: {
    position: "absolute",
    left: "50%",
    width: HUMAN_OVAL_WIDTH / 2,
    height: HUMAN_OVAL_HEIGHT,
    overflow: "hidden",
  },
  humanOvalSegmentActive: {
    borderColor: huddleColors.blue,
    shadowColor: huddleColors.blue,
  },
  humanOvalSegmentNeutral: {
    borderColor: huddleColors.fieldBorderSoft,
    shadowColor: huddleColors.fieldBorderSoft,
  },
  humanOvalSegmentDone: {
    borderColor: huddleColors.success,
    shadowColor: huddleColors.success,
  },
  humanOvalSegmentError: {
    ...huddleFieldStates.error,
  },
  humanOvalEmptyIcon: {
    position: "absolute",
    width: HUMAN_OVAL_WIDTH,
    height: HUMAN_OVAL_HEIGHT,
    borderRadius: HUMAN_OVAL_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  humanInlineTitle: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.text,
    textAlign: "center",
  },
  humanProgressRow: {
    flexDirection: "row",
    gap: huddleSpacing.x2,
  },
  humanProgressStep: {
    flex: 1,
    minHeight: 42,
    borderRadius: huddleRadii.button,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: huddleColors.mutedCanvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorderSoft,
  },
  humanProgressStepActive: {
    backgroundColor: huddleColors.blueSoft,
    borderColor: huddleColors.blue,
  },
  humanProgressStepDone: {
    backgroundColor: huddleColors.blueSoft,
    borderColor: huddleColors.blue,
  },
  humanProgressStepPassed: {
    backgroundColor: huddleColors.successSoft,
    borderColor: huddleColors.success,
  },
  humanProgressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  humanProgressDotActive: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  humanProgressDotDone: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  humanProgressDotPassed: {
    borderColor: huddleColors.success,
    backgroundColor: huddleColors.success,
  },
  humanProgressLabel: {
    fontFamily: "Urbanist-700",
    fontSize: 10,
    lineHeight: 12,
    color: huddleColors.mutedText,
  },
  humanProgressLabelActive: {
    color: huddleColors.blue,
  },
  humanProgressLabelDone: {
    color: huddleColors.blue,
  },
  humanProgressLabelPassed: {
    color: huddleColors.success,
  },
  humanOvalPassed: {
    borderColor: huddleColors.success,
    backgroundColor: huddleColors.successSoft,
  },
  humanOvalError: {
    ...huddleFieldStates.error,
    backgroundColor: huddleColors.validationSoft,
  },
  stripeCardFieldWrap: {
    height: 52,
    borderRadius: huddleRadii.field,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
  },
  stripeCardFieldWrapFocused: {
    ...huddleFieldStates.focused,
    backgroundColor: huddleColors.canvas,
  },
  stripeCardFieldWrapError: {
    ...huddleFieldStates.error,
  },
  otpSentText: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: Math.round(huddleType.body * huddleType.lineNormal),
    color: huddleColors.subtext,
  },
  fieldHelper: {
    marginTop: -huddleSpacing.x2,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.caption,
  },
  fieldHelperCentered: {
    textAlign: "center",
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: huddleType.helperLine,
    color: huddleColors.caption,
  },
  panelCopy: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  actionButton: {
    ...huddleButtons.base,
    flex: 1,
    minHeight: huddleVerifyIdentity.actionMinHeight,
    borderRadius: huddleVerifyIdentity.actionRadius,
    paddingHorizontal: huddleSpacing.x4,
  },
  secondaryButton: {
    ...huddleButtons.secondary,
  },
  actionButtonText: {
    ...huddleButtons.label,
    fontSize: huddleVerifyIdentity.actionLabelSize,
    lineHeight: huddleVerifyIdentity.actionLabelLine,
    color: huddleColors.onPrimary,
  },
  secondaryButtonText: {
    color: huddleColors.text,
  },
  errorBox: {
    borderRadius: huddleRadii.glass,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
    ...huddleFieldStates.error,
  },
  errorText: {
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.validationRed,
  },
  pendingBox: {
    width: "100%",
    minHeight: huddleVerifyIdentity.pendingMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.glass,
    borderWidth: 1,
    borderColor: huddleColors.glassBorder,
    backgroundColor: huddleColors.glassControl,
    paddingHorizontal: huddleSpacing.x4,
    paddingVertical: huddleSpacing.x4,
    ...huddleShadows.glassElevation1,
  },
  pendingText: {
    flex: 1,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.subtext,
  },
  verifiedCardSummary: {
    minHeight: huddleVerifyIdentity.verifiedSummaryMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  verifiedSummaryCopy: {
    flex: 1,
    gap: huddleSpacing.x1,
  },
  verifiedName: {
    fontFamily: "Urbanist-700",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.text,
  },
  verifiedNumber: {
    fontFamily: "Urbanist-600",
    fontSize: huddleType.body,
    lineHeight: huddleType.body * huddleType.lineNormal,
    color: huddleColors.text,
  },
  lockCopy: {
    paddingHorizontal: huddleSpacing.x4,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
    color: huddleColors.mutedText,
  },
  lockIcon: {
    color: huddleColors.text,
  },
});
