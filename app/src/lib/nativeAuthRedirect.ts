import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "./supabase";

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

const normalizePathname = (url: URL) => {
  if (url.protocol === "huddle:") {
    return url.hostname ? `/${url.hostname}${url.pathname === "/" ? "" : url.pathname}` : url.pathname || "/";
  }
  return url.pathname || "/";
};

const asSupportedType = (value: string | null | undefined): NativeAuthRedirectType | null => {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_TYPES.has(normalized as NativeAuthRedirectType) ? normalized as NativeAuthRedirectType : null;
};

const normalizeVerifyOtpType = (type: NativeAuthRedirectType): EmailOtpType => {
  if (type === "magiclink" || type === "signup") return "email";
  return type as EmailOtpType;
};

const getFingerprint = (url: URL, hashParams: URLSearchParams) =>
  trimOrNull(
    url.searchParams.get("code") ||
      hashParams.get("code") ||
      url.searchParams.get("token_hash") ||
      hashParams.get("token_hash") ||
      url.searchParams.get("access_token") ||
      hashParams.get("access_token"),
  );

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
    const pathname = normalizePathname(url);
    const hashParams = readHashParams(url.hash);
    return (
      pathname === "/auth/callback" ||
      Boolean(
        url.searchParams.get("code") ||
          hashParams.get("code") ||
          url.searchParams.get("token_hash") ||
          hashParams.get("token_hash") ||
          url.searchParams.get("access_token") ||
          hashParams.get("access_token"),
      )
    );
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

  const fingerprint = getFingerprint(url, hashParams);
  if (fingerprint && await wasConsumed(fingerprint)) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return { ok: true, type, next, method: "existing_session" };
    return { ok: false, type, next, error: "redirect_already_consumed" };
  }

  const code = trimOrNull(url.searchParams.get("code") || hashParams.get("code"));
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, type, next, error: error.message || "exchange_code_failed" };
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
    if (fingerprint) await markConsumed(fingerprint);
    return { ok: true, type, next, method: "verifyOtp" };
  }

  const accessToken = trimOrNull(hashParams.get("access_token") || url.searchParams.get("access_token"));
  const refreshToken = trimOrNull(hashParams.get("refresh_token") || url.searchParams.get("refresh_token"));
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { ok: false, type, next, error: error.message || "set_session_failed" };
    if (fingerprint) await markConsumed(fingerprint);
    return { ok: true, type, next, method: "setSession" };
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return { ok: true, type, next, method: "existing_session" };

  return { ok: true, type, next, method: "none" };
}
