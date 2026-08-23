import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";
import { createNativeFunctionHeaders, installNativeAuthSession } from "./nativeFunctionClient";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { supabase, supabaseUrl } from "./supabase";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import type { NativeProfilePhotoPresentationCrop } from "./nativeProfilePhotos";

export type NativeSignupDraft = {
  dob: string;
  email: string;
  phone: string;
  password: string;
  displayName: string;
  socialId: string;
  avatarUri: string;
  avatarFileName: string;
  avatarMimeType: string;
  avatarFileSize: number | null;
  avatarPresentation: NativeProfilePhotoPresentationCrop | null;
  genderGenre: string;
  locationCountry: string;
  locationCity: string;
  locationDistrict: string;
  petExperienceMode: "current" | "past" | "new" | "";
  petExperienceYears: string;
  petExperienceKinds: string[];
  signupProof: string;
  presignupToken: string;
  presignupResendKey: string;
  presignupEmail: string;
  turnstileToken: string;
};

export type NativeSignupStep = "dob" | "credentials" | "emailConfirmation" | "name" | "location" | "quickProfile";

export type NativeSignupVerifyLink = {
  token: string;
  email: string;
};

export type NativeSignupResumeState =
  | "step_1_dob"
  | "step_2_credentials"
  | "step_3_email_verification"
  | "step_4_identity"
  | "notification_transition"
  | "location_transition"
  | "step_5_quick_profile"
  | "complete"
  | "existing_registered_conflict";

export type PreSignupStatus = {
  verified?: boolean;
  expired?: boolean;
  signup_proof?: string | null;
  signup_proof_expires_at?: string | null;
  email?: string | null;
  auth_confirmed?: boolean;
  confirmation_mode?: "presignup" | "auth" | null;
};

export type CompleteNativeSignupProfilePayload = {
  avatar_url: string;
  photos: Record<string, unknown>;
  gender_genre?: string | null;
  location_country: string;
  location_city?: string | null;
  location_district: string;
  location_name: string;
  owns_pets: boolean;
  availability_status: string[];
  pet_experience: string[];
  experience_years: number | null;
  profile_editorial_v1: boolean;
};

export type CompleteNativeSignupIdentityPayload = {
  display_name: string;
  social_id: string;
  email: string;
  phone: string;
  dob: string;
  marketing_opt_in_checked: boolean;
};

export type SendPreSignupVerifyResponse = {
  ok?: boolean;
  resend_key?: string | null;
  email?: string | null;
  reused?: boolean;
  email_sent?: boolean;
};

export type AuthSignupPayload = {
  email: string;
  password: string;
  options?: {
    emailRedirectTo?: string;
    data?: Record<string, unknown>;
  };
  turnstile_token?: string;
  turnstile_action?: "signup";
  signup_proof?: string;
  defer_profile_seed?: boolean;
};

export const emptyNativeSignupDraft: NativeSignupDraft = {
  dob: "",
  email: "",
  phone: "",
  password: "",
  displayName: "",
  socialId: "",
  avatarUri: "",
  avatarFileName: "",
  avatarMimeType: "",
  avatarFileSize: null,
  avatarPresentation: null,
  genderGenre: "",
  locationCountry: "",
  locationCity: "",
  locationDistrict: "",
  petExperienceMode: "",
  petExperienceYears: "",
  petExperienceKinds: [],
  signupProof: "",
  presignupToken: "",
  presignupResendKey: "",
  presignupEmail: "",
  turnstileToken: "",
};

const DRAFT_KEY = "huddle_native_signup_draft_v1";
const PASSWORD_KEY = "huddle_native_signup_password_v1";
const PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeEmail = (value: string) => value.trim().toLowerCase();

type SecurePasswordRecord = {
  password: string;
  createdAt: number;
};

const parseSecurePasswordRecord = (raw: string | null): SecurePasswordRecord | null => {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SecurePasswordRecord>;
    const password = String(parsed.password || "");
    const createdAt = Number(parsed.createdAt);
    if (password && Number.isFinite(createdAt)) return { password, createdAt };
  } catch {
    // Legacy SecureStore value was the raw password string. Treat it as fresh once, then rewrite as JSON.
  }
  return { password: value, createdAt: Date.now() };
};

async function readSecurePassword() {
  try {
    const record = parseSecurePasswordRecord(await SecureStore.getItemAsync(PASSWORD_KEY));
    if (!record?.password) return "";
    if (Date.now() - record.createdAt > PASSWORD_TTL_MS) {
      await SecureStore.deleteItemAsync(PASSWORD_KEY);
      return "";
    }
    return record.password;
  } catch {
    return "";
  }
}

async function writeSecurePassword(value: string) {
  try {
    if (value) {
      const existing = parseSecurePasswordRecord(await SecureStore.getItemAsync(PASSWORD_KEY));
      const existingFresh = existing && Date.now() - existing.createdAt <= PASSWORD_TTL_MS;
      const createdAt = existingFresh && existing.password === value ? existing.createdAt : Date.now();
      await SecureStore.setItemAsync(PASSWORD_KEY, JSON.stringify({ password: value, createdAt }));
    } else {
      await SecureStore.deleteItemAsync(PASSWORD_KEY);
    }
    return;
  } catch {
    // Passwords must never fall back to plaintext AsyncStorage.
  }

  try {
    await AsyncStorage.removeItem(PASSWORD_KEY);
  } catch {
    // best effort only
  }
}

type NativeSignupDraftStorageOptions = {
  includePassword?: boolean;
};

export async function loadNativeSignupDraft(options: NativeSignupDraftStorageOptions = {}): Promise<NativeSignupDraft> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    const includePassword = options.includePassword !== false;
    const password = includePassword ? await readSecurePassword() : "";
    if (!raw) return { ...emptyNativeSignupDraft, password };
    const parsed = JSON.parse(raw) as Partial<NativeSignupDraft>;
    const storedPetExperienceYears = parsed.petExperienceYears;
    const petExperienceYears = typeof storedPetExperienceYears === "number" || typeof storedPetExperienceYears === "string"
      ? String(storedPetExperienceYears).replace(/[^\d]/g, "").slice(0, 2)
      : "";
    return {
      ...emptyNativeSignupDraft,
      ...parsed,
      petExperienceYears,
      password,
      turnstileToken: "",
    };
  } catch {
    return { ...emptyNativeSignupDraft };
  }
}

export async function saveNativeSignupDraft(draft: NativeSignupDraft, options: NativeSignupDraftStorageOptions = {}): Promise<void> {
  const { password, turnstileToken, ...persistable } = draft;
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(persistable));
  } catch {
    // best effort only
  }
  if (options.includePassword === false) {
    await writeSecurePassword("");
    return;
  }
  await writeSecurePassword(password);
}

export async function clearNativeSignupPassword(): Promise<void> {
  await writeSecurePassword("");
}

export async function clearNativeSignupDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    // best effort only
  }
  await writeSecurePassword("");
}

export function parseNativeSignupVerifyUrl(url: string | null | undefined): NativeSignupVerifyLink | null {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const parsed = raw.startsWith("/") ? new URL(raw, "https://huddle.pet") : new URL(raw);
    const pathname = parsed.protocol === "huddle:"
      ? parsed.hostname
        ? `/${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`
        : parsed.pathname || "/"
      : parsed.pathname || "/";
    if (pathname !== "/verify") return null;
    const token = String(parsed.searchParams.get("token") || "").trim();
    const email = normalizeEmail(String(parsed.searchParams.get("email") || ""));
    if (!token) return null;
    return { token, email };
  } catch {
    return null;
  }
}

async function postNativeFunction<T>(
  functionName: string,
  body: unknown,
): Promise<{ data: T | null; error: string | null; code: string | null; publicMessage: string | null; status: number | null }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: createNativeFunctionHeaders(),
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: string; message?: string; code?: string; public_message?: string })
      | null;
    if (!response.ok) {
      return {
        data: null,
        error: String(payload?.public_message || payload?.error || payload?.message || `http_${response.status}`),
        code: String(payload?.code || payload?.error || "").trim() || null,
        publicMessage: String(payload?.public_message || "").trim() || null,
        status: response.status,
      };
    }
    return { data: payload as T | null, error: null, code: null, publicMessage: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "network_error",
      code: null,
      publicMessage: null,
      status: null,
    };
  }
}

export async function checkIdentifierRegistered(email: string, phone: string) {
  const { data, error } = await supabase.rpc("check_identifier_registered", {
    p_email: normalizeEmail(email),
    p_phone: phone.trim(),
  });
  if (error) throw new Error(error.message || "identifier_check_failed");
  return data as {
    registered?: boolean;
    field?: string | null;
    blocked?: boolean;
    public_message?: string | null;
    review_required?: boolean;
  } | null;
}

export async function checkSocialIdTaken(socialId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_social_id_taken", {
    p_social_id: socialId.trim().toLowerCase(),
  });
  if (error) throw new Error(error.message || "social_id_check_failed");
  return Boolean(data);
}

export async function completeNativeSignupProfile(payload: CompleteNativeSignupProfilePayload): Promise<{ id: string } | null> {
  const { data, error } = await nativeExactTokenRpc<{ id: string }>("complete_native_signup_profile", {
    p_profile: payload,
  });
  if (error) throw new Error(error.message || error.code || "profile_upsert_failed");
  return data as { id: string } | null;
}

export async function completeNativeSignupIdentity(payload: CompleteNativeSignupIdentityPayload, accessToken?: string | null): Promise<{ id: string; registered?: boolean } | null> {
  const { data, error } = await nativeExactTokenRpc<{ id: string; registered?: boolean }>("complete_native_signup_identity", {
    p_identity: payload,
  }, accessToken);
  if (error) throw new Error(error.message || error.code || "profile_identity_failed");
  return data as { id: string; registered?: boolean } | null;
}

export async function markNativeSignupNotificationHandled(): Promise<{ id: string; signup_resume_state?: NativeSignupResumeState } | null> {
  const { data, error } = await nativeExactTokenRpc<{ id: string; signup_resume_state?: NativeSignupResumeState }>("mark_native_signup_notification_handled", {});
  if (error) throw new Error(error.message || error.code || "notification_transition_failed");
  return data as { id: string; signup_resume_state?: NativeSignupResumeState } | null;
}

export async function markNativeSignupLocation(payload: {
  location_country: string;
  location_city?: string;
  location_district: string;
  location_name?: string;
}): Promise<{ id: string; signup_resume_state?: NativeSignupResumeState } | null> {
  const { data, error } = await nativeExactTokenRpc<{ id: string; signup_resume_state?: NativeSignupResumeState }>("mark_native_signup_location", {
    p_location: payload,
  });
  if (error) throw new Error(error.message || error.code || "location_transition_failed");
  return data as { id: string; signup_resume_state?: NativeSignupResumeState } | null;
}

export async function getPreSignupVerifyStatus(email: string, token?: string, resendKey?: string) {
  const { data, error } = await supabase.functions.invoke("get-pre-signup-verify-status", {
    body: {
      email: normalizeEmail(email),
      token: token?.trim() || undefined,
      resend_key: resendKey?.trim() || undefined,
    },
  });
  if (error) throw new Error(error.message || "verify_status_failed");
  return data as PreSignupStatus;
}

export async function sendPreSignupVerify(params: {
  email: string;
  resendKey?: string;
  turnstileToken?: string;
  forceNewToken?: boolean;
}) {
  const { data, error } = await postNativeFunction<SendPreSignupVerifyResponse>(
    "send-pre-signup-verify",
    {
      email: normalizeEmail(params.email),
      resend_key: params.resendKey?.trim() || undefined,
      turnstile_token: params.turnstileToken?.trim() || undefined,
      force_new_token: params.forceNewToken === true,
    },
  );
  if (error || !data?.ok) throw new Error(error || "send_failed");
  return data;
}

export const hasUsablePreSignupProof = (status: PreSignupStatus | null | undefined): boolean =>
  status?.verified === true && Boolean(String(status.signup_proof || "").trim());

export async function confirmPreSignupVerify(token: string, email?: string) {
  const { data, error } = await supabase.functions.invoke("confirm-pre-signup-verify", {
    body: {
      token: token.trim(),
      email: email ? normalizeEmail(email) : undefined,
    },
  });
  if (error) throw new Error(error.message || "confirm_verify_failed");
  return data as PreSignupStatus;
}

type AuthSignupFunctionResponse = {
  data?: {
    session?: { access_token?: string; refresh_token?: string } | null;
    user?: unknown;
  };
  session?: { access_token?: string; refresh_token?: string } | null;
  user?: unknown;
};

export async function authSignupNative(payload: AuthSignupPayload): Promise<{ session: Session | null; user: unknown | null }> {
  const { data, error, code, publicMessage } = await postNativeFunction<AuthSignupFunctionResponse>(
    "auth-signup",
    payload,
  );
  if (error) {
    const safeError = new Error(code || error) as Error & { code?: string; publicMessage?: string };
    safeError.code = code || undefined;
    safeError.publicMessage = publicMessage || undefined;
    throw safeError;
  }
  const payloadData = data?.data ?? data;
  const sessionTokens = payloadData?.session;
  if (!sessionTokens?.access_token || !sessionTokens.refresh_token) {
    return { session: null, user: payloadData?.user ?? null };
  }
  const session = await installNativeAuthSession({
    access_token: sessionTokens.access_token,
    refresh_token: sessionTokens.refresh_token,
  });
  return { session, user: payloadData?.user ?? null };
}
