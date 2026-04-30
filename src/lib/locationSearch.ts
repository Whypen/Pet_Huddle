/**
 * locationSearch — curated district lookup keyed by country.
 *
 * No third-party network dependency. Static lists of common districts /
 * neighbourhoods per country, filtered by user-typed prefix or substring.
 * Reliable, predictable, instant. When a country has no curated list, the
 * caller renders the input as plain free-text (no autocomplete).
 *
 * Adding a country: extend `DISTRICTS_BY_COUNTRY` with the country name lower-cased
 * (and any aliases that appear in profile data) → string[] of districts.
 */

// Common ISO 3166-1 alpha-2 mapping retained for compatibility with any
// previous consumer; not used for filtering since matching is by name now.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "hong kong": "hk",
  "hong kong sar": "hk",
  "hong kong s.a.r.": "hk",
  hk: "hk",
  "united states": "us",
  usa: "us",
  us: "us",
  "united kingdom": "gb",
  uk: "gb",
  australia: "au",
  canada: "ca",
  singapore: "sg",
  japan: "jp",
  taiwan: "tw",
};

export const countryCodeFor = (name: string | null | undefined): string | null => {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return COUNTRY_NAME_TO_CODE[key] ?? null;
};

const HK_DISTRICTS = [
  // Hong Kong Island
  "Central",
  "Sheung Wan",
  "Admiralty",
  "Wan Chai",
  "Causeway Bay",
  "Happy Valley",
  "North Point",
  "Quarry Bay",
  "Tai Koo",
  "Sai Wan Ho",
  "Shau Kei Wan",
  "Chai Wan",
  "Mid-Levels",
  "The Peak",
  "Pok Fu Lam",
  "Aberdeen",
  "Ap Lei Chau",
  "Wong Chuk Hang",
  "Repulse Bay",
  "Stanley",
  "Shek O",
  // Kowloon
  "Tsim Sha Tsui",
  "Jordan",
  "Yau Ma Tei",
  "Mong Kok",
  "Prince Edward",
  "Sham Shui Po",
  "Cheung Sha Wan",
  "Lai Chi Kok",
  "Mei Foo",
  "Kowloon City",
  "Ho Man Tin",
  "Hung Hom",
  "To Kwa Wan",
  "Kowloon Tong",
  "Wong Tai Sin",
  "Diamond Hill",
  "Choi Hung",
  "Kwun Tong",
  "Lam Tin",
  "Yau Tong",
  "Ngau Tau Kok",
  "Kowloon Bay",
  // New Territories
  "Sha Tin",
  "Tai Wai",
  "Ma On Shan",
  "Fo Tan",
  "Tai Po",
  "Tai Mei Tuk",
  "Fanling",
  "Sheung Shui",
  "Yuen Long",
  "Tin Shui Wai",
  "Tuen Mun",
  "Tsuen Wan",
  "Kwai Chung",
  "Tsing Yi",
  "Sai Kung",
  "Clear Water Bay",
  // Lantau & islands
  "Tung Chung",
  "Discovery Bay",
  "Mui Wo",
  "Cheung Chau",
  "Lamma Island",
  "Peng Chau",
];

const SG_DISTRICTS = [
  "Orchard",
  "Bugis",
  "Tanjong Pagar",
  "Marina Bay",
  "Chinatown",
  "Clarke Quay",
  "Tiong Bahru",
  "Holland Village",
  "Bukit Timah",
  "Newton",
  "Novena",
  "Toa Payoh",
  "Bishan",
  "Ang Mo Kio",
  "Hougang",
  "Serangoon",
  "Punggol",
  "Sengkang",
  "Tampines",
  "Bedok",
  "Pasir Ris",
  "Jurong East",
  "Jurong West",
  "Clementi",
  "Queenstown",
  "Sentosa",
];

const DISTRICTS_BY_COUNTRY: Record<string, readonly string[]> = {
  "hong kong": HK_DISTRICTS,
  "hong kong sar": HK_DISTRICTS,
  "hong kong s.a.r.": HK_DISTRICTS,
  hk: HK_DISTRICTS,
  singapore: SG_DISTRICTS,
  sg: SG_DISTRICTS,
};

const districtsFor = (countryName: string | null | undefined): readonly string[] => {
  const key = String(countryName || "").trim().toLowerCase();
  if (!key) return [];
  return DISTRICTS_BY_COUNTRY[key] ?? [];
};

export interface LocationSuggestion {
  /** Short label good for an input value (e.g. "Wan Chai"). */
  primary: string;
  /** Optional longer label for context — empty for curated lists. */
  full: string;
  /** Stable key for React lists. */
  id: string;
}

/**
 * Filter the country's curated district list by `query`. Prefix match wins,
 * substring match falls in second. Returns up to 6 unique entries. Synchronous;
 * the `signal` arg is accepted for API compatibility but not used (no network).
 */
export async function searchLocations(
  query: string,
  countryName: string | null,
  _signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];
  const list = districtsFor(countryName);
  if (list.length === 0) return [];

  const lower = trimmed.toLowerCase();
  const prefixed: string[] = [];
  const contained: string[] = [];
  for (const item of list) {
    const itemLower = item.toLowerCase();
    if (itemLower.startsWith(lower)) {
      prefixed.push(item);
    } else if (itemLower.includes(lower)) {
      contained.push(item);
    }
  }
  return [...prefixed, ...contained].slice(0, 6).map((primary) => ({
    primary,
    full: "",
    id: primary,
  }));
}

export const hasCuratedDistricts = (countryName: string | null | undefined): boolean =>
  districtsFor(countryName).length > 0;
