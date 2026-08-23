import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(dir, "../../../supabase/migrations/20260812123216_event_driven_home_and_care_refresh.sql"), "utf8");
const noOpMigration = readFileSync(resolve(dir, "../../../supabase/migrations/20260812123327_suppress_noop_care_payment_invalidations.sql"), "utf8");
const home = readFileSync(resolve(dir, "../screens/NativeHomeScreen.tsx"), "utf8");
const care = readFileSync(resolve(dir, "../screens/NativeServiceChatScreen.tsx"), "utf8");

describe("event-driven Home and Care refresh", () => {
  it("removes the measured database polling loops", () => {
    expect(home).not.toMatch(/setInterval\(\(\) => \{\s*void refreshHomeNearbyPins/);
    expect(care).not.toContain("setInterval(() => void refresh(), 60_000)");
  });

  it("uses geographic profile invalidations for nearby Home presence", () => {
    expect(migration).toContain("after update of last_lat,last_lng,map_visible,map_visible_until,map_precision");
    expect(migration).toContain("private.map_realtime_topic(old.last_lat,old.last_lng)");
    expect(home).toContain("mapRealtimeTopicsForCenters([[lng, lat]])");
  });

  it("routes payment-ledger changes only to Care participants", () => {
    expect(migration).toContain("on public.care_payment_movements");
    expect(migration).toContain("select sc.requester_id recipient");
    expect(migration).toContain("union select sc.provider_id");
    expect(care).toContain("`user:${userId}:care`");
    expect(care).toContain('`user:${userId}:care`');
    expect(noOpMigration).toContain("tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old)");
  });
});
