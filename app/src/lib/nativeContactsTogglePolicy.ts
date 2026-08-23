import type { NativePermissionDetail } from "./nativePermissionState";

// Pure policy, deliberately free of expo/AsyncStorage imports so it stays
// unit-testable without the native module chain.
export type NativeContactsToggleIntent = "enable" | "request" | "open-settings" | "disable";

export const nativeContactsTogglePreferenceKey = (userId?: string | null) => (
  `native-contacts-toggle:${String(userId || "anon")}`
);

// The toggle mirrors two facts, not one: the OS permission (which the app can
// never revoke from inside) and the user's own on/off choice.
export const resolveNativeContactsToggleIntent = (
  enabled: boolean,
  detail: NativePermissionDetail,
): NativeContactsToggleIntent => {
  if (enabled) return "disable";
  if (detail.state === "granted") return "enable";
  // A permanent denial can no longer raise the OS sheet, so the only remaining
  // route is the closest settings page the platform will open for us.
  return detail.canAskAgain ? "request" : "open-settings";
};
