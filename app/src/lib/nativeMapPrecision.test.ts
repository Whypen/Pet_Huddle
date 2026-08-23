import { describe, expect, it } from "vitest";
import {
  clampCustomHours,
  formatNativeMapSharingUntil,
  nativeMapSharingStatusText,
  normalizeNativeMapPrecision,
} from "./nativeMapPrecision";

describe("nativeMapPrecision", () => {
  it("normalizes legacy precise sharing to Area while preserving Incognito", () => {
    expect(normalizeNativeMapPrecision("precise")).toBe("area");
    expect(normalizeNativeMapPrecision("area")).toBe("area");
    expect(normalizeNativeMapPrecision("hidden")).toBe("hidden");
  });

  it("clamps custom hours to 1..24 integers", () => {
    expect(clampCustomHours(0)).toBe(1);
    expect(clampCustomHours(25)).toBe(24);
    expect(clampCustomHours(3.7)).toBe(3);
  });

  it("formats the existing sharing-status copy for Area and Incognito", () => {
    const value = new Date(2026, 0, 1, 18, 0, 0);
    expect(formatNativeMapSharingUntil(value)).toMatch(/6:00\s*PM/i);
    expect(nativeMapSharingStatusText("area", value)).toMatch(/^Visible · until /);
    expect(nativeMapSharingStatusText("hidden", value)).toMatch(/^Incognito · until /);
  });

});
