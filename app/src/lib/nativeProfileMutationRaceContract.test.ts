import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath: string) => fs.readFileSync(path.resolve(appRoot, relativePath), "utf8");

describe("native profile mutation race contracts", () => {
  it("checks the active session before and after silent pet writes", () => {
    const screen = read("src/screens/NativeSetPetScreen.tsx");
    const start = screen.indexOf("const silentSave = async () =>");
    const end = screen.indexOf("\n  const saveVisit", start);
    const silentSave = screen.slice(start, end);
    const firstGuard = silentSave.indexOf("isCurrentNativeSessionKey");
    const writer = silentSave.indexOf("await savePetRowWithToken");
    const secondGuard = silentSave.indexOf("isCurrentNativeSessionKey", firstGuard + 1);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(firstGuard).toBeGreaterThan(-1);
    expect(firstGuard).toBeLessThan(writer);
    expect(secondGuard).toBeGreaterThan(writer);
  });

  it("redacts silent pet-save errors through the protected logger", () => {
    const screen = read("src/screens/NativeSetPetScreen.tsx");
    const start = screen.indexOf("const silentSave = async () =>");
    const end = screen.indexOf("\n  const saveVisit", start);
    const silentSave = screen.slice(start, end);

    expect(silentSave).toContain("logNativeProtectedActionFailure");
    expect(silentSave).not.toContain("console.warn");
  });
});
