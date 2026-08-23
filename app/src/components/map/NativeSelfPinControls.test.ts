import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = (name: string) => readFileSync(resolve(dir, name), "utf8");

describe("NativeSelfPinControls", () => {
  it("offers only Area and Incognito, with no precise-sharing UI", () => {
    const text = source("./NativeSelfPinControls.tsx");
    expect(text).toContain('precision: "area"');
    expect(text).toContain('precision: "hidden"');
    expect(text).not.toContain('precision: "precise"');
  });

  it("keeps expiry and stop controls visible in both shared surfaces", () => {
    const controls = source("./NativeSelfPinControls.tsx");
    expect(controls).toContain("Sharing until");
    expect(controls).toContain("Stop");
    expect(source("./NativeSelfPinSheet.tsx")).toContain("<NativeSelfPinControls");
    expect(source("./NativeSelfPinAnchoredMenu.tsx")).toContain("<NativeSelfPinControls");
  });

  it("uses huddle tokens and existing modal primitives", () => {
    for (const name of ["./NativeSelfPinControls.tsx", "./NativeSelfPinSheet.tsx", "./NativeSelfPinAnchoredMenu.tsx"]) {
      expect(source(name)).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    }
    expect(source("./NativeSelfPinSheet.tsx")).toContain("AppBottomSheet");
  });
});
