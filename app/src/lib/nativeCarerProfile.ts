import { supabase } from "./supabase";
import { resolveNativeProfileImageUrlAsync } from "./nativeStorageUrlCache";
import { isNativeVerifiedProfile } from "./nativeVerificationGate";
import { isVerifiedPublicCredentialLabel, normalizePublicCredentialLabel } from "./nativeCredentialStatus";

export { isVerifiedPublicCredentialLabel } from "./nativeCredentialStatus";

export type NativeRateRow = {
  price: string;
  rate: string;
  services: string[];
  voluntary?: boolean;
};

export type NativeCareLocationArea = {
  country: string;
  label: string;
  lat: number | null;
  lng: number | null;
};

export type NativeProfessionalCredential = {
  professional_type: string;
  country_region: string;
  name_on_certificate: string;
  license_number: string;
  issuing_body: string;
  expiry_date: string;
};

export type NativeProfessionalProfile = {
  enabled: boolean;
  roles: string[];
  has_credentials: boolean;
  credentials: NativeProfessionalCredential[];
};

export type NativePublicCredentialBadgeLabel =
  | "Self-declared"
  | "Registry matched"
  | "Certificate matched"
  | "Organization matched"
  | "Directory matched";

export type NativePublicCredentialBadge = {
  credentialType: string;
  publicLabel: NativePublicCredentialBadgeLabel;
  sourceType: string | null;
  sourceName: string | null;
  checkedAt: string | null;
  maskedIdentifier: string | null;
  caveat: string | null;
};

export type NativeWalletStatus = "pending" | "needs_action" | "complete" | null;
export type NativeWalletUiState = "none" | "incomplete" | "review" | "connected";

export type NativeCarerProfileData = {
  story: string;
  skills: string[];
  proofMetadata: Record<string, unknown>;
  professional: NativeProfessionalProfile;
  vetLicenseFound: boolean | null;
  days: string[];
  timeBlocks: string[];
  otherTimeFrom: string;
  otherTimeTo: string;
  emergencyReadiness: boolean | null;
  minNoticeValue: string;
  minNoticeUnit: "hours" | "days";
  locationStyles: string[];
  areaName: string;
  areaCountry: string;
  areaLat: number | null;
  areaLng: number | null;
  preferredMeetupAreas: NativeCareLocationArea[];
  servicesOffered: string[];
  servicesOther: string;
  petTypes: string[];
  petTypesOther: string;
  dogSizes: string[];
  currency: string;
  rateRows: NativeRateRow[];
  stripePayoutStatus: NativeWalletStatus;
  stripeAccountId: string;
  stripeDetailsSubmitted: boolean;
  stripePayoutsEnabled: boolean;
  stripeRequirementsCurrentlyDue: string[];
  hasStripeAccount: boolean;
  agreementAccepted: boolean;
  agreementAcceptedAt: string | null;
  listed: boolean;
};

export type NativeCarerProfileViewData = NativeCarerProfileData & {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  socialAlbumUrls: string[];
  publicCredentialBadges: NativePublicCredentialBadge[];
  hasCar: boolean;
  verificationStatus: string | null;
  isBookmarked: boolean;
  viewCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  startingPrice: string | null;
  startingPriceRateUnit: string | null;
  serviceRankWeight: number;
};

export const isNativeCarerEmergencyBadgeEligible = (
  provider: Pick<NativeCarerProfileData, "emergencyReadiness" | "minNoticeValue" | "minNoticeUnit">,
) => {
  if (provider.emergencyReadiness === true) return true;
  const noticeValue = Number.parseInt(provider.minNoticeValue, 10);
  return provider.minNoticeUnit === "hours" && Number.isFinite(noticeValue) && noticeValue <= 2;
};

export const STRENGTHS = [
  "Pet Lover",
  "Medication Support",
  "Special Needs Care",
  "Senior Pets",
  "Infant Pets",
  "Emotional Pets",
  "Rescue Experience",
  "Pet Transport",
  "Basic Grooming",
  "Basic Training",
] as const;

export const PROFESSIONAL_ROLES = [
  "Veterinarian",
  "Vet Nurse",
  "Certified Trainer",
  "Licensed Groomer",
  "Animal First Aid",
  "Rescue/Foster Organization",
] as const;

export const PROFESSIONAL_TYPES = [...PROFESSIONAL_ROLES] as const;

export type NativeCertifiedSkill = typeof PROFESSIONAL_ROLES[number];

export const ALL_SKILLS = STRENGTHS;
export const SKILLS_GROUP_B = PROFESSIONAL_ROLES;
export const MAX_SKILLS = 6;

export const PROOF_CONFIG: Record<NativeCertifiedSkill, { fields: { key: string; label: string; placeholder: string }[]; errorCopy: string }> = {
  Veterinarian: { fields: [], errorCopy: "" },
  "Vet Nurse": { fields: [], errorCopy: "" },
  "Certified Trainer": { fields: [], errorCopy: "" },
  "Licensed Groomer": { fields: [], errorCopy: "" },
  "Animal First Aid": { fields: [], errorCopy: "" },
  "Rescue/Foster Organization": { fields: [], errorCopy: "" },
};

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const LOCATION_STYLES = ["Flexible", "Owner's Place", "Carer's Place", "Outdoor"] as const;
export const SERVICES_OFFERED = ["Sitting & Visit", "Boarding", "Grooming", "Training", "Rescue Support", "Foster Support", "Pet Transport", "Licensed Medical Care"] as const;
export const PET_TYPES = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others"] as const;
export const DOG_SIZES = ["Small", "Medium", "Large", "Giant"] as const;
export const CURRENCIES = ["USD", "HKD", "GBP", "EUR", "AUD", "SGD", "CAD", "JPY"] as const;
export type NativeCarerCurrency = (typeof CURRENCIES)[number];
const SUPPORTED_CURRENCY_SET = new Set<string>(CURRENCIES);
const CURRENCY_DISPLAY_SYMBOLS: Record<NativeCarerCurrency, string> = {
  AUD: "AU$",
  CAD: "CA$",
  EUR: "€",
  GBP: "£",
  HKD: "HK$",
  JPY: "¥",
  SGD: "SG$",
  USD: "US$",
};
const EUR_COUNTRY_CODES = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);
const COUNTRY_CURRENCY_BY_CODE: Record<string, NativeCarerCurrency> = {
  AU: "AUD",
  CA: "CAD",
  GB: "GBP",
  HK: "HKD",
  JP: "JPY",
  SG: "SGD",
  US: "USD",
};
const COUNTRY_CURRENCY_BY_NAME: Record<string, NativeCarerCurrency> = {
  australia: "AUD",
  canada: "CAD",
  "hong kong": "HKD",
  "hong kong sar": "HKD",
  japan: "JPY",
  singapore: "SGD",
  "united kingdom": "GBP",
  uk: "GBP",
  "great britain": "GBP",
  "united states": "USD",
  usa: "USD",
};

export const normalizeNativeCarerCurrency = (value: unknown): NativeCarerCurrency | "" => {
  const currency = String(value || "").trim().toUpperCase();
  return SUPPORTED_CURRENCY_SET.has(currency) ? currency as NativeCarerCurrency : "";
};

export const formatNativeCareCurrencySymbol = (value: unknown): string =>
  CURRENCY_DISPLAY_SYMBOLS[normalizeNativeCarerCurrency(value) || "USD"];

export const formatNativeCareLocationSummary = (
  locationStyles: readonly string[] | null | undefined,
  areaName: unknown,
  preferredMeetupAreas: readonly NativeCareLocationArea[] | null | undefined = [],
): string => {
  const styles = Array.isArray(locationStyles) ? locationStyles.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const area = styles.includes("Carer's Place") ? String(areaName || "").trim() : "";
  const preferredAreas = Array.isArray(preferredMeetupAreas)
    ? preferredMeetupAreas.map((item) => item.label.trim()).filter(Boolean)
    : [];
  const locationParts = [area, ...preferredAreas].filter(Boolean);
  const seenLocations = new Set<string>();
  const dedupedLocations = locationParts.filter((item) => {
    const key = item.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seenLocations.has(key)) return false;
    seenLocations.add(key);
    return true;
  });
  if (dedupedLocations.length > 0) return dedupedLocations.join(", ");
  if (styles.includes("Outdoor")) return "Outdoor";
  if (styles.includes("Flexible")) return "Flexible";
  return "";
};

export const resolveNativeCarerCurrencyForCountry = (countryCodeOrName: unknown): NativeCarerCurrency => {
  const raw = String(countryCodeOrName || "").trim();
  if (!raw) return "USD";
  const code = raw.length === 2 ? raw.toUpperCase() : "";
  if (code && EUR_COUNTRY_CODES.has(code)) return "EUR";
  if (code && COUNTRY_CURRENCY_BY_CODE[code]) return COUNTRY_CURRENCY_BY_CODE[code];
  const normalizedName = raw.toLowerCase();
  return COUNTRY_CURRENCY_BY_NAME[normalizedName] || "USD";
};

export const resolveNativeCarerCurrency = (...countrySignals: unknown[]): NativeCarerCurrency => {
  for (const signal of countrySignals) {
    const currency = resolveNativeCarerCurrencyForCountry(signal);
    if (currency !== "USD" || String(signal || "").trim()) return currency;
  }
  return "USD";
};

// THE single source of truth for the currency shown anywhere in the care booking flow
// (rate field, Care Scope/Quote, Care Scope Summary, payment). Every surface must derive
// its currency from this — never from its own ad-hoc fallback — so the summary can never
// disagree with the quote (the "US$ here, HK$ there" trust-breaking split).
//
// Priority, highest first:
//   1. The agreed quote currency (what the Care Scope/Quote already says)
//   2. The requested currency (owner's proposed rate)
//   3. The carer's stored profile currency
//   4. Carer service location → GPS → profile country (in that order)
//   5. USD (only when nothing above resolves)
// For a volunteer booking with no price yet, 1–3 are empty, so it resolves via the
// location chain exactly as required.
export const resolveCareScopeCurrency = (input: {
  quoteCurrency?: unknown;
  requestCurrency?: unknown;
  providerCurrency?: unknown;
  locationCountries?: unknown[];
}): NativeCarerCurrency =>
  normalizeNativeCarerCurrency(input.quoteCurrency)
  || normalizeNativeCarerCurrency(input.requestCurrency)
  || normalizeNativeCarerCurrency(input.providerCurrency)
  || resolveNativeCarerCurrency(...(input.locationCountries ?? []));

// Out-of-service-area advisory helpers live in a dependency-free module so they can be
// unit-tested directly; re-exported here for existing import sites.
export { isNativeCareLocationOutOfArea, type NativeCareServiceArea } from "./nativeCareServiceArea";

// All currencies a carer can charge in, derived from their service locations (the
// Carer's Place area country + each preferred meetup area country), deduped in priority
// order. This is the pick-list for the rate currency: a carer serving multiple countries
// can choose among e.g. HK$ / £ / US$. Returns [] when no service area is set yet.
export const nativeCarerServiceCurrencies = (
  areaCountry?: string | null,
  preferredCountries: Array<string | null | undefined> = [],
): NativeCarerCurrency[] => {
  const out: NativeCarerCurrency[] = [];
  for (const country of [areaCountry, ...preferredCountries]) {
    if (!String(country || "").trim()) continue;
    const currency = resolveNativeCarerCurrencyForCountry(country);
    if (!out.includes(currency)) out.push(currency);
  }
  return out;
};

export const dedupeNativeCarerCurrencies = (values: Array<unknown> = []): NativeCarerCurrency[] => {
  const out: NativeCarerCurrency[] = [];
  for (const value of values) {
    const currency = normalizeNativeCarerCurrency(value);
    if (currency && !out.includes(currency)) out.push(currency);
  }
  return out;
};

export const resolveCareScopeCurrencyDecision = (input: {
  allowedCurrencies?: Array<unknown>;
  forceProviderCurrency?: boolean;
  locationCountries?: unknown[];
  preferredCurrency?: unknown;
  providerCurrency?: unknown;
  quoteCurrency?: unknown;
  requestCurrency?: unknown;
}): { canSelect: boolean; currency: NativeCarerCurrency; options: NativeCarerCurrency[] } => {
  const options = dedupeNativeCarerCurrencies(input.allowedCurrencies ?? []);
  const forcedProviderCurrency = normalizeNativeCarerCurrency(input.providerCurrency);
  if (input.forceProviderCurrency && forcedProviderCurrency) {
    return { canSelect: false, currency: forcedProviderCurrency, options };
  }
  const located = resolveNativeCarerCurrency(...(input.locationCountries ?? []));
  const candidates = dedupeNativeCarerCurrencies([
    input.quoteCurrency,
    input.preferredCurrency,
    input.requestCurrency,
    input.providerCurrency,
    located,
  ]);
  if (options.length === 1) return { canSelect: false, currency: options[0], options };
  if (options.length > 1) {
    return { canSelect: true, currency: candidates.find((item) => options.includes(item)) || options[0], options };
  }
  return { canSelect: false, currency: candidates[0] || located, options };
};

// Reconcile the stored rate currency against the carer's service locations. Keeps the
// current currency when it still matches one of their areas (so a multi-country carer
// keeps their chosen currency), otherwise defaults to the Carer's Place area currency —
// auto-correcting a stale currency left over from a removed area (e.g. GBP after the only
// UK area was swapped for a HK one). Falls back to GPS / profile country only when there
// is no service area at all yet.
export const reconcileNativeCarerCurrency = (input: {
  areaCountry?: string | null;
  preferredCountries?: Array<string | null | undefined>;
  current?: string | null;
  fallbackCountries?: unknown[];
}): NativeCarerCurrency => {
  const serviceCurrencies = nativeCarerServiceCurrencies(input.areaCountry, input.preferredCountries ?? []);
  const current = normalizeNativeCarerCurrency(input.current) || null;
  if (current && serviceCurrencies.includes(current)) return current;
  if (String(input.areaCountry || "").trim()) return resolveNativeCarerCurrencyForCountry(input.areaCountry);
  if (serviceCurrencies.length > 0) return serviceCurrencies[0];
  // No country-bound service area (e.g. Outdoor/Flexible only): keep whatever currency
  // the carer already has rather than overriding it, and only derive from GPS/profile
  // when there is nothing set at all.
  if (current) return current;
  return resolveNativeCarerCurrency(...(input.fallbackCountries ?? []));
};
export const RATE_OPTIONS = ["Per hour", "Per day", "Per session", "Per night"] as const;
export const AGREEMENT_VERSION = "1.0";
export const PET_TYPES_REQUIRING_SIZE = ["Dogs"] as const;
export const EMPTY_PROFESSIONAL_PROFILE: NativeProfessionalProfile = {
  enabled: false,
  roles: [],
  has_credentials: false,
  credentials: [],
};

export const EMPTY_PROFESSIONAL_CREDENTIAL: NativeProfessionalCredential = {
  professional_type: "",
  country_region: "",
  name_on_certificate: "",
  license_number: "",
  issuing_body: "",
  expiry_date: "",
};

export const EMPTY_CARER_PROFILE: NativeCarerProfileData = {
  story: "",
  skills: [],
  proofMetadata: {},
  professional: EMPTY_PROFESSIONAL_PROFILE,
  vetLicenseFound: null,
  days: [],
  timeBlocks: ["Specify"],
  otherTimeFrom: "",
  otherTimeTo: "",
  emergencyReadiness: null,
  minNoticeValue: "",
  minNoticeUnit: "hours",
  locationStyles: [],
  areaName: "",
  areaCountry: "",
  areaLat: null,
  areaLng: null,
  preferredMeetupAreas: [],
  servicesOffered: [],
  servicesOther: "",
  petTypes: [],
  petTypesOther: "",
  dogSizes: [],
  currency: "",
  rateRows: [{ price: "", rate: "", services: [], voluntary: false }],
  stripePayoutStatus: null,
  stripeAccountId: "",
  stripeDetailsSubmitted: false,
  stripePayoutsEnabled: false,
  stripeRequirementsCurrentlyDue: [],
  hasStripeAccount: false,
  agreementAccepted: false,
  agreementAcceptedAt: null,
  listed: false,
};

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

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const PUBLIC_CREDENTIAL_BADGE_LABELS = new Set<NativePublicCredentialBadgeLabel>([
  "Self-declared",
  "Registry matched",
  "Certificate matched",
  "Organization matched",
  "Directory matched",
]);

const publicCredentialBadgeCache = new Map<string, { badges: NativePublicCredentialBadge[]; cachedAt: number }>();
const publicCredentialBadgeInFlight = new Map<string, Promise<NativePublicCredentialBadge[]>>();
const PUBLIC_CREDENTIAL_BADGE_CACHE_MS = 5 * 60 * 1000;

export const normalizePublicCredentialBadge = (value: unknown): NativePublicCredentialBadge | null => {
  if (!isRecord(value)) return null;
  const publicLabel = normalizePublicCredentialLabel(String(value.public_label ?? ""));
  if (!PUBLIC_CREDENTIAL_BADGE_LABELS.has(publicLabel as NativePublicCredentialBadgeLabel)) return null;
  return {
    credentialType: String(value.credential_type ?? ""),
    publicLabel: publicLabel as NativePublicCredentialBadgeLabel,
    sourceType: value.source_type == null ? null : String(value.source_type),
    sourceName: value.source_name == null ? null : String(value.source_name),
    checkedAt: value.checked_at == null ? null : String(value.checked_at),
    maskedIdentifier: value.masked_identifier == null ? null : String(value.masked_identifier),
    caveat: value.caveat == null ? null : String(value.caveat),
  };
};

export const fetchPublicProviderCredentialBadges = async (providerId: string, options: { force?: boolean } = {}): Promise<NativePublicCredentialBadge[]> => {
  const cleanProviderId = String(providerId || "").trim();
  if (!cleanProviderId) return [];
  const cached = publicCredentialBadgeCache.get(cleanProviderId);
  if (!options.force && cached && Date.now() - cached.cachedAt < PUBLIC_CREDENTIAL_BADGE_CACHE_MS) return cached.badges;
  const pending = publicCredentialBadgeInFlight.get(cleanProviderId);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await supabase.rpc("get_public_provider_credential_badges" as never, { p_provider_id: cleanProviderId } as never);
    if (error) throw error;
    const badges = Array.isArray(data) ? data.map(normalizePublicCredentialBadge).filter((entry): entry is NativePublicCredentialBadge => Boolean(entry)) : [];
    publicCredentialBadgeCache.set(cleanProviderId, { badges, cachedAt: Date.now() });
    return badges;
  })();
  publicCredentialBadgeInFlight.set(cleanProviderId, request);
  try {
    return await request;
  } finally {
    if (publicCredentialBadgeInFlight.get(cleanProviderId) === request) {
      publicCredentialBadgeInFlight.delete(cleanProviderId);
    }
  }
};

const cleanProfessionalCredentials = (value: unknown): NativeProfessionalCredential[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = isRecord(entry) ? entry : {};
      return {
        professional_type: String(record.professional_type ?? ""),
        country_region: String(record.country_region ?? ""),
        name_on_certificate: String(record.name_on_certificate ?? ""),
        license_number: String(record.license_number ?? ""),
        issuing_body: String(record.issuing_body ?? ""),
        expiry_date: String(record.expiry_date ?? ""),
      };
    })
    .filter((entry) => Object.values(entry).some((field) => field.trim()));
};

export const isProfessionalCredentialComplete = (credential: NativeProfessionalCredential) =>
  Boolean(
    credential.professional_type.trim()
    && credential.country_region.trim()
    && credential.name_on_certificate.trim()
    && credential.license_number.trim()
    && credential.issuing_body.trim()
    && credential.expiry_date.trim(),
  );

export const hasSubmittedProfessionalCredential = (professional: NativeProfessionalProfile) =>
  professional.enabled && professional.credentials.some(isProfessionalCredentialComplete);

export const normalizeProfessionalProfile = (value: unknown): NativeProfessionalProfile => {
  const record = isRecord(value) ? value : {};
  const roles = isStringArray(record.roles) ? record.roles.filter((role) => (PROFESSIONAL_ROLES as readonly string[]).includes(role)) : [];
  const credentials = cleanProfessionalCredentials(record.credentials);
  const enabled = record.enabled === true;
  const hasCredentials = enabled && record.has_credentials === true && credentials.length > 0;
  return {
    enabled,
    roles: enabled ? roles : [],
    has_credentials: hasCredentials,
    credentials: hasCredentials ? credentials : [],
  };
};

const normalizeCareLocationArea = (value: unknown): NativeCareLocationArea | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = String(record.label ?? "").trim();
  if (!label) return null;
  const lat = Number(record.lat);
  const lng = Number(record.lng);
  return {
    country: String(record.country ?? "").trim(),
    label,
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
  };
};

export const normalizeCareLocationAreas = (value: unknown): NativeCareLocationArea[] => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const areas: NativeCareLocationArea[] = [];
  for (const item of source) {
    const area = normalizeCareLocationArea(item);
    if (!area) continue;
    const key = `${area.label.toLowerCase()}|${area.country.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    areas.push(area);
  }
  return areas.slice(0, 5);
};

const normalizeProofMetadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const normalizeProofCareLocation = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export const normalizePreferredMeetupAreasFromProofMetadata = (value: unknown): NativeCareLocationArea[] => {
  const proofMetadata = normalizeProofMetadata(value);
  const careLocation = normalizeProofCareLocation(proofMetadata.careLocation);
  return normalizeCareLocationAreas(careLocation.preferredMeetupAreas);
};

export const buildProofMetadata = (data: NativeCarerProfileData): Record<string, unknown> => {
  const next = { ...data.proofMetadata };
  const careLocation = { ...normalizeProofCareLocation(next.careLocation) };
  if (data.preferredMeetupAreas.length > 0) {
    careLocation.preferredMeetupAreas = normalizeCareLocationAreas(data.preferredMeetupAreas);
    next.careLocation = careLocation;
  } else {
    delete careLocation.preferredMeetupAreas;
    if (Object.keys(careLocation).length > 0) next.careLocation = careLocation;
    else delete next.careLocation;
  }
  const professional = normalizeProfessionalProfile(data.professional);
  if (!professional.enabled || (professional.roles.length === 0 && professional.credentials.length === 0)) {
    next.professional = { ...EMPTY_PROFESSIONAL_PROFILE };
    return next;
  }
  next.professional = professional;
  return next;
};

export const normalizeRateUnit = (raw: string) => {
  const input = String(raw || "").trim().toLowerCase();
  if (!input) return "";
  const noPerPrefix = input.replace(/^\s*per\s+/, "");
  for (const [pattern, normalized] of RATE_UNIT_ALIASES) {
    if (pattern.test(noPerPrefix)) return normalized;
  }
  return input.startsWith("per ") ? input.slice(4) : input;
};

export function serializeRateRow(row: NativeRateRow): string {
  return JSON.stringify(row);
}

export const hasPaidNativeRateRows = (rateRows: NativeRateRow[]) =>
  rateRows.some((row) => row.voluntary !== true);

export const hasVoluntaryNativeRateRows = (rateRows: NativeRateRow[]) =>
  rateRows.some((row) => row.voluntary === true);

export const isVolunteerOnlyNativeRateRows = (rateRows: NativeRateRow[]) =>
  rateRows.length > 0 && rateRows.every((row) => row.voluntary === true);

export function deserializeRateRow(raw: string): NativeRateRow {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.price === "string" && typeof record.rate === "string") {
        return {
          price: record.price,
          rate: record.rate,
          services: isStringArray(record.services) ? record.services : [],
          voluntary: record.voluntary === true,
        };
      }
    }
  } catch {
    // Legacy rows can store a plain rate string.
  }
  return { price: "", rate: raw, services: [], voluntary: false };
}

export const mapCarerRowToForm = (row: Record<string, unknown>): NativeCarerProfileData => {
  const dbRates = isStringArray(row.rates) ? row.rates : [];
  const firstPrice = row.starting_price != null ? String(row.starting_price) : "";
  const servicesOffered = isStringArray(row.services_offered) ? row.services_offered : [];
  const rateRows = dbRates.length === 0
    ? [{ price: firstPrice, rate: "", services: servicesOffered, voluntary: false }]
    : dbRates.map((entry, index) => {
        const parsed = deserializeRateRow(entry);
        if (index === 0 && parsed.price === "") parsed.price = firstPrice;
        if (parsed.services.length === 0 && index === 0) parsed.services = servicesOffered;
        return parsed;
      });
  const proofMetadata = normalizeProofMetadata(row.proof_metadata);
  const locationStyles = isStringArray(row.location_styles) ? row.location_styles : [];
  const hasCarerPlace = locationStyles.includes("Carer's Place");
  const preferredMeetupAreas = normalizeCareLocationAreas(row.preferred_meetup_areas);

  return {
    story: String(row.story ?? ""),
    skills: isStringArray(row.skills) ? row.skills : [],
    proofMetadata,
    professional: normalizeProfessionalProfile(proofMetadata.professional),
    vetLicenseFound: typeof row.vet_license_found === "boolean" ? row.vet_license_found : null,
    days: isStringArray(row.days) ? row.days : [],
    timeBlocks: isStringArray(row.time_blocks) && row.time_blocks.length > 0 ? row.time_blocks : ["Specify"],
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
    preferredMeetupAreas: preferredMeetupAreas.length > 0 ? preferredMeetupAreas : normalizePreferredMeetupAreasFromProofMetadata(proofMetadata),
    servicesOffered,
    servicesOther: String(row.services_other ?? ""),
    petTypes: isStringArray(row.pet_types) ? row.pet_types : [],
    petTypesOther: String(row.pet_types_other ?? ""),
    dogSizes: isStringArray(row.dog_sizes) ? row.dog_sizes : [],
    currency: String(row.currency ?? ""),
    rateRows,
    stripePayoutStatus: row.stripe_payout_status === "pending" || row.stripe_payout_status === "needs_action" || row.stripe_payout_status === "complete" ? row.stripe_payout_status : null,
    stripeAccountId: String(row.stripe_account_id ?? ""),
    stripeDetailsSubmitted: row.stripe_details_submitted === true,
    stripePayoutsEnabled: row.stripe_payouts_enabled === true,
    stripeRequirementsCurrentlyDue: isStringArray(row.stripe_requirements_currently_due) ? row.stripe_requirements_currently_due : [],
    hasStripeAccount: Boolean(row.stripe_account_id),
    agreementAccepted: row.agreement_accepted === true,
    agreementAcceptedAt: row.agreement_accepted_at ? String(row.agreement_accepted_at) : null,
    listed: row.listed === true,
  };
};

export const toggleStringItem = (items: string[], item: string) => (
  items.includes(item) ? items.filter((entry) => entry !== item) : [...items, item]
);

export const computeCarerCompleted = (data: NativeCarerProfileData) => {
  if (data.skills.length === 0) return false;
  if (data.servicesOffered.length === 0) return false;
  if (data.servicesOffered.includes("Licensed Medical Care") && !hasSubmittedProfessionalCredential(data.professional)) return false;
  if (data.petTypes.length === 0) return false;
  const needsPetSize = data.petTypes.some((petType) => (PET_TYPES_REQUIRING_SIZE as readonly string[]).includes(petType));
  if (needsPetSize && data.dogSizes.length === 0) return false;
  if (data.days.length === 0) return false;
  const timeOk = data.timeBlocks.includes("Anytime") || (data.timeBlocks.includes("Specify") && data.otherTimeFrom.trim() && data.otherTimeTo.trim());
  if (!timeOk) return false;
  const noticeValue = Number.parseInt(data.minNoticeValue, 10);
  if (data.minNoticeValue.trim() === "" || Number.isNaN(noticeValue) || noticeValue < 0) return false;
  for (const row of data.rateRows) {
    if (row.services.length === 0) return false;
    const hasPrice = row.price.trim().length > 0;
    const hasRate = row.rate.trim().length > 0;
    if (row.voluntary && !hasPrice && !hasRate) continue;
    const price = Number.parseFloat(row.price ?? "");
    if (!hasPrice || Number.isNaN(price) || price <= 0) return false;
    if (!data.currency || !hasRate) return false;
  }
  if (data.locationStyles.length === 0) return false;
  const hasPreferredArea = data.preferredMeetupAreas.some((area) => (
    area.label.trim().length > 0
    && (area.country.trim().length > 0 || (typeof area.lat === "number" && Number.isFinite(area.lat) && typeof area.lng === "number" && Number.isFinite(area.lng)))
  ));
  if (!hasPreferredArea) return false;
  if (data.emergencyReadiness === null) return false;
  if (data.professional.has_credentials && !data.professional.credentials.some(isProfessionalCredentialComplete)) return false;
  return true;
};

export const computeCarerListingEligible = (data: NativeCarerProfileData, providerEligible: boolean) =>
  computeCarerCompleted(data)
  && data.stripePayoutsEnabled === true
  && data.agreementAccepted
  && providerEligible;

export const deriveWalletState = (data: Pick<NativeCarerProfileData, "stripeAccountId" | "stripeDetailsSubmitted" | "stripePayoutsEnabled" | "stripeRequirementsCurrentlyDue">): NativeWalletUiState => {
  if (!data.stripeAccountId) return "none";
  if (data.stripePayoutsEnabled) return "connected";
  if (data.stripeDetailsSubmitted && data.stripeRequirementsCurrentlyDue.length === 0) return "review";
  return "incomplete";
};

export const buildCarerUpsertPayload = (userId: string, data: NativeCarerProfileData, providerEligible: boolean) => {
  const noticeValue = Number.parseInt(data.minNoticeValue, 10);
  const rateRows = data.rateRows.length > 0 ? data.rateRows : [{ price: "", rate: "", services: [], voluntary: false }];
  const pricedRows = rateRows.filter((row) => {
    const price = Number.parseFloat(row.price);
    return row.price.trim() && row.rate.trim() && Number.isFinite(price) && price > 0;
  });
  const firstPricedRow = pricedRows[0];
  const hasCarerPlace = data.locationStyles.includes("Carer's Place");
  return {
    user_id: userId,
    story: data.story.trim(),
    skills: data.skills,
    proof_metadata: buildProofMetadata(data),
    days: data.days,
    time_blocks: data.timeBlocks,
    other_time_from: data.timeBlocks.includes("Specify") ? data.otherTimeFrom : null,
    other_time_to: data.timeBlocks.includes("Specify") ? data.otherTimeTo : null,
    emergency_readiness: data.emergencyReadiness,
    min_notice_value: data.minNoticeValue.trim() !== "" && !Number.isNaN(noticeValue) && noticeValue >= 0 ? noticeValue : null,
    min_notice_unit: data.minNoticeUnit,
    location_styles: data.locationStyles,
    specify_area: hasCarerPlace && data.areaName.trim().length > 0,
    area_name: hasCarerPlace ? data.areaName.trim() || null : null,
    area_country: hasCarerPlace ? data.areaCountry.trim() || null : null,
    area_lat: hasCarerPlace && typeof data.areaLat === "number" && Number.isFinite(data.areaLat) ? data.areaLat : null,
    area_lng: hasCarerPlace && typeof data.areaLng === "number" && Number.isFinite(data.areaLng) ? data.areaLng : null,
    preferred_meetup_areas: normalizeCareLocationAreas(data.preferredMeetupAreas),
    services_offered: [...new Set(rateRows.flatMap((row) => row.services))],
    services_other: rateRows.some((row) => row.services.includes("Others")) ? data.servicesOther.trim() || null : null,
    pet_types: data.petTypes,
    pet_types_other: data.petTypes.includes("Others") ? data.petTypesOther.trim() || null : null,
    dog_sizes: data.dogSizes,
    starting_price: firstPricedRow?.price.trim() ? Number.parseFloat(firstPricedRow.price) : null,
    currency: data.currency || null,
    rates: rateRows.map(serializeRateRow),
    agreement_accepted: data.agreementAccepted,
    agreement_accepted_at: data.agreementAccepted ? (data.agreementAcceptedAt ?? new Date().toISOString()) : null,
    agreement_version: data.agreementAccepted ? AGREEMENT_VERSION : null,
    listed: computeCarerListingEligible(data, providerEligible) ? data.listed : false,
    completed: computeCarerCompleted(data),
  };
};

export const isAge16PlusFromDob = (dob: unknown) => {
  if (typeof dob !== "string" || !dob) return false;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  return age > 16 || (age === 16 && (month > 0 || (month === 0 && now.getDate() >= birth.getDate())));
};

export const formatCarerTime = (value: string) => {
  if (!value) return value;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const period = hours >= 12 ? "pm" : "am";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
};

const parsePositivePrice = (value: string) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
};

export const getLowestRateRow = (rows: NativeRateRow[]) => {
  const priced = rows.filter((row) => row.price !== "" && parsePositivePrice(row.price) !== Number.POSITIVE_INFINITY && row.rate !== "");
  if (priced.length === 0) return null;
  return priced.reduce((min, row) => (parsePositivePrice(row.price) < parsePositivePrice(min.price) ? row : min));
};

export const makeCarerViewData = (
  userId: string,
  data: NativeCarerProfileData,
  profile: Record<string, unknown> | null | undefined,
  socialAlbumUrls: string[],
): NativeCarerProfileViewData => {
  const lowestRate = getLowestRateRow(data.rateRows);
  return {
    ...data,
    userId,
    displayName: String(profile?.display_name || "Pet Carer"),
    avatarUrl: typeof profile?.avatar_url === "string" ? profile.avatar_url : null,
    socialAlbumUrls,
    publicCredentialBadges: [],
    hasCar: profile?.has_car === true,
    verificationStatus: isNativeVerifiedProfile(profile) ? "verified" : typeof profile?.verification_status === "string" ? profile.verification_status : null,
    isBookmarked: false,
    viewCount: 0,
    createdAt: null,
    updatedAt: null,
    startingPrice: lowestRate?.price ?? null,
    startingPriceRateUnit: lowestRate ? normalizeRateUnit(lowestRate.rate) : null,
    serviceRankWeight: 0,
  };
};

const PROFILE_PHOTOS_BUCKET = "profile_photos";
const PROFILE_PHOTO_BUCKETS = new Set([PROFILE_PHOTOS_BUCKET]);

const isDataOrBlobUrl = (value: string) => value.startsWith("data:") || value.startsWith("blob:");

const sanitizeStoragePath = (value: string) =>
  decodeURIComponent(value.split("#")[0].split("?")[0]).replace(/^\/+/, "");

const withStorageBucketPrefix = (bucket: string, key: string) => {
  const cleanKey = sanitizeStoragePath(key);
  return cleanKey.startsWith(`${bucket}/`) ? cleanKey : `${bucket}/${cleanKey}`;
};

const extractStorageKeyFromUrl = (value: string): string | null => {
  try {
    const pathname = decodeURIComponent(new URL(value).pathname || "");
    const publicProfileMatch = pathname.match(/\/storage\/v1\/object\/public\/(profile_photos)\/(.+)$/);
    if (publicProfileMatch?.[1] && publicProfileMatch?.[2]) {
      return withStorageBucketPrefix(publicProfileMatch[1], publicProfileMatch[2]);
    }
    const signedProfileMatch = pathname.match(/\/storage\/v1\/object\/sign\/(profile_photos)\/(.+)$/);
    if (signedProfileMatch?.[1] && signedProfileMatch?.[2]) {
      return withStorageBucketPrefix(signedProfileMatch[1], signedProfileMatch[2]);
    }
    return null;
  } catch {
    return null;
  }
};

const toStorageBucketKey = (value: string): string | null => {
  const raw = String(value || "").trim();
  if (!raw || isDataOrBlobUrl(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    const extracted = extractStorageKeyFromUrl(raw);
    return extracted ? sanitizeStoragePath(extracted) : null;
  }
  if (!raw.includes("/")) return null;
  const path = sanitizeStoragePath(raw);
  return /^profile_photos\//i.test(path) ? path : null;
};

const expandStorageCandidates = (value: string): string[] => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const extractedFromUrl = /^https?:\/\//i.test(raw) ? (extractStorageKeyFromUrl(raw) || "") : raw;
  const normalizedRaw = sanitizeStoragePath(extractedFromUrl);
  const normalizedDerived = sanitizeStoragePath(toStorageBucketKey(raw) || "");
  return Array.from(new Set([normalizedRaw, normalizedDerived].map(sanitizeStoragePath).filter((path) => /^profile_photos\//i.test(path))));
};

const isProfilePhotoKey = (value: string) => {
  const bucket = sanitizeStoragePath(value).split("/")[0] || "";
  return PROFILE_PHOTO_BUCKETS.has(bucket);
};

const resolveProfilePhotoCandidate = async (candidate: string) => {
  return resolveNativeProfileImageUrlAsync(candidate, 60 * 60, { defaultBucket: "profile_photos" });
};

export const canonicalizeSocialAlbumEntries = (entries: string[]) => {
  const unique = new Set<string>();
  for (const entry of entries) {
    const raw = String(entry || "").trim();
    if (!raw) continue;
    if (isDataOrBlobUrl(raw)) {
      unique.add(raw);
      continue;
    }
    if (/^https?:\/\//i.test(raw)) {
      unique.add(toStorageBucketKey(raw) || raw);
      continue;
    }
    const key = toStorageBucketKey(raw);
    if (key) unique.add(key);
  }
  return Array.from(unique);
};

export const resolveSocialAlbumUrlList = async (entries: string[]) => {
  const canonical = canonicalizeSocialAlbumEntries(entries);
  if (canonical.length === 0) return [];
  const results = await Promise.all(
    canonical.map(async (entry) => {
      if (isDataOrBlobUrl(entry)) return entry;
      if (/^https?:\/\//i.test(entry)) return entry;
      const resolved = await resolveNativeProfileImageUrlAsync(entry, 60 * 60, { defaultBucket: "profile_photos" });
      if (resolved) return resolved;
      const candidates = expandStorageCandidates(entry);
      const profilePhotoCandidate = candidates.find(isProfilePhotoKey);
      if (profilePhotoCandidate) {
        return resolveProfilePhotoCandidate(profilePhotoCandidate);
      }
      return "";
    }),
  );
  return results.filter(Boolean) as string[];
};
