// ── DB row → ProviderSummary mapper ──────────────────────────────────────────
// Shared between useServiceProviders (feed) and PublicCarerProfileModal
// (individual fetch). Keep in sync with mapRowToForm in CarerProfile.tsx.

import type { ProviderSummary, RateRow } from "./types";

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

function parsePositiveNumber(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : INVALID_PRICE;
}

function normalizeRateUnit(raw: string): string {
  const input = String(raw || "").trim().toLowerCase();
  if (!input) return "";
  const noPerPrefix = input.replace(/^\s*per\s+/, "");
  for (const [pattern, normalized] of RATE_UNIT_ALIASES) {
    if (pattern.test(noPerPrefix)) return normalized;
  }
  // Legacy rows may store entire free text like "HKD 120 nail trim".
  // Keep unit display deterministic and compact across cards/modals.
  return "visit";
}

function parseLegacyRateString(raw: string): RateRow | null {
  const input = String(raw || "").trim();
  if (!input) return null;
  const compact = input.replace(/\s+/g, " ").trim();
  const priceMatch = compact.match(/(?:HKD|USD|EUR|GBP|AUD|CAD|SGD|JPY|CNY|\$)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!priceMatch) return null;
  const price = priceMatch[1] ?? "";
  const unit = normalizeRateUnit(compact.replace(/^.*?\bper\b/i, "").trim() || compact);
  if (!price || !unit) return null;
  return { price, rate: unit, services: [] };
}

function deserializeRateRow(s: string): RateRow {
  try {
    const p = JSON.parse(s) as unknown;
    if (
      typeof p === "object" && p !== null &&
      "price" in p && typeof (p as Record<string, unknown>).price === "string" &&
      "rate"  in p && typeof (p as Record<string, unknown>).rate  === "string"
    ) {
      const row = p as { price: string; rate: string; services?: unknown };
      return {
        price:    row.price,
        rate:     normalizeRateUnit(row.rate),
        services: Array.isArray(row.services) ? (row.services as string[]) : [],
      };
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[service.rate_row_parse_failed]", { raw: s, error });
    }
  }
  const legacy = parseLegacyRateString(s);
  if (legacy) return legacy;
  return { price: "", rate: normalizeRateUnit(s), services: [] };
}

/** Normalises a rate label to a short display unit, e.g. "Per hour" → "hour". */
export function rateToUnit(rate: string): string {
  return normalizeRateUnit(rate);
}

export function mapProviderRow(
  row:           Record<string, unknown>,
  profileData:   Record<string, unknown> | null | undefined,
  albumUrls:     string[],
  isBookmarked:  boolean,
): ProviderSummary {
  const profile = profileData ?? {};
  const verificationStatus =
    typeof profile.verification_status === "string" && profile.verification_status.trim().length > 0
      ? profile.verification_status.trim()
      : profile.is_verified === true
        ? "verified"
        : null;
  const dbRates     = (row.rates as string[]) ?? [];
  const firstPrice  = row.starting_price != null ? String(row.starting_price) : "";
  const allServices = (row.services_offered as string[]) ?? [];

  let rateRows: RateRow[];
  if (dbRates.length === 0) {
    rateRows = [{ price: firstPrice, rate: "", services: allServices }];
  } else {
    rateRows = dbRates.map((r, i) => {
      const d = deserializeRateRow(r);
      if (i === 0 && d.price    === "") d.price    = firstPrice;
      if (d.services.length === 0) {
        const serviceAtIndex = allServices[i];
        d.services = serviceAtIndex ? [serviceAtIndex] : allServices;
      }
      return d;
    });
  }

  // Lowest price + its associated rate unit
  const pricedRows = rateRows.filter((r) => r.price !== "" && parsePositiveNumber(r.price) !== INVALID_PRICE && r.rate !== "");
  let startingPrice:         string | null = null;
  let startingPriceRateUnit: string | null = null;
  if (pricedRows.length > 0) {
    const lowestRow = pricedRows.reduce((min, r) =>
      parsePositiveNumber(r.price) < parsePositiveNumber(min.price) ? r : min
    );
    startingPrice         = lowestRow.price;
    startingPriceRateUnit = rateToUnit(lowestRow.rate);
  }

  const rawCurrency = String(row.currency ?? "").toUpperCase().trim();
  const currency = ALLOWED_CURRENCY_CODES.has(rawCurrency) ? rawCurrency : "";

  return {
    userId:               String(row.user_id ?? ""),
    displayName:          String(profile.display_name ?? "Pet Carer"),
    avatarUrl:            (profile.avatar_url as string | null) ?? null,
    socialAlbumUrls:      albumUrls,
    servicesOffered:      allServices,
    servicesOther:        String(row.services_other ?? ""),
    currency,
    startingPrice,
    startingPriceRateUnit,
    rateRows,
    minNoticeValue:       row.min_notice_value != null ? String(row.min_notice_value) : "",
    minNoticeUnit:        (row.min_notice_unit as "hours" | "days") ?? "hours",
    skills:               (row.skills as string[]) ?? [],
    proofMetadata:        (row.proof_metadata as Record<string, Record<string, string>>) ?? {},
    hasCar:               Boolean(profile.has_car ?? false),
    days:                 (row.days as string[]) ?? [],
    timeBlocks:           (row.time_blocks as string[]) ?? [],
    otherTimeFrom:        String(row.other_time_from ?? ""),
    otherTimeTo:          String(row.other_time_to ?? ""),
    locationStyles:       (row.location_styles as string[]) ?? [],
    areaName:             String(row.area_name ?? ""),
    petTypes:             (row.pet_types as string[]) ?? [],
    petTypesOther:        String(row.pet_types_other ?? ""),
    dogSizes:             (row.dog_sizes as string[]) ?? [],
    emergencyReadiness:   (row.emergency_readiness as boolean | null) ?? null,
    verificationStatus,
    viewCount:            Number(row.view_count ?? 0),
    createdAt:            row.created_at ? String(row.created_at) : null,
    updatedAt:            row.updated_at ? String(row.updated_at) : null,
    isBookmarked,
    agreementAccepted:    Boolean(row.agreement_accepted ?? false),
    stripePayoutStatus:   (row.stripe_payout_status as string | null) ?? null,
    story:                String(row.story ?? ""),
    serviceRankWeight:    Number(row.service_rank_weight ?? 0),
  };
}
