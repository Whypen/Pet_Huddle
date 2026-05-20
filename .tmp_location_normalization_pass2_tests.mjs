import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  broadcast: read("app/src/lib/nativeBroadcast.ts"),
  editProfile: read("app/src/screens/NativeEditProfileScreen.tsx"),
  location: read("app/src/lib/nativeLocation.ts"),
  social: read("app/src/lib/nativeSocial.ts"),
  viewerScope: read("app/src/lib/nativeViewerScope.ts"),
  migration: read("supabase/migrations/20260515133000_location_normalization_foundation_pass2.sql"),
};

const checks = [
  {
    name: "NativeViewerScope exposes normalized country/admin/city fields",
    pass: /countryCode: string \| null/.test(files.viewerScope) &&
      /countryName: string \| null/.test(files.viewerScope) &&
      /adminArea: string \| null/.test(files.viewerScope) &&
      /city: string \| null/.test(files.viewerScope),
  },
  {
    name: "Viewer scope reverse geocodes selected point from same source",
    pass: /reverseGeocodeNativeLocationComponents\(selectedPoint\.lat, selectedPoint\.lng\)/.test(files.viewerScope),
  },
  {
    name: "SF is normalized as city San Francisco",
    pass: /sf:\s*\{\s*city:\s*"San Francisco"/.test(files.location),
  },
  {
    name: "United State is normalized to United States US",
    pass: /"united state":\s*\{\s*code:\s*"US",\s*name:\s*"United States"/.test(files.location),
  },
  {
    name: "Profile payload uses location alias guard",
    pass: /normalizeNativeLocationTextFields\(\{[\s\S]*country: form\.location_country[\s\S]*district: form\.location_district/.test(files.editProfile),
  },
  {
    name: "Social sends normalized viewer scope fields",
    pass: /countryCode: options\.viewerScope\.countryCode/.test(files.social) &&
      /countryName: options\.viewerScope\.countryName/.test(files.social) &&
      /city: options\.viewerScope\.city/.test(files.social) &&
      /adminArea: options\.viewerScope\.adminArea/.test(files.social),
  },
  {
    name: "Alert creation reverse geocodes incident fields",
    pass: /reverseGeocodeNativeLocationComponents\(lat,\s*lng\)/.test(files.broadcast) &&
      /incident_country_code/.test(files.broadcast) &&
      /incident_city/.test(files.broadcast),
  },
  {
    name: "Migration adds normalized incident columns to map and broadcast alerts",
    pass: /alter table public\.map_alerts[\s\S]*incident_country_code text/.test(files.migration) &&
      /alter table public\.broadcast_alerts[\s\S]*incident_country_code text/.test(files.migration),
  },
  {
    name: "create_alert_thread_and_pin stores normalized incident fields",
    pass: /insert into public\.broadcast_alerts \([\s\S]*incident_country_code[\s\S]*incident_location_confidence/.test(files.migration),
  },
];

let failed = 0;
for (const check of checks) {
  const status = check.pass ? "PASS" : "FAIL";
  if (!check.pass) failed += 1;
  console.log(`${status} ${check.name}`);
}

if (failed) process.exit(1);
