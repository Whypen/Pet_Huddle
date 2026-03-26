/**
 * src/lib/stripePrices.ts
 * Module-level Stripe price cache — fetched once per app session.
 * Shared by Premium.tsx and StarUpgradeSheet.tsx so the edge fn is
 * only called once regardless of how many times a paywall opens.
 */

import { supabase } from "@/integrations/supabase/client";
import { quotaConfig } from "@/config/quotaConfig";

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
  const countryHint = input?.country || getBrowserCountryHint();
  const currencyHint = String(input?.currency || "").trim().toUpperCase();
  const cacheKey = `${currencyHint || "-"}|${countryHint || "-"}`;
  const cached = _cacheByKey.get(cacheKey);
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
        return resolved;
      } else {
        const fallback = { ...FALLBACK_PRICES };
        _cacheByKey.set(cacheKey, fallback);
        return fallback;
      }
    } catch {
      const fallback = { ...FALLBACK_PRICES };
      _cacheByKey.set(cacheKey, fallback);
      return fallback;
    } finally {
      _inflightByKey.delete(cacheKey);
    }
  })();
  _inflightByKey.set(cacheKey, request);

  return request;
}
