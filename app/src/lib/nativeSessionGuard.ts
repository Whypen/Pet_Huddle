import type { Session } from "@supabase/supabase-js";

export type NativeCurrentSession = {
  accessToken: string;
  sessionKey: string;
  userId: string;
};

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const decodeNativeJwtSubject = (accessToken?: string | null) => {
  const token = cleanString(accessToken);
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = globalThis.atob(padded);
    const parsed = JSON.parse(decoded) as { sub?: unknown };
    return cleanString(parsed.sub) || null;
  } catch {
    return null;
  }
};

const validateNativeSessionKey = (sessionKey: string, userId: string) => {
  if (!sessionKey) return false;
  if (!sessionKey.startsWith(`${userId}:`)) return false;
  if (sessionKey.split(".").length >= 3) return false;
  return true;
};

export function requireCurrentNativeSession(options: {
  accessToken?: string | null;
  expectedUserId?: string | null;
  session?: Session | null;
  sessionKey?: string | null;
}): NativeCurrentSession {
  const sessionUserId = cleanString(options.session?.user?.id);
  const expectedUserId = cleanString(options.expectedUserId);
  const userId = sessionUserId || expectedUserId;
  const accessToken = cleanString(options.accessToken) || cleanString(options.session?.access_token);
  const sessionKey = cleanString(options.sessionKey);

  if (!userId || !accessToken || !sessionKey) {
    throw new Error("native_session_required");
  }

  const tokenSubject = decodeNativeJwtSubject(accessToken);
  if (!tokenSubject || tokenSubject !== userId) {
    throw new Error("native_session_user_mismatch");
  }

  if (expectedUserId && expectedUserId !== userId) {
    throw new Error("native_session_user_mismatch");
  }

  if (!validateNativeSessionKey(sessionKey, userId)) {
    throw new Error("native_session_key_mismatch");
  }

  return { accessToken, sessionKey, userId };
}

export const isCurrentNativeSessionKey = (
  currentSessionKey: string | null | undefined,
  requestSessionKey: string | null | undefined,
) => Boolean(currentSessionKey && requestSessionKey && currentSessionKey === requestSessionKey);

export const nativeSafeWriteErrorMessage = (error: unknown, fallback: string) => {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("row-level security") ||
    normalized.includes("violates row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    normalized.includes("jwt") ||
    normalized.includes("auth") ||
    normalized.includes("native_session_")
  ) {
    return "Please sign in again and retry.";
  }
  return fallback;
};
