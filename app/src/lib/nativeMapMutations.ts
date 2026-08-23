import AsyncStorage from "@react-native-async-storage/async-storage";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";
import { readNativeMapTokenConfig } from "./nativeMapConfig";
import { nativeExactTokenRpc } from "./nativeExactTokenRequest";
import { getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import {
  NATIVE_MAP_DEFAULT_SHARE_HOURS,
  NATIVE_MAP_PRECISION_DEFAULT,
  clampCustomHours,
  type NativeMapPrecision,
} from "./nativeMapPrecision";

export const NATIVE_USER_PIN_ACTIVE_HOURS = 24;
export const NATIVE_USER_PIN_RETENTION_HOURS = 24;
export const NATIVE_OUT_NOW_VISIBLE_HOURS = 2;

const clean = (value: unknown) => String(value || "").trim();
const GEOCODE_CACHE_MS = 20 * 60 * 1000;
const reverseGeocodeCache = new Map<string, { value: string | null; ts: number }>();
const queryGeocodeCache = new Map<string, { value: { lat: number; lng: number } | null; ts: number }>();

const geocodePersistentKey = (kind: "reverse" | "query", key: string) => `native-map-geocode:${kind}:v1:${key}`;

const readGeocodePersistentCache = async <T,>(key: string): Promise<T | null | undefined> => {
  try {
    const raw = await readNativeDisplayCacheItem(key);
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

export class NativeMapMutationError extends Error {
  readonly code: string | null;
  readonly operation: string;
  readonly status: number;

  constructor(operation: string, error: { code?: string | null; message: string; status: number }) {
    super(error.message || "map_mutation_failed");
    this.name = "NativeMapMutationError";
    this.code = error.code ?? null;
    this.operation = operation;
    this.status = error.status;
  }
}

const requireMapMutationToken = async (accessToken?: string | null, expectedUserId?: string | null) => {
  const token = await getFreshNativeAccessToken(accessToken, expectedUserId);
  if (!token) throw new Error("missing_access_token");
  return token;
};

const mapMutationRpc = async <T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  accessToken?: string | null,
  expectedUserId?: string | null,
): Promise<T | null> => {
  const token = await requireMapMutationToken(accessToken, expectedUserId);
  const { data, error } = await nativeExactTokenRpc<T>(fn, params, token, { expectedUserId });
  if (error) throw new NativeMapMutationError(fn, error);
  return data;
};

const isUncertainMapTransportError = (error: unknown) => error instanceof NativeMapMutationError
  && error.status === 0
  && (error.code === "rpc_timeout" || error.code === "rpc_network_error");

const reconcileRecentOutNowStart = async (
  attemptedAtMs: number,
  userId: string,
  accessToken?: string | null,
): Promise<NativeOutNowSessionClock | null> => {
  try {
    const clock = await getNativeOutNowSessionClock({ accessToken, expectedUserId: userId });
    const startedAtMs = Date.parse(clock.startedAt);
    return Number.isFinite(startedAtMs) && startedAtMs >= attemptedAtMs - 15_000 ? clock : null;
  } catch {
    return null;
  }
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
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
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

export async function lookupNativeMapQueryCenter(
  query: string,
  countryName?: string | null,
  proximity?: { lat: number; lng: number } | null,
): Promise<{ lat: number; lng: number } | null> {
  const cleanQuery = clean(query);
  if (!cleanQuery) return null;
  const proximityKey = proximity ? `${proximity.lat.toFixed(2)},${proximity.lng.toFixed(2)}` : "";
  const cacheKey = `${cleanQuery.toLowerCase().replace(/\s+/g, " ")}|${clean(countryName).toLowerCase()}|${proximityKey}`;
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
    const proximityQuery = proximity && Number.isFinite(proximity.lat) && Number.isFinite(proximity.lng)
      ? `&proximity=${encodeURIComponent(`${proximity.lng},${proximity.lat}`)}`
      : "";
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(scopedQuery)}.json?access_token=${encodeURIComponent(tokenConfig.token)}&types=poi,address,place,locality,neighborhood&limit=1&language=en${proximityQuery}`;
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

export async function pinNativeUserLocation(
  userId: string,
  lat: number,
  lng: number,
  address: string | null,
  options: {
    accessToken?: string | null;
    precision?: NativeMapPrecision;
    hours?: number;
  } = {},
) {
  void address;
  const precision: NativeMapPrecision = options.precision === "hidden" ? "hidden" : NATIVE_MAP_PRECISION_DEFAULT;
  const hours = clampCustomHours(options.hours ?? NATIVE_MAP_DEFAULT_SHARE_HOURS);
  await mapMutationRpc("set_user_location", {
    p_lat: lat,
    p_lng: lng,
    p_pin_hours: NATIVE_USER_PIN_ACTIVE_HOURS,
    p_retention_hours: NATIVE_USER_PIN_RETENTION_HOURS,
    p_precision: precision,
    p_visible_hours: hours,
  }, options.accessToken, userId);
}

// Private, coarse, server-retained location for nearby relevance and alert
// delivery. The RPC itself coalesces stationary writes, so this remains safe to
// call from the single distance-driven foreground watcher.
export async function syncNativePrivateUserLocation(
  userId: string,
  coords: { lat: number; lng: number },
  options: { accessToken?: string | null } = {},
) {
  await mapMutationRpc("set_private_user_location", {
    p_lat: coords.lat,
    p_lng: coords.lng,
  }, options.accessToken, userId);
}

export async function pinNativeUserOutNow(
  userId: string,
  lat: number,
  lng: number,
  address: string | null,
  options: {
    accessToken?: string | null;
    precision?: NativeMapPrecision;
  } = {},
): Promise<NativeOutNowSessionClock> {
  void address;
  const attemptedAtMs = Date.now();
  let result: NativeOutNowSessionClock | null;
  try {
    result = await mapMutationRpc<NativeOutNowSessionClock>("start_native_out_now", {
      p_lat: lat,
      p_lng: lng,
      p_precision: options.precision === "hidden" ? "hidden" : NATIVE_MAP_PRECISION_DEFAULT,
    }, options.accessToken, userId);
  } catch (error) {
    if (!isUncertainMapTransportError(error)) throw error;
    const reconciled = await reconcileRecentOutNowStart(attemptedAtMs, userId, options.accessToken);
    if (!reconciled) throw error;
    result = reconciled;
  }
  if (!result || !Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.expiresAt))) {
    throw new Error("out_now_start_failed");
  }
  return result;
}

export async function startNativeUserOutNowFromSavedLocation(
  options: { accessToken?: string | null; expectedUserId: string; precision?: NativeMapPrecision },
): Promise<NativeOutNowSessionClock> {
  const attemptedAtMs = Date.now();
  let result: NativeOutNowSessionClock | null;
  try {
    result = await mapMutationRpc<NativeOutNowSessionClock>("start_native_out_now", {
      p_precision: options.precision === "hidden" ? "hidden" : NATIVE_MAP_PRECISION_DEFAULT,
    }, options.accessToken, options.expectedUserId);
  } catch (error) {
    if (!isUncertainMapTransportError(error)) throw error;
    const reconciled = await reconcileRecentOutNowStart(attemptedAtMs, options.expectedUserId, options.accessToken);
    if (!reconciled) throw error;
    result = reconciled;
  }
  if (!result || !Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.expiresAt))) {
    throw new Error("out_now_saved_location_missing");
  }
  return result;
}

export async function renewNativeUserOutNow(options: { accessToken?: string | null } = {}): Promise<string> {
  const visibleUntil = await mapMutationRpc<string>("renew_native_out_now_visibility", {}, options.accessToken);
  const value = String(visibleUntil || "").trim();
  if (!value) throw new Error("out_now_renewal_failed");
  return value;
}

export type NativeOutNowSessionClock = {
  startedAt: string;
  expiresAt: string;
};

export async function getNativeOutNowSessionClock(
  options: { accessToken?: string | null; expectedUserId?: string | null } = {},
): Promise<NativeOutNowSessionClock> {
  const result = await mapMutationRpc<NativeOutNowSessionClock>("get_native_out_now_session_clock", {}, options.accessToken, options.expectedUserId);
  if (!result || !Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.expiresAt))) {
    throw new Error("out_now_session_clock_missing");
  }
  return result;
}

export async function renewNativeUserOutNowWithClock(
  options: { accessToken?: string | null; expectedUserId?: string | null } = {},
): Promise<NativeOutNowSessionClock> {
  const result = await mapMutationRpc<NativeOutNowSessionClock>("renew_native_out_now_visibility_with_clock", {}, options.accessToken, options.expectedUserId);
  if (!result || !Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.expiresAt))) {
    throw new Error("out_now_renewal_failed");
  }
  return result;
}

export async function stopNativeMapSharing(options: { accessToken?: string | null } = {}) {
  await mapMutationRpc("end_map_visibility", {}, options.accessToken);
}

export type NativeOutNowReturnResult = {
  startedAt: string;
  returnedAt: string;
  elapsedSeconds: number;
  finalMessage: string;
};

export async function returnNativeUserOutNow(
  options: { accessToken?: string | null; expectedUserId?: string | null } = {},
): Promise<NativeOutNowReturnResult> {
  const result = await mapMutationRpc<NativeOutNowReturnResult>("return_native_out_now", {}, options.accessToken, options.expectedUserId);
  if (!result || !String(result.finalMessage || "").trim()) throw new Error("out_now_return_summary_missing");
  return result;
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
