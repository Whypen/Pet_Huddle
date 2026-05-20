import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("./", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

const appPackage = readJson("app/package.json");
const appConfig = readJson("app/app.json").expo;
const biometricSource = read("app/src/lib/nativeBiometricAuth.ts");
const authSource = read("app/src/screens/NativeAuthScreen.tsx");
const securitySource = read("app/src/screens/NativeSecuritySettingsScreen.tsx");

assert(appPackage.dependencies["expo-local-authentication"], "expo-local-authentication dependency missing");
assert(
  JSON.stringify(appConfig.plugins).includes("expo-local-authentication"),
  "expo-local-authentication config plugin missing",
);
assert(
  appConfig.ios?.infoPlist?.NSFaceIDUsageDescription,
  "NSFaceIDUsageDescription missing",
);

assert(
  biometricSource.includes("requireAuthentication: true"),
  "biometric session is not protected by SecureStore authentication",
);
assert(
  biometricSource.includes('import("expo-local-authentication")'),
  "local authentication is not lazily loaded",
);
assert(
  !biometricSource.includes('import * as LocalAuthentication from "expo-local-authentication"'),
  "expo-local-authentication is statically imported and can crash old native builds",
);
assert(
  biometricSource.includes("localAuth.hasHardwareAsync"),
  "biometric hardware availability is not checked",
);
assert(
  biometricSource.includes("localAuth.isEnrolledAsync"),
  "biometric enrollment is not checked",
);
assert(
  biometricSource.includes("supabase.auth.setSession"),
  "biometric restore does not recreate a Supabase session",
);
assert(
  biometricSource.includes("SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY"),
  "biometric session is not device-local keychain scoped",
);

assert(
  securitySource.includes("saveNativeBiometricSession(session)"),
  "security screen does not save biometric session",
);
assert(
  securitySource.includes("clearNativeBiometricSession()"),
  "security screen does not remove biometric session",
);
assert(
  authSource.includes("restoreNativeBiometricSession()"),
  "auth screen does not restore biometric session",
);
assert(
  authSource.includes("Continue with {biometricLabel}"),
  "auth screen does not expose biometric login label",
);
assert(
  !authSource.includes("Biometric sign in is not ready yet"),
  "old biometric unavailable placeholder is still present",
);

console.log("biometric smoke checks passed");
