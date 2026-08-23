import { beforeEach, describe, expect, it, vi } from "vitest";

const permissionMocks = vi.hoisted(() => ({
  cameraGet: vi.fn(),
  cameraRequest: vi.fn(),
  locationGet: vi.fn(),
  locationRequest: vi.fn(),
  openSettings: vi.fn(),
  sendIntent: vi.fn(),
  platform: { OS: "ios" },
  notificationGet: vi.fn(),
  notificationRequest: vi.fn(),
  photoAddGet: vi.fn(),
  photoAddRequest: vi.fn(),
  photoReadGet: vi.fn(),
  photoReadRequest: vi.fn(),
}));

vi.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: permissionMocks.cameraGet,
  requestCameraPermissionsAsync: permissionMocks.cameraRequest,
  getMediaLibraryPermissionsAsync: permissionMocks.photoReadGet,
  requestMediaLibraryPermissionsAsync: permissionMocks.photoReadRequest,
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("expo-media-library", () => ({
  getPermissionsAsync: permissionMocks.photoAddGet,
  requestPermissionsAsync: permissionMocks.photoAddRequest,
}));

vi.mock("expo-location", () => ({
  PermissionStatus: { DENIED: "denied", GRANTED: "granted", UNDETERMINED: "undetermined" },
  Accuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: permissionMocks.locationGet,
  requestForegroundPermissionsAsync: permissionMocks.locationRequest,
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: permissionMocks.notificationGet,
  requestPermissionsAsync: permissionMocks.notificationRequest,
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock("react-native", () => ({
  Linking: { openSettings: permissionMocks.openSettings, sendIntent: permissionMocks.sendIntent },
  Platform: permissionMocks.platform,
}));

vi.mock("./nativeMapConfig", () => ({
  readNativeMapTokenConfig: () => ({ ok: false }),
}));

import {
  getNativeCameraPermissionDetail,
  getNativeMediaLibrarySavePermissionDetail,
  getNativePhotoLibraryPermissionDetail,
  requestNativeCameraPermissionDetail,
  requestNativeMediaLibrarySavePermission,
  requestNativePhotoLibraryPermissionDetail,
} from "./nativeMediaPermissions";
import {
  getNativeForegroundLocationPermissionDetail,
  openNativeAppSettings,
  requestNativeForegroundLocationPermissionDetail,
} from "./nativeLocation";
import {
  getNativeNotificationPermissionDetail,
  openNativeNotificationSettings,
  requestNativeNotificationPermissionDetail,
} from "./nativeNotificationPermissions";
import { readNativePermissionDetail, subscribeNativePermissionDetail } from "./nativePermissionState";

const granted = { canAskAgain: false, granted: true, status: "granted" };
const denied = { canAskAgain: false, granted: false, status: "denied" };
const askable = { canAskAgain: true, granted: false, status: "undetermined" };

describe("native OS permission wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionMocks.platform.OS = "ios";
    permissionMocks.cameraGet.mockResolvedValue(askable);
    permissionMocks.cameraRequest.mockResolvedValue(granted);
    permissionMocks.locationGet.mockResolvedValue(askable);
    permissionMocks.locationRequest.mockResolvedValue(granted);
    permissionMocks.notificationGet.mockResolvedValue(askable);
    permissionMocks.notificationRequest.mockResolvedValue(granted);
    permissionMocks.photoAddGet.mockResolvedValue(askable);
    permissionMocks.photoAddRequest.mockResolvedValue(granted);
    permissionMocks.photoReadGet.mockResolvedValue(askable);
    permissionMocks.photoReadRequest.mockResolvedValue(granted);
  });

  it("fans an OS location grant out to every mounted screen subscriber", async () => {
    const home = vi.fn();
    const map = vi.fn();
    const discover = vi.fn();
    const stops = [home, map, discover].map((listener) => subscribeNativePermissionDetail("location", listener));

    await requestNativeForegroundLocationPermissionDetail();

    expect(permissionMocks.locationRequest).toHaveBeenCalledOnce();
    expect(readNativePermissionDetail("location")).toEqual({ canAskAgain: false, state: "granted" });
    for (const listener of [home, map, discover]) {
      expect(listener).toHaveBeenLastCalledWith({ canAskAgain: false, state: "granted" });
    }
    stops.forEach((stop) => stop());
  });

  it("refreshes revoked location state from the OS instead of trusting stale granted state", async () => {
    permissionMocks.locationGet.mockResolvedValueOnce(granted).mockResolvedValueOnce(denied);
    await getNativeForegroundLocationPermissionDetail();
    expect(readNativePermissionDetail("location").state).toBe("granted");

    await getNativeForegroundLocationPermissionDetail();

    expect(readNativePermissionDetail("location")).toEqual({ canAskAgain: false, state: "denied" });
  });

  it("does not reopen an OS prompt after a non-askable denial", async () => {
    permissionMocks.cameraGet.mockResolvedValue(denied);
    permissionMocks.photoReadGet.mockResolvedValue(denied);
    permissionMocks.photoAddGet.mockResolvedValue(denied);
    permissionMocks.notificationGet.mockResolvedValue(denied);

    await requestNativeCameraPermissionDetail();
    await requestNativePhotoLibraryPermissionDetail();
    await requestNativeMediaLibrarySavePermission();
    await requestNativeNotificationPermissionDetail();

    expect(permissionMocks.cameraRequest).not.toHaveBeenCalled();
    expect(permissionMocks.photoReadRequest).not.toHaveBeenCalled();
    expect(permissionMocks.photoAddRequest).not.toHaveBeenCalled();
    expect(permissionMocks.notificationRequest).not.toHaveBeenCalled();
  });

  it("keeps the denied-permission CTA connected to the native Settings link", async () => {
    permissionMocks.openSettings.mockResolvedValue(undefined);

    await openNativeAppSettings();

    expect(permissionMocks.openSettings).toHaveBeenCalledOnce();
  });

  it("opens the closest notification settings available on each platform", async () => {
    await openNativeNotificationSettings("pet.huddle");
    expect(permissionMocks.openSettings).toHaveBeenCalledOnce();
    expect(permissionMocks.sendIntent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    permissionMocks.platform.OS = "android";
    permissionMocks.sendIntent.mockResolvedValue(undefined);

    await openNativeNotificationSettings("pet.huddle");

    expect(permissionMocks.sendIntent).toHaveBeenCalledWith("android.settings.APP_NOTIFICATION_SETTINGS", [
      { key: "android.provider.extra.APP_PACKAGE", value: "pet.huddle" },
    ]);
    expect(permissionMocks.openSettings).not.toHaveBeenCalled();
  });

  it("falls back to huddle's app settings when Android notification settings are unavailable", async () => {
    permissionMocks.platform.OS = "android";
    permissionMocks.sendIntent.mockRejectedValue(new Error("unsupported"));

    await openNativeNotificationSettings("pet.huddle");

    expect(permissionMocks.sendIntent).toHaveBeenCalledOnce();
    expect(permissionMocks.openSettings).toHaveBeenCalledOnce();
  });

  it("keeps camera, photo read, photo save, and notifications as separate OS scopes", async () => {
    permissionMocks.cameraGet.mockResolvedValue(granted);
    permissionMocks.photoReadGet.mockResolvedValue(denied);
    permissionMocks.photoAddGet.mockResolvedValue(granted);
    permissionMocks.notificationGet.mockResolvedValue(denied);

    await Promise.all([
      getNativeCameraPermissionDetail(),
      getNativePhotoLibraryPermissionDetail(),
      getNativeMediaLibrarySavePermissionDetail(),
      getNativeNotificationPermissionDetail(),
    ]);

    expect(readNativePermissionDetail("camera").state).toBe("granted");
    expect(readNativePermissionDetail("photo_library_read").state).toBe("denied");
    expect(readNativePermissionDetail("photo_library_add").state).toBe("granted");
    expect(readNativePermissionDetail("notifications").state).toBe("denied");
  });
});
