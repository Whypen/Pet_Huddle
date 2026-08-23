import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sourceFiles = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = resolve(directory, name);
  if (statSync(path).isDirectory()) return sourceFiles(path);
  return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) ? [path] : [];
});

const sources = () => sourceFiles(appSrc).map((path) => ({
  path,
  relativePath: relative(appSrc, path),
  source: readFileSync(path, "utf8"),
}));

describe("permission callsite and CTA contract", () => {
  it("has no direct Expo permission request outside the shared wrappers", () => {
    const allowed = new Set([
      "lib/nativeLocation.ts",
      "lib/nativeMediaPermissions.ts",
      "lib/nativeNotificationPermissions.ts",
      "lib/nativeContactPermissions.ts",
    ]);
    const forbidden = /\.(?:getForegroundPermissionsAsync|requestForegroundPermissionsAsync|getCameraPermissionsAsync|requestCameraPermissionsAsync|getMediaLibraryPermissionsAsync|requestMediaLibraryPermissionsAsync|getPermissionsAsync|requestPermissionsAsync)\s*\(/;
    const violations = sources()
      .filter((file) => !allowed.has(file.relativePath) && forbidden.test(file.source))
      .map((file) => file.relativePath);

    expect(violations).toEqual([]);
  });

  it("publishes every direct VisionCamera read/request into the shared camera truth", () => {
    const verify = sources().find((file) => file.relativePath === "screens/NativeVerifyIdentityScreen.tsx")?.source ?? "";
    expect(verify).toMatch(/Camera\.getCameraPermissionStatus\(\);\s*publishNativeCameraPermissionStatus\(status\)/);
    const requests = [...verify.matchAll(/Camera\.requestCameraPermission\(\)/g)];
    const publishes = [...verify.matchAll(/publishNativeCameraPermissionStatus\((?:permission|nextPermission)\)/g)];
    expect(requests).toHaveLength(2);
    expect(publishes).toHaveLength(2);
  });

  it("refreshes all OS permission truths when the app returns from Settings", () => {
    const root = sources().find((file) => file.relativePath === "navigation/RootNavigator.tsx")?.source ?? "";
    for (const refresh of [
      "getNativeForegroundLocationPermissionDetail()",
      "getNativeCameraPermissionDetail()",
      "getNativePhotoLibraryPermissionDetail()",
      "getNativeMediaLibrarySavePermissionDetail()",
      "getNativeContactPermissionDetail()",
      "getNativeNotificationPermissionDetail()",
    ]) expect(root).toContain(refresh);
    expect(root).toMatch(/const refreshPermissionTruth = \(\) => \{[\s\S]*AppState\.addEventListener\("change", \(state\) => \{[\s\S]*state === "active"\) refreshPermissionTruth\(\)/);
  });

  it("keeps Discover's permission CTA connected to request and Settings paths", () => {
    const chats = sources().find((file) => file.relativePath === "screens/NativeChatsScreen.tsx")?.source ?? "";
    expect(chats).toContain("Turn On Location");
    expect(chats).toContain("Open huddle Settings");
    expect(chats).toMatch(/if \(discoverLocationPermission\.canAskAgain\) \{[\s\S]*requestNativeForegroundLocationPermissionDetail\(\)[\s\S]*return;[\s\S]*openNativeAppSettings\(\)/);
    expect(chats).toMatch(/requestNativeForegroundLocationPermissionDetail\(\)/);
  });

  it("keeps the account push toggle tied to OS permission truth and notification settings", () => {
    const account = sources().find((file) => file.relativePath === "screens/NativeProfileSummaryScreen.tsx")?.source ?? "";
    expect(account).toMatch(/prefs\.push_enabled && notificationPermission\?\.state === "granted"/);
    expect(account).toContain("handlePushToggle(!row.enabled)");
    expect(account).toMatch(/if \(!current\.canAskAgain\) \{[\s\S]*openNativeNotificationSettings\(Constants\.expoConfig\?\.android\?\.package\)/);
    expect(account).toMatch(/requestNativeNotificationPermissionDetail\(\)[\s\S]*requested\.state === "granted"\) await enablePush\(\)/);
    expect(account).toContain("Turn on Notifications for huddle in Settings.");
  });

  it("routes every permanently denied permission flow to its closest supported Settings destination", () => {
    const byPath = new Map(sources().map((file) => [file.relativePath, file.source]));
    const contacts = byPath.get("components/contacts/NativeContactFriendsSheet.tsx") ?? "";
    const friends = byPath.get("components/friends/NativeHuddleFriendsSheet.tsx") ?? "";
    const care = byPath.get("components/service/NativeCareUpdateSheet.tsx") ?? "";
    const serviceChat = byPath.get("screens/NativeServiceChatScreen.tsx") ?? "";
    const locationButton = byPath.get("components/NativeLocationPinButton.tsx") ?? "";
    const identity = byPath.get("screens/NativeVerifyIdentityScreen.tsx") ?? "";
    const share = byPath.get("components/share/NativeShareCardModal.tsx") ?? "";
    const careCard = byPath.get("components/service/ServiceCareUpdateCard.tsx") ?? "";
    const polaroid = byPath.get("components/service/CareUpdatePolaroid.tsx") ?? "";

    expect(contacts).toContain("Turn on Contacts for huddle in Settings.");
    expect(friends).toMatch(/permission\?\.canAskAgain === false[\s\S]*Turn on Camera for huddle in Settings[\s\S]*openNativeAppSettings\(\)/);
    for (const cameraOwner of [care, serviceChat]) {
      expect(cameraOwner).toMatch(/!current\.canAskAgain[\s\S]*Turn on Camera for huddle in Settings\.[\s\S]*openNativeAppSettings\(\)/);
    }
    expect(locationButton).toMatch(/permanentlyDenied[\s\S]*Turn on Location for huddle in Settings\.[\s\S]*openNativeAppSettings\(\)/);
    expect(locationButton).toMatch(/result\.reason === "services"[\s\S]*openNativeLocationSettings\(\)/);
    expect(identity).toContain("Turn on Camera for huddle in Settings.");
    expect(identity).toContain('permissionDenied\n    ? "Open huddle Settings"');
    for (const photoOwner of [share, careCard, polaroid]) {
      expect(photoOwner).toMatch(/!current\.canAskAgain[\s\S]*Turn on Photos for huddle in Settings\.[\s\S]*openNativeAppSettings\(\)/);
    }
  });
});
