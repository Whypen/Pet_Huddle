import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";
import { createNativeFunctionHeaders } from "./nativeFunctionClient";
import { supabase, supabaseUrl } from "./supabase";

export type NativeSignupDraft = {
  dob: string;
  email: string;
  phone: string;
  password: string;
  displayName: string;
  socialId: string;
  signupProof: string;
  presignupToken: string;
  presignupEmail: string;
  turnstileToken: string;
  verificationSubmitted: boolean;
};

export type NativeSignupStep = "dob" | "credentials" | "emailConfirmation" | "name" | "verifyDecision";

export type NativeSignupVerifyLink = {
  token: string;
  email: string;
};

export type PreSignupStatus = {
  verified?: boolean;
  expired?: boolean;
  signup_proof?: string | null;
  signup_proof_expires_at?: string | null;
  email?: string | null;
  token?: string | null;
  auth_confirmed?: boolean;
  confirmation_mode?: "presignup" | "auth" | null;
};

export type SendPreSignupVerifyResponse = {
  ok?: boolean;
  token?: string | null;
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
};

export const emptyNativeSignupDraft: NativeSignupDraft = {
  dob: "",
  email: "",
  phone: "",
  password: "",
  displayName: "",
  socialId: "",
  signupProof: "",
  presignupToken: "",
  presignupEmail: "",
  turnstileToken: "",
  verificationSubmitted: false,
};

const DRAFT_KEY = "huddle_native_signup_draft_v1";
const PASSWORD_KEY = "huddle_native_signup_password_v1";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

async function readSecurePassword() {
  try {
    return (await SecureStore.getItemAsync(PASSWORD_KEY)) || "";
  } catch {
    try {
      return (await AsyncStorage.getItem(PASSWORD_KEY)) || "";
    } catch {
      return "";
    }
  }
}

async function writeSecurePassword(value: string) {
  try {
    if (value) {
      await SecureStore.setItemAsync(PASSWORD_KEY, value);
    } else {
      await SecureStore.deleteItemAsync(PASSWORD_KEY);
    }
    return;
  } catch {
    // AsyncStorage fallback keeps simulator/dev builds recoverable.
  }

  try {
    if (value) {
      await AsyncStorage.setItem(PASSWORD_KEY, value);
    } else {
      await AsyncStorage.removeItem(PASSWORD_KEY);
    }
  } catch {
    // best effort only
  }
}

export async function loadNativeSignupDraft(): Promise<NativeSignupDraft> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    const password = await readSecurePassword();
    if (!raw) return { ...emptyNativeSignupDraft, password };
    const parsed = JSON.parse(raw) as Partial<NativeSignupDraft>;
    return {
      ...emptyNativeSignupDraft,
      ...parsed,
      password,
    };
  } catch {
    return { ...emptyNativeSignupDraft };
  }
}

export async function saveNativeSignupDraft(draft: NativeSignupDraft): Promise<void> {
  const { password, turnstileToken, ...persistable } = draft;
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(persistable));
  } catch {
    // best effort only
  }
  await writeSecurePassword(password);
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
): Promise<{ data: T | null; error: string | null; status: number | null }> {
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
        status: response.status,
      };
    }
    return { data: payload as T | null, error: null, status: response.status };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "network_error",
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
    p_social_id: socialId.trim(),
  });
  if (error) throw new Error(error.message || "social_id_check_failed");
  return Boolean(data);
}

export async function getPreSignupVerifyStatus(email: string, token?: string) {
  const { data, error } = await supabase.functions.invoke("get-pre-signup-verify-status", {
    body: {
      email: normalizeEmail(email),
      token: token?.trim() || undefined,
    },
  });
  if (error) throw new Error(error.message || "verify_status_failed");
  return data as PreSignupStatus;
}

export async function sendPreSignupVerify(params: {
  email: string;
  currentToken?: string;
  turnstileToken?: string;
  forceNewToken?: boolean;
}) {
  const { data, error } = await postNativeFunction<SendPreSignupVerifyResponse>(
    "send-pre-signup-verify",
    {
      email: normalizeEmail(params.email),
      current_token: params.currentToken?.trim() || undefined,
      turnstile_token: params.currentToken ? undefined : params.turnstileToken?.trim() || undefined,
      force_new_token: params.forceNewToken === true,
    },
  );
  if (error || !data?.ok) throw new Error(error || "send_failed");
  return data;
}

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
  const { data, error } = await postNativeFunction<AuthSignupFunctionResponse>(
    "auth-signup",
    payload,
  );
  if (error) throw new Error(error);
  const payloadData = data?.data ?? data;
  const sessionTokens = payloadData?.session;
  if (!sessionTokens?.access_token || !sessionTokens.refresh_token) {
    return { session: null, user: payloadData?.user ?? null };
  }
  const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
    access_token: sessionTokens.access_token,
    refresh_token: sessionTokens.refresh_token,
  });
  if (setSessionError) throw new Error(setSessionError.message || "set_session_failed");
  return { session: sessionData.session ?? null, user: payloadData?.user ?? null };
}
