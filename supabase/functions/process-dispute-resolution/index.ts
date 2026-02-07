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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: authUser, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: roleRow } = await supabase
      .from("profiles")
      .select("user_role")
      .eq("id", authUser.user.id)
      .maybeSingle();

    if (roleRow?.user_role !== "admin") {
      return json({ error: "Forbidden" }, 403);
    }

    const { bookingId, action } = await req.json();
    if (!bookingId || !["release", "refund"].includes(action)) {
      return json({ error: "Missing or invalid parameters" }, 400);
    }

    const { data: booking, error } = await supabase
      .from("marketplace_bookings")
      .select("id, stripe_payment_intent_id, stripe_charge_id, amount, platform_fee, sitter_payout, status, sitter_id")
      .eq("id", bookingId)
      .single();

    if (error || !booking) return json({ error: "Booking not found" }, 404);

    if (action === "refund") {
      if (booking.stripe_payment_intent_id?.startsWith("pi_")) {
        await stripe.refunds.create(
          { payment_intent: booking.stripe_payment_intent_id },
          { idempotencyKey: `refund_${bookingId}` }
        );
      }
      await supabase
        .from("marketplace_bookings")
        .update({
          status: "refunded",
          escrow_status: "refunded",
          platform_fee: 0,
          sitter_payout: 0,
        })
        .eq("id", bookingId);
      return json({ ok: true });
    }

    const { data: sitter } = await supabase
      .from("sitter_profiles")
      .select("stripe_connect_account_id")
      .eq("user_id", booking.sitter_id)
      .maybeSingle();

    if (!sitter?.stripe_connect_account_id) {
      return json({ error: "Sitter has no connected account" }, 400);
    }

    let chargeId = booking.stripe_charge_id;
    let currency = "usd";
    if (booking.stripe_payment_intent_id?.startsWith("pi_")) {
      const intent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      currency = intent.currency || currency;
      if (!chargeId && intent.latest_charge) {
        chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge.id;
      }
    }

    const transfer = await stripe.transfers.create(
      {
        amount: booking.sitter_payout,
        currency,
        destination: sitter.stripe_connect_account_id,
        ...(chargeId ? { source_transaction: chargeId } : {}),
        metadata: { booking_id: bookingId },
      },
      { idempotencyKey: `transfer_${bookingId}` }
    );

    await supabase
      .from("marketplace_bookings")
      .update({
        status: "completed",
        escrow_status: "released",
        stripe_transfer_id: transfer.id,
        stripe_charge_id: chargeId || booking.stripe_charge_id,
      })
      .eq("id", bookingId);

    return json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Server error" }, 500);
  }
});
