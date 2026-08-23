import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const migration = () => readFileSync(resolve(root, "supabase/migrations/20260728090000_clear_location_pin_ends_map_visibility.sql"), "utf8");
const mapScreen = () => readFileSync(resolve(root, "app/src/screens/NativeMapScreen.tsx"), "utf8");

describe("native presence server contract", () => {
  it("makes clear_user_location_pin terminal for both location retention and public visibility", () => {
    const sql = migration();
    expect(sql).toMatch(/create or replace function public\.clear_user_location_pin\(\)/);
    expect(sql).toMatch(/location_pinned_until = null/);
    expect(sql).toMatch(/location_retention_until = null/);
    expect(sql).toMatch(/map_visible_until = v_stopped_at/);
    expect(sql).toMatch(/if v_uid is null then\s+raise exception 'not_authenticated'/);
    expect(sql).toMatch(/grant execute on function public\.clear_user_location_pin\(\) to authenticated, service_role/);
  });

  it("keeps the client terminal even while an older backend schema is still being rolled out", () => {
    const screen = mapScreen();
    const unpinStart = screen.indexOf("const confirmUnpinLocation = async () =>");
    const unpinEnd = screen.indexOf("const handlePinToggle", unpinStart);
    const unpin = screen.slice(unpinStart, unpinEnd);
    expect(unpin).toContain("await clearNativeUserLocationPin(effectiveUserId, { accessToken });");
    expect(unpin).toContain("await stopNativeMapSharing({ accessToken });");
    expect(unpin.indexOf("clearNativeUserLocationPin")).toBeLessThan(unpin.indexOf("stopNativeMapSharing"));
  });
});
