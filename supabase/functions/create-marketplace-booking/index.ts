// =====================================================
// CREATE MARKETPLACE BOOKING WITH ESCROW
// 10% Platform Fee + 48-hour Escrow Release
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
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const allowStripeFallback = Deno.env.get("ALLOW_STRIPE_FALLBACK") === "true";

serve(async (req: Request) => {
  try {
    const {
      clientId,
      sitterId,
      amount, // In cents
      currency,
      serviceStartDate,
      serviceEndDate,
      successUrl,
      cancelUrl,
      petId,
      locationName,
    } = await req.json();

    if (!clientId || !sitterId || !amount || !serviceStartDate || !serviceEndDate) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get sitter's Stripe Connect account
    const { data: sitter } = await supabase
      .from("sitter_profiles")
      .select("stripe_connect_account_id, payouts_enabled, charges_enabled, hourly_rate")
      .eq("user_id", sitterId)
      .single();

    if (!sitter?.stripe_connect_account_id) {
      return new Response(
        JSON.stringify({ error: "Sitter has not completed onboarding" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!sitter.payouts_enabled || !sitter.charges_enabled) {
      return new Response(
        JSON.stringify({ error: "Sitter account not ready for payments" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate amount against sitter hourly rate and duration
    const start = new Date(serviceStartDate);
    const end = new Date(serviceEndDate);
    const durationMs = end.getTime() - start.getTime();
    if (isNaN(durationMs) || durationMs <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid service date range" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const durationHours = durationMs / (1000 * 60 * 60);
    const hourlyRate = sitter?.hourly_rate;
    if (!hourlyRate) {
      return new Response(
        JSON.stringify({ error: "Sitter hourly rate not set" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const expectedAmount = Math.round(hourlyRate * durationHours);
    if (amount !== expectedAmount) {
      return new Response(
        JSON.stringify({ error: "Invalid booking amount" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate fees
    const platformFee = Math.round(amount * 0.1); // 10% platform fee
    const sitterPayout = amount - platformFee;

    // Generate idempotency key
    const idempotencyKey = `booking-${clientId}-${sitterId}-${Date.now()}`;

    let checkoutUrl: string | null = null;
    let paymentIntentId: string;
    let usingFallback = false;

    const normalizedCurrency = typeof currency === "string" && currency.length === 3
      ? currency.toLowerCase()
      : "usd";

    try {
      // Create Checkout Session with destination charge
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: normalizedCurrency,
                product_data: {
                  name: "Pet Sitting Service",
                  description: `Service from ${new Date(serviceStartDate).toLocaleDateString()} to ${new Date(serviceEndDate).toLocaleDateString()}`,
                },
                unit_amount: amount,
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            application_fee_amount: platformFee,
            transfer_data: {
              destination: sitter.stripe_connect_account_id,
            },
            metadata: {
              client_id: clientId,
              sitter_id: sitterId,
              service_start_date: serviceStartDate,
              service_end_date: serviceEndDate,
              pet_id: petId || "",
              location_name: locationName || "",
            },
          },
          metadata: {
            type: "marketplace_booking",
            client_id: clientId,
            sitter_id: sitterId,
            pet_id: petId || "",
            location_name: locationName || "",
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey }
      );
      checkoutUrl = session.url;
      paymentIntentId = session.payment_intent as string;
    } catch (stripeError: any) {
      if (!allowStripeFallback) throw stripeError;
      usingFallback = true;
      paymentIntentId = `pi_local_${crypto.randomUUID().replaceAll("-", "")}`;
      checkoutUrl = `${successUrl}?mock_checkout=true&booking_intent=${paymentIntentId}`;
    }

    // Create booking record in database (pending payment)
    const escrowReleaseDate = new Date(serviceEndDate);
    escrowReleaseDate.setHours(escrowReleaseDate.getHours() + 48); // 48 hours after service end

    const { data: booking, error: bookingError } = await supabase
      .from("marketplace_bookings")
      .insert({
        client_id: clientId,
        sitter_id: sitterId,
        stripe_payment_intent_id: paymentIntentId,
        amount,
        platform_fee: platformFee,
        sitter_payout: sitterPayout,
        service_start_date: serviceStartDate,
        service_end_date: serviceEndDate,
        escrow_release_date: escrowReleaseDate.toISOString(),
        status: "pending",
      })
      .select()
      .single();

    if (bookingError) {
      console.error("Booking creation error:", bookingError);
      throw new Error("Failed to create booking record");
    }

    return new Response(
      JSON.stringify({
        url: checkoutUrl,
        bookingId: booking.id,
        escrowReleaseDate: escrowReleaseDate.toISOString(),
        mock: usingFallback,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Marketplace booking error:", error);
    const message = `${error?.message || ""}`.toLowerCase();
    if (message.includes("quota") || message.includes("rate limit")) {
      return new Response(
        JSON.stringify({ error: "Quota Exceeded" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
