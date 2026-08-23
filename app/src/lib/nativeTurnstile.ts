const TURNSTILE_NATIVE_URL = "https://huddle.pet/turnstile-native.html";

// Turnstile site keys are public identifiers. Keep native and the hosted wrapper
// on one proven key so a stale build-time environment cannot break every auth flow.
export const DEFAULT_NATIVE_TURNSTILE_SITE_KEY = "0x4AAAAAAC1AMILxX8-lFNmm";

export const getNativeTurnstileSiteKey = () => DEFAULT_NATIVE_TURNSTILE_SITE_KEY;

export function requireNativeTurnstileSiteKey(surface = "native") {
  const siteKey = getNativeTurnstileSiteKey();
  if (siteKey) return siteKey;
  const message = `Missing Turnstile site key for ${surface}. Set EXPO_PUBLIC_TURNSTILE_SITE_KEY.`;
  if (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_ALLOW_MISSING_TURNSTILE_IN_DEV === "1"
  ) {
    console.warn(message);
    return "";
  }
  throw new Error(message);
}

export type NativeTurnstileAction =
  | "support_ticket"
  | "reset_password"
  | "change_password"
  | "send_pre_signup_verify"
  | "signup";

export function createNativeTurnstileUrl(siteKey: string, action: NativeTurnstileAction, hidden = false) {
  const params = new URLSearchParams({
    action,
    siteKey,
  });
  if (hidden) params.set("appearance", "interaction-only");
  return `${TURNSTILE_NATIVE_URL}?${params.toString()}`;
}

export function createNativeTurnstileSource(siteKey: string, action: NativeTurnstileAction, hidden = false) {
  return {
    uri: createNativeTurnstileUrl(siteKey, action, hidden),
  };
}
