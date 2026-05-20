import { supabaseAnonKey } from "./supabase";

const jwtExp = (token: string): number | null => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    if (typeof atob !== "function") return null;
    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
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

export const createNativeFunctionHeaders = (accessToken?: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
  };

  const normalizedAccessToken = String(accessToken || "").trim();
  if (isUsableUserJwt(normalizedAccessToken)) {
    headers["x-huddle-access-token"] = normalizedAccessToken;
  }

  return headers;
};
