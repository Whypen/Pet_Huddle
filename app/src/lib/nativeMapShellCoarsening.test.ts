import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = () =>
  readFileSync(resolve(dir, "../../../supabase/migrations/20260620141000_map_pin_shell_coarsening.sql"), "utf8");

describe("pin shell coarsening", () => {
  it("targets the real RPC name", () => {
    expect(migration()).toMatch(/function public\.get_visible_map_pin_shells/i);
  });

  it("coarsen_latlng snaps to a ~250m cell with a deterministic per-user offset", () => {
    const sql = migration();
    expect(sql).toMatch(/function public\.coarsen_latlng/i);
    expect(sql).toMatch(/0\.00225/);
    expect(sql).toMatch(/p_seed text/i);
    expect(sql).toMatch(/hashtext/i);
    expect(sql).toMatch(/mod\(abs\(hashtext/i);
  });

  it("user_shells coarsens via the helper, not raw last_lat/last_lng", () => {
    const sql = migration();
    expect(sql).not.toMatch(/pr\.last_lat as lat,\s*\n\s*pr\.last_lng as lng/i);
    expect(sql).toMatch(/coarsen_latlng\(pr\.last_lat, pr\.last_lng/i);
    expect(sql).toMatch(/pr\.id::text/i);
    expect(sql).toMatch(/pr\.last_lat is not null/i);
    expect(sql).toMatch(/pr\.last_lng is not null/i);
  });

  it("Hidden stays on the map (masked) and is driven by precision, not hide_from_map", () => {
    const sql = migration();
    expect(sql).toMatch(/map_visible_until > now\(\)/i);
    expect(sql).toMatch(/coalesce\(pr\.map_precision, 'area'\) = 'hidden'/i);
  });

  it("never exposes an Incognito user's identity or relationship in the map menu", () => {
    const screen = readFileSync(resolve(dir, "../screens/NativeMapScreen.tsx"), "utf8");

    expect(screen).toContain('member.is_invisible ? "Someone (private)"');
    expect(screen).toContain("friendPeerIds.has(member.id) && !member.is_invisible");
    expect(screen).toMatch(/if \(member\.is_invisible\) \{[\s\S]*?This person is sharing privately\./);
  });

  it("keeps the legacy hide_from_map=false gate (full-off/moderation stays hidden)", () => {
    // Hidden-tier users have hide_from_map=false so they pass; only true full-off
    // (moderation/legacy) users are removed. This gate must NOT be dropped.
    expect(migration()).toMatch(/and coalesce\(pr\.hide_from_map, false\) = false/i);
  });

  it("never coarsens alert coordinates (alerts return raw lat/lng)", () => {
    const sql = migration();
    expect(sql).toMatch(/b\.latitude as lat/i);
    expect(sql).toMatch(/b\.longitude as lng/i);
  });
});
