import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = () =>
  readFileSync(resolve(dir, "../../../supabase/migrations/20260621100000_coarsen_latlng_cell_center.sql"), "utf8");

describe("coarsen_latlng cell-center migration", () => {
  it("redefines coarsen_latlng to snap to the cell center", () => {
    const sql = migration();
    expect(sql).toMatch(/create or replace function public\.coarsen_latlng/i);
    expect(sql).toMatch(/floor\(p_lat \/ cell\) \* cell \+ cell \/ 2/i);
    expect(sql).toMatch(/floor\(p_lng \/ cell\) \* cell \+ cell \/ 2/i);
  });

  it("drops the per-user hash offset", () => {
    expect(migration()).not.toMatch(/hashtext/i);
  });

  it("still guards null coordinates and passes through precise", () => {
    const sql = migration();
    expect(sql).toMatch(/when p_lat is null or p_lng is null then null/i);
    expect(sql).toMatch(/when p_precision = 'precise' then p_lat/i);
  });
});
