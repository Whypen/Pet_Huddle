import AsyncStorage from "@react-native-async-storage/async-storage";
import { parsePhoneNumber } from "libphonenumber-js/min";
import { createFreshNativeFunctionHeaders, createNativeFunctionHeaders, getFreshNativeAccessToken, getFreshNativeSession } from "./nativeFunctionClient";
import { supabaseUrl } from "./supabase";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

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
  | "verification_required"
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

const allowedIsoCodes = new Set(
  String(process.env.EXPO_PUBLIC_ALLOWED_SMS_COUNTRY_CODES || process.env.VITE_ALLOWED_SMS_COUNTRY_CODES || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean),
);


const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizePhoneKey = (value: string) => String(value || "").trim().replace(/[^\d+]/g, "");

const readJwtSub = (token: string | null | undefined): string | null => {
  try {
    const payloadPart = String(token || "").trim().split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    if (typeof atob !== "function") return null;
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    const sub = String(payload.sub || "").trim();
    return sub || null;
  } catch {
    return null;
  }
};

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
  if (reasonCode === "verification_required") return { message: "Complete identity verification first.", unavailable: false };
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
    const sessionToken = await getFreshNativeAccessToken(accessToken);
    const requiresAuthenticatedUser =
      body && typeof body === "object" && (body as { verification_context?: unknown }).verification_context === "verify_identity";
    const headers = sessionToken
      ? await createFreshNativeFunctionHeaders(sessionToken, { functionName, routeToken: accessToken })
      : requiresAuthenticatedUser
        ? await createFreshNativeFunctionHeaders(accessToken, { functionName, routeToken: accessToken })
        : createNativeFunctionHeaders();
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: string; message?: string; public_message?: string; details?: unknown; reason_code?: unknown; retry_after?: unknown })
      | null;
    if (!response.ok) {
      return {
        data: null,
        details: payload?.details ?? payload,
        error: String(payload?.public_message || payload?.error || payload?.message || `http_${response.status}`),
        status: response.status,
      };
    }
    return { data: payload as T | null, details: payload?.details ?? payload, error: null, status: response.status };
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
  options: { verificationContext?: "verify_identity" } = {},
): Promise<{ cooldownSeconds?: number; error?: string; failureKind?: string; ok: boolean; retryAfterSeconds?: number; unavailable?: boolean }> {
  const normalized = phone.trim();
  const phoneKey = normalizePhoneKey(normalized);
  if (!normalized) return { ok: false, error: "Enter a valid phone number." };
  if (!turnstileToken.trim() && options.verificationContext !== "verify_identity") return { ok: false, error: "Please complete the verification first." };
  if (!isNativePhoneCountryAllowed(normalized)) return { ok: false, error: "Phone verification is not available yet.", unavailable: true };

  const [freshSession, deviceId] = await Promise.all([
    getFreshNativeSession(),
    getNativeOtpDeviceId(),
  ]);
  const sessionToken = freshSession?.accessToken || "";
  const sessionUserId = freshSession?.userId || readJwtSub(accessTokenOverride) || readJwtSub(sessionToken) || null;
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
      verification_context: options.verificationContext,
    },
    accessToken,
  );

  if (response.error || !response.data?.ok) {
    await clearStoredOtpChallenge();
    const details = response.details as NativeSendOtpErrorDetails | null | undefined;
    const mapped = mapSendOtpFailure(response.status, response.error ?? response.data?.error ?? "", details);
    return {
      ok: false,
      error: mapped.message,
      failureKind: details?.reason_code ?? response.error ?? response.data?.error,
      retryAfterSeconds: details?.retry_after,
      unavailable: mapped.unavailable,
    };
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
): Promise<{ error?: string; failureKind?: string; ok: boolean; retryAfterSeconds?: number }> {
  const normalizedPhone = phone.trim();
  const normalizedToken = token.trim();
  const phoneKey = normalizePhoneKey(normalizedPhone);
  if (!normalizedPhone || !normalizedToken) return { ok: false, error: "Enter the 6-digit code." };

  const [freshSession, challenge, deviceId] = await Promise.all([
    getFreshNativeSession(),
    readStoredOtpChallenge(),
    getNativeOtpDeviceId(),
  ]);
  const sessionToken = freshSession?.accessToken || "";
  const ownerId = freshSession?.userId || readJwtSub(accessTokenOverride) || readJwtSub(sessionToken) || null;
  const accessToken = sessionToken && (ownerId || accessTokenOverride) ? sessionToken : "";

  if (!challenge || challenge.phoneKey !== phoneKey || (challenge.ownerId !== null && challenge.ownerId !== ownerId)) {
    return { ok: false, error: "Your verification session expired. Request a new code.", failureKind: "challenge_expired" };
  }

  if (!accessToken) {
    await clearStoredOtpChallenge({ ownerId, phoneKey });
    return { ok: false, error: "Your verification session expired. Please sign in again.", failureKind: "session_expired" };
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
    return {
      ok: false,
      error: mapVerifyOtpFailure(response.status, response.error ?? response.data?.error ?? "", details),
      failureKind: details?.reason_code ?? response.error ?? response.data?.error,
      retryAfterSeconds: details?.retry_after,
    };
  }

  await clearStoredOtpChallenge({ ownerId, phoneKey });
  return { ok: true };
}
