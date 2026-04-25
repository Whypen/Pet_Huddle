import { supabase } from "@/integrations/supabase/client";

type InvokeArgs = {
  body?: unknown;
  headers?: Record<string, string>;
  forceRefresh?: boolean;
};

const authErrorPattern = /(401|unauthori[sz]ed|invalid[_\s-]?jwt|missing[_\s-]?token)/i;
const supabasePublicKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "",
).trim();

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
  // Refresh failed and existing token is stale/near expiry — force re-auth instead
  // of sending an invalid JWT repeatedly to protected edge functions.
  return { token: null, hasSession: false };
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session?.access_token ?? null;
}

async function tokenBelongsToCurrentProject(token: string): Promise<boolean> {
  try {
    const res = await supabase.auth.getUser(token);
    return Boolean(res.data.user) && !res.error;
  } catch {
    // Network exception — cannot verify project membership.
    // Return true so the caller proceeds; the edge function will reject with
    // 401/403 if the token is truly invalid, which triggers the retry path.
    // Previously returning false here caused a false auth_required on any
    // transient network hiccup → "Your session expired" for a valid session.
    return true;
  }
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
  if (args.forceRefresh) {
    const forced = await refreshAccessToken();
    if (forced && tokenLooksJwt(forced)) {
      token = forced;
    }
  }
  if (import.meta.env.DEV) {
    console.debug("[invokeAuthedFunction] preflight", {
      functionName,
      hasSession: resolved.hasSession,
      hasToken: Boolean(token),
      tokenParts: token ? token.split(".").length : 0,
      hasPublicKey: Boolean(supabasePublicKey),
      publicKeyPrefix: supabasePublicKey ? supabasePublicKey.slice(0, 16) : "missing",
    });
  }
  if (!token) {
    const refreshedToken = await refreshAccessToken();
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

  let firstToken = token;
  if (!await tokenBelongsToCurrentProject(firstToken)) {
    const refreshed = await refreshAccessToken();
    if (!refreshed || !tokenLooksJwt(refreshed) || !await tokenBelongsToCurrentProject(refreshed)) {
      return {
        data: null,
        error: new Error("auth_required"),
      };
    }
    firstToken = refreshed;
  }

  const baseHeaders = { ...(args.headers || {}) };
  if (supabasePublicKey) {
    baseHeaders.apikey = baseHeaders.apikey || supabasePublicKey;
  }
  if (!String(baseHeaders.apikey || "").trim()) {
    return {
      data: null,
      error: new Error("auth_required"),
    };
  }

  const fnUrl = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/functions/v1/${functionName}`;
  const authorizationGatewayKey = String(baseHeaders.apikey || supabasePublicKey).trim();
  const invokeWithRawFetch = async (token: string): Promise<{ data: unknown; error: Error | null }> => {
    try {
      const requestBody =
        args.body && typeof args.body === "object" && !Array.isArray(args.body)
          ? { ...(args.body as Record<string, unknown>), access_token: token }
          : { access_token: token, payload: args.body ?? null };
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          ...baseHeaders,
          Authorization: `Bearer ${authorizationGatewayKey}`,
          "x-huddle-access-token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const payload = await res.json().catch(() => null) as unknown;
      if (!res.ok) {
        const typed = (payload as { error?: string; detail?: string; code?: string; type?: string } | null) || null;
        const errorText = String(typed?.error || "").trim();
        const detailText = String(typed?.detail || "").trim();
        const codeText = String(typed?.code || "").trim();
        const reason = [errorText, detailText, codeText].filter(Boolean).join(" | ");
        const errMsg = reason || `http_${res.status}`;
        return { data: null, error: new Error(errMsg) };
      }
      return { data: payload, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  };
  const invokeWithToken = async (token: string): Promise<{ data: unknown; error: Error | null }> =>
    invokeWithRawFetch(token);

  const first = await invokeWithToken(firstToken);
  if (import.meta.env.DEV) {
    console.debug("[invokeAuthedFunction] first invoke headers proof", {
      functionName,
      hasAuthorizationHeader: true,
      authorizationPrefix: "Bearer",
      authorizationKeyPrefix: authorizationGatewayKey.slice(0, 12),
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
      authorizationKeyPrefix: authorizationGatewayKey.slice(0, 12),
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
