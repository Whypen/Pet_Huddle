import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { publishNativePermissionDetail, subscribeNativePermissionDetail, type NativePermissionDetail } from "./nativePermissionState";

const mapNotificationPermission = (permission: Notifications.NotificationPermissionsStatus) => ({
  canAskAgain: permission.canAskAgain !== false,
  state: permission.granted || permission.status === "granted" ? "granted" as const : permission.status === "denied" ? "denied" as const : "unknown" as const,
});

export async function getNativeNotificationPermissionDetail() {
  return publishNativePermissionDetail("notifications", mapNotificationPermission(await Notifications.getPermissionsAsync()));
}

export const subscribeNativeNotificationPermission = (listener: (detail: NativePermissionDetail) => void) =>
  subscribeNativePermissionDetail("notifications", listener);

export async function requestNativeNotificationPermissionDetail() {
  const current = await getNativeNotificationPermissionDetail();
  if (current.state === "granted" || !current.canAskAgain) return current;
  return publishNativePermissionDetail("notifications", mapNotificationPermission(await Notifications.requestPermissionsAsync()));
}

export async function openNativeNotificationSettings(androidPackage?: string | null) {
  if (Platform.OS === "android" && androidPackage && typeof Linking.sendIntent === "function") {
    try {
      await Linking.sendIntent("android.settings.APP_NOTIFICATION_SETTINGS", [
        { key: "android.provider.extra.APP_PACKAGE", value: androidPackage },
      ]);
      return;
    } catch {
      // Fall back to huddle's app settings when a device does not expose the notification panel.
    }
  }
  await Linking.openSettings();
}
