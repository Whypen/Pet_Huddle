import fs from "node:fs";

const root = "/Users/hyphen/Documents/Whypen/Huddle App/Pet_Huddle";
const migration = fs.readFileSync(`${root}/supabase/migrations/20260515153000_scope_ranking_fallback_pass3.sql`, "utf8");
const nativeChat = fs.readFileSync(`${root}/app/src/lib/nativeChat.ts`, "utf8");
const nativeService = fs.readFileSync(`${root}/app/src/lib/nativeService.ts`, "utf8");
const serviceScreen = fs.readFileSync(`${root}/app/src/screens/NativeServiceScreen.tsx`, "utf8");

const checks = [
  {
    name: "Discover passes same-source viewer city/district/country into RPC",
    pass: nativeChat.includes("viewer_city: options?.viewerScope?.city ?? null") &&
      nativeChat.includes("viewer_district: options?.viewerScope?.district ?? null") &&
      nativeChat.includes("min_local_results: 50"),
  },
  {
    name: "Discover ranking is district -> city -> radius -> country fallback",
    pass: migration.includes("when v.district is not null and p.candidate_district = v.district then 0") &&
      migration.includes("when v.city is not null and p.candidate_city = v.city then 1") &&
      migration.includes("st_dwithin(p.candidate_geog, v.geog, v_radius_m) then 2") &&
      migration.includes("when v.country is not null and p.candidate_country = v.country then 3"),
  },
  {
    name: "Discover country fallback only runs when local result count is below target",
    pass: migration.includes("count(*) filter (where f.scope_priority in (0, 1, 2)) over () as local_count") &&
      migration.includes("c.scope_priority = 3 and c.local_count < v_min_local_results"),
  },
  {
    name: "Service passes NativeViewerScope to DB and cache keys",
    pass: nativeService.includes("viewerScope?: NativeViewerScope | null") &&
      nativeService.includes("p_viewer_scope: viewerScope ?") &&
      serviceScreen.includes("viewerScope: Awaited<ReturnType<typeof resolveNativeViewerScope>> | null"),
  },
  {
    name: "Service has no broad country fallback and ranks district -> city -> 50km",
    pass: migration.includes("when v.district is not null and ps.provider_district = v.district then 0") &&
      migration.includes("when v.city is not null and ps.provider_city = v.city then 1") &&
      migration.includes("st_dwithin(ps.provider_geog, v.geog, 50000) then 2") &&
      migration.includes("where s.scope_priority in (0, 1, 2)") &&
      !migration.includes("lower(btrim(p.location_country)) = lower(btrim(p_viewer_country))"),
  },
  {
    name: "Service client no longer post-filters same-source point with stale country",
    pass: !nativeService.includes("providerCountryKey === viewerCountryKey") &&
      nativeService.includes("return distanceKm === null || distanceKm <= 50;"),
  },
  {
    name: "Social uses app scope city/district and 150km before country fallback",
    pass: migration.includes("p_viewer_scope->>'city'") &&
      migration.includes("st_dwithin(v.geog, a.scope_geog, 150000) then 2") &&
      migration.includes("a.location_city = v.city then 1") &&
      migration.includes("a.location_country = v.country then 3"),
  },
  {
    name: "Social country fallback only runs when local result count is below 50",
    pass: migration.includes("count(*) filter (where b.scope_priority in (0, 1, 2)) over () as local_count") &&
      migration.includes("s.scope_priority = 3 and s.local_count < v_min_local_results"),
  },
  {
    name: "Alert-derived Social no longer parses country from address",
    pass: !migration.includes("reverse(split_part(reverse") &&
      !migration.includes("address, ''), ',', 3"),
  },
];

const failed = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
