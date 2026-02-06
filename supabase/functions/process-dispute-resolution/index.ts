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
    const { bookingId, action } = await req.json();
    if (!bookingId || !["release", "refund"].includes(action)) {
      return json({ error: "Missing or invalid parameters" }, 400);
    }

    const { data: booking, error } = await supabase
      .from("marketplace_bookings")
      .select("id, stripe_payment_intent_id, amount, platform_fee, sitter_payout, status")
      .eq("id", bookingId)
      .single();

    if (error || !booking) return json({ error: "Booking not found" }, 404);

    if (action === "refund") {
      if (booking.stripe_payment_intent_id?.startsWith("pi_")) {
        await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id });
      }
      await supabase
        .from("marketplace_bookings")
        .update({
          status: "refunded",
          platform_fee: 0,
          sitter_payout: 0,
        })
        .eq("id", bookingId);
      return json({ ok: true });
    }

    // release
    await supabase
      .from("marketplace_bookings")
      .update({
        status: "released",
        platform_fee: booking.platform_fee,
        sitter_payout: booking.sitter_payout,
      })
      .eq("id", bookingId);

    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message || "Server error" }, 500);
  }
});
