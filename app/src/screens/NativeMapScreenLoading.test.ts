import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const screenSource = () => readFileSync(resolve(dir, "./NativeMapScreen.tsx"), "utf8");
const rootSource = () => readFileSync(resolve(dir, "../navigation/RootNavigator.tsx"), "utf8");

describe("NativeMapScreen light loading contract", () => {
  it("reuses warm shell data unless the user explicitly refreshes", () => {
    const screen = screenSource();
    expect(screen).toMatch(/force: options\?\.force === true/);
    expect(screen).toMatch(/!options\?\.force && !options\?\.recenter/);
    expect(screen).toMatch(/\{ center: initialCenter, recenter: true/);
    expect(screen).not.toMatch(/\{ center: initialCenter, force: true, recenter: true/);
  });

  it("shares the session scope and initializes profile and location in parallel", () => {
    const screen = screenSource();
    expect(screen).toMatch(/const \[profileSnapshot, scope\] = await Promise\.all/);
    expect(screen).toMatch(/resolveNativeViewerScope\(\{ userId: effectiveUserId, accessToken, sessionKey: mapShellSessionKey \}\)/);
    expect(screen).toMatch(/deriveNativeMapOwnPinFromProfile\(profile/);
    expect(screen).not.toMatch(/const syncPermissionAndLocation = async/);
  });

  it("reuses identity state while panning and avoids global realtime cache scans", () => {
    const screen = screenSource();
    expect(screen).toMatch(/const mapIdentitySnapshotRef = useRef/);
    expect(screen).toMatch(/!options\?\.force && !options\?\.refreshIdentity && identitySnapshot\?\.sessionKey === requestSessionKey/);
    expect(screen).not.toMatch(/void invalidateNativeMapAlertCaches\(\);/);
    expect(screen).toMatch(/if \(mapCameraActiveRef\.current \|\| realtimeRefreshRunningRef\.current\) \{\s*realtimeRefreshDirtyRef\.current = true/);
    expect(screen).toMatch(/const hadTriggeredDirty = realtimeRefreshDirtyRef\.current && active/);
    expect(screen).not.toContain('if (status === "SUBSCRIBED") refreshMapShell()');
  });

  it("warms the shell radius used by the default map zoom", () => {
    const root = rootSource();
    expect(root).toMatch(/fetchVisibleMapPinShells\(mapCenter, 5000/);
    expect(root).toMatch(/fetchNativeMapPeopleV2\(mapCenter, 5000/);
    expect(root).not.toMatch(/fetchVisibleMapPinShells\(mapCenter, 2000/);
  });
});
