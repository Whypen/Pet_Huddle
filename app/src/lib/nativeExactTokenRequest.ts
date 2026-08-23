import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchWithNativeTimeout, isNativeRequestTimeoutError } from "./nativeTimeout";

const NATIVE_EXACT_TOKEN_RPC_TIMEOUT_MS = 10000;

export type NativeExactTokenError = {
  code?: string | null;
  message: string;
  status: number;
};

type NativeExactTokenOptions = {
  expectedUserId?: string | null;
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
  options: NativeExactTokenOptions = {},
): Promise<{ data: T | null; error: NativeExactTokenError | null }> => {
  const token = await getFreshNativeAccessToken(accessToken, options.expectedUserId);
  if (!token) {
    return { data: null, error: { code: "missing_access_token", message: "missing_access_token", status: 401 } };
  }

  const result = await fetchWithNativeTimeout(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
    }),
    body: JSON.stringify(params),
  }, NATIVE_EXACT_TOKEN_RPC_TIMEOUT_MS);
  if (!result.ok) {
    return {
      data: null,
      error: {
        code: result.timedOut ? "rpc_timeout" : "rpc_network_error",
        message: result.timedOut ? "request_timeout" : String((result.error as { message?: unknown })?.message || "network_error"),
        status: 0,
      },
    };
  }
  const response = result.response;
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    return {
      data: null,
      error: {
        code: isNativeRequestTimeoutError(error) ? "rpc_timeout" : "rpc_network_error",
        message: isNativeRequestTimeoutError(error) ? "request_timeout" : String((error as { message?: unknown })?.message || "network_error"),
        status: 0,
      },
    };
  }
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
