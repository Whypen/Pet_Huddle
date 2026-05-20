export type NativeLocationSuggestion = {
  id: string;
  primary: string;
  full: string;
};

const HK_DISTRICTS = [
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
  "Tung Chung",
  "Discovery Bay",
  "Mui Wo",
  "Cheung Chau",
  "Lamma Island",
  "Peng Chau",
] as const;

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
] as const;

const DISTRICTS_BY_COUNTRY: Record<string, readonly string[]> = {
  "hong kong": HK_DISTRICTS,
  "hong kong sar": HK_DISTRICTS,
  "hong kong s.a.r.": HK_DISTRICTS,
  hk: HK_DISTRICTS,
  singapore: SG_DISTRICTS,
  sg: SG_DISTRICTS,
};

const districtsFor = (countryName: string | null | undefined): readonly string[] => {
  const key = String(countryName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+sar\s+china$/, "")
    .replace(/\s+s\.a\.r\.\s+china$/, "");
  if (!key) return [];
  return DISTRICTS_BY_COUNTRY[key] ?? [];
};

export async function searchNativeLocations(query: string, countryName: string | null | undefined): Promise<NativeLocationSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 1) return [];
  const list = districtsFor(countryName);
  if (list.length === 0) return [];
  const lower = trimmed.toLowerCase();
  const prefixed: string[] = [];
  const contained: string[] = [];
  for (const item of list) {
    const itemLower = item.toLowerCase();
    if (itemLower.startsWith(lower)) prefixed.push(item);
    else if (itemLower.includes(lower)) contained.push(item);
  }
  return [...prefixed, ...contained].slice(0, 6).map((primary) => ({ id: primary, primary, full: "" }));
}
