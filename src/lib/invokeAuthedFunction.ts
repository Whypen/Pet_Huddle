import { supabase } from "@/integrations/supabase/client";

type InvokeArgs = {
  body?: unknown;
  headers?: Record<string, string>;
};

const authErrorPattern = /(401|unauthori[sz]ed|invalid[_\s-]?jwt|missing[_\s-]?token)/i;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

type AccessTokenResolution =
  | { token: string; hasSession: true }
  | { token: null; hasSession: false };

const jwtExp = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
};

// Module-level singleton — prevents concurrent refreshSession() races when
// multiple invokeAuthedFunction calls fire in parallel (e.g. Promise.all).
// All callers share the same in-flight refresh promise instead of each
// triggering their own, which could cause one to receive a stale token.
let pendingRefresh: Promise<string | null> | null = null;

async function resolveAccessToken(): Promise<AccessTokenResolution> {
  const sessionResult = await supabase.auth.getSession();
  const existing = sessionResult.data.session?.access_token ?? null;
  if (existing) {
    const exp = jwtExp(existing);
    const secondsLeft = exp !== null ? exp - Math.floor(Date.now() / 1000) : Infinity;
    // Token is fresh enough — use it directly
    if (secondsLeft > 60) return { token: existing, hasSession: true };
  }
  // Token is expired, near expiry, or missing — force a refresh (deduplicated)
  if (!pendingRefresh) {
    pendingRefresh = supabase.auth.refreshSession()
      .then((result) => result.data.session?.access_token ?? null)
      .finally(() => { pendingRefresh = null; });
  }
  const refreshedToken = await pendingRefresh;
  if (refreshedToken) return { token: refreshedToken, hasSession: true };
  // Refresh failed — fall back to whatever session token exists (retry logic handles 401)
  if (existing) return { token: existing, hasSession: true };
  return { token: null, hasSession: false };
}

const tokenLooksJwt = (token: string) => token.split(".").length === 3;

async function normalizeInvokeError(error: Error | null): Promise<Error | null> {
  if (!error) return null;
  const maybeContext = (error as { context?: Response }).context;
  if (!maybeContext) return error;
  try {
    const response = maybeContext.clone();
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string; code?: string } | null;
    const payloadMessage = String(payload?.error || payload?.code || payload?.message || "").trim();
    const normalized = payloadMessage || error.message;
    const withStatus = `http_${response.status}:${normalized}`;
    return new Error(withStatus);
  } catch {
    try {
      const response = maybeContext.clone();
      const withStatus = `http_${response.status}:${error.message}`;
      return new Error(withStatus);
    } catch {
      return error;
    }
  }
}

export async function invokeAuthedFunction<T = unknown>(
  functionName: string,
  args: InvokeArgs = {},
): Promise<{ data: T | null; error: Error | null }> {
  const resolved = await resolveAccessToken();
  let token = resolved.token;
  if (import.meta.env.DEV) {
    console.debug("[invokeAuthedFunction] preflight", {
      functionName,
      hasSession: resolved.hasSession,
      hasToken: Boolean(token),
      tokenParts: token ? token.split(".").length : 0,
      hasAnonKey: Boolean(anonKey),
      anonKeyPrefix: anonKey ? anonKey.slice(0, 16) : "missing",
    });
  }
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    const refreshedToken = refreshed.data.session?.access_token ?? null;
    if (!refreshedToken || !tokenLooksJwt(refreshedToken)) {
      return {
        data: null,
        error: new Error("auth_required"),
      };
    }
    token = refreshedToken;
  }
  if (!token || !tokenLooksJwt(token)) {
    return {
      data: null,
      error: new Error("auth_required"),
    };
  }

  const firstToken = token;

  const baseHeaders = { ...(args.headers || {}) };
  if (anonKey) {
    baseHeaders.apikey = baseHeaders.apikey || anonKey;
  }
  if (!String(baseHeaders.apikey || "").trim()) {
    return {
      data: null,
      error: new Error("auth_required"),
    };
  }

  // Use raw fetch instead of supabase.functions.invoke() to avoid the SDK
  // auto-injecting x-client-info / x-supabase-client-platform headers, which
  // cause CORS preflight failures on remote when the gateway's cached
  // Access-Control-Allow-Headers list doesn't include them.
  const fnUrl = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/functions/v1/${functionName}`;
  const invokeWithToken = async (token: string): Promise<{ data: unknown; error: Error | null }> => {
    try {
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          ...baseHeaders,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args.body ?? null),
      });
      const payload = await res.json().catch(() => null) as unknown;
      if (!res.ok) {
        const errMsg = (payload as { error?: string } | null)?.error || `http_${res.status}`;
        return { data: null, error: new Error(errMsg) };
      }
      return { data: payload, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const first = await invokeWithToken(firstToken);
  if (import.meta.env.DEV) {
    console.debug("[invokeAuthedFunction] first invoke headers proof", {
      functionName,
      hasAuthorizationHeader: true,
      authorizationPrefix: "Bearer",
      hasApiKeyHeader: Boolean(baseHeaders.apikey),
      apikeyPrefix: String(baseHeaders.apikey).slice(0, 16),
      firstError: first.error?.message || null,
    });
  }

  if (!first.error || !authErrorPattern.test(first.error.message || "")) {
    const normalizedFirstError = await normalizeInvokeError(first.error as Error | null);
    return {
      data: (first.data ?? null) as T | null,
      error: normalizedFirstError,
    };
  }

  const refreshed = await supabase.auth.refreshSession();
  const retryToken = refreshed.data.session?.access_token ?? null;
  if (!retryToken || retryToken === firstToken) {
    const normalizedFirstError = await normalizeInvokeError(first.error as Error | null);
    return {
      data: (first.data ?? null) as T | null,
      error: normalizedFirstError,
    };
  }

  if (!tokenLooksJwt(retryToken)) {
    return {
      data: null,
      error: new Error("auth_required"),
    };
  }

  const retry = await invokeWithToken(retryToken);
  if (import.meta.env.DEV) {
    console.debug("[invokeAuthedFunction] retry invoke headers proof", {
      functionName,
      hasAuthorizationHeader: true,
      authorizationPrefix: "Bearer",
      hasApiKeyHeader: Boolean(baseHeaders.apikey),
      apikeyPrefix: String(baseHeaders.apikey).slice(0, 16),
      tokenChanged: retryToken !== firstToken,
      retryError: retry.error?.message || null,
    });
  }

  const normalizedRetryError = await normalizeInvokeError(retry.error as Error | null);
  return {
    data: (retry.data ?? null) as T | null,
    error: normalizedRetryError,
  };
}
