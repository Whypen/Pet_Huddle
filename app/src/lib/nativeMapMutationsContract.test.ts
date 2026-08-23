import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const src = () => readFileSync(resolve(dir, "./nativeMapMutations.ts"), "utf8");

describe("nativeMapMutations precision contract", () => {
  it("pinNativeUserLocation keeps 24h pin lifecycle and sends custom visible hours", () => {
    const s = src();
    expect(s).toMatch(/precision: NativeMapPrecision/);
    expect(s).toMatch(/p_precision: precision/);
    expect(s).toMatch(/p_pin_hours: NATIVE_USER_PIN_ACTIVE_HOURS/);
    expect(s).toMatch(/p_visible_hours: hours/);
  });

  it("stopNativeMapSharing calls end_map_visibility", () => {
    const s = src();
    expect(s).toMatch(/export async function stopNativeMapSharing/);
    expect(s).toMatch(/"end_map_visibility"/);
  });

  it("renews Out now from the server-confirmed location", () => {
    const s = src();
    expect(s).toMatch(/export async function renewNativeUserOutNow/);
    expect(s).toMatch(/"renew_native_out_now_visibility"/);
    expect(s).toMatch(/out_now_renewal_failed/);
  });

  it("starts Out now through its dedicated two-hour session RPC", () => {
    const s = src();
    expect(s).toMatch(/"start_native_out_now"/);
    expect(s).toMatch(/out_now_start_failed/);
    expect(s).toMatch(/startNativeUserOutNowFromSavedLocation/);
  });
});
