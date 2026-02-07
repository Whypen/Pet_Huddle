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

serve(async () => {
  try {
    const stripeOk = await stripe.balance.retrieve().then(() => true).catch(() => false);
    const { error } = await supabase.from("profiles").select("id").limit(1);
    const supabaseOk = !error;

    if (!stripeOk || !supabaseOk) {
      return json({ ok: false, stripeOk, supabaseOk }, 503);
    }
    return json({ ok: true, stripeOk, supabaseOk }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message || "health-check failed" }, 503);
  }
});
