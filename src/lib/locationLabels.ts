const COUNTRY_ALIASES: Record<string, string> = {
  hk: "hong kong",
  "hong kong sar": "hong kong",
  "hong kong s.a.r.": "hong kong",
  us: "united states",
  usa: "united states",
  "u.s.a.": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u.k.": "united kingdom",
};

const normalizeCountryToken = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return COUNTRY_ALIASES[normalized] || normalized;
};

export const extractCommaParts = (value: string | null | undefined) =>
  String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export const extractDistrictToken = (value: string | null | undefined) => {
  const parts = extractCommaParts(value);
  if (parts.length >= 2) return parts[1] || parts[0] || null;
  return parts[0] || null;
};

export const extractCountryToken = (value: string | null | undefined) => {
  const parts = extractCommaParts(value);
  return normalizeCountryToken(parts.at(-1) || null);
};

export const resolveDiscoveryLocationLabel = ({
  liveLocationDistrict,
  pinDistrict,
  profileLocationDistrict,
  profileLocationName,
}: {
  liveLocationDistrict?: string | null;
  pinDistrict?: string | null;
  profileLocationDistrict?: string | null;
  profileLocationName?: string | null;
}) =>
  extractDistrictToken(liveLocationDistrict) ||
  extractDistrictToken(pinDistrict) ||
  extractDistrictToken(profileLocationDistrict) ||
  extractDistrictToken(profileLocationName) ||
  null;

export const resolveCountryByPrecedence = ({
  gpsCountry,
  pinCountry,
  profileCountry,
  gpsLocationName,
  pinLocationName,
  profileLocationName,
}: {
  gpsCountry?: string | null;
  pinCountry?: string | null;
  profileCountry?: string | null;
  gpsLocationName?: string | null;
  pinLocationName?: string | null;
  profileLocationName?: string | null;
}) =>
  String(gpsCountry || "").trim() ||
  extractCountryToken(gpsLocationName) ||
  String(pinCountry || "").trim() ||
  extractCountryToken(pinLocationName) ||
  String(profileCountry || "").trim() ||
  extractCountryToken(profileLocationName) ||
  null;

export const normalizeCountryKey = (value: string | null | undefined) =>
  normalizeCountryToken(value) || "";

export const countWords = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
