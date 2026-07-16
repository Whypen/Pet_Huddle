// =====================================================
// HUDDLE V14: STRIPE WEBHOOK HANDLER
// Revenue & Monetization Brain - Critical Security
// Handles: Subscriptions, Add-ons, Idempotency, RLS
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const allowWebhookTestBypass = Deno.env.get("ALLOW_WEBHOOK_TEST_BYPASS") === "true";

const firstSecretKey = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const fromArray = parsed.map((item) => String(item || "").trim()).find(Boolean);
      if (fromArray) return fromArray;
    }
    if (parsed && typeof parsed === "object") {
      const fromObject = Object.values(parsed).map((item) => String(item || "").trim()).find(Boolean);
      if (fromObject) return fromObject;
    }
  } catch {
    // Fall through to delimited secret parsing.
  }
  return raw.split(/[\s,]+/).map((item) => item.trim().replace(/^['"]+|['"]+$/g, "")).find(Boolean) || "";
};
const allSecretKeys = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    if (parsed && typeof parsed === "object") return Object.values(parsed).map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    // Fall through to delimited secret parsing.
  }
  return raw.split(/[\s,]+/).map((item) => item.trim().replace(/^['"]+|['"]+$/g, "")).filter(Boolean);
};
const webhookSecrets = Array.from(new Set([
  ...allSecretKeys(Deno.env.get("STRIPE_WEBHOOK_SECRETS")),
  ...allSecretKeys(Deno.env.get("STRIPE_WEBHOOK_SECRET")),
]));
const supabaseServiceKey =
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

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
  statusCode?: number;
}

async function requestCareAgreementPdf(serviceChatId: string, source: string) {
  const cleanServiceChatId = String(serviceChatId || "").trim();
  if (!cleanServiceChatId) return;
  try {
    await supabase.rpc("enqueue_care_agreement_pdf_generation", {
      p_service_chat_id: cleanServiceChatId,
      p_reason: source,
    });
  } catch (error) {
    console.warn("[stripe-webhook] care agreement pdf enqueue deferred:", error instanceof Error ? error.message : String(error));
  }
  try {
    const { data, error } = await supabase.functions.invoke("generate-care-agreement-pdf", {
      headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      body: { service_chat_id: cleanServiceChatId, source },
    });
    if (error || (data as { ok?: boolean } | null)?.ok !== true) {
      console.warn("[stripe-webhook] care agreement pdf generation deferred:", error?.message || JSON.stringify(data || {}));
    }
  } catch (error) {
    console.warn("[stripe-webhook] care agreement pdf generation deferred:", error instanceof Error ? error.message : String(error));
  }
}

async function refundServiceScopeConflict(
  session: Stripe.Checkout.Session,
  serviceChat: { id: string; chat_id?: string; requester_id: string; status?: string | null },
  scopeVersionId: string,
  paymentIntentId: string,
  reason: string,
) {
  const amountMinor = Number(session.amount_total || 0);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new Error("service_booking scope-conflict refund amount missing");
  }

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount: amountMinor,
      metadata: {
        service_chat_id: serviceChat.id,
        requester_id: serviceChat.requester_id,
        reason,
      },
    },
    { idempotencyKey: `svc_scope_conflict_refund:${session.id}` },
  );

  await supabase
    .from("care_scope_versions")
    .update({
      payment_status: "cancelled",
      stripe_refund_id: refund.id,
      checkout_session_id: session.id,
      payment_intent_id: paymentIntentId,
      payment_scope_conflict_reason: reason,
    })
    .eq("id", scopeVersionId);

  await supabase
    .from("service_chats")
    .update({ stripe_checkout_session_id: null, booking_snapshot_pending: null })
    .eq("id", serviceChat.id)
    .eq("stripe_checkout_session_id", session.id);

  await supabase.from("admin_audit_logs").insert({
    actor_id: serviceChat.requester_id,
    action: "service_scope_conflict_auto_refund",
    notes: "Service payment refunded because booking scope changed before completion.",
    details: {
      service_chat_id: serviceChat.id,
      checkout_session_id: session.id,
      payment_intent_id: paymentIntentId,
      stripe_refund_id: refund.id,
      amount_minor: amountMinor,
      currency: session.currency,
      reason,
    },
  });

  await supabase.rpc("service_notify", {
    p_user_id: serviceChat.requester_id,
    p_kind: "service_payment_returned_scope_changed",
    p_title: "Payment returned",
    p_body: "Your payment was returned because the booking changed before it completed.",
    p_href: `/service-chat?service=${serviceChat.id}`,
    p_data: {
      kind: "service_payment_returned_scope_changed",
      serviceChatId: serviceChat.id,
      stripeRefundId: refund.id,
    },
  });

  return refund.id;
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

async function verifyStripeWebhookSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const parts = signature.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestampSeconds = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampSeconds) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((candidate) => {
    if (candidate.length !== expected.length) return false;
    let diff = 0;
    for (let index = 0; index < expected.length; index += 1) {
      diff |= expected.charCodeAt(index) ^ candidate.charCodeAt(index);
    }
    return diff === 0;
  });
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
  return items.some((item: Stripe.SubscriptionItem) => item?.price?.id === SHARE_PERKS_PRICE_ID);
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

async function insertServiceBookedMessage(chatId: string, senderId: string) {
  const content = JSON.stringify({ kind: "service_booked" });
  const { data: existing, error: existingErr } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("chat_id", chatId)
    .eq("content", content)
    .limit(1);
  if (existingErr) {
    console.warn(`[SERVICE BOOKED MESSAGE] lookup failed: ${existingErr.message}`);
    return false;
  }
  if (Array.isArray(existing) && existing.length > 0) return false;

  const { error: insertErr } = await supabase
    .from("chat_messages")
    .insert({ chat_id: chatId, sender_id: senderId, content });
  if (insertErr) {
    console.warn(`[SERVICE BOOKED MESSAGE] insert failed: ${insertErr.message}`);
    return false;
  }
  await supabase.from("chats").update({ last_message_at: new Date().toISOString() }).eq("id", chatId);
  return true;
}

async function notifyServiceBookingConfirmed(serviceChatId: string) {
  const { error } = await supabase.rpc("notify_service_booking_confirmed_by_service_id", { p_service_chat_id: serviceChatId });
  if (error) {
    console.warn(`[CHECKOUT COMPLETED] service_booking notification failed: ${error.message}`);
  }
}

async function recordCheckoutTransaction(session: Stripe.Checkout.Session, eventId: string, userId: string, type?: string | null) {
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    stripe_event_id: eventId,
    stripe_session_id: session.id,
    type: type || "unknown",
    amount: session.amount_total,
    currency: session.currency,
    status: "completed",
    metadata: session.metadata || {},
  });
  if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
    throw new Error(`Transaction creation failed: ${error.message}`);
  }
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
        let verified = false;
        for (const secret of webhookSecrets) {
          if (await verifyStripeWebhookSignature(body, signature, secret)) {
            verified = true;
            break;
          }
        }
        if (!verified) throw new Error("stripe_signature_mismatch");
        event = JSON.parse(body) as Stripe.Event;
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

      case "checkout.session.expired":
        result = await handleCheckoutSessionExpired(event);
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

      case "refund.created":
      case "refund.updated":
      case "refund.failed":
        result = await handleCareRefundChanged(event);
        break;

      case "payout.created":
      case "payout.updated":
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled":
        result = await handleCarePayoutChanged(event);
        break;

      default:
        console.log(`[STRIPE WEBHOOK] Unhandled event type: ${event.type}`);
        return new Response(
          JSON.stringify({ success: true, message: "Event type not handled" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      status: result.statusCode || 200,
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
// HANDLER: checkout.session.expired
// =====================================================
async function handleCheckoutSessionExpired(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const session = event.data.object as Stripe.Checkout.Session;
  const type = session.metadata?.type;
  if (type !== "service_booking") {
    return { success: true, message: "Checkout session expiry ignored", eventId: event.id };
  }

  const serviceChatId = String(session.metadata?.service_chat_id || "").trim();
  if (!serviceChatId) {
    return { success: true, message: "Service booking expiry missing chat metadata", eventId: event.id };
  }

  const { data: serviceChat } = await supabase
    .from("service_chats")
    .select("id, stripe_checkout_session_id")
    .eq("id", serviceChatId)
    .maybeSingle();

  const scopeVersionId = String(session.metadata?.scope_version_id || "").trim();
  if (scopeVersionId) {
    await supabase
      .from("care_scope_versions")
      .update({
        payment_status: "expired",
        payment_pending_started_at: null,
        payment_pending_expires_at: null,
      })
      .eq("id", scopeVersionId)
      .eq("checkout_session_id", session.id)
      .in("payment_status", ["creating", "pending"]);
  }

  if (serviceChat?.stripe_checkout_session_id === session.id) {
    const serviceChatRow = serviceChat as { id: string; stripe_checkout_session_id?: string | null };
    await supabase
      .from("service_chats")
      .update({ stripe_checkout_session_id: null })
      .eq("id", serviceChatRow.id);
  }

  return { success: true, message: "Service booking checkout expired", eventId: event.id };
}

// =====================================================
// HANDLER: checkout.session.completed
// =====================================================
async function handleCheckoutSessionCompleted(
  event: Stripe.Event
): Promise<WebhookResponse> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.user_id || session.metadata?.requester_id;
  const type = session.metadata?.type;

  if (!userId) {
    throw new Error("Missing user_id in session metadata");
  }

  console.log(`[CHECKOUT COMPLETED] User: ${userId}, Type: ${type}, Mode: ${session.mode}`);

  if (type !== "service_booking") {
    await recordCheckoutTransaction(session, event.id, userId, type);
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
        const { data: serviceChatForSnapshot, error: snapshotLoadErr } = await supabase
          .from("service_chats")
          .select("id, chat_id, status, booking_snapshot_pending, stripe_checkout_session_id, stripe_payment_intent_id, provider_id, requester_id")
          .eq("id", session.metadata.service_chat_id)
          .maybeSingle();
        if (snapshotLoadErr) {
          console.error(`[CHECKOUT COMPLETED] service_booking snapshot load failed: ${snapshotLoadErr.message}`);
        }
        const pendingSnapshot = (serviceChatForSnapshot?.booking_snapshot_pending || {}) as Record<string, unknown>;
        const pendingPrice = (pendingSnapshot.price || {}) as Record<string, unknown>;
        const expectedAmount = Number(pendingPrice.requesterTotal || 0);
        const expectedCurrency = String(pendingPrice.currency || "").trim().toLowerCase();
        const storedSessionId = String(serviceChatForSnapshot?.stripe_checkout_session_id || "").trim();
        const sessionCurrency = String(session.currency || "").trim().toLowerCase();
        if (!serviceChatForSnapshot) {
          console.error(`[CHECKOUT COMPLETED] service_booking ignored: pending chat not found for chat=${session.metadata.service_chat_id}`);
          throw new Error("service_booking chat not found");
        }
        const metadataRequesterId = String(session.metadata.requester_id || session.metadata.user_id || "").trim();
        if (!metadataRequesterId || metadataRequesterId !== serviceChatForSnapshot.requester_id) {
          console.error(`[CHECKOUT COMPLETED] service_booking ignored: requester mismatch chat=${session.metadata.service_chat_id}`);
          throw new Error("service_booking requester mismatch");
        }
        if (storedSessionId && storedSessionId !== session.id) {
          console.error(`[CHECKOUT COMPLETED] service_booking ignored: checkout session mismatch chat=${session.metadata.service_chat_id}`);
          throw new Error("service_booking checkout session mismatch");
        }
        const scopeVersionId = String(session.metadata.scope_version_id || "").trim();
        const scopeHash = String(session.metadata.scope_hash || "").trim();
        if (!scopeVersionId || !scopeHash) {
          throw new Error("service_booking missing care scope metadata");
        }
        if (serviceChatForSnapshot.status !== "pending") {
          if (serviceChatForSnapshot.status !== "booked" || (serviceChatForSnapshot.stripe_payment_intent_id && serviceChatForSnapshot.stripe_payment_intent_id !== paymentIntentId)) {
            const refundId = await refundServiceScopeConflict(
              session,
              serviceChatForSnapshot,
              scopeVersionId,
              paymentIntentId,
              "payment_succeeded_after_chat_left_pending",
            );
            await recordCheckoutTransaction(session, event.id, userId, type);
            return { success: true, message: `service_booking refunded after scope conflict: ${refundId}`, eventId: event.id };
          }
          await requestCareAgreementPdf(serviceChatForSnapshot.id, "stripe_webhook_already_booked");
          return { success: true, message: "service_booking already booked", eventId: event.id };
        }
        if (expectedAmount <= 0 || Number(session.amount_total || 0) !== expectedAmount || !expectedCurrency || sessionCurrency !== expectedCurrency) {
          console.error(`[CHECKOUT COMPLETED] service_booking ignored: amount/currency mismatch chat=${session.metadata.service_chat_id}`);
          throw new Error("service_booking amount or currency mismatch");
        }
        const { data: agreement, error: chatErr } = await supabase.rpc("finalize_service_care_agreement_for_payment_by_service_id", {
          p_service_chat_id: serviceChatForSnapshot.id,
          p_checkout_session_id: session.id,
          p_payment_intent_id: paymentIntentId,
          p_scope_version_id: scopeVersionId,
          p_scope_hash: scopeHash,
          p_booking_snapshot: serviceChatForSnapshot?.booking_snapshot_pending || null,
          p_payment_status: "succeeded",
        });
        if (chatErr) {
          if ((chatErr.message || "").includes("payment_scope_conflict")) {
            const refundId = await refundServiceScopeConflict(
              session,
              serviceChatForSnapshot,
              scopeVersionId,
              paymentIntentId,
              "payment_scope_conflict",
            );
            await recordCheckoutTransaction(session, event.id, userId, type);
            return { success: true, message: `service_booking refunded after scope conflict: ${refundId}`, eventId: event.id };
          }
          console.error(`[CHECKOUT COMPLETED] service_booking advance failed: ${chatErr.message}`);
          throw new Error(`service_booking advance failed: ${chatErr.message}`);
        } else {
          const pdfServiceChatId = String((agreement as { service_chat_id?: string } | null)?.service_chat_id || serviceChatForSnapshot.id || "").trim();
          await requestCareAgreementPdf(pdfServiceChatId, "stripe_webhook_checkout_completed");
          await recordCheckoutTransaction(session, event.id, userId, type);
          await insertServiceBookedMessage(session.metadata.service_chat_id, session.metadata.requester_id || session.metadata.user_id || "system");
          await notifyServiceBookingConfirmed(session.metadata.service_chat_id);
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
      "Authorization": `Bearer ${supabaseServiceKey}`,
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
      "Authorization": `Bearer ${supabaseServiceKey}`,
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

    const { error: nannyInsertError } = await supabase
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
      });
    if (nannyInsertError) {
      console.warn("[PAYMENT_INTENT] Nanny insert:", nannyInsertError.message);
    }

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

const addRefundBusinessDays = (value: string, days: number) => {
  const date = new Date(value);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString();
};

async function resolveRefundServiceChatId(refund: Stripe.Refund): Promise<string> {
  const metadataServiceId = normalizeType(refund.metadata?.service_chat_id);
  if (metadataServiceId) {
    const { data, error } = await supabase.from("service_chats").select("id").eq("id", metadataServiceId).maybeSingle();
    if (error) throw new Error(`care_refund_metadata_service_lookup_failed:${error.message}`);
    if (data?.id) return String(data.id);
  }
  const paymentIntentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || "";
  if (!paymentIntentId) return "";
  const { data, error } = await supabase
    .from("service_chats")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .limit(2);
  if (error) throw new Error(`care_refund_payment_intent_lookup_failed:${error.message}`);
  return data?.length === 1 ? String(data[0].id) : "";
}

async function handleCareRefundChanged(event: Stripe.Event): Promise<WebhookResponse> {
  const refund = event.data.object as Stripe.Refund;
  const serviceChatId = await resolveRefundServiceChatId(refund);
  if (serviceChatId) {
    const { error: upsertError } = await supabase.rpc("upsert_care_payment_movement", {
      p_service_chat_id: serviceChatId,
      p_movement_kind: "owner_refund",
      p_movement_reason: normalizeType(refund.metadata?.reason) || "service_refund",
      p_source_kind: "stripe_webhook",
      p_source_record_id: event.id,
      p_amount_minor: refund.amount,
      p_currency: normalizeType(refund.currency).toUpperCase(),
      p_status: "submitted",
      p_stripe_payment_intent_id: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || null,
      p_stripe_refund_id: refund.id,
      p_stripe_transfer_id: null,
      p_requested_at: new Date(refund.created * 1000).toISOString(),
      p_processed_at: null,
    });
    if (upsertError) throw new Error(`care_refund_movement_upsert_failed:${upsertError.message}`);
    const { error: serviceUpdateError } = await supabase
      .from("service_chats")
      .update({ stripe_refund_id: refund.id, refund_issued_at: new Date(refund.created * 1000).toISOString() })
      .eq("id", serviceChatId);
    if (serviceUpdateError) throw new Error(`care_refund_service_link_failed:${serviceUpdateError.message}`);
  }

  const details = (refund as unknown as { destination_details?: Record<string, unknown> | null }).destination_details || {};
  const detailType = normalizeType(String(details.type || ""));
  const methodDetail = detailType && details[detailType] && typeof details[detailType] === "object"
    ? details[detailType] as Record<string, unknown>
    : {};
  const normalized = normalizeType(refund.status).toLowerCase();
  const status = normalized === "succeeded" ? "succeeded"
    : normalized === "failed" ? "failed"
    : normalized === "canceled" ? "canceled"
    : "pending";
  const createdAt = new Date(refund.created * 1000).toISOString();
  const { error } = await supabase.from("care_payment_movements").update({
    amount_minor: refund.amount,
    currency: normalizeType(refund.currency).toUpperCase(),
    status,
    stripe_created_at: createdAt,
    processed_at: status === "succeeded" ? new Date(event.created * 1000).toISOString() : null,
    estimated_arrival_at: status === "succeeded" ? addRefundBusinessDays(createdAt, 10) : null,
    refund_reference_value: normalizeType(String(methodDetail.reference || "")) || null,
    refund_reference_status: normalizeType(String(methodDetail.reference_status || "")) || null,
    refund_reference_type: normalizeType(String(methodDetail.reference_type || "")) || (detailType ? `${detailType}_reference` : null),
    last_synced_at: new Date().toISOString(),
    next_sync_at: status === "pending"
      ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
      : status === "succeeded" && !normalizeType(String(methodDetail.reference || ""))
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null,
    sync_attempt_count: 0,
    reconciliation_attention_at: null,
    failure_code: status === "failed" ? normalizeType((refund as unknown as { failure_reason?: string | null }).failure_reason) || "refund_failed" : null,
    failure_message_safe: status === "failed" ? "Stripe reported that the refund failed." : null,
    updated_at: new Date().toISOString(),
  }).eq("stripe_refund_id", refund.id);
  if (error) throw new Error(`care_refund_ledger_update_failed:${error.message}`);

  return { success: true, message: `Care refund ${status}`, eventId: event.id };
}

async function handleCarePayoutChanged(event: Stripe.Event): Promise<WebhookResponse> {
  const payout = event.data.object as Stripe.Payout;
  const connectedAccountId = normalizeType((event as Stripe.Event & { account?: string | null }).account);
  if (!connectedAccountId) {
    return { success: true, message: "Platform payout is not a Care connected-account payout", eventId: event.id };
  }
  const normalized = normalizeType(payout.status).toLowerCase();
  const status = normalized === "paid" ? "paid"
    : normalized === "failed" ? "failed"
    : normalized === "canceled" ? "canceled"
    : normalized === "in_transit" ? "in_transit"
    : "pending";
  const trace = (payout as unknown as { trace_id?: { status?: string | null; value?: string | null } | null }).trace_id;
  const arrivalAt = payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null;
  const { data: updated, error } = await supabase.from("care_payment_movements").update({
    status,
    stripe_connected_account_id: connectedAccountId,
    stripe_payout_id: payout.id,
    estimated_arrival_at: arrivalAt,
    paid_at: status === "paid" ? new Date(event.created * 1000).toISOString() : null,
    payout_trace_value: normalizeType(trace?.value) || null,
    payout_trace_status: normalizeType(trace?.status) || null,
    last_synced_at: new Date().toISOString(),
    next_sync_at: status === "paid" && (!normalizeType(trace?.value) || normalizeType(trace?.status) === "pending")
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : ["pending", "in_transit"].includes(status)
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : null,
    sync_attempt_count: 0,
    reconciliation_attention_at: null,
    failure_code: status === "failed" ? normalizeType(payout.failure_code) || "payout_failed" : null,
    failure_message_safe: status === "failed" ? "Stripe reported that the payout failed." : null,
    updated_at: new Date().toISOString(),
  }).eq("stripe_payout_id", payout.id).select("id");
  if (error) throw new Error(`care_payout_ledger_update_failed:${error.message}`);

  // A new automatic payout is initially unknown to Huddle. The sync function
  // attaches it only when Stripe's payout reconciliation contains the exact
  // destination payment created by a recorded Care transfer.
  if (!updated?.length) {
    const { error: syncError } = await supabase.functions.invoke("sync-care-payment-movements", {
      headers: { Authorization: `Bearer ${supabaseServiceKey}` },
      body: { payout_id: payout.id, stripe_account_id: connectedAccountId, source: "stripe_webhook" },
    });
    if (syncError) console.warn(`[CARE PAYOUT] Exact payout mapping deferred: ${syncError.message}`);
  }
  return { success: true, message: `Care payout ${status}`, eventId: event.id };
}
