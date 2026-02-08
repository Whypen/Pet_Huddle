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
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =====================================================
// STRIPE PRODUCT/PRICE MAP — dynamic pricing via Stripe
// =====================================================
const STRIPE_PRODUCTS: Record<string, string> = {
  premium_monthly: "prod_TuEpCL4vGGwUpk",
  premium_annual: "prod_TuEpCL4vGGwUpk",
  gold_monthly: "prod_TuF4blxU2yHqBV",
  gold_annual: "prod_TuF4blxU2yHqBV",
  star_pack: "prod_TuFPF3zjXiWiK8",
  emergency_alert: "prod_TuFKa021SiFK58",
  vet_media: "prod_TuFLRWYZGrItCP",
};

const STRIPE_PRICE_IDS: Record<string, string | undefined> = {
  premium_monthly: Deno.env.get("STRIPE_PRICE_PREMIUM_MONTHLY"),
  premium_annual: Deno.env.get("STRIPE_PRICE_PREMIUM_ANNUAL"),
  gold_monthly: Deno.env.get("STRIPE_PRICE_GOLD_MONTHLY"),
  gold_annual: Deno.env.get("STRIPE_PRICE_GOLD_ANNUAL"),
  star_pack: Deno.env.get("STRIPE_PRICE_STAR_PACK"),
  emergency_alert: Deno.env.get("STRIPE_PRICE_BROADCAST_ALERT"),
  vet_media: Deno.env.get("STRIPE_PRICE_MEDIA_10"),
};

const SUB_DEFAULTS: Record<string, { amount: number; interval: "month" | "year" }> = {
  premium_monthly: { amount: 999, interval: "month" },
  premium_annual: { amount: 8099, interval: "year" },
  gold_monthly: { amount: 1999, interval: "month" },
  gold_annual: { amount: 18099, interval: "year" },
};

const ADDON_DEFAULTS: Record<string, number> = {
  star_pack: 499,
  emergency_alert: 299,
  vet_media: 399,
};

serve(async (req: Request) => {
  try {
    const {
      userId: bodyUserId,
      type,
      mode,
      items,
      amount,
      metadata: extraMetadata,
      successUrl,
      cancelUrl,
    } = await req.json();

    // Enforce auth: require a valid JWT and bind user_id to auth.uid.
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const u = await userClient.auth.getUser();
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

    // Create checkout session
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
        type,
        ...(extraMetadata || {}), // Merge extra metadata (e.g., nanny_id, nanny_name)
      },
    };

    if (mode === "subscription") {
      const sub = SUB_DEFAULTS[type];
      if (!sub) {
        return new Response(
          JSON.stringify({ error: `Unknown subscription type: ${type}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const priceId = STRIPE_PRICE_IDS[type];
      sessionParams.line_items = priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: "usd",
                product: STRIPE_PRODUCTS[type],
                recurring: { interval: sub.interval },
                unit_amount: sub.amount,
              },
              quantity: 1,
            },
          ];
      sessionParams.payment_method_types = ["card"];
    } else {
      const lineItems = (items && Array.isArray(items) ? items : [{ type, quantity: 1 }]).map(
        (item: unknown) => {
          const rec = (typeof item === "object" && item !== null) ? (item as Record<string, unknown>) : {};
          const itemType = typeof rec.type === "string" ? rec.type : String(rec.type || "");
          const qty = Math.max(1, Number(rec.quantity || 1));
          const expectedAmount = ADDON_DEFAULTS[itemType];
          if (!expectedAmount) {
            throw new Error(`Unknown add-on type: ${itemType}`);
          }
          const priceId = STRIPE_PRICE_IDS[itemType];
          if (priceId) {
            return { price: priceId, quantity: qty };
          }
          const productId = STRIPE_PRODUCTS[itemType];
          return {
            price_data: {
              currency: "usd",
              ...(productId
                ? { product: productId }
                : { product_data: { name: String(itemType).replace(/_/g, " ").toUpperCase() } }
              ),
              unit_amount: expectedAmount,
            },
            quantity: qty,
          };
        }
      );

      if (amount) {
        const expected = lineItems.reduce((sum, li) => {
          if ("price_data" in li && li.price_data?.unit_amount) {
            return sum + (li.price_data.unit_amount * (li.quantity || 1));
          }
          return sum;
        }, 0);
        if (expected && amount !== expected) {
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

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Checkout session error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    const message = errMsg.toLowerCase();
    if (message.includes("quota") || message.includes("rate limit")) {
      return new Response(
        JSON.stringify({ error: "Quota Exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
