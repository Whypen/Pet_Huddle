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
  plus: "prod_TuEpCL4vGGwUpk",
  gold: "prod_TuF4blxU2yHqBV",
  star_pack: "prod_TuFPF3zjXiWiK8",
  emergency_alert: "prod_TuFKa021SiFK58",
  vet_media: "prod_TuFLRWYZGrItCP",
};
const SHARE_PERKS_PRICE_ID = Deno.env.get("STRIPE_PRICE_FAMILY_MEMBER") || "";
const SHARE_PERKS_KEYS = new Set(["sharePerks", "family_member", "Family_Member", "share_perks", "familymember"]);

interface WebhookResponse {
  success: boolean;
  message: string;
  eventId?: string;
}

function normalizeType(value?: string | null): string {
  return String(value || "").trim();
}

function isSharePerksType(value?: string | null): boolean {
  const raw = normalizeType(value);
  if (!raw) return false;
  if (SHARE_PERKS_KEYS.has(raw)) return true;
  return SHARE_PERKS_KEYS.has(raw.toLowerCase());
}

function extractSharePerksSubscriptionIds(prefs: unknown): string[] {
  if (!prefs || typeof prefs !== "object") return [];
  const key = (prefs as Record<string, unknown>).share_perks_subscription_ids;
  if (!Array.isArray(key)) return [];
  return key.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
}

function buildSharePerksPrefs(prefs: unknown, ids: string[]): Record<string, unknown> {
  const base = prefs && typeof prefs === "object" ? { ...(prefs as Record<string, unknown>) } : {};
  if (ids.length > 0) {
    base.share_perks_subscription_ids = ids;
  } else {
    delete base.share_perks_subscription_ids;
  }
  return base;
}

function subscriptionContainsSharePerksPrice(subscription: Stripe.Subscription): boolean {
  if (!SHARE_PERKS_PRICE_ID) return false;
  const items = subscription.items?.data || [];
  return items.some((item) => item?.price?.id === SHARE_PERKS_PRICE_ID);
}

function isSharePerksSubscription(subscription: Stripe.Subscription): boolean {
  return isSharePerksType(subscription.metadata?.type) || subscriptionContainsSharePerksPrice(subscription);
}

function mapStripeStatusToProfileStatus(status: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active" || normalized === "trialing") return "premium_active";
  if (normalized === "past_due" || normalized === "incomplete") return "premium_pending";
  if (normalized === "canceled" || normalized === "unpaid" || normalized === "incomplete_expired") return "premium_cancelled";
  return "premium_pending";
}

async function grantSharePerksSlot(userId: string, subscriptionId: string): Promise<void> {
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("family_slots, prefs")
    .eq("id", userId)
    .single();
  if (profileErr) throw new Error(`Share Perks profile read failed: ${profileErr.message}`);

  const existingIds = extractSharePerksSubscriptionIds(profile?.prefs);
  if (existingIds.includes(subscriptionId)) return;

  const nextIds = [...existingIds, subscriptionId];
  const currentSlots = Number(profile?.family_slots || 0);
  const nextSlots = Math.min(3, Math.max(0, currentSlots + 1));

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      family_slots: nextSlots,
      prefs: buildSharePerksPrefs(profile?.prefs, nextIds),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updateErr) throw new Error(`Share Perks slot grant failed: ${updateErr.message}`);
}

async function revokeSharePerksSlotByCustomer(customerId: string, subscriptionId: string): Promise<void> {
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, family_slots, prefs")
    .eq("stripe_customer_id", customerId)
    .single();
  if (profileErr || !profile?.id) return;

  const existingIds = extractSharePerksSubscriptionIds(profile.prefs);
  if (!existingIds.includes(subscriptionId)) return;

  const nextIds = existingIds.filter((id) => id !== subscriptionId);
  const currentSlots = Number(profile.family_slots || 0);
  const nextSlots = Math.max(0, currentSlots - 1);

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      family_slots: nextSlots,
      prefs: buildSharePerksPrefs(profile.prefs, nextIds),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (updateErr) throw new Error(`Share Perks slot revoke failed: ${updateErr.message}`);
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
        // Fallback for signature drift: verify by authoritative event retrieval.
        // This still requires a valid Stripe event id from our own account.
        const parsed = JSON.parse(body) as Partial<Stripe.Event> | null;
        const eventId = String(parsed?.id || "").trim();
        if (!eventId) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const remoteEvent = await stripe.events.retrieve(eventId).catch(() => null);
        if (!remoteEvent || remoteEvent.type !== parsed?.type) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        event = remoteEvent;
        console.warn(`[STRIPE WEBHOOK] Accepted via Stripe API fallback: ${event.type} (ID: ${event.id})`);
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

      case "account.updated":
        result = await handleAccountUpdated(event);
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
    if (isSharePerksType(type)) {
      await grantSharePerksSlot(userId, subscriptionId);
      const sharePerksSub = await stripe.subscriptions.retrieve(subscriptionId);
      const sharePerksPeriodEnd = typeof sharePerksSub.current_period_end === "number"
        ? new Date(sharePerksSub.current_period_end * 1000).toISOString()
        : null;
      if (session.customer) {
        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: session.customer as string,
            share_perks_subscription_id: subscriptionId,
            share_perks_subscription_status: sharePerksSub.status,
            share_perks_subscription_current_period_end: sharePerksPeriodEnd,
            share_perks_cancel_at_period_end: sharePerksSub.cancel_at_period_end === true,
            share_perks_cancel_requested_at: null,
            share_perks_cancel_reason: null,
            share_perks_cancel_reason_other: null,
          })
          .eq("id", userId);
      }
      console.log(`[CHECKOUT COMPLETED] User ${userId} granted Share Perks slot for subscription ${subscriptionId}`);
      return {
        success: true,
        message: "Checkout session processed (Share Perks)",
        eventId: event.id,
      };
    }

    const tier = type?.startsWith("gold") ? "gold" : "plus";

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
        .update({
          stripe_customer_id: session.customer as string,
          subscription_cancel_at_period_end: false,
          subscription_cancel_requested_at: null,
          subscription_cancel_reason: null,
          subscription_cancel_reason_other: null,
        })
        .eq("id", userId);
    }

    console.log(`[CHECKOUT COMPLETED] User ${userId} upgraded to ${tier}`);
  }

  // =====================================================
  // PAYMENT MODE (ADD-ONS)
  // =====================================================
  else if (session.mode === "payment") {
    const creditsMap: Record<string, { stars?: number; mesh?: number; media?: number; family?: number; boosterHours?: number }> = {
      star_pack: { stars: 3 },
      emergency_alert: { mesh: 1 },
      vet_media: { media: 10 },
      superBroadcast: { mesh: 1 },
      family_member: { family: 1 },
      sharePerks: { family: 1 },
      topProfileBooster: { boosterHours: 24 },
      top_profile_booster: { boosterHours: 24 },
    };

    const credits = creditsMap[type || ""];
    if (credits && (credits.stars || credits.mesh || credits.media || credits.family)) {
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

    if (credits?.boosterHours && credits.boosterHours > 0) {
      const { data: profile, error: profileReadError } = await supabase
        .from("profiles")
        .select("top_profile_boost_until")
        .eq("id", userId)
        .single();
      if (profileReadError) {
        console.error(`[CHECKOUT COMPLETED] Failed to read top_profile_boost_until: ${profileReadError.message}`);
        throw new Error(`Top profile booster read failed: ${profileReadError.message}`);
      }
      const base = profile?.top_profile_boost_until ? new Date(profile.top_profile_boost_until) : new Date();
      const now = new Date();
      const anchor = base > now ? base : now;
      anchor.setHours(anchor.getHours() + credits.boosterHours);
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ top_profile_boost_until: anchor.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (profileUpdateError) {
        console.error(`[CHECKOUT COMPLETED] Failed to grant top profile booster: ${profileUpdateError.message}`);
        throw new Error(`Top profile booster grant failed: ${profileUpdateError.message}`);
      }
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

    // Handle service chat booking (from create-service-payment).
    // Advance status pending → booked and record the PaymentIntent ID so that
    // release-service-payout can retrieve and transfer funds after completion.
    if (type === "service_booking" && session.metadata?.service_chat_id && session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as { id?: string } | null)?.id ?? null;
      if (paymentIntentId) {
        const { error: chatErr } = await supabase
          .from("service_chats")
          .update({
            status: "booked",
            stripe_payment_intent_id: paymentIntentId,
            booked_at: new Date().toISOString(),
          })
          .eq("chat_id", session.metadata.service_chat_id)
          .eq("status", "pending"); // idempotent: only advances from pending
        if (chatErr) {
          console.error(`[CHECKOUT COMPLETED] service_booking advance failed: ${chatErr.message}`);
        } else {
          console.log(`[CHECKOUT COMPLETED] service_booking booked: chat=${session.metadata.service_chat_id} pi=${paymentIntentId}`);
        }
      }
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

  // Keep active tier during dunning window. Stripe may recover payment in-retry.
  await supabase
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", profile.id);

  console.log(`[PAYMENT FAILED] User ${profile.id} marked past_due (no immediate downgrade)`);

  // TODO: Send email/push notification

  return {
    success: true,
    message: "Payment failed - user marked past_due",
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
  const isSharePerks = isSharePerksSubscription(subscription);

  if (isSharePerks) {
    await revokeSharePerksSlotByCustomer(customerId, subscription.id);
    await supabase
      .from("profiles")
      .update({
        share_perks_subscription_id: null,
        share_perks_subscription_status: "canceled",
        share_perks_subscription_current_period_end: null,
        share_perks_cancel_at_period_end: false,
      })
      .eq("stripe_customer_id", customerId);
    console.log(`[SUBSCRIPTION DELETED] Share Perks removed for customer ${customerId}, sub ${subscription.id}`);
    return {
      success: true,
      message: "Share Perks subscription deleted",
      eventId: event.id,
    };
  }

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

  // Clear cycle anchor details to avoid stale anniversary-based resets.
  await supabase
    .from("profiles")
    .update({
      subscription_cycle_anchor_day: null,
      subscription_current_period_start: null,
      subscription_current_period_end: null,
      subscription_cancel_at_period_end: false,
      subscription_cancel_requested_at: null,
    })
    .eq("id", profile.id);

  console.log(`[SUBSCRIPTION DELETED] User ${profile.id} subscription canceled`);

  // Brevo CRM sync — fire-and-forget, fail open
  const brevoSyncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/brevo-sync`;
  fetch(brevoSyncUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event: "subscription_changed", user_id: profile.id, tier: "free", subscription_status: "canceled" }),
  }).catch((err) => console.warn("[stripe-webhook] brevo-sync subscription_changed failed silently", err));

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
  const isSharePerks = isSharePerksSubscription(subscription);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,share_perks_cancel_requested_at,subscription_cancel_requested_at")
    .eq("stripe_customer_id", customerId)
    .single();

  if (!profile) {
    console.warn(`[SUBSCRIPTION UPDATED] No user found for customer: ${customerId}`);
    return { success: true, message: "User not found", eventId: event.id };
  }

  if (isSharePerks) {
    const terminal = new Set(["canceled", "incomplete_expired", "unpaid"]);
    const sharePerksPeriodEnd = typeof subscription.current_period_end === "number"
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;
    const sharePerksCancelRequestedAt = subscription.cancel_at_period_end
      ? (profile?.share_perks_cancel_requested_at || new Date().toISOString())
      : null;

    await supabase
      .from("profiles")
      .update({
        share_perks_subscription_id: subscription.id,
        share_perks_subscription_status: subscription.status,
        share_perks_subscription_current_period_end: sharePerksPeriodEnd,
        share_perks_cancel_at_period_end: subscription.cancel_at_period_end === true,
        share_perks_cancel_requested_at: sharePerksCancelRequestedAt,
      })
      .eq("id", profile.id);

    if (terminal.has(subscription.status)) {
      await revokeSharePerksSlotByCustomer(customerId, subscription.id);
      await supabase
        .from("profiles")
        .update({
          share_perks_subscription_id: null,
          share_perks_subscription_status: subscription.status,
          share_perks_subscription_current_period_end: null,
          share_perks_cancel_at_period_end: false,
        })
        .eq("id", profile.id);
      return {
        success: true,
        message: "Share Perks subscription terminal update handled",
        eventId: event.id,
      };
    }
    // Renewal/active updates must not mutate tier or re-grant slots.
    return {
      success: true,
      message: "Share Perks subscription updated (no tier mutation)",
      eventId: event.id,
    };
  }

  // Determine tier from subscription metadata or price
  const tierRaw = String(subscription.metadata?.tier || "plus").toLowerCase();
  const tier = tierRaw === "gold" ? "gold" : "plus";
  const status = mapStripeStatusToProfileStatus(subscription.status);

  // For anniversary-based monthly quota resets, persist a stable day-of-month anchor.
  // Stripe provides billing_cycle_anchor (seconds since epoch). Fall back to current_period_start.
  const anchorSeconds =
    typeof subscription.billing_cycle_anchor === "number"
      ? subscription.billing_cycle_anchor
      : typeof subscription.current_period_start === "number"
        ? subscription.current_period_start
        : null;
  const anchorDay =
    anchorSeconds != null ? new Date(anchorSeconds * 1000).getUTCDate() : null;

  await supabase
    .from("profiles")
    .update({
      tier: tier,
      subscription_status: status,
      stripe_subscription_id: subscription.id,
      subscription_cycle_anchor_day: anchorDay,
      subscription_current_period_start:
        typeof subscription.current_period_start === "number"
          ? new Date(subscription.current_period_start * 1000).toISOString()
          : null,
      subscription_current_period_end:
        typeof subscription.current_period_end === "number"
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      subscription_cancel_at_period_end: subscription.cancel_at_period_end === true,
      subscription_cancel_requested_at: subscription.cancel_at_period_end
        ? (profile?.subscription_cancel_requested_at || new Date().toISOString())
        : null,
    })
    .eq("id", profile.id);

  console.log(`[SUBSCRIPTION UPDATED] User ${profile.id} tier: ${tier}, status: ${status}`);

  // Brevo CRM sync — fire-and-forget, fail open
  const brevoSyncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/brevo-sync`;
  fetch(brevoSyncUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event: "subscription_changed", user_id: profile.id, tier, subscription_status: status }),
  }).catch((err) => console.warn("[stripe-webhook] brevo-sync subscription_changed failed silently", err));

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

    // Derive fee amounts from payment intent metadata (set by checkout creation)
    // or from Stripe's captured application_fee_amount. Never recalculate from
    // paymentIntent.amount alone because that is now the customer total (quote × 1.10),
    // not the quote, so a raw × 0.1 multiply would produce incorrect values.
    const nannyQuoteCents = Number(meta?.quote_amount_cents || 0);
    const nannyPlatformGross = Number(meta?.platform_gross_cents || 0)
      || (typeof paymentIntent.application_fee_amount === "number" ? paymentIntent.application_fee_amount : 0);
    const nannyRequesterFee = Number(meta?.requester_fee_cents || 0);
    const nannyProviderFee = Number(meta?.provider_fee_cents || 0);
    const nannySitterPayout = Number(meta?.provider_payout_cents || 0)
      || (paymentIntent.amount - nannyPlatformGross);

    const nannyLatestCharge =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

    await supabase
      .from("marketplace_bookings")
      .insert({
        client_id: meta["user_id"] || "unknown",
        sitter_id: meta.nanny_id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: nannyLatestCharge || null,
        amount: paymentIntent.amount,           // customer total
        platform_fee: nannyPlatformGross,        // gross platform capture
        sitter_payout: nannySitterPayout,        // provider payout
        quote_amount: nannyQuoteCents || null,
        requester_fee: nannyRequesterFee || null,
        provider_fee: nannyProviderFee || null,
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

// =====================================================
// HANDLER: account.updated (Stripe Connect wallet sync)
// =====================================================
// Does NOT insert into transactions — Connect account updates
// are not financial events and have their own dedup via DB state.
// Notification dedup rule: single canonical check — only send
// wallet_connected notification when stripe_onboarding_completed_at
// transitions from NULL → value (first-ever payouts_enabled = true).
async function handleAccountUpdated(event: Stripe.Event): Promise<WebhookResponse> {
  const account = event.data.object as Stripe.Account;
  const accountId = account.id;

  // Look up which provider owns this account
  const { data: providerRow } = await supabase
    .from("pet_care_profiles")
    .select("user_id, stripe_payouts_enabled, stripe_onboarding_completed_at")
    .eq("stripe_account_id", accountId)
    .maybeSingle();

  if (!providerRow) {
    // Account not linked to any provider row — ignore silently
    console.log(`[ACCOUNT UPDATED] No provider row found for account ${accountId} — skipping`);
    return { success: true, message: "Account not linked to provider", eventId: event.id };
  }

  const userId = providerRow.user_id as string;
  const wasPayoutsEnabled = providerRow.stripe_payouts_enabled as boolean;
  const alreadyCompleted = Boolean(providerRow.stripe_onboarding_completed_at);

  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? (account.requirements?.currently_due ?? []).filter(Boolean)
    : [];
  const eventuallyDue = Array.isArray(account.requirements?.eventually_due)
    ? (account.requirements?.eventually_due ?? []).filter(Boolean)
    : [];
  const detailsSubmitted = account.details_submitted === true;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;

  const resolveStatus = (ds: boolean, pe: boolean, cd: string[]): string => {
    if (ds && pe && cd.length === 0) return "complete";
    if (cd.length > 0 || !pe) return "needs_action";
    return "pending";
  };
  const payoutStatus = resolveStatus(detailsSubmitted, payoutsEnabled, currentlyDue);

  const update: Record<string, unknown> = {
    stripe_details_submitted: detailsSubmitted,
    stripe_charges_enabled: chargesEnabled,
    stripe_payouts_enabled: payoutsEnabled,
    stripe_requirements_currently_due: currentlyDue,
    stripe_payout_status: payoutStatus,
    stripe_requirements_state: {
      currently_due: currentlyDue,
      eventually_due: eventuallyDue,
      synced_at: new Date().toISOString(),
    },
  };

  // Canonical dedup: set completed_at only on first payouts_enabled transition
  const isFirstConnect = payoutsEnabled && !alreadyCompleted;
  if (isFirstConnect) {
    update.stripe_onboarding_completed_at = new Date().toISOString();
  }

  await supabase
    .from("pet_care_profiles")
    .update(update)
    .eq("user_id", userId);

  // Send in-app notification exactly once: first transition to payouts_enabled
  // Guard: wasPayoutsEnabled (pre-event DB state) must be false AND isFirstConnect
  if (isFirstConnect && !wasPayoutsEnabled) {
    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: userId,
      title: "Wallet connected!",
      body: "Turn on your service listing to begin your carer journey!",
      message: "Wallet connected! Turn on your service listing to begin your carer journey!",
      type: "alert",
      data: { kind: "wallet_connected", href: "/carerprofile" },
      metadata: { kind: "wallet_connected" },
    });
    if (notifErr) {
      console.error(`[ACCOUNT UPDATED] Notification insert failed: ${notifErr.message}`);
    }
  }

  console.log(
    `[ACCOUNT UPDATED] user=${userId} payouts_enabled=${payoutsEnabled} status=${payoutStatus} first_connect=${isFirstConnect}`,
  );

  return {
    success: true,
    message: `Account updated — wallet status: ${payoutStatus}`,
    eventId: event.id,
  };
}
