import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260813120955_map_connection_aggregate_privacy_v2.sql"), "utf8");
const canonicalMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260813145518_canonicalize_map_area_privacy.sql"), "utf8");
const singletonSuppressionMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260814153315_suppress_singleton_anonymous_map_areas.sql"), "utf8");
const incognitoAnonymizationMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260814160838_anonymize_incognito_map_connections.sql"), "utf8");
const versionedGeometryMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260816153000_versioned_map_area_geometry_v2.sql"), "utf8");
const triggerFix = fs.readFileSync(path.join(root, "supabase/migrations/20260813121707_fix_map_relationship_invalidation_trigger.sql"), "utf8");
const mapScreen = fs.readFileSync(path.join(root, "app/src/screens/NativeMapScreen.tsx"), "utf8");
const mapData = fs.readFileSync(path.join(root, "app/src/lib/nativeMapData.ts"), "utf8");
const precision = fs.readFileSync(path.join(root, "app/src/lib/nativeMapPrecision.ts"), "utf8");
const authScreen = fs.readFileSync(path.join(root, "app/src/screens/NativeAuthScreen.tsx"), "utf8");
const privacySource = fs.readFileSync(path.join(root, "legal/legal-documents.json"), "utf8");

describe("map aggregate privacy v2", () => {
  it("suppresses singleton cells, excludes connections, and returns no anonymous identity", () => {
    expect(canonicalMigration).toMatch(/where not e\.is_connection/i);
    expect(singletonSuppressionMigration).toMatch(/where not e\.is_connection/i);
    expect(singletonSuppressionMigration).toMatch(/a\.member_count >= 2/i);
    expect(canonicalMigration).not.toMatch(/anonymousAreas[\s\S]{0,700}'id'/i);
    expect(canonicalMigration).not.toMatch(/anonymousAreas[\s\S]{0,700}'avatarUrl'/i);
    expect(canonicalMigration).toContain("group by e.cell_lat, e.cell_lng");
    expect(canonicalMigration).not.toMatch(/st_clusterdbscan|st_clusterwithin|cluster_no/i);
  });

  it("forces public location sharing to Area while preserving Incognito", () => {
    expect(migration).toContain("new.map_precision := 'area'");
    expect(migration).toMatch(/coarsen_latlng\(pr\.last_lat, pr\.last_lng, 'area'/i);
    expect(precision).toMatch(/value === "hidden" \? value : NATIVE_MAP_PRECISION_DEFAULT/);
    expect(canonicalMigration).toMatch(/set map_precision = 'area'[\s\S]*map_precision is distinct from 'hidden'/i);
    expect(mapScreen).not.toMatch(/precision === "precise"|selfPrecision === "precise"/);
  });

  it("makes Incognito anonymous at the RPC boundary and fails closed in the client", () => {
    expect(incognitoAnonymizationMigration).toMatch(/'id', case when is_invisible then null else id end/i);
    expect(incognitoAnonymizationMigration).toMatch(/'displayName', case when is_invisible then null else display_name end/i);
    expect(incognitoAnonymizationMigration).toMatch(/'avatarUrl', case when is_invisible then null else avatar_url end/i);
    expect(incognitoAnonymizationMigration).toMatch(/'isVerified', case when is_invisible then false else is_verified end/i);
    expect(incognitoAnonymizationMigration).toMatch(/'genderGenre', case when is_invisible then null else gender_genre end/i);
    expect(incognitoAnonymizationMigration).toMatch(/'visibleUntil', case when is_invisible then null else map_visible_until end/i);
    expect(mapData).toMatch(/isInvisible\s*\? `incognito:\$\{index\}:\$\{lat\.toFixed\(5\)\}:\$\{lng\.toFixed\(5\)\}`/);
    expect(mapData).toContain("display_name: !isInvisible");
    expect(mapData).toContain("avatar_url: isInvisible ? null");
    expect(mapData).toContain("is_verified: !isInvisible");
    expect(mapData).toContain("gender_genre: !isInvisible");
    expect(mapData).toContain("location_pinned_until: !isInvisible");
  });

  it("uses existing triggered map broadcasts without cron or broad profile listeners", () => {
    expect(migration).toContain("private.send_huddle_invalidation");
    expect(migration).not.toMatch(/pg_cron|cron\.schedule/i);
    expect(mapScreen).not.toContain('table: "profiles"');
    expect(mapScreen).not.toContain('if (status === "SUBSCRIBED") refreshMapShell()');
    expect(mapScreen).toContain("mapPeopleExpiryTimerRef");
  });

  it("does not read an unavailable trigger record on insert or delete", () => {
    expect(triggerFix).toMatch(/if tg_op = 'DELETE' then[\s\S]*old\.user1_id[\s\S]*else[\s\S]*new\.user1_id/i);
    expect(triggerFix).not.toMatch(/coalesce\(new\.[^)]+, old\./i);
  });

  it("uses Apple's official logo-only button artwork beside the logo-only Google control", () => {
      expect(authScreen).toContain('import appleIcon from "../../assets/apple-icon.png"');
      expect(authScreen).toContain('accessibilityLabel="Continue with Apple"');
      expect(authScreen).toContain("source={appleIcon}");
      expect(authScreen).toMatch(/accessibilityLabel="Continue with Apple"[\s\S]*?<NativeGlassCircle fallbackTint="rgba\(255,255,255,0\.42\)" glassOpacity=\{0\.82\} highlightOpacity=\{0\.42\} materialTint="rgba\(255,255,255,0\.18\)" rimColor="rgba\(255,255,255,0\.54\)" size=\{SOCIAL_CIRCLE_SIZE\} tint="rgba\(255,255,255,0\.18\)">/);
      expect(authScreen).toMatch(/appleLogoOnlyButton:\s*\{[\s\S]*height: 21,[\s\S]*width: 16/);
      expect(authScreen).not.toContain("<AppleAuthentication.AppleAuthenticationButton");
      expect(authScreen).not.toContain("signInWithAppleLogoOnly");
  });

  it("keeps the requested disclosure in legal copy rather than adding map UI copy", () => {
    expect(privacySource).toContain("an approximate area may be used to indicate area popularity");
    expect(mapScreen).not.toContain("area popularity");
  });

  it("reuses the existing Huddle grouped-marker UI for anonymous area counts", () => {
    expect(mapScreen).toContain('pickNativeGroupedPinAsset(`anonymous:${area.clusterKey}`)');
    expect(mapScreen).toContain("<FriendGroupMarker asset={area.asset} count={area.count} />");
    expect(mapScreen).not.toMatch(/AnonymousAreaMarker|StrangerAreaMarker|anonymousMarkerStyles/);
  });

  it("uses one versioned server area key for friends, strangers, and the owner", () => {
    expect(versionedGeometryMigration).toMatch(/create or replace function public\.map_area_cell_v2/i);
    expect(versionedGeometryMigration).toMatch(/create or replace function public\.get_native_map_people_v3/i);
    expect(versionedGeometryMigration).toContain("'geometryVersion', 2");
    expect(versionedGeometryMigration).toContain("'viewerArea'");
    expect(versionedGeometryMigration).toMatch(/'areaKey', area_key[\s\S]*from connection_rows/i);
    expect(versionedGeometryMigration).toMatch(/'clusterKey', area_key[\s\S]*from visible_anonymous_clusters/i);
    expect(versionedGeometryMigration).toMatch(/a\.member_count >= 2/i);
    expect(versionedGeometryMigration).not.toMatch(/anonymousAreas[\s\S]{0,700}'id'/i);
    expect(versionedGeometryMigration).not.toMatch(/anonymousAreas[\s\S]{0,700}'avatarUrl'/i);
    expect(mapScreen).not.toContain("AREA_CLUSTER_MAX_DIAMETER_M");
    expect(mapScreen).toContain("buildNativeMapPeopleAreaGroups");
  });

  it("keeps old clients on old geometry and bounds latitude correction", () => {
    expect(versionedGeometryMigration).not.toMatch(/create or replace function public\.coarsen_latlng/i);
    expect(versionedGeometryMigration).not.toMatch(/create or replace function public\.get_native_map_people_v2/i);
    expect(versionedGeometryMigration).toContain("75.0::double precision as correction_latitude_limit");
    expect(versionedGeometryMigration).toMatch(/least\(correction_latitude_limit, abs\(/i);
    expect(mapData).toMatch(/get_native_map_people_v3[\s\S]*missingVersionedRpc[\s\S]*get_native_map_people_v2/);
    expect(mapScreen).toContain("resolveOwnAreaCoordinate");
  });

  it("suppresses singleton anonymous areas through RPC and warm-session restore paths", () => {
    expect(mapScreen).toContain("setAnonymousAreas(parseNativeMapAnonymousAreas(cached.anonymousAreas))");
    expect(mapData).toContain("const anonymousAreas = parseNativeMapAnonymousAreas(record.anonymousAreas)");
    expect(fs.readFileSync(path.join(root, "app/src/lib/nativeMapPeopleV2.ts"), "utf8")).toContain("count < 2");
    expect(mapScreen).toContain("huddle:native-map-session:v8:");
  });

  it("keeps friend locations memory-only and sweeps historical persistent caches", () => {
    const navigator = fs.readFileSync(path.join(root, "app/src/navigation/RootNavigator.tsx"), "utf8");
    const sessionWrite = mapScreen.match(/AsyncStorage\.setItem\(mapSessionCacheKey,[\s\S]{0,700}?\}\)\);/)?.[0] ?? "";
    const sessionReadShape = mapScreen.match(/const cached = raw \? JSON\.parse\(raw\) as \{[\s\S]{0,700}?\} : null;/)?.[0] ?? "";
    expect(mapData).toContain("export const clearNativeMapCaches");
    expect(mapData).toContain("export const purgeNativeMapPersistentCaches");
    expect(mapData).toContain('key.startsWith("native-map:") || key.startsWith("huddle:native-map-")');
    expect(mapData).toContain("cacheGeneration === nativeMapCacheGeneration");
    expect(mapData).not.toMatch(/persistentMapCacheKey|readPersistentMapCache|writePersistentMapCache|pendingMapPersistentWrites/);
    expect(sessionWrite).not.toMatch(/friends\s*:|ownPin\s*:/);
    expect(sessionReadShape).not.toMatch(/friends\??\s*:|ownPin\??\s*:/);
    // Window widened past the Live Activity teardown that now also runs in this
    // branch. The contract asserted here is unchanged: sign-out clears map caches.
    expect(navigator).toMatch(/eventName === "SIGNED_OUT" \|\| eventName === "USER_DELETED"[\s\S]{0,400}clearNativeMapCaches\(\)/);
    expect(navigator).toMatch(/currentSessionRef\.current\?\.userId[\s\S]{0,400}clearNativeMapCaches\(\)/);
    expect(navigator).toMatch(/state === "active"[\s\S]{0,180}purgeNativeMapPersistentCaches\(\)/);
  });

  it("has no client path for precise friend coordinates", () => {
    expect(mapScreen).not.toContain("preciseFriends");
    expect(mapData).toContain("is_approximate: true");
  });

  it("keeps anonymous markers on their server cell and resolves collisions visually", () => {
    expect(mapScreen).toContain("coordinate: [area.lng, area.lat] as [number, number]");
    expect(mapScreen).not.toMatch(/anonymousDisplayAreas[\s\S]{0,1400}attachment/);
    expect(mapScreen).toContain("pinCollisionOffsets.get(`anonymous:${area.clusterKey}`)");
  });
});
