import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(appRoot, path), "utf8");

describe("native low-risk UX hardening contracts", () => {
  it("keeps notification effects independent of an inline parent callback", () => {
    const panel = read("src/components/NativeNotificationsPanel.tsx");
    expect(panel).toContain("const onMarkedReadRef = useRef(onMarkedRead)");
    expect(panel).toContain("onMarkedReadRef.current();");
    expect(panel).not.toMatch(/\[accessToken, currentPanelSessionKey, onMarkedRead, userId\]/);
  });

  it("caches country labels and restores the social broadcast default", () => {
    const profile = read("src/components/profile/NativeProfileForm.tsx");
    const broadcast = read("src/components/map/NativeBroadcastModal.tsx");
    expect(profile).toContain("const nativeCountryCodeByLabel = new Map<string, string>()");
    expect(profile).toContain("nativeCountryCodeByLabel.get(target)");
    expect(broadcast).toMatch(/const resetComposer = \(\) => \{[\s\S]*?setPostOnThreads\(true\)/);
  });

  it("handles share and Stripe refresh failures without unhandled finally chains", () => {
    const friendsSheet = read("src/components/friends/NativeHuddleFriendsSheet.tsx");
    const wallet = read("src/components/wallet/NativeStripeConnectOnboarding.tsx");
    expect(friendsSheet).toContain('setError("Couldn\'t open sharing. Try again.")');
    expect(wallet).toContain("const finishAfterStatusRefresh = useCallback(async () =>");
    expect(wallet).not.toContain("refreshStatus().finally(finish)");
  });

  it("does not fetch Family state while both drawer and Family sheet are hidden", () => {
    const settings = read("src/components/NativeSettingsDrawer.tsx");
    expect(settings).toContain("if ((!open && !familyOpen) || !userId) return;");
    expect(settings).toContain("initialState={familyStatePreview}");
  });
});
