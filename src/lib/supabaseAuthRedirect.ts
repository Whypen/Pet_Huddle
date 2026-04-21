import { supabase } from "@/integrations/supabase/client";

type SupportedRedirectType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email"
  | "email_change";

type ConsumeAuthRedirectResult =
  | {
      ok: true;
      type: SupportedRedirectType | null;
      next: string | null;
      method: "code" | "verifyOtp" | "setSession" | "existing_session" | "none";
    }
  | {
      ok: false;
      type: SupportedRedirectType | null;
      next: string | null;
      error: string;
    };

const AUTH_PARAM_KEYS = new Set([
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_token",
  "refresh_token",
  "token_hash",
  "token_type",
  "type",
]);

const SUPPORTED_TYPES = new Set<SupportedRedirectType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

const asSupportedType = (value: string | null): SupportedRedirectType | null => {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_TYPES.has(normalized as SupportedRedirectType)
    ? (normalized as SupportedRedirectType)
    : null;
};

const readHashParams = (hash: string) => new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

const trimOrNull = (value: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || null;
};

const normalizeVerifyOtpType = (type: SupportedRedirectType): SupportedRedirectType => {
  if (type === "magiclink" || type === "signup") return "email";
  return type;
};

const cleanAuthUrl = (url: URL) => {
  const nextSearch = new URLSearchParams(url.search);
  for (const key of AUTH_PARAM_KEYS) nextSearch.delete(key);
  const nextHash = readHashParams(url.hash);
  for (const key of AUTH_PARAM_KEYS) nextHash.delete(key);

  const nextSearchString = nextSearch.toString();
  const nextHashString = nextHash.toString();
  const cleanedUrl =
    `${url.pathname}${nextSearchString ? `?${nextSearchString}` : ""}${nextHashString ? `#${nextHashString}` : ""}`;

  window.history.replaceState({}, document.title, cleanedUrl);
};

export async function consumeSupabaseAuthRedirect(): Promise<ConsumeAuthRedirectResult> {
  const url = new URL(window.location.href);
  const hashParams = readHashParams(url.hash);
  const type = asSupportedType(url.searchParams.get("type") || hashParams.get("type"));
  const next = trimOrNull(url.searchParams.get("next") || hashParams.get("next"));
  const authError = trimOrNull(
    url.searchParams.get("error_description")
      || hashParams.get("error_description")
      || url.searchParams.get("error")
      || hashParams.get("error"),
  );

  if (authError) {
    return { ok: false, type, next, error: authError };
  }

  const code = trimOrNull(url.searchParams.get("code") || hashParams.get("code"));
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, type, next, error: error.message || "exchange_code_failed" };
    cleanAuthUrl(url);
    return { ok: true, type, next, method: "code" };
  }

  const tokenHash = trimOrNull(url.searchParams.get("token_hash") || hashParams.get("token_hash"));
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: normalizeVerifyOtpType(type),
    });
    if (error) return { ok: false, type, next, error: error.message || "verify_otp_failed" };
    cleanAuthUrl(url);
    return { ok: true, type, next, method: "verifyOtp" };
  }

  const accessToken = trimOrNull(hashParams.get("access_token") || url.searchParams.get("access_token"));
  const refreshToken = trimOrNull(hashParams.get("refresh_token") || url.searchParams.get("refresh_token"));
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { ok: false, type, next, error: error.message || "set_session_failed" };
    cleanAuthUrl(url);
    return { ok: true, type, next, method: "setSession" };
  }

  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    return { ok: true, type, next, method: "existing_session" };
  }

  return { ok: true, type, next, method: "none" };
}
