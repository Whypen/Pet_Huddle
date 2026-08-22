export type GroupExploreViewerScopeRow = {
  cached_device_point?: { lat?: number | null; lng?: number | null } | null;
  own_pin_point?: { lat?: number | null; lng?: number | null } | null;
  recent_user_point?: { lat?: number | null; lng?: number | null } | null;
  profile_point?: { lat?: number | null; lng?: number | null } | null;
  country?: string | null;
  city?: string | null;
  district?: string | null;
  location_name?: string | null;
};

const cleanText = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

const point = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { lat?: unknown; lng?: unknown };
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

/** Web projection of the exact payload built by app/src/lib/nativeChat.ts. */
export const buildGroupExploreViewerScope = (row: GroupExploreViewerScopeRow | null | undefined) => {
  const primaryPoint = point(row?.cached_device_point)
    || point(row?.own_pin_point)
    || point(row?.recent_user_point)
    || point(row?.profile_point);
  const country = cleanText(row?.country);
  return {
    country,
    payload: {
      city: cleanText(row?.city) || cleanText(row?.location_name),
      country,
      countryCode: null,
      district: cleanText(row?.district),
      lat: primaryPoint?.lat ?? null,
      lng: primaryPoint?.lng ?? null,
      source: primaryPoint ? "viewer_scope" : "profile_text_fallback",
    },
  };
};
