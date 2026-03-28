import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeModeHint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();

const resolveMode = (origin: string | null, successUrl?: string, cancelUrl?: string): "test" | "live" => {
  if (stripeModeHint === "test") return "test";
  if (stripeModeHint === "live") return "live";
  const host = `${origin || ""} ${successUrl || ""} ${cancelUrl || ""}`.toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1")) return "test";
  return "live";
};

const pickStripeSecret = (mode: "test" | "live"): string =>
  mode === "test"
    ? stripeTestSecret || stripeDefaultSecret
    : stripeLiveSecret || stripeDefaultSecret;

const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(accessToken);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const serviceChatId = String(payload.service_chat_id || "").trim();
    const successUrl = String(payload.success_url || "").trim();
    const cancelUrl = String(payload.cancel_url || "").trim();

    if (!serviceChatId || !successUrl || !cancelUrl) {
      return json({ error: "Missing required fields" }, 400);
    }

    const { data: serviceChat, error: serviceChatErr } = await supabase
      .from("service_chats")
      .select("chat_id, requester_id, provider_id, status, quote_card")
      .eq("chat_id", serviceChatId)
      .maybeSingle();
    if (serviceChatErr) return json({ error: "Service lookup failed" }, 500);
    if (!serviceChat) return json({ error: "Service chat not found" }, 404);
    if (serviceChat.requester_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (serviceChat.status !== "pending") return json({ error: "Service is no longer pending" }, 409);

    // Amount and currency are authoritative from the server-side quote_card, not the client.
    // This prevents a requester from manipulating the charge amount or currency.
    const quoteCard = (serviceChat.quote_card || {}) as Record<string, unknown>;
    const rate = String(quoteCard.rate || "").trim();
    const finalPriceStr = String(quoteCard.finalPrice || "").trim();
    const parsedPrice = Number(finalPriceStr);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return json({ error: "Quote has no valid price" }, 409);
    }
    const amountCents = Math.round(parsedPrice * 100);
    const currency = String(quoteCard.currency || "").trim().toLowerCase();
    if (!currency) {
      return json({ error: "Quote has no currency" }, 409);
    }

    const { data: providerCarer, error: providerErr } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id, stripe_payout_status")
      .eq("user_id", serviceChat.provider_id)
      .maybeSingle();
    if (providerErr) return json({ error: "Provider lookup failed" }, 500);
    if (!providerCarer?.stripe_account_id || providerCarer.stripe_payout_status !== "complete") {
      return json({ error: "Provider has not completed payout setup" }, 409);
    }

    const mode = resolveMode(req.headers.get("origin"), successUrl, cancelUrl);
    const stripeSecret = pickStripeSecret(mode);
    if (!stripeSecret) return json({ error: "Stripe secret key missing on server" }, 500);
    const stripe = createStripeClient(stripeSecret);

    let customerId: string | null = null;
    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    customerId = (requesterProfile?.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      const authUser = await supabase.auth.admin.getUserById(user.id);
      const customer = await stripe.customers.create({
        email: authUser.data?.user?.email || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const platformFee = Math.round(amountCents * 0.1);
    const providerPayout = amountCents - platformFee;

    // Idempotency key scoped to this service chat prevents duplicate checkout
    // sessions if the client retries on network failure.
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amountCents,
              product_data: {
                name: "Pet Care Service Booking",
                description: rate ? `Service booking (${rate})` : "Service booking",
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: {
            type: "service_booking",
            service_chat_id: serviceChatId,
            requester_id: user.id,
            provider_id: serviceChat.provider_id,
            provider_stripe_account_id: providerCarer.stripe_account_id,
            platform_fee_cents: String(platformFee),
            provider_payout_cents: String(providerPayout),
          },
        },
        metadata: {
          type: "service_booking",
          service_chat_id: serviceChatId,
          requester_id: user.id,
          provider_id: serviceChat.provider_id,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      { idempotencyKey: `svc_pay_${serviceChatId}` },
    );

    return json({
      mode,
      url: session.url,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-service-payment] failed:", message);
    return json({ error: "internal_error" }, 500);
  }
});
