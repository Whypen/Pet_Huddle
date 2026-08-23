import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheKeys } from "./nativeDisplayCacheStorage";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";
import { createFreshNativeFunctionHeaders, createNativeAuthenticatedHeaders, getFreshNativeAccessToken, getFreshNativeSession, isUsableAuthenticatedUserJwt, jwtExp, noteNativeAuthState, refreshNativeSessionOnce } from "./nativeFunctionClient";
import { fetchNativeProfileSummary } from "./nativeProfileSummary";
import { invalidateNativePublicProfileCaches } from "./nativePublicProfile";
import { invalidateNativeDiscoveryRelationshipCache } from "./nativeChat";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";

export type NativeBackendVerificationStatus = "unverified" | "pending" | "verified";
export type NativeHumanVerificationStatus = "not_started" | "pending" | "passed" | "failed";
export type NativeCardVerificationStatus = "not_started" | "pending" | "passed" | "failed";
export type NativeIdentityDocumentStatus = "not_started" | "confirmed";
export type NativeIdentityDocumentType = "passport" | "id";
export type NativeIdentityExtractionMethod = "mrz" | "ocr";
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
  identityDocumentStatus: NativeIdentityDocumentStatus;
  identityDocumentType: NativeIdentityDocumentType | null;
  identityDocumentCountry: string | null;
  identityDocumentDob: string | null;
  identityDocumentGender: string | null;
  identityDocumentConfirmedAt: string | null;
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
  identityDocumentStatus: NativeIdentityDocumentStatus;
  identityDocumentType: NativeIdentityDocumentType | null;
  identityDocumentCountry: string | null;
  identityDocumentDob: string | null;
  identityDocumentGender: string | null;
  identityDocumentConfirmedAt: string | null;
};

const NATIVE_IDENTITY_DOCUMENT_COUNTRY_LABELS: Record<string, string> = {
  AUS: "Australia",
  CAN: "Canada",
  CHN: "China",
  FRA: "France",
  GBR: "United Kingdom",
  HKG: "Hong Kong",
  JPN: "Japan",
  KOR: "South Korea",
  PHL: "Philippines",
  SGP: "Singapore",
  THA: "Thailand",
  TWN: "Taiwan",
  USA: "United States",
};

export const formatNativeIdentityDocumentCountry = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  return NATIVE_IDENTITY_DOCUMENT_COUNTRY_LABELS[raw.toUpperCase()] || raw;
};

export const formatNativeIdentityDocumentGender = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "f" || normalized === "female" || normalized === "woman") return "Female";
  if (normalized === "m" || normalized === "male" || normalized === "man") return "Male";
  if (normalized === "x" || normalized === "non-binary" || normalized === "nonbinary") return "Non-binary";
  return raw;
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

export type NativeConfirmIdentityDocumentPayload = {
  documentType: NativeIdentityDocumentType;
  extractionMethod: NativeIdentityExtractionMethod;
  confidenceScore: number | null;
  documentExpiresOn?: string | null;
  documentLast4?: string | null;
  documentNumber?: string | null;
  extractedNameEvidence?: string[];
  originalExtracted: {
    legalName: string;
    documentCountry: string;
    dob: string;
    documentGender?: string | null;
  };
  confirmed: {
    legalName: string;
    documentCountry: string;
    dob: string;
    documentGender?: string | null;
  };
};

export type NativeConfirmIdentityDocumentResult = {
  ok: boolean;
  documentStatus: NativeIdentityDocumentStatus;
  verificationStatus: NativeBackendVerificationStatus;
};

export type NativeVerifyIdentitySupportIntent = {
  initialMessage: string;
  subject: "Identity verification support";
};

export type NativeVerifyIdentityUpdatedEvent = {
  snapshot?: NativeVerifyIdentitySnapshot | null;
  userId?: string | null;
  verified?: boolean;
  source: "snapshot" | "phone" | "human" | "document" | "card" | "device_fingerprint" | "manual";
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
  expiresAt: number | null;
  refreshToken: string | null;
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
  identity_document_status?: unknown;
  identity_document_type?: unknown;
  identity_document_country?: unknown;
  identity_document_dob?: unknown;
  identity_document_gender?: unknown;
  document_sex_marker?: unknown;
  identity_document_confirmed_at?: unknown;
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
  identity_document_status?: string | null;
  identity_document_type?: string | null;
  identity_document_country?: string | null;
  identity_document_dob?: string | null;
  identity_document_gender?: string | null;
  document_sex_marker?: string | null;
  identity_document_confirmed_at?: string | null;
};

const DEVICE_FINGERPRINT_STORAGE_KEY = "huddle_native_verify_identity_install_id_v1";
const LEGACY_DEVICE_FINGERPRINT_STORAGE_KEY = "huddle_native_verify_identity_device_fingerprint_placeholder_v1";
const PROFILE_STATUS_CACHE_VERSION = 3;
const nativeVerifyIdentityUpdatedListeners = new Set<(event: NativeVerifyIdentityUpdatedEvent) => void>();
let nativeVerifyIdentityUserId: string | null = null;
const nativeVerifyIdentityProfileStatusMemory = new Map<string, NativeVerifyIdentityProfileStatusCachePayload>();
const nativeVerifyIdentityRefreshInFlight = new Map<string, Promise<{ profile: NativeVerifyIdentityProfileStatus; snapshot: NativeVerifyIdentitySnapshot }>>();

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

const normalizeIdentityDocumentSexMarker = (value: unknown): string | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "f" || normalized === "female" || normalized === "woman") return "Female";
  if (normalized === "m" || normalized === "male" || normalized === "man") return "Male";
  if (normalized === "x" || normalized === "non-binary" || normalized === "nonbinary") return "Non-binary";
  return raw;
};

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

const asIdentityDocumentStatus = (value: unknown): NativeIdentityDocumentStatus => {
  return normalize(value) === "confirmed" ? "confirmed" : "not_started";
};

const asIdentityDocumentType = (value: unknown): NativeIdentityDocumentType | null => {
  const v = normalize(value);
  return v === "passport" || v === "id" ? v : null;
};

const asNullableString = (value: unknown): string | null => {
  return typeof value === "string" && value.trim() ? value : null;
};

const profileStatusSessionKey = (userId: string, sessionKey?: string | null) => String(sessionKey || `${userId}:0`);
const profileStatusCacheKey = (userId: string, sessionKey?: string | null) =>
  `huddle_native_verify_identity_profile_status:v${PROFILE_STATUS_CACHE_VERSION}:${userId}:${profileStatusSessionKey(userId, sessionKey)}`;
const PROFILE_STATUS_CACHE_PREFIX = "huddle_native_verify_identity_profile_status:v";
let persistedProfileStatusSweep: Promise<void> | null = null;

const sweepPersistedNativeVerifyIdentityProfileStatus = (): Promise<void> => {
  if (persistedProfileStatusSweep) return persistedProfileStatusSweep;
  persistedProfileStatusSweep = readNativeDisplayCacheKeys()
    .then((keys) => keys.filter((key) => key.startsWith(PROFILE_STATUS_CACHE_PREFIX)))
    .then((keys) => (keys.length > 0 ? AsyncStorage.multiRemove(keys) : undefined))
    .then(() => undefined)
    .catch(() => {
      persistedProfileStatusSweep = null;
    });
  return persistedProfileStatusSweep;
};

const removePersistedNativeVerifyIdentityProfileStatus = async (userId: string, sessionKey: string): Promise<void> => {
  await sweepPersistedNativeVerifyIdentityProfileStatus();
  await Promise.all(
    [2, PROFILE_STATUS_CACHE_VERSION].map((version) =>
      AsyncStorage.removeItem(
        `huddle_native_verify_identity_profile_status:v${version}:${userId}:${sessionKey}`,
      ).catch(() => undefined),
    ),
  );
};

export const readCachedNativeVerifyIdentityProfileStatus = async (
  options: { sessionKey?: string | null; userId?: string | null } = {},
): Promise<NativeVerifyIdentityProfileStatus | null> => {
  const providedUserId = String(options.userId || "").trim();
  const session = providedUserId && options.sessionKey ? null : await getNativeVerifyIdentitySession();
  const userId = String(providedUserId || session?.userId || "").trim();
  const sessionKey = profileStatusSessionKey(userId, options.sessionKey);
  const key = profileStatusCacheKey(userId, sessionKey);
  const memory = nativeVerifyIdentityProfileStatusMemory.get(key);
  if (memory) return memory;
  // Profile status contains legal name and document DOB. Never hydrate it from
  // plaintext storage. Legacy removal is background hygiene and must never
  // delay the identity screen's memory decision.
  void removePersistedNativeVerifyIdentityProfileStatus(userId, sessionKey);
  return null;
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
  await removePersistedNativeVerifyIdentityProfileStatus(userId, sessionKey);
};

export const patchNativeVerifyIdentityProfileStatusCache = async (
  patch: Partial<NativeVerifyIdentityProfileStatus>,
  options: { sessionKey?: string | null; userId?: string | null } = {},
) => {
  const existing = await readCachedNativeVerifyIdentityProfileStatus(options).catch(() => null);
  if (!existing) return false;
  await writeNativeVerifyIdentityProfileStatusCache({ ...existing, ...patch }, options);
  return true;
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
    return new NativeVerifyIdentityError(code, "Verification is preparing. Try again in a moment.", status);
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
  if (code.includes("liveness_binding_required")) {
    return new NativeVerifyIdentityError(code, "Complete the human check before confirming your document.", status);
  }
  if (code.includes("human_verification_required")) {
    return new NativeVerifyIdentityError(code, "We couldn't confirm your human check. Please reopen verification and try again.", status);
  }
  if (code.includes("reused_document")) {
    return new NativeVerifyIdentityError(code, "This document is already linked to another account.", status);
  }
  if (code.includes("expired_document")) {
    return new NativeVerifyIdentityError(code, "This document could not be verified. Please use a valid unexpired document.", status);
  }
  if (code.includes("missing_identity_document_fields")) {
    return new NativeVerifyIdentityError(code, "Confirm all required document details before continuing.", status);
  }
  if (code.includes("identity_name_mismatch")) {
    return new NativeVerifyIdentityError(code, "The name you entered does not match this document. Check the name or scan again.", status);
  }
  if (code.includes("passport_mrz_required") || code.includes("missing_document_number") || code.includes("missing_document_expiry")) {
    return new NativeVerifyIdentityError(code, "We need a complete passport scan before confirming these details.", status);
  }
  if (code.includes("face_detector_unsupported")) {
    return new NativeVerifyIdentityError(code, "This device does not support the camera verification check.", status);
  }
  if (code.includes("attempt_not_found")) {
    return new NativeVerifyIdentityError(code, "Verification is preparing. Try again in a moment.", status);
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

const hashNativeVerifyIdentityValue = async (value: string): Promise<string> => {
  const normalized = value.trim();
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const input = new TextEncoder().encode(normalized);
    const digest = await subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${Math.abs(hash).toString(16).padStart(8, "0")}${normalized.length.toString(16).padStart(8, "0")}`.repeat(2);
};

const normalizeNativeVerifyIdentitySession = (session: Session | null | undefined): NativeVerifyIdentitySession | null => {
  const accessToken = String(session?.access_token || "").trim();
  const refreshToken = String(session?.refresh_token || "").trim();
  const userId = String(session?.user?.id || "").trim();
  if (!accessToken || !userId || !isUsableAuthenticatedUserJwt(accessToken)) return null;
  const accessTokenExp = jwtExp(accessToken);
  return {
    accessToken,
    expiresAt: typeof session?.expires_at === "number" ? session.expires_at : accessTokenExp,
    refreshToken: refreshToken || null,
    userId,
  };
};

const isNativeVerifyIdentitySessionUsable = (session: NativeVerifyIdentitySession): boolean => (
  Boolean(session.accessToken && session.userId) &&
  (!session.expiresAt || session.expiresAt * 1000 > Date.now() + 30000)
);

const getNativeVerifyIdentitySession = async (): Promise<NativeVerifyIdentitySession> => {
  const fresh = await getFreshNativeSession();
  const current = normalizeNativeVerifyIdentitySession(fresh?.session);
  if (current && isNativeVerifyIdentitySessionUsable(current)) return current;
  throw mapNativeVerifyIdentityError("auth_required", 401);
};

export const setNativeVerifyIdentitySessionFallback = (session: Session | null | undefined): void => {
  const nextSession = normalizeNativeVerifyIdentitySession(session);
  if (!nextSession || nextSession.userId !== nativeVerifyIdentityUserId) {
    nativeVerifyIdentityProfileStatusMemory.clear();
  }
  nativeVerifyIdentityUserId = nextSession?.userId ?? null;
  noteNativeAuthState(session);
};

export const getNativeVerifyIdentityAccessToken = async (): Promise<string> => {
  const session = await getNativeVerifyIdentitySession();
  return session.accessToken;
};

const postNativeVerifyIdentityFunction = async <T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<NativeFunctionResult<T>> => {
  const normalizedAccessToken = String(accessToken || "").trim();
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: await createFreshNativeFunctionHeaders(normalizedAccessToken, { functionName, routeToken: normalizedAccessToken }),
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
    document_sex_marker: profile.document_sex_marker ?? profile.identity_document_gender ?? null,
    identity_document_gender: profile.document_sex_marker ?? profile.identity_document_gender ?? null,
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
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) throw mapNativeVerifyIdentityError("auth_required", 401);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_native_verify_identity_profile_snapshot`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
    }),
    body: "{}",
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok || !parsed || typeof parsed !== "object") return null;
  return parsed as NativeFallbackProfile;
};

const fetchNativeVerifyIdentitySnapshotWithProfile = async (
  accessToken: string,
  profileSnapshotRequest: Promise<NativeFallbackProfile | null>,
): Promise<NativeVerifyIdentitySnapshot> => {
  const [humanResult, profileSnapshot] = await Promise.all([
    invokeWithTransient503Retry<NativeHumanSnapshotResponse>("verify-human-challenge", { action: "get" }, accessToken),
    profileSnapshotRequest.then((profile) => profile ? profileToCardStatusResponse(profile) : null),
  ]);

  if (humanResult.error) throw mapNativeVerifyIdentityError(humanResult.error, humanResult.status);
  const humanData = humanResult.data ?? {};
  const cardData = profileSnapshot ?? {};

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
  identityDocumentStatus: asIdentityDocumentStatus(cardData.identity_document_status),
  identityDocumentType: asIdentityDocumentType(cardData.identity_document_type),
  identityDocumentCountry: asNullableString(cardData.identity_document_country),
  identityDocumentDob: asNullableString(cardData.identity_document_dob),
  identityDocumentGender: normalizeIdentityDocumentSexMarker(cardData.document_sex_marker ?? cardData.identity_document_gender),
  identityDocumentConfirmedAt: asNullableString(cardData.identity_document_confirmed_at),
  };
};

export const fetchNativeVerifyIdentitySnapshot = async (): Promise<NativeVerifyIdentitySnapshot> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  return fetchNativeVerifyIdentitySnapshotWithProfile(accessToken, fetchVerifyIdentityProfileSnapshot(accessToken));
};

const profileSnapshotToNativeVerifyIdentityStatus = (
  profile: NativeFallbackProfile,
): NativeVerifyIdentityProfileStatus => {
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
  return {
    phone: asNullableString(profile.phone),
    phoneVerificationStatus,
    phoneVerifiedAt: asNullableString(profile.phone_verified_at),
    verificationStatus: profileVerified ? "verified" : asStatus(profile.verification_status),
    isVerified: profileVerified,
    legalName: asNullableString(profile.legal_name),
    humanStatus,
    cardStatus,
    cardVerified,
    cardBrand: asNullableString(profile.card_brand),
    cardLast4: asNullableString(profile.card_last4),
    verificationRejectionCode: asVerificationRejectionCode(profile.verification_rejection_code),
    identityDocumentStatus: asIdentityDocumentStatus(profile.identity_document_status),
    identityDocumentType: asIdentityDocumentType(profile.identity_document_type),
    identityDocumentCountry: asNullableString(profile.identity_document_country),
    identityDocumentDob: asNullableString(profile.identity_document_dob),
    identityDocumentGender: normalizeIdentityDocumentSexMarker(profile.document_sex_marker ?? profile.identity_document_gender),
    identityDocumentConfirmedAt: asNullableString(profile.identity_document_confirmed_at),
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
  const status = profileSnapshotToNativeVerifyIdentityStatus(profile);
  await writeNativeVerifyIdentityProfileStatusCache(status, options);
  return status;
};

export const fetchNativeVerifyIdentityRefreshState = async (
  options: { sessionKey?: string | null; userId?: string | null } = {},
): Promise<{ profile: NativeVerifyIdentityProfileStatus; snapshot: NativeVerifyIdentitySnapshot }> => {
  const key = `${String(options.userId || "").trim()}:${String(options.sessionKey || "").trim()}`;
  const existing = nativeVerifyIdentityRefreshInFlight.get(key);
  if (existing) return existing;
  const request = (async () => {
    const { accessToken } = await getNativeVerifyIdentitySession();
    const sharedProfileSnapshot = fetchVerifyIdentityProfileSnapshot(accessToken);
    const [snapshot, profile] = await Promise.all([
      fetchNativeVerifyIdentitySnapshotWithProfile(accessToken, sharedProfileSnapshot),
      sharedProfileSnapshot.then(async (value) => {
        if (!value) throw mapNativeVerifyIdentityError("profile_not_ready");
        const status = profileSnapshotToNativeVerifyIdentityStatus(value);
        await writeNativeVerifyIdentityProfileStatusCache(status, options);
        return status;
      }),
    ]);
    return { profile, snapshot };
  })();
  nativeVerifyIdentityRefreshInFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (nativeVerifyIdentityRefreshInFlight.get(key) === request) {
      nativeVerifyIdentityRefreshInFlight.delete(key);
    }
  }
};

export const confirmNativeIdentityDocument = async (
  payload: NativeConfirmIdentityDocumentPayload,
): Promise<NativeConfirmIdentityDocumentResult> => {
  const session = await getNativeVerifyIdentitySession();
  let functionResult = await invokeWithTransient503Retry<Partial<NativeConfirmIdentityDocumentResult>>(
    "native-verify-identity-document",
    {
      action: "confirm_document",
      confidenceScore: payload.confidenceScore,
      confirmed: payload.confirmed,
      documentExpiresOn: payload.documentExpiresOn ?? null,
      documentLast4: payload.documentLast4 ?? null,
      documentNumber: payload.documentNumber ?? null,
      documentType: payload.documentType,
      extractionMethod: payload.extractionMethod,
      extractedNameEvidence: payload.extractedNameEvidence ?? [payload.originalExtracted.legalName].filter(Boolean),
      originalExtracted: payload.originalExtracted,
      documentGender: payload.confirmed.documentGender ?? payload.originalExtracted.documentGender ?? null,
    },
    session.accessToken,
  );
  if (functionResult.status === 401) {
    const refreshed = normalizeNativeVerifyIdentitySession(await refreshNativeSessionOnce(
      session.refreshToken ? { refresh_token: session.refreshToken } : null,
    ));
    if (refreshed && isNativeVerifyIdentitySessionUsable(refreshed)) {
      functionResult = await invokeWithTransient503Retry<Partial<NativeConfirmIdentityDocumentResult>>(
        "native-verify-identity-document",
        {
          action: "confirm_document",
          confidenceScore: payload.confidenceScore,
          confirmed: payload.confirmed,
          documentExpiresOn: payload.documentExpiresOn ?? null,
          documentLast4: payload.documentLast4 ?? null,
          documentNumber: payload.documentNumber ?? null,
          documentType: payload.documentType,
          extractionMethod: payload.extractionMethod,
          extractedNameEvidence: payload.extractedNameEvidence ?? [payload.originalExtracted.legalName].filter(Boolean),
          originalExtracted: payload.originalExtracted,
          documentGender: payload.confirmed.documentGender ?? payload.originalExtracted.documentGender ?? null,
        },
        refreshed.accessToken,
      );
    }
  }
  const result = throwIfFunctionError(
    functionResult,
  );
  return {
    ok: Boolean(result.ok),
    documentStatus: asIdentityDocumentStatus(result.documentStatus),
    verificationStatus: asStatus(result.verificationStatus),
  };
};

export const startNativeHumanChallenge = async (): Promise<NativeStartHumanChallengeResult> => {
  const { accessToken } = await getNativeVerifyIdentitySession();
  const data = throwIfFunctionError(
    await invokeWithTransient503Retry<NativeHumanStartResponse>(
      "verify-human-challenge",
      {
        action: "start",
      },
      accessToken,
    ),
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
    let accessToken = String(options.accessToken || "").trim();
    if (!accessToken) {
      accessToken = (await getNativeVerifyIdentitySession()).accessToken;
    }
    if (!userId || !accessToken) return false;
    await fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey: options.sessionKey });
    return true;
  } catch {
    return false;
  }
};

export const refreshNativeVerifyIdentityVerifiedSurfaces = async (options: { accessToken?: string | null; refetch?: boolean; sessionKey?: string | null; userId?: string | null } = {}): Promise<boolean> => {
  try {
    const userId = String(options.userId || "").trim();
    let accessToken = String(options.accessToken || "").trim();
    if (options.refetch && !accessToken) {
      accessToken = (await getNativeVerifyIdentitySession()).accessToken;
    }
    if (!userId) return false;
    await invalidateNativePublicProfileCaches({ userId });
    invalidateNativeDiscoveryRelationshipCache(userId);
    if (accessToken) {
      await fetchNativeProfileSummary(userId, { force: true, accessToken, sessionKey: options.sessionKey });
    }
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
