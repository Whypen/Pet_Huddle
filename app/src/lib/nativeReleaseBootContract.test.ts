import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../navigation/RootNavigator.tsx");
const source = () => readFileSync(root, "utf8");

describe("native release boot contract", () => {
  it("fails open when stored auth session resolution stalls", () => {
    const navigator = source();
    expect(navigator).toMatch(/const BOOT_AUTH_SESSION_MAX_MS = 4000/);
    expect(navigator).toMatch(/auth_boot_session_timeout/);
    expect(navigator).toMatch(/Promise\.race\(\[getFreshNativeSession\(\), timeout\]\)/);
    expect(navigator).toMatch(/const bootSession = await getNativeBootSession\(\)/);
  });
});
