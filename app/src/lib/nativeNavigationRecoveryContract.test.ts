import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootSource = () => readFileSync(resolve(currentDir, "../navigation/RootNavigator.tsx"), "utf8");

describe("native navigation recovery contract", () => {
  it("registers and removes one Android hardware-back listener", () => {
    const source = rootSource();
    expect(source).toContain('BackHandler.addEventListener("hardwareBackPress"');
    expect(source).toContain("return () => subscription.remove()");
    expect(source).toContain("nativeHardwareBackTarget(route, routePath)");
  });

  it("lets users cancel password recovery without leaving its recovery session active", () => {
    const source = rootSource();
    expect(source).toContain("onRequestClose={dismissRecoveryPassword}");
    expect(source).toContain('accessibilityLabel="Cancel password reset"');
    expect(source).toContain('signOutNativeAuthSession({ scope: "local" })');
  });

  it("routes signup support through the support interceptor", () => {
    const source = rootSource();
    expect(source.match(/onOpenWebPath=\{onNavigate\}/g)).toHaveLength(2);
  });

  it("renders signed-out legal deep links instead of holding them for login", () => {
    const source = rootSource();
    expect(source).toContain("if (!session && isNativeLegalPath(path))");
    expect(source).toContain('setRoute("/legal")');
  });

  it("does not leave stale settings chrome over a new destination", () => {
    const source = rootSource();
    const start = source.indexOf("const fromSettings = path.startsWith");
    const precedingNavigation = source.slice(Math.max(0, start - 300), start);
    expect(precedingNavigation).toContain('applyNavigationOverlayState("destination")');
  });

  it("routes detail and verification back through the shared history owner", () => {
    const source = rootSource();
    expect(source).toContain("restoreNativeRouteHistory(routeHistoryRef.current");
    const verifyBack = source.slice(source.indexOf("const handleVerifyIdentityBack ="), source.indexOf("const handleEditPetBack ="));
    expect(verifyBack).toContain("restorePreviousRoute();");
    expect(verifyBack).not.toContain("previousRouteRef.current");
    expect(source).toContain("onBack={handleVerifyIdentityBack}");
    expect(source).toContain("visibleRouteBackRef.current();");
  });

  it("returns Account identity editing to Account with the Settings drawer restored", () => {
    const source = rootSource();
    const editProfileRoute = source.slice(source.indexOf('effectiveRoute === "/edit-profile"'), source.indexOf('effectiveRoute === "/pet-details"'));

    expect(source).toContain('editProfileReturnToAccountWithDrawerRef.current = path.startsWith("/edit-profile?focus=identity")');
    expect(source).toContain('applyNavigationOverlayState("account-with-settings-drawer")');
    expect(editProfileRoute).toContain("onGoBack={handleEditProfileBack}");
  });

  it("does not show the boot spinner over an active signup verification return", () => {
    const source = rootSource();
    const guardStart = source.indexOf("onboarding?.registeredIdentity === true &&");
    const guard = source.slice(guardStart, guardStart + 400);
    expect(guard).toContain("!signupVerifyReturnActive");
  });
});
