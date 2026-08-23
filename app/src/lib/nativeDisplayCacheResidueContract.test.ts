import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appSourceRoot = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(appSourceRoot, relativePath), "utf8");

const displayCacheOwners = [
  "components/social/NativeSocialFeedPrimitives.tsx",
  "lib/nativeActivity.ts",
  "lib/nativeAppReview.ts",
  "lib/nativeChat.ts",
  "lib/nativeCoachMarks.ts",
  "lib/nativeLocation.ts",
  "lib/nativeMapAlertInteractions.ts",
  "lib/nativeMapData.ts",
  "lib/nativeMapMutations.ts",
  "lib/nativeNewChatSignal.ts",
  "lib/nativeNotifications.ts",
  "lib/nativeOnboardingHero.ts",
  "lib/nativeOpeningIntro.ts",
  "lib/nativeProfileSummary.ts",
  "lib/nativePublicProfile.ts",
  "lib/nativeService.ts",
  "lib/nativeSocial.ts",
  "lib/nativeSurfaceUsage.ts",
  "screens/NativeChatsScreen.tsx",
  "screens/NativeHomeScreen.tsx",
  "screens/NativeMapScreen.tsx",
  "screens/NativeSocialScreen.tsx",
] as const;

describe("native display-cache storage residue", () => {
  it("routes every page-paint display mirror through the bounded storage owner", () => {
    for (const file of displayCacheOwners) {
      const source = read(file);
      expect(source, file).toContain("nativeDisplayCacheStorage");
      expect(source, file).not.toMatch(/AsyncStorage\.(?:getItem|multiGet|getAllKeys)\(/);
    }
  });

  it("keeps sensitive and mutation-recovery storage outside the display-cache fallback", () => {
    const sensitiveOwners = [
      "lib/nativeAuthRedirect.ts",
      "lib/nativeBiometricAuth.ts",
      "lib/nativeContactsToggle.ts",
      "lib/nativePasskeyGate.ts",
      "lib/nativePhoneOtp.ts",
      "lib/nativeSignInDevice.ts",
      "lib/nativeSignup.ts",
      "lib/supabase.ts",
      "navigation/RootNavigator.tsx",
      "screens/NativeEditProfileScreen.tsx",
      "screens/NativeProfileSummaryScreen.tsx",
    ];
    for (const file of sensitiveOwners) {
      expect(read(file), file).not.toContain("nativeDisplayCacheStorage");
    }
    const serviceChat = read("screens/NativeServiceChatScreen.tsx");
    expect(serviceChat).toMatch(/AsyncStorage\.getItem\(activePaymentKey\)/);
    expect(serviceChat).toMatch(/AsyncStorage\.getItem\(draftKey\)/);
  });

  it("does not add retries or polling to cache recovery", () => {
    const source = read("lib/nativeDisplayCacheStorage.ts");
    expect(source).not.toMatch(/setInterval|while\s*\(|for\s*\(\s*;;/);
    expect(source).toContain("inFlightReads");
    expect(source).toContain("circuitOpenUntil");
  });
});
