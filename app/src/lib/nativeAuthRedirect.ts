import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { clearNativeAuthState, getFreshNativeSession, installNativeAuthSession } from "./nativeFunctionClient";
import { isTrustedNativeAuthCallbackUrl } from "./nativeAuthRedirectTrust";

type NativeAuthRedirectType = "signup" | "invite" | "magiclink" | "recovery" | "email" | "email_change";

type NativeAuthRedirectResult =
  | { ok: true; type: NativeAuthRedirectType | null; next: string | null; method: "code" | "verifyOtp" | "setSession" | "existing_session" | "none" }
  | { ok: false; type: NativeAuthRedirectType | null; next: string | null; error: string };

const SUPPORTED_TYPES = new Set<NativeAuthRedirectType>(["signup", "invite", "magiclink", "recovery", "email", "email_change"]);
const CONSUMED_KEY = "huddle_native_auth_redirect_consumed_v1";

const trimOrNull = (value: string | null | undefined) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const readHashParams = (hash: string) => new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

const asSupportedType = (value: string | null | undefined): NativeAuthRedirectType | null => {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_TYPES.has(normalized as NativeAuthRedirectType) ? normalized as NativeAuthRedirectType : null;
};

const normalizeVerifyOtpType = (type: NativeAuthRedirectType): EmailOtpType => {
  if (type === "magiclink" || type === "signup") return "email";
  return type as EmailOtpType;
};

const getRedirectMaterial = (url: URL, hashParams: URLSearchParams) =>
  trimOrNull(
    url.searchParams.get("code") ||
      hashParams.get("code") ||
      url.searchParams.get("token_hash") ||
      hashParams.get("token_hash") ||
      url.searchParams.get("access_token") ||
      hashParams.get("access_token"),
  );

const getFingerprint = async (url: URL, hashParams: URLSearchParams) => {
  const material = getRedirectMaterial(url, hashParams);
  if (!material) return null;
  try {
    return `sha256:${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, material)}`;
  } catch {
    // Never persist a raw auth code or token merely to support replay tracking.
    return null;
  }
};

const wasConsumed = async (fingerprint: string) => {
  try {
    return await AsyncStorage.getItem(`${CONSUMED_KEY}:${fingerprint}`) === "1";
  } catch {
    return false;
  }
};

const markConsumed = async (fingerprint: string) => {
  try {
    await AsyncStorage.setItem(`${CONSUMED_KEY}:${fingerprint}`, "1");
  } catch {
    // best effort only
  }
};

export const isNativeAuthRedirectUrl = (rawUrl: string | null | undefined) => {
  const raw = String(rawUrl || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return isTrustedNativeAuthCallbackUrl(url);
  } catch {
    return false;
  }
};

export async function consumeNativeSupabaseAuthRedirect(rawUrl: string): Promise<NativeAuthRedirectResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, type: null, next: null, error: "invalid_redirect_url" };
  }
  if (!isTrustedNativeAuthCallbackUrl(url)) {
    return { ok: false, type: null, next: null, error: "untrusted_redirect_url" };
  }

  const hashParams = readHashParams(url.hash);
  const type = asSupportedType(url.searchParams.get("type") || hashParams.get("type"));
  const next = trimOrNull(url.searchParams.get("next") || hashParams.get("next"));
  const authError = trimOrNull(
    url.searchParams.get("error_description") ||
      hashParams.get("error_description") ||
      url.searchParams.get("error") ||
      hashParams.get("error"),
  );
  if (authError) return { ok: false, type, next, error: authError };

  const fingerprint = await getFingerprint(url, hashParams);
  if (fingerprint && await wasConsumed(fingerprint)) {
    const fresh = await getFreshNativeSession();
    if (fresh?.accessToken) return { ok: true, type, next, method: "existing_session" };
    return { ok: false, type, next, error: "redirect_already_consumed" };
  }

  const code = trimOrNull(url.searchParams.get("code") || hashParams.get("code"));
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, type, next, error: error.message || "exchange_code_failed" };
    clearNativeAuthState();
    if (fingerprint) await markConsumed(fingerprint);
    return { ok: true, type, next, method: "code" };
  }

  const tokenHash = trimOrNull(url.searchParams.get("token_hash") || hashParams.get("token_hash"));
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: normalizeVerifyOtpType(type),
    });
    if (error) return { ok: false, type, next, error: error.message || "verify_otp_failed" };
    clearNativeAuthState();
    if (fingerprint) await markConsumed(fingerprint);
    return { ok: true, type, next, method: "verifyOtp" };
  }

  const accessToken = trimOrNull(hashParams.get("access_token") || url.searchParams.get("access_token"));
  const refreshToken = trimOrNull(hashParams.get("refresh_token") || url.searchParams.get("refresh_token"));
  if (accessToken && refreshToken) {
    try {
      await installNativeAuthSession({ access_token: accessToken, refresh_token: refreshToken });
    } catch (error) {
      return { ok: false, type, next, error: error instanceof Error ? error.message : "set_session_failed" };
    }
    if (fingerprint) await markConsumed(fingerprint);
    return { ok: true, type, next, method: "setSession" };
  }

  const fresh = await getFreshNativeSession();
  if (fresh?.accessToken) return { ok: true, type, next, method: "existing_session" };

  return { ok: true, type, next, method: "none" };
}
