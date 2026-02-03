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

// =====================================================
// STRIPE PRODUCT ID MAP — live IDs from Stripe Dashboard
// Subscriptions: premium_monthly / premium_annual use the
//   same Product; Stripe resolves the correct Price by the
//   plan key passed in from Premium.tsx.
// Add-ons: one-time payment mode — amount is set by the
//   client; Product ID is attached for receipt labelling.
// =====================================================
const STRIPE_PRODUCTS: Record<string, string> = {
  // Subscription tiers
  premium_monthly:  "prod_TuEpCL4vGGwUpk",
  premium_annual:   "prod_TuEpCL4vGGwUpk",  // same Product; annual Price is a child
  gold_monthly:     "prod_TuF4blxU2yHqBV",
  gold_annual:      "prod_TuF4blxU2yHqBV",  // same Product; annual Price is a child

  // Identity & badges
  verified_badge:   "prod_TuFRNkLiOOKuHZ",

  // Add-on packs
  star_pack:        "prod_TuFPF3zjXiWiK8",
  emergency_alert:  "prod_TuFKa021SiFK58",
  vet_media:        "prod_TuFLRWYZGrItCP",
  family_slot:      "prod_TuFNGDVKRYPPsG",
  "5_media_pack":   "prod_TuFQ8x2UN7yYjm",
  "7_day_extension":"prod_TuFIj3NC2W7TvV",
};

serve(async (req: Request) => {
  try {
    const {
      userId,
      type,
      mode,
      amount,
      metadata: extraMetadata,
      successUrl,
      cancelUrl,
    } = await req.json();

    if (!userId || !type || !mode) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email,
        metadata: { user_id: userId },
      });

      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Generate idempotency key
    const idempotencyKey = `${userId}-${type}-${Date.now()}`;

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
      // Recurring prices — authoritative amounts live server-side
      const SUB_PRICES: Record<string, { amount: number; interval: "month" | "year" }> = {
        premium_monthly: { amount: 899,   interval: "month" },
        premium_annual:  { amount: 8000,  interval: "year"  },
        gold_monthly:    { amount: 1999,  interval: "month" },
        gold_annual:     { amount: 18000, interval: "year"  },
      };

      const sub = SUB_PRICES[type];
      if (!sub) {
        return new Response(
          JSON.stringify({ error: `Unknown subscription type: ${type}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      sessionParams.line_items = [
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
      // One-time payment — attach the live Product ID so the
      // Stripe receipt shows the correct product name & SKU.
      const productId = STRIPE_PRODUCTS[type];
      sessionParams.line_items = [
        {
          price_data: {
            currency: "usd",
            ...(productId
              ? { product: productId }
              : { product_data: { name: type.replace(/_/g, " ").toUpperCase() } }
            ),
            unit_amount: amount,
          },
          quantity: 1,
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Checkout session error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
