import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const rootNavigator = readFileSync(resolve(repoRoot, "app/src/navigation/RootNavigator.tsx"), "utf8");
const verifyPhoneOtp = readFileSync(resolve(repoRoot, "supabase/functions/verify-phone-otp/index.ts"), "utf8");

describe("release re-verification UX hardening", () => {
  it("routes Android hardware back through the same handlers as visible detail back buttons", () => {
    expect(rootNavigator).toContain("if (visibleRouteBackRef.current)");
    expect(rootNavigator).toContain("visibleRouteBackRef.current();");
    expect(rootNavigator).toContain("onBack={handleVerifyIdentityBack}");
    expect(rootNavigator).toContain("onGoBack={handleEditPetBack}");
    expect(rootNavigator).toContain("onBack={handleProfileBack}");
    expect(rootNavigator).toMatch(/settingsOverlay === "account"[\s\S]{0,160}applyNavigationOverlayState\("settings-drawer"\)/);
  });

  it("restores the owning Settings surface after Support closes", () => {
    expect(rootNavigator).toContain('supportReturnSurfaceRef = useRef<"account" | "settings-drawer" | null>');
    expect(rootNavigator).toContain('if (returnSurface === "account") applyNavigationOverlayState("account")');
    expect(rootNavigator).toContain('if (returnSurface === "settings-drawer") applyNavigationOverlayState("settings-drawer")');
    expect(rootNavigator).toContain("onRequestClose={closeSupport}");
    expect(rootNavigator).toContain("onCancel={closeSupport}");
  });

  it("never adopts an ownerless or cross-account verified phone challenge", () => {
    expect(verifyPhoneOtp).toContain("challenge.user_id !== userId");
    expect(verifyPhoneOtp).not.toContain("challenge_adopt_failed");
    expect(verifyPhoneOtp).not.toContain('.is("user_id", null)');
  });
});
