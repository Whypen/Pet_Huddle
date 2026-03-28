import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeMode = stripeSecret.startsWith("sk_live_") ? "live" : "test";

const PRICE_IDS: Record<string, string | undefined> = {
  plus_monthly: Deno.env.get("STRIPE_PRICE_PLUS_MONTHLY"),
  plus_annual: Deno.env.get("STRIPE_PRICE_PLUS_ANNUAL"),
  gold_monthly: Deno.env.get("STRIPE_PRICE_GOLD_MONTHLY"),
  gold_annual: Deno.env.get("STRIPE_PRICE_GOLD_ANNUAL"),
  star_pack: Deno.env.get("STRIPE_PRICE_STAR_PACK"),
  emergency_alert: Deno.env.get("STRIPE_PRICE_BROADCAST_ALERT"),
  vet_media: Deno.env.get("STRIPE_PRICE_MEDIA_10"),
  superBroadcast: Deno.env.get("STRIPE_PRICE_SUPER_BROADCAST"),
  topProfileBooster: Deno.env.get("STRIPE_PRICE_TOP_PROFILE"),
  sharePerks: Deno.env.get("STRIPE_PRICE_FAMILY_MEMBER"),
};

const CORE_PREMIUM_KEYS = new Set([
  "plus_monthly",
  "plus_annual",
  "gold_monthly",
  "gold_annual",
]);

const DEFAULTS: Record<string, { amount: number; currency: string; interval?: string }> = {
  plus_monthly: { amount: 5.99,  currency: "usd", interval: "month" },
  plus_annual:  { amount: 59.99, currency: "usd", interval: "year" },
  gold_monthly: { amount: 11.99, currency: "usd", interval: "month" },
  gold_annual:  { amount: 109.99, currency: "usd", interval: "year" },
  star_pack: { amount: 4.99, currency: "usd" },
  emergency_alert: { amount: 2.99, currency: "usd" },
  vet_media: { amount: 3.99, currency: "usd" },
  superBroadcast: { amount: 4.99, currency: "usd" },
  topProfileBooster: { amount: 2.99, currency: "usd" },
  sharePerks: { amount: 4.99, currency: "usd" },
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  HK: "hkd",
  US: "usd",
  GB: "gbp",
  SG: "sgd",
  AU: "aud",
  CA: "cad",
  CH: "chf",
  ID: "idr",
  IN: "inr",
  JP: "jpy",
  KR: "krw",
  SE: "sek",
  TW: "twd",
  CN: "cny",
  MO: "mop",
};

const SUPPORTED_CURRENCIES = new Set([
  "aud",
  "cad",
  "chf",
  "cny",
  "eur",
  "gbp",
  "hkd",
  "idr",
  "inr",
  "jpy",
  "krw",
  "sek",
  "sgd",
  "twd",
  "usd",
]);

const COUNTRY_ALIASES: Record<string, string> = {
  HKG: "HK",
  GBR: "GB",
  USA: "US",
  SGP: "SG",
  AUS: "AU",
  CAN: "CA",
  JPN: "JP",
  TWN: "TW",
  CHN: "CN",
  MAC: "MO",
  "HONG KONG": "HK",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  SINGAPORE: "SG",
  AUSTRALIA: "AU",
  CANADA: "CA",
  JAPAN: "JP",
  TAIWAN: "TW",
  CHINA: "CN",
  MACAU: "MO",
};

const normalizeCurrency = (value: unknown): string | null => {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(text)) return null;
  return SUPPORTED_CURRENCIES.has(text) ? text : null;
};

const normalizeCountryIso2 = (value: unknown): string | null => {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return null;
  if (/^[A-Z]{2}$/.test(text)) return text;
  if (COUNTRY_ALIASES[text]) return COUNTRY_ALIASES[text];
  if (text.includes("HONG KONG")) return "HK";
  if (text.includes("UNITED KINGDOM") || text.includes("GREAT BRITAIN")) return "GB";
  if (text.includes("UNITED STATES")) return "US";
  if (text.includes("SINGAPORE")) return "SG";
  if (text.includes("AUSTRALIA")) return "AU";
  if (text.includes("CANADA")) return "CA";
  if (text.includes("JAPAN")) return "JP";
  if (text.includes("TAIWAN")) return "TW";
  if (text.includes("CHINA")) return "CN";
  if (text.includes("MACAU")) return "MO";
  return null;
};

const resolveCurrencyByCountry = (country: string | null): string =>
  (country && COUNTRY_TO_CURRENCY[country]) || "usd";

async function resolveLookupKeyFromMetadata(planKey: string, currency: string): Promise<string | null> {
  const target = currency.toUpperCase();
  const { data, error } = await supabase
    .from("plan_metadata")
    .select("stripe_lookup_key,currency")
    .eq("plan_key", planKey)
    .eq("is_active", true)
    .in("currency", [target, "USD"])
    .order("priority", { ascending: false })
    .limit(10);
  if (error || !data?.length) return null;
  const exact = data.find((row) => String(row.currency || "").toUpperCase() === target) || data[0];
  const lookup = String(exact?.stripe_lookup_key || "").trim();
  return lookup || null;
}

async function resolvePriceByLookupKey(lookupKey: string) {
  const trimmed = String(lookupKey || "").trim();
  if (!trimmed) return null;
  const list = await stripe.prices.list({
    lookup_keys: [trimmed],
    active: true,
    limit: 1,
    expand: ["data.currency_options"],
  });
  return list.data?.[0] ?? null;
}

const resolveLocalizedAmount = (price: Stripe.Price, targetCurrency: string): { amount: number; currency: string } => {
  const normalizedTarget = String(targetCurrency || "").toLowerCase();
  const baseCurrency = String(price.currency || "usd").toLowerCase();
  const baseAmount = (price.unit_amount || 0) / 100;
  if (!normalizedTarget || normalizedTarget === baseCurrency) {
    return { amount: baseAmount, currency: baseCurrency };
  }

  const asAny = price as unknown as {
    currency_options?: Record<string, { unit_amount?: number | null; unit_amount_decimal?: string | null }>;
  };
  const option = asAny.currency_options?.[normalizedTarget];
  if (option && typeof option.unit_amount === "number") {
    return {
      amount: option.unit_amount / 100,
      currency: normalizedTarget,
    };
  }
  if (option?.unit_amount_decimal) {
    const parsed = Number(option.unit_amount_decimal);
    if (Number.isFinite(parsed)) {
      return {
        amount: parsed / 100,
        currency: normalizedTarget,
      };
    }
  }

  return { amount: baseAmount, currency: baseCurrency };
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    let requestedCurrency: string | null = null;
    let requestedCountry: string | null = null;
    try {
      const body = (await req.json().catch(() => ({}))) as { currency?: string; country?: string };
      requestedCurrency = normalizeCurrency(body?.currency);
      requestedCountry = normalizeCountryIso2(body?.country);
    } catch {
      // no-op
    }
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (accessToken && !requestedCurrency) {
      const { data: authData } = await supabase.auth.getUser(accessToken);
      const userId = authData?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("currency,location_country")
          .eq("id", userId)
          .maybeSingle();
        requestedCurrency = normalizeCurrency(profile?.currency);
        requestedCountry = requestedCountry || normalizeCountryIso2(profile?.location_country);
      }
    }
    const targetCurrency = requestedCurrency || resolveCurrencyByCountry(requestedCountry);

    const required = ["plus_monthly", "plus_annual", "gold_monthly", "gold_annual"];
    for (const key of required) {
      const lookupKey = await resolveLookupKeyFromMetadata(key, targetCurrency);
      if (!lookupKey && !PRICE_IDS[key]) {
        return json({ error: `Stripe config invalid: missing ${key} price id for ${stripeMode} mode` }, 500);
      }
    }

    const results: Record<string, { amount: number; currency: string; interval?: string }> = {};
    for (const [key, priceId] of Object.entries(PRICE_IDS)) {
      let price = null;
      if (CORE_PREMIUM_KEYS.has(key)) {
        if (priceId) {
          price = await stripe.prices.retrieve(priceId, { expand: ["currency_options"] });
        }
      } else {
        const lookupKey = await resolveLookupKeyFromMetadata(key, targetCurrency);
        if (lookupKey) {
          price = await resolvePriceByLookupKey(lookupKey);
        }
        if (!price && priceId) {
          price = await stripe.prices.retrieve(priceId, { expand: ["currency_options"] });
        }
      }
      if (!price) {
        results[key] = DEFAULTS[key];
        continue;
      }
      const localized = resolveLocalizedAmount(price, targetCurrency);
      const safeAmount = Number.isFinite(localized.amount) && localized.amount > 0
        ? localized.amount
        : DEFAULTS[key].amount;
      results[key] = {
        amount: safeAmount,
        currency: safeAmount === localized.amount ? localized.currency : DEFAULTS[key].currency,
        interval: price.recurring?.interval,
      };
    }
    const displayCurrency = String(
      results.plus_monthly?.currency ||
      results.gold_monthly?.currency ||
      Object.values(results)[0]?.currency ||
      "usd",
    ).toLowerCase();

    return json({
      prices: results,
      defaults: DEFAULTS,
      stripe_mode: stripeMode,
      display_currency: displayCurrency,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Failed to fetch pricing" }, 500);
  }
});
