import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./nativeSocialShareTargets.ts"), "utf8");

describe("native share target routing", () => {
  it("prefers the Friends chat when the same person also has a Care chat", () => {
    const contract = source();
    expect(contract).toMatch(/if \(labels\.has\("Friend"\)\) return "Friend"/);
    expect(contract).toMatch(/existing\.type === "service" && target\.type === "direct"/);
    expect(contract).toMatch(/mergedByKey\.set\(key, target\)/);
  });
});
