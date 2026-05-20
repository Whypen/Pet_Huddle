import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNativeCurrentCoordinates, getNativeForegroundLocationPermissionDetail, normalizeNativeLocationTextFields, reverseGeocodeNativeLocationComponents, type NativeLocationComponents } from "./nativeLocation";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export type NativeViewerScopeSource =
  | "live_device_gps"
  | "cached_device_gps"
  | "active_pinned_location"
  | "recent_last_location"
  | "profile_location_geog"
  | "country_district_fallback"
  | "unresolved";

export type NativeViewerScopePoint = {
  lat: number;
  lng: number;
};

export type NativeViewerScope = {
  adminArea: string | null;
  city: string | null;
  countryCode: string | null;
  countryName: string | null;
  primaryPoint: NativeViewerScopePoint | null;
  ownPinPoint: NativeViewerScopePoint | null;
  recentUserPoint: NativeViewerScopePoint | null;
  country: string | null;
  district: string | null;
  sourceConsistent: boolean;
  droppedFields: string[];
  reason: string | null;
  source: NativeViewerScopeSource;
  resolvedAt: string;
};

type NativeViewerScopeRpcPoint = {
  lat?: number | null;
  lng?: number | null;
};

type NativeViewerScopeRpcRow = {
  user_id?: string | null;
  cached_device_point?: NativeViewerScopeRpcPoint | null;
  own_pin_point?: NativeViewerScopeRpcPoint | null;
  recent_user_point?: NativeViewerScopeRpcPoint | null;
  profile_point?: NativeViewerScopeRpcPoint | null;
  country?: string | null;
  district?: string | null;
  location_name?: string | null;
};

const coordinatePersistentKey = (accuracy: "balanced" | "high") => `native-location-coordinate:v1:${accuracy}`;

const normalizePoint = (value: unknown): NativeViewerScopePoint | null => {
  if (!value || typeof value !== "object") return null;
  const point = value as { lat?: unknown; lng?: unknown };
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const cleanText = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

const normalizedText = (value: string | null) => String(value || "").trim().toLowerCase();

const COUNTRY_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  "hong kong": { minLat: 22.13, maxLat: 22.57, minLng: 113.81, maxLng: 114.44 },
  hk: { minLat: 22.13, maxLat: 22.57, minLng: 113.81, maxLng: 114.44 },
  singapore: { minLat: 1.16, maxLat: 1.48, minLng: 103.57, maxLng: 104.12 },
  sg: { minLat: 1.16, maxLat: 1.48, minLng: 103.57, maxLng: 104.12 },
  "united states": { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 },
  us: { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 },
  usa: { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 },
  "united states of america": { minLat: 18, maxLat: 72, minLng: -180, maxLng: -66 },
};

const isPointInCountry = (point: NativeViewerScopePoint, country: string | null) => {
  const bounds = COUNTRY_BOUNDS[normalizedText(country)];
  if (!bounds) return true;
  return point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng;
};

const buildConsistentScope = ({
  liveDevicePoint,
  cachedDevicePoint,
  dbCachedDevicePoint,
  ownPinPoint,
  recentUserPoint,
  profilePoint,
  profileCountry,
  profileDistrict,
  sourceComponents,
  resolvedAt,
}: {
  liveDevicePoint: NativeViewerScopePoint | null;
  cachedDevicePoint: NativeViewerScopePoint | null;
  dbCachedDevicePoint: NativeViewerScopePoint | null;
  ownPinPoint: NativeViewerScopePoint | null;
  recentUserPoint: NativeViewerScopePoint | null;
  profilePoint: NativeViewerScopePoint | null;
  profileCountry: string | null;
  profileDistrict: string | null;
  sourceComponents?: NativeLocationComponents | null;
  resolvedAt: string;
}): NativeViewerScope => {
  const profileComponents = normalizeNativeLocationTextFields({ country: profileCountry, district: profileDistrict });
  const components = sourceComponents ?? null;
  const gpsCachedPoint = cachedDevicePoint || dbCachedDevicePoint || recentUserPoint;
  const base = {
    adminArea: null as string | null,
    city: null as string | null,
    countryCode: null as string | null,
    countryName: null as string | null,
    ownPinPoint: null,
    recentUserPoint: null,
    sourceConsistent: true,
    droppedFields: [] as string[],
    reason: null as string | null,
    resolvedAt,
  };

  if (liveDevicePoint) {
    return {
      ...base,
      adminArea: components?.adminArea ?? null,
      city: components?.city ?? null,
      primaryPoint: liveDevicePoint,
      country: components?.countryName ?? null,
      countryCode: components?.countryCode ?? null,
      countryName: components?.countryName ?? null,
      district: components?.district ?? null,
      droppedFields: profileCountry || profileDistrict ? ["profile_country", "profile_district"] : [],
      reason: profileCountry || profileDistrict ? "gps_scope_drops_profile_text" : null,
      source: "live_device_gps",
    };
  }

  if (gpsCachedPoint) {
    return {
      ...base,
      adminArea: components?.adminArea ?? null,
      city: components?.city ?? null,
      primaryPoint: gpsCachedPoint,
      country: components?.countryName ?? null,
      countryCode: components?.countryCode ?? null,
      countryName: components?.countryName ?? null,
      district: components?.district ?? null,
      droppedFields: profileCountry || profileDistrict ? ["profile_country", "profile_district"] : [],
      reason: profileCountry || profileDistrict ? "cached_gps_scope_drops_profile_text" : null,
      source: "cached_device_gps",
    };
  }

  if (ownPinPoint) {
    return {
      ...base,
      adminArea: components?.adminArea ?? null,
      city: components?.city ?? null,
      primaryPoint: ownPinPoint,
      ownPinPoint,
      country: components?.countryName ?? null,
      countryCode: components?.countryCode ?? null,
      countryName: components?.countryName ?? null,
      district: components?.district ?? null,
      droppedFields: profileCountry || profileDistrict ? ["profile_country", "profile_district"] : [],
      reason: profileCountry || profileDistrict ? "app_location_scope_drops_profile_text" : null,
      source: "active_pinned_location",
    };
  }

  if (profilePoint && (!profileCountry || isPointInCountry(profilePoint, profileCountry))) {
    return {
      ...base,
      city: profileComponents.city,
      primaryPoint: profilePoint,
      country: profileComponents.countryName || profileCountry,
      countryCode: profileComponents.countryCode,
      countryName: profileComponents.countryName || profileCountry,
      district: profileComponents.district || profileDistrict,
      source: "profile_location_geog",
    };
  }

  if (profileCountry || profileDistrict) {
    return {
      ...base,
      primaryPoint: null,
      city: profileComponents.city,
      country: profileComponents.countryName || profileCountry,
      countryCode: profileComponents.countryCode,
      countryName: profileComponents.countryName || profileCountry,
      district: profileComponents.district || profileDistrict,
      droppedFields: profilePoint ? ["profile_point"] : [],
      reason: profilePoint ? "profile_point_outside_profile_country" : "profile_text_fallback",
      source: "country_district_fallback",
    };
  }

  if (profilePoint) {
    return {
      ...base,
      primaryPoint: profilePoint,
      country: null,
      district: null,
      reason: "profile_point_without_profile_text",
      source: "profile_location_geog",
    };
  }

  return {
    ...base,
    primaryPoint: null,
    country: null,
    district: null,
    source: "unresolved",
  };
};

const readCachedDeviceCoordinates = async (): Promise<NativeViewerScopePoint | null> => {
  for (const accuracy of ["high", "balanced"] as const) {
    try {
      const raw = await AsyncStorage.getItem(coordinatePersistentKey(accuracy));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { ts?: number; value?: NativeViewerScopePoint | null };
      if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > TWO_HOURS_MS) continue;
      const point = normalizePoint(parsed.value);
      if (point) return point;
    } catch {
      // Corrupt coordinate cache should not block exact-token DB scope resolution.
    }
  }
  return null;
};

const firstRpcRow = (data: unknown): NativeViewerScopeRpcRow | null => {
  if (Array.isArray(data)) return (data[0] ?? null) as NativeViewerScopeRpcRow | null;
  return (data ?? null) as NativeViewerScopeRpcRow | null;
};

const sourcePointForComponents = ({
  cachedDevicePoint,
  dbCachedDevicePoint,
  liveDevicePoint,
  ownPinPoint,
  recentUserPoint,
}: {
  cachedDevicePoint: NativeViewerScopePoint | null;
  dbCachedDevicePoint: NativeViewerScopePoint | null;
  liveDevicePoint: NativeViewerScopePoint | null;
  ownPinPoint: NativeViewerScopePoint | null;
  recentUserPoint: NativeViewerScopePoint | null;
}) => liveDevicePoint || cachedDevicePoint || dbCachedDevicePoint || recentUserPoint || ownPinPoint;

export async function resolveNativeViewerScope({
  userId,
  accessToken,
}: {
  userId: string | null;
  accessToken?: string | null;
}): Promise<NativeViewerScope> {
  const expectedUserId = String(userId || "").trim();
  const resolvedAt = new Date().toISOString();
  if (!expectedUserId) throw new Error("viewer_scope_missing_user_id");

  const permission = await getNativeForegroundLocationPermissionDetail().catch(() => ({ canAskAgain: true, state: "unknown" as const }));
  const locationGranted = permission.state === "granted";
  const liveDevicePoint = locationGranted ? await getNativeCurrentCoordinates({ force: true }).catch(() => null) : null;
  const cachedDevicePoint = !liveDevicePoint ? await readCachedDeviceCoordinates() : null;

  const { data, error } = await nativeExactTokenRpc<NativeViewerScopeRpcRow[]>(
    "get_native_viewer_scope",
    {},
    accessToken,
  );
  if (error) throw new Error(error.message || "viewer_scope_unavailable");

  const row = firstRpcRow(data);
  if (!row) throw new Error("viewer_scope_unavailable");
  if (String(row.user_id || "").trim() !== expectedUserId) throw new Error("viewer_scope_user_mismatch");

  const dbCachedDevicePoint = normalizePoint(row.cached_device_point);
  const ownPinPoint = normalizePoint(row.own_pin_point);
  const recentUserPoint = normalizePoint(row.recent_user_point);
  const profilePoint = normalizePoint(row.profile_point);
  const profileCountry = cleanText(row.country);
  const profileDistrict = cleanText(row.district);
  const selectedPoint = sourcePointForComponents({ liveDevicePoint, cachedDevicePoint, dbCachedDevicePoint, ownPinPoint, recentUserPoint });
  const sourceComponents = selectedPoint ? await reverseGeocodeNativeLocationComponents(selectedPoint.lat, selectedPoint.lng).catch(() => null) : null;
  const scope = buildConsistentScope({
    liveDevicePoint,
    cachedDevicePoint,
    dbCachedDevicePoint,
    ownPinPoint,
    recentUserPoint,
    profilePoint,
    profileCountry,
    profileDistrict,
    sourceComponents,
    resolvedAt,
  });

  if (__DEV__) {
    console.log("NATIVE_VIEWER_SCOPE_RESOLVED", {
      userId: expectedUserId,
      source: scope.source,
      lat: scope.primaryPoint?.lat ?? null,
      lng: scope.primaryPoint?.lng ?? null,
      country: scope.country,
      countryCode: scope.countryCode,
      countryName: scope.countryName,
      adminArea: scope.adminArea,
      city: scope.city,
      district: scope.district,
      sourceConsistent: scope.sourceConsistent,
      droppedFields: scope.droppedFields,
      reason: scope.reason,
    });
  }

  return scope;
}
