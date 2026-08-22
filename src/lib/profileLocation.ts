/**
 * Profile location shaping, ported from `app/src/lib/nativeProfileLocation.ts`.
 * The two builds are separate, so web cannot import it; the logic is copied
 * verbatim so a location resolves identically on both platforms.
 *
 * The app stores FOUR fields — `mark_native_signup_location` writes
 * location_country, location_city, location_district and location_name — and it
 * RENDERS the city: `buildNativeProfileAreaCity` produces "District, City".
 */

const uniqueLocationParts = (parts: string[]) =>
  parts.filter(
    (part, index, values) =>
      Boolean(part) && values.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index,
  );

const normalizedLocationKey = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "");

const isHongKongLocation = (value: string | null | undefined) =>
  ["hk", "hongkong", "hongkongsarchina"].includes(normalizedLocationKey(value));

/** nativeProfileLocation.ts:13-16 — Hong Kong is its own city. */
export const canonicalProfileCity = (city: string | null | undefined, country: string | null | undefined) =>
  isHongKongLocation(country) ? "Hong Kong" : String(city || "").trim();

/** nativeProfileLocation.ts:43-50 */
export const canonicalProfileDistrict = (
  district: string | null | undefined,
  country: string | null | undefined,
) => {
  const cleanDistrict = String(district || "").trim();
  return isHongKongLocation(country) && normalizedLocationKey(cleanDistrict) === "centralandwesterndistrict"
    ? "Central and Western District"
    : cleanDistrict;
};

/**
 * nativeProfileLocation.ts:65-74 — "District, City", de-duplicated so
 * "Hong Kong, Hong Kong" collapses to "Hong Kong".
 */
export const buildProfileAreaCity = (
  district: string | null | undefined,
  city: string | null | undefined,
  country?: string | null,
) =>
  uniqueLocationParts([
    canonicalProfileDistrict(district, country),
    canonicalProfileCity(city, country),
  ]).join(", ");
