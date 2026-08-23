import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const rootSource = () => readFileSync(resolve(dir, "./RootNavigator.tsx"), "utf8");

describe("RootNavigator persistent main tabs", () => {
  it("retains each visited primary surface and only activates the selected route", () => {
    const source = rootSource();
    expect(source).toMatch(/NATIVE_MAIN_ROUTES[^\n]+"\/social"[^\n]+"\/chats"[^\n]+"\/service"[^\n]+"\/map"/);
    expect(source).toMatch(/mountedMainRoutes\.has\("\/map"\)/);
    expect(source).toMatch(/<NativeMapRoute active=\{effectiveRoute === "\/map"\}/);
    expect(source).toMatch(/pointerEvents=\{effectiveRoute === "\/map" \? "auto" : "none"\}/);
  });

  it("resets retained surfaces when the authenticated session changes", () => {
    const source = rootSource();
    expect(source).toMatch(/mountedMainRoutesSessionKeyRef\.current !== sessionKey/);
    expect(source).toMatch(/setMountedMainRoutes\(new Set\(isNativeMainRoute\(route\) \? \[route\] : \["\/"\]\)\)/);
  });

  it("continues to mount temporary detail routes normally", () => {
    const source = rootSource();
    expect(source).toMatch(/!isMainChromeRoute \? \(/);
    expect(source).toMatch(/<View style=\{\[styles\.detailRouteLayer/);
  });

  it("keeps detail-route back navigation from reopening the screen just closed", () => {
    const source = rootSource();
    expect(source).toContain("const routeHistoryRef = useRef");
    expect(source).toContain("const restorePreviousRoute = useCallback");
    expect(source).toContain("restoreNativeRouteHistory(routeHistoryRef.current");
    expect(source).toContain("restorePreviousRoute();");
  });

  it("replaces active-session return and continue commands without retaining stale history", () => {
    const source = rootSource();
    const returnedBranch = source.slice(source.indexOf('if (path.startsWith("/active-session/returned"))'), source.indexOf('if (path.startsWith("/active-session/continue"))'));
    const continueBranch = source.slice(source.indexOf('if (path.startsWith("/active-session/continue"))'), source.indexOf('if (path.startsWith("/add-friend"))'));
    expect(source).toContain("replaceNativeRouteHistory(routeHistoryRef.current");
    expect(returnedBranch).toContain('replaceCurrentRoute("/")');
    expect(continueBranch).toContain('replaceCurrentRoute("/")');
    expect(returnedBranch).not.toContain('setRoutePath("/")');
    expect(continueBranch).not.toContain('setRoutePath("/")');
  });

  it("closes account chrome before opening support or notifications", () => {
    const source = rootSource();
    const notificationsBranch = source.slice(source.indexOf('if (path.startsWith("/notifications"))'), source.indexOf('if (path.startsWith("/support"))'));
    const supportBranch = source.slice(source.indexOf('if (path.startsWith("/support"))'), source.indexOf("// A real destination"));
    expect(notificationsBranch).toContain('applyNavigationOverlayState("notifications")');
    expect(supportBranch).toContain("openSupport()");
  });

  it("uses the same overlay owner for header, drawer, and edge-swipe entry points", () => {
    const source = rootSource();
    expect(source).toContain('onNotificationsPress={() => applyNavigationOverlayState("notifications")}');
    expect(source).toContain('onSettingsPress={() => applyNavigationOverlayState("settings-drawer")}');
    expect(source).toContain('onOpen={() => applyNavigationOverlayState("settings-drawer")}');
    expect(source).toContain('onOpen={() => applyNavigationOverlayState("notifications")}');
  });
});
