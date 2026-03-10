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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

async function validateExplicitPriceId(priceId: string, mode: "subscription" | "payment") {
  const trimmed = String(priceId || "").trim();
  if (!trimmed) return null;
  const price = await stripe.prices.retrieve(trimmed);
  if (mode === "subscription" && !price.recurring) return null;
  if (mode === "payment" && price.recurring) return null;
  return price.id;
}

serve(async (req: Request) => {
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
    } = await req.json();

    // Enforce auth: require a valid JWT and bind user_id to auth.uid.
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const u = await supabase.auth.getUser(accessToken);
    const authedUserId = u.data?.user?.id || null;
    if (!authedUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!mode || (!type && !items)) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (bodyUserId && bodyUserId !== authedUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = authedUserId;

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

      if (typeof priceId === "string" && priceId.trim().length > 0) {
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

        const resolved = await resolveStripePrice(itemType, false);
        if (!resolved.ok) return resolved.response;

        if (resolved.priceId) {
          lineItems.push({ price: resolved.priceId, quantity: qty });
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
          return new Response(
            JSON.stringify({ error: "Invalid amount for add-on" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
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
