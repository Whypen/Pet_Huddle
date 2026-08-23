import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { publishNativePermissionDetail, subscribeNativePermissionDetail, type NativePermissionDetail } from "./nativePermissionState";

const mapPermission = (permission: { canAskAgain?: boolean; granted?: boolean; status?: string }): NativePermissionDetail => ({
  canAskAgain: permission.canAskAgain !== false,
  state: permission.granted === true || permission.status === "granted"
    ? "granted"
    : permission.status === "denied"
      ? "denied"
      : "unknown",
});

export const subscribeNativeCameraPermission = (listener: (detail: NativePermissionDetail) => void) => subscribeNativePermissionDetail("camera", listener);
export const subscribeNativePhotoLibraryPermission = (listener: (detail: NativePermissionDetail) => void) => subscribeNativePermissionDetail("photo_library_read", listener);

export async function getNativeCameraPermissionDetail() {
  return publishNativePermissionDetail("camera", mapPermission(await ImagePicker.getCameraPermissionsAsync()));
}

export async function requestNativeCameraPermissionDetail() {
  const current = await getNativeCameraPermissionDetail();
  if (current.state === "granted" || !current.canAskAgain) return current;
  return publishNativePermissionDetail("camera", mapPermission(await ImagePicker.requestCameraPermissionsAsync()));
}

export async function getNativePhotoLibraryPermissionDetail() {
  return publishNativePermissionDetail("photo_library_read", mapPermission(await ImagePicker.getMediaLibraryPermissionsAsync()));
}

export async function requestNativePhotoLibraryPermissionDetail() {
  const current = await getNativePhotoLibraryPermissionDetail();
  if (current.state === "granted" || !current.canAskAgain) return current;
  return publishNativePermissionDetail("photo_library_read", mapPermission(await ImagePicker.requestMediaLibraryPermissionsAsync()));
}

export async function requestNativeMediaLibrarySavePermission() {
  const existing = await getNativeMediaLibrarySavePermissionDetail();
  if (existing.state === "granted" || !existing.canAskAgain) return publishNativePermissionDetail("photo_library_add", existing);
  return publishNativePermissionDetail("photo_library_add", mapPermission(await MediaLibrary.requestPermissionsAsync(true)));
}

export async function getNativeMediaLibrarySavePermissionDetail() {
  return publishNativePermissionDetail("photo_library_add", mapPermission(await MediaLibrary.getPermissionsAsync(true)));
}

export function publishNativeCameraPermissionStatus(status: string) {
  return publishNativePermissionDetail("camera", {
    canAskAgain: status !== "denied" && status !== "restricted",
    state: status === "granted" ? "granted" : status === "denied" || status === "restricted" ? "denied" : "unknown",
  });
}

export async function launchNativeImageLibraryAsync(options: ImagePicker.ImagePickerOptions) {
  try {
    return await ImagePicker.launchImageLibraryAsync(options);
  } finally {
    void getNativePhotoLibraryPermissionDetail().catch(() => undefined);
  }
}

export async function launchNativeCameraAsync(options: ImagePicker.ImagePickerOptions) {
  try {
    return await ImagePicker.launchCameraAsync(options);
  } finally {
    void getNativeCameraPermissionDetail().catch(() => undefined);
  }
}
