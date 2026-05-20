import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  nativeSocial: read("app/src/lib/nativeSocial.ts"),
  socialScreen: read("app/src/screens/NativeSocialScreen.tsx"),
  migration: read("supabase/migrations/20260515122000_social_feed_app_viewer_scope_pass1.sql"),
};

const checks = [
  {
    name: "Native Social feed accepts viewerScope option",
    pass: /viewerScope\?: NativeViewerScope \| null/.test(files.nativeSocial),
  },
  {
    name: "Native Social feed sends p_viewer_scope to RPC",
    pass: /p_viewer_scope:\s*options\.viewerScope/.test(files.nativeSocial),
  },
  {
    name: "Native Social screen resolves NativeViewerScope before feed load",
    pass: /resolveNativeViewerScope\(\{ userId, accessToken \}\)/.test(files.socialScreen),
  },
  {
    name: "Native Social screen passes viewerScope into fetchNativeSocialFeedPage",
    pass: /fetchNativeSocialFeedPage\([\s\S]*viewerScope/.test(files.socialScreen),
  },
  {
    name: "SQL get_social_feed accepts p_viewer_scope jsonb",
    pass: /create or replace function public\.get_social_feed\([\s\S]*p_viewer_scope jsonb default null/.test(files.migration),
  },
  {
    name: "SQL viewer scope uses app lat/lng when provided",
    pass: /st_makepoint\(\(p_viewer_scope->>'lng'\)::double precision,\s*\(p_viewer_scope->>'lat'\)::double precision\)/.test(files.migration),
  },
  {
    name: "SQL app scope does not fallback to profile country when app scope exists",
    pass: /when vs\.has_app_scope then public\.normalize_country_key\(vs\.scope_country\)/.test(files.migration),
  },
  {
    name: "Alert-derived feed uses 150km geog condition",
    pass: /a\.is_alert_derived[\s\S]*st_dwithin\(v\.geog,\s*a\.scope_geog,\s*150000\)/.test(files.migration),
  },
  {
    name: "Alert-derived feed has no country equality requirement",
    pass: /a\.location_country\s*=\s*v\.country/.test(files.migration) === false,
  },
  {
    name: "Alert scope no longer parses address last segment as country",
    pass: /reverse\(split_part\(reverse/.test(files.migration) === false,
  },
];

let failed = 0;
for (const check of checks) {
  const status = check.pass ? "PASS" : "FAIL";
  if (!check.pass) failed += 1;
  console.log(`${status} ${check.name}`);
}

if (failed) process.exit(1);
