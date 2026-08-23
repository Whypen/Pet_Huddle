import { createFreshNativeFunctionHeaders, getFreshNativeAccessToken, getFreshNativeSession, jwtExp } from "./nativeFunctionClient";
import { supabaseUrl } from "./supabase";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

type NativeAuthTransportSelfTestStep = {
  name: string;
  ok: boolean;
  status: number | null;
  errorCode: string | null;
};

type NativeAuthTransportSelfTestResult = {
  ok: boolean;
  steps: NativeAuthTransportSelfTestStep[];
};

declare global {
  // Dev-only hook for device runtime auth transport proof from Metro console.
  // It is intentionally absent in production.
  var __HUDDLE_AUTH_TRANSPORT_SELF_TEST__: (() => Promise<NativeAuthTransportSelfTestResult>) | undefined;
}

const KNOWN_BAD_ROUTE_TOKEN = "stale.route.token";
const readErrorCode = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { error?: unknown; code?: unknown }).error ?? (payload as { code?: unknown }).code;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const postProtectedFunction = async (
  name: string,
  body: Record<string, unknown>,
  success: (status: number) => boolean,
): Promise<NativeAuthTransportSelfTestStep> => {
  try {
    const headers = await createFreshNativeFunctionHeaders(KNOWN_BAD_ROUTE_TOKEN, {
      functionName: name,
      routeToken: KNOWN_BAD_ROUTE_TOKEN,
    });
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    const errorCode = readErrorCode(payload);
    const ok = success(response.status) && response.status !== 401 && response.status !== 403;
    console.log("NATIVE_AUTH_TRANSPORT_SELF_TEST_STEP", {
      errorCode,
      functionName: name,
      ok,
      status: response.status,
    });
    return { name, ok, status: response.status, errorCode };
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "network_error";
    console.log("NATIVE_AUTH_TRANSPORT_SELF_TEST_STEP", {
      errorCode,
      functionName: name,
      ok: false,
      status: null,
    });
    return { name, ok: false, status: null, errorCode };
  }
};

export const runNativeAuthTransportSelfTest = async (): Promise<NativeAuthTransportSelfTestResult> => {
  const freshSession = await getFreshNativeSession();
  const freshToken = await getFreshNativeAccessToken(KNOWN_BAD_ROUTE_TOKEN);
  const hasSession = Boolean(freshSession?.session);
  const tokenReady = Boolean(freshToken);
  console.log("NATIVE_AUTH_TRANSPORT_SELF_TEST_START", {
    freshTokenExp: jwtExp(freshToken),
    hasSupabaseSession: hasSession,
    routeTokenExp: jwtExp(KNOWN_BAD_ROUTE_TOKEN),
    tokenReady,
  });

  const steps: NativeAuthTransportSelfTestStep[] = [];
  steps.push({
    name: "fresh-token",
    ok: hasSession && tokenReady,
    status: null,
    errorCode: tokenReady ? null : "missing_fresh_token",
  });
  if (!tokenReady) {
    const result = { ok: false, steps };
    console.log("NATIVE_AUTH_TRANSPORT_SELF_TEST_RESULT", result);
    return result;
  }

  steps.push(await postProtectedFunction("native-verify-identity-document", {
    action: "confirm_document",
  }, (status) => status >= 400 && status < 500));
  steps.push(await postProtectedFunction("verify-human-challenge", { action: "get" }, (status) => status === 200));
  steps.push(await postProtectedFunction("verify-human-challenge", {
    action: "complete",
    attemptId: "00000000-0000-0000-0000-000000000000",
    resultPayload: {},
    score: 0.99,
    status: "passed",
  }, (status) => status >= 400 && status < 500));
  steps.push(await postProtectedFunction("submit-support-ticket", { action: "auth_probe" }, (status) => status === 200));
  steps.push(await postProtectedFunction("delete-account", { action: "auth_probe" }, (status) => status === 200));
  steps.push(await postProtectedFunction("auth-change-password", { turnstile_action: "auth_probe" }, (status) => status === 200));
  steps.push(await postProtectedFunction("send-phone-otp", {
    phone: "",
    turnstile_action: "send_pre_signup_verify",
    turnstile_token: "",
    verification_context: "verify_identity",
  }, (status) => status >= 400 && status < 500));

  const result = { ok: steps.every((step) => step.ok), steps };
  console.log("NATIVE_AUTH_TRANSPORT_SELF_TEST_RESULT", result);
  return result;
};

export const installNativeAuthTransportSelfTestGlobal = () => {
  if (typeof __DEV__ === "boolean" && !__DEV__) return;
  globalThis.__HUDDLE_AUTH_TRANSPORT_SELF_TEST__ = runNativeAuthTransportSelfTest;
};
