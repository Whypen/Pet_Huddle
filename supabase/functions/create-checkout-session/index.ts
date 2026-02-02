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

// Product to Price ID mapping (fetch dynamically in production)
const PRICE_IDS: Record<string, string> = {
  premium_monthly: "price_premium_monthly",
  premium_annual: "price_premium_annual",
  gold_monthly: "price_gold_monthly",
  gold_annual: "price_gold_annual",
  star_pack: "price_star_pack",
  emergency_alert: "price_emergency_alert",
  vet_media: "price_vet_media",
  family_slot: "price_family_slot",
  verified_badge: "price_verified_badge",
  "5_media_pack": "price_5_media_pack",
  "7_day_extension": "price_7_day_extension",
};

serve(async (req: Request) => {
  try {
    const {
      userId,
      type,
      mode,
      amount,
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
      },
    };

    if (mode === "subscription") {
      sessionParams.line_items = [
        {
          price: PRICE_IDS[type] || "price_premium_monthly",
          quantity: 1,
        },
      ];
      sessionParams.payment_method_types = ["card"];
    } else {
      sessionParams.line_items = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: type.replace(/_/g, " ").toUpperCase(),
            },
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
