import { supabase } from "@/integrations/supabase/client";

const appEnv = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").toLowerCase();
const isLocalSupabaseEndpoint =
  supabaseUrl.includes("127.0.0.1:54321") || supabaseUrl.includes("localhost:54321");
const isTestingMode =
  import.meta.env.MODE === "test" ||
  appEnv === "test" ||
  appEnv === "testing" ||
  String(import.meta.env.VITE_E2E_MODE ?? "false") === "true";
const explicitShortcutFlag = String(import.meta.env.VITE_TEST_OTP_SHORTCUT ?? "").toLowerCase();
const shortcutEnabledByDefault = explicitShortcutFlag === ""
  ? isLocalSupabaseEndpoint
  : explicitShortcutFlag === "true";
const TEST_OTP_SHORTCUT_ENABLED =
  import.meta.env.PROD === false &&
  (
    (isLocalSupabaseEndpoint && explicitShortcutFlag !== "false") ||
    explicitShortcutFlag === "true" ||
    isTestingMode
  );
const TEST_OTP_SHORTCUT_CODE = "498005";

export async function requestPhoneOtp(phone: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = phone.trim();
  if (!normalized) {
    return { ok: false, error: "Phone number is required." };
  }

  if (TEST_OTP_SHORTCUT_ENABLED) {
    return { ok: true };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      phone: normalized,
      options: {
        channel: "sms",
        shouldCreateUser: false,
      },
    });
    if (error) {
      return { ok: false, error: error.message || "Failed to send OTP." };
    }
  } catch {
    return { ok: false, error: "Unable to reach OTP service. Please try again." };
  }

  return { ok: true };
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const normalizedPhone = phone.trim();
  const normalizedToken = token.trim();
  if (!normalizedPhone || !normalizedToken) {
    return { ok: false, error: "OTP code is required." };
  }

  if (TEST_OTP_SHORTCUT_ENABLED) {
    if (normalizedToken !== TEST_OTP_SHORTCUT_CODE) {
      return { ok: false, error: "Invalid code" };
    }
    return { ok: true };
  }

  try {
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: normalizedToken,
      type: "sms",
    });
    if (error) {
      return { ok: false, error: error.message || "Invalid code" };
    }
  } catch {
    return { ok: false, error: "Unable to verify code right now. Please retry." };
  }

  return { ok: true };
}
