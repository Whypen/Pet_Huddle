import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeMode = stripeSecret.startsWith("sk_live_") ? "live" : "test";

const PRICE_IDS: Record<string, string | undefined> = {
  plus_monthly: Deno.env.get("STRIPE_PRICE_PLUS_MONTHLY"),
  plus_annual: Deno.env.get("STRIPE_PRICE_PLUS_ANNUAL"),
  gold_monthly: Deno.env.get("STRIPE_PRICE_GOLD_MONTHLY"),
  gold_annual: Deno.env.get("STRIPE_PRICE_GOLD_ANNUAL"),
  star_pack: Deno.env.get("STRIPE_PRICE_STAR_PACK"),
  emergency_alert: Deno.env.get("STRIPE_PRICE_BROADCAST_ALERT"),
  vet_media: Deno.env.get("STRIPE_PRICE_MEDIA_10"),
};

const DEFAULTS: Record<string, { amount: number; currency: string; interval?: string }> = {
  plus_monthly: { amount: 5.99,  currency: "usd", interval: "month" },
  plus_annual:  { amount: 59.99, currency: "usd", interval: "year" },
  gold_monthly: { amount: 11.99, currency: "usd", interval: "month" },
  gold_annual:  { amount: 109.99, currency: "usd", interval: "year" },
  star_pack: { amount: 4.99, currency: "usd" },
  emergency_alert: { amount: 2.99, currency: "usd" },
  vet_media: { amount: 3.99, currency: "usd" },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async () => {
  try {
    const required = ["plus_monthly", "plus_annual", "gold_monthly", "gold_annual"];
    for (const key of required) {
      if (!PRICE_IDS[key]) {
        return json({ error: `Stripe config invalid: missing ${key} price id for ${stripeMode} mode` }, 500);
      }
    }

    const results: Record<string, { amount: number; currency: string; interval?: string }> = {};
    for (const [key, priceId] of Object.entries(PRICE_IDS)) {
      if (!priceId) {
        results[key] = DEFAULTS[key];
        continue;
      }
      const price = await stripe.prices.retrieve(priceId);
      results[key] = {
        amount: (price.unit_amount || 0) / 100,
        currency: price.currency || "usd",
        interval: price.recurring?.interval,
      };
    }

    return json({ prices: results, defaults: DEFAULTS, stripe_mode: stripeMode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || "Failed to fetch pricing" }, 500);
  }
});
