import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Session } from "@supabase/supabase-js";
import { refreshNativeSessionOnce } from "./nativeFunctionClient";

const LEGACY_BIOMETRIC_HINT_KEY = "huddle:native:biometric-session-enabled";
const BIOMETRIC_SESSION_KEY = "huddle.native.biometric-session";
const BIOMETRIC_HINT_KEY = "huddle.native.biometric-session-enabled";

type StoredBiometricSession = {
  refreshToken: string;
  email: string | null;
  userId: string;
  savedAt: string;
  accessToken?: string;
};

export type NativeBiometricAvailability = {
  available: boolean;
  reason?: "hardware_missing" | "not_enrolled" | "unsupported";
  label: string;
};

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: "Use Face ID or Touch ID to sign in to huddle.",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type LocalAuthenticationModule = {
  AuthenticationType?: {
    FINGERPRINT?: number;
    FACIAL_RECOGNITION?: number;
  };
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<number[]>;
  authenticateAsync: (options?: {
    promptMessage?: string;
    fallbackLabel?: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean; error?: string; warning?: string }>;
};

const loadLocalAuthentication = async (): Promise<LocalAuthenticationModule | null> => {
  try {
    return await import("expo-local-authentication");
  } catch {
    return null;
  }
};

const biometricTypeLabel = (types: number[], localAuth: LocalAuthenticationModule) => {
  const faceType = localAuth.AuthenticationType?.FACIAL_RECOGNITION ?? 2;
  const fingerprintType = localAuth.AuthenticationType?.FINGERPRINT ?? 1;
  if (types.includes(faceType)) return "Face ID";
  if (types.includes(fingerprintType)) return "Touch ID";
  return "Biometric Sign In";
};

export const getNativeBiometricAvailability = async (): Promise<NativeBiometricAvailability> => {
  const localAuth = await loadLocalAuthentication();
  if (!localAuth) return { available: false, reason: "unsupported", label: "Biometric Sign In" };

  const hasHardware = await localAuth.hasHardwareAsync().catch(() => false);
  if (!hasHardware) return { available: false, reason: "hardware_missing", label: "Biometric Sign In" };

  const enrolled = await localAuth.isEnrolledAsync().catch(() => false);
  const types = await localAuth.supportedAuthenticationTypesAsync().catch(() => []);
  const label = biometricTypeLabel(types, localAuth);
  if (!enrolled) return { available: false, reason: "not_enrolled", label };

  return { available: true, label };
};

export const hasNativeBiometricSessionHint = async () => {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_HINT_KEY)) === "1" || (await AsyncStorage.getItem(LEGACY_BIOMETRIC_HINT_KEY)) === "1";
  } catch {
    return false;
  }
};

const setNativeBiometricSessionHint = async (enabled: boolean) => {
  if (enabled) {
    await AsyncStorage.setItem(BIOMETRIC_HINT_KEY, "1");
    await AsyncStorage.setItem(LEGACY_BIOMETRIC_HINT_KEY, "1").catch(() => undefined);
    return;
  }
  await AsyncStorage.removeItem(BIOMETRIC_HINT_KEY);
  await AsyncStorage.removeItem(LEGACY_BIOMETRIC_HINT_KEY).catch(() => undefined);
};

export const saveNativeBiometricSession = async (session: Session, options: { prompt?: boolean } = {}) => {
  if (!session.access_token || !session.refresh_token) throw new Error("session_missing");
  const availability = await getNativeBiometricAvailability();
  if (!availability.available) throw new Error(availability.reason || "biometric_unavailable");
  if (options.prompt !== false) {
    const localAuth = await loadLocalAuthentication();
    if (!localAuth) throw new Error("unsupported");
    const setupAuth = await localAuth.authenticateAsync({
      promptMessage: `Enable ${availability.label} for huddle`,
      fallbackLabel: "Use Passcode",
      cancelLabel: "Cancel",
    });
    if (!setupAuth.success) {
      throw new Error(setupAuth.error || "biometric_setup_cancelled");
    }
  }

  const payload: StoredBiometricSession = {
    refreshToken: session.refresh_token,
    email: session.user.email || null,
    userId: session.user.id,
    savedAt: new Date().toISOString(),
  };

  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY, secureStoreOptions).catch(() => undefined);
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY).catch(() => undefined);
  await SecureStore.setItemAsync(BIOMETRIC_SESSION_KEY, JSON.stringify(payload), secureStoreOptions);
  await setNativeBiometricSessionHint(true);
};

export const clearNativeBiometricSession = async () => {
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY, secureStoreOptions).catch(() => undefined);
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY).catch(() => undefined);
  await setNativeBiometricSessionHint(false);
};

export const restoreNativeBiometricSession = async () => {
  const availability = await getNativeBiometricAvailability();
  if (!availability.available) throw new Error(availability.reason || "biometric_unavailable");

  const raw = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY, secureStoreOptions);
  if (!raw) {
    await setNativeBiometricSessionHint(false);
    throw new Error("biometric_session_missing");
  }

  const parsed = JSON.parse(raw) as Partial<StoredBiometricSession>;
  if (!parsed.refreshToken) {
    await clearNativeBiometricSession();
    throw new Error("biometric_session_invalid");
  }

  const session = await refreshNativeSessionOnce({ refresh_token: parsed.refreshToken });
  if (!session) {
    await clearNativeBiometricSession();
    throw new Error("biometric_session_restore_failed");
  }
  await saveNativeBiometricSession(session, { prompt: false }).catch((error) => {
    if (__DEV__) console.warn("NATIVE_BIOMETRIC_SESSION_REFRESH_SAVE_FAILED", error);
  });
  return session;
};
