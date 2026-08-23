import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "../..");
const read = (path: string) => readFileSync(join(appRoot, path), "utf8");

describe("native SecureStore key contract", () => {
  it("uses Expo-compatible keys for sessions, biometrics, signup, identity, and device state", () => {
    const sources = [
      read("src/lib/supabase.ts"),
      read("src/lib/nativeBiometricAuth.ts"),
      read("src/lib/nativeSignup.ts"),
      read("src/lib/nativeVerifyIdentity.ts"),
      read("src/lib/nativeSignInDevice.ts"),
    ].join("\n");

    expect(sources).not.toMatch(/SecureStore\.(?:getItemAsync|setItemAsync|deleteItemAsync)\(LEGACY_[A-Z_]*KEY/);
    expect(sources).not.toContain('`${key}:chunks`');
    expect(sources).not.toContain('`${key}:chunk:${index}`');
  });

  it("keeps Care Start PINs in SecureStore with a valid key and migrates the old ordinary-storage key", () => {
    const screen = read("src/screens/NativeServiceChatScreen.tsx");

    expect(screen).toContain("`huddle_native_service_start_pin_v2.${userId}.${serviceChatId}`");
    expect(screen).toContain("`huddle_native_service_start_pin_v2:${userId}:${serviceChatId}`");
    expect(screen).toContain("AsyncStorage.getItem(legacyKey)");
    expect(screen).toContain("SecureStore.setItemAsync(key, legacyPin, secureStoreOptions)");
    expect(screen).toContain("AsyncStorage.removeItem(legacyKey)");
  });
});
