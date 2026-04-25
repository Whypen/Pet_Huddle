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
  family_member: Deno.env.get("STRIPE_PRICE_FAMILY_MEMBER"),
  Family_Member: Deno.env.get("STRIPE_PRICE_FAMILY_MEMBER"),
};

const ADDON_DEFAULTS: Record<string, number> = {
  star_pack: 499,
  emergency_alert: 299,
  vet_media: 399,
  // Add-ons (amounts in cents)
  superBroadcast: 499,
  topProfileBooster: 299,
  sharePerks: 499,
  family_member: 499,
  Family_Member: 499,
};

const requiredSubscriptionTypes = new Set(["plus_monthly", "plus_annual", "gold_monthly", "gold_annual"]);
const SHARED_PERKS_PLAN_KEYS = ["sharePerks", "family_member", "Family_Member", "share_perks"] as const;
const normalizeCheckoutType = (value: string): string => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (SHARED_PERKS_PLAN_KEYS.includes(normalized as typeof SHARED_PERKS_PLAN_KEYS[number])) return "sharePerks";
  if (normalized.toLowerCase() === "familymember") return "sharePerks";
  return normalized;
};
const resolvePlanKeys = (planKey: string): string[] => {
  const normalized = normalizeCheckoutType(planKey);
  if (normalized === "sharePerks") return [...SHARED_PERKS_PLAN_KEYS];
  return [normalized];
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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const isJwt = (value: string): boolean => value.split(".").length === 3;

type CheckoutRequestBody = {
  access_token?: unknown;
  cancelUrl?: unknown;
  country?: unknown;
  currency?: unknown;
  items?: unknown;
  lookupKey?: unknown;
  metadata?: Record<string, string> | null;
  mode?: unknown;
  priceId?: unknown;
  successUrl?: unknown;
  type?: unknown;
  userId?: unknown;
};

const extractUserAccessToken = (req: Request, body: CheckoutRequestBody): string => {
  const bodyToken = String(body.access_token || "").replace(/^Bearer\s+/i, "").trim();
  const huddleToken = (req.headers.get("x-huddle-access-token") || "").replace(/^Bearer\s+/i, "").trim();
  const bearerToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  return [bodyToken, huddleToken, bearerToken].find(
    (token) => isJwt(token) && token !== anonKey && token !== serviceRole,
  ) || "";
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

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

async function buildCheckoutIdempotencyKey(input: {
  userId: string;
  mode: string;
  type: string;
  lookupKey: string;
  priceId: string;
  items: Array<{ type: string; quantity: number }>;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const normalizedItems = [...input.items]
    .map((item) => ({ type: item.type, quantity: item.quantity }))
    .sort((a, b) => (a.type === b.type ? a.quantity - b.quantity : a.type.localeCompare(b.type)));
  const payload = JSON.stringify({
    userId: input.userId,
    mode: input.mode,
    type: input.type,
    lookupKey: input.lookupKey,
    priceId: input.priceId,
    items: normalizedItems,
    currency: input.currency,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hash = toHex(new Uint8Array(digest)).slice(0, 24);
  const bucket = Math.floor(Date.now() / 60000); // 1-minute retry window
  return `huddle_checkout_${hash}_${bucket}`;
}

async function resolveStripePrice(
  type: string,
  required: boolean,
  mode?: "subscription" | "payment",
) {
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
    const price = await stripe.prices.retrieve(priceId);
    if (mode === "subscription" && !price.recurring) {
      return {
        ok: false as const,
        response: json(
          { error: `Invalid checkout mode: ${type} is not a recurring price.` },
          400,
        ),
      };
    }
    if (mode === "payment" && price.recurring) {
      return {
        ok: false as const,
        response: json(
          { error: `Invalid checkout mode: ${type} must use subscription checkout.` },
          400,
        ),
      };
    }
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

async function resolvePriceObjectByLookupKey(lookupKey: string): Promise<Stripe.Price | null> {
  const trimmed = String(lookupKey || "").trim();
  if (!trimmed) return null;
  const list = await stripe.prices.list({
    lookup_keys: [trimmed],
    active: true,
    limit: 1,
  });
  return list.data?.[0] ?? null;
}

async function resolveLookupKeyFromMetadata(planKey: string, currency: string): Promise<string | null> {
  const target = currency.toUpperCase();
  const planKeys = resolvePlanKeys(planKey);
  const { data, error } = await supabase
    .from("plan_metadata")
    .select("stripe_lookup_key,currency")
    .in("plan_key", planKeys)
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

    const body = (await req.json().catch(() => null)) as CheckoutRequestBody | null;
    if (!body) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const {
      userId: bodyUserId,
      type,
      lookupKey,
      priceId,
      mode,
      items,
      metadata: extraMetadata,
      successUrl,
      cancelUrl,
      currency,
      country,
    } = body;

    // Enforce auth: require a valid JWT and bind user_id to auth.uid.
    const accessToken = extractUserAccessToken(req, body);
    const u = await supabase.auth.getUser(accessToken);
    const authedUserId = u.data?.user?.id || null;
    if (!authedUserId) {
      return json({ error: "Unauthorized" }, 401);
    }

    const checkoutMode = mode === "subscription" || mode === "payment" ? mode : null;
    if (!checkoutMode || (!type && !items)) {
      return json({ error: "Missing required parameters" }, 400);
    }

    if (bodyUserId && String(bodyUserId) !== authedUserId) {
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

    const normalizedType = normalizeCheckoutType(typeof type === "string" ? type : "");
    const normalizedItems = Array.isArray(items)
      ? items
          .map((item) => {
            const rec = (typeof item === "object" && item !== null) ? (item as Record<string, unknown>) : {};
            return {
              type: typeof rec.type === "string" ? rec.type : String(rec.type || ""),
              quantity: Math.max(1, Number(rec.quantity || 1)),
            };
          })
          .filter((item) => item.type.length > 0)
      : [];
    const idempotencyKey = await buildCheckoutIdempotencyKey({
      userId,
      mode: checkoutMode,
      type: normalizedType,
      lookupKey: typeof lookupKey === "string" ? lookupKey : "",
      priceId: typeof priceId === "string" ? priceId : "",
      items: normalizedItems,
      currency: checkoutCurrency,
      successUrl: String(successUrl || ""),
      cancelUrl: String(cancelUrl || ""),
    });

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: checkoutMode,
      success_url: String(successUrl || ""),
      cancel_url: String(cancelUrl || ""),
      metadata: {
        user_id: userId,
        type: normalizedType,
        ...(extraMetadata || {}), // Merge extra metadata (e.g., nanny_id, nanny_name)
      },
    };

    if (checkoutMode === "subscription") {
      if (normalizedItems.length > 0) {
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
        for (const item of normalizedItems) {
          const itemType = normalizeCheckoutType(String(item.type || ""));
          const qty = Math.max(1, Number(item.quantity || 1));
          let price: Stripe.Price | null = null;

          const dynamicLookup = await resolveLookupKeyFromMetadata(itemType, checkoutCurrency);
          if (dynamicLookup) {
            price = await resolvePriceObjectByLookupKey(dynamicLookup);
          }
          if (!price) {
            const envPriceId = STRIPE_PRICE_IDS[itemType];
            if (envPriceId) {
              price = await stripe.prices.retrieve(envPriceId);
            }
          }
          if (!price) {
            return json({ error: `Unknown subscription item type: ${itemType}` }, 400);
          }

          if (itemType === "sharePerks" && !price.recurring) {
            return json({ error: "Invalid Share Perks price: must be recurring." }, 400);
          }
          if (itemType !== "sharePerks" && price.recurring) {
            return json({ error: `Invalid add-on price for ${itemType}: must be one-time.` }, 400);
          }

          lineItems.push({ price: price.id, quantity: qty });
        }

        sessionParams.line_items = lineItems;
        sessionParams.payment_method_types = ["card"];
      } else {
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

      if (!resolvedPriceId) {
        if (!requiredSubscriptionTypes.has(normalizedType) && !STRIPE_PRICE_IDS[normalizedType]) {
          return json({ error: `Unknown subscription type: ${normalizedType}` }, 400);
        }
        const resolved = await resolveStripePrice(normalizedType, true, "subscription");
        if (!resolved.ok) return resolved.response;
        resolvedPriceId = resolved.priceId || null;
      }
      if (!resolvedPriceId) {
        return json({ error: "Unable to resolve subscription price." }, 400);
      }

      sessionParams.line_items = [{ price: resolvedPriceId, quantity: 1 }];
      sessionParams.payment_method_types = ["card"];
      }
    } else {
      const rawItems = normalizedItems.length > 0 ? normalizedItems : [{ type: normalizedType, quantity: 1 }];
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

      for (const item of rawItems) {
        const itemType = normalizeCheckoutType(String(item.type || ""));
        const qty = Math.max(1, Number(item.quantity || 1));
        if (itemType === "sharePerks") {
          return json(
            { error: "Invalid checkout mode: sharePerks must use subscription checkout." },
            400,
          );
        }
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
          const resolved = await resolveStripePrice(itemType, false, "payment");
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
