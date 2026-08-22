/**
 * Location search — the query web already uses, the extraction the app uses.
 *
 * Query, verbatim from `src/pages/EditProfile.tsx:1141-1149` (web's own profile
 * editor):
 *   min 2 characters · 300ms debounce · AbortController
 *   GET api.mapbox.com/geocoding/v5/mapbox.places/{q}.json
 *       ?autocomplete=true&limit=5&language=en[&country=xx]
 *   No `types=` filter. Global unless a country is selected.
 *
 * District extraction follows the APP (`app/src/lib/nativeLocation.ts:753-757`):
 *   district = feature.text || first comma-part of place_name
 *
 * This differs from web's EditProfile, which takes the SECOND comma-part
 * (`EditProfile.tsx:148-152`). For "Brooklyn, New York, United States" that
 * yields "New York" — the city, not the district — where the app yields
 * "Brooklyn". The app's rule is used here because the app defines behaviour.
 * The divergence in EditProfile is pre-existing and left alone.
 *
 * Country list comes from Intl.DisplayNames, the same way EditProfile builds it
 * (`EditProfile.tsx:192-200`) — every ISO region, no curated market list.
 */

import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";

export type LocationSuggestion = {
  label: string;
  lat: number;
  lng: number;
  district: string;
  country: string;
  city: string | null;
};

const clean = (value: unknown) => String(value || "").trim();

/** App rule: first comma-part. (`extractNativeDistrictFromPlaceLabel`) */
export const extractDistrictFromPlaceLabel = (label: string): string =>
  label.split(",").map((part) => part.trim()).filter(Boolean)[0] || "";

/** App rule: last comma-part. (`extractNativeCountryFromPlaceLabel`) */
export const extractCountryFromPlaceLabel = (label: string): string => {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || "";
};

/** App rule: the `place.*` context entry is the city. */
export const extractCityFromMapboxContext = (
  context?: Array<{ id?: string; text?: string }>,
): string | null => clean(context?.find((entry) => /^place\./.test(clean(entry.id)))?.text) || null;

/** Every ISO region, built exactly as EditProfile builds it. */
export const countryOptions = (() => {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  return Array.from({ length: 26 * 26 }, (_, idx) => {
    const a = String.fromCharCode(65 + Math.floor(idx / 26));
    const b = String.fromCharCode(65 + (idx % 26));
    const code = `${a}${b}`;
    const label = displayNames.of(code);
    return label && label !== code && !label.toLowerCase().includes("unknown") ? { code, label } : null;
  })
    .filter((item): item is { code: string; label: string } => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label));
})();

export const MIN_LOCATION_QUERY_LENGTH = 2;
export const LOCATION_DEBOUNCE_MS = 300;


// ── OpenStreetMap fallback (Photon) ─────────────────────────────────────────
// Ported from app/src/lib/nativeLocation.ts:596-701. Mapbox is tried first; this
// runs when it returns nothing, so a real place is never missing just because
// one provider has no record of it.

const normalizeCountryName = (value?: string | null) =>
  clean(value).toLowerCase().replace(/\s+sar\s+china$/, "");

type OsmProperties = {
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

// nativeLocation.ts:622-634
const ALLOWED_OSM_AREA_TYPES = new Set([
  "borough", "city", "city_district", "district", "locality", "municipality",
  "neighbourhood", "neighborhood", "quarter", "suburb", "town", "village",
]);

const isOsmAreaResult = (properties: OsmProperties) => {
  if (clean(properties.street) || clean(properties.housenumber)) return false;
  const osmKey = clean(properties.osm_key).toLowerCase();
  const osmValue = clean(properties.osm_value).toLowerCase();
  if (osmKey === "place" && ALLOWED_OSM_AREA_TYPES.has(osmValue)) return true;
  if (osmKey === "boundary" && osmValue === "administrative") return true;
  return false;
};

const normalizeOsmCountryName = (properties: OsmProperties) => {
  const state = clean(properties.state).toLowerCase();
  const city = clean(properties.city).toLowerCase();
  if (state === "hong kong" || city === "hong kong") return "Hong Kong";
  return clean(properties.country);
};

/** nativeLocation.ts:646-649 — drop CJK so a bilingual name reads in English. */
const stripBilingualPrefix = (value: string) => {
  const withoutCjk = value.replace(/[\u3400-\u9FFF]+/g, " ").replace(/\s+/g, " ").trim();
  return clean(withoutCjk) || clean(value);
};

/** nativeLocation.ts:651-668 */
const buildOsmLocationLabel = (district: string, properties: OsmProperties, country: string) => {
  const parts = [
    district,
    clean(properties.district),
    clean(properties.city),
    clean(properties.state),
    country,
  ].filter(Boolean);
  const seen = new Set<string>();
  return parts
    .filter((part) => {
      const key = normalizeCountryName(part);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
};

async function fetchOsmAreaSuggestions(
  query: string,
  countryName?: string | null,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const cleanQuery = clean(query);
  if (cleanQuery.length < MIN_LOCATION_QUERY_LENGTH) return [];
  const countryQuery = clean(countryName);
  const searchQuery = countryQuery ? `${cleanQuery} ${countryQuery}` : cleanQuery;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=8&lang=en`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const payload = await response.json();
    const features: Array<{ properties?: OsmProperties; geometry?: { coordinates?: [number, number] } }> =
      Array.isArray(payload?.features) ? payload.features : [];
    return features
      .map((feature) => {
        const properties = feature.properties;
        if (!properties || !isOsmAreaResult(properties)) return null;
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
        } satisfies LocationSuggestion;
      })
      .filter((item): item is LocationSuggestion => Boolean(item?.label && item.district));
  } catch {
    return [];
  }
}

type MapboxFeature = {
  center?: [number, number];
  context?: Array<{ id?: string; text?: string }>;
  place_name?: string;
  place_type?: string[];
  text?: string;
};

// ── Ranking + cache (nativeLocation.ts:536-594, 85, 712-804) ───────────────

const isHongKongCountryContext = (value?: string | null) => {
  const normalized = normalizeCountryName(value);
  return normalized === "hong kong" || normalized === "hong kong sar" || normalized === "hk";
};

/** nativeLocation.ts:536-546 */
const suggestionMatchesRequestedCountry = (
  suggestion: LocationSuggestion,
  requestedCountry?: string | null,
) => {
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

/** nativeLocation.ts:560-570 — haversine, metres. */
const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/** nativeLocation.ts:572-594 — exact-match beats prefix beats substring, plus a
 *  country bonus and a distance bias that decays over 180km. */
const scoreLocationSuggestion = (
  suggestion: LocationSuggestion,
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
  if (
    biasPoint &&
    Number.isFinite(suggestion.lat) &&
    Number.isFinite(suggestion.lng) &&
    suggestion.lat !== 0 &&
    suggestion.lng !== 0
  ) {
    const distance = distanceMeters(biasPoint, { lat: suggestion.lat, lng: suggestion.lng });
    if (Number.isFinite(distance)) score += Math.max(0, 180 - Math.min(180, distance / 1000));
  }
  return score;
};

/** nativeLocation.ts:85 + :95 — 10 minutes, in memory. */
const LOCATION_SEARCH_CACHE_MS = 10 * 60 * 1000;
const locationSuggestionCache = new Map<string, { value: LocationSuggestion[]; ts: number }>();

// nativeLocation.ts:99, 129-149 — the app also persists suggestions so the cache
// survives a reload. AsyncStorage there, localStorage here; same key shape, same
// TTL, same self-eviction on stale or corrupt entries.
const locationSearchPersistentKey = (key: string) => `web-location-search:v4:${key}`;

const readPersistentCache = (key: string): LocationSuggestion[] | undefined => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { ts?: number; value?: LocationSuggestion[] | null };
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > LOCATION_SEARCH_CACHE_MS || !Array.isArray(parsed.value)) {
      localStorage.removeItem(key);
      return undefined;
    }
    return parsed.value;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable (private mode); the memory cache still applies.
    }
    return undefined;
  }
};

const writePersistentCache = (key: string, value: LocationSuggestion[]) => {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // Quota or private mode — a missing persistent cache is not an error.
  }
};

export type LocationSearchOptions = {
  /** ISO alpha-2, narrows the Mapbox query. */
  countryCode?: string;
  /** Country label, used by the OSM query and by ranking. */
  countryName?: string;
  /** Ranks nearer places higher. */
  biasPoint?: { lat: number; lng: number } | null;
  signal?: AbortSignal;
};

/**
 * nativeLocation.ts:712-804. Country-scoped Mapbox, a broad retry, country OSM,
 * then global Mapbox + global OSM only when the country pass found nothing.
 * Everything is merged, filtered to the requested country, de-duplicated on
 * district|country, ranked by score and cut to 8 — the app does not return the
 * first non-empty source, it ranks across all of them.
 */
export async function searchLocations(
  query: string,
  countryCodeOrOptions: string | LocationSearchOptions = "",
  signal?: AbortSignal,
  countryNameArg = "",
): Promise<LocationSuggestion[]> {
  const options: LocationSearchOptions =
    typeof countryCodeOrOptions === "string"
      ? { countryCode: countryCodeOrOptions, countryName: countryNameArg, signal }
      : countryCodeOrOptions;

  const cleanQuery = clean(query);
  if (cleanQuery.length < MIN_LOCATION_QUERY_LENGTH) return [];

  const countryCode = clean(options.countryCode);
  const countryName = clean(options.countryName);
  const biasPoint = options.biasPoint ?? null;
  const abortSignal = options.signal ?? signal;

  const biasKey =
    biasPoint && Number.isFinite(biasPoint.lat) && Number.isFinite(biasPoint.lng)
      ? `${biasPoint.lat.toFixed(2)},${biasPoint.lng.toFixed(2)}`
      : "";
  const cacheKey = `${cleanQuery.toLowerCase()}|${normalizeCountryName(countryName || countryCode)}|${biasKey}`;
  const cached = locationSuggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < LOCATION_SEARCH_CACHE_MS) return cached.value;

  const persistentKey = locationSearchPersistentKey(cacheKey);
  const persisted = readPersistentCache(persistentKey);
  if (persisted !== undefined) {
    locationSuggestionCache.set(cacheKey, { value: persisted, ts: Date.now() });
    return persisted;
  }

  const scopedArea = countryCode ? await mapboxSearch(cleanQuery, countryCode, abortSignal) : [];
  const scopedBroad =
    countryCode && scopedArea.length === 0 ? await mapboxSearch(cleanQuery, countryCode, abortSignal) : [];
  const countrySuggestions = [...scopedArea, ...scopedBroad];
  const countryOsm = countryCode
    ? await fetchOsmAreaSuggestions(cleanQuery, countryName, abortSignal)
    : [];

  const useGlobalFallback = !countryCode || (countrySuggestions.length === 0 && countryOsm.length === 0);
  const globalSuggestions = useGlobalFallback ? await mapboxSearch(cleanQuery, "", abortSignal) : [];
  const globalOsm = useGlobalFallback ? await fetchOsmAreaSuggestions(cleanQuery, "", abortSignal) : [];

  const expectedCountry = normalizeCountryName(countryName);
  const seen = new Set<string>();
  const suggestions = [...countrySuggestions, ...countryOsm, ...globalSuggestions, ...globalOsm]
    .filter((suggestion) => {
      if (expectedCountry && !suggestionMatchesRequestedCountry(suggestion, countryName)) return false;
      const key = `${suggestion.district.trim().toLowerCase()}|${
        normalizeCountryName(suggestion.country) || suggestion.label.trim().toLowerCase()
      }`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        scoreLocationSuggestion(b, cleanQuery, countryName, biasPoint) -
        scoreLocationSuggestion(a, cleanQuery, countryName, biasPoint),
    )
    .slice(0, 8);

  locationSuggestionCache.set(cacheKey, { value: suggestions, ts: Date.now() });
  writePersistentCache(persistentKey, suggestions);
  return suggestions;
}

async function mapboxSearch(
  cleanQuery: string,
  countryCode: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  if (!MAPBOX_ACCESS_TOKEN) return [];
  const countryFilter = countryCode ? `&country=${countryCode.toLowerCase()}` : "";
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json` +
    `?autocomplete=true&limit=5&language=en${countryFilter}` +
    `&access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return [];
    const payload = await response.json();
    const features: MapboxFeature[] = Array.isArray(payload?.features) ? payload.features : [];

    return features
      .map((feature) => {
        const label = clean(feature.place_name);
        const district = clean(feature.text) || extractDistrictFromPlaceLabel(label);
        const rawCountry = extractCountryFromPlaceLabel(label);
        const country = label.toLowerCase().includes("hong kong") ? "Hong Kong" : rawCountry;
        const contextCity = extractCityFromMapboxContext(feature.context);
        return {
          label,
          lat: feature.center?.[1] ?? 0,
          lng: feature.center?.[0] ?? 0,
          district,
          country,
          city:
            clean(contextCity) ||
            (feature.place_type?.includes("place") ? district : null) ||
            (country.toLowerCase() === "hong kong" ? "Hong Kong" : null),
        };
      })
      .filter((item) => Boolean(item.label));
  } catch {
    return [];
  }
}
