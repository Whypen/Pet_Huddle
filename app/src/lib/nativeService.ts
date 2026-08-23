import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseAnonKey, supabaseUrl } from "./supabase";
import { createNativeAuthenticatedHeaders, getFreshNativeAccessToken } from "./nativeFunctionClient";
import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";
import { fetchNativeEngagementTiers, type NativeEngagementSummary } from "./nativeEngagement";
import { requireCurrentNativeSession } from "./nativeSessionGuard";
import { fetchNativeChatInbox } from "./nativeChat";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import { resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";
import {
  EMPTY_PROFESSIONAL_PROFILE,
  SERVICES_OFFERED,
  PET_TYPES,
  DOG_SIZES,
  LOCATION_STYLES,
  canonicalizeSocialAlbumEntries,
  resolveSocialAlbumUrlList,
  isNativeCarerEmergencyBadgeEligible,
  normalizeCareLocationAreas,
  normalizeProfessionalProfile,
  normalizePreferredMeetupAreasFromProofMetadata,
  isVerifiedPublicCredentialLabel,
  normalizePublicCredentialBadge,
  type NativeCarerProfileViewData,
  type NativePublicCredentialBadge,
  type NativeRateRow,
} from "./nativeCarerProfile";
import type { NativeViewerScope } from "./nativeViewerScope";
import { readNativeDisplayCacheItem, readNativeDisplayCacheKeys } from "./nativeDisplayCacheStorage";

export type NativeServiceSortOption = "proximity" | "latest" | "price_low_to_high" | "price_high_to_low" | "popularity";

export type NativeServiceFilterState = {
  search: string;
  serviceTypes: string[];
  selectedWeekdays: string[];
  bookmarkedOnly: boolean;
  verifiedLicensedOnly: boolean;
  emergencyReadyOnly: boolean;
  volunteerOnly: boolean;
  petTypes: string[];
  dogSizes: string[];
  locationStyles: string[];
  sort: NativeServiceSortOption;
};

export type NativeServiceProvider = NativeCarerProfileViewData & {
  locationCountry?: string | null;
  distanceKm?: number | null;
  engagement?: NativeEngagementSummary | null;
};

const nativeServiceRpc = async <T,>(fn: string, params: Record<string, unknown>, accessToken?: string | null): Promise<{ data: T | null; error: { message?: string } | null }> => {
  const token = await getFreshNativeAccessToken(accessToken);
  if (!token) return { data: null, error: { message: "auth_required" } };
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: createNativeAuthenticatedHeaders(token, {
      "content-type": "application/json",
    }),
    body: JSON.stringify(params),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as unknown : null;
  return {
    data: response.ok ? parsed as T : null,
    error: response.ok ? null : { message: typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message?: unknown }).message) : String(raw || response.statusText) },
  };
};

export type NativeProviderRatingSummary = { avgRating: number; reviewCount: number };
export type NativeProviderReviewPreview = {
  providerId: string;
  reviewId: string;
  rating: number;
  reviewText: string;
  tags: string[];
  createdAt: string;
  reviewerDisplayName: string;
  reviewCount: number;
};

const NATIVE_PROVIDER_REVIEW_CACHE_MS = 5 * 60 * 1000;
const providerRatingSummaryCache = new Map<string, { cachedAt: number; summary: NativeProviderRatingSummary | null }>();
const providerReviewPreviewCache = new Map<string, { cachedAt: number; reviews: NativeProviderReviewPreview[] }>();

// Batch-fetch provider review averages. Returns a map keyed by provider user id.
// Only providers with >= 1 eligible review are present (RPC omits the rest), so a
// missing key means "no rating yet" => render no badge.
export async function fetchNativeProviderRatingSummaries(
  providerIds: Array<string | null | undefined>,
  accessToken?: string | null,
): Promise<Map<string, NativeProviderRatingSummary>> {
  const ids = Array.from(new Set(providerIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const result = new Map<string, NativeProviderRatingSummary>();
  if (ids.length === 0) return result;
  const now = Date.now();
  const missingIds = ids.filter((id) => {
    const cached = providerRatingSummaryCache.get(id);
    if (cached && now - cached.cachedAt < NATIVE_PROVIDER_REVIEW_CACHE_MS) {
      if (cached.summary) result.set(id, cached.summary);
      return false;
    }
    return true;
  });
  if (missingIds.length === 0) return result;
  const { data } = await nativeServiceRpc<Array<{ provider_id?: string | null; avg_rating?: number | string | null; review_count?: number | null }>>(
    "get_provider_rating_summary",
    { p_provider_ids: missingIds },
    accessToken,
  );
  if (!Array.isArray(data)) return result;
  const seenIds = new Set<string>();
  for (const row of data) {
    const id = String(row?.provider_id || "").trim();
    const avg = typeof row?.avg_rating === "number" ? row.avg_rating : Number(row?.avg_rating);
    const count = typeof row?.review_count === "number" ? row.review_count : Number(row?.review_count);
    if (id && Number.isFinite(avg) && Number.isFinite(count) && count >= 1) {
      const summary = { avgRating: avg, reviewCount: count };
      providerRatingSummaryCache.set(id, { summary, cachedAt: now });
      result.set(id, summary);
      seenIds.add(id);
    }
  }
  missingIds.forEach((id) => {
    if (!seenIds.has(id)) providerRatingSummaryCache.set(id, { summary: null, cachedAt: now });
  });
  return result;
}

export async function fetchNativeProviderReviewPreviews(
  providerIds: Array<string | null | undefined>,
  accessToken?: string | null,
  limit = 5,
): Promise<Map<string, NativeProviderReviewPreview[]>> {
  const ids = Array.from(new Set(providerIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const result = new Map<string, NativeProviderReviewPreview[]>();
  if (ids.length === 0) return result;
  const now = Date.now();
  const missingIds = ids.filter((id) => {
    const cached = providerReviewPreviewCache.get(`${id}:${limit}`);
    if (cached && now - cached.cachedAt < NATIVE_PROVIDER_REVIEW_CACHE_MS) {
      result.set(id, cached.reviews);
      return false;
    }
    return true;
  });
  if (missingIds.length === 0) return result;
  const { data } = await nativeServiceRpc<Array<{
    provider_id?: string | null;
    review_id?: string | null;
    rating?: number | string | null;
    review_text?: string | null;
    tags?: unknown;
    created_at?: string | null;
    reviewer_display_name?: string | null;
    review_count?: number | string | null;
  }>>(
    "get_provider_review_previews",
    { p_provider_ids: missingIds, p_limit: limit },
    accessToken,
  );
  if (!Array.isArray(data)) return result;
  const grouped = new Map<string, NativeProviderReviewPreview[]>();
  missingIds.forEach((id) => grouped.set(id, []));
  for (const row of data) {
    const providerId = String(row?.provider_id || "").trim();
    const reviewId = String(row?.review_id || "").trim();
    const rating = typeof row?.rating === "number" ? row.rating : Number(row?.rating);
    const reviewText = String(row?.review_text || "").trim();
    const createdAt = String(row?.created_at || "").trim();
    const reviewCount = typeof row?.review_count === "number" ? row.review_count : Number(row?.review_count);
    if (!providerId || !reviewId || !Number.isFinite(rating) || !reviewText || !createdAt) continue;
    const tags = Array.isArray(row?.tags)
      ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    const entry: NativeProviderReviewPreview = {
      providerId,
      reviewId,
      rating,
      reviewText,
      tags,
      createdAt,
      reviewerDisplayName: String(row?.reviewer_display_name || "Requester").trim() || "Requester",
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
    };
    grouped.set(providerId, [...(grouped.get(providerId) || []), entry]);
  }
  for (const [providerId, reviews] of grouped) {
    providerReviewPreviewCache.set(`${providerId}:${limit}`, { reviews, cachedAt: now });
    result.set(providerId, reviews);
  }
  return result;
}

type NativeServiceMutationOptions = {
  accessToken?: string | null;
  sessionKey?: string | null;
  userId?: string | null;
};

const normalizeNativeServiceMutationOptions = (input?: string | null | NativeServiceMutationOptions): NativeServiceMutationOptions => (
  typeof input === "string" || input === null || input === undefined ? { accessToken: input } : input
);

const requireNativeServiceMutationSession = (options: NativeServiceMutationOptions) => requireCurrentNativeSession({
  accessToken: options.accessToken,
  expectedUserId: options.userId,
  sessionKey: options.sessionKey,
});

type NativeServiceProvidersCacheEntry = {
  providers: NativeServiceProvider[];
  updatedAt: number;
};

const ALLOWED_CURRENCY_CODES = new Set(["HKD", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "JPY", "CNY"]);
const INVALID_PRICE = Number.POSITIVE_INFINITY;
const RATE_UNIT_ALIASES: Array<[RegExp, string]> = [
  [/\btraining\s+session\b/i, "session"],
  [/\bsession\b/i, "session"],
  [/\bwalk(ing)?\b/i, "walk"],
  [/\bvisit(s)?\b/i, "visit"],
  [/\bnight\b/i, "night"],
  [/\bday\s*care\b/i, "day"],
  [/\bday\b/i, "day"],
  [/\bhour(s)?\b/i, "hour"],
  [/\bweek(s)?\b/i, "week"],
];

export const NATIVE_SERVICE_TYPES = SERVICES_OFFERED;
export const NATIVE_SERVICE_PET_TYPES = PET_TYPES;
export const NATIVE_SERVICE_DOG_SIZES = DOG_SIZES;
export const NATIVE_SERVICE_LOCATION_STYLES = LOCATION_STYLES;

export const DEFAULT_NATIVE_SERVICE_FILTERS: NativeServiceFilterState = {
  search: "",
  serviceTypes: [],
  selectedWeekdays: [],
  bookmarkedOnly: false,
  verifiedLicensedOnly: false,
  emergencyReadyOnly: false,
  volunteerOnly: false,
  petTypes: [],
  dogSizes: [],
  locationStyles: [],
  sort: "proximity",
};

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

const normalizeCountryKey = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return COUNTRY_ALIASES[normalized] || normalized;
};

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

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const isProofMetadata = (value: unknown): value is Record<string, Record<string, string>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => !entry || (typeof entry === "object" && !Array.isArray(entry)));
};
const NATIVE_SERVICE_PROVIDERS_STALE_MS = 5 * 60 * 1000;
const NATIVE_SERVICE_PROVIDER_VIEW_THROTTLE_MS = 24 * 60 * 60 * 1000;
const nativeServiceProvidersCache = new Map<string, NativeServiceProvidersCacheEntry>();
const nativeServiceProvidersInFlight = new Map<string, Promise<NativeServiceProvider[]>>();
const nativeServiceProviderDetailCache = new Map<string, { provider: NativeServiceProvider; updatedAt: number | null; cachedAt: number }>();
const nativeServiceProviderViewCache = new Map<string, number>();
const socialAlbumUrlCache = new Map<string, string[]>();
const activeServiceProviderIdsCache = new Map<string, { providerIds: Set<string>; cachedAt: number }>();

const nativeServicePersistentCacheKey = (kind: "cards" | "detail", key: string) => `native-service:${kind}:v3:${key}`;
const nativeServiceCacheSessionKey = (userId: string | null, sessionKey?: string | null) => String(sessionKey || (userId ? `${userId}:0` : "anon:0"));

const readNativeServicePersistentCache = async <T,>(key: string): Promise<{ value: T; updatedAt: number } | null> => {
  try {
    const raw = await readNativeDisplayCacheItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: number; value?: T };
    if (typeof parsed.updatedAt !== "number" || Date.now() - parsed.updatedAt > NATIVE_SERVICE_PROVIDERS_STALE_MS || parsed.value === undefined) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return { value: parsed.value, updatedAt: parsed.updatedAt };
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
};

const writeNativeServicePersistentCache = async <T,>(key: string, value: T, updatedAt = Date.now()) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ updatedAt, value }));
  } catch {
    // AsyncStorage can be unavailable in constrained dev/runtime contexts.
  }
};

const buildNativeServiceProvidersCacheKey = (options: {
  userId: string | null;
  sessionKey?: string | null;
  anchor?: { lat: number; lng: number } | null;
  viewerCountry?: string | null;
  viewerScope?: NativeViewerScope | null;
}) => JSON.stringify({
  userId: options.userId ?? null,
  sessionKey: nativeServiceCacheSessionKey(options.userId, options.sessionKey),
  lat: options.anchor && Number.isFinite(options.anchor.lat) ? Number(options.anchor.lat.toFixed(3)) : null,
  lng: options.anchor && Number.isFinite(options.anchor.lng) ? Number(options.anchor.lng.toFixed(3)) : null,
  viewerCountry: normalizeCountryKey(options.viewerCountry),
  viewerCity: String(options.viewerScope?.city || "").trim().toLowerCase() || null,
  viewerDistrict: String(options.viewerScope?.district || "").trim().toLowerCase() || null,
});

export const writeNativeServiceProvidersCache = (
  options: {
    userId: string | null;
    sessionKey?: string | null;
    anchor?: { lat: number; lng: number } | null;
    viewerCountry?: string | null;
    viewerScope?: NativeViewerScope | null;
  },
  providers: NativeServiceProvider[],
  updatedAt = Date.now(),
) => {
  const cacheKey = buildNativeServiceProvidersCacheKey(options);
  nativeServiceProvidersCache.set(cacheKey, {
    providers,
    updatedAt,
  });
  void writeNativeServicePersistentCache(nativeServicePersistentCacheKey("cards", cacheKey), providers, updatedAt);
};

export const readNativeServiceProvidersCache = (options: {
  userId: string | null;
  sessionKey?: string | null;
  anchor?: { lat: number; lng: number } | null;
  viewerCountry?: string | null;
  viewerScope?: NativeViewerScope | null;
}) => {
  const cached = nativeServiceProvidersCache.get(buildNativeServiceProvidersCacheKey(options));
  return cached && Date.now() - cached.updatedAt < NATIVE_SERVICE_PROVIDERS_STALE_MS ? cached : null;
};

export const readNativeServiceProvidersAsyncCache = async (options: {
  userId: string | null;
  sessionKey?: string | null;
  anchor?: { lat: number; lng: number } | null;
  viewerCountry?: string | null;
  viewerScope?: NativeViewerScope | null;
}) => {
  const cacheKey = buildNativeServiceProvidersCacheKey(options);
  const persistent = await readNativeServicePersistentCache<NativeServiceProvider[]>(nativeServicePersistentCacheKey("cards", cacheKey));
  if (!persistent) return null;
  nativeServiceProvidersCache.set(cacheKey, { providers: persistent.value, updatedAt: persistent.updatedAt });
  return { providers: persistent.value, updatedAt: persistent.updatedAt };
};

export const invalidateNativeServiceProviderCaches = async (userId?: string | null) => {
  const cleanUserId = String(userId || "").trim();
  nativeServiceProvidersCache.clear();
  nativeServiceProviderDetailCache.clear();
  activeServiceProviderIdsCache.clear();
  providerRatingSummaryCache.clear();
  providerReviewPreviewCache.clear();
  try {
    const keys = await readNativeDisplayCacheKeys();
    const removals = keys.filter((key) => {
      if (!key.startsWith("native-service:")) return false;
      if (!cleanUserId) return true;
      return key.includes(`"userId":"${cleanUserId}"`) || key.includes(`:${cleanUserId}:`) || key.includes(cleanUserId);
    });
    if (removals.length > 0) await AsyncStorage.multiRemove(removals);
  } catch {
    // Cache invalidation is best-effort; server filtering remains authoritative.
  }
};

const fetchActiveServiceProviderIdsForViewer = async (userId: string | null, accessToken?: string | null) => {
  if (!userId) return new Set<string>();
  const cached = activeServiceProviderIdsCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < 30_000) return cached.providerIds;
  const { data, error } = await nativeServiceRpc<Array<{ provider_id?: string | null }>>("get_active_service_provider_ids_for_viewer", {}, accessToken);
  const rows = !error && Array.isArray(data)
    ? data
    : await fetchNativeChatInbox({
      userId,
      accessToken,
      sessionKey: `${userId}:service-provider-exclusion`,
      scope: "service",
      onlyWithActivity: null,
      limit: 200,
      force: true,
      forceDb: true,
    }).catch(() => []);
  const providerIds = new Set(rows.map((row) => {
    const record = row as { provider_id?: string | null; serviceProviderId?: string | null };
    return String(record.provider_id || record.serviceProviderId || "");
  }).filter(Boolean));
  activeServiceProviderIdsCache.set(userId, { providerIds, cachedAt: Date.now() });
  return providerIds;
};

const parsePositiveNumber = (value: string) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : INVALID_PRICE;
};

const normalizeNativeServiceRateUnit = (raw: string) => {
  const input = String(raw || "").trim().toLowerCase();
  if (!input) return "";
  const noPerPrefix = input.replace(/^\s*per\s+/, "");
  for (const [pattern, normalized] of RATE_UNIT_ALIASES) {
    if (pattern.test(noPerPrefix)) return normalized;
  }
  return "visit";
};

const parseLegacyRateString = (raw: string): NativeRateRow | null => {
  const input = String(raw || "").trim();
  if (!input) return null;
  const compact = input.replace(/\s+/g, " ").trim();
  const priceMatch = compact.match(/(?:HKD|USD|EUR|GBP|AUD|CAD|SGD|JPY|CNY|\$)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!priceMatch) return null;
  const price = priceMatch[1] ?? "";
  const unit = normalizeNativeServiceRateUnit(compact.replace(/^.*?\bper\b/i, "").trim() || compact);
  if (!price || !unit) return null;
  return { price, rate: unit, services: [], voluntary: false };
};

const resolveNativeServiceAlbumUrls = async (albumRaw: string[]) => {
  if (albumRaw.length === 0) return [];
  const cacheKey = albumRaw.join("|");
  const cached = socialAlbumUrlCache.get(cacheKey);
  if (cached) return cached;
  const urls = await resolveSocialAlbumUrlList(albumRaw);
  socialAlbumUrlCache.set(cacheKey, urls);
  return urls;
};

const profileAvatarSource = (profile: Record<string, unknown> | null | undefined) => {
  const avatar = profile?.avatar_url;
  if (typeof avatar === "string" && avatar.trim()) return avatar;
  return null;
};

const resolveNativeProfileAvatarUrl = async (value: unknown) => {
  return resolveNativeProfileImageUrlAsync(value, 60 * 60, { defaultBucket: "profile_photos" });
};

const parseRateRow = (raw: string): NativeRateRow => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.price === "string" && typeof record.rate === "string") {
        return {
          price: record.price,
          rate: normalizeNativeServiceRateUnit(record.rate),
          services: isStringArray(record.services) ? record.services : [],
          voluntary: record.voluntary === true,
        };
      }
    }
  } catch {
    // Legacy rows can store a plain rate string.
  }
  const legacy = parseLegacyRateString(raw);
  if (legacy) return legacy;
  return { price: "", rate: normalizeNativeServiceRateUnit(raw), services: [], voluntary: false };
};

const mapProviderRow = (
  row: Record<string, unknown>,
  profileData: Record<string, unknown> | null | undefined,
  albumUrls: string[],
  isBookmarked: boolean,
): NativeServiceProvider => {
  const profile = profileData ?? {};
  const servicesOffered = isStringArray(row.services_offered) ? row.services_offered : [];
  const firstPrice = row.starting_price != null ? String(row.starting_price) : "";
  const dbRates = isStringArray(row.rates) ? row.rates : [];
  const rateRows = dbRates.length === 0
    ? [{ price: firstPrice, rate: firstPrice ? "visit" : "", services: servicesOffered, voluntary: false }]
    : dbRates.map((entry, index) => {
        const parsed = parseRateRow(entry);
        if (index === 0 && parsed.price === "") parsed.price = firstPrice;
        if (parsed.services.length === 0) {
          const serviceAtIndex = servicesOffered[index];
          parsed.services = serviceAtIndex ? [serviceAtIndex] : servicesOffered;
        }
        return parsed;
      });
  const pricedRows = rateRows.filter((rate) => rate.price !== "" && parsePositiveNumber(rate.price) !== INVALID_PRICE && rate.rate !== "");
  const lowestRate = pricedRows.length > 0
    ? pricedRows.reduce((min, rate) => parsePositiveNumber(rate.price) < parsePositiveNumber(min.price) ? rate : min)
    : null;
  const locationStyles = isStringArray(row.location_styles) ? row.location_styles : [];
  const hasCarerPlace = locationStyles.includes("Carer's Place");
  const preferredMeetupAreas = normalizeCareLocationAreas(row.preferred_meetup_areas);
  const verificationStatus =
    typeof profile.verification_status === "string" && profile.verification_status.trim()
      ? profile.verification_status.trim()
      : isNativeVerifiedProfile(profile)
        ? "verified"
        : null;

  return {
    userId: String(row.user_id ?? ""),
    displayName: String(profile.display_name ?? "Pet Carer"),
    avatarUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
    locationCountry: typeof profile.location_country === "string" ? profile.location_country : null,
    socialAlbumUrls: albumUrls,
    publicCredentialBadges: Array.isArray(row.public_credential_badges)
      ? row.public_credential_badges
          .map(normalizePublicCredentialBadge)
          .filter((badge): badge is NativePublicCredentialBadge => Boolean(badge))
      : [],
    hasCar: profile.has_car === true,
    verificationStatus,
    isBookmarked,
    viewCount: 0,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    story: String(row.story ?? ""),
    skills: isStringArray(row.skills) ? row.skills : [],
    proofMetadata: row.proof_metadata && typeof row.proof_metadata === "object" ? (row.proof_metadata as Record<string, unknown>) : {},
    professional: normalizeProfessionalProfile(row.proof_metadata && typeof row.proof_metadata === "object" ? (row.proof_metadata as Record<string, unknown>).professional : EMPTY_PROFESSIONAL_PROFILE),
    vetLicenseFound: typeof row.vet_license_found === "boolean" ? row.vet_license_found : null,
    days: isStringArray(row.days) ? row.days : [],
    timeBlocks: isStringArray(row.time_blocks) ? row.time_blocks : [],
    otherTimeFrom: String(row.other_time_from ?? ""),
    otherTimeTo: String(row.other_time_to ?? ""),
    emergencyReadiness: typeof row.emergency_readiness === "boolean" ? row.emergency_readiness : null,
    minNoticeValue: row.min_notice_value != null ? String(row.min_notice_value) : "",
    minNoticeUnit: row.min_notice_unit === "days" ? "days" : "hours",
    locationStyles,
    areaName: hasCarerPlace ? String(row.area_name ?? "") : "",
    areaCountry: hasCarerPlace ? String(row.area_country ?? "") : "",
    areaLat: hasCarerPlace && typeof row.area_lat === "number" && Number.isFinite(row.area_lat) ? row.area_lat : null,
    areaLng: hasCarerPlace && typeof row.area_lng === "number" && Number.isFinite(row.area_lng) ? row.area_lng : null,
    preferredMeetupAreas: preferredMeetupAreas.length > 0 ? preferredMeetupAreas : normalizePreferredMeetupAreasFromProofMetadata(row.proof_metadata),
    servicesOffered,
    servicesOther: String(row.services_other ?? ""),
    petTypes: isStringArray(row.pet_types) ? row.pet_types : [],
    petTypesOther: String(row.pet_types_other ?? ""),
    dogSizes: isStringArray(row.dog_sizes) ? row.dog_sizes : [],
    currency: ALLOWED_CURRENCY_CODES.has(String(row.currency ?? "").toUpperCase().trim()) ? String(row.currency ?? "").toUpperCase().trim() : "",
    startingPrice: lowestRate?.price ?? null,
    startingPriceRateUnit: lowestRate ? normalizeNativeServiceRateUnit(lowestRate.rate) : null,
    rateRows,
    stripePayoutStatus: null,
    stripeAccountId: "",
    stripeDetailsSubmitted: false,
    stripePayoutsEnabled: false,
    stripeRequirementsCurrentlyDue: [],
    hasStripeAccount: false,
    agreementAccepted: false,
    agreementAcceptedAt: null,
    listed: row.listed !== false,
    serviceRankWeight: 0,
    engagement: null,
  };
};

export async function fetchNativeServiceProviders(options: {
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  anchor?: { lat: number; lng: number } | null;
  viewerCountry?: string | null;
  viewerScope?: NativeViewerScope | null;
  force?: boolean;
  cacheWriteGuard?: () => boolean;
}): Promise<NativeServiceProvider[]> {
  const { userId, accessToken = null, sessionKey = null, anchor = null, viewerCountry = null, viewerScope = null, force = false, cacheWriteGuard } = options;
  const cacheKey = buildNativeServiceProvidersCacheKey({ userId, sessionKey, anchor, viewerCountry, viewerScope });
  const cached = nativeServiceProvidersCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.updatedAt < NATIVE_SERVICE_PROVIDERS_STALE_MS) {
    if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_CACHE_HIT", { cacheKey, count: cached.providers.length });
    return cached.providers;
  }
  if (!force) {
    const persistent = await readNativeServicePersistentCache<NativeServiceProvider[]>(nativeServicePersistentCacheKey("cards", cacheKey));
    if (persistent) {
      nativeServiceProvidersCache.set(cacheKey, { providers: persistent.value, updatedAt: persistent.updatedAt });
      if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_ASYNC_CACHE_HIT", { cacheKey, count: persistent.value.length });
      return persistent.value;
    }
  }
  const existing = nativeServiceProvidersInFlight.get(cacheKey);
  if (existing) return existing;
  const request: Promise<NativeServiceProvider[]> = (async () => {
  if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_CACHE_MISS", { cacheKey, force });
  const { data: rows, error: rowsError } = await nativeServiceRpc<Array<Record<string, unknown>>>("get_native_service_provider_cards", {
      p_lat: anchor && Number.isFinite(anchor.lat) ? anchor.lat : null,
      p_lng: anchor && Number.isFinite(anchor.lng) ? anchor.lng : null,
      p_viewer_country: viewerCountry,
      p_viewer_scope: viewerScope ? {
        city: viewerScope.city,
        country: viewerScope.countryName ?? viewerScope.country,
        countryCode: viewerScope.countryCode,
        district: viewerScope.district,
        lat: anchor && Number.isFinite(anchor.lat) ? anchor.lat : null,
        lng: anchor && Number.isFinite(anchor.lng) ? anchor.lng : null,
        source: viewerScope.source,
      } : null,
    }, accessToken);
  if (rowsError) throw rowsError;

  const providerRows = rows ?? [];
  if (providerRows.length === 0) {
    if (cacheWriteGuard?.() !== false) writeNativeServiceProvidersCache({ userId, sessionKey, anchor, viewerCountry, viewerScope }, []);
    return [];
  }
  // Both reads are derived from `providerRows`/`userId` and never from each other, so the
  // card grid should not wait for one round trip to finish before starting the next.
  const [activeServiceProviderIds, engagementByUserId] = await Promise.all([
    fetchActiveServiceProviderIdsForViewer(userId, accessToken),
    fetchNativeEngagementTiers(providerRows.map((row) => String(row.user_id ?? "")), accessToken),
  ]);

  const mapped = (await Promise.all(providerRows.map(async (row) => {
    const providerUserId = String(row.user_id ?? "");
    if (!providerUserId) return null;
    if (activeServiceProviderIds.has(providerUserId)) return null;
    const avatarUrl = await resolveNativeProfileAvatarUrl(profileAvatarSource(row));
    const provider = mapProviderRow(row, { ...row, avatar_url: avatarUrl }, [], row.is_bookmarked === true);
    provider.distanceKm = typeof row.distance_km === "number" && Number.isFinite(row.distance_km) ? row.distance_km : null;
    provider.engagement = engagementByUserId.get(providerUserId) ?? null;
    return provider;
  }))).filter((provider): provider is NativeServiceProvider => Boolean(provider));

  const nextProviders = mapped.filter((provider) => {
    const viewerCountryKey = normalizeCountryKey(viewerCountry);
    if (viewerCountryKey && normalizeCountryKey(provider.locationCountry) !== viewerCountryKey) return false;
    return true;
  });
  if (cacheWriteGuard?.() !== false) writeNativeServiceProvidersCache({ userId, sessionKey, anchor, viewerCountry, viewerScope }, nextProviders);
  return nextProviders;
  })();
  nativeServiceProvidersInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (nativeServiceProvidersInFlight.get(cacheKey) === request) nativeServiceProvidersInFlight.delete(cacheKey);
  }
}

export async function fetchNativeServiceProviderDetail(options: {
  userId: string | null;
  accessToken?: string | null;
  sessionKey?: string | null;
  providerUserId: string;
  updatedAt?: string | null;
  force?: boolean;
  cacheWriteGuard?: () => boolean;
  onCachedProvider?: (provider: NativeServiceProvider) => void;
}): Promise<NativeServiceProvider | null> {
  const { userId, accessToken = null, sessionKey = null, providerUserId, updatedAt = null, force = false, cacheWriteGuard, onCachedProvider } = options;
  void userId;
  const detailCacheKey = `serviceProviderDetail:v3:${userId || "anon"}:${nativeServiceCacheSessionKey(userId, sessionKey)}:${providerUserId}:${updatedAt || "unknown"}`;
  const cachedDetail = nativeServiceProviderDetailCache.get(detailCacheKey);
  if (cachedDetail && Date.now() - cachedDetail.cachedAt < NATIVE_SERVICE_PROVIDERS_STALE_MS) {
    if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_DETAIL_CACHE_HIT", { detailCacheKey });
    if (!force) return cachedDetail.provider;
    onCachedProvider?.(cachedDetail.provider);
  }
  const persistentDetail = await readNativeServicePersistentCache<NativeServiceProvider>(nativeServicePersistentCacheKey("detail", detailCacheKey));
  if (persistentDetail && Date.now() - persistentDetail.updatedAt < NATIVE_SERVICE_PROVIDERS_STALE_MS) {
    nativeServiceProviderDetailCache.set(detailCacheKey, {
      provider: persistentDetail.value,
      updatedAt: persistentDetail.value.updatedAt ? Date.parse(persistentDetail.value.updatedAt) : null,
      cachedAt: persistentDetail.updatedAt,
    });
    if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_DETAIL_ASYNC_CACHE_HIT", { detailCacheKey });
    if (!force) return persistentDetail.value;
    onCachedProvider?.(persistentDetail.value);
  }
  if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_DETAIL_CACHE_MISS", { detailCacheKey });
  const { data: row, error: rowError } = await nativeServiceRpc<Record<string, unknown>>("get_native_service_provider_detail", {
    p_provider_user_id: providerUserId,
  }, accessToken);
  if (rowError) throw rowError;
  if (!row) return null;

  const albumRaw = canonicalizeSocialAlbumEntries(isStringArray(row.social_album) ? row.social_album : []);
  const [albumUrls, avatarUrl] = await Promise.all([
    resolveNativeServiceAlbumUrls(albumRaw),
    resolveNativeProfileAvatarUrl(profileAvatarSource(row)),
  ]);
  const provider = mapProviderRow(row as unknown as Record<string, unknown>, { ...row, avatar_url: avatarUrl }, albumUrls, row.is_bookmarked === true);
  provider.distanceKm = typeof row.distance_km === "number" && Number.isFinite(row.distance_km) ? row.distance_km : null;
  provider.engagement = (await fetchNativeEngagementTiers([provider.userId], accessToken)).get(provider.userId) ?? null;
  if (cacheWriteGuard?.() !== false) {
    nativeServiceProviderDetailCache.set(detailCacheKey, { provider, updatedAt: provider.updatedAt ? Date.parse(provider.updatedAt) : null, cachedAt: Date.now() });
    void writeNativeServicePersistentCache(nativeServicePersistentCacheKey("detail", detailCacheKey), provider, Date.now());
  }
  return provider;
}

const includesAny = (haystack: string[], needles: string[]) => {
  if (needles.length === 0) return true;
  const set = new Set(haystack);
  return needles.some((item) => set.has(item));
};

const includesAll = (haystack: string[], needles: string[]) => {
  if (needles.length === 0) return true;
  const set = new Set(haystack);
  return needles.every((item) => set.has(item));
};

export const hasNativeServiceCertifiedProof = (provider: NativeServiceProvider) => {
  if (provider.publicCredentialBadges.some((badge) => isVerifiedPublicCredentialLabel(badge.publicLabel))) return true;
  if (provider.vetLicenseFound === true) return true;
  return false;
};

export const isNativeServiceAvailableWithinTwoHours = (provider: NativeServiceProvider) => {
  return isNativeCarerEmergencyBadgeEligible(provider);
};

const matchServiceTypes = (provider: NativeServiceProvider, selected: string[]) => {
  if (selected.length === 0) return true;
  const providerServices = new Set(provider.servicesOffered);
  return selected.some((serviceType) => (SERVICE_TYPE_MAP[serviceType] ?? [serviceType]).some((alias) => providerServices.has(alias)));
};

const latestTime = (provider: NativeServiceProvider) => {
  const timestamp = new Date(provider.updatedAt ?? provider.createdAt ?? "").getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const normalizeNativeServiceSearchText = (value: unknown) => (
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
);

const providerMatchesSearch = (provider: NativeServiceProvider, raw: string) => {
  const tokens = normalizeNativeServiceSearchText(raw)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const rateSearch = provider.rateRows.map((row) => `${row.price} ${row.rate} ${row.services.join(" ")}`).join(" ");
  const proofLabels = Object.entries(provider.proofMetadata ?? {})
    .filter(([, meta]) => Boolean(meta && typeof meta === "object" && !Array.isArray(meta) && Object.values(meta).some((value) => String(value ?? "").trim().length > 0)))
    .map(([skill]) => skill)
    .join(" ");
  const serviceAliases = provider.servicesOffered.flatMap((service) => SERVICE_TYPE_MAP[service] ?? [service]).join(" ");
  const text = normalizeNativeServiceSearchText([
    provider.displayName,
    provider.areaName,
    provider.locationCountry,
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
    provider.vetLicenseFound ? "licensed vet veterinarian verified proof" : "",
    provider.verificationStatus,
    rateSearch,
    proofLabels,
  ].join(" "));
  return tokens.every((token) => text.includes(token));
};

export function filterAndSortNativeServiceProviders(providers: NativeServiceProvider[], filters: NativeServiceFilterState) {
  const filtered = providers.filter((provider) => {
    if (!providerMatchesSearch(provider, filters.search)) return false;
    if (!matchServiceTypes(provider, filters.serviceTypes)) return false;
    if (!includesAll(provider.days, filters.selectedWeekdays)) return false;
    if (filters.bookmarkedOnly && !provider.isBookmarked) return false;
    if (filters.verifiedLicensedOnly && !hasNativeServiceCertifiedProof(provider)) return false;
    if (filters.emergencyReadyOnly && !isNativeServiceAvailableWithinTwoHours(provider)) return false;
    if (filters.volunteerOnly && !provider.rateRows.some((row) => row.voluntary === true)) return false;
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
        if (b.serviceRankWeight !== a.serviceRankWeight) return b.serviceRankWeight - a.serviceRankWeight;
        return latestTime(b) - latestTime(a);
      });
    case "price_low_to_high":
      return [...filtered].sort((a, b) => {
        const ap = a.startingPrice ? Number.parseFloat(a.startingPrice) : Number.POSITIVE_INFINITY;
        const bp = b.startingPrice ? Number.parseFloat(b.startingPrice) : Number.POSITIVE_INFINITY;
        if (ap !== bp) return ap - bp;
        return b.serviceRankWeight - a.serviceRankWeight;
      });
    case "price_high_to_low":
      return [...filtered].sort((a, b) => {
        const ap = a.startingPrice ? Number.parseFloat(a.startingPrice) : Number.NEGATIVE_INFINITY;
        const bp = b.startingPrice ? Number.parseFloat(b.startingPrice) : Number.NEGATIVE_INFINITY;
        if (bp !== ap) return bp - ap;
        return b.serviceRankWeight - a.serviceRankWeight;
      });
    case "popularity":
      return [...filtered].sort((a, b) => b.viewCount - a.viewCount || b.serviceRankWeight - a.serviceRankWeight);
    case "latest":
    default:
      return [...filtered].sort((a, b) => latestTime(b) - latestTime(a) || b.serviceRankWeight - a.serviceRankWeight);
  }
}

export async function toggleNativeServiceBookmark(userId: string, providers: NativeServiceProvider[], providerUserId: string, optionsInput?: string | null | NativeServiceMutationOptions) {
  const options = normalizeNativeServiceMutationOptions(optionsInput);
  const session = requireNativeServiceMutationSession({ ...options, userId });
  if (!providerUserId) throw new Error("missing_provider");
  const { data: nextBookmarked, error } = await nativeServiceRpc<boolean>("toggle_native_service_bookmark", {
    p_provider_user_id: providerUserId,
  }, session.accessToken);
  if (error) throw error;
  return providers.map((provider) => (
    provider.userId === providerUserId ? { ...provider, isBookmarked: nextBookmarked === true } : provider
  ));
}

export async function incrementNativeServiceProviderView(providerUserId: string, viewerUserId?: string | null, optionsInput?: string | null | NativeServiceMutationOptions) {
  const options = normalizeNativeServiceMutationOptions(optionsInput);
  const session = requireNativeServiceMutationSession({ ...options, userId: viewerUserId });
  const throttleKey = `${session.userId}:${providerUserId}`;
  const lastViewedAt = nativeServiceProviderViewCache.get(throttleKey);
  if (lastViewedAt && Date.now() - lastViewedAt < NATIVE_SERVICE_PROVIDER_VIEW_THROTTLE_MS) {
    if (__DEV__) console.log("NATIVE_SERVICE_PROVIDER_VIEW_THROTTLE_HIT", { throttleKey });
    return;
  }
  const { error } = await nativeServiceRpc<boolean>("record_native_service_provider_view", {
    p_provider_user_id: providerUserId,
  }, session.accessToken);
  if (error) throw error;
  nativeServiceProviderViewCache.set(throttleKey, Date.now());
}

export async function createNativeServiceChat(providerUserId: string, optionsInput?: string | null | NativeServiceMutationOptions) {
  const options = normalizeNativeServiceMutationOptions(optionsInput);
  const session = requireNativeServiceMutationSession(options);
  if (!providerUserId) throw new Error("missing_provider");
  const { data, error } = await nativeServiceRpc<string>("create_native_service_chat", {
    p_provider_user_id: providerUserId,
  }, session.accessToken);
  if (error) throw error;
  const chatId = String(data || "").trim();
  if (!chatId) throw new Error("service_chat_create_returned_empty_chat_id");
  return chatId;
}

export async function recordNativeServiceAnalytics(event: string, payload: Record<string, unknown>, options: NativeServiceMutationOptions = {}) {
  const session = requireNativeServiceMutationSession(options);
  if (!event.trim()) throw new Error("missing_event");
  const { error } = await nativeServiceRpc<boolean>("record_native_service_analytics", {
    p_event: event,
    p_payload: payload,
  }, session.accessToken);
  if (error) throw error;
}
