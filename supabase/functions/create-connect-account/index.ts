// =====================================================
// CREATE STRIPE CONNECT EXPRESS ACCOUNT
// For pet sitters to receive payouts
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
    const { userId, email, returnUrl, refreshUrl } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if sitter profile already exists
    const { data: existingSitter } = await supabase
      .from("sitter_profiles")
      .select("stripe_connect_account_id")
      .eq("user_id", userId)
      .single();

    let accountId = existingSitter?.stripe_connect_account_id;

    try {
      // Create Connect account if doesn't exist
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: { user_id: userId },
        });

        accountId = account.id;

        // Create sitter profile in database
        await supabase.from("sitter_profiles").insert({
          user_id: userId,
          stripe_connect_account_id: accountId,
          onboarding_complete: false,
          payouts_enabled: false,
          charges_enabled: false,
        });
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl || `${Deno.env.get("PUBLIC_URL")}/become-sitter`,
        return_url: returnUrl || `${Deno.env.get("PUBLIC_URL")}/become-sitter?success=true`,
        type: "account_onboarding",
      });

      return new Response(
        JSON.stringify({ url: accountLink.url, accountId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (stripeError: any) {
      if (!allowStripeFallback) throw stripeError;

      // Localhost/testing fallback while Stripe live activation is pending.
      const fallbackAccountId = accountId || `acct_local_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
      await supabase.from("sitter_profiles").upsert({
        user_id: userId,
        stripe_connect_account_id: fallbackAccountId,
        onboarding_complete: true,
        payouts_enabled: true,
        charges_enabled: true,
      });

      const fallbackUrl = `${returnUrl || Deno.env.get("PUBLIC_URL") || "http://localhost:8080"}/become-sitter?mock_connect=true`;
      return new Response(
        JSON.stringify({ url: fallbackUrl, accountId: fallbackAccountId, mock: true, reason: stripeError.message }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("Connect account error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
