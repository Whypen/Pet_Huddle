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

const STRIPE_MINIMUM_CHARGE_CENTS: Record<string, number> = {
  aud: 50,
  cad: 50,
  eur: 50,
  gbp: 30,
  hkd: 400,
  jpy: 50,
  sgd: 50,
  usd: 50,
};

const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = (Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) as string;
const appEnv = String(Deno.env.get("APP_ENV") || Deno.env.get("HUDDLE_ENV") || Deno.env.get("ENVIRONMENT") || Deno.env.get("VERCEL_ENV") || "").toLowerCase();
const isNonProductionRuntime = appEnv === "staging" || appEnv === "preview" || appEnv === "development" || appEnv === "test" || appEnv === "local" || appEnv === "dev";

type ServicePaymentStage =
  | "service_chat_load_failed"
  | "quote_invalid"
  | "snapshot_pending_write_failed"
  | "stripe_customer_create_failed"
  | "stripe_checkout_create_failed"
  | "service_chat_update_failed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const clean = (value: unknown): string => String(value || "").trim();
const stageJson = (stage: ServicePaymentStage, message: string, status = 500, exposeStage = isNonProductionRuntime, details?: Record<string, unknown>) =>
  json(exposeStage ? { error: message, stage, ...(details || {}) } : { error: message }, status);

const stripeErrorFields = (error: unknown) => {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    type: clean(value.type),
    code: clean(value.code),
    statusCode: typeof value.statusCode === "number" ? value.statusCode : null,
    message: clean(value.message),
  };
};

const logStageError = (stage: ServicePaymentStage, error: unknown) => {
  const fields = stripeErrorFields(error);
  console.error("[create-service-payment] failed:", {
    stage,
    type: fields.type || undefined,
    code: fields.code || undefined,
    statusCode: fields.statusCode || undefined,
    message: fields.message || (error instanceof Error ? error.message : String(error)),
  });
};

const requireSnapshotString = (snapshot: Record<string, unknown>, key: string, label: string): string => {
  const value = clean(snapshot[key]);
  if (!value) throw new Error(`${label} is required`);
  return value;
};

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
    const incomingSnapshot = typeof payload.booking_snapshot === "object" && payload.booking_snapshot !== null
      ? (payload.booking_snapshot as Record<string, unknown>)
      : null;
    const exposeStage = isNonProductionRuntime || `${successUrl} ${cancelUrl}`.toLowerCase().includes("localhost");

    if (!serviceChatId || !successUrl || !cancelUrl) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!incomingSnapshot) {
      return json({ error: "Booking confirmation is required" }, 400);
    }

    const { data: serviceChat, error: serviceChatErr } = await supabase
      .from("service_chats")
      .select("chat_id, requester_id, provider_id, status, request_card, quote_card")
      .eq("chat_id", serviceChatId)
      .maybeSingle();
    if (serviceChatErr) {
      logStageError("service_chat_load_failed", serviceChatErr);
      return stageJson("service_chat_load_failed", "Service lookup failed", 500, exposeStage);
    }
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
      return stageJson("quote_invalid", "Quote has no valid price", 409, exposeStage);
    }
    const amountCents = Math.round(parsedPrice * 100);
    const currency = String(quoteCard.currency || "").trim().toLowerCase();
    if (!currency) {
      return stageJson("quote_invalid", "Quote has no currency", 409, exposeStage);
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

    const createRequesterStripeCustomer = async () => {
      const authUser = await supabase.auth.admin.getUserById(user.id);
      const customer = await stripe.customers.create({
        email: authUser.data?.user?.email || undefined,
        metadata: { user_id: user.id },
      });
      const nextCustomerId = customer.id;
      const { error: customerUpdateErr } = await supabase.from("profiles").update({ stripe_customer_id: nextCustomerId }).eq("id", user.id);
      if (customerUpdateErr) {
        logStageError("service_chat_update_failed", customerUpdateErr);
        return { customerId: "", response: stageJson("service_chat_update_failed", "Customer profile could not be saved", 500, exposeStage) };
      }
      return { customerId: nextCustomerId, response: null };
    };

    let customerId: string | null = null;
    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    customerId = (requesterProfile?.stripe_customer_id as string | null) ?? null;
    try {
      if (customerId) {
        try {
          const existingCustomer = await stripe.customers.retrieve(customerId);
          if ((existingCustomer as unknown as { deleted?: boolean }).deleted === true) customerId = null;
        } catch (error) {
          const fields = stripeErrorFields(error);
          if (fields.code !== "resource_missing") throw error;
          customerId = null;
        }
      }
      if (!customerId) {
        const created = await createRequesterStripeCustomer();
        if (created.response) return created.response;
        customerId = created.customerId;
      }
    } catch (error) {
      logStageError("stripe_customer_create_failed", error);
      return stageJson("stripe_customer_create_failed", "Stripe customer could not be created", 500, exposeStage, { stripe: stripeErrorFields(error) });
    }

    // Dual-sided fee: 10% added to requester charge, 10% deducted from provider payout
    const REQUESTER_FEE_RATE = 0.10;
    const PROVIDER_FEE_RATE = 0.10;
    const quoteCents = amountCents; // authoritative from server-side quote_card
    const requesterFee = Math.round(quoteCents * REQUESTER_FEE_RATE);
    const providerFee = Math.round(quoteCents * PROVIDER_FEE_RATE);
    const customerTotal = quoteCents + requesterFee;
    const minimumChargeCents = STRIPE_MINIMUM_CHARGE_CENTS[currency] || 0;
    if (minimumChargeCents > 0 && customerTotal < minimumChargeCents) {
      return stageJson("quote_invalid", `Quote total is below Stripe minimum for ${currency.toUpperCase()}`, 409, exposeStage);
    }
    const providerPayout = quoteCents - providerFee;
    const platformGross = requesterFee + providerFee;

    const requestCard = (serviceChat.request_card || {}) as Record<string, unknown>;
    const snapshot = {
      serviceType: clean(quoteCard.serviceType) || clean(requestCard.serviceType) || requireSnapshotString(incomingSnapshot, "serviceType", "Service type"),
      petId: clean(quoteCard.petId) || clean(requestCard.petId) || requireSnapshotString(incomingSnapshot, "petId", "Pet"),
      startAt: clean(incomingSnapshot.startAt) || clean(requestCard.startAt) || clean(requestCard.requestedDate),
      endAt: clean(incomingSnapshot.endAt) || clean(requestCard.endAt) || clean(requestCard.requestedDate),
      handoffMethod: requireSnapshotString(incomingSnapshot, "handoffMethod", "Service location or handoff method"),
      emergencyContact: requireSnapshotString(incomingSnapshot, "emergencyContact", "Emergency contact"),
      careInstructions: requireSnapshotString(incomingSnapshot, "careInstructions", "Care instructions"),
      medicationAllergyNotes: clean(incomingSnapshot.medicationAllergyNotes),
      behaviorEscapeRisk: clean(incomingSnapshot.behaviorEscapeRisk),
      emergencyVetPermission: incomingSnapshot.emergencyVetPermission === true,
      price: {
        currency,
        providerQuote: quoteCents,
        requesterTotal: customerTotal,
      },
      cancellationTerms: "Final once confirmed unless Huddle, the provider, platform policy, or applicable law allows otherwise.",
      disputeIssueWindow: "Booking records, messages, timestamps, Start PIN events, check-in records, payment records, and related evidence may be reviewed for disputes or safety reports.",
      requesterId: user.id,
      providerId: serviceChat.provider_id,
      createdAt: new Date().toISOString(),
    };
    if (!snapshot.startAt) return json({ error: "Booking start time is required" }, 400);
    if (!snapshot.endAt) return json({ error: "Booking end time is required" }, 400);

    const { error: validateSnapshotErr } = await supabase.rpc("validate_service_booking_snapshot", { p_snapshot: snapshot });
    if (validateSnapshotErr) return json({ error: "Booking confirmation is incomplete" }, 400);

    const { error: snapshotErr } = await supabase
      .from("service_chats")
      .update({ booking_snapshot_pending: snapshot })
      .eq("chat_id", serviceChatId)
      .eq("status", "pending");
    if (snapshotErr) {
      logStageError("snapshot_pending_write_failed", snapshotErr);
      return stageJson("snapshot_pending_write_failed", "Booking confirmation could not be saved", 500, exposeStage);
    }

    // Idempotency key scoped to this service chat prevents duplicate checkout
    // sessions if the client retries on network failure.
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          customer: customerId,
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: customerTotal,
                product_data: {
                  name: "Pet Care Service Booking",
                  description: rate ? `Service booking (${rate}) - includes 10% platform service fee` : "Service booking - includes 10% platform service fee",
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
              quote_cents: String(quoteCents),
              requester_fee_cents: String(requesterFee),
              provider_fee_cents: String(providerFee),
              customer_total_cents: String(customerTotal),
              platform_gross_cents: String(platformGross),
              platform_fee_cents: String(platformGross),   // kept for backward compat with any tooling
              provider_payout_cents: String(providerPayout),
            },
          },
          metadata: {
            type: "service_booking",
            service_chat_id: serviceChatId,
            user_id: user.id,
            requester_id: user.id,
            provider_id: serviceChat.provider_id,
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey: `svc_pay_${serviceChatId}_${mode}_${customerId}_${currency}_${customerTotal}` },
      );
    } catch (error) {
      logStageError("stripe_checkout_create_failed", error);
      return stageJson("stripe_checkout_create_failed", "Stripe Checkout could not be created", 500, exposeStage, { stripe: stripeErrorFields(error) });
    }

    const { error: checkoutSessionErr } = await supabase
      .from("service_chats")
      .update({ stripe_checkout_session_id: session.id })
      .eq("chat_id", serviceChatId)
      .eq("status", "pending");
    if (checkoutSessionErr) {
      logStageError("service_chat_update_failed", checkoutSessionErr);
      return stageJson("service_chat_update_failed", "Checkout session could not be saved", 500, exposeStage);
    }

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
