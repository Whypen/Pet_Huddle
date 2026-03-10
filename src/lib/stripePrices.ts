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
};

/** Canonical fallback from quotaConfig — shown instantly before the fetch resolves */
export const FALLBACK_PRICES: LivePriceMap = {
  plus_monthly: quotaConfig.stripePlans.plus.monthly.amount,
  plus_annual:  quotaConfig.stripePlans.plus.annual.amount,
  gold_monthly: quotaConfig.stripePlans.gold.monthly.amount,
  gold_annual:  quotaConfig.stripePlans.gold.annual.amount,
};

let _cache: LivePriceMap | null = null;
let _inflight: Promise<LivePriceMap> | null = null;

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
export function fetchLivePrices(): Promise<LivePriceMap> {
  if (_cache) return Promise.resolve(_cache);
  if (_inflight) return _inflight;

  _inflight = (async (): Promise<LivePriceMap> => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-pricing");
      if (!error && data?.prices) {
        const p = data.prices as Record<string, { amount?: number }>;
        _cache = {
          plus_monthly: typeof p.plus_monthly?.amount === "number" ? p.plus_monthly.amount : FALLBACK_PRICES.plus_monthly,
          plus_annual:  typeof p.plus_annual?.amount  === "number" ? p.plus_annual.amount  : FALLBACK_PRICES.plus_annual,
          gold_monthly: typeof p.gold_monthly?.amount === "number" ? p.gold_monthly.amount : FALLBACK_PRICES.gold_monthly,
          gold_annual:  typeof p.gold_annual?.amount  === "number" ? p.gold_annual.amount  : FALLBACK_PRICES.gold_annual,
        };
      } else {
        _cache = { ...FALLBACK_PRICES };
      }
    } catch {
      _cache = { ...FALLBACK_PRICES };
    }
    _inflight = null;
    return _cache!;
  })();

  return _inflight;
}
