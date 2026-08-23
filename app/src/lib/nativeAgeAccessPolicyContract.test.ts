import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoSource = (path: string) => readFileSync(resolve(currentDir, "../../..", path), "utf8");

describe("age access policy contract", () => {
  it("keeps the remote authority at 13 for entry and 16 for Discover and Care", () => {
    const migration = repoSource("supabase/migrations/20260809135945_align_age_access_policy_at_16.sql");

    expect(migration).toContain("v_dob > current_date - interval '13 years'");
    expect(migration).toContain("v_capability in ('discover', 'care')");
    expect(migration).toContain("v_dob > current_date - interval '16 years'");
    expect(migration).toContain("p.dob <= current_date - interval '16 years'");
    expect(migration).not.toContain("interval '18 years'");
    expect(migration).toContain("revoke all on function public.assert_huddle_capability(text, uuid) from public, anon, authenticated");
  });

  it("keeps the native and web Care gates aligned to 16", () => {
    const nativeModel = repoSource("app/src/lib/nativeCarerProfile.ts");
    const nativeScreen = repoSource("app/src/screens/NativeCarerProfileScreen.tsx");
    const webScreen = repoSource("src/pages/CarerProfile.tsx");

    expect(nativeModel).toContain("export const isAge16PlusFromDob");
    expect(nativeModel).toContain("age > 16 || (age === 16");
    expect(nativeScreen).toContain("!isAge16Plus");
    expect(webScreen).toContain("const isAge16Plus = dob");
    expect(webScreen).toContain("if (!isAge16Plus)");
  });

  it("keeps public Care and Discover function copy aligned to the same 16+ rule", () => {
    for (const path of [
      "supabase/functions/create-service-payment/index.ts",
      "supabase/functions/create-account-session/index.ts",
      "supabase/functions/wallet-bootstrap-account/index.ts",
      "supabase/functions/create-stripe-connect-link/index.ts",
    ]) {
      const source = repoSource(path);
      expect(source).toContain('p_capability: "care"');
      expect(source).toContain("Care is available to members 16 and over.");
      expect(source).not.toContain("Care is available to members 18 and over.");
    }
    const discoverFunction = repoSource("supabase/functions/social-discovery/index.ts");
    expect(discoverFunction).toContain('p_capability: "discover"');
    expect(discoverFunction).toContain("Discover is available to members 16 and over.");
    expect(discoverFunction).not.toContain("Discover is available to members 18 and over.");
  });

  it("allows ages 13 to 15 to keep Social, Chats, and Map controls", () => {
    const settings = repoSource("src/pages/Settings.tsx");
    const discover = repoSource("app/src/screens/NativeChatsScreen.tsx");

    expect(settings).not.toContain("enforceMinorSafety");
    expect(settings).not.toContain("disabled={loadingPrefs || !prefs.push_enabled || !isAge16Plus}");
    expect(discover).toContain("You can still use Social, Chats, and Map.");
  });

  it("keeps under-16 Discover out of navigation, prewarm, storage, and RPC paths", () => {
    const chats = repoSource("app/src/screens/NativeChatsScreen.tsx");
    const home = repoSource("app/src/screens/NativeHomeScreen.tsx");
    const root = repoSource("app/src/navigation/RootNavigator.tsx");
    const chatData = repoSource("app/src/lib/nativeChat.ts");

    expect(chats).toContain('topTab === "discover" && discoverAgeEligible !== true');
    expect(chats).toContain('requestedTopTab === "discover" && discoverAgeEligible === false ? "chats"');
    expect(chats).toContain('discoverAgeEligible === false ? ["community", "chats"]');
    expect(chats).toContain('discoverAgeEligible === false ? null : <Pressable accessibilityLabel="Discover"');
    expect(chats).toContain('if (!userId || discoverAgeEligible !== true)');
    expect(home).toContain('options.includeDiscover === false ? Promise.resolve([] as NativeChatDiscoveryProfile[])');
    expect(root).toContain('includeDiscover: isNativeProfileAtLeastAge(profileSnapshot?.profile?.dob, 16) !== false');
    for (const code of ["age_blocked", "age_restricted", "profile_age_required", "minimum_age_required"]) {
      expect(chatData).toContain(`"${code}"`);
    }
  });
});
