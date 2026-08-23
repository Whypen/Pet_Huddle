import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeMapScreen.tsx"), "utf8");

describe("NativeMapScreen camera stability contract", () => {
  it("treats an already-settled camera command as a no-op", () => {
    const screen = source();
    const focusCamera = screen.match(/const focusSelectionCamera = useCallback\(\(([\s\S]*?)\n {2}\}, \[applyCamera\]\);/)?.[1] ?? "";

    expect(focusCamera).toContain("const cameraAlreadySettled");
    expect(focusCamera.indexOf("if (cameraAlreadySettled)")).toBeLessThan(focusCamera.indexOf("applyCamera(center"));
    expect(focusCamera).toMatch(/if \(cameraAlreadySettled\) \{[\s\S]*?return;[\s\S]*?\}\s*applyCamera\(center/);
  });

  it("keeps the existing area picker independent from self-pin controls", () => {
    const screen = source();
    const areaPicker = screen.match(/const openAreaMenu = useCallback\(async([\s\S]*?)\n {2}\}, \[bottomNavVisible/)?.[1] ?? "";

    expect(screen).toMatch(/setAreaMenu\(\{ members: cluster\.members, anchor, center: cluster\.center, hasOwner: cluster\.hasOwner \}\)/);
    expect(areaPicker).not.toMatch(/openSelfPinMenu/);
    expect(screen).toMatch(/NativeSelfPinAnchoredMenu/);
  });

  it("lets the measured alert sheet own exactly one alert reframe", () => {
    const screen = source();
    const alertEffect = screen.match(/useEffect\(\(\) => \{\s*if \(!selectedAlertId([\s\S]*?)\n {2}\}, \[alertSheetHeight, focusAlertCamera/)?.[1] ?? "";
    const openAlert = screen.match(/const openMapAlert = useCallback\(([\s\S]*?)\n {2}\}, \[/)?.[1] ?? "";

    expect(alertEffect).toContain("alertSheetHeight <= 0");
    expect(alertEffect).toContain("framedAlertSelectionRef.current === selectedAlertId");
    expect(alertEffect).toContain("paddingBottom: alertSheetHeight");
    expect(openAlert).toContain("setAlertSheetHeight(0)");
    expect(openAlert).not.toContain("focusAlertCamera(");
  });

  it("centers the rendered self avatar and keeps fresh GPS refinement silent", () => {
    const screen = source();
    const locationPress = screen.match(/const handleLocationPress = async \(\) => \{([\s\S]*?)\n {2}\};\n\n {2}const handleZoomChange/)?.[1] ?? "";

    expect(locationPress).toMatch(/if \(ownPin\) \{[\s\S]*?const renderedCoordinate = resolveOwnAreaCoordinate\(ownPin\.lng, ownPin\.lat, mapPeopleGeometryVersion, mapViewerArea\);[\s\S]*?focusSelectionCamera\(\s*renderedCoordinate/);
    expect(locationPress).not.toContain('precision === "precise"');
    expect(locationPress.match(/focusSelectionCamera\(/g)?.length).toBe(2);
    expect(locationPress).not.toContain("setOwnPin(");
    expect(locationPress).toContain("setDeviceLocation(coords)");
  });
});
