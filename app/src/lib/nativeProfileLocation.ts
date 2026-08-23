const uniqueLocationParts = (parts: string[]) => parts.filter((part, index, values) => (
  Boolean(part) && values.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index
));

const normalizedLocationKey = (value: string | null | undefined) => (
  String(value || "").trim().toLowerCase().replace(/[^a-z]+/g, "")
);

const isHongKongLocation = (value: string | null | undefined) => (
  ["hk", "hongkong", "hongkongsarchina"].includes(normalizedLocationKey(value))
);

export const canonicalNativeProfileCity = (
  city: string | null | undefined,
  country: string | null | undefined,
) => (isHongKongLocation(country) ? "Hong Kong" : String(city || "").trim());

export const resolveNativeProfileMarketCity = ({
  adminArea,
  city,
  country,
  district,
  locationName,
}: {
  adminArea?: string | null;
  city?: string | null;
  country?: string | null;
  district?: string | null;
  locationName?: string | null;
}) => {
  const canonicalCity = canonicalNativeProfileCity(city, country);
  if (canonicalCity) return canonicalCity;

  const locationParts = String(locationName || "").split(",").map((part) => part.trim()).filter(Boolean);
  const countryKey = String(country || "").trim().toLowerCase();
  const cityFromLocationName = locationParts.find((part, index) => (
    index > 0
    && part.toLowerCase() !== countryKey
    && part.toLowerCase() !== String(district || "").trim().toLowerCase()
  ));
  return canonicalNativeProfileCity(cityFromLocationName || adminArea || district, country);
};

export const canonicalNativeProfileDistrict = (
  district: string | null | undefined,
  country: string | null | undefined,
) => {
  const cleanDistrict = String(district || "").trim();
  return isHongKongLocation(country) && normalizedLocationKey(cleanDistrict) === "centralandwesterndistrict"
    ? "Central and Western District"
    : cleanDistrict;
};

export const formatNativeProfileAreaCity = (value: string | null | undefined, country: string | null | undefined) => {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  const countryLabel = String(country || "").trim();
  const countryKey = String(country || "").trim().toLowerCase();
  const district = canonicalNativeProfileDistrict(parts[0] || "", country);
  if (!district) return "";
  if (isHongKongLocation(country)) return uniqueLocationParts([district, "Hong Kong"]).join(", ");
  const city = parts.find((part, index) => index > 0 && part.toLowerCase() !== countryKey) || "";
  return uniqueLocationParts([district, city || countryLabel]).join(", ");
};

export const buildNativeProfileAreaCity = (
  district: string | null | undefined,
  city: string | null | undefined,
  country?: string | null,
) => (
  uniqueLocationParts([
    canonicalNativeProfileDistrict(district, country),
    canonicalNativeProfileCity(city, country),
  ]).join(", ")
);

export const extractNativeProfileCity = (value: string | null | undefined, country: string | null | undefined) => {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  const countryKey = String(country || "").trim().toLowerCase();
  return parts.find((part, index) => index > 0 && part.toLowerCase() !== countryKey) || "";
};
