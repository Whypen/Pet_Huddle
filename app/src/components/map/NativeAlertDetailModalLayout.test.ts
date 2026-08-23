import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const source = () => readFileSync(resolve(dir, "./NativeAlertDetailModal.tsx"), "utf8");

describe("NativeAlertDetailModal layout", () => {
  it("uses content height up to the 82% cap instead of a manually constrained body", () => {
    const modal = source();
    expect(modal).toMatch(/const alertDetailSheetMaxHeight = height \* 0\.82/);
    expect(modal).toMatch(/mode="autoMax" onClose=\{shareOpen \? closeSharePage : onClose\} style=\{\{ maxHeight: alertDetailSheetMaxHeight \}\}/);
    expect(modal).not.toMatch(/height: detailSheetTargetHeight/);
    expect(modal).not.toMatch(/height: detailBodyTargetHeight/);
    expect(modal).toMatch(/style=\{\{ maxHeight: detailBodyBudgetHeight \}\}/);
  });

  it("reports the actual rendered sheet height to the map", () => {
    const modal = source();
    expect(modal).toMatch(/onSheetHeightChange\?: \(height: number\) => void/);
    expect(modal).toMatch(/const handleSheetLayout/);
    expect(modal).toMatch(/handleCardLayout\(\); handleSheetLayout\(event\);/);
  });
});
