const TURNSTILE_NATIVE_URL = "https://huddle.pet/turnstile-native.html";

export const DEFAULT_NATIVE_TURNSTILE_SITE_KEY = "0x4AAAAAAC1AMILxX8-lFNmm";

export type NativeTurnstileAction =
  | "support_ticket"
  | "reset_password"
  | "change_password"
  | "send_pre_signup_verify"
  | "signup";

export function createNativeTurnstileUrl(siteKey: string, action: NativeTurnstileAction) {
  const params = new URLSearchParams({
    action,
    siteKey: siteKey || DEFAULT_NATIVE_TURNSTILE_SITE_KEY,
  });
  return `${TURNSTILE_NATIVE_URL}?${params.toString()}`;
}

export function createNativeTurnstileSource(siteKey: string, action: NativeTurnstileAction) {
  return {
    uri: createNativeTurnstileUrl(siteKey, action),
  };
}
