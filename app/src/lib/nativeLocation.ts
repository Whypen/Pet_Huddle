import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import { readNativeMapTokenConfig } from "./nativeMapConfig";
import { searchNativeLocations } from "./nativeLocationSearch";

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
  country: string;
  district: string;
  label: string;
  lat: number;
  lng: number;
};

export type NativeLocationPermissionState = "unknown" | "granted" | "denied";
export type NativeLocationPermissionDetail = {
  canAskAgain: boolean;
  state: NativeLocationPermissionState;
};

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

const clean = (value: unknown) => String(value || "").trim();
const normalizedKey = (value: unknown) => clean(value).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
const COORDINATE_CACHE_MS = 45_000;
const LOCATION_SEARCH_CACHE_MS = 10 * 60 * 1000;
type NativeCoordinateAccuracy = "balanced" | "high";
const currentCoordinateCache: Record<NativeCoordinateAccuracy, { value: { lat: number; lng: number } | null; ts: number } | null> = {
  balanced: null,
  high: null,
};
const locationSuggestionCache = new Map<string, { value: NativeLocationSuggestion[]; ts: number }>();

const coordinatePersistentKey = (accuracy: NativeCoordinateAccuracy) => `native-location-coordinate:v1:${accuracy}`;
const locationSearchPersistentKey = (key: string) => `native-location-search:v1:${key}`;

const readCoordinatePersistentCache = async (accuracy: NativeCoordinateAccuracy): Promise<{ lat: number; lng: number } | null | undefined> => {
  try {
    const key = coordinatePersistentKey(accuracy);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { ts?: number; value?: { lat?: number; lng?: number } | null };
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > COORDINATE_CACHE_MS) {
      await AsyncStorage.removeItem(key);
      return undefined;
    }
    if (!parsed.value) return null;
    const lat = Number(parsed.value.lat);
    const lng = Number(parsed.value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    await AsyncStorage.removeItem(coordinatePersistentKey(accuracy)).catch(() => undefined);
    return undefined;
  }
};

const writeCoordinatePersistentCache = async (accuracy: NativeCoordinateAccuracy, value: { lat: number; lng: number } | null) => {
  try {
    await AsyncStorage.setItem(coordinatePersistentKey(accuracy), JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // Coordinate cache is a short-lived network guard; memory cache remains enough if storage is unavailable.
  }
};

const readLocationSearchPersistentCache = async (key: string): Promise<NativeLocationSuggestion[] | null | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(key);
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
  "hong kong": { code: "HK", name: "Hong Kong" },
  "hong kong sar": { code: "HK", name: "Hong Kong" },
  "hong kong sar china": { code: "HK", name: "Hong Kong" },
  hk: { code: "HK", name: "Hong Kong" },
  singapore: { code: "SG", name: "Singapore" },
  sg: { code: "SG", name: "Singapore" },
  "united state": { code: "US", name: "United States" },
  "united states": { code: "US", name: "United States" },
  "united states of america": { code: "US", name: "United States" },
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
  const explicitCountry = normalizeNativeCountryLabel(fields.country) || normalizeNativeCountryLabel(fields.countryCode);
  const countryAsCity = CITY_ALIASES[normalizedKey(fields.country)];
  const cityAlias = CITY_ALIASES[normalizedKey(fields.city)] || CITY_ALIASES[normalizedKey(fields.district)] || countryAsCity;
  const countryCode = explicitCountry?.code || cityAlias?.countryCode || clean(fields.countryCode).toUpperCase() || null;
  const countryName = explicitCountry?.name || cityAlias?.countryName || clean(fields.country) || null;
  return {
    adminArea: clean(fields.adminArea) || null,
    city: cityAlias?.city || clean(fields.city) || (countryAsCity ? countryAsCity.city : null),
    countryCode,
    countryName,
    district: clean(fields.district) || null,
  };
}

const pickDistrict = (address: Location.LocationGeocodedAddress) =>
  clean(address.district) ||
  clean(address.subregion) ||
  clean(address.city);

export async function reverseGeocodeNativeLocationComponents(lat: number, lng: number): Promise<NativeLocationComponents | null> {
  const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
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
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
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
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status === Location.PermissionStatus.GRANTED) return "granted";
  if (permission.status === Location.PermissionStatus.DENIED) return "denied";
  return "unknown";
}

const mapNativeLocationPermission = (permission: Location.LocationPermissionResponse): NativeLocationPermissionDetail => {
  if (permission.status === Location.PermissionStatus.GRANTED) return { canAskAgain: permission.canAskAgain, state: "granted" };
  if (permission.status === Location.PermissionStatus.DENIED) return { canAskAgain: permission.canAskAgain, state: "denied" };
  return { canAskAgain: permission.canAskAgain, state: "unknown" };
};

export async function getNativeForegroundLocationPermissionDetail(): Promise<NativeLocationPermissionDetail> {
  return mapNativeLocationPermission(await Location.getForegroundPermissionsAsync());
}

export async function requestNativeForegroundLocationPermission(): Promise<NativeLocationPermissionState> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status === Location.PermissionStatus.GRANTED) return "granted";
  if (permission.status === Location.PermissionStatus.DENIED) return "denied";
  return "unknown";
}

export async function requestNativeForegroundLocationPermissionDetail(): Promise<NativeLocationPermissionDetail> {
  return mapNativeLocationPermission(await Location.requestForegroundPermissionsAsync());
}

export async function getNativeCurrentCoordinates(options: { accuracy?: NativeCoordinateAccuracy; force?: boolean } = {}): Promise<{ lat: number; lng: number } | null> {
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
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    currentCoordinateCache[accuracy] = { value: null, ts: Date.now() };
    void writeCoordinatePersistentCache(accuracy, null);
    return null;
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: accuracy === "high" ? Location.Accuracy.High : Location.Accuracy.Balanced,
  });
  const value = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };
  currentCoordinateCache[accuracy] = { value, ts: Date.now() };
  if (accuracy === "high") currentCoordinateCache.balanced = { value, ts: Date.now() };
  void writeCoordinatePersistentCache(accuracy, value);
  if (accuracy === "high") void writeCoordinatePersistentCache("balanced", value);
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

const normalizeOsmCountryName = (properties: NativeOsmLocationProperties, requestedCountry?: string | null) => {
  const state = clean(properties.state).toLowerCase();
  const city = clean(properties.city).toLowerCase();
  const requested = normalizeCountryName(requestedCountry);
  if ((requested === "hong kong" || !requested) && (state === "hong kong" || city === "hong kong")) return "Hong Kong";
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": "HuddleApp/1.0 location-area-search",
    },
  });
  if (!response.ok) throw new Error("osm_geocode_failed");
  const payload = await response.json();
  const features: NativeOsmLocationFeature[] = Array.isArray(payload?.features) ? payload.features : [];
  return features
    .map((feature: NativeOsmLocationFeature): NativeLocationSuggestion | null => {
      const properties = feature.properties;
      if (!properties || !isNativeOsmAreaResult(properties)) return null;
      const coordinates = feature.geometry?.coordinates;
      const district = stripBilingualPrefix(clean(properties.name));
      const country = normalizeOsmCountryName(properties, countryName);
      if (!district || !country || !coordinates) return null;
      return {
        country,
        district,
        label: buildOsmLocationLabel(district, properties, country),
        lat: coordinates[1] ?? 0,
        lng: coordinates[0] ?? 0,
      };
    })
    .filter((item): item is NativeLocationSuggestion => Boolean(item?.label && item.district));
};

export async function fetchNativeLocationSuggestions(query: string, countryName?: string | null): Promise<NativeLocationSuggestion[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];
  const cacheKey = `${cleanQuery.toLowerCase()}|${normalizeCountryName(countryName)}`;
  const cached = locationSuggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LOCATION_SEARCH_CACHE_MS) {
    if (__DEV__) console.log("NATIVE_LOCATION_SEARCH_CACHE_HIT", { query: cleanQuery, country: countryName || null });
    return cached.value;
  }
  const persistentKey = locationSearchPersistentKey(cacheKey);
  const persistent = await readLocationSearchPersistentCache(persistentKey);
  if (persistent !== undefined) {
    locationSuggestionCache.set(cacheKey, { value: persistent ?? [], ts: Date.now() });
    if (__DEV__) console.log("NATIVE_LOCATION_SEARCH_ASYNC_CACHE_HIT", { query: cleanQuery, country: countryName || null });
    return persistent ?? [];
  }
  if (__DEV__) console.log("NATIVE_LOCATION_SEARCH_CACHE_MISS", { query: cleanQuery, country: countryName || null });
  const localSuggestions = await searchNativeLocations(cleanQuery, countryName);
  const localAreaSuggestions = localSuggestions.map((suggestion): NativeLocationSuggestion => ({
    country: clean(countryName) || extractNativeCountryFromPlaceLabel(suggestion.full),
    district: suggestion.primary,
    label: suggestion.full || `${suggestion.primary}${countryName ? `, ${countryName}` : ""}`,
    lat: 0,
    lng: 0,
  }));
  const tokenConfig = readNativeMapTokenConfig();
  if (!tokenConfig.ok) return localAreaSuggestions;
  const typeFilter = "&types=district,place,locality,neighborhood";
  const fetchSuggestions = async (countryFilter: string) => {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?autocomplete=true&limit=5&language=en${countryFilter}${typeFilter}&access_token=${encodeURIComponent(tokenConfig.token)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("geocode_failed");
    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    return features
      .map((feature: { center?: [number, number]; place_name?: string; place_type?: string[]; text?: string }) => {
        const label = clean(feature.place_name);
        const district = clean(feature.text) || extractNativeDistrictFromPlaceLabel(label);
        return {
          country: extractNativeCountryFromPlaceLabel(label),
          district,
          label,
          lat: feature.center?.[1] ?? 0,
          lng: feature.center?.[0] ?? 0,
        };
      })
      .filter((item: NativeLocationSuggestion) => item.label && item.district);
  };
  const countryCode = resolveCountryCode(countryName);
  const expectedCountry = normalizeCountryName(countryName);
  const countrySuggestions = countryCode
    ? await fetchSuggestions(`&country=${countryCode}`).catch(() => [])
    : [];
  const countryOsmSuggestions = countryCode
    ? await fetchNativeOsmAreaSuggestions(cleanQuery, countryName).catch(() => [])
    : [];
  const shouldUseGlobalFallback = !countryCode || (countrySuggestions.length === 0 && countryOsmSuggestions.length === 0);
  const globalSuggestions = shouldUseGlobalFallback ? await fetchSuggestions("").catch(() => []) : [];
  const globalOsmSuggestions = shouldUseGlobalFallback ? await fetchNativeOsmAreaSuggestions(cleanQuery).catch(() => []) : [];
  if (
    countryCode &&
    countrySuggestions.length === 0 &&
    countryOsmSuggestions.length === 0 &&
    globalSuggestions.length === 0 &&
    globalOsmSuggestions.length === 0 &&
    localAreaSuggestions.length === 0
  ) throw new Error("geocode_failed");
  const seenSuggestions = new Set<string>();
  const suggestions = [...localAreaSuggestions, ...countrySuggestions, ...countryOsmSuggestions, ...globalSuggestions, ...globalOsmSuggestions]
    .filter((suggestion) => {
      if (expectedCountry && countrySuggestions.includes(suggestion) && normalizeCountryName(suggestion.country) !== expectedCountry) return false;
      const key = `${suggestion.district.trim().toLowerCase()}|${normalizeCountryName(suggestion.country) || suggestion.label.trim().toLowerCase()}`;
      if (seenSuggestions.has(key)) return false;
      seenSuggestions.add(key);
      return true;
    })
    .slice(0, 8);
  locationSuggestionCache.set(cacheKey, { value: suggestions, ts: Date.now() });
  void writeLocationSearchPersistentCache(persistentKey, suggestions);
  return suggestions;
}
