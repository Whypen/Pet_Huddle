import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("native location relevance contract", () => {
  it("owns one foreground watcher at Root and never polls while stationary", () => {
    const rootNavigator = read("app/src/navigation/RootNavigator.tsx");
    const map = read("app/src/screens/NativeMapScreen.tsx");
    const location = read("app/src/lib/nativeLocation.ts");

    expect(rootNavigator).toMatch(/watchNativeLocation\(\(coords\) =>/);
    expect(rootNavigator).toMatch(/distanceInterval: 250/);
    expect(rootNavigator).toMatch(/AppState\.addEventListener\("change"/);
    expect(rootNavigator).toMatch(/Promise\.allSettled\(\[/);
    expect(map).not.toMatch(/watchNativeLocation\(/);
    expect(location).toMatch(/Location\.watchPositionAsync/);
    expect(location).not.toMatch(/setInterval\(/);
    expect(location).toMatch(/coordinateLegacyCleanupDone\.has\(accuracy\)/);
    expect(read("app/src/lib/nativeViewerScope.ts")).toMatch(/clearLegacyViewerScopeCacheOnce/);
  });

  it("keeps private device sync bounded and separate from public pin state", () => {
    const mutations = read("app/src/lib/nativeMapMutations.ts");
    const migration = read("supabase/migrations/20260821074203_native_location_relevance_contract.sql");
    const privateSync = migration.slice(
      migration.indexOf("create or replace function public.set_private_user_location"),
      migration.indexOf("create or replace function public.clear_user_location_pin"),
    );

    expect(mutations).toMatch(/NATIVE_USER_PIN_RETENTION_HOURS = 24;/);
    expect(mutations).toMatch(/set_private_user_location/);
    expect(migration).toMatch(/clock_timestamp\(\) \+ interval '24 hours'/);
    expect(migration).toMatch(/updated_at < clock_timestamp\(\) - interval '15 minutes'/);
    expect(migration).toMatch(/st_dwithin\(public\.user_locations\.location, excluded\.location, 250\)/);
    expect(migration).toMatch(/is_public = false/);
    expect(privateSync).not.toMatch(/update public\.profiles/);
  });

  it("publishes meaningful scope changes to every location-dependent surface", () => {
    const viewerScope = read("app/src/lib/nativeViewerScope.ts");
    const social = read("app/src/screens/NativeSocialScreen.tsx");
    expect(viewerScope).toMatch(/nativeViewerScopeIdentity/);
    expect(viewerScope).toMatch(/Number\(scope\.primaryPoint\.lat\.toFixed\(4\)\)/);

    for (const file of [
      "app/src/screens/NativeMapScreen.tsx",
      "app/src/screens/NativeSocialScreen.tsx",
      "app/src/screens/NativeServiceScreen.tsx",
      "app/src/screens/NativeChatsScreen.tsx",
    ]) {
      expect(read(file)).toMatch(/subscribeNativeViewerScope/);
    }

    // The Social boot cache is deliberately country-scoped for instant paint,
    // so a same-country district/GPS change must still force a background fetch.
    expect(social).toMatch(/setLocationScopeRevision/);
    expect(social).toMatch(/handledLocationScopeRevisionRef/);
    expect(social).toMatch(/void load\("revalidate"\)/);
  });

  it("uses truthful Map guidance", () => {
    const map = read("app/src/screens/NativeMapScreen.tsx");
    expect(map).toContain("Pin your location to receive accurate nearby alerts");
    expect(map).not.toContain("Pin location to see happenings and friends nearby.");
  });

  it("targets alerts by fresh device, active pin, then profile-only fallback", () => {
    const migration = read("supabase/migrations/20260821074203_native_location_relevance_contract.sql");
    expect(migration).toMatch(/ul\.updated_at >= now\(\) - interval '2 hours'/);
    expect(migration).toMatch(/select ul\.location as geog, 1 as priority/);
    expect(migration).toMatch(/select coalesce\(p\.location, p\.location_geog\), 2/);
    expect(migration).toMatch(/select coalesce\(p\.location, p\.location_geog\), 3/);
    expect(migration).toMatch(/recipient_location\.geog is null[\s\S]*incident_district/);
  });

  it("makes live scope replace profile locality and keeps Latest boosts bounded", () => {
    const migration = read("supabase/migrations/20260821074235_social_latest_local_relevance.sql");
    expect(migration).toMatch(/when b\.has_priority_scope then b\.gps_scope_priority/);
    expect(migration).not.toMatch(/least\(b\.gps_scope_priority, b\.profile_scope_priority\)/);
    expect(migration).toMatch(/when 0 then 86400::numeric/);
    expect(migration).toMatch(/then 10800::numeric/);
    expect(migration).toMatch(/\(s\.latest_score, s\.created_at, s\.id\) < \(/);
    expect(migration).toMatch(/then r\.latest_score end desc nulls last/);
  });
});
