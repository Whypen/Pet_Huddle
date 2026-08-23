import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "huddle.native.sign-in-device-id";
const LEGACY_DEVICE_ID_KEY = "huddle_native_phone_otp_device_id_v1";
let inMemoryDeviceId = "";

const createDeviceId = () =>
  `native-signin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;

export const getNativeSignInDeviceContext = async () => {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  const fallback = await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY).catch(() => null);
  let deviceId = existing || fallback || inMemoryDeviceId;
  if (!deviceId) {
    deviceId = createDeviceId();
  }
  inMemoryDeviceId = deviceId;

  // This identifier is a recognition hint, never an authorization secret. Keep
  // it in both stores so a transient Keychain/SecureStore failure cannot make a
  // familiar installation appear to be a new device on every sign-in.
  await Promise.all([
    SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId).catch(() => undefined),
    AsyncStorage.setItem(LEGACY_DEVICE_ID_KEY, deviceId).catch(() => undefined),
  ]);

  const deviceName = [Device.modelName, Device.osName].filter(Boolean).join(" · ") || "huddle app";
  const userAgent = [
    "HuddleNative",
    Device.osName,
    Device.osVersion,
    Device.brand,
    Device.manufacturer,
    Device.modelName,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(" / ");

  return {
    deviceId,
    deviceLabel: deviceName,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Hong_Kong",
    userAgent,
  };
};
