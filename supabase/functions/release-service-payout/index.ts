import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeSecret =
  Deno.env.get("STRIPE_LIVE_SECRET_KEY") ||
  Deno.env.get("STRIPE_SECRET_KEY") ||
  Deno.env.get("STRIPE_TEST_SECRET_KEY") ||
  "";

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!stripeSecret) return json({ error: "Missing Stripe secret key" }, 500);

  let serviceChatId = "";
  let lockToken = "";

  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    serviceChatId = String(payload.service_chat_id || "").trim();
    if (!serviceChatId) return json({ error: "Missing service_chat_id" }, 400);

    lockToken = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const staleLockIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: claimedRow, error: claimError } = await supabase
      .from("service_chats")
      .update({
        payout_release_lock_token: lockToken,
        payout_release_locked_at: nowIso,
        payout_release_attempted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("chat_id", serviceChatId)
      .eq("status", "completed")
      .is("payout_released_at", null)
      .or(`payout_release_lock_token.is.null,payout_release_locked_at.lt.${staleLockIso}`)
      .select("chat_id, status, stripe_payment_intent_id, provider_id, request_card")
      .maybeSingle();

    if (claimError) {
      return json({ error: "claim_failed", detail: claimError.message }, 500);
    }

    if (!claimedRow) {
      return json({ ok: true, skipped: "already_released_or_claimed" });
    }

    const serviceChat = claimedRow;
    if (!serviceChat.stripe_payment_intent_id) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "missing_payment_intent" });
    }

    const { data: alreadyReleased } = await supabase
      .from("service_chats")
      .select("payout_released_at")
      .eq("chat_id", serviceChatId)
      .maybeSingle();

    if (alreadyReleased?.payout_released_at) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "already_released" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(serviceChat.stripe_payment_intent_id);
    const providerStripeAccountId = String(paymentIntent.metadata?.provider_stripe_account_id || "").trim();
    const providerPayoutCents = Number(paymentIntent.metadata?.provider_payout_cents || 0);

    if (!providerStripeAccountId || !providerPayoutCents) {
      await supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("chat_id", serviceChatId)
        .eq("payout_release_lock_token", lockToken);
      return json({ ok: true, skipped: "missing_payout_metadata" });
    }

    await stripe.transfers.create({
      amount: providerPayoutCents,
      currency: paymentIntent.currency || "usd",
      destination: providerStripeAccountId,
      transfer_group: `service_chat_${serviceChatId}`,
      metadata: {
        service_chat_id: serviceChatId,
        payment_intent_id: paymentIntent.id,
      },
    });

    await supabase
      .from("service_chats")
      .update({
        payout_released_at: new Date().toISOString(),
        payout_release_lock_token: null,
        payout_release_locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("chat_id", serviceChatId)
      .eq("payout_release_lock_token", lockToken);

    const providerId = String((serviceChat as Record<string, unknown>)?.provider_id || "").trim();
    const requestCard = ((serviceChat as Record<string, unknown>)?.request_card || {}) as Record<string, unknown>;
    const serviceType = String(requestCard.serviceType || "service").trim() || "service";
    if (providerId) {
      await supabase.rpc("service_notify", {
        p_user_id: providerId,
        p_kind: "service_payout_released",
        p_title: "Payout released",
        p_body: `Your earnings for ${serviceType} are on the way.`,
        p_href: `/chats?tab=service&room=${serviceChatId}`,
        p_data: {
          kind: "service_payout_released",
          chatId: serviceChatId,
          serviceType,
        },
      });
    }

    return json({ ok: true });
  } catch (error) {
    if (serviceChatId) {
      let unlockQuery = supabase
        .from("service_chats")
        .update({
          payout_release_lock_token: null,
          payout_release_locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("chat_id", serviceChatId);
      if (lockToken) {
        unlockQuery = unlockQuery.eq("payout_release_lock_token", lockToken);
      }
      await unlockQuery;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[release-service-payout] failed:", message);
    return json({ error: "internal_error", detail: message }, 500);
  }
});
