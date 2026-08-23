import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase, supabaseAnonKey } from "./supabase";

export const jwtExp = (token: string): number | null => {
  try {
    const payload = jwtPayload(token);
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
};

const jwtPayload = (token: string): Record<string, unknown> => {
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return {};
  const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  if (typeof atob !== "function") return {};
  const decoded = atob(padded);
  return JSON.parse(decoded) as Record<string, unknown>;
};

export const tokenLooksJwt = (token: string | null | undefined): token is string =>
  typeof token === "string" && token.trim().split(".").length === 3;

export const isUsableUserJwt = (token: string | null | undefined): token is string => {
  const normalized = String(token || "").trim();
  if (!tokenLooksJwt(normalized)) return false;
  const exp = jwtExp(normalized);
  if (exp === null) return true;
  return exp - Math.floor(Date.now() / 1000) > 60;
};

export const isUsableAuthenticatedUserJwt = (token: string | null | undefined): token is string => {
  const normalized = clean(token);
  if (!isUsableUserJwt(normalized)) return false;
  const payload = jwtPayload(normalized);
  const role = String(payload.role || "").toLowerCase();
  const sub = clean(payload.sub);
  return role === "authenticated" && Boolean(sub);
};

type NativeFreshSessionResult = {
  accessToken: string;
  session: Session;
  userId: string;
};

export type NativeAuthSessionTokens = {
  access_token: string;
  refresh_token: string;
};

type NativeAuthTransportLogContext = {
  functionName?: string;
  routeToken?: string | null;
};

let pendingNativeSessionRefresh: Promise<Session | null> | null = null;
let pendingNativeSessionRefreshKey: string | null = null;
let pendingNativeSessionResolve: Promise<Session | null> | null = null;
let currentNativeSession: Session | null = null;
let nativeAuthEpoch = 0;
let nativeAuthRefreshForeground = false;
const nativeAuthStateListeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
let nativeAuthStateUnsubscribe: (() => void) | null = null;

const clean = (value: unknown) => String(value || "").trim();

// supabase.auth.getSession()/refreshSession() are plain SDK calls with no built-in timeout.
// Every screen's data load funnels through getFreshNativeAccessToken -> here, so a single
// hung call (dropped connection, backgrounded app, flaky network) would otherwise wedge the
// shared pendingNativeSessionResolve/pendingNativeSessionRefresh singletons forever, and every
// future caller across the whole app would join and hang on that same dead promise — a stuck
// spinner on any screen with no way to recover short of an app restart. This bounds the WAIT
// for a caller, without touching the underlying single-flight request: if the real call later
// resolves, rememberNativeSession still applies it normally; if it never resolves, every caller
// (including new ones) gets a bounded "not available yet" instead of an infinite hang. Kept well
// under the RPC-fetch layer's own 10s budget (nativeExactTokenRequest.ts) — and note this can be
// hit twice in sequence (getSession, then refreshSession), so the per-layer value directly sets
// the worst-case total wait before a stuck screen finally shows a retryable error.
const NATIVE_AUTH_SESSION_TIMEOUT_MS = 5000;
const raceNativeAuthTimeout = <T,>(promise: Promise<T>, fallback: T): Promise<T> => new Promise<T>((resolve) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    resolve(fallback);
  }, NATIVE_AUTH_SESSION_TIMEOUT_MS);
  promise.then((value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(value);
  }, () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(fallback);
  });
});

const sessionHasUsableToken = (session: Session | null | undefined): session is Session =>
  Boolean(session?.access_token && session.user?.id && isUsableAuthenticatedUserJwt(session.access_token));

const sessionMatchesExpectedUser = (session: Session | null | undefined, expectedUserId?: string | null) => {
  const expected = clean(expectedUserId);
  return !expected || clean(session?.user?.id) === expected;
};

const rememberNativeSession = (
  session: Session | null | undefined,
  expectedEpoch?: number,
): Session | null => {
  if (expectedEpoch !== undefined && expectedEpoch !== nativeAuthEpoch) return currentNativeSession;
  currentNativeSession = session?.user?.id ? session : null;
  return currentNativeSession;
};

export const noteNativeAuthState = (session: Session | null | undefined): void => {
  const nextUserId = clean(session?.user?.id);
  const nextAccessToken = clean(session?.access_token);
  if (
    nextUserId !== clean(currentNativeSession?.user?.id) ||
    nextAccessToken !== clean(currentNativeSession?.access_token)
  ) {
    nativeAuthEpoch += 1;
  }
  rememberNativeSession(session);
};

export const clearNativeAuthState = (): void => {
  nativeAuthEpoch += 1;
  currentNativeSession = null;
  pendingNativeSessionResolve = null;
};

export const subscribeNativeAuthState = (
  listener: (event: AuthChangeEvent, session: Session | null) => void,
): (() => void) => {
  nativeAuthStateListeners.add(listener);
  if (!nativeAuthStateUnsubscribe) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      noteNativeAuthState(session);
      for (const subscriber of nativeAuthStateListeners) subscriber(event, session);
    });
    nativeAuthStateUnsubscribe = () => data.subscription.unsubscribe();
  }
  return () => {
    nativeAuthStateListeners.delete(listener);
    if (nativeAuthStateListeners.size === 0 && nativeAuthStateUnsubscribe) {
      nativeAuthStateUnsubscribe();
      nativeAuthStateUnsubscribe = null;
    }
  };
};

export const installNativeAuthSession = async (tokens: NativeAuthSessionTokens): Promise<Session> => {
  const accessToken = clean(tokens.access_token);
  const refreshToken = clean(tokens.refresh_token);
  if (!accessToken || !refreshToken || !isUsableAuthenticatedUserJwt(accessToken)) {
    throw new Error("session_missing");
  }
  nativeAuthEpoch += 1;
  const installEpoch = nativeAuthEpoch;
  currentNativeSession = null;
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  if (!data.session || !sessionHasUsableToken(data.session)) throw new Error("session_missing");
  rememberNativeSession(data.session, installEpoch);
  return data.session;
};

export const signOutNativeAuthSession = async (options?: { scope?: "global" | "local" | "others" }) => {
  try {
    return await supabase.auth.signOut(options);
  } finally {
    clearNativeAuthState();
  }
};

export const refreshNativeSessionOnce = async (
  currentSession?: Session | { refresh_token: string } | null,
): Promise<Session | null> => {
  const refreshKey = clean(currentSession?.refresh_token || currentNativeSession?.refresh_token || "shared-session");
  if (pendingNativeSessionRefresh && pendingNativeSessionRefreshKey !== refreshKey) {
    await raceNativeAuthTimeout(pendingNativeSessionRefresh.catch(() => null), null);
  }
  if (!pendingNativeSessionRefresh) {
    const refreshEpoch = nativeAuthEpoch;
    pendingNativeSessionRefreshKey = refreshKey;
    const refreshPromise = supabase.auth.refreshSession(currentSession ?? undefined)
      .then(({ data, error }) => (error ? null : rememberNativeSession(data.session, refreshEpoch)))
      .finally(() => {
        if (pendingNativeSessionRefresh === refreshPromise) {
          pendingNativeSessionRefresh = null;
          pendingNativeSessionRefreshKey = null;
        }
      });
    pendingNativeSessionRefresh = refreshPromise;
  }
  return raceNativeAuthTimeout(pendingNativeSessionRefresh, null);
};

export async function getFreshNativeSession(
  _preferredSession?: Session | null,
  expectedUserId?: string | null,
): Promise<NativeFreshSessionResult | null> {
  if (sessionHasUsableToken(currentNativeSession)) {
    if (!sessionMatchesExpectedUser(currentNativeSession, expectedUserId)) return null;
    return {
      accessToken: currentNativeSession.access_token,
      session: currentNativeSession,
      userId: currentNativeSession.user.id,
    };
  }

  if (!pendingNativeSessionResolve) {
    const resolveEpoch = nativeAuthEpoch;
    const resolvePromise = supabase.auth.getSession()
      .then(({ data, error }) => error ? null : rememberNativeSession(data.session, resolveEpoch))
      .finally(() => {
        if (pendingNativeSessionResolve === resolvePromise) pendingNativeSessionResolve = null;
      });
    pendingNativeSessionResolve = resolvePromise;
  }
  const stored = await raceNativeAuthTimeout(pendingNativeSessionResolve, null);
  if (sessionHasUsableToken(stored)) {
    if (!sessionMatchesExpectedUser(stored, expectedUserId)) return null;
    return {
      accessToken: stored.access_token,
      session: stored,
      userId: stored.user.id,
    };
  }

  const refreshed = await refreshNativeSessionOnce(stored);
  if (sessionHasUsableToken(refreshed)) {
    if (!sessionMatchesExpectedUser(refreshed, expectedUserId)) return null;
    return {
      accessToken: refreshed.access_token,
      session: refreshed,
      userId: refreshed.user.id,
    };
  }

  return null;
}

export async function getFreshNativeAccessToken(
  _preferredAccessToken?: string | null,
  expectedUserId?: string | null,
): Promise<string> {
  const fresh = await getFreshNativeSession(undefined, expectedUserId);
  if (fresh?.accessToken) return fresh.accessToken;
  return "";
}

export const setNativeAuthRefreshForeground = (foreground: boolean): void => {
  if (foreground === nativeAuthRefreshForeground) return;
  nativeAuthRefreshForeground = foreground;
  if (foreground) {
    supabase.auth.startAutoRefresh();
    return;
  }
  supabase.auth.stopAutoRefresh();
};

const nativeAuthTransportLog = (event: string, fields: Record<string, unknown>) => {
  if (typeof __DEV__ === "boolean" && !__DEV__) return;
  console.log("NATIVE_AUTH_TRANSPORT", {
    event,
    ...fields,
  });
};

export async function createFreshNativeFunctionHeaders(
  accessToken?: string | null,
  context: NativeAuthTransportLogContext = {},
): Promise<Record<string, string>> {
  const fresh = await getFreshNativeSession();
  const token = fresh?.accessToken || "";
  if (!token) throw new Error("auth_required");
  nativeAuthTransportLog("protected_headers", {
    freshTokenExp: jwtExp(token),
    functionName: context.functionName || "unknown",
    hasSupabaseSession: Boolean(fresh?.session),
    hasXHuddleAccessToken: true,
    routeTokenExp: jwtExp(context.routeToken ?? accessToken ?? ""),
    usedFreshToken: Boolean(fresh?.accessToken && fresh.accessToken === token),
  });
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-huddle-access-token": token,
  };
}

export async function createFreshNativeAuthHeaders(
  accessToken?: string | null,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await getFreshNativeAccessToken(accessToken);
  return createNativeAuthenticatedHeaders(token, extra);
}

export function createNativeAuthenticatedHeaders(
  accessToken: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = clean(accessToken);
  if (!sessionHasUsableToken(currentNativeSession) || currentNativeSession.access_token !== token) {
    throw new Error("auth_required");
  }
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

export const createNativeFunctionHeaders = (): Record<string, string> => ({
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
});
