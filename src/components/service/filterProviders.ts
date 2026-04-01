import { PROOF_CONFIG, SKILLS_GROUP_B_LIST } from "./carerServiceConstants";
import type { ProviderSummary } from "./types";

export type ServiceSortOption =
  | "proximity"
  | "latest"
  | "price_low_to_high"
  | "price_high_to_low"
  | "popularity";

export interface ServiceFilterState {
  search: string;
  serviceTypes: string[];
  selectedWeekdays: string[];
  bookmarkedOnly: boolean;
  verifiedLicensedOnly: boolean;
  emergencyReadyOnly: boolean;
  petTypes: string[];
  dogSizes: string[];
  locationStyles: string[];
  sort: ServiceSortOption;
}

// Aliases: canonical filter names map to any legacy stored service values.
const SERVICE_TYPE_MAP: Record<string, string[]> = {
  Boarding: ["Boarding", "Dog Boarding"],
  Walking: ["Walking", "Dog Walking"],
  "Day Care": ["Day Care", "Dog Day Care"],
  "Drop-in": ["Drop-in", "Drop-in Visits"],
  Grooming: ["Grooming", "Mobile Grooming", "Nail Trimming"],
  Training: ["Training"],
  "Vet / Licensed Care": ["Vet / Licensed Care", "Vet Care", "Medical Care", "Medication Administration", "Senior Pet Care", "Palliative Care"],
  Transport: ["Transport", "Home Visits"],
  "Emergency Help": ["Emergency Help", "Emergency"],
  Others: ["Others"],
};

function hasCertifiedProof(provider: ProviderSummary): boolean {
  for (const skill of provider.skills) {
    if (!(SKILLS_GROUP_B_LIST as readonly string[]).includes(skill)) continue;
    const cfg = PROOF_CONFIG[skill as keyof typeof PROOF_CONFIG];
    if (!cfg) continue;
    const rawMeta = provider.proofMetadata?.[skill];
    const meta =
      rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, unknown>)
        : {};
    const ok = cfg.fields.every((field) => String(meta[field.key] ?? "").trim().length > 0);
    if (ok) return true;
  }
  return false;
}

function includesAny(haystack: string[], needles: string[]): boolean {
  if (needles.length === 0) return true;
  const set = new Set(haystack);
  return needles.some((item) => set.has(item));
}

function includesAll(haystack: string[], needles: string[]): boolean {
  if (needles.length === 0) return true;
  const set = new Set(haystack);
  return needles.every((item) => set.has(item));
}

function matchServiceTypes(provider: ProviderSummary, selected: string[]): boolean {
  if (selected.length === 0) return true;
  const providerServices = new Set(provider.servicesOffered);
  return selected.some((serviceType) => {
    const aliases = SERVICE_TYPE_MAP[serviceType] ?? [serviceType];
    return aliases.some((alias) => providerServices.has(alias));
  });
}

function toLatestTime(provider: ProviderSummary): number {
  const source = provider.updatedAt ?? provider.createdAt;
  if (!source) return 0;
  const timestamp = new Date(source).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function matchSearch(provider: ProviderSummary, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const rateSearchable = provider.rateRows
    .map((row) => `${row.price} ${row.rate} ${(row.services ?? []).join(" ")}`)
    .join(" ");
  const proofSearchable = Object.values(provider.proofMetadata ?? {})
    .map((meta) => Object.values(meta ?? {}).join(" "))
    .join(" ");
  // Expand service aliases so e.g. "Licensed Vet" matches "Vet / Licensed Care"
  const serviceAliases = provider.servicesOffered
    .flatMap((s) => SERVICE_TYPE_MAP[s] ?? [s])
    .join(" ");
  const text = [
    provider.displayName,
    provider.areaName,
    provider.story,
    provider.skills.join(" "),
    provider.servicesOffered.join(" "),
    serviceAliases,
    provider.servicesOther,
    provider.petTypes.join(" "),
    provider.petTypesOther,
    provider.dogSizes.join(" "),
    provider.locationStyles.join(" "),
    provider.days.join(" "),
    provider.timeBlocks.join(" "),
    provider.otherTimeFrom,
    provider.otherTimeTo,
    provider.minNoticeValue,
    provider.minNoticeUnit,
    provider.currency,
    provider.startingPrice,
    provider.startingPriceRateUnit,
    provider.emergencyReadiness ? "emergency emergency ready urgent" : "",
    provider.hasCar ? "car transport" : "",
    rateSearchable,
    proofSearchable,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(q);
}

export function filterAndSortProviders(
  providers: ProviderSummary[],
  filters: ServiceFilterState,
): ProviderSummary[] {
  const filtered = providers.filter((provider) => {
    if (!matchSearch(provider, filters.search)) return false;
    if (!matchServiceTypes(provider, filters.serviceTypes)) return false;
    if (!includesAll(provider.days, filters.selectedWeekdays)) return false;
    if (filters.bookmarkedOnly && !provider.isBookmarked) return false;
    if (filters.verifiedLicensedOnly && !hasCertifiedProof(provider)) return false;
    if (filters.emergencyReadyOnly && provider.emergencyReadiness !== true) return false;
    if (!includesAny(provider.petTypes, filters.petTypes)) return false;
    if (!includesAny(provider.dogSizes, filters.dogSizes)) return false;
    if (!includesAny(provider.locationStyles, filters.locationStyles)) return false;
    return true;
  });

  switch (filters.sort) {
    case "proximity":
      return [...filtered].sort((a, b) => {
        const ad = typeof a.distanceKm === "number" && Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
        const bd = typeof b.distanceKm === "number" && Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return toLatestTime(b) - toLatestTime(a);
      });
    case "price_low_to_high":
      return [...filtered].sort((a, b) => {
        const ap = a.startingPrice ? Number.parseFloat(a.startingPrice) : Number.POSITIVE_INFINITY;
        const bp = b.startingPrice ? Number.parseFloat(b.startingPrice) : Number.POSITIVE_INFINITY;
        return ap - bp;
      });
    case "price_high_to_low":
      return [...filtered].sort((a, b) => {
        const ap = a.startingPrice ? Number.parseFloat(a.startingPrice) : Number.NEGATIVE_INFINITY;
        const bp = b.startingPrice ? Number.parseFloat(b.startingPrice) : Number.NEGATIVE_INFINITY;
        return bp - ap;
      });
    case "popularity":
      return [...filtered].sort((a, b) => b.viewCount - a.viewCount);
    case "latest":
    default:
      return [...filtered].sort((a, b) => toLatestTime(b) - toLatestTime(a));
  }
}
