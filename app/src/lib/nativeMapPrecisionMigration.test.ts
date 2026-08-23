import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = () =>
  readFileSync(resolve(dir, "../../../supabase/migrations/20260620140000_map_precision_columns.sql"), "utf8");

describe("map_precision columns migration", () => {
  it("adds map_precision (default area) and map_visible_until", () => {
    const sql = migration();
    expect(sql).toMatch(/add column if not exists map_precision text/i);
    expect(sql).toMatch(/default 'area'/i);
    expect(sql).toMatch(/check \(map_precision in \('precise', 'area', 'hidden'\)\)/i);
    expect(sql).toMatch(/add column if not exists map_visible_until timestamptz/i);
    // Backfill only existing *visible* pinned users so they don't vanish on deploy.
    expect(sql).toMatch(/set map_visible_until = location_pinned_until/i);
    expect(sql).toMatch(/coalesce\(hide_from_map, false\) = false/i);
    // SAFETY: must NOT auto-flip hidden users onto the new tier — hide_from_map is a
    // shared full-off/moderation flag; flipping it could expose a hard-hidden user.
    expect(sql).not.toMatch(/set map_precision = 'hidden',\s*\n\s*hide_from_map = false/i);
  });

  it("set_user_location persists precision + visibility window, NOT via hide_from_map", () => {
    const sql = migration();
    expect(sql).toMatch(/p_precision text default 'area'/i);
    expect(sql).toMatch(/p_visible_hours integer default 2/i);
    expect(sql).toMatch(/map_precision = v_precision/i);
    expect(sql).toMatch(/map_visible_until = v_visible_until/i);
    expect(sql).toMatch(/v_visible_until[\s\S]*p_visible_hours/i);
    expect(sql).not.toMatch(/hide_from_map = \(/i);
  });

  it("preserves the original address/location_name resolution", () => {
    expect(migration()).toMatch(/v_resolved_location_name/);
  });

  it("adds end_map_visibility to support Stop (ends window, keeps location)", () => {
    const sql = migration();
    expect(sql).toMatch(/function public\.end_map_visibility/i);
    expect(sql).toMatch(/map_visible_until = now\(\)/i);
  });

  it("carries map precision through native profile summary for own-pin restore", () => {
    const sql = migration();
    expect(sql).toMatch(/function public\.get_native_profile_summary/i);
    expect(sql).toMatch(/'map_precision', coalesce\(p\.map_precision, 'area'\)/i);
    expect(sql).toMatch(/'map_visible_until', p\.map_visible_until/i);
  });
});
