import AsyncStorage from "@react-native-async-storage/async-storage";
import { parsePhoneNumber } from "libphonenumber-js/min";
import { createNativeFunctionHeaders } from "./nativeFunctionClient";
import { supabase, supabaseUrl } from "./supabase";

type NativeOtpRateLimitReason =
  | "resend_cooldown"
  | "phone_daily_cap"
  | "user_daily_cap"
  | "ip_daily_cap";

type NativeSendOtpReasonCode =
  | "provider_config_error"
  | "sms_region_blocked"
  | "rate_limited"
  | "already_verified"
  | "user_not_found"
  | "phone_in_use"
  | "invalid_phone"
  | "session_missing"
  | "provider_send_failed";

type NativeVerifyOtpReasonCode =
  | "invalid_code"
  | "expired_code"
  | "code_already_used"
  | "phone_mismatch"
  | "challenge_missing"
  | "challenge_expired"
  | "session_missing"
  | "too_many_incorrect_attempts"
  | "verify_failed";

type NativeSendOtpErrorDetails = {
  error?: string;
  rate_limit_reason?: NativeOtpRateLimitReason;
  reason_code?: NativeSendOtpReasonCode;
  retry_after?: number;
};

type NativeVerifyOtpErrorDetails = {
  error?: string;
  reason_code?: NativeVerifyOtpReasonCode;
  retry_after?: number;
};

type NativeStoredOtpChallenge = {
  challengeId: string;
  createdAt: string;
  expiresAt: string | null;
  otpType: "sms";
  ownerId: string | null;
  phoneKey: string;
};

const OTP_CHALLENGE_STORAGE_KEY = "huddle_native_phone_otp_challenge_v1";
const DEVICE_ID_STORAGE_KEY = "huddle_native_phone_otp_device_id_v1";
const TEST_OTP_SHORTCUT_CODE = "498005";

const allowedIsoCodes = new Set(
  String(process.env.EXPO_PUBLIC_ALLOWED_SMS_COUNTRY_CODES || process.env.VITE_ALLOWED_SMS_COUNTRY_CODES || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
);

const testShortcutEnabled = String(process.env.EXPO_PUBLIC_TEST_OTP_SHORTCUT || process.env.VITE_TEST_OTP_SHORTCUT || "").toLowerCase() === "true";

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizePhoneKey = (value: string) => String(value || "").trim().replace(/[^\d+]/g, "");

export function isNativePhoneCountryAllowed(phone: string): boolean {
  if (allowedIsoCodes.size === 0) return true;
  try {
    const parsed = parsePhoneNumber(phone);
    return Boolean(parsed?.isValid() && parsed.country && allowedIsoCodes.has(parsed.country));
  } catch {
    return false;
  }
}

export function maskNativePhoneForOtpNotice(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone.trim();
  return `${phone.trim().slice(0, 4)}••••${digits.slice(-4)}`;
}

async function getNativeOtpDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY).catch(() => null);
  if (existing) return existing;
  const generated = `native-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, generated).catch(() => {});
  return generated;
}

async function readStoredOtpChallenge(): Promise<NativeStoredOtpChallenge | null> {
  try {
    const raw = await AsyncStorage.getItem(OTP_CHALLENGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativeStoredOtpChallenge> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const challengeId = String(parsed.challengeId || "").trim();
    const phoneKey = normalizePhoneKey(String(parsed.phoneKey || ""));
    const ownerId = parsed.ownerId ? String(parsed.ownerId) : null;
    const createdAt = String(parsed.createdAt || "");
    const expiresAt = parsed.expiresAt ? String(parsed.expiresAt) : null;
    if (!challengeId || parsed.otpType !== "sms" || !phoneKey) return null;
    return { challengeId, otpType: "sms", phoneKey, ownerId, createdAt, expiresAt };
  } catch {
    return null;
  }
}

async function writeStoredOtpChallenge(state: NativeStoredOtpChallenge) {
  await AsyncStorage.setItem(OTP_CHALLENGE_STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

async function clearStoredOtpChallenge(expected?: { ownerId: string | null; phoneKey: string }) {
  if (!expected) {
    await AsyncStorage.removeItem(OTP_CHALLENGE_STORAGE_KEY).catch(() => {});
    return;
  }
  const current = await readStoredOtpChallenge();
  if (current?.ownerId === expected.ownerId && current.phoneKey === expected.phoneKey) {
    await AsyncStorage.removeItem(OTP_CHALLENGE_STORAGE_KEY).catch(() => {});
  }
}

const formatRetryWindow = (seconds: number): string => {
  const clamped = Math.max(0, Number(seconds || 0));
  if (clamped < 60) return `Please try again in ${clamped}s.`;
  if (clamped < 3600) return `Please try again in ${Math.ceil(clamped / 60)} min.`;
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.ceil((clamped % 3600) / 60);
  return minutes <= 0 ? `Please try again in ${hours}h.` : `Please try again in ${hours}h ${minutes}min.`;
};

const mapOtpRateLimitedMessage = (reason: string | null | undefined, retryAfterSeconds: number | null | undefined): string => {
  const retryAfter = Math.max(0, Number(retryAfterSeconds || 0));
  const normalizedReason = normalize(reason);
  if (normalizedReason === "resend_cooldown") return formatRetryWindow(retryAfter);
  return `Too many verification attempts were made. ${formatRetryWindow(retryAfter)}`;
};

const mapSendOtpFailure = (
  statusCode: number | null,
  rawMessage: string | null | undefined,
  details: NativeSendOtpErrorDetails | null | undefined,
): { message: string; unavailable: boolean } => {
  const reasonCode = normalize(details?.reason_code);
  const raw = normalize(rawMessage);
  if (statusCode === 429) return { message: mapOtpRateLimitedMessage(details?.rate_limit_reason, details?.retry_after), unavailable: false };
  if (statusCode === 401 || raw.includes("unauthorized") || raw.includes("jwt") || raw.includes("auth_required")) return { message: "Please sign in again and try once more.", unavailable: false };
  if (reasonCode === "phone_in_use" || raw.includes("already used by another account") || raw.includes("already in use") || raw.includes("already been registered")) return { message: "This phone number is already used by another account.", unavailable: false };
  if (reasonCode === "invalid_phone" || raw.includes("invalid phone")) return { message: "Enter a valid phone number.", unavailable: false };
  if (statusCode === 403 && (raw.includes("turnstile") || raw.includes("human_verification"))) return { message: "Please complete the verification first.", unavailable: false };
  if (reasonCode === "already_verified") return { message: "This number is already verified for your account.", unavailable: false };
  if (reasonCode === "sms_region_blocked") return { message: "Phone verification is temporarily unavailable.", unavailable: true };
  if (reasonCode === "provider_config_error" || reasonCode === "provider_send_failed") return { message: "Phone verification is temporarily unavailable. Please try again later.", unavailable: true };
  if (raw.includes("country") && raw.includes("unavailable")) return { message: "Phone verification is not available yet.", unavailable: true };
  if (raw === "network_error" || raw.includes("fetch") || raw.includes("networkerror")) return { message: "Phone verification is temporarily unavailable. Please try again later.", unavailable: false };
  return { message: "Phone verification is temporarily unavailable. Please try again later.", unavailable: false };
};

const mapVerifyOtpFailure = (
  statusCode: number | null,
  rawMessage: string | null | undefined,
  details: NativeVerifyOtpErrorDetails | null | undefined,
): string => {
  const reasonCode = normalize(details?.reason_code);
  const raw = normalize(rawMessage);
  if (reasonCode === "invalid_code" || raw.includes("invalid")) return "Incorrect code. Please try again.";
  if (statusCode === 429 || reasonCode === "too_many_incorrect_attempts") return "Too many incorrect attempts. Request a new code.";
  if (reasonCode === "expired_code" || raw.includes("expired")) return "This code has expired. Request a new code.";
  if (reasonCode === "code_already_used" || raw.includes("already used")) return "This code has already been used. Request a new code.";
  if (reasonCode === "phone_mismatch" || raw.includes("match this phone") || raw.includes("phone mismatch")) return "This code does not match this phone number.";
  if (reasonCode === "challenge_missing" || reasonCode === "challenge_expired") return "Your verification session expired. Request a new code.";
  if (reasonCode === "session_missing" || statusCode === 401 || raw.includes("unauthorized") || raw.includes("session")) return "Your verification session expired. Request a new code.";
  if (raw === "network_error" || raw.includes("fetch") || raw.includes("load failed") || raw.includes("networkerror") || raw.includes("failed to fetch")) return "We couldn't verify the code right now. Please try again.";
  if (statusCode !== null && statusCode >= 500) return "We couldn't verify the code right now. Please try again.";
  return "We couldn't verify the code right now. Please try again.";
};

async function postNativeOtpFunction<T>(functionName: string, body: unknown, accessToken?: string) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: createNativeFunctionHeaders(accessToken),
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: string; message?: string; public_message?: string; details?: unknown })
      | null;
    if (!response.ok) {
      return {
        data: null,
        details: payload?.details,
        error: String(payload?.public_message || payload?.error || payload?.message || `http_${response.status}`),
        status: response.status,
      };
    }
    return { data: payload as T | null, details: payload?.details, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      details: null,
      error: error instanceof Error ? error.message : "network_error",
      status: null,
    };
  }
}

export async function requestNativePhoneOtp(
  phone: string,
  turnstileToken: string,
  accessTokenOverride?: string | null,
): Promise<{ cooldownSeconds?: number; error?: string; ok: boolean; unavailable?: boolean }> {
  const normalized = phone.trim();
  const phoneKey = normalizePhoneKey(normalized);
  if (!normalized) return { ok: false, error: "Enter a valid phone number." };
  if (!turnstileToken.trim()) return { ok: false, error: "Please complete the verification first." };
  if (!isNativePhoneCountryAllowed(normalized)) return { ok: false, error: "Phone verification is not available yet.", unavailable: true };

  if (testShortcutEnabled) {
    await writeStoredOtpChallenge({ challengeId: "test-shortcut", otpType: "sms", phoneKey, ownerId: null, createdAt: new Date().toISOString(), expiresAt: null });
    return { ok: true, cooldownSeconds: 90 };
  }

  const [{ data: sessionData }, deviceId] = await Promise.all([
    supabase.auth.getSession(),
    getNativeOtpDeviceId(),
  ]);
  const sessionToken = String(accessTokenOverride || sessionData.session?.access_token || "").trim();
  const sessionUserId = String(sessionData.session?.user?.id || "").trim() || null;
  const accessToken = sessionToken && (sessionUserId || accessTokenOverride) ? sessionToken : "";

  type NativeSendResponse = {
    challenge_id: string;
    cooldown_seconds?: number;
    error?: string;
    expires_at?: string | null;
    ok: boolean;
    otp_type: "sms";
  };

  const response = await postNativeOtpFunction<NativeSendResponse>(
    "send-phone-otp",
    {
      device_id: deviceId,
      phone: normalized,
      turnstile_action: "send_pre_signup_verify",
      turnstile_token: turnstileToken,
    },
    accessToken,
  );

  if (response.error || !response.data?.ok) {
    await clearStoredOtpChallenge();
    const mapped = mapSendOtpFailure(response.status, response.error ?? response.data?.error ?? "", response.details as NativeSendOtpErrorDetails | null | undefined);
    return { ok: false, error: mapped.message, unavailable: mapped.unavailable };
  }

  if (!response.data.challenge_id) {
    await clearStoredOtpChallenge();
    return { ok: false, error: "We couldn't prepare phone verification. Request a new code." };
  }

  await writeStoredOtpChallenge({
    challengeId: response.data.challenge_id,
    otpType: response.data.otp_type ?? "sms",
    phoneKey,
    ownerId: sessionUserId,
    createdAt: new Date().toISOString(),
    expiresAt: response.data.expires_at ?? null,
  });
  return { ok: true, cooldownSeconds: Math.max(0, Number(response.data.cooldown_seconds || 0)) || 90 };
}

export async function verifyNativePhoneOtp(
  phone: string,
  token: string,
  accessTokenOverride?: string | null,
): Promise<{ error?: string; ok: boolean }> {
  const normalizedPhone = phone.trim();
  const normalizedToken = token.trim();
  const phoneKey = normalizePhoneKey(normalizedPhone);
  if (!normalizedPhone || !normalizedToken) return { ok: false, error: "Enter the 6-digit code." };

  if (testShortcutEnabled) {
    return normalizedToken === TEST_OTP_SHORTCUT_CODE ? { ok: true } : { ok: false, error: "Invalid code" };
  }

  const [{ data: sessionData }, challenge, deviceId] = await Promise.all([
    supabase.auth.getSession(),
    readStoredOtpChallenge(),
    getNativeOtpDeviceId(),
  ]);
  const sessionToken = String(accessTokenOverride || sessionData.session?.access_token || "").trim();
  const ownerId = String(sessionData.session?.user?.id || "").trim() || null;
  const accessToken = sessionToken && (ownerId || accessTokenOverride) ? sessionToken : "";

  if (!challenge || challenge.phoneKey !== phoneKey || (challenge.ownerId !== null && challenge.ownerId !== ownerId)) {
    return { ok: false, error: "Your verification session expired. Request a new code." };
  }

  if (!accessToken) {
    await clearStoredOtpChallenge({ ownerId, phoneKey });
    return { ok: false, error: "Your verification session expired. Please sign in again." };
  }

  type NativeVerifyResponse = { error?: string; ok: boolean };
  const response = await postNativeOtpFunction<NativeVerifyResponse>(
    "verify-phone-otp",
    {
      challenge_id: challenge.challengeId,
      device_id: deviceId,
      otp_type: "sms",
      phone: normalizedPhone,
      token: normalizedToken,
    },
    accessToken,
  );

  if (response.error || !response.data?.ok) {
    const details = response.details as NativeVerifyOtpErrorDetails | null | undefined;
    const reasonCode = normalize(details?.reason_code);
    if (
      reasonCode === "challenge_missing" ||
      reasonCode === "challenge_expired" ||
      reasonCode === "session_missing" ||
      reasonCode === "code_already_used"
    ) {
      await clearStoredOtpChallenge({ ownerId, phoneKey });
    }
    return { ok: false, error: mapVerifyOtpFailure(response.status, response.error ?? response.data?.error ?? "", details) };
  }

  await clearStoredOtpChallenge({ ownerId, phoneKey });
  return { ok: true };
}
