import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
const supabaseServiceKey = (Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) as string;

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

const insertServiceBookedMessage = async (supabase: ReturnType<typeof createClient>, chatId: string, senderId: string) => {
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

const notifyServiceBookingConfirmed = async (supabase: ReturnType<typeof createClient>, chatId: string) => {
  const { error } = await supabase.rpc("notify_service_booking_confirmed", { p_chat_id: chatId });
  if (error) {
    console.warn("[confirm-service-payment] booking notification failed:", error.message);
  }
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

    const { data: serviceChat, error: serviceChatErr } = await supabase
      .from("service_chats")
      .select("chat_id, requester_id, provider_id, status, booking_snapshot_pending, stripe_payment_intent_id, stripe_checkout_session_id")
      .eq("chat_id", serviceChatId)
      .maybeSingle();
    if (serviceChatErr) return json({ error: "Service lookup failed" }, 500);
    if (!serviceChat) return json({ error: "Service chat not found" }, 404);
    if (serviceChat.requester_id !== user.id) return json({ error: "Forbidden" }, 403);

    if (serviceChat.status !== "pending" && serviceChat.stripe_checkout_session_id) {
      await insertServiceBookedMessage(supabase, serviceChatId, user.id);
      await notifyServiceBookingConfirmed(supabase, serviceChatId);
      return json({
        ok: true,
        alreadyConfirmed: true,
        status: serviceChat.status,
        hasPaymentIntent: Boolean(serviceChat.stripe_payment_intent_id),
        hasCheckoutSession: Boolean(serviceChat.stripe_checkout_session_id),
      });
    }

    let session: Stripe.Checkout.Session | null = null;
    let mode: "test" | "live" | null = null;
    let lastStripeMessage = "Checkout session could not be verified";
    for (const candidate of stripeSecretsByPreference()) {
      try {
        session = await createStripeClient(candidate.secret).checkout.sessions.retrieve(checkoutSessionId, {
          expand: ["payment_intent"],
        });
        mode = candidate.mode;
        break;
      } catch (error) {
        lastStripeMessage = error instanceof Error ? error.message : String(error);
      }
    }
    if (!session || !mode) return json({ error: "Checkout session could not be verified", detail: lastStripeMessage }, 409);
    if (session.metadata?.type !== "service_booking" || session.metadata?.service_chat_id !== serviceChatId || session.metadata?.requester_id !== user.id) {
      return json({ error: "Checkout session does not match this booking" }, 403);
    }
    if (session.payment_status !== "paid") {
      return json({ ok: false, status: serviceChat.status, paymentStatus: session.payment_status, checkoutStatus: session.status }, 409);
    }

    const intentId = paymentIntentId(session);
    if (!intentId) return json({ error: "Checkout session has no payment intent" }, 409);

    if (serviceChat.status !== "pending") {
      const { error: backfillErr } = await supabase
        .from("service_chats")
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: serviceChat.stripe_payment_intent_id || intentId,
        })
        .eq("chat_id", serviceChatId);
      if (backfillErr) return json({ error: "Booking payment could not be refreshed" }, 500);
      await insertServiceBookedMessage(supabase, serviceChatId, user.id);
      await notifyServiceBookingConfirmed(supabase, serviceChatId);
      return json({
        ok: true,
        alreadyConfirmed: true,
        status: serviceChat.status,
        mode,
        checkoutSessionId: session.id,
        paymentIntentId: serviceChat.stripe_payment_intent_id || intentId,
      });
    }

    const { error: updateErr } = await supabase
      .from("service_chats")
      .update({
        status: "booked",
        care_status: "awaiting_handoff",
        booking_snapshot: serviceChat.booking_snapshot_pending || null,
        booking_snapshot_pending: null,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: intentId,
        booked_at: new Date().toISOString(),
      })
      .eq("chat_id", serviceChatId)
      .eq("status", "pending");
    if (updateErr) return json({ error: "Booking payment could not be recorded" }, 500);
    await insertServiceBookedMessage(supabase, serviceChatId, user.id);
    await notifyServiceBookingConfirmed(supabase, serviceChatId);

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
