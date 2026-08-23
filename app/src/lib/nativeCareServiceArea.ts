// Dependency-free geo helpers for the care-booking "out of service area" advisory.
// Kept free of supabase/RN imports so the logic can be unit-tested directly.

// A single point in the carer's served footprint: their Carer's Place pin plus each
// preferred meetup area.
export type NativeCareServiceArea = { country: string; lat: number | null; lng: number | null };

export const careHaversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const radiusKm = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Advisory (never blocking) check: is the requester's chosen location outside the carer's
// usual service area? True when the picked country isn't one the carer serves, OR when the
// pick is more than `maxKm` from every served point. Returns false whenever we lack the
// signal to be confident (no picked country/coords, or the carer has no known areas) so we
// never warn on a guess.
export const isNativeCareLocationOutOfArea = (
  picked: { country?: string | null; lat?: number | null; lng?: number | null } | null | undefined,
  serviceAreas: NativeCareServiceArea[] | null | undefined,
  maxKm = 100,
): boolean => {
  if (!picked || !Array.isArray(serviceAreas) || serviceAreas.length === 0) return false;
  const pickedCountry = String(picked.country || "").trim().toLowerCase();
  const servedCountries = serviceAreas.map((area) => String(area.country || "").trim().toLowerCase()).filter(Boolean);
  if (pickedCountry && servedCountries.length > 0 && !servedCountries.includes(pickedCountry)) return true;

  // null/undefined coords must be treated as MISSING, not 0 — Number(null) === 0 would
  // place the point off the coast of Africa and trip a bogus far-distance warning.
  const finite = (value: number | null | undefined): number | null =>
    value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const pLat = finite(picked.lat);
  const pLng = finite(picked.lng);
  if (pLat === null || pLng === null) return false;
  const points = serviceAreas
    .map((area) => ({ lat: finite(area.lat), lng: finite(area.lng) }))
    .filter((area): area is { lat: number; lng: number } => area.lat !== null && area.lng !== null);
  if (points.length === 0) return false;
  const minKm = Math.min(...points.map((area) => careHaversineKm(pLat, pLng, area.lat, area.lng)));
  return minKm > maxKm;
};
