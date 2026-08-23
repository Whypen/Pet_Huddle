import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapRealtimeTopicsForCenters } from "./nativeMapRealtime";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(dir, "../../../supabase/migrations/20260812122417_scope_map_and_admin_care_realtime.sql"),
  "utf8",
);

describe("scoped map and admin realtime", () => {
  it("uses matching quarter-degree database and client map cells", () => {
    expect(migration).toContain("floor(p_lat * 4)");
    expect(migration).toContain("floor(p_lng * 4)");
    expect(mapRealtimeTopicsForCenters([[114.17, 22.30]])).toContain("map:89:456");
    expect(mapRealtimeTopicsForCenters([[179.99, 0]])).toContain("map:0:-720");
  });

  it("covers the full 25 km query radius at ordinary and high latitudes", () => {
    expect(mapRealtimeTopicsForCenters([[114.17, 22.30]]).length).toBe(9);
    expect(mapRealtimeTopicsForCenters([[20, 80]]).length).toBeGreaterThan(9);
    expect(mapRealtimeTopicsForCenters([[20, 89.9]]).length).toBeLessThanOrEqual(75);
  });

  it("keeps map payloads content-free and gates the admin topic", () => {
    expect(migration).toContain("p_topic = 'admin:care'");
    expect(migration).toContain("public.is_huddle_admin_user(v_uid)");
    expect(migration).toContain("p_topic ~ '^map:-?[0-9]+:-?[0-9]+$'");
    expect(migration).toContain("jsonb_build_object('v',1,'kind',p_kind)");
    expect(migration).not.toMatch(/new\.description|new\.address|row_to_json/i);
  });
});
