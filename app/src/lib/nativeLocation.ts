import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { readNativeMapTokenConfig } from "./nativeMapConfig";
import { publishNativePermissionDetail, readNativePermissionDetail, subscribeNativePermissionDetail } from "./nativePermissionState";
import { extractNativeCityFromMapboxContext } from "./nativeLocationCityParsing";
import { fetchWithNativeTimeout, withNativeTimeout } from "./nativeTimeout";
import { readNativeDisplayCacheItem } from "./nativeDisplayCacheStorage";

export type NativeResolvedLocation = {
  adminArea: string | null;
  country: string;
  countryCode: string | null;
  countryName: string | null;
  district: string;
  label: string;
  lat: number;
  lng: number;
  city: string | null;
};

export type NativeLocationSuggestion = {
  city: string | null;
  country: string;
  district: string;
  label: string;
  lat: number;
  lng: number;
};

export type NativeLocationSearchOptions = {
  biasPoint?: { lat: number; lng: number } | null;
  countryName?: string | null;
};

export type NativePrioritizedLocationSearchOptions = {
  biasPoint?: { lat: number; lng: number } | null;
  selectedCountry?: string | null;
};

export type NativeLocationPermissionState = "unknown" | "granted" | "denied";
export type NativeLocationPermissionDetail = {
  canAskAgain: boolean;
  state: NativeLocationPermissionState;
};

export type NativeLocationActionResult =
  | { coords: { lat: number; lng: number }; source: "recent" | "retained"; status: "ready" }
  | { reason: "permission" | "services"; status: "settings_required" }
  | { status: "unavailable" };

let nativeLocationPermissionRequest: Promise<NativeLocationPermissionDetail> | null = null;
let nativeLocationPermissionEpoch = 0;

const publishNativeLocationPermissionDetail = (detail: NativeLocationPermissionDetail) => {
  publishNativePermissionDetail("location", detail);
  return detail;
};

export function subscribeNativeLocationPermissionDetail(listener: (detail: NativeLocationPermissionDetail) => void) {
  return subscribeNativePermissionDetail("location", listener);
}

export async function openNativeLocationSettings() {
  if (Platform.OS === "android" && typeof Linking.sendIntent === "function") {
    try {
      await Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS");
      return;
    } catch {
      // Fall through to app settings when the device does not expose the location panel intent.
    }
  }
  await Linking.openSettings();
}

export async function openNativeAppSettings() {
  await Linking.openSettings();
}

export async function areNativeLocationServicesEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}

const clean = (value: unknown) => String(value || "").trim();
const normalizedKey = (value: unknown) => clean(value).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
const COORDINATE_CACHE_MS = 45_000;
const LOCATION_SEARCH_CACHE_MS = 10 * 60 * 1000;
type NativeCoordinateAccuracy = "balanced" | "high";
const currentCoordinateCache: Record<NativeCoordinateAccuracy, { value: { lat: number; lng: number } | null; ts: number } | null> = {
  balanced: null,
  high: null,
};
const currentCoordinatePositionRequest: Record<NativeCoordinateAccuracy, Promise<Location.LocationObject> | null> = {
  balanced: null,
  high: null,
};
const locationSuggestionCache = new Map<string, { value: NativeLocationSuggestion[]; ts: number }>();
const locationCountryByPointCache = new Map<string, string | null>();
const coordinateLegacyCleanupDone = new Set<NativeCoordinateAccuracy>();

const coordinatePersistentKey = (accuracy: NativeCoordinateAccuracy) => `native-location-coordinate:v1:${accuracy}`;
const locationSearchPersistentKey = (key: string) => `native-location-search:v4:${key}`;

const clearLegacyCoordinateCacheOnce = async (accuracy: NativeCoordinateAccuracy) => {
  if (coordinateLegacyCleanupDone.has(accuracy)) return;
  coordinateLegacyCleanupDone.add(accuracy);
  await AsyncStorage.removeItem(coordinatePersistentKey(accuracy)).catch(() => undefined);
};

const readCoordinatePersistentCache = async (accuracy: NativeCoordinateAccuracy): Promise<{ lat: number; lng: number } | null | undefined> => {
  // Release builds keep exact device coordinates in memory only. Remove the
  // legacy cache if an earlier build left one behind.
  await clearLegacyCoordinateCacheOnce(accuracy);
  return undefined;
};

const writeCoordinatePersistentCache = async (accuracy: NativeCoordinateAccuracy, value: { lat: number; lng: number } | null) => {
  void value;
  await clearLegacyCoordinateCacheOnce(accuracy);
};

const readLocationSearchPersistentCache = async (key: string): Promise<NativeLocationSuggestion[] | null | undefined> => {
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { ts?: number; value?: NativeLocationSuggestion[] | null };
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > LOCATION_SEARCH_CACHE_MS || !Array.isArray(parsed.value)) {
      await AsyncStorage.removeItem(key);
      return undefined;
    }
    return parsed.value;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return undefined;
  }
};

const writeLocationSearchPersistentCache = async (key: string, value: NativeLocationSuggestion[]) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

export const extractNativeDistrictFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[0] || "";
};

export const extractNativeCountryFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || "";
};

export type NativeLocationComponents = {
  adminArea: string | null;
  city: string | null;
  countryCode: string | null;
  countryName: string | null;
  district: string | null;
};

const COUNTRY_ALIASES: Record<string, { code: string; name: string }> = {
  china: { code: "CN", name: "China" },
  cn: { code: "CN", name: "China" },
  gb: { code: "GB", name: "United Kingdom" },
  "hong kong": { code: "HK", name: "Hong Kong" },
  "hong kong sar": { code: "HK", name: "Hong Kong" },
  "hong kong sar china": { code: "HK", name: "Hong Kong" },
  hk: { code: "HK", name: "Hong Kong" },
  singapore: { code: "SG", name: "Singapore" },
  sg: { code: "SG", name: "Singapore" },
  "united state": { code: "US", name: "United States" },
  "united states": { code: "US", name: "United States" },
  "united states of america": { code: "US", name: "United States" },
  "united kingdom": { code: "GB", name: "United Kingdom" },
  uk: { code: "GB", name: "United Kingdom" },
  us: { code: "US", name: "United States" },
  usa: { code: "US", name: "United States" },
};

const CITY_ALIASES: Record<string, { city: string; countryCode?: string; countryName?: string }> = {
  sf: { city: "San Francisco", countryCode: "US", countryName: "United States" },
  "san fran": { city: "San Francisco", countryCode: "US", countryName: "United States" },
  "san francisco": { city: "San Francisco", countryCode: "US", countryName: "United States" },
};

export function normalizeNativeCountryLabel(value?: string | null) {
  const alias = COUNTRY_ALIASES[normalizedKey(value)];
  return alias ? { ...alias } : null;
}

export function normalizeNativeLocationTextFields(fields: {
  adminArea?: string | null;
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
  district?: string | null;
}): NativeLocationComponents {
  // ISO country codes are the authoritative signal from device geocoders. In
  // particular, Hong Kong can be returned as country "China" with code "HK".
  const explicitCountry = normalizeNativeCountryLabel(fields.countryCode) || normalizeNativeCountryLabel(fields.country);
  const countryAsCity = CITY_ALIASES[normalizedKey(fields.country)];
  const cityAlias = CITY_ALIASES[normalizedKey(fields.city)] || CITY_ALIASES[normalizedKey(fields.district)] || countryAsCity;
  const countryCode = explicitCountry?.code || cityAlias?.countryCode || clean(fields.countryCode).toUpperCase() || null;
  const countryName = explicitCountry?.name || cityAlias?.countryName || clean(fields.country) || null;
  // Apple exposes CLPlacemark.locality through Expo's `city` field. In Hong
  // Kong that value is commonly a neighbourhood (for example "Central"), not
  // the canonical city. The ISO code is authoritative, so never persist or
  // target against an HK locality as though it were a city.
  const city = countryCode === "HK"
    ? "Hong Kong"
    : cityAlias?.city || clean(fields.city) || (countryAsCity ? countryAsCity.city : null);
  const rawDistrict = clean(fields.district) || null;
  const district = countryCode === "HK" && normalizedKey(rawDistrict) === "central and western district"
    ? "Central and Western District"
    : rawDistrict;
  return {
    adminArea: clean(fields.adminArea) || null,
    city,
    countryCode,
    countryName,
    district,
  };
}

const pickDistrict = (address: Location.LocationGeocodedAddress) =>
  clean(address.district) ||
  clean(address.subregion) ||
  clean(address.city);

// Apple's CLGeocoder / Android's Geocoder are network calls with no timeout of
// their own. Bounded here so a stalled geocode degrades to "no components"
// (callers all treat null as optional enrichment) instead of hanging whatever
// awaits it — resolveNativeViewerScope awaits this mid-flight, and a hang there
// left the Chats spinner up forever.
const REVERSE_GEOCODE_TIMEOUT_MS = 3500;
// Third-party geocoder autocomplete. Typing-driven, so a stall must surface as
// "no suggestions" quickly rather than a spinner that never resolves.
const AREA_SEARCH_TIMEOUT_MS = 4000;

export async function reverseGeocodeNativeLocationComponents(lat: number, lng: number): Promise<NativeLocationComponents | null> {
  const addresses = await withNativeTimeout(
    Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
    REVERSE_GEOCODE_TIMEOUT_MS,
    [] as Location.LocationGeocodedAddress[],
  );
  const [address] = addresses;
  if (!address) return null;
  return normalizeNativeLocationTextFields({
    adminArea: clean(address.region),
    city: clean(address.city),
    country: clean(address.country),
    countryCode: clean(address.isoCountryCode),
    district: pickDistrict(address),
  });
}

export async function resolveCurrentNativeLocation(): Promise<NativeResolvedLocation> {
  const permission = await requestNativeForegroundLocationPermissionDetail();
  if (permission.state !== "granted") {
    throw new Error("Location permission is required to use your current area.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const components = await reverseGeocodeNativeLocationComponents(lat, lng);
  const country = components?.countryName || components?.countryCode || "";
  const district = components?.district || components?.city || "";
  return {
    adminArea: components?.adminArea ?? null,
    country,
    countryCode: components?.countryCode ?? null,
    countryName: components?.countryName ?? (country || null),
    district,
    city: components?.city ?? null,
    label: `${district}${country ? `, ${country}` : ""}`.trim(),
    lat,
    lng,
  };
}

export async function getNativeForegroundLocationPermissionState(): Promise<NativeLocationPermissionState> {
  return (await getNativeForegroundLocationPermissionDetail()).state;
}

const mapNativeLocationPermission = (permission: Location.LocationPermissionResponse): NativeLocationPermissionDetail => {
  if (permission.status === Location.PermissionStatus.GRANTED) return { canAskAgain: permission.canAskAgain, state: "granted" };
  if (permission.status === Location.PermissionStatus.DENIED) return { canAskAgain: permission.canAskAgain, state: "denied" };
  return { canAskAgain: permission.canAskAgain, state: "unknown" };
};

export async function getNativeForegroundLocationPermissionDetail(): Promise<NativeLocationPermissionDetail> {
  // A permission request is authoritative. A stale status read that began before
  // the native prompt must not republish its old value after the user answers it.
  if (nativeLocationPermissionRequest) return nativeLocationPermissionRequest;
  const epoch = nativeLocationPermissionEpoch;
  const detail = mapNativeLocationPermission(await Location.getForegroundPermissionsAsync());
  if (epoch !== nativeLocationPermissionEpoch) {
    return nativeLocationPermissionRequest ?? readNativePermissionDetail("location");
  }
  return publishNativeLocationPermissionDetail(detail);
}

export async function requestNativeForegroundLocationPermission(): Promise<NativeLocationPermissionState> {
  return (await requestNativeForegroundLocationPermissionDetail()).state;
}

export async function requestNativeForegroundLocationPermissionDetail(): Promise<NativeLocationPermissionDetail> {
  if (nativeLocationPermissionRequest) return nativeLocationPermissionRequest;
  nativeLocationPermissionEpoch += 1;
  const request = Location.requestForegroundPermissionsAsync()
    .then((permission) => publishNativeLocationPermissionDetail(mapNativeLocationPermission(permission)));
  nativeLocationPermissionRequest = request;
  try {
    return await request;
  } finally {
    if (nativeLocationPermissionRequest === request) nativeLocationPermissionRequest = null;
  }
}

const validNativeCoordinates = (value: { lat: number; lng: number } | null | undefined) => (
  Boolean(value) && Number.isFinite(value?.lat) && Number.isFinite(value?.lng)
    && value!.lat >= -90 && value!.lat <= 90 && value!.lng >= -180 && value!.lng <= 180
);

const readRecentNativeCoordinates = async (): Promise<{ lat: number; lng: number } | null> => {
  const cached = currentCoordinateCache.balanced;
  if (cached && Date.now() - cached.ts < COORDINATE_CACHE_MS && validNativeCoordinates(cached.value)) {
    return cached.value;
  }
  const persistent = await readCoordinatePersistentCache("balanced");
  if (persistent && validNativeCoordinates(persistent)) {
    currentCoordinateCache.balanced = { value: persistent, ts: Date.now() };
    return persistent;
  }
  // This is a synchronous OS cache read, not a new GPS request. It makes a
  // second explicit pin feel immediate after the first successful location.
  // The map only ever displays an approximate ~500m privacy cell, never a
  // precise point, so a fresh or tightly-accurate fix buys nothing here --
  // any on-device fix, however old, resolves to the same or an adjacent cell
  // for the overwhelming majority of taps. Accept whatever the OS has cached.
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 24 * 60 * 60_000,
  }).catch(() => null);
  const value = lastKnown
    ? { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude }
    : null;
  if (!value || !validNativeCoordinates(value)) return null;
  cacheNativeLocationCoordinates(value);
  return value;
};

// The single user-initiated location gate for Home and Map. It invokes the
// platform prompt when iOS/Android can present one; after a permanent denial,
// callers receive a Settings outcome instead of attempting a second custom
// permission flow.
//
// This never waits on a live GPS fix. Out Now and Pin are approximate-area
// features by design (server-side coarsening to a ~500m cell), so an exact,
// freshly-acquired coordinate has no value here -- it only adds latency and,
// on a cold GPS radio, a real chance of outright failure. A caller that gets
// "unavailable" has a cached, retained, and last-known coordinate that all
// came back empty; that caller owns deciding whether to fall back further
// (e.g. Home's out-now flow starts from the user's last saved server pin).
export async function requestNativeLocationForPin(options: {
  retainedCoordinates?: { lat: number; lng: number } | null;
} = {}): Promise<NativeLocationActionResult> {
  const permission = await requestNativeForegroundLocationPermissionDetail();
  if (permission.state !== "granted") return { reason: "permission", status: "settings_required" };
  if (!(await areNativeLocationServicesEnabled())) return { reason: "services", status: "settings_required" };
  const recent = await readRecentNativeCoordinates();
  if (recent) return { coords: recent, source: "recent", status: "ready" };
  if (validNativeCoordinates(options.retainedCoordinates)) {
    return { coords: options.retainedCoordinates!, source: "retained", status: "ready" };
  }
  return { status: "unavailable" };
}

// Distance-based foreground watcher. The OS only invokes `onChange` once the device has
// actually moved `distanceInterval` metres, so there is zero work while stationary (no
// polling, no re-renders). Returns a synchronous cleanup that removes the subscription —
// safe to call before the async subscription has even resolved.
export function watchNativeLocation(
  onChange: (coords: { lat: number; lng: number }) => void,
  options: { distanceInterval?: number; accuracy?: NativeCoordinateAccuracy } = {},
): () => void {
  let subscription: Location.LocationSubscription | null = null;
  let cancelled = false;
  void (async () => {
    try {
      const permission = await getNativeForegroundLocationPermissionDetail();
      if (cancelled || permission.state !== "granted") return;
      const next = await Location.watchPositionAsync(
        {
          accuracy: options.accuracy === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced,
          distanceInterval: options.distanceInterval ?? 250,
        },
        (position) => onChange({ lat: position.coords.latitude, lng: position.coords.longitude }),
      );
      if (cancelled) {
        next.remove();
        return;
      }
      subscription = next;
    } catch {
      // Non-critical: foreground GPS refresh is best-effort and must never crash the map.
    }
  })();
  return () => {
    cancelled = true;
    subscription?.remove();
    subscription = null;
  };
}

// Keeps the device's latest foreground GPS fix available for private map centering and
// nearby-content scope. This deliberately has no network side effect.
export function cacheNativeLocationCoordinates(
  coords: { lat: number; lng: number },
  accuracy: NativeCoordinateAccuracy = "balanced",
) {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
  const value = { lat: coords.lat, lng: coords.lng };
  const ts = Date.now();
  currentCoordinateCache[accuracy] = { value, ts };
  if (accuracy === "high") currentCoordinateCache.balanced = { value, ts };
  void writeCoordinatePersistentCache(accuracy, value);
  if (accuracy === "high") void writeCoordinatePersistentCache("balanced", value);
}

export async function getNativeCurrentCoordinates(options: {
  accuracy?: NativeCoordinateAccuracy;
  force?: boolean;
  timeoutMs?: number | null;
} = {}): Promise<{ lat: number; lng: number } | null> {
  const accuracy = options.accuracy === "high" ? "high" : "balanced";
  const cached = currentCoordinateCache[accuracy];
  if (!options.force && cached && Date.now() - cached.ts < COORDINATE_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_LOCATION_COORD_CACHE_HIT", { accuracy, ttlMs: COORDINATE_CACHE_MS });
    return cached.value;
  }
  if (!options.force) {
    const persistent = await readCoordinatePersistentCache(accuracy);
    if (persistent !== undefined) {
      currentCoordinateCache[accuracy] = { value: persistent, ts: Date.now() };
      if (__DEV__) console.log("NATIVE_LOCATION_COORD_ASYNC_CACHE_HIT", { accuracy, ttlMs: COORDINATE_CACHE_MS });
      return persistent;
    }
  }
  if (__DEV__) console.log("NATIVE_LOCATION_COORD_CACHE_MISS", { accuracy, force: options.force === true });
  const permission = await getNativeForegroundLocationPermissionDetail();
  if (permission.state !== "granted") {
    currentCoordinateCache[accuracy] = { value: null, ts: Date.now() };
    void writeCoordinatePersistentCache(accuracy, null);
    return null;
  }
  const timeoutMs = options.timeoutMs === null
    ? null
    : Number.isFinite(options.timeoutMs)
    ? Math.min(15_000, Math.max(500, Number(options.timeoutMs)))
    : 3500;
  // Location.getCurrentPositionAsync is not cancellable. Share its native
  // request across retries so a timed-out first tap cannot pile up duplicate
  // GPS work while iOS is still acquiring the initial fix.
  let positionRequest = currentCoordinatePositionRequest[accuracy];
  if (!positionRequest) {
    positionRequest = Location.getCurrentPositionAsync({
      accuracy: accuracy === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
    currentCoordinatePositionRequest[accuracy] = positionRequest;
    void positionRequest.then(
      () => {
        if (currentCoordinatePositionRequest[accuracy] === positionRequest) currentCoordinatePositionRequest[accuracy] = null;
      },
      () => {
        if (currentCoordinatePositionRequest[accuracy] === positionRequest) currentCoordinatePositionRequest[accuracy] = null;
      },
    );
  }
  const position = timeoutMs === null
    ? await positionRequest
    : await Promise.race([
      positionRequest,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  if (!position) {
    const persistent = await readCoordinatePersistentCache(accuracy);
    if (persistent !== undefined) {
      currentCoordinateCache[accuracy] = { value: persistent, ts: Date.now() };
      return persistent;
    }
    currentCoordinateCache[accuracy] = { value: null, ts: Date.now() };
    return null;
  }
  const value = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
  cacheNativeLocationCoordinates(value, accuracy);
  return value;
}

const resolveCountryCode = (countryName?: string | null) => {
  const target = clean(countryName).toLowerCase();
  if (!target) return "";
  const aliases: Record<string, string> = {
    "hong kong": "hk",
    "hong kong sar": "hk",
    "hong kong sar china": "hk",
    "hong kong s.a.r.": "hk",
    "hong kong s.a.r. china": "hk",
    hk: "hk",
    singapore: "sg",
    sg: "sg",
    "united states": "us",
    usa: "us",
    us: "us",
    "united kingdom": "gb",
    uk: "gb",
  };
  if (aliases[target]) return aliases[target];
  const displayNamesFactory = typeof Intl !== "undefined" && "DisplayNames" in Intl ? Intl.DisplayNames : null;
  if (!displayNamesFactory) return "";
  const countryDisplayNames = new displayNamesFactory(["en"], { type: "region" });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`;
      const label = clean(countryDisplayNames.of(code));
      if (label && label.toLowerCase() === target) return code.toLowerCase();
    }
  }
  return "";
};

const normalizeCountryName = (value?: string | null) => clean(value).toLowerCase().replace(/\s+sar\s+china$/, "");

const isHongKongCountryContext = (value?: string | null) => {
  const normalized = normalizeCountryName(value);
  return normalized === "hong kong" || normalized === "hong kong sar" || normalized === "hk";
};

const suggestionMatchesRequestedCountry = (suggestion: NativeLocationSuggestion, requestedCountry?: string | null) => {
  const requested = normalizeCountryName(requestedCountry);
  if (!requested) return true;
  const country = normalizeCountryName(suggestion.country);
  const label = normalizeCountryName(suggestion.label);
  if (country === requested || label.endsWith(`, ${requested}`) || label.includes(`, ${requested},`)) return true;
  if (isHongKongCountryContext(requestedCountry)) {
    return country === "hong kong" || (country === "china" && label.includes("hong kong"));
  }
  return false;
};

const parseExplicitCountryFromLocationQuery = (query: string) => {
  const parts = query.split(",").map((part) => clean(part)).filter(Boolean);
  if (parts.length < 2) return { countryName: null as string | null, query: clean(query) };
  const possibleCountry = parts.at(-1) || "";
  const normalized = normalizeNativeCountryLabel(possibleCountry);
  if (!normalized) return { countryName: null as string | null, query: clean(query) };
  return {
    countryName: normalized.name,
    query: parts.slice(0, -1).join(", ").trim() || clean(query),
  };
};

const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const scoreLocationSuggestion = (
  suggestion: NativeLocationSuggestion,
  query: string,
  requestedCountry?: string | null,
  biasPoint?: { lat: number; lng: number } | null,
) => {
  const normalizedQuery = query.toLowerCase();
  const normalizedDistrict = suggestion.district.trim().toLowerCase();
  const normalizedLabel = suggestion.label.trim().toLowerCase();
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  let score = 0;
  if (normalizedDistrict === normalizedQuery) score += 1200;
  else if (normalizedDistrict.startsWith(normalizedQuery)) score += 700;
  else if (normalizedDistrict.includes(normalizedQuery)) score += 350;
  if (normalizedLabel.includes(normalizedQuery)) score += 200;
  if (words.length > 0 && words.every((word) => normalizedLabel.includes(word))) score += 120;
  if (suggestionMatchesRequestedCountry(suggestion, requestedCountry)) score += 150;
  if (biasPoint && Number.isFinite(suggestion.lat) && Number.isFinite(suggestion.lng) && suggestion.lat !== 0 && suggestion.lng !== 0) {
    const distance = distanceMeters(biasPoint, { lat: suggestion.lat, lng: suggestion.lng });
    if (Number.isFinite(distance)) score += Math.max(0, 180 - Math.min(180, distance / 1000));
  }
  return score;
};

const normalizeOsmCountryName = (properties: NativeOsmLocationProperties) => {
  const state = clean(properties.state).toLowerCase();
  const city = clean(properties.city).toLowerCase();
  if (state === "hong kong" || city === "hong kong") return "Hong Kong";
  return clean(properties.country);
};

type NativeOsmLocationProperties = {
  osm_key?: string;
  osm_value?: string;
  name?: string;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
  street?: string;
  housenumber?: string;
};

type NativeOsmLocationFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: NativeOsmLocationProperties;
};

const ALLOWED_OSM_AREA_TYPES = new Set([
  "borough",
  "city",
  "city_district",
  "district",
  "locality",
  "municipality",
  "neighbourhood",
  "neighborhood",
  "quarter",
  "suburb",
  "town",
  "village",
]);

const isNativeOsmAreaResult = (properties: NativeOsmLocationProperties) => {
  if (clean(properties.street) || clean(properties.housenumber)) return false;
  const osmKey = clean(properties.osm_key).toLowerCase();
  const osmValue = clean(properties.osm_value).toLowerCase();
  if (osmKey === "place" && ALLOWED_OSM_AREA_TYPES.has(osmValue)) return true;
  if (osmKey === "boundary" && osmValue === "administrative") return true;
  return false;
};

const stripBilingualPrefix = (value: string) => {
  const withoutCjk = value.replace(/[\u3400-\u9FFF]+/g, " ").replace(/\s+/g, " ").trim();
  return clean(withoutCjk) || clean(value);
};

const buildOsmLocationLabel = (district: string, properties: NativeOsmLocationProperties, country: string) => {
  const parts = [
    district,
    clean(properties.district),
    clean(properties.city),
    clean(properties.state),
    country,
  ].filter(Boolean);
  const seenParts = new Set<string>();
  return parts
    .filter((part) => {
      const key = normalizeCountryName(part);
      if (seenParts.has(key)) return false;
      seenParts.add(key);
      return true;
    })
    .join(", ");
};

const fetchNativeOsmAreaSuggestions = async (query: string, countryName?: string | null) => {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];
  const countryQuery = clean(countryName);
  const searchQuery = countryQuery ? `${cleanQuery} ${countryQuery}` : cleanQuery;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=8&lang=en`;
  const result = await fetchWithNativeTimeout(url, {
    headers: {
      "User-Agent": "HuddleApp/1.0 location-area-search",
    },
  }, AREA_SEARCH_TIMEOUT_MS);
  if (!result.ok) throw new Error("osm_geocode_failed");
  const response = result.response;
  if (!response.ok) throw new Error("osm_geocode_failed");
  const payload = await response.json();
  const features: NativeOsmLocationFeature[] = Array.isArray(payload?.features) ? payload.features : [];
  return features
    .map((feature: NativeOsmLocationFeature): NativeLocationSuggestion | null => {
      const properties = feature.properties;
      if (!properties || !isNativeOsmAreaResult(properties)) return null;
      const coordinates = feature.geometry?.coordinates;
      const district = stripBilingualPrefix(clean(properties.name));
      const country = normalizeOsmCountryName(properties);
      if (!district || !country || !coordinates) return null;
      return {
        city: clean(properties.city) || (normalizeCountryName(country) === "hong kong" ? "Hong Kong" : null),
        country,
        district,
        label: buildOsmLocationLabel(district, properties, country),
        lat: coordinates[1] ?? 0,
        lng: coordinates[0] ?? 0,
      };
    })
    .filter((item): item is NativeLocationSuggestion => Boolean(item?.label && item.district));
};

export async function fetchNativeLocationSuggestions(query: string, countryOrOptions?: string | null | NativeLocationSearchOptions): Promise<NativeLocationSuggestion[]> {
  const requestedOptions: NativeLocationSearchOptions = typeof countryOrOptions === "object" && countryOrOptions !== null
    ? countryOrOptions
    : { countryName: countryOrOptions };
  const explicitCountry = parseExplicitCountryFromLocationQuery(query);
  const cleanQuery = explicitCountry.query.trim();
  if (cleanQuery.length < 2) return [];
  const effectiveCountryName = explicitCountry.countryName || requestedOptions.countryName || null;
  const biasPoint = requestedOptions.biasPoint
    ?? currentCoordinateCache.balanced?.value
    ?? currentCoordinateCache.high?.value
    ?? await readCoordinatePersistentCache("balanced").catch(() => null)
    ?? null;
  const biasKey = biasPoint && Number.isFinite(biasPoint.lat) && Number.isFinite(biasPoint.lng)
    ? `${biasPoint.lat.toFixed(2)},${biasPoint.lng.toFixed(2)}`
    : "";
  const cacheKey = `${cleanQuery.toLowerCase()}|${normalizeCountryName(effectiveCountryName)}|${biasKey}`;
  const cached = locationSuggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LOCATION_SEARCH_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_LOCATION_SEARCH_CACHE_HIT", { query: cleanQuery, country: effectiveCountryName || null });
    return cached.value;
  }
  const persistentKey = locationSearchPersistentKey(cacheKey);
  const persistent = await readLocationSearchPersistentCache(persistentKey);
  if (persistent !== undefined) {
    locationSuggestionCache.set(cacheKey, { value: persistent ?? [], ts: Date.now() });
    if (__DEV__) console.log("NATIVE_LOCATION_SEARCH_ASYNC_CACHE_HIT", { query: cleanQuery, country: effectiveCountryName || null });
    return persistent ?? [];
  }
  if (__DEV__) console.log("NATIVE_LOCATION_SEARCH_CACHE_MISS", { query: cleanQuery, country: effectiveCountryName || null });
  const countryCode = resolveCountryCode(effectiveCountryName);
  const expectedCountry = normalizeCountryName(effectiveCountryName);
  const tokenConfig = readNativeMapTokenConfig();
  if (!tokenConfig.ok) {
    const osmFallback = await fetchNativeOsmAreaSuggestions(cleanQuery, effectiveCountryName).catch(() => []);
    return osmFallback
      .filter((suggestion) => !expectedCountry || suggestionMatchesRequestedCountry(suggestion, effectiveCountryName))
      .sort((a, b) => scoreLocationSuggestion(b, cleanQuery, effectiveCountryName, biasPoint) - scoreLocationSuggestion(a, cleanQuery, effectiveCountryName, biasPoint))
      .slice(0, 8);
  }
  const areaTypeFilter = "&types=district,place,locality,neighborhood";
  const fetchSuggestions = async (countryFilter: string, typeFilter = areaTypeFilter) => {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?autocomplete=true&limit=5&language=en${countryFilter}${typeFilter}&access_token=${encodeURIComponent(tokenConfig.token)}`;
    const result = await fetchWithNativeTimeout(url, {}, AREA_SEARCH_TIMEOUT_MS);
    if (!result.ok) throw new Error("geocode_failed");
    const response = result.response;
    if (!response.ok) throw new Error("geocode_failed");
    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    return features
      .map((feature: { center?: [number, number]; context?: Array<{ id?: string; text?: string }>; place_name?: string; place_type?: string[]; text?: string }) => {
        const label = clean(feature.place_name);
        const district = clean(feature.text) || extractNativeDistrictFromPlaceLabel(label);
        const contextCity = extractNativeCityFromMapboxContext(feature.context);
        const rawCountry = extractNativeCountryFromPlaceLabel(label);
        const country = label.toLowerCase().includes("hong kong") ? "Hong Kong" : rawCountry;
        return {
          city: clean(contextCity) || (feature.place_type?.includes("place") ? district : null) || (normalizeCountryName(country) === "hong kong" ? "Hong Kong" : null),
          country,
          district,
          label,
          lat: feature.center?.[1] ?? 0,
          lng: feature.center?.[0] ?? 0,
        };
      })
      .filter((item: NativeLocationSuggestion) => item.label && item.district);
  };
  const countryFilter = countryCode ? `&country=${countryCode}` : "";
  const scopedAreaSuggestions = countryCode
    ? await fetchSuggestions(countryFilter).catch(() => [])
    : [];
  const scopedBroadSuggestions = countryCode && scopedAreaSuggestions.length === 0
    ? await fetchSuggestions(countryFilter, "").catch(() => [])
    : [];
  const countrySuggestions = [...scopedAreaSuggestions, ...scopedBroadSuggestions];
  const countryOsmSuggestions = countryCode
    ? await fetchNativeOsmAreaSuggestions(cleanQuery, effectiveCountryName).catch(() => [])
    : [];
  const shouldUseGlobalFallback = !countryCode || (countrySuggestions.length === 0 && countryOsmSuggestions.length === 0);
  const globalSuggestions = shouldUseGlobalFallback ? await fetchSuggestions("").catch(() => []) : [];
  const globalOsmSuggestions = shouldUseGlobalFallback ? await fetchNativeOsmAreaSuggestions(cleanQuery).catch(() => []) : [];
  if (
    countryCode &&
    countrySuggestions.length === 0 &&
    countryOsmSuggestions.length === 0 &&
    globalSuggestions.length === 0 &&
    globalOsmSuggestions.length === 0
  ) throw new Error("geocode_failed");
  const seenSuggestions = new Set<string>();
  const suggestions = [...countrySuggestions, ...countryOsmSuggestions, ...globalSuggestions, ...globalOsmSuggestions]
    .filter((suggestion) => {
      if (expectedCountry && !suggestionMatchesRequestedCountry(suggestion, effectiveCountryName)) return false;
      const key = `${suggestion.district.trim().toLowerCase()}|${normalizeCountryName(suggestion.country) || suggestion.label.trim().toLowerCase()}`;
      if (seenSuggestions.has(key)) return false;
      seenSuggestions.add(key);
      return true;
    })
    .sort((a, b) => scoreLocationSuggestion(b, cleanQuery, effectiveCountryName, biasPoint) - scoreLocationSuggestion(a, cleanQuery, effectiveCountryName, biasPoint))
    .slice(0, 8);
  locationSuggestionCache.set(cacheKey, { value: suggestions, ts: Date.now() });
  void writeLocationSearchPersistentCache(persistentKey, suggestions);
  return suggestions;
}

export async function fetchNativePrioritizedLocationSuggestions(
  query: string,
  options: NativePrioritizedLocationSearchOptions = {},
): Promise<NativeLocationSuggestion[]> {
  const selectedCountry = clean(options.selectedCountry) || null;
  const biasPoint = options.biasPoint ?? null;
  const gpsCountryPromise = (async () => {
    if (!biasPoint || !Number.isFinite(biasPoint.lat) || !Number.isFinite(biasPoint.lng)) return null;
    const key = `${biasPoint.lat.toFixed(2)},${biasPoint.lng.toFixed(2)}`;
    if (locationCountryByPointCache.has(key)) return locationCountryByPointCache.get(key) ?? null;
    const components = await reverseGeocodeNativeLocationComponents(biasPoint.lat, biasPoint.lng).catch(() => null);
    const country = components?.countryName || components?.countryCode || null;
    locationCountryByPointCache.set(key, country);
    return country;
  })();
  const [selectedResults, gpsResults, globallyRelevantResults] = await Promise.all([
    selectedCountry
      ? fetchNativeLocationSuggestions(query, { biasPoint, countryName: selectedCountry }).catch(() => [])
      : Promise.resolve([]),
    gpsCountryPromise.then((gpsCountry) => (
      gpsCountry && normalizeCountryName(gpsCountry) !== normalizeCountryName(selectedCountry)
        ? fetchNativeLocationSuggestions(query, { biasPoint, countryName: gpsCountry }).catch(() => [])
        : []
    )),
    fetchNativeLocationSuggestions(query, { biasPoint, countryName: null }).catch(() => []),
  ]);
  const seen = new Set<string>();
  return [...selectedResults, ...gpsResults, ...globallyRelevantResults]
    .filter((suggestion) => {
      const key = `${clean(suggestion.district).toLowerCase()}|${clean(suggestion.country).toLowerCase()}|${Number(suggestion.lat).toFixed(5)}|${Number(suggestion.lng).toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
