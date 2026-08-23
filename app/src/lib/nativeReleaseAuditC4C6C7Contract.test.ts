import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_NATIVE_TURNSTILE_SITE_KEY, getNativeTurnstileSiteKey, requireNativeTurnstileSiteKey } from "./nativeTurnstile";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("release audit C4/C6/C7 contracts", () => {
  const originalExpoKey = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
  const originalViteKey = process.env.VITE_TURNSTILE_SITE_KEY;

  afterEach(() => {
    if (originalExpoKey === undefined) delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY = originalExpoKey;
    if (originalViteKey === undefined) delete process.env.VITE_TURNSTILE_SITE_KEY;
    else process.env.VITE_TURNSTILE_SITE_KEY = originalViteKey;
  });

  it("resolves a missing Turnstile key without throwing during module evaluation", () => {
    delete process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.VITE_TURNSTILE_SITE_KEY;
    expect(getNativeTurnstileSiteKey()).toBe(DEFAULT_NATIVE_TURNSTILE_SITE_KEY);
    expect(requireNativeTurnstileSiteKey("explicit preflight")).toBe(DEFAULT_NATIVE_TURNSTILE_SITE_KEY);

    const affectedSources = [
      "navigation/RootNavigator.tsx",
      "screens/NativeAuthScreen.tsx",
      "screens/NativeEditProfileScreen.tsx",
      "screens/NativeSecuritySettingsScreen.tsx",
      "screens/NativeSignupScreen.tsx",
      "screens/NativeSupportScreen.tsx",
    ].map(read);
    affectedSources.forEach((source) => {
      expect(source).not.toContain("requireNativeTurnstileSiteKey(");
      expect(source).toContain("getNativeTurnstileSiteKey()");
    });
    expect(read("components/NativeTurnstile.tsx")).toContain("Security check is unavailable. Please update the app.");
  });

  it("cleans Android document content URIs and sends the same unique passport evidence used by the gate", () => {
    const identity = read("screens/NativeVerifyIdentityScreen.tsx");
    expect(identity).toMatch(/startsWith\("content:\/\/"\)[\s\S]*StorageAccessFramework\.deleteAsync/);
    expect(identity).toContain("const extractedNameEvidence = getUniqueIdentityNameEvidence(mrz.legalName, values.legalName);");
    expect(identity).toContain("evaluateIdentityLegalNameMatch(enteredLegalName, extractedNameEvidence");
    expect(identity).toContain("extractedNameEvidence,");

    const profile = read("screens/NativeProfileSummaryScreen.tsx");
    expect(profile.match(/onNavigate\("\/edit-profile\?focus=identity"\)/g)).toHaveLength(2);
    expect(profile.match(/onNavigate\("\/verify-identity"\)/g)).toHaveLength(1);
    expect(profile).toMatch(/label="Email"[\s\S]{0,160}disabled/);
  });

  it("keeps boot and identity diagnostics out of production execution", () => {
    const navigator = read("navigation/RootNavigator.tsx");
    const identity = read("screens/NativeVerifyIdentityScreen.tsx");
    expect(navigator).toMatch(/const nativeBootLog[\s\S]*?if \(!__DEV__\) return;[\s\S]*?console\.log/);
    navigator.split("\n").filter((line) => line.includes("console.warn")).forEach((line) => {
      expect(line).toContain("__DEV__");
    });
    expect(identity).toMatch(/const nativeVerifyReleaseLog[\s\S]*?if \(!__DEV__\) return;[\s\S]*?logNativeVerifyIdentity/);
    expect(identity).not.toMatch(/passport_expiry_check_failed[\s\S]{0,300}expiryDate\s*:/);
  });
});
