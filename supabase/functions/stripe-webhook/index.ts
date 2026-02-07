// =====================================================
// HUDDLE V14: STRIPE WEBHOOK HANDLER
// Revenue & Monetization Brain - Critical Security
// Handles: Subscriptions, Add-ons, Idempotency, RLS
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
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") as string;
const allowWebhookTestBypass = Deno.env.get("ALLOW_WEBHOOK_TEST_BYPASS") === "true";

// Initialize Supabase client with SERVICE ROLE (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Stripe Product IDs (authoritative registry per APP_MASTER_SPEC)
const STRIPE_PRODUCTS: Record<string, string> = {
  premium: "prod_TuEpCL4vGGwUpk",
  gold: "prod_TuF4blxU2yHqBV",
  star_pack: "prod_TuFPF3zjXiWiK8",
  emergency_alert: "prod_TuFKa021SiFK58",
  vet_media: "prod_TuFLRWYZGrItCP",
};

interface WebhookResponse {
  success: boolean;
  message: string;
  eventId?: string;
}

serve(async (req: Request): Promise<Response> => {
  console.log("[STRIPE WEBHOOK] Received request");

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    const bypassHeader = req.headers.get("x-local-webhook-bypass");
    if (!signature && !(allowWebhookTestBypass && bypassHeader === "true")) {
      console.error("[STRIPE WEBHOOK] Missing signature");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    let event: Stripe.Event;

    // =====================================================
    // STEP 1: VERIFY STRIPE SIGNATURE (CRITICAL SECURITY)
    // =====================================================
    if (allowWebhookTestBypass && bypassHeader === "true") {
      event = JSON.parse(body) as Stripe.Event;
      console.log(`[STRIPE WEBHOOK] Local bypass mode accepted event: ${event.type} (ID: ${event.id})`);
    } else {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        console.log(`[STRIPE WEBHOOK] Verified event: ${event.type} (ID: ${event.id})`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[STRIPE WEBHOOK] Signature verification failed: ${message}`);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // =====================================================
    // STEP 2: IDEMPOTENCY CHECK (PREVENT DOUBLE-PROCESSING)
    // =====================================================
    const { data: existingTransaction } = await supabase
      .from("transactions")
      .select("id")
      .eq("stripe_event_id", event.id)
      .single();

    if (existingTransaction) {
      console.log(`[STRIPE WEBHOOK] Event ${event.id} already processed (idempotent)`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Event already processed",
          eventId: event.id,
        } as WebhookResponse),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // STEP 3: ROUTE TO APPROPRIATE HANDLER
    // =====================================================
    let result: WebhookResponse;

    switch (event.type) {
      case "checkout.session.completed":
        result = await handleCheckoutSessionCompleted(event);
        break;

      case "payment_intent.succeeded":
        result = await handlePaymentIntentSucceeded(event);
        break;

      case "invoice.payment_failed":
        result = await handleInvoicePaymentFailed(event);
        break;

      case "customer.subscription.deleted":
        result = await handleSubscriptionDeleted(event);
        break;

      case "customer.subscription.updated":
        result = await handleSubscriptionUpdated(event);
        break;

      default:
        console.log(`[STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
        return new Response(
          JSON.stringify({ success: true, message: "Event type not handled" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[STRIPE WEBHOOK] Error: ${errMsg}`);
    const message = errMsg.toLowerCase();
    if (message.includes("quota") || message.includes("rate limit")) {
      return new Response(
        JSON.stringify({ success: false, message: "Quota Exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, message: errMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// =====================================================
// HANDLER: checkout.session.completed
// =====================================================
async function handleCheckoutSessionCompleted(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.user_id;
  const type = session.metadata?.type;

  if (!userId) {
    throw new Error("Missing user_id in session metadata");
  }

  console.log(`[CHECKOUT COMPLETED] User: ${userId}, Type: ${type}, Mode: ${session.mode}`);

  // Create transaction record (idempotency enforced by unique stripe_event_id)
  const { error: txError } = await supabase.from("transactions").insert({
    user_id: userId,
    stripe_event_id: event.id,
    stripe_session_id: session.id,
    type: type || "unknown",
    amount: session.amount_total,
    currency: session.currency,
    status: "completed",
    metadata: session.metadata || {},
  });

  if (txError) {
    console.error(`[CHECKOUT COMPLETED] Failed to create transaction: ${txError.message}`);
    throw new Error(`Transaction creation failed: ${txError.message}`);
  }

  // =====================================================
  // SUBSCRIPTION MODE
  // =====================================================
  if (session.mode === "subscription") {
    const subscriptionId = session.subscription as string;
    const tier = type?.startsWith("gold") ? "gold" : "premium";

    // Update user tier and subscription
    const { error: upgradeError } = await supabase.rpc("upgrade_user_tier", {
      p_user_id: userId,
      p_tier: tier,
      p_subscription_status: "active",
      p_stripe_subscription_id: subscriptionId,
    });

    if (upgradeError) {
      console.error(`[CHECKOUT COMPLETED] Failed to upgrade tier: ${upgradeError.message}`);
      throw new Error(`Tier upgrade failed: ${upgradeError.message}`);
    }

    // Update Stripe customer ID if not set
    if (session.customer) {
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: session.customer as string })
        .eq("id", userId);
    }

    console.log(`[CHECKOUT COMPLETED] User ${userId} upgraded to ${tier}`);
  }

  // =====================================================
  // PAYMENT MODE (ADD-ONS)
  // =====================================================
  else if (session.mode === "payment") {
    const creditsMap: Record<string, { stars?: number; mesh?: number; media?: number; family?: number }> = {
      star_pack: { stars: 3 },
      emergency_alert: { mesh: 1 },
      vet_media: { media: 10 },
    };

    const credits = creditsMap[type || ""];
    if (credits) {
      const { error: creditsError } = await supabase.rpc("increment_user_credits", {
        p_user_id: userId,
        p_stars: credits.stars || 0,
        p_mesh_alerts: credits.mesh || 0,
        p_media_credits: credits.media || 0,
        p_family_slots: credits.family || 0,
      });

      if (creditsError) {
        console.error(`[CHECKOUT COMPLETED] Failed to increment credits: ${creditsError.message}`);
        throw new Error(`Credits increment failed: ${creditsError.message}`);
      }

      console.log(`[CHECKOUT COMPLETED] User ${userId} received credits: ${JSON.stringify(credits)}`);
    }

    // Handle marketplace booking paid state
    if (type === "marketplace_booking" && session.payment_intent) {
      await supabase
        .from("marketplace_bookings")
        .update({
          status: "confirmed",
          paid_at: new Date().toISOString(),
          escrow_status: "pending",
        })
        .eq("stripe_payment_intent_id", session.payment_intent as string);
    }
  }

  return {
    success: true,
    message: "Checkout session processed",
    eventId: event.id,
  };
}

// =====================================================
// HANDLER: invoice.payment_failed
// =====================================================
async function handleInvoicePaymentFailed(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  // Find user by stripe_customer_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!profile) {
    console.warn(`[PAYMENT FAILED] No user found for customer: ${customerId}`);
    return { success: true, message: "User not found", eventId: event.id };
  }

  // Downgrade to free tier
  await supabase.rpc("downgrade_user_tier", {
    p_user_id: profile.id,
  });

  // Update subscription_status to past_due
  await supabase
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", profile.id);

  console.log(`[PAYMENT FAILED] User ${profile.id} downgraded to free (past_due)`);

  // TODO: Send email/push notification

  return {
    success: true,
    message: "Payment failed - user downgraded",
    eventId: event.id,
  };
}

// =====================================================
// HANDLER: customer.subscription.deleted
// =====================================================
async function handleSubscriptionDeleted(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!profile) {
    console.warn(`[SUBSCRIPTION DELETED] No user found for customer: ${customerId}`);
    return { success: true, message: "User not found", eventId: event.id };
  }

  await supabase.rpc("downgrade_user_tier", {
    p_user_id: profile.id,
  });

  console.log(`[SUBSCRIPTION DELETED] User ${profile.id} subscription canceled`);

  return {
    success: true,
    message: "Subscription deleted",
    eventId: event.id,
  };
}

// =====================================================
// HANDLER: customer.subscription.updated
// =====================================================
async function handleSubscriptionUpdated(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!profile) {
    console.warn(`[SUBSCRIPTION UPDATED] No user found for customer: ${customerId}`);
    return { success: true, message: "User not found", eventId: event.id };
  }

  // Determine tier from subscription metadata or price
  const tier = subscription.metadata?.tier || "premium";
  const status = subscription.status;

  await supabase
    .from("profiles")
    .update({
      tier: tier,
      subscription_status: status,
      stripe_subscription_id: subscription.id,
    })
    .eq("id", profile.id);

  console.log(`[SUBSCRIPTION UPDATED] User ${profile.id} tier: ${tier}, status: ${status}`);

  return {
    success: true,
    message: "Subscription updated",
    eventId: event.id,
  };
}

// =====================================================
// HANDLER: payment_intent.succeeded
// Updates marketplace_bookings from pending → paid
// Schedules 48-hour escrow release (pg_cron compatible)
// =====================================================
async function handlePaymentIntentSucceeded(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  // Create idempotency transaction record
  const { error: txError } = await supabase.from("transactions").insert({
    user_id: paymentIntent.metadata?.client_id || "system",
    stripe_event_id: event.id,
    stripe_session_id: paymentIntent.id,
    type: paymentIntent.metadata?.type || "payment_intent",
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: "completed",
    metadata: paymentIntent.metadata || {},
  });

  if (txError && txError.code !== "23505") {
    console.error(`[PAYMENT_INTENT] Transaction record error: ${txError.message}`);
  }

  const meta = paymentIntent.metadata;

  // Handle marketplace booking (nanny) payment
  if (meta?.type === "marketplace_booking" || meta?.client_id) {
    const latestCharge =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

    await supabase
      .from("marketplace_bookings")
      .update({
        status: "confirmed",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: latestCharge || null,
        paid_at: new Date().toISOString(),
        escrow_status: "pending",
      })
      .eq("stripe_payment_intent_id", paymentIntent.id);

    console.log(`[PAYMENT_INTENT] Marketplace booking paid: PI=${paymentIntent.id}`);
  }

  // Handle simple nanny booking (from Chats $ icon)
  if (meta?.type === "nanny_booking") {
    const escrowRelease = new Date();
    escrowRelease.setHours(escrowRelease.getHours() + 48);

    await supabase
      .from("marketplace_bookings")
      .insert({
        client_id: meta["user_id"] || "unknown",
        sitter_id: meta.nanny_id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: latestCharge || null,
        amount: paymentIntent.amount,
        platform_fee: Math.round(paymentIntent.amount * 0.1),
        sitter_payout: paymentIntent.amount - Math.round(paymentIntent.amount * 0.1),
        status: "confirmed",
        paid_at: new Date().toISOString(),
        escrow_release_date: escrowRelease.toISOString(),
        escrow_status: "pending",
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[PAYMENT_INTENT] Nanny insert:", message);
      });

    console.log(`[PAYMENT_INTENT] Nanny booking recorded: nanny=${meta.nanny_id}`);
  }

  return {
    success: true,
    message: "Payment intent processed",
    eventId: event.id,
  };
}
