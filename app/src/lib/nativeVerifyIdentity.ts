import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";
import { createNativeFunctionHeaders } from "./nativeFunctionClient";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";

export type NativeBackendVerificationStatus = "unverified" | "pending" | "verified";
export type NativeHumanVerificationStatus = "not_started" | "pending" | "passed" | "failed";
export type NativeCardVerificationStatus = "not_started" | "pending" | "passed" | "failed";
export type NativeVerificationRejectionCode = "blocked_identity" | null;
export type NativeStripeMode = "test" | "live";

export type NativeHumanChallenge = {
  challengeType: string;
  instruction: string;
  issuedAt: string;
  expiresInSec: number;
};

export type NativeBlockedIdentityState = {
  blocked: boolean;
  message: string | null;
};

export type NativeVerifyIdentitySnapshot = {
  verificationStatus: NativeBackendVerificationStatus;
  humanStatus: NativeHumanVerificationStatus;
  cardStatus: NativeCardVerificationStatus;
  cardVerified: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  legalName: string | null;
  cardFingerprintPresent: boolean;
  verificationRejectionCode: NativeVerificationRejectionCode;
  blockedIdentity: NativeBlockedIdentityState;
  cardLastError: NativeCardLastError | null;
  setupIntentId: string | null;
  publishableKey: string | null;
  humanAttemptId: string | null;
  humanAttemptCompletedAt: string | null;
  humanChallenge: NativeHumanChallenge | null;
};

export type NativeVerifyIdentityProfileStatus = {
  phone: string | null;
  phoneVerificationStatus: string | null;
  phoneVerifiedAt: string | null;
  verificationStatus: NativeBackendVerificationStatus;
  isVerified: boolean;
  legalName: string | null;
  humanStatus: NativeHumanVerificationStatus;
  cardStatus: NativeCardVerificationStatus;
  cardVerified: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
  verificationRejectionCode: NativeVerificationRejectionCode;
};

export type NativeStartHumanChallengeResult = {
  attemptId: string;
  challenge: NativeHumanChallenge;
  verificationStatus: NativeBackendVerificationStatus;
};

export type NativeCompleteHumanChallengePayload = {
  attemptId: string;
  status: "passed" | "failed";
  score?: number;
  resultPayload?: Record<string, unknown>;
  evidencePath?: string | null;
};

export type NativeCompleteHumanChallengeResult = {
  verificationStatus: NativeBackendVerificationStatus;
  humanStatus: NativeHumanVerificationStatus;
};

export type NativeCreateCardSetupIntentPayload = {
  attemptId?: string | null;
  legalName?: string | null;
  postalCode?: string | null;
  phone?: string | null;
};

export type NativeCardSetupIntentResult = {
  publishableKey: string;
  clientSecret: string;
  setupIntentId: string;
  stripeMode: NativeStripeMode | null;
  verificationStatus: NativeBackendVerificationStatus;
};

export type NativeCardLastError = {
  message?: string | null;
  code?: string | null;
};

export type NativeCardStatusResult = {
  cardStatus: NativeCardVerificationStatus;
  verificationStatus: NativeBackendVerificationStatus;
  cardBrand: string | null;
  cardLast4: string | null;
  legalName: string | null;
  cardFingerprintPresent: boolean;
  verificationRejectionCode: NativeVerificationRejectionCode;
  blockedIdentity: NativeBlockedIdentityState;
  setupIntentId: string | null;
  cardLastError: NativeCardLastError | null;
  publishableKey: string | null;
};

export type NativeDeviceFingerprintSource = "signup" | "login" | "verify_identity_entry" | "other";

export type NativeDeviceFingerprintPolicy = {
  idScope: "install_scoped";
  ownershipReady: false;
  primaryStorage: "expo-secure-store";
  resetBehavior: "cleared_on_app_data_reset_or_uninstall_best_effort";
  sourceMetadata: "native_device_context";
  submitFunction: "verify-device-fingerprint";
};

export type NativeDeviceFingerprintResult = {
  ok: boolean;
  ownershipReady: false;
  policy: "placeholder_not_ownership_ready";
  verificationStatus?: NativeBackendVerificationStatus | string | null;
  placeholderVisitorId?: string;
  error?: string;
};

export type NativeVerifyIdentitySupportIntent = {
  initialMessage: string;
  subject: "Identity verification support";
};

export type NativeVerifyIdentityUpdatedEvent = {
  snapshot?: NativeVerifyIdentitySnapshot | null;
  source: "snapshot" | "phone" | "human" | "card" | "device_fingerprint" | "manual";
};

export class NativeVerifyIdentityError extends Error {
  code: string;
  status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = "NativeVerifyIdentityError";
    this.code = code;
    this.status = status;
  }
}

type NativeFunctionEnvelope<T> = T & {
  details?: unknown;
  error?: unknown;
  message?: unknown;
  public_message?: unknown;
};

type NativeFunctionResult<T> = {
  data: T | null;
  details: unknown;
  error: string | null;
  status: number | null;
};

type NativeVerifyIdentitySession = {
  accessToken: string;
  userId: string;
};

type NativeHumanAttempt = {
  id?: unknown;
  completed_at?: unknown;
  challenge_payload?: unknown;
};

type NativeHumanSnapshotResponse = {
  verificationStatus?: unknown;
  humanStatus?: unknown;
  attempt?: NativeHumanAttempt | null;
};

type NativeHumanStartResponse = {
  verificationStatus?: unknown;
  attempt?: NativeHumanAttempt | null;
};

type NativeHumanCompleteResponse = {
  verificationStatus?: unknown;
  humanStatus?: unknown;
};

type NativeCardStatusResponse = {
  verificationStatus?: unknown;
  cardStatus?: unknown;
  cardVerified?: unknown;
  cardBrand?: unknown;
  cardLast4?: unknown;
  legalName?: unknown;
  cardFingerprintPresent?: unknown;
  verificationRejectionCode?: unknown;
  blockedIdentity?: Partial<NativeBlockedIdentityState> | null;
  setupIntentId?: unknown;
  publishableKey?: unknown;
  lastSetupError?: NativeCardLastError | null;
};

type NativeCardCreateResponse = {
  publishableKey?: unknown;
  clientSecret?: unknown;
  setupIntentId?: unknown;
  stripeMode?: unknown;
  verificationStatus?: unknown;
};

type NativeDeviceFingerprintResponse = {
  ok?: unknown;
  verificationStatus?: unknown;
};

type NativeFallbackProfile = {
  phone?: string | null;
  phone_verification_status?: string | null;
  phone_verified_at?: string | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  human_verification_status?: string | null;
  human_verified_at?: string | null;
  card_verification_status?: string | null;
  card_verified?: boolean | null;
  card_verified_at?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  stripe_setup_intent_id?: string | null;
  legal_name?: string | null;
  verification_rejection_code?: string | null;
};

const DEVICE_FINGERPRINT_STORAGE_KEY = "huddle_native_verify_identity_install_id_v1";
const LEGACY_DEVICE_FINGERPRINT_STORAGE_KEY = "huddle_native_verify_identity_device_fingerprint_placeholder_v1";
const PROFILE_STATUS_CACHE_VERSION = 2;
const PROFILE_STATUS_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const nativeVerifyIdentityUpdatedListeners = new Set<(event: NativeVerifyIdentityUpdatedEvent) => void>();
let nativeVerifyIdentitySessionFallback: NativeVerifyIdentitySession | null = null;
const nativeVerifyIdentityProfileStatusMemory = new Map<string, NativeVerifyIdentityProfileStatusCachePayload>();

type NativeVerifyIdentityProfileStatusCachePayload = NativeVerifyIdentityProfileStatus & {
  cachedAt: number;
  sessionKey: string;
  userId: string;
  version: number;
};

export const NATIVE_DEVICE_FINGERPRINT_POLICY: NativeDeviceFingerprintPolicy = {
  idScope: "install_scoped",
  ownershipReady: false,
  primaryStorage: "expo-secure-store",
  resetBehavior: "cleared_on_app_data_reset_or_uninstall_best_effort",
  sourceMetadata: "native_device_context",
  submitFunction: "verify-device-fingerprint",
};

export const NATIVE_BLOCKED_IDENTITY_SUPPORT_INTENT: NativeVerifyIdentitySupportIntent = {
  initialMessage: "I need help with identity verification.",
  subject: "Identity verification support",
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveNativeStripeMode = (): NativeStripeMode | null => {
  const value = normalize(process.env.EXPO_PUBLIC_STRIPE_LOCAL_MODE || process.env.VITE_STRIPE_LOCAL_MODE || "");
  if (value === "test" || value === "live") return value;
  return null;
};

const asStatus = (value: unknown, fallback: NativeBackendVerificationStatus = "unverified"): NativeBackendVerificationStatus => {
  const v = normalize(value);
  return v === "pending" || v === "verified" || v === "unverified" ? v : fallback;
};

const asHumanStatus = (value: unknown): NativeHumanVerificationStatus => {
  const v = normalize(value);
  return v === "pending" || v === "passed" || v === "failed" || v === "not_started" ? v : "not_started";
};

const asCardStatus = (value: unknown): NativeCardVerificationStatus => {
  const v = normalize(value);
  return v === "pending" || v === "passed" || v === "failed" || v === "not_started" ? v : "not_started";
};

const asVerificationRejectionCode = (value: unknown): NativeVerificationRejectionCode => {
  return normalize(value) === "blocked_identity" ? "blocked_identity" : null;
};

const asNullableString = (value: unknown): string | null => {
  return typeof value === "string" && value.trim() ? value : null;
};

const profileStatusSessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const profileStatusCacheKey = (userId: string, sessionKey?: string | null) =>
  `huddle_native_verify_identity_profile_status:v${PROFILE_STATUS_CACHE_VERSION}:${userId}:${profileStatusSessionKey(userId, sessionKey)}`;

const isFreshProfileStatusCache = (cachedAt: number) => Date.now() - cachedAt <= PROFILE_STATUS_CACHE_MAX_AGE_MS;

const isProfileStatusCachePayload = (
  value: Partial<NativeVerifyIdentityProfileStatusCachePayload>,
  userId: string,
  sessionKey: string,
): value is NativeVerifyIdentityProfileStatusCachePayload => {
  return (
    value.version === PROFILE_STATUS_CACHE_VERSION &&
    value.userId === userId &&
    value.sessionKey === sessionKey &&
    typeof value.cachedAt === "number" &&
    isFreshProfileStatusCache(value.cachedAt) &&
    (value.phone === null || typeof value.phone === "string") &&
    (value.phoneVerificationStatus === null || typeof value.phoneVerificationStatus === "string") &&
    (value.phoneVerifiedAt === null || typeof value.phoneVerifiedAt === "string") &&
    (value.legalName === null || typeof value.legalName === "string") &&
    typeof value.isVerified === "boolean"
  );
};

export const readCachedNativeVerifyIdentityProfileStatus = async (
  options: { sessionKey?: string | null; userId?: string | null } = {},
): Promise<NativeVerifyIdentityProfileStatus | null> => {
  const session = await getNativeVerifyIdentitySession();
  const userId = String(options.userId || session.userId).trim();
  const sessionKey = profileStatusSessionKey(userId, options.sessionKey);
  const key = profileStatusCacheKey(userId, sessionKey);
  const memory = nativeVerifyIdentityProfileStatusMemory.get(key);
  if (memory && isFreshProfileStatusCache(memory.cachedAt)) return memory;
  if (memory) nativeVerifyIdentityProfileStatusMemory.delete(key);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NativeVerifyIdentityProfileStatusCachePayload>;
    if (!isProfileStatusCachePayload(parsed, userId, sessionKey)) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    nativeVerifyIdentityProfileStatusMemory.set(key, parsed);
    return parsed;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => {});
    return null;
  }
};

const writeNativeVerifyIdentityProfileStatusCache = async (
  status: NativeVerifyIdentityProfileStatus,
  options: { sessionKey?: string | null; userId?: string | null } = {},
) => {
  const session = await getNativeVerifyIdentitySession();
  const userId = String(options.userId || session.userId).trim();
  const sessionKey = profileStatusSessionKey(userId, options.sessionKey);
  const payload: NativeVerifyIdentityProfileStatusCachePayload = {
    ...status,
    cachedAt: Date.now(),
    sessionKey,
    userId,
    version: PROFILE_STATUS_CACHE_VERSION,
  };
  nativeVerifyIdentityProfileStatusMemory.set(profileStatusCacheKey(userId, sessionKey), payload);
  await AsyncStorage.setItem(profileStatusCacheKey(userId, sessionKey), JSON.stringify(payload)).catch(() => {});
};

const asHumanChallenge = (value: unknown): NativeHumanChallenge | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<NativeHumanChallenge>;
  const challengeType = asNullableString(candidate.challengeType);
  const instruction = asNullableString(candidate.instruction);
  const issuedAt = asNullableString(candidate.issuedAt);
  const expiresInSec = Number(candidate.expiresInSec);
  if (!challengeType || !instruction || !issuedAt || !Number.isFinite(expiresInSec)) return null;
  return { challengeType, instruction, issuedAt, expiresInSec };
};

const mapNativeVerifyIdentityError = (
  raw: string | null | undefined,
  status: number | null = null,
): NativeVerifyIdentityError => {
  const code = normalize(raw) || "unknown_error";
  if (code.includes("auth_required") || code.includes("missing_token") || code.includes("auth_user_missing") || code.includes("unauthorized")) {
    return new NativeVerifyIdentityError(code, "Your session expired. Please sign in again.", status);
  }
  if (code.includes("missing_stripe_publishable_key")) {
    return new NativeVerifyIdentityError(code, "Card verification is not configured yet. Please contact support.", status);
  }
  if (code.includes("missing_stripe_secret_key")) {
    return new NativeVerifyIdentityError(code, "Card verification is temporarily unavailable.", status);
  }
  if (code.includes("missing_stripe_test_keys")) {
    return new NativeVerifyIdentityError(code, "Card verification test keys are not configured.", status);
  }
  if (code.includes("your request was in test mode") || code.includes("test mode, but used a non test card")) {
    return new NativeVerifyIdentityError(code, "This card only works in live mode. In local testing, use a Stripe test card.", status);
  }
  if (code.includes("missing_stripe_keys")) {
    return new NativeVerifyIdentityError(code, "Card verification keys are not configured.", status);
  }
  if (code.includes("missing_visitor_id")) {
    return new NativeVerifyIdentityError(code, "We couldn't read your device signature. Please try again.", status);
  }
  if (code.includes("profile_not_ready")) {
    return new NativeVerifyIdentityError(code, "Finish profile setup first, then continue verification.", status);
  }
  if (code.includes("challenge_expired")) {
    return new NativeVerifyIdentityError(code, "Your verification challenge expired. Start a new check.", status);
  }
  if (code.includes("invalid_transition")) {
    return new NativeVerifyIdentityError(code, "Verification session is no longer active. Please start again.", status);
  }
  if (code.includes("invalid_verification_result")) {
    return new NativeVerifyIdentityError(code, "We couldn't confirm your human check. Please try again with your face centered in the oval.", status);
  }
  if (code.includes("face_detector_unsupported")) {
    return new NativeVerifyIdentityError(code, "This device does not support the camera verification check.", status);
  }
  if (code.includes("attempt_not_found")) {
    return new NativeVerifyIdentityError(code, "Verification session expired. Please start again.", status);
  }
  if (code.includes("card_setup_timeout") || code.includes("stripe_timeout")) {
    return new NativeVerifyIdentityError(code, "Card setup is taking too long. Please try again.", status);
  }
  if (code.includes("http_503") || code.includes("service temporarily unavailable") || code.includes("503")) {
    return new NativeVerifyIdentityError(code, "Verification service is temporarily busy. Please retry in a moment.", status);
  }
  if (code.includes("notallowederror") || code.includes("permission")) {
    return new NativeVerifyIdentityError(code, "Camera access is required for human verification.", status);
  }
  return new NativeVerifyIdentityError(code, "We couldn't complete verification. Please retry.", status);
};

const getNativeVerifyIdentitySession = async (): Promise<NativeVerifyIdentitySession> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = String(session?.access_token || "").trim();
  const userId = String(session?.user?.id || "").trim();
  if (accessToken && userId) return { accessToken, userId };
  if (nativeVerifyIdentitySessionFallback?.accessToken && nativeVerifyIdentitySessionFallback.userId) {
    return nativeVerifyIdentitySessionFallback;
  }
  throw mapNativeVerifyIdentityError("auth_required", 401);
};

export const setNativeVerifyIdentitySessionFallback = (session: Session | null | undefined): void => {
  const accessToken = String(session?.access_token || "").trim();
  const userId = String(session?.user?.id || "").trim();
  nativeVerifyIdentitySessionFallback = accessToken && userId ? { accessToken, userId } : null;
};

const postNativeVerifyIdentityFunction = async <T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<NativeFunctionResult<T>> => {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: createNativeFunctionHeaders(accessToken),
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as NativeFunctionEnvelope<T> | null;
    if (!response.ok) {
      return {
        data: null,
        details: payload?.details ?? payload ?? null,
        error: String(payload?.public_message || payload?.error || payload?.message || `http_${response.status}`),
        status: response.status,
      };
    }
    return { data: payload as T | null, details: payload?.details ?? null, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      details: null,
      error: error instanceof Error ? error.message : "network_error",
      status: null,
    };
  }
};

const isTransient503 = (result: NativeFunctionResult<unknown>): boolean => {
  if (result.status === 503) return true;
  const error = normalize(result.error);
  return error.includes("http_503") || error.includes("service temporarily unavailable") || error.includes("503");
};

const invokeWithTransient503Retry = async <T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
  retries = 1,
): Promise<NativeFunctionResult<T>> => {
  let attempt = 0;
  let latest = await postNativeVerifyIdentityFunction<T>(functionName, body, accessToken);
  while (attempt < retries && isTransient503(latest as NativeFunctionResult<unknown>)) {
    attempt += 1;
    await sleep(350 * Math.pow(2, attempt) + Math.floor(Math.random() * 120));
    latest = await postNativeVerifyIdentityFunction<T>(functionName, body, accessToken);
  }
  return latest;
};

const throwIfFunctionError = <T>(result: NativeFunctionResult<T>): T => {
  if (result.error) throw mapNativeVerifyIdentityError(result.error, result.status);
  if (!result.data) throw mapNativeVerifyIdentityError("empty_response", result.status);
  return result.data;
};

const toCardStatusResult = (data: NativeCardStatusResponse): NativeCardStatusResult => ({
  cardStatus: asCardStatus(data.cardStatus),
  verificationStatus: asStatus(data.verificationStatus),
  cardBrand: asNullableString(data.cardBrand),
  cardLast4: asNullableString(data.cardLast4),
  legalName: asNullableString(data.legalName),
  cardFingerprintPresent: Boolean(data.cardFingerprintPresent),
  verificationRejectionCode: asVerificationRejectionCode(data.verificationRejectionCode),
  blockedIdentity: {
    blocked: Boolean(data.blockedIdentity?.blocked),
    message: typeof data.blockedIdentity?.message === "string" ? data.blockedIdentity.message : null,
  },
  setupIntentId: asNullableString(data.setupIntentId),
  cardLastError: data.lastSetupError ?? null,
  publishableKey: asNullableString(data.publishableKey),
});

const profileToCardStatusResponse = (profile: NativeFallbackProfile): NativeCardStatusResponse => ({
  verificationStatus: profile.verification_status ?? "unverified",
  cardStatus: profile.card_verification_status ?? "not_started",
  cardVerified: Boolean(profile.card_verified),
  cardBrand: profile.card_brand ?? null,
  cardLast4: profile.card_last4 ?? null,
  legalName: profile.legal_name ?? null,
  verificationRejectionCode: profile.verification_rejection_code ?? null,
  blockedIdentity: {
    blocked: profile.verification_rejection_code === "blocked_identity",
    message: profile.verification_rejection_code === "blocked_identity"
      ? "Card is already used by another account."
      : null,
  },
  cardFingerprintPresent: false,
  setupIntentId: profile.stripe_setup_intent_id ?? null,
  publishableKey: null,
});

const fetchVerifyIdentityProfileSnapshot = async (accessToken: string): Promise<NativeFallbackProfile | null> => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_native_verify_identity_profile_snapshot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok || !parsed || typeof parsed !== "object") return null;
  return parsed as NativeFallbackProfile;
};

const fetchCardStatusFallbackProfile = async (accessToken: string): Promise<NativeCardStatusResponse | null> => {
  const data = await fetchVerifyIdentityProfileSnapshot(accessToken);
  return data ? profileToCardStatusResponse(data) : null;
};

export const fetchNativeVerifyIdentitySnapshot = async (): Promise<NativeVerifyIdentitySnapshot> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  const stripeMode = resolveNativeStripeMode();
  const [humanResult, cardResult] = await Promise.all([
    invokeWithTransient503Retry<NativeHumanSnapshotResponse>("verify-human-challenge", { action: "get" }, accessToken),
    invokeWithTransient503Retry<NativeCardStatusResponse>("create-identity-setup-intent", { action: "status", stripeMode }, accessToken),
  ]);

  if (humanResult.error) throw mapNativeVerifyIdentityError(humanResult.error, humanResult.status);
  const humanData = humanResult.data ?? {};
  let cardData = cardResult.data ?? {};
  if (cardResult.error) {
    const fallback = await fetchCardStatusFallbackProfile(accessToken);
    if (!fallback) throw mapNativeVerifyIdentityError(cardResult.error, cardResult.status);
    cardData = fallback;
  }

  const card = toCardStatusResult(cardData);
  const humanAttempt = humanData.attempt ?? null;

  return {
    verificationStatus: asStatus(humanData.verificationStatus ?? card.verificationStatus),
    humanStatus: asHumanStatus(humanData.humanStatus),
    cardStatus: card.cardStatus,
    cardVerified: Boolean(cardData.cardVerified),
    cardBrand: card.cardBrand,
    cardLast4: card.cardLast4,
    legalName: card.legalName,
    cardFingerprintPresent: card.cardFingerprintPresent,
    verificationRejectionCode: card.verificationRejectionCode,
    blockedIdentity: card.blockedIdentity,
    cardLastError: card.cardLastError,
    setupIntentId: card.setupIntentId,
    publishableKey: card.publishableKey,
    humanAttemptId: asNullableString(humanAttempt?.id),
    humanAttemptCompletedAt: asNullableString(humanAttempt?.completed_at),
    humanChallenge: asHumanChallenge(humanAttempt?.challenge_payload),
  };
};

export const fetchNativeVerifyIdentityProfileStatus = async (
  options: { force?: boolean; sessionKey?: string | null; userId?: string | null } = {},
): Promise<NativeVerifyIdentityProfileStatus> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  if (!options.force) {
    const cached = await readCachedNativeVerifyIdentityProfileStatus(options);
    if (cached) return cached;
  }
  const profile = await fetchVerifyIdentityProfileSnapshot(accessToken);
  if (!profile) throw mapNativeVerifyIdentityError("profile_not_ready");
  const profileVerified = isNativeVerifiedProfile(profile);
  const phoneVerificationStatus = profile.phone_verified_at
    ? "verified"
    : asNullableString(profile.phone_verification_status);
  const humanStatus = profile.human_verified_at
    ? "passed"
    : asHumanStatus(profile.human_verification_status);
  const cardVerified = Boolean(profile.card_verified || profile.card_verified_at);
  const cardStatus = cardVerified
    ? "passed"
    : asCardStatus(profile.card_verification_status);
  const status = {
    phone: asNullableString(profile.phone),
    phoneVerificationStatus,
    phoneVerifiedAt: asNullableString(profile.phone_verified_at),
    verificationStatus: profileVerified ? "verified" as const : asStatus(profile.verification_status),
    isVerified: profileVerified,
    legalName: asNullableString(profile.legal_name),
    humanStatus,
    cardStatus,
    cardVerified,
    cardBrand: asNullableString(profile.card_brand),
    cardLast4: asNullableString(profile.card_last4),
    verificationRejectionCode: asVerificationRejectionCode(profile.verification_rejection_code),
  };
  await writeNativeVerifyIdentityProfileStatusCache(status, options);
  return status;
};

export const startNativeHumanChallenge = async (): Promise<NativeStartHumanChallengeResult> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  const data = throwIfFunctionError(
    await invokeWithTransient503Retry<NativeHumanStartResponse>("verify-human-challenge", { action: "start" }, accessToken),
  );
  const attemptId = asNullableString(data.attempt?.id);
  const challenge = asHumanChallenge(data.attempt?.challenge_payload);
  if (!attemptId || !challenge) throw mapNativeVerifyIdentityError("invalid_human_challenge_response");
  return {
    attemptId,
    challenge,
    verificationStatus: asStatus(data.verificationStatus),
  };
};

export const completeNativeHumanChallenge = async (
  payload: NativeCompleteHumanChallengePayload,
): Promise<NativeCompleteHumanChallengeResult> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  const attemptId = String(payload.attemptId || "").trim();
  if (!attemptId) throw mapNativeVerifyIdentityError("missing_attempt_id", 400);
  const data = throwIfFunctionError(
    await invokeWithTransient503Retry<NativeHumanCompleteResponse>(
      "verify-human-challenge",
      {
        action: "complete",
        attemptId,
        status: payload.status,
        score: payload.score ?? null,
        resultPayload: payload.resultPayload || {},
        evidencePath: payload.evidencePath ?? null,
      },
      accessToken,
    ),
  );
  return {
    verificationStatus: asStatus(data.verificationStatus),
    humanStatus: asHumanStatus(data.humanStatus),
  };
};

export const createNativeCardSetupIntent = async (
  payload: NativeCreateCardSetupIntentPayload = {},
): Promise<NativeCardSetupIntentResult> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  const stripeMode = resolveNativeStripeMode();
  const data = throwIfFunctionError(
    await invokeWithTransient503Retry<NativeCardCreateResponse>(
      "create-identity-setup-intent",
      {
        action: "create",
        stripeMode,
        attemptId: payload.attemptId || null,
        legalName: String(payload.legalName || "").trim() || null,
        postalCode: String(payload.postalCode || "").trim() || null,
        phone: String(payload.phone || "").trim() || null,
      },
      accessToken,
    ),
  );
  const publishableKey = asNullableString(data.publishableKey);
  const clientSecret = asNullableString(data.clientSecret);
  const setupIntentId = asNullableString(data.setupIntentId);
  if (!publishableKey || !clientSecret || !setupIntentId) throw mapNativeVerifyIdentityError("invalid_setup_intent_payload");
  return {
    publishableKey,
    clientSecret,
    setupIntentId,
    stripeMode: normalize(data.stripeMode) === "test" || normalize(data.stripeMode) === "live"
      ? normalize(data.stripeMode) as NativeStripeMode
      : null,
    verificationStatus: asStatus(data.verificationStatus),
  };
};

export const fetchNativeCardStatus = async (): Promise<NativeCardStatusResult> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  const stripeMode = resolveNativeStripeMode();
  const data = throwIfFunctionError(
    await invokeWithTransient503Retry<NativeCardStatusResponse>("create-identity-setup-intent", { action: "status", stripeMode }, accessToken),
  );
  return toCardStatusResult(data);
};

export const emitNativeVerifyIdentityUpdated = (
  event: NativeVerifyIdentityUpdatedEvent = { source: "manual" },
) => {
  nativeVerifyIdentityUpdatedListeners.forEach((listener) => listener(event));
};

export const subscribeNativeVerifyIdentityUpdated = (
  listener: (event: NativeVerifyIdentityUpdatedEvent) => void,
) => {
  nativeVerifyIdentityUpdatedListeners.add(listener);
  return () => {
    nativeVerifyIdentityUpdatedListeners.delete(listener);
  };
};

export const refreshNativeVerifyIdentityProfileCache = async (options: { accessToken?: string | null; sessionKey?: string | null; userId?: string | null } = {}): Promise<boolean> => {
  try {
    const userId = String(options.userId || "").trim();
    const accessToken = String(options.accessToken || "").trim();
    if (!userId || !accessToken) return false;
    await fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey: options.sessionKey });
    return true;
  } catch {
    return false;
  }
};

const getNativeDeviceFingerprintPlaceholder = async (): Promise<string> => {
  const existing = await SecureStore.getItemAsync(DEVICE_FINGERPRINT_STORAGE_KEY).catch(() => null);
  if (existing) return existing;

  const legacy = await AsyncStorage.getItem(LEGACY_DEVICE_FINGERPRINT_STORAGE_KEY).catch(() => null);
  if (legacy) {
    await SecureStore.setItemAsync(DEVICE_FINGERPRINT_STORAGE_KEY, legacy).catch(() => {});
    await AsyncStorage.removeItem(LEGACY_DEVICE_FINGERPRINT_STORAGE_KEY).catch(() => {});
    return legacy;
  }

  const generated = `native-install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  await SecureStore.setItemAsync(DEVICE_FINGERPRINT_STORAGE_KEY, generated).catch(() => {});
  return generated;
};

const getNativeDeviceUserAgent = (): string => {
  const parts = [
    "HuddleNative",
    Device.osName,
    Device.osVersion,
    Device.brand,
    Device.manufacturer,
    Device.modelName,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  return parts.join(" / ");
};

export const trackNativeDeviceFingerprintPlaceholder = async (
  source: NativeDeviceFingerprintSource = "verify_identity_entry",
): Promise<NativeDeviceFingerprintResult> => {
  try {
    const { accessToken } = await getNativeVerifyIdentitySession();
    const visitorId = await getNativeDeviceFingerprintPlaceholder();
    const result = await invokeWithTransient503Retry<NativeDeviceFingerprintResponse>(
      "verify-device-fingerprint",
      {
        visitorId,
        source,
        userAgent: getNativeDeviceUserAgent(),
        nativeMetadata: {
          idScope: NATIVE_DEVICE_FINGERPRINT_POLICY.idScope,
          ownershipReady: NATIVE_DEVICE_FINGERPRINT_POLICY.ownershipReady,
          storage: NATIVE_DEVICE_FINGERPRINT_POLICY.primaryStorage,
        },
      },
      accessToken,
    );
    if (result.error) {
      return {
        ok: false,
        ownershipReady: false,
        policy: "placeholder_not_ownership_ready",
        placeholderVisitorId: visitorId,
        error: mapNativeVerifyIdentityError(result.error, result.status).message,
      };
    }
    return {
      ok: Boolean(result.data?.ok),
      ownershipReady: false,
      policy: "placeholder_not_ownership_ready",
      verificationStatus: result.data?.verificationStatus == null ? null : String(result.data.verificationStatus),
      placeholderVisitorId: visitorId,
    };
  } catch (error) {
    return {
      ok: false,
      ownershipReady: false,
      policy: "placeholder_not_ownership_ready",
      error: error instanceof NativeVerifyIdentityError ? error.message : "We couldn't read your device signature. Please try again.",
    };
  }
};

export const trackNativeDeviceFingerprint = trackNativeDeviceFingerprintPlaceholder;
