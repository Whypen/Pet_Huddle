import { supabase } from "@/integrations/supabase/client";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";
import { getVisitorId } from "@/lib/deviceFingerprint";
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

// ── Module-level OTP type ─────────────────────────────────────────────────────
// Set by requestPhoneOtp from the send-phone-otp response.
// Read by verifyPhoneOtp so the correct type is forwarded to verify-phone-otp.
// Default "phone_change": all VerifyIdentity and EditProfile flows are
// authenticated, so this default is correct if send is never called first.

let lastOtpType: "phone_change" | "sms" = "phone_change";

// ── Raw fetch for the unauthenticated (sms) path ─────────────────────────────
// invokeAuthedFunction requires a session and will return auth_required when
// none exists. The unauthenticated path (phone-login users) has no session,
// so we call the edge function directly with only the anon key.

const EDGE_BASE = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "") + "/functions/v1";
const ANON_KEY  = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");

async function callAnon<T>(
  fn: string,
  body: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${EDGE_BASE}/${fn}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body:    JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null) as { error?: string } & T | null;
    if (!res.ok) {
      return { data: null, error: payload?.error ?? `http_${res.status}` };
    }
    return { data: payload as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── requestPhoneOtp ───────────────────────────────────────────────────────────
// Canonical send path. Calls send-phone-otp edge function which:
//   • checks DB rate limits before touching Supabase Auth
//   • logs every attempt to phone_otp_attempts
//   • returns otp_type so verifyPhoneOtp uses the correct verify type

export async function requestPhoneOtp(
  phone: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = phone.trim();
  if (!normalized) return { ok: false, error: "Phone number is required." };

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

  if (hasSession) {
    // Authenticated path — invokeAuthedFunction injects JWT and handles refresh
    const res = await invokeAuthedFunction<SendResponse>("send-phone-otp", {
      body: { phone: normalized, device_id: deviceId },
    });
    data     = res.data;
    errorMsg = res.error?.message ?? null;
  } else {
    // Unauthenticated path — no JWT; edge function uses signInWithOtp
    const res = await callAnon<SendResponse>("send-phone-otp", {
      phone: normalized, device_id: deviceId,
    });
    data     = res.data;
    errorMsg = res.error;
  }

  if (errorMsg || !data?.ok) {
    return { ok: false, error: errorMsg ?? "Failed to send OTP." };
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
    const res = await callAnon<VerifyResponse>("verify-phone-otp", {
      phone:    normalizedPhone,
      token:    normalizedToken,
      otp_type: "sms",
      device_id: deviceId,
    });
    if (res.error || !res.data?.ok) {
      errorMsg = res.error ?? res.data?.error ?? "Invalid code";
    }
  }

  if (errorMsg) return { ok: false, error: errorMsg };
  return { ok: true };
}
