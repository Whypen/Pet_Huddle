import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeAuthScreen.tsx"), "utf8");

describe("NativeAuthScreen password reveal", () => {
  it("uses the native input as the only value and touch surface", () => {
    const screen = source();
    expect(screen).toMatch(/secureTextEntry=\{!signinPasswordVisible\}/);
    expect(screen).not.toMatch(/authFieldInputHidden/);
    expect(screen).not.toMatch(/authFieldDisplayText/);
    expect(screen).toMatch(/requestAnimationFrame\(\(\) => passwordInputRef\.current\?\.focus\(\)\)/);
  });

  it("keeps email and password as independently focusable native fields", () => {
    const screen = source();
    expect(screen).toMatch(/ref=\{emailInputRef\}/);
    expect(screen).toMatch(/ref=\{passwordInputRef\}/);
    expect(screen).toMatch(/onSubmitEditing=\{\(\) => passwordInputRef\.current\?\.focus\(\)\}/);
  });
});
