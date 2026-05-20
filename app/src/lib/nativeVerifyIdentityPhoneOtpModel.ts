import {
  isNativePhoneCountryAllowed,
  maskNativePhoneForOtpNotice,
  requestNativePhoneOtp,
  verifyNativePhoneOtp,
} from "./nativePhoneOtp";

export type NativeVerifyIdentityPhoneOtpStateName =
  | "idle"
  | "sent"
  | "verified"
  | "failed"
  | "unavailable";

export type NativeVerifyIdentityPhoneOtpFailure =
  | "wrong_code"
  | "expired_code"
  | "rate_limit"
  | "country_unavailable"
  | "session_expired"
  | "challenge_expired"
  | "provider_unavailable"
  | "verification_required"
  | "invalid_phone"
  | "network"
  | "unknown";

export type NativeVerifyIdentityPhoneOtpState = {
  state: NativeVerifyIdentityPhoneOtpStateName;
  loading: boolean;
  cooldownSeconds: number;
  error: string | null;
  failure: NativeVerifyIdentityPhoneOtpFailure | null;
  maskedPhoneHint: string | null;
  phone: string;
};

export type NativeVerifyIdentityPhoneOtpAction =
  | { type: "phone_changed"; phone: string }
  | { type: "send_started"; phone: string }
  | { type: "send_succeeded"; phone: string; cooldownSeconds: number; maskedPhoneHint: string }
  | { type: "send_failed"; error: string; failure: NativeVerifyIdentityPhoneOtpFailure; retryAfterSeconds?: number; unavailable?: boolean }
  | { type: "verify_started" }
  | { type: "verify_succeeded" }
  | { type: "verify_failed"; error: string; failure: NativeVerifyIdentityPhoneOtpFailure; retryAfterSeconds?: number }
  | { type: "cooldown_ticked"; seconds: number }
  | { type: "reset" };

const DEFAULT_COOLDOWN_SECONDS = 90;

export const createNativeVerifyIdentityPhoneOtpState = (
  phone = "",
): NativeVerifyIdentityPhoneOtpState => ({
  state: "idle",
  loading: false,
  cooldownSeconds: 0,
  error: null,
  failure: null,
  maskedPhoneHint: null,
  phone: phone.trim(),
});

const toModelFailure = (
  failureKind: unknown,
  unavailable = false,
): NativeVerifyIdentityPhoneOtpFailure => {
  if (failureKind === "provider_unavailable") return "provider_unavailable";
  if (failureKind === "country_unavailable" || unavailable) return "country_unavailable";
  if (failureKind === "wrong_code") return "wrong_code";
  if (failureKind === "expired_code") return "expired_code";
  if (failureKind === "rate_limit") return "rate_limit";
  if (failureKind === "session_expired") return "session_expired";
  if (failureKind === "challenge_expired") return "challenge_expired";
  if (failureKind === "verification_required") return "verification_required";
  if (failureKind === "invalid_phone" || failureKind === "phone_in_use" || failureKind === "already_verified") return "invalid_phone";
  if (failureKind === "network") return "network";
  return "unknown";
};

const withCooldown = (
  state: NativeVerifyIdentityPhoneOtpState,
  seconds: number | undefined,
) => ({
  ...state,
  cooldownSeconds: Math.max(0, Number(seconds || 0)),
});

export const reduceNativeVerifyIdentityPhoneOtpState = (
  state: NativeVerifyIdentityPhoneOtpState,
  action: NativeVerifyIdentityPhoneOtpAction,
): NativeVerifyIdentityPhoneOtpState => {
  switch (action.type) {
    case "phone_changed": {
      const phone = action.phone.trim();
      if (!phone) return createNativeVerifyIdentityPhoneOtpState();
      if (!isNativePhoneCountryAllowed(phone)) {
        return {
          ...createNativeVerifyIdentityPhoneOtpState(phone),
          state: "unavailable",
          error: "Phone verification is not available yet.",
          failure: "country_unavailable",
        };
      }
      return {
        ...createNativeVerifyIdentityPhoneOtpState(phone),
        maskedPhoneHint: state.phone === phone && state.state === "sent" ? state.maskedPhoneHint : null,
      };
    }
    case "send_started":
      return { ...state, phone: action.phone.trim(), loading: true, error: null, failure: null };
    case "send_succeeded":
      return {
        ...state,
        state: "sent",
        loading: false,
        error: null,
        failure: null,
        phone: action.phone.trim(),
        cooldownSeconds: Math.max(0, action.cooldownSeconds),
        maskedPhoneHint: action.maskedPhoneHint,
      };
    case "send_failed":
      return withCooldown({
        ...state,
        state: action.unavailable ? "unavailable" : "failed",
        loading: false,
        error: action.error,
        failure: action.failure,
      }, action.retryAfterSeconds);
    case "verify_started":
      return { ...state, loading: true, error: null, failure: null };
    case "verify_succeeded":
      return { ...state, state: "verified", loading: false, error: null, failure: null, cooldownSeconds: 0 };
    case "verify_failed":
      return withCooldown({ ...state, state: "failed", loading: false, error: action.error, failure: action.failure }, action.retryAfterSeconds);
    case "cooldown_ticked":
      if (state.state !== "sent" && state.state !== "failed") return state;
      return { ...state, cooldownSeconds: Math.max(0, action.seconds) };
    case "reset":
      return createNativeVerifyIdentityPhoneOtpState();
    default:
      return state;
  }
};

export const sendNativeVerifyIdentityPhoneOtp = async (
  state: NativeVerifyIdentityPhoneOtpState,
  phone: string,
  turnstileToken: string,
  accessToken?: string | null,
): Promise<NativeVerifyIdentityPhoneOtpState> => {
  const started = reduceNativeVerifyIdentityPhoneOtpState(state, { type: "send_started", phone });
  const result = await requestNativePhoneOtp(phone, turnstileToken, accessToken) as {
    ok: boolean;
    cooldownSeconds?: number;
    retryAfterSeconds?: number;
    failureKind?: unknown;
    unavailable?: boolean;
    error?: string;
  };

  if (result.ok) {
    return reduceNativeVerifyIdentityPhoneOtpState(started, {
      type: "send_succeeded",
      phone,
      cooldownSeconds: result.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS,
      maskedPhoneHint: maskNativePhoneForOtpNotice(phone),
    });
  }

  return reduceNativeVerifyIdentityPhoneOtpState(started, {
    type: "send_failed",
    error: result.error || "Phone verification is temporarily unavailable. Please try again later.",
    failure: toModelFailure(result.failureKind, result.unavailable),
    retryAfterSeconds: result.retryAfterSeconds,
    unavailable: result.unavailable,
  });
};

export const resendNativeVerifyIdentityPhoneOtp = sendNativeVerifyIdentityPhoneOtp;

export const verifyNativeVerifyIdentityPhoneOtpCode = async (
  state: NativeVerifyIdentityPhoneOtpState,
  code: string,
  accessToken?: string | null,
): Promise<NativeVerifyIdentityPhoneOtpState> => {
  const started = reduceNativeVerifyIdentityPhoneOtpState(state, { type: "verify_started" });
  const result = await verifyNativePhoneOtp(state.phone, code, accessToken) as {
    ok: boolean;
    retryAfterSeconds?: number;
    failureKind?: unknown;
    error?: string;
  };

  if (result.ok) {
    return reduceNativeVerifyIdentityPhoneOtpState(started, { type: "verify_succeeded" });
  }

  return reduceNativeVerifyIdentityPhoneOtpState(started, {
    type: "verify_failed",
    error: result.error || "We couldn't verify the code right now. Please try again.",
    failure: toModelFailure(result.failureKind),
    retryAfterSeconds: result.retryAfterSeconds,
  });
};
