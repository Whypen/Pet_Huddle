import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { activeOutCompanionTrace, buildActiveOutCompanions } from "./nativeActiveSessionCompanions";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("active Out companion payload", () => {
  it("keeps Kurio named and clean while Hyphen remains a blurred +1 slot", () => {
    const companions = buildActiveOutCompanions([
      { avatarBlurred: false, avatarUrl: "https://example.test/kurio.jpg", displayName: "Kurio" },
      { avatarBlurred: true, avatarUrl: "https://example.test/hyphen.jpg", displayName: "Hyphen" },
    ]);

    expect(companions).toEqual([
      { avatarUrl: "https://example.test/kurio.jpg", isBlurred: false, name: "Kurio" },
      { avatarUrl: "https://example.test/hyphen.jpg", isBlurred: true, name: "" },
    ]);
    expect(activeOutCompanionTrace(companions, 2)).toEqual({
      avatarIsBlurred: [false, true],
      hasName: [true, false],
      hasPhoto: [true, true],
      totalCount: 2,
    });
  });

  it("uses one canonical 2 km Out Now snapshot across Home, hydration, and pushes", () => {
    const home = read("src/screens/NativeHomeScreen.tsx");
    const hydration = read("src/lib/nativeActiveSessionHydration.ts");
    const dispatcher = read("../supabase/functions/dispatch-live-activity-progress/index.ts");
    const migration = read("../supabase/migrations/20260719013000_canonical_nearby_out_snapshot.sql");

    expect(home).toContain("preloadNativeHomeNearbyPeople({ userId, accessToken, sessionKey");
    expect(hydration).toContain("fetchNativeNearbyOutSnapshot(userId, accessToken)");
    expect(dispatcher).toContain('rpc("get_live_activity_nearby_companions"');
    expect(migration).toContain("extensions.st_dwithin(coalesce(peer.location, peer.location_geog), viewer.geog, 2000)");
    expect(migration).toContain("coalesce(peer.map_precision, 'area') <> 'hidden'");
    expect(migration).toContain("'friendCount'");
    expect(migration).toContain("'nearbyUserCount'");
    expect(home).toContain('title="Nearby right now"');
    expect(home).toMatch(/pulse\.outPeople\.length > 0[\s\S]*title="Nearby out now"[\s\S]*discoverTeasers\.length > 0[\s\S]*title="Nearby right now"/);
  });

  it("does not let Incognito appear as a named friend in Nearby Out Now", () => {
    const migration = read("../supabase/migrations/20260719013000_canonical_nearby_out_snapshot.sql");

    expect(migration).toMatch(/peer\.map_visible_until > now\(\)[\s\S]*?coalesce\(peer\.map_precision, 'area'\) <> 'hidden'/);
    expect(migration).toContain("'isBlurred', not is_matched");
    expect(migration).toContain("'name', case when is_matched then coalesce(display_name, '') else '' end");
  });
});
