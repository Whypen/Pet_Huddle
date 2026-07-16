import type { Session } from "@supabase/supabase-js";
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

type NativeAuthTransportLogContext = {
  functionName?: string;
  routeToken?: string | null;
};

let pendingNativeSessionRefresh: Promise<Session | null> | null = null;

const clean = (value: unknown) => String(value || "").trim();

const sessionHasUsableToken = (session: Session | null | undefined): session is Session =>
  Boolean(session?.access_token && session.user?.id && isUsableAuthenticatedUserJwt(session.access_token));

const refreshNativeSessionOnce = async (): Promise<Session | null> => {
  if (!pendingNativeSessionRefresh) {
    pendingNativeSessionRefresh = supabase.auth.refreshSession()
      .then(({ data, error }) => (error ? null : data.session ?? null))
      .finally(() => {
        pendingNativeSessionRefresh = null;
      });
  }
  return pendingNativeSessionRefresh;
};

export async function getFreshNativeSession(preferredSession?: Session | null): Promise<NativeFreshSessionResult | null> {
  const { data } = await supabase.auth.getSession();
  if (sessionHasUsableToken(data.session)) {
    return {
      accessToken: data.session.access_token,
      session: data.session,
      userId: data.session.user.id,
    };
  }

  const refreshed = await refreshNativeSessionOnce();
  if (sessionHasUsableToken(refreshed)) {
    return {
      accessToken: refreshed.access_token,
      session: refreshed,
      userId: refreshed.user.id,
    };
  }

  if (sessionHasUsableToken(preferredSession)) {
    return {
      accessToken: preferredSession.access_token,
      session: preferredSession,
      userId: preferredSession.user.id,
    };
  }

  return null;
}

export async function getFreshNativeAccessToken(preferredAccessToken?: string | null): Promise<string> {
  const fresh = await getFreshNativeSession();
  if (fresh?.accessToken) return fresh.accessToken;
  const preferred = clean(preferredAccessToken);
  return isUsableAuthenticatedUserJwt(preferred) ? preferred : "";
}

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
  const token = fresh?.accessToken || (isUsableAuthenticatedUserJwt(clean(accessToken)) ? clean(accessToken) : "");
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

export const createNativeFunctionHeaders = (): Record<string, string> => ({
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
});
