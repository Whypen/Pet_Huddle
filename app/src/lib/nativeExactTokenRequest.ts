import { supabaseAnonKey, supabaseUrl } from "./supabase";

export type NativeExactTokenError = {
  code?: string | null;
  message: string;
  status: number;
};

const parseJsonSafely = (raw: string): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const errorMessage = (parsed: unknown, fallback: string) => {
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    return String((parsed as { message?: unknown }).message || fallback);
  }
  return typeof parsed === "string" && parsed ? parsed : fallback;
};

export const nativeExactTokenRpc = async <T = unknown>(
  fn: string,
  params: Record<string, unknown> = {},
  accessToken?: string | null,
): Promise<{ data: T | null; error: NativeExactTokenError | null }> => {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { data: null, error: { code: "missing_access_token", message: "missing_access_token", status: 401 } };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(params),
  });
  const raw = await response.text();
  const parsed = parseJsonSafely(raw);
  if (!response.ok) {
    return {
      data: null,
      error: {
        code: parsed && typeof parsed === "object" && "code" in parsed ? String((parsed as { code?: unknown }).code || "") : null,
        message: errorMessage(parsed, response.statusText),
        status: response.status,
      },
    };
  }
  return { data: parsed as T, error: null };
};

