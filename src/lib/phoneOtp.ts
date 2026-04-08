import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/deviceFingerprint";
import { postPublicFunction } from "@/lib/publicFunctionClient";
import {
  isPhoneCountryAllowed,
} from "@/config/allowedSmsCountries";

// ── Dev/test shortcut (never active in PROD builds) ──────────────────────────

const appEnv = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").toLowerCase();
const isLocalSupabaseEndpoint =
  supabaseUrl.includes("127.0.0.1:54321") || supabaseUrl.includes("localhost:54321");
const isTestingMode =
  import.meta.env.MODE === "test" ||
  appEnv === "test" ||
  appEnv === "testing" ||
  String(import.meta.env.VITE_E2E_MODE ?? "false") === "true";
const explicitShortcutFlag = String(import.meta.env.VITE_TEST_OTP_SHORTCUT ?? "").toLowerCase();
const TEST_OTP_SHORTCUT_ENABLED =
  import.meta.env.PROD === false &&
  (
    (isLocalSupabaseEndpoint && explicitShortcutFlag !== "false") ||
    explicitShortcutFlag === "true" ||
    isTestingMode
  );
const TEST_OTP_SHORTCUT_CODE = "498005";

type SendOtpRateLimitReason =
  | "resend_cooldown"
  | "phone_daily_cap"
  | "user_daily_cap"
  | "ip_daily_cap";

type SendOtpReasonCode =
  | "provider_config_error"
  | "sms_region_blocked"
  | "rate_limited"
  | "user_not_found"
  | "provider_send_failed";

type VerifyOtpReasonCode =
  | "invalid_code"
  | "expired_code"
  | "code_already_used"
  | "phone_mismatch"
  | "session_missing"
  | "too_many_incorrect_attempts"
  | "verify_failed";

type SendOtpErrorDetails = {
  error?: string;
  reason_code?: SendOtpReasonCode;
  rate_limit_reason?: SendOtpRateLimitReason;
  retry_after?: number;
};

type VerifyOtpErrorDetails = {
  error?: string;
  reason_code?: VerifyOtpReasonCode;
  retry_after?: number;
};

// ── User-friendly error mapping ───────────────────────────────────────────────
// Maps raw HTTP error codes / server strings to copy-safe UI messages.
// Never exposes internal codes (http_4xx, JWT strings, etc.) to the user.

const formatRetryWindow = (seconds: number): string => {
  const clamped = Math.max(0, Number(seconds || 0));
  if (clamped < 60) return `Please try again in ${clamped}s.`;
  if (clamped < 3600) return `Please try again in ${Math.ceil(clamped / 60)} min.`;
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.ceil((clamped % 3600) / 60);
  if (minutes <= 0) return `Please try again in ${hours}h.`;
  return `Please try again in ${hours}h ${minutes}min.`;
};

const mapOtpRateLimitedMessage = (
  reason: SendOtpRateLimitReason | string | null | undefined,
  retryAfterSeconds: number | null | undefined,
): string => {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  const retryAfter = Math.max(0, Number(retryAfterSeconds || 0));
  if (normalizedReason === "resend_cooldown") {
    return formatRetryWindow(retryAfter);
  }
  if (
    normalizedReason === "phone_daily_cap" ||
    normalizedReason === "user_daily_cap" ||
    normalizedReason === "ip_daily_cap"
  ) {
    return `Too many verification attempts were made. ${formatRetryWindow(retryAfter)}`;
  }
  return `Too many verification attempts were made. ${formatRetryWindow(retryAfter)}`;
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const mapSendOtpFailure = (
  statusCode: number | null,
  rawMessage: string | null | undefined,
  details: SendOtpErrorDetails | null | undefined,
): { message: string; unavailable: boolean } => {
  const reasonCode = normalize(details?.reason_code);
  const raw = normalize(rawMessage);

  if (statusCode === 429) {
    return {
      message: mapOtpRateLimitedMessage(details?.rate_limit_reason, details?.retry_after),
      unavailable: false,
    };
  }
  if (statusCode === 401 || raw.includes("unauthorized") || raw.includes("jwt") || raw.includes("auth_required")) {
    return { message: "Please sign in again and try once more.", unavailable: false };
  }
  if (statusCode === 403 && (raw.includes("turnstile") || raw.includes("human_verification"))) {
    return { message: "Please complete the verification first.", unavailable: false };
  }
  if (reasonCode === "sms_region_blocked") {
    return { message: "Phone verification is temporarily unavailable.", unavailable: true };
  }
  if (reasonCode === "provider_config_error" || reasonCode === "provider_send_failed") {
    return { message: "Phone verification is temporarily unavailable. Please try again later.", unavailable: true };
  }
  if (raw.includes("country") && raw.includes("unavailable")) {
    return { message: "Phone verification is not available yet.", unavailable: true };
  }
  if (raw === "network_error" || raw.includes("fetch") || raw.includes("networkerror")) {
    return { message: "Phone verification is temporarily unavailable. Please try again later.", unavailable: false };
  }
  return { message: "Phone verification is temporarily unavailable. Please try again later.", unavailable: false };
};

const mapVerifyOtpFailure = (
  statusCode: number | null,
  rawMessage: string | null | undefined,
  details: VerifyOtpErrorDetails | null | undefined,
): string => {
  const reasonCode = normalize(details?.reason_code);
  const raw = normalize(rawMessage);

  if (reasonCode === "invalid_code" || raw.includes("invalid")) {
    return "Incorrect code. Please try again.";
  }
  if (statusCode === 429 || reasonCode === "too_many_incorrect_attempts") {
    return "Too many incorrect attempts. Request a new code.";
  }
  if (reasonCode === "expired_code" || raw.includes("expired")) {
    return "This code has expired. Request a new code.";
  }
  if (reasonCode === "code_already_used" || raw.includes("already used")) {
    return "This code has already been used. Request a new code.";
  }
  if (reasonCode === "phone_mismatch" || raw.includes("match this phone") || raw.includes("phone mismatch")) {
    return "This code does not match this phone number.";
  }
  if (reasonCode === "session_missing" || statusCode === 401 || raw.includes("unauthorized") || raw.includes("session")) {
    return "Your verification session expired. Request a new code.";
  }
  if (raw === "network_error" || raw.includes("fetch") || raw.includes("load failed") || raw.includes("networkerror") || raw.includes("failed to fetch")) {
    return "We couldn’t verify the code right now. Please try again.";
  }
  if (statusCode !== null && statusCode >= 500) {
    return "We couldn’t verify the code right now. Please try again.";
  }
  return "We couldn’t verify the code right now. Please try again.";
};

// ── Module-level OTP type ─────────────────────────────────────────────────────
// Set by requestPhoneOtp from the send-phone-otp response.
// Read by verifyPhoneOtp so the correct type is forwarded to verify-phone-otp.
// Default "phone_change": all VerifyIdentity and EditProfile flows are
// authenticated, so this default is correct if send is never called first.

let lastOtpType: "phone_change" | "sms" = "phone_change";

// ── Public edge call helper ───────────────────────────────────────────────────
// Uses the configurable public functions base so OTP send can be fronted by
// Cloudflare (e.g. api.huddle.pet) without changing business logic.
async function callPublic<T>(
  fn: string,
  body: unknown,
  accessToken?: string,
): Promise<{ data: T | null; error: string | null }> {
  const res = await postPublicFunction<T>(fn, body, { accessToken });
  return { data: res.data, error: res.error?.message ?? null };
}

// ── requestPhoneOtp ───────────────────────────────────────────────────────────
// Canonical send path. Calls send-phone-otp edge function which:
//   • checks DB rate limits before touching Supabase Auth
//   • logs every attempt to phone_otp_attempts
//   • returns otp_type so verifyPhoneOtp uses the correct verify type

export async function requestPhoneOtp(
  phone: string,
  turnstileToken: string,
): Promise<{ ok: boolean; error?: string; unavailable?: boolean }> {
  const normalized = phone.trim();
  if (!normalized) return { ok: false, error: "Enter a valid phone number." };
  if (!turnstileToken.trim()) return { ok: false, error: "Please complete the verification first." };

  // Client-side country guard — UX only; server enforces authoritatively.
  if (!isPhoneCountryAllowed(normalized)) {
    return { ok: false, error: "Phone verification is not available yet.", unavailable: true };
  }

  // Dev shortcut — bypasses edge function entirely
  if (TEST_OTP_SHORTCUT_ENABLED) {
    lastOtpType = "phone_change";
    return { ok: true };
  }

  const deviceId = await getVisitorId(); // null if FingerprintJS fails — acceptable
  const { data: { session } } = await supabase.auth.getSession();
  const hasSession = Boolean(session?.access_token);

  type SendResponse = { ok: boolean; otp_type: "phone_change" | "sms"; error?: string };
  let data: SendResponse | null = null;
  let errorMsg: string | null = null;
  let statusCode: number | null = null;
  let errorDetails: SendOtpErrorDetails | null = null;
  const accessToken = String(session?.access_token || "").trim();

  if (hasSession) {
    // Authenticated path — send session token explicitly in x-huddle-access-token
    // while keeping anon Authorization for browser-safe gateway traversal.
    const res = await postPublicFunction<SendResponse>(
      "send-phone-otp",
      {
        phone: normalized,
        device_id: deviceId,
        turnstile_token: turnstileToken,
        turnstile_action: "send_pre_signup_verify",
      },
      { accessToken },
    );
    data = res.data;
    errorMsg = res.error?.message ?? null;
    statusCode = res.status;
    errorDetails = (res.error?.details as SendOtpErrorDetails | null | undefined) ?? null;
  } else {
    // Unauthenticated path — no JWT; edge function uses signInWithOtp
    const res = await postPublicFunction<SendResponse>(
      "send-phone-otp",
      {
        phone: normalized,
        device_id: deviceId,
        turnstile_token: turnstileToken,
        turnstile_action: "send_pre_signup_verify",
      },
    );
    data = res.data;
    errorMsg = res.error?.message ?? null;
    statusCode = res.status;
    errorDetails = (res.error?.details as SendOtpErrorDetails | null | undefined) ?? null;
  }

  if (errorMsg || !data?.ok) {
    const mapped = mapSendOtpFailure(statusCode, errorMsg ?? data?.error ?? "", errorDetails);
    return { ok: false, error: mapped.message, unavailable: mapped.unavailable };
  }

  // Store otp_type for the subsequent verifyPhoneOtp call
  lastOtpType = data.otp_type ?? (hasSession ? "phone_change" : "sms");
  return { ok: true };
}

// ── verifyPhoneOtp ────────────────────────────────────────────────────────────
// Canonical verify path. Calls verify-phone-otp edge function which:
//   • caps verify attempts to 3 per phone per 24 h (DB-enforced)
//   • logs every attempt to phone_otp_attempts
//   • uses otp_type to call the correct Supabase Auth verifyOtp path

export async function verifyPhoneOtp(
  phone: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalizedPhone = phone.trim();
  const normalizedToken = token.trim();
  if (!normalizedPhone || !normalizedToken) {
    return { ok: false, error: "Enter the 6-digit code." };
  }

  // Dev shortcut — bypasses edge function entirely
  if (TEST_OTP_SHORTCUT_ENABLED) {
    if (normalizedToken !== TEST_OTP_SHORTCUT_CODE) {
      return { ok: false, error: "Invalid code" };
    }
    return { ok: true };
  }

  const deviceId = await getVisitorId();
  const otpType  = lastOtpType; // set by the preceding requestPhoneOtp call

  type VerifyResponse = { ok: boolean; error?: string };
  let errorMsg: string | null = null;
  let statusCode: number | null = null;
  let errorDetails: VerifyOtpErrorDetails | null = null;

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = String(session?.access_token || "").trim();

  if (otpType === "phone_change") {
    // Authenticated path — JWT required by edge function for phone_change
    const res = await postPublicFunction<VerifyResponse>(
      "verify-phone-otp",
      {
        phone: normalizedPhone,
        token: normalizedToken,
        otp_type: "phone_change",
        device_id: deviceId,
      },
      { accessToken },
    );
    if (res.error || !res.data?.ok) {
      errorMsg = res.error?.message ?? res.data?.error ?? "invalid_code";
      statusCode = res.status;
      errorDetails = (res.error?.details as VerifyOtpErrorDetails | null | undefined) ?? null;
    }
  } else {
    // Unauthenticated path — no JWT; edge function uses sms verifyOtp
    const res = await postPublicFunction<VerifyResponse>("verify-phone-otp", {
      phone:    normalizedPhone,
      token:    normalizedToken,
      otp_type: "sms",
      device_id: deviceId,
    });
    if (res.error || !res.data?.ok) {
      errorMsg = res.error?.message ?? res.data?.error ?? "invalid_code";
      statusCode = res.status;
      errorDetails = (res.error?.details as VerifyOtpErrorDetails | null | undefined) ?? null;
    }
  }

  if (errorMsg) return { ok: false, error: mapVerifyOtpFailure(statusCode, errorMsg, errorDetails) };
  return { ok: true };
}
