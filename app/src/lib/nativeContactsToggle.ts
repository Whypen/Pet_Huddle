import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNativeContactPermissionDetail, requestNativeContactPermissionDetail } from "./nativeContactPermissions";
import { openNativeAppSettings } from "./nativeLocation";
import { nativeContactsTogglePreferenceKey, type NativeContactsToggleIntent } from "./nativeContactsTogglePolicy";

export { nativeContactsTogglePreferenceKey, resolveNativeContactsToggleIntent } from "./nativeContactsTogglePolicy";
export type { NativeContactsToggleIntent } from "./nativeContactsTogglePolicy";

export async function readNativeContactsTogglePreference(userId?: string | null): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(nativeContactsTogglePreferenceKey(userId))) !== "off";
  } catch {
    return true;
  }
}

export async function writeNativeContactsTogglePreference(userId: string | null | undefined, enabled: boolean) {
  try {
    await AsyncStorage.setItem(nativeContactsTogglePreferenceKey(userId), enabled ? "on" : "off");
  } catch {
    // A lost preference only means the toggle re-derives from the OS grant.
  }
}

// Re-read on mount and on foreground: contacts access can be revoked in system
// settings while the app is backgrounded, and a toggle that keeps showing ON
// after that is lying about what the app can actually see.
export async function readNativeContactsToggleEnabled(userId?: string | null): Promise<boolean> {
  const detail = await getNativeContactPermissionDetail();
  if (detail.status !== "granted") return false;
  return readNativeContactsTogglePreference(userId);
}

export async function applyNativeContactsToggleIntent(
  intent: NativeContactsToggleIntent,
  userId?: string | null,
): Promise<boolean> {
  if (intent === "disable") {
    await writeNativeContactsTogglePreference(userId, false);
    return false;
  }
  if (intent === "open-settings") {
    await openNativeAppSettings();
    return false;
  }
  if (intent === "enable") {
    await writeNativeContactsTogglePreference(userId, true);
    return true;
  }
  const granted = (await requestNativeContactPermissionDetail()).status === "granted";
  await writeNativeContactsTogglePreference(userId, granted);
  return granted;
}
