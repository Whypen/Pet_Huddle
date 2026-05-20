import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const ENABLED_KEY = "biometric_unlock_enabled";
const TYPE_KEY = "biometric_unlock_type";
const LAST_ENABLED_AT_KEY = "biometric_unlock_last_enabled_at";

type BiometricSupport = {
  supported: boolean;
  label: string;
};

type AuthResult = {
  ok: boolean;
  error: string | null;
};

const toLabel = (types: LocalAuthentication.AuthenticationType[]): string => {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Use Face ID";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "Use Fingerprint";
  return "Use Biometrics";
};

const mapAuthError = (raw: string | undefined): string => {
  switch (raw) {
    case "user_cancel":
    case "app_cancel":
    case "system_cancel":
      return "Face ID / fingerprint was cancelled.";
    case "authentication_failed":
      return "That didn’t match. Try again.";
    case "not_available":
    case "not_enrolled":
      return "Biometric unlock is no longer available on this device. Sign in again instead.";
    case "lockout":
      return "Too many failed attempts. Use your device passcode or sign in again.";
    default:
      return "That didn’t match. Try again.";
  }
};

export async function getBiometricSupport(): Promise<BiometricSupport> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (!hasHardware || !enrolled || supportedTypes.length === 0) {
    return { supported: false, label: "Use Biometrics" };
  }
  return { supported: true, label: toLabel(supportedTypes) };
}

export async function getBiometricUnlockEnabled(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(ENABLED_KEY);
  return raw === "true";
}

export async function enableBiometricUnlock(label: string): Promise<AuthResult> {
  const support = await getBiometricSupport();
  if (!support.supported) {
    return { ok: false, error: "Biometric unlock is no longer available on this device. Sign in again instead." };
  }
  const auth = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Huddle",
    disableDeviceFallback: false,
    cancelLabel: "Cancel",
    fallbackLabel: "Use Passcode",
  });
  if (!auth.success) {
    return { ok: false, error: mapAuthError(auth.error) };
  }
  await SecureStore.setItemAsync(ENABLED_KEY, "true");
  await SecureStore.setItemAsync(TYPE_KEY, label);
  await SecureStore.setItemAsync(LAST_ENABLED_AT_KEY, new Date().toISOString());
  return { ok: true, error: null };
}

export async function disableBiometricUnlock(): Promise<void> {
  await SecureStore.deleteItemAsync(ENABLED_KEY);
  await SecureStore.deleteItemAsync(TYPE_KEY);
  await SecureStore.deleteItemAsync(LAST_ENABLED_AT_KEY);
}

export async function authenticateBiometricUnlock(): Promise<AuthResult> {
  const support = await getBiometricSupport();
  if (!support.supported) {
    return { ok: false, error: "Biometric unlock is no longer available on this device. Sign in again instead." };
  }
  const auth = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock Huddle",
    disableDeviceFallback: false,
    cancelLabel: "Cancel",
    fallbackLabel: "Use Passcode",
  });
  if (!auth.success) {
    return { ok: false, error: mapAuthError(auth.error) };
  }
  return { ok: true, error: null };
}
