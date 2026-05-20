import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeMapTokenConfig } from "./nativeMapConfig";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";

export const NATIVE_USER_PIN_ACTIVE_HOURS = 24;
export const NATIVE_USER_PIN_RETENTION_HOURS = 24 * 7;

const clean = (value: unknown) => String(value || "").trim();
const GEOCODE_CACHE_MS = 20 * 60 * 1000;
const reverseGeocodeCache = new Map<string, { value: string | null; ts: number }>();
const queryGeocodeCache = new Map<string, { value: { lat: number; lng: number } | null; ts: number }>();

const geocodePersistentKey = (kind: "reverse" | "query", key: string) => `native-map-geocode:${kind}:v1:${key}`;

const readGeocodePersistentCache = async <T,>(key: string): Promise<T | null | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { ts?: number; value?: T | null };
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > GEOCODE_CACHE_MS) {
      await AsyncStorage.removeItem(key);
      return undefined;
    }
    return parsed.value ?? null;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return undefined;
  }
};

const writeGeocodePersistentCache = async <T,>(key: string, value: T | null) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const requireMapMutationToken = (accessToken?: string | null) => {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("missing_access_token");
  return token;
};

const mapMutationRpc = async (fn: string, params: Record<string, unknown>, accessToken?: string | null) => {
  const token = requireMapMutationToken(accessToken);
  const { error } = await nativeExactTokenRpc(fn, params, token);
  if (error) throw new Error(error.message || "map_mutation_failed");
};

const featureTypes = (feature: Record<string, unknown>) =>
  Array.isArray(feature.place_type) ? feature.place_type.map((item) => String(item)) : [];

const contextText = (feature: Record<string, unknown>, prefix: string) => {
  const context = Array.isArray(feature.context) ? feature.context : [];
  const match = context.find((item) => {
    const id = clean((item as Record<string, unknown>)?.id);
    return id.startsWith(prefix);
  }) as Record<string, unknown> | undefined;
  return clean(match?.text);
};

const preciseReverseLabel = (payload: Record<string, unknown>) => {
  const features = Array.isArray(payload.features) ? payload.features as Record<string, unknown>[] : [];
  const precise = features.find((feature) => {
    const types = featureTypes(feature);
    return types.includes("address") || types.includes("poi") || types.includes("neighborhood");
  }) || features[0];
  if (!precise) return null;

  const types = featureTypes(precise);
  const text = clean(precise.text);
  const address = clean(precise.address);
  const neighborhood = types.includes("neighborhood") ? text : contextText(precise, "neighborhood");
  const place = types.includes("place") ? text : contextText(precise, "place");
  const district = neighborhood || (types.includes("address") || types.includes("poi") ? text : "") || place;
  const streetLabel = address && text ? `${address} ${text}` : text;
  const primary = types.includes("address") || types.includes("poi") ? streetLabel : district;
  const parts = [primary, district && district !== primary ? district : null, place && place !== district && place !== primary ? place : null]
    .map((part) => clean(part))
    .filter(Boolean);
  return parts.length > 0 ? Array.from(new Set(parts)).join(", ") : clean(precise.place_name) || null;
};

export async function lookupNativeMapAddress(lat: number, lng: number): Promise<string | null> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < GEOCODE_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_MAP_REVERSE_GEOCODE_CACHE_HIT", { cacheKey });
    return cached.value;
  }
  const persistentKey = geocodePersistentKey("reverse", cacheKey);
  const persistent = await readGeocodePersistentCache<string>(persistentKey);
  if (persistent !== undefined) {
    reverseGeocodeCache.set(cacheKey, { value: persistent, ts: Date.now() });
    if (__DEV__) console.log("NATIVE_MAP_REVERSE_GEOCODE_ASYNC_CACHE_HIT", { cacheKey });
    return persistent;
  }
  if (__DEV__) console.log("NATIVE_MAP_REVERSE_GEOCODE_CACHE_MISS", { cacheKey });
  const tokenConfig = readNativeMapTokenConfig();
  if (!tokenConfig.ok) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(tokenConfig.token)}&types=address,poi,neighborhood,locality,place&language=en`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const value = preciseReverseLabel(payload as Record<string, unknown>);
    reverseGeocodeCache.set(cacheKey, { value, ts: Date.now() });
    void writeGeocodePersistentCache(persistentKey, value);
    return value;
  } catch {
    return null;
  }
}

export async function lookupNativeMapQueryCenter(query: string, countryName?: string | null): Promise<{ lat: number; lng: number } | null> {
  const cleanQuery = clean(query);
  if (!cleanQuery) return null;
  const cacheKey = `${cleanQuery.toLowerCase().replace(/\s+/g, " ")}|${clean(countryName).toLowerCase()}`;
  const cached = queryGeocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < GEOCODE_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_MAP_QUERY_GEOCODE_CACHE_HIT", { cacheKey });
    return cached.value;
  }
  const persistentKey = geocodePersistentKey("query", cacheKey);
  const persistent = await readGeocodePersistentCache<{ lat: number; lng: number }>(persistentKey);
  if (persistent !== undefined) {
    queryGeocodeCache.set(cacheKey, { value: persistent, ts: Date.now() });
    if (__DEV__) console.log("NATIVE_MAP_QUERY_GEOCODE_ASYNC_CACHE_HIT", { cacheKey });
    return persistent;
  }
  if (__DEV__) console.log("NATIVE_MAP_QUERY_GEOCODE_CACHE_MISS", { cacheKey });
  const tokenConfig = readNativeMapTokenConfig();
  if (!tokenConfig.ok) return null;
  try {
    const scopedQuery = countryName ? `${cleanQuery}, ${clean(countryName)}` : cleanQuery;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(scopedQuery)}.json?access_token=${encodeURIComponent(tokenConfig.token)}&types=address,place,locality,neighborhood&limit=1&language=en`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const center = payload?.features?.[0]?.center;
    if (!Array.isArray(center) || typeof center[0] !== "number" || typeof center[1] !== "number") return null;
    const value = { lng: center[0], lat: center[1] };
    queryGeocodeCache.set(cacheKey, { value, ts: Date.now() });
    void writeGeocodePersistentCache(persistentKey, value);
    return value;
  } catch {
    return null;
  }
}

export async function pinNativeUserLocation(userId: string, lat: number, lng: number, address: string | null, options: { accessToken?: string | null } = {}) {
  void address;
  await mapMutationRpc("set_user_location", {
    p_lat: lat,
    p_lng: lng,
    p_pin_hours: NATIVE_USER_PIN_ACTIVE_HOURS,
    p_retention_hours: NATIVE_USER_PIN_RETENTION_HOURS,
  }, options.accessToken);
  await mapMutationRpc("native_map_set_invisible", {
    p_invisible: false,
  }, options.accessToken).catch((error) => {
    console.warn("[map.pin.visibility_update.failed]", error instanceof Error ? error.message : String(error));
  });
}

export async function clearNativeUserLocationPin(userId: string, options: { accessToken?: string | null } = {}) {
  void userId;
  await mapMutationRpc("clear_user_location_pin", {}, options.accessToken);
}

export async function setNativeMapInvisible(userId: string, invisible: boolean, options: { accessToken?: string | null } = {}) {
  void userId;
  await mapMutationRpc("native_map_set_invisible", {
    p_invisible: invisible,
  }, options.accessToken);
}
