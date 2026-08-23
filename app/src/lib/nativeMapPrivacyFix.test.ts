import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = () =>
  readFileSync(resolve(dir, "../../../supabase/migrations/20260621090000_map_privacy_shell_gate_and_rehide_fix.sql"), "utf8");

describe("map privacy corrective migration", () => {
  it("restores the legacy hide_from_map gate in the shell RPC", () => {
    const sql = migration();
    expect(sql).toMatch(/create or replace function public\.get_visible_map_pin_shells/i);
    expect(sql).toMatch(/and coalesce\(pr\.hide_from_map, false\) = false/i);
  });

  it("re-hides only the rows the backfill flipped (window == pin expiry signature)", () => {
    const sql = migration();
    expect(sql).toMatch(/set hide_from_map = true/i);
    expect(sql).toMatch(/map_precision = 'hidden'/i);
    expect(sql).toMatch(/map_visible_until is not distinct from location_pinned_until/i);
    expect(sql).toMatch(/updated_at < timestamptz '2026-06-21 00:00:00\+00'/i);
  });

  it("reloads the PostgREST schema cache", () => {
    expect(migration()).toMatch(/notify pgrst, 'reload schema'/i);
  });

  it("does not coarsen or alter alert coordinates", () => {
    const sql = migration();
    expect(sql).toMatch(/b\.latitude as lat/i);
    expect(sql).toMatch(/b\.longitude as lng/i);
  });
});
