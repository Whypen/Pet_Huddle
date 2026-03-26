// =====================================================
// CREATE STRIPE CHECKOUT SESSION
// Handles subscriptions and one-time payments
// =====================================================

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

// =====================================================
// STRIPE PRICE MAP (canonical env names per MASTER_SPEC)
// =====================================================
const STRIPE_PRICE_IDS: Record<string, string | undefined> = {
  plus_monthly: Deno.env.get("STRIPE_PRICE_PLUS_MONTHLY"),
  plus_annual: Deno.env.get("STRIPE_PRICE_PLUS_ANNUAL"),
  gold_monthly: Deno.env.get("STRIPE_PRICE_GOLD_MONTHLY"),
  gold_annual: Deno.env.get("STRIPE_PRICE_GOLD_ANNUAL"),
  star_pack: Deno.env.get("STRIPE_PRICE_STAR_PACK"),
  emergency_alert: Deno.env.get("STRIPE_PRICE_BROADCAST_ALERT"),
  vet_media: Deno.env.get("STRIPE_PRICE_MEDIA_10"),
  // Add-ons
  superBroadcast: Deno.env.get("STRIPE_PRICE_SUPER_BROADCAST"),
  topProfileBooster: Deno.env.get("STRIPE_PRICE_TOP_PROFILE"),
  sharePerks: Deno.env.get("STRIPE_PRICE_FAMILY_MEMBER"),
};

const ADDON_DEFAULTS: Record<string, number> = {
  star_pack: 499,
  emergency_alert: 299,
  vet_media: 399,
  // Add-ons (amounts in cents)
  superBroadcast: 499,
  topProfileBooster: 299,
  sharePerks: 499,
};

const requiredSubscriptionTypes = new Set(["plus_monthly", "plus_annual", "gold_monthly", "gold_annual"]);
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

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

async function resolveStripePrice(type: string, required: boolean) {
  const priceId = STRIPE_PRICE_IDS[type];
  if (!priceId) {
    if (required) {
      return {
        ok: false as const,
        response: json(
          {
            error: `Stripe config invalid: missing ${type} price id for ${stripeMode} mode.`,
          },
          500,
        ),
      };
    }
    return { ok: true as const, priceId: undefined };
  }

  try {
    await stripe.prices.retrieve(priceId);
    return { ok: true as const, priceId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false as const,
      response: json(
        {
          error: `Stripe config mismatch: ${type} price id is not valid for ${stripeMode} mode key.`,
          detail: message,
        },
        500,
      ),
    };
  }
}

async function resolvePriceByLookupKey(lookupKey: string, mode: "subscription" | "payment") {
  const trimmed = String(lookupKey || "").trim();
  if (!trimmed) return null;
  const list = await stripe.prices.list({
    lookup_keys: [trimmed],
    active: true,
    limit: 1,
  });
  const price = list.data?.[0];
  if (!price) return null;
  if (mode === "subscription" && !price.recurring) return null;
  if (mode === "payment" && price.recurring) return null;
  return price.id;
}

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

async function validateExplicitPriceId(priceId: string, mode: "subscription" | "payment") {
  const trimmed = String(priceId || "").trim();
  if (!trimmed) return null;
  const price = await stripe.prices.retrieve(trimmed);
  if (mode === "subscription" && !price.recurring) return null;
  if (mode === "payment" && price.recurring) return null;
  return price.id;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    console.log(`[CHECKOUT] Stripe mode=${stripeMode}`);

    const {
      userId: bodyUserId,
      type,
      lookupKey,
      priceId,
      mode,
      items,
      amount,
      metadata: extraMetadata,
      successUrl,
      cancelUrl,
      currency,
      country,
    } = await req.json();

    // Enforce auth: require a valid JWT and bind user_id to auth.uid.
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const u = await supabase.auth.getUser(accessToken);
    const authedUserId = u.data?.user?.id || null;
    if (!authedUserId) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!mode || (!type && !items)) {
      return json({ error: "Missing required parameters" }, 400);
    }

    if (bodyUserId && bodyUserId !== authedUserId) {
      return json({ error: "Forbidden" }, 403);
    }

    const userId = authedUserId;
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("currency,location_country")
      .eq("id", userId)
      .maybeSingle();
    const profileCurrency = normalizeCurrency(userProfile?.currency);
    const profileCountry = normalizeCountryIso2(userProfile?.location_country);
    const bodyCurrency = normalizeCurrency(currency);
    const bodyCountry = normalizeCountryIso2(country);
    const checkoutCurrency = bodyCurrency || profileCurrency || resolveCurrencyByCountry(bodyCountry || profileCountry);

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const authUser = await supabase.auth.admin.getUserById(userId);
      const email = authUser.data?.user?.email || undefined;
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: userId },
      });

      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Generate idempotency key
    const idempotencyKey = `${userId}-${type || "cart"}-${crypto.randomUUID()}`;

    const normalizedType = typeof type === "string" ? type : "";

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
        type: normalizedType,
        ...(extraMetadata || {}), // Merge extra metadata (e.g., nanny_id, nanny_name)
      },
    };

    if (mode === "subscription") {
      let resolvedPriceId: string | null = null;

      if (!resolvedPriceId) {
        const dynamicLookup = await resolveLookupKeyFromMetadata(normalizedType, checkoutCurrency);
        if (dynamicLookup) {
          resolvedPriceId = await resolvePriceByLookupKey(dynamicLookup, "subscription");
        }
      }

      if (!resolvedPriceId && typeof priceId === "string" && priceId.trim().length > 0) {
        resolvedPriceId = await validateExplicitPriceId(priceId, "subscription");
      }

      if (!resolvedPriceId && typeof lookupKey === "string" && lookupKey.trim().length > 0) {
        resolvedPriceId = await resolvePriceByLookupKey(lookupKey, "subscription");
      }

      if (!resolvedPriceId && !requiredSubscriptionTypes.has(normalizedType)) {
        return json({ error: `Unknown subscription type: ${normalizedType}` }, 400);
      }

      if (!resolvedPriceId) {
        const resolved = await resolveStripePrice(normalizedType, true);
        if (!resolved.ok) return resolved.response;
        resolvedPriceId = resolved.priceId || null;
      }
      if (!resolvedPriceId) {
        return json({ error: "Unable to resolve subscription price." }, 400);
      }

      sessionParams.line_items = [{ price: resolvedPriceId, quantity: 1 }];
      sessionParams.payment_method_types = ["card"];
    } else {
      const rawItems = (items && Array.isArray(items) ? items : [{ type, quantity: 1 }]);
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
      let fallbackTotal = 0;

      for (const item of rawItems) {
        const rec = (typeof item === "object" && item !== null) ? (item as Record<string, unknown>) : {};
        const itemType = typeof rec.type === "string" ? rec.type : String(rec.type || "");
        const qty = Math.max(1, Number(rec.quantity || 1));
        const expectedAmount = ADDON_DEFAULTS[itemType];
        if (!expectedAmount) {
          throw new Error(`Unknown add-on type: ${itemType}`);
        }

        let resolvedPriceId: string | null = null;
        const dynamicLookup = await resolveLookupKeyFromMetadata(itemType, checkoutCurrency);
        if (dynamicLookup) {
          resolvedPriceId = await resolvePriceByLookupKey(dynamicLookup, "payment");
        }
        if (!resolvedPriceId) {
          const resolved = await resolveStripePrice(itemType, false);
          if (!resolved.ok) return resolved.response;
          resolvedPriceId = resolved.priceId || null;
        }

        if (resolvedPriceId) {
          lineItems.push({ price: resolvedPriceId, quantity: qty });
        } else {
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: { name: String(itemType).replace(/_/g, " ").toUpperCase() },
              unit_amount: expectedAmount,
            },
            quantity: qty,
          });
          fallbackTotal += expectedAmount * qty;
        }
      }

      if (amount) {
        if (fallbackTotal && amount !== fallbackTotal) {
          return json({ error: "Invalid amount for add-on" }, 400);
        }
      }

      sessionParams.line_items = lineItems;
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey,
    });

    return json({ url: session.url }, 200);
  } catch (error: unknown) {
    console.error("Checkout session error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return json({ error: errMsg }, 500);
  }
});
