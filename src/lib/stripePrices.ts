/**
 * src/lib/stripePrices.ts
 * Module-level Stripe price cache — fetched once per app session.
 * Shared by Premium.tsx and StarUpgradeSheet.tsx so the edge fn is
 * only called once regardless of how many times a paywall opens.
 */

import { supabase } from "@/integrations/supabase/client";
import { quotaConfig } from "@/config/quotaConfig";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";

const SUPPORTED_CURRENCIES = new Set([
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "IDR",
  "INR",
  "JPY",
  "KRW",
  "SEK",
  "SGD",
  "TWD",
  "USD",
]);

export type LivePriceMap = {
  plus_monthly: number;
  plus_annual:  number; // total annual charge; divide by 12 for /mo equiv
  gold_monthly: number;
  gold_annual:  number;
  // Add-ons
  superBroadcast:    number;
  topProfileBooster: number;
  sharePerks:        number;
  currencyCode: string;
};

/** Canonical fallback from quotaConfig — shown instantly before the fetch resolves */
export const FALLBACK_PRICES: LivePriceMap = {
  plus_monthly: quotaConfig.stripePlans.plus.monthly.amount,
  plus_annual:  quotaConfig.stripePlans.plus.annual.amount,
  gold_monthly: quotaConfig.stripePlans.gold.monthly.amount,
  gold_annual:  quotaConfig.stripePlans.gold.annual.amount,
  // Add-on fallbacks (cents → dollars)
  superBroadcast:    4.99,
  topProfileBooster: 2.99,
  sharePerks:        4.99,
  currencyCode: "USD",
};

const _cacheByKey = new Map<string, LivePriceMap>();
const _inflightByKey = new Map<string, Promise<LivePriceMap>>();
const LAST_PRICE_SNAPSHOT_KEY = "stripe_prices:last_snapshot:v1";

const getPriceCacheKey = (input?: { currency?: string; country?: string }): string => {
  const countryHint = String(input?.country || "").trim().toUpperCase();
  const currencyHint = String(input?.currency || "").trim().toUpperCase();
  return `${currencyHint || "-"}|${countryHint || "-"}`;
};

const writeLastPriceSnapshot = (cacheKey: string, prices: LivePriceMap) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LAST_PRICE_SNAPSHOT_KEY,
      JSON.stringify({ cacheKey, prices }),
    );
  } catch {
    // ignore storage failures
  }
};

const readLastPriceSnapshot = (): { cacheKey: string; prices: LivePriceMap } | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_PRICE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cacheKey?: string; prices?: LivePriceMap } | null;
    if (!parsed?.cacheKey || !parsed?.prices) return null;
    return { cacheKey: parsed.cacheKey, prices: parsed.prices };
  } catch {
    return null;
  }
};

export const getLastLivePricesSnapshot = (): LivePriceMap | null => {
  const snapshot = readLastPriceSnapshot();
  return snapshot?.prices ?? null;
};

export const getCachedLivePrices = (input?: { currency?: string; country?: string }): LivePriceMap | null => {
  const cacheKey = getPriceCacheKey(input);
  const inMemory = _cacheByKey.get(cacheKey);
  if (inMemory) return inMemory;
  const snapshot = readLastPriceSnapshot();
  if (snapshot && snapshot.cacheKey === cacheKey) {
    _cacheByKey.set(cacheKey, snapshot.prices);
    return snapshot.prices;
  }
  return null;
};

const getBrowserCountryHint = (): string | null => {
  try {
    const locale = (Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || "").trim();
    const match = locale.match(/[-_](\w{2,3})$/);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
};

export const getStripeLocaleHints = (): { country?: string } => {
  const country = getBrowserCountryHint();
  return country ? { country } : {};
};

export const normalizeSupportedCurrency = (value?: string | null): string | null => {
  const code = String(value || "").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(code) ? code : null;
};

const COUNTRY_ALIASES: Record<string, string> = {
  HK: "HK",
  HKG: "HK",
  "HONG KONG": "HK",
  GB: "GB",
  GBR: "GB",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  SG: "SG",
  SGP: "SG",
  SINGAPORE: "SG",
  AU: "AU",
  AUS: "AU",
  AUSTRALIA: "AU",
  CA: "CA",
  CAN: "CA",
  CANADA: "CA",
  JP: "JP",
  JPN: "JP",
  JAPAN: "JP",
  TW: "TW",
  TWN: "TW",
  TAIWAN: "TW",
  CN: "CN",
  CHN: "CN",
  CHINA: "CN",
  MO: "MO",
  MAC: "MO",
  MACAU: "MO",
};

const normalizeCountryCode = (value?: string | null): string | null => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  if (COUNTRY_ALIASES[raw]) return COUNTRY_ALIASES[raw];
  if (raw.includes("HONG KONG")) return "HK";
  if (raw.includes("UNITED KINGDOM") || raw.includes("GREAT BRITAIN")) return "GB";
  if (raw.includes("UNITED STATES")) return "US";
  if (raw.includes("SINGAPORE")) return "SG";
  if (raw.includes("AUSTRALIA")) return "AU";
  if (raw.includes("CANADA")) return "CA";
  if (raw.includes("JAPAN")) return "JP";
  if (raw.includes("TAIWAN")) return "TW";
  if (raw.includes("CHINA")) return "CN";
  if (raw.includes("MACAU")) return "MO";
  return null;
};

const parseCountryFromText = (value?: string | null): string | null => {
  const text = String(value || "").trim();
  if (!text) return null;
  const direct = normalizeCountryCode(text);
  if (direct) return direct;
  const tokens = text
    .split(/[,-]/)
    .map((token) => normalizeCountryCode(token))
    .filter((token): token is string => Boolean(token));
  return tokens.at(-1) || null;
};

const reverseCountryByMapbox = async (lat: number, lng: number): Promise<string | null> => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !MAPBOX_ACCESS_TOKEN) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}&types=country&limit=1&language=en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null) as { features?: Array<{ properties?: { short_code?: string }; text?: string; place_name?: string }> } | null;
  const feature = payload?.features?.[0];
  const shortCode = normalizeCountryCode(feature?.properties?.short_code);
  if (shortCode) return shortCode;
  return parseCountryFromText(feature?.text || feature?.place_name || null);
};

export async function resolvePricingCountryHint(input?: { userId?: string | null; profileCountry?: string | null }): Promise<string | null> {
  // 1) GPS country
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 3500,
          maximumAge: 60_000,
        });
      });
      const gpsCountry = await reverseCountryByMapbox(pos.coords.latitude, pos.coords.longitude);
      if (gpsCountry) return gpsCountry;
    } catch {
      // ignore and continue
    }
  }

  // 2) pinned location country
  const userId = String(input?.userId || "").trim();
  if (userId) {
    try {
      const { data: pinRow } = await supabase
        .from("pins")
        .select("address,created_at")
        .eq("user_id", userId)
        .is("thread_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as {
          data: { address?: string | null } | null;
        };
      const pinCountry = parseCountryFromText(pinRow?.address);
      if (pinCountry) return pinCountry;
    } catch {
      // ignore and continue
    }
  }

  // 3) profile country
  const profileCountry = normalizeCountryCode(input?.profileCountry || null);
  if (profileCountry) return profileCountry;

  // 4) browser locale country
  const browserCountry = getBrowserCountryHint();
  if (browserCountry) return browserCountry;

  // 5) fallback
  return null;
}

export async function resolvePricingHints(input?: {
  userId?: string | null;
  profileCountry?: string | null;
  profileCurrency?: string | null;
}): Promise<{ currency?: string; country?: string }> {
  const currency = normalizeSupportedCurrency(input?.profileCurrency);
  if (currency) return { currency };
  const country = await resolvePricingCountryHint({
    userId: input?.userId,
    profileCountry: input?.profileCountry,
  });
  return country ? { country } : {};
}

/** Formats a number as a USD currency string using the browser locale. */
export function fmtCurrency(n: number): string {
  try {
    return new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** Returns live Stripe prices; result is cached for the entire app session. */
export function fetchLivePrices(input?: { currency?: string; country?: string }): Promise<LivePriceMap> {
  const countryHint = String(input?.country || getBrowserCountryHint() || "").trim().toUpperCase();
  const currencyHint = String(input?.currency || "").trim().toUpperCase();
  const cacheKey = getPriceCacheKey({ currency: currencyHint, country: countryHint });
  const cached = getCachedLivePrices({ currency: currencyHint, country: countryHint });
  if (cached) return Promise.resolve(cached);
  const inflight = _inflightByKey.get(cacheKey);
  if (inflight) return inflight;

  const request = (async (): Promise<LivePriceMap> => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-pricing", {
        body: {
          currency: currencyHint || null,
          country: countryHint || null,
        },
      });
      if (!error && data?.prices) {
        const p = data.prices as Record<string, { amount?: number; currency?: string }>;
        const displayCurrency = String(
          (data as { display_currency?: string } | null)?.display_currency ||
          p.plus_monthly?.currency ||
          "usd",
        ).toUpperCase();
        const resolved = {
          plus_monthly:      typeof p.plus_monthly?.amount      === "number" ? p.plus_monthly.amount      : FALLBACK_PRICES.plus_monthly,
          plus_annual:       typeof p.plus_annual?.amount       === "number" ? p.plus_annual.amount       : FALLBACK_PRICES.plus_annual,
          gold_monthly:      typeof p.gold_monthly?.amount      === "number" ? p.gold_monthly.amount      : FALLBACK_PRICES.gold_monthly,
          gold_annual:       typeof p.gold_annual?.amount       === "number" ? p.gold_annual.amount       : FALLBACK_PRICES.gold_annual,
          superBroadcast:    typeof p.superBroadcast?.amount    === "number" ? p.superBroadcast.amount    : FALLBACK_PRICES.superBroadcast,
          topProfileBooster: typeof p.topProfileBooster?.amount === "number" ? p.topProfileBooster.amount : FALLBACK_PRICES.topProfileBooster,
          sharePerks:        typeof p.sharePerks?.amount        === "number" ? p.sharePerks.amount        : FALLBACK_PRICES.sharePerks,
          currencyCode: displayCurrency || "USD",
        };
        _cacheByKey.set(cacheKey, resolved);
        writeLastPriceSnapshot(cacheKey, resolved);
        return resolved;
      } else {
        const fallback = { ...FALLBACK_PRICES };
        _cacheByKey.set(cacheKey, fallback);
        writeLastPriceSnapshot(cacheKey, fallback);
        return fallback;
      }
    } catch {
      const fallback = { ...FALLBACK_PRICES };
      _cacheByKey.set(cacheKey, fallback);
      writeLastPriceSnapshot(cacheKey, fallback);
      return fallback;
    } finally {
      _inflightByKey.delete(cacheKey);
    }
  })();
  _inflightByKey.set(cacheKey, request);

  return request;
}
