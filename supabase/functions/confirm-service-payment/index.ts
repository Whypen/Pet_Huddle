import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeModeHint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
type SupabaseAdminClient = SupabaseClient<any, "public", any>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const clean = (value: unknown) => String(value || "").trim();

const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const stripeSecretsByPreference = () => {
  const pairs: Array<{ mode: "test" | "live"; secret: string }> = stripeModeHint === "live"
    ? [{ mode: "live", secret: stripeLiveSecret || stripeDefaultSecret }, { mode: "test", secret: stripeTestSecret || stripeDefaultSecret }]
    : [{ mode: "test", secret: stripeTestSecret || stripeDefaultSecret }, { mode: "live", secret: stripeLiveSecret || stripeDefaultSecret }];
  const seen = new Set<string>();
  return pairs.filter(({ secret }) => {
    if (!secret || seen.has(secret)) return false;
    seen.add(secret);
    return true;
  });
};

const paymentIntentId = (session: Stripe.Checkout.Session) =>
  typeof session.payment_intent === "string"
    ? session.payment_intent
    : (session.payment_intent as { id?: string } | null)?.id ?? null;
const expectedPayment = (serviceChat: Record<string, unknown>) => {
  const pending = (serviceChat.booking_snapshot_pending || {}) as Record<string, unknown>;
  const booked = (serviceChat.booking_snapshot || {}) as Record<string, unknown>;
  const snapshot = Object.keys(pending).length > 0 ? pending : booked;
  const price = (snapshot.price || {}) as Record<string, unknown>;
  return {
    amount: Number(price.requesterTotal || 0),
    currency: clean(price.currency).toLowerCase(),
  };
};

const validateSessionForServiceChat = (
  session: Stripe.Checkout.Session,
  serviceChat: Record<string, unknown>,
  serviceChatId: string,
  userId: string,
) => {
  if (session.metadata?.type !== "service_booking" || clean(session.metadata?.service_chat_id) !== serviceChatId || session.metadata?.requester_id !== userId) {
    return "Checkout session does not match this booking";
  }
  if (clean(serviceChat.stripe_checkout_session_id) && clean(serviceChat.stripe_checkout_session_id) !== session.id) {
    return "Checkout session does not match the stored booking session";
  }
  if (session.payment_status !== "paid") {
    return "Checkout session is not paid";
  }
  const intent = session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent as Stripe.PaymentIntent
    : null;
  if (intent && intent.status !== "succeeded") {
    return "PaymentIntent is not succeeded";
  }
  const expected = expectedPayment(serviceChat);
  if (expected.amount <= 0 || !expected.currency) {
    return "Booking payment amount could not be verified";
  }
  if (Number(session.amount_total || 0) !== expected.amount) {
    return "Checkout amount does not match the booking";
  }
  if (clean(session.currency).toLowerCase() !== expected.currency) {
    return "Checkout currency does not match the booking";
  }
  return "";
};

const insertServiceBookedMessage = async (supabase: SupabaseAdminClient, chatId: string, senderId: string) => {
  const content = JSON.stringify({ kind: "service_booked" });
  const { data: existing, error: existingErr } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("chat_id", chatId)
    .eq("content", content)
    .limit(1);
  if (existingErr || (Array.isArray(existing) && existing.length > 0)) return false;
  const { error: insertErr } = await supabase
    .from("chat_messages")
    .insert({ chat_id: chatId, sender_id: senderId, content });
  if (insertErr) return false;
  await supabase.from("chats").update({ last_message_at: new Date().toISOString() }).eq("id", chatId);
  return true;
};

const notifyServiceBookingConfirmed = async (supabase: SupabaseAdminClient, serviceChatId: string) => {
  const { error } = await supabase.rpc("notify_service_booking_confirmed_by_service_id", { p_service_chat_id: serviceChatId });
  if (error) {
    console.warn("[confirm-service-payment] booking notification failed:", error.message);
  }
};

const refundScopeConflictPayment = async (
  stripe: Stripe,
  supabase: SupabaseAdminClient,
  session: Stripe.Checkout.Session,
  serviceChatId: string,
  serviceChatDbId: string,
  requesterId: string,
  scopeVersionId: string,
  reason: string,
) => {
  const intentId = paymentIntentId(session);
  if (!intentId) throw new Error("scope_conflict_refund_missing_payment_intent");
  const intent = session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent as Stripe.PaymentIntent
    : await stripe.paymentIntents.retrieve(intentId);
  const amountReceived = Number(intent.amount_received || session.amount_total || 0);
  if (!Number.isFinite(amountReceived) || amountReceived <= 0) throw new Error("scope_conflict_refund_amount_missing");

  const refund = await stripe.refunds.create(
    {
      payment_intent: intentId,
      amount: amountReceived,
      metadata: {
        service_chat_id: serviceChatDbId,
        requester_id: requesterId,
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
      payment_scope_conflict_reason: reason,
      payment_intent_id: intentId,
      checkout_session_id: session.id,
    })
    .eq("id", scopeVersionId);
  await supabase
    .from("service_chats")
    .update({ stripe_checkout_session_id: null, booking_snapshot_pending: null })
    .eq("id", serviceChatDbId)
    .eq("stripe_checkout_session_id", session.id);
  await supabase.from("admin_audit_logs").insert({
    actor_id: requesterId,
    action: "service_scope_conflict_auto_refund",
    notes: "Service payment refunded because booking scope changed before completion.",
    details: {
      service_chat_id: serviceChatDbId,
      checkout_session_id: session.id,
      payment_intent_id: intentId,
      stripe_refund_id: refund.id,
      amount_minor: amountReceived,
      currency: intent.currency || session.currency,
      reason,
    },
  });
  await supabase.rpc("service_notify", {
    p_user_id: requesterId,
    p_kind: "service_payment_returned_scope_changed",
    p_title: "Payment returned",
    p_body: "Your payment was returned because the booking changed before it completed.",
    p_href: `/service-chat?service=${serviceChatDbId}`,
    p_data: { kind: "service_payment_returned_scope_changed", serviceChatId: serviceChatDbId, stripeRefundId: refund.id },
  });
  return refund.id;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const serviceChatId = clean(payload.service_chat_id);
    const checkoutSessionId = clean(payload.checkout_session_id || payload.session_id);
    if (!serviceChatId || !checkoutSessionId) return json({ error: "Missing required fields" }, 400);

    const serviceChatResult = await supabase
      .from("service_chats")
      .select("id, chat_id, requester_id, provider_id, status, booking_snapshot, booking_snapshot_pending, stripe_payment_intent_id, stripe_checkout_session_id")
      .eq("id", serviceChatId)
      .maybeSingle();
    const { data: serviceChat, error: serviceChatErr } = serviceChatResult;
    if (serviceChatErr) return json({ error: "Service lookup failed" }, 500);
    if (!serviceChat) return json({ error: "Service chat not found" }, 404);
    if (serviceChat.requester_id !== user.id) return json({ error: "Forbidden" }, 403);

    let session: Stripe.Checkout.Session | null = null;
    let mode: "test" | "live" | null = null;
    let stripeForSession: Stripe | null = null;
    let lastStripeMessage = "Checkout session could not be verified";
    for (const candidate of stripeSecretsByPreference()) {
      try {
        const candidateStripe = createStripeClient(candidate.secret);
        session = await candidateStripe.checkout.sessions.retrieve(checkoutSessionId, {
          expand: ["payment_intent"],
        });
        mode = candidate.mode;
        stripeForSession = candidateStripe;
        break;
      } catch (error) {
        lastStripeMessage = error instanceof Error ? error.message : String(error);
      }
    }
    if (!session || !mode || !stripeForSession) return json({ error: "Checkout session could not be verified", detail: lastStripeMessage }, 409);
    const chatRoomId = serviceChat.chat_id;
    const sessionValidationError = validateSessionForServiceChat(session, serviceChat as Record<string, unknown>, serviceChat.id, user.id);
    if (sessionValidationError) {
      return json({ error: sessionValidationError }, sessionValidationError.includes("not paid") || sessionValidationError.includes("not succeeded") ? 409 : 403);
    }
    if (session.payment_status !== "paid") {
      return json({ ok: false, status: serviceChat.status, paymentStatus: session.payment_status, checkoutStatus: session.status }, 409);
    }

    const intentId = paymentIntentId(session);
    if (!intentId) return json({ error: "Checkout session has no payment intent" }, 409);

    const scopeVersionId = clean(session.metadata?.scope_version_id);
    const scopeHash = clean(session.metadata?.scope_hash);
    if (!scopeVersionId || !scopeHash) return json({ error: "Checkout session is missing Care Agreement scope metadata" }, 409);

    if (serviceChat.status !== "pending") {
      if (serviceChat.status !== "booked") {
        const refundId = await refundScopeConflictPayment(stripeForSession, supabase, session, chatRoomId, serviceChat.id, user.id, scopeVersionId, "payment_succeeded_after_chat_left_pending");
        return json({ ok: true, refunded: true, stripeRefundId: refundId, status: serviceChat.status });
      }
      const { error: backfillErr } = await supabase
        .from("service_chats")
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: serviceChat.stripe_payment_intent_id || intentId,
        })
        .eq("id", serviceChat.id);
      if (backfillErr) return json({ error: "Booking payment could not be refreshed" }, 500);
      const inserted = await insertServiceBookedMessage(supabase, chatRoomId, user.id);
      if (inserted) await notifyServiceBookingConfirmed(supabase, serviceChat.id);
      return json({
        ok: true,
        alreadyConfirmed: true,
        status: serviceChat.status,
        mode,
        checkoutSessionId: session.id,
        paymentIntentId: serviceChat.stripe_payment_intent_id || intentId,
      });
    }

    const { data: agreement, error: finalizeErr } = await supabase.rpc("finalize_service_care_agreement_for_payment_by_service_id", {
      p_service_chat_id: serviceChat.id,
      p_checkout_session_id: session.id,
      p_payment_intent_id: intentId,
      p_scope_version_id: scopeVersionId,
      p_scope_hash: scopeHash,
      p_booking_snapshot: serviceChat.booking_snapshot_pending || null,
      p_payment_status: "succeeded",
    });
    if (finalizeErr) {
      if ((finalizeErr.message || "").includes("payment_scope_conflict")) {
        const refundId = await refundScopeConflictPayment(stripeForSession, supabase, session, chatRoomId, serviceChat.id, user.id, scopeVersionId, "payment_scope_conflict");
        return json({ ok: true, refunded: true, stripeRefundId: refundId });
      }
      return json({ error: finalizeErr.message || "Booking payment could not be recorded" }, 409);
    }
    const inserted = await insertServiceBookedMessage(supabase, chatRoomId, user.id);
    if (inserted) await notifyServiceBookingConfirmed(supabase, serviceChat.id);
    try {
      await supabase.functions.invoke("generate-care-agreement-pdf", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { service_chat_id: (agreement as { service_chat_id?: string } | null)?.service_chat_id || serviceChat.id },
      });
    } catch (pdfError) {
      console.warn("[confirm-service-payment] agreement pdf generation deferred:", pdfError instanceof Error ? pdfError.message : String(pdfError));
    }

    return json({
      ok: true,
      status: "booked",
      mode,
      checkoutSessionId: session.id,
      paymentIntentId: intentId,
    });
  } catch (error) {
    console.error("[confirm-service-payment] failed:", error instanceof Error ? error.message : String(error));
    return json({ error: "internal_error" }, 500);
  }
});
