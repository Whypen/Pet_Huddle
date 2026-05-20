import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/src/lib/nativeViewerScope.ts", "utf8");
const serviceSource = readFileSync("app/src/screens/NativeServiceScreen.tsx", "utf8");
const discoverSource = readFileSync("app/src/lib/nativeChat.ts", "utf8");
const notificationSource = readFileSync("app/src/lib/nativeNotifications.ts", "utf8");
const socialMigration = readFileSync("supabase/migrations/20260514170500_social_feed_remote_schema_safe_scope.sql", "utf8");

const clean = (value) => String(value || "").trim() || null;
const bounds = {
  "hong kong": { minLat: 22.13, maxLat: 22.57, minLng: 113.81, maxLng: 114.44 },
  "united states": { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 },
};
const inCountry = (point, country) => {
  const box = bounds[String(country || "").trim().toLowerCase()];
  if (!box) return true;
  return point.lat >= box.minLat && point.lat <= box.maxLat && point.lng >= box.minLng && point.lng <= box.maxLng;
};
const selectScope = (input) => {
  const profileCountry = clean(input.profileCountry);
  const profileDistrict = clean(input.profileDistrict);
  const cached = input.cachedDevicePoint || input.dbCachedDevicePoint || input.recentUserPoint || null;
  const dropProfileText = profileCountry || profileDistrict ? ["profile_country", "profile_district"] : [];
  if (input.liveDevicePoint) return { source: "live_device_gps", primaryPoint: input.liveDevicePoint, country: null, district: null, droppedFields: dropProfileText };
  if (cached) return { source: "cached_device_gps", primaryPoint: cached, country: null, district: null, droppedFields: dropProfileText };
  if (input.ownPinPoint) return { source: "active_pinned_location", primaryPoint: input.ownPinPoint, country: null, district: null, droppedFields: dropProfileText };
  if (input.profilePoint && (!profileCountry || inCountry(input.profilePoint, profileCountry))) {
    return { source: "profile_location_geog", primaryPoint: input.profilePoint, country: profileCountry, district: profileDistrict, droppedFields: [] };
  }
  if (profileCountry || profileDistrict) return { source: "country_district_fallback", primaryPoint: null, country: profileCountry, district: profileDistrict, droppedFields: input.profilePoint ? ["profile_point"] : [] };
  return { source: "unresolved", primaryPoint: null, country: null, district: null, droppedFields: [] };
};

const sf = { lat: 37.786, lng: -122.406 };
const hk = { lat: 22.284, lng: 114.191 };

assert.match(source, /sourceConsistent/);
assert.match(source, /droppedFields/);
assert.match(source, /gps_scope_drops_profile_text/);
assert.match(source, /cachedDevicePoint \|\| dbCachedDevicePoint \|\| recentUserPoint/);
assert.match(source, /profile_point_outside_profile_country/);
assert.doesNotMatch(serviceSource, /profileSnapshot\?\.profile\?\.location_country/);
assert.match(serviceSource, /const viewerCountry = viewerScope\?\.country \?\? null/);
assert.match(discoverSource, /viewerCountry: options\?\.viewerScope\?\.country \?\? null/);
assert.match(notificationSource, /viewerScope\.primaryPoint/);
assert.doesNotMatch(notificationSource, /viewerScope\.ownPinPoint/);
assert.match(socialMigration, /ma_by_map\.location_geog/);
assert.match(socialMigration, /alert_location_missing_author_scope_fallback/);

assert.deepEqual(selectScope({
  liveDevicePoint: sf,
  profilePoint: hk,
  profileCountry: "Hong Kong",
  profileDistrict: "Tai Hang",
}), {
  source: "live_device_gps",
  primaryPoint: sf,
  country: null,
  district: null,
  droppedFields: ["profile_country", "profile_district"],
});

assert.deepEqual(selectScope({
  profilePoint: hk,
  profileCountry: "Hong Kong",
  profileDistrict: "Tai Hang",
}), {
  source: "profile_location_geog",
  primaryPoint: hk,
  country: "Hong Kong",
  district: "Tai Hang",
  droppedFields: [],
});

assert.deepEqual(selectScope({
  profilePoint: sf,
  profileCountry: "Hong Kong",
  profileDistrict: "Tai Hang",
}), {
  source: "country_district_fallback",
  primaryPoint: null,
  country: "Hong Kong",
  district: "Tai Hang",
  droppedFields: ["profile_point"],
});

assert.equal(selectScope({ cachedDevicePoint: sf, profileCountry: "Hong Kong" }).country, null);
assert.equal(selectScope({ ownPinPoint: sf, profileCountry: "Hong Kong" }).country, null);

console.log("viewer_scope_contract_tests: ok");
