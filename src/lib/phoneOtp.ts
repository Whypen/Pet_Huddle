import { supabase } from "@/integrations/supabase/client";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";
import { getVisitorId } from "@/lib/deviceFingerprint";
import { postPublicFunction } from "@/lib/publicFunctionClient";
import {
  isPhoneCountryAllowed,
  COUNTRY_NOT_ALLOWED_MESSAGE,
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

// ── User-friendly error mapping ───────────────────────────────────────────────
// Maps raw HTTP error codes / server strings to copy-safe UI messages.
// Never exposes internal codes (http_4xx, JWT strings, etc.) to the user.

function friendlyOtpSendError(raw: string): string {
  const r = String(raw || "").toLowerCase();
  if (r.startsWith("http_401") || r.includes("invalid or exp") || r.includes("jwt") || r.includes("invalid_token")) {
    return "Session expired. Please go back and sign in again.";
  }
  if (r.startsWith("http_403") || r.includes("human_verification") || r.includes("turnstile")) {
    return "Human verification failed. Please complete the check above and try again.";
  }
  if (r.startsWith("http_429") || r.includes("too_many") || r.includes("rate_limit")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (r.includes("country_not_allowed") || r.includes("country") || r.includes("not_allowed")) {
    return "Phone verification isn't available in your region yet.";
  }
  if (r.startsWith("http_5") || r.includes("server_error") || r.includes("misconfigured") || r.includes("db_error")) {
    return "Couldn't send the code right now. Please try again in a moment.";
  }
  if (r === "network_error" || r.includes("fetch") || r.includes("networkerror")) {
    return "Network error. Check your connection and try again.";
  }
  return "Couldn't send the verification code. Please try again.";
}

function friendlyOtpVerifyError(raw: string): string {
  const r = String(raw || "").toLowerCase();
  if (r.includes("expired") || r.startsWith("http_401")) {
    return "Code expired. Request a new one and try again.";
  }
  if (r.startsWith("http_429") || r.includes("too_many") || r.includes("rate")) {
    return "Too many attempts. Please wait and request a new code.";
  }
  if (r.startsWith("http_5") || r.includes("server_error")) {
    return "Verification failed. Please try again.";
  }
  if (r === "network_error") {
    return "Network error. Check your connection and try again.";
  }
  // Default covers "invalid code", "wrong code", etc.
  return "Incorrect code. Check the SMS and try again.";
}

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
): Promise<{ ok: boolean; error?: string }> {
  const normalized = phone.trim();
  if (!normalized) return { ok: false, error: "Phone number is required." };
  if (!turnstileToken.trim()) return { ok: false, error: "Complete human verification first." };

  // Client-side country guard — UX only; server enforces authoritatively.
  if (!isPhoneCountryAllowed(normalized)) {
    return { ok: false, error: COUNTRY_NOT_ALLOWED_MESSAGE };
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
  const accessToken = String(session?.access_token || "").trim();

  if (hasSession) {
    // Authenticated path — send session token explicitly in x-huddle-access-token
    // while keeping anon Authorization for browser-safe gateway traversal.
    const res = await callPublic<SendResponse>(
      "send-phone-otp",
      {
        phone: normalized,
        device_id: deviceId,
        turnstile_token: turnstileToken,
        turnstile_action: "send_phone_otp",
      },
      accessToken,
    );
    data = res.data;
    errorMsg = res.error;
  } else {
    // Unauthenticated path — no JWT; edge function uses signInWithOtp
    const res = await callPublic<SendResponse>("send-phone-otp", {
      phone: normalized,
      device_id: deviceId,
      turnstile_token: turnstileToken,
      turnstile_action: "send_phone_otp",
    });
    data = res.data;
    errorMsg = res.error;
  }

  if (errorMsg || !data?.ok) {
    return { ok: false, error: friendlyOtpSendError(errorMsg ?? data?.error ?? "") };
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
    return { ok: false, error: "OTP code is required." };
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

  if (otpType === "phone_change") {
    // Authenticated path — JWT required by edge function for phone_change
    const res = await invokeAuthedFunction<VerifyResponse>("verify-phone-otp", {
      body: {
        phone:    normalizedPhone,
        token:    normalizedToken,
        otp_type: "phone_change",
        device_id: deviceId,
      },
    });
    if (res.error || !res.data?.ok) {
      errorMsg = res.error?.message ?? res.data?.error ?? "Invalid code";
    }
  } else {
    // Unauthenticated path — no JWT; edge function uses sms verifyOtp
    const res = await callPublic<VerifyResponse>("verify-phone-otp", {
      phone:    normalizedPhone,
      token:    normalizedToken,
      otp_type: "sms",
      device_id: deviceId,
    });
    if (res.error || !res.data?.ok) {
      errorMsg = res.error ?? res.data?.error ?? "Invalid code";
    }
  }

  if (errorMsg) return { ok: false, error: friendlyOtpVerifyError(errorMsg) };
  return { ok: true };
}
