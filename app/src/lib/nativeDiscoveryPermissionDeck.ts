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

export const normalizeNativeDiscoveryCountryKey = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return COUNTRY_ALIASES[normalized] || normalized;
};

export const mergeNativeDiscoveryPermissionDeck = <T extends { id: string; locationCountry?: string | null }>(
  protectedPreview: T[],
  refreshedProfiles: T[],
  profileCountry: string | null | undefined,
) => {
  const protectedIds = new Set(protectedPreview.map((profile) => profile.id));
  const countryKey = normalizeNativeDiscoveryCountryKey(profileCountry);
  const refreshedQueue = countryKey
    ? refreshedProfiles.filter((profile) => normalizeNativeDiscoveryCountryKey(profile.locationCountry) === countryKey)
    : refreshedProfiles;
  return [
    ...protectedPreview,
    ...refreshedQueue.filter((profile) => !protectedIds.has(profile.id)),
  ];
};
