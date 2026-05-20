import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const files = {
  nativeChat: read("app/src/lib/nativeChat.ts"),
  chatsScreen: read("app/src/screens/NativeChatsScreen.tsx"),
  nativeService: read("app/src/lib/nativeService.ts"),
  serviceScreen: read("app/src/screens/NativeServiceScreen.tsx"),
  serviceSql: read("supabase/migrations/20260512133000_native_service_provider_card_detail_rpc.sql"),
  socialSql: read("supabase/migrations/20260514170500_social_feed_remote_schema_safe_scope.sql"),
};
const filterMigration = read("supabase/migrations/20260515103000_discover_service_social_filter_contract.sql");
const serviceCardMigration = filterMigration.slice(0, filterMigration.indexOf("create or replace function public.get_native_service_provider_detail"));

const checks = [
  {
    name: "Discover all-selected orientation/degree/languages serialize as null",
    pass:
      /orientations:\s*orientationFilter/.test(files.nativeChat) &&
      /degrees:\s*degreeFilter/.test(files.nativeChat) &&
      /languages:\s*languageFilter/.test(files.nativeChat),
    expected: true,
  },
  {
    name: "Discover Active Only is 24h in DB",
    pass: /v_active_only[\s\S]*interval '24 hours'/.test(filterMigration),
    expected: true,
  },
  {
    name: "Discover hidden freshness is unconditional 30d client cutoff",
    pass: /!options\?\.relaxFreshness\s*&&\s*activeMs\(profile\)\s*<\s*Date\.now\(\)\s*-\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(files.chatsScreen),
    expected: true,
  },
  {
    name: "Service card RPC has artificial LIMIT 100",
    pass: /limit\s+100\s*;/.test(serviceCardMigration),
    expected: false,
  },
  {
    name: "Service cards return proof_metadata for certified filter",
    pass: /returns table\([\s\S]*proof_metadata jsonb/.test(serviceCardMigration),
    expected: true,
  },
  {
    name: "Service mapper preserves proofMetadata from card rows",
    pass: /proofMetadata:\s*\{\}/.test(files.nativeService) === false,
    expected: true,
  },
  {
    name: "Service certified badge uses proof-backed helper instead of skill text",
    pass: /const certified\s*=\s*provider\.skills\.some/.test(files.serviceScreen) === false,
    expected: true,
  },
  {
    name: "Service filter fields are wired to mapped pet_care_profiles fields",
    pass:
      /matchServiceTypes\(provider,\s*filters\.serviceTypes\)/.test(files.nativeService) &&
      /includesAll\(provider\.days,\s*filters\.selectedWeekdays\)/.test(files.nativeService) &&
      /provider\.isBookmarked/.test(files.nativeService) &&
      /provider\.emergencyReadiness/.test(files.nativeService) &&
      /includesAny\(provider\.petTypes,\s*filters\.petTypes\)/.test(files.nativeService) &&
      /includesAny\(provider\.dogSizes,\s*filters\.dogSizes\)/.test(files.nativeService) &&
      /includesAny\(provider\.locationStyles,\s*filters\.locationStyles\)/.test(files.nativeService),
    expected: true,
  },
  {
    name: "Service listing does not double-gate Huddle identity verification",
    pass:
      /p\.verification_status::text = 'verified'/.test(serviceCardMigration) === false &&
      /provider\.verificationStatus !== "verified"/.test(files.nativeService) === false,
    expected: true,
  },
  {
    name: "Social alert feed requires same country AND 150km when geog exists",
    pass: /a\.location_country\s*=\s*v\.country[\s\S]*st_dwithin\(v\.geog,\s*a\.scope_geog,\s*150000\)/.test(filterMigration),
    expected: true,
  },
  {
    name: "Social alert feed currently allows radius OR country",
    pass: /st_dwithin\(v\.geog,\s*a\.scope_geog,\s*150000\)[\s\S]*or[\s\S]*a\.location_country\s*=\s*v\.country/.test(filterMigration),
    expected: false,
  },
];

let failed = 0;
for (const check of checks) {
  const status = check.pass === check.expected ? "PASS" : "FAIL";
  if (status === "FAIL") failed += 1;
  console.log(`${status} ${check.name} actual=${check.pass} expected=${check.expected}`);
}

if (failed) process.exit(1);
