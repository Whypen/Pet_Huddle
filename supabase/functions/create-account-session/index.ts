// create-account-session
// Creates a Stripe Account Session for the embedded account_onboarding component.
// Only called when the user explicitly taps "Set Wallet" — never called silently.
// Returns client_secret + publishable_key so the frontend can initialise Connect.js.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, x-supabase-client-platform, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cleanEnv = (v: string | undefined | null): string => {
  const r = String(v || "").trim();
  if (!r) return "";
  if ((r.startsWith('"') && r.endsWith('"')) || (r.startsWith("'") && r.endsWith("'")))
    return r.slice(1, -1).trim();
  return r;
};

// Resolve test or live Stripe key pair, matching the pattern used by
// create-identity-setup-intent for consistency.
const resolveKeyPair = (req: Request): { secretKey: string; publishableKey: string } => {
  const origin = req.headers.get("origin") || "";
  const isLocalHttp =
    /^http:\/\/((localhost|127\.0\.0\.1)(:\d+)?)/.test(origin);

  const testSecret = cleanEnv(Deno.env.get("STRIPE_TEST_SECRET_KEY"));
  const testPub = cleanEnv(Deno.env.get("STRIPE_TEST_PUBLISHABLE_KEY"));
  const liveSecret = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
  const livePub = cleanEnv(Deno.env.get("STRIPE_LIVE_PUBLISHABLE_KEY") || Deno.env.get("STRIPE_PUBLISHABLE_KEY"));
  const hint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();

  if (isLocalHttp && testSecret && testPub)
    return { secretKey: testSecret, publishableKey: testPub };
  if (hint === "test" && testSecret && testPub)
    return { secretKey: testSecret, publishableKey: testPub };
  if (liveSecret && livePub)
    return { secretKey: liveSecret, publishableKey: livePub };
  if (testSecret && testPub)
    return { secretKey: testSecret, publishableKey: testPub };

  throw new Error("missing_stripe_keys");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
    const token =
      [authHeader.replace(/^Bearer\s+/i, "").trim(), huddleToken.replace(/^Bearer\s+/i, "").trim()]
        .find((t) => t.split(".").length === 3) || "";
    if (!token)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    // ── Require existing stripe_account_id + fetch prefill data ─────────
    const [careProfileResult, huddleProfileResult] = await Promise.all([
      supabase
        .from("pet_care_profiles")
        .select("stripe_account_id, skills")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("social_id, display_name, legal_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const careProfile = careProfileResult.data as Record<string, unknown> | null;
    const hp = huddleProfileResult.data as Record<string, unknown> | null;

    const accountId = String(careProfile?.stripe_account_id || "").trim();

    if (!accountId) {
      return Response.json(
        { error: "No Stripe account found. Please wait a moment and retry.", code: "account_missing" },
        { status: 409, headers: corsHeaders },
      );
    }

    // ── Resolve keys + create Account Session ─────────────────────────────
    const { secretKey, publishableKey } = resolveKeyPair(req);
    const stripe = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Backfill business_profile for accounts created before the wallet prefill flow.
    // Fire-and-forget — session creation is not blocked by this.
    const skills = (careProfile?.skills as string[]) ?? [];
    const mcc = skills.includes("Vet / Licensed Care") ? "0742" : "7299";
    const productDesc = mcc === "0742"
      ? "Professional veterinary pet care services provided via the Huddle platform."
      : "Independent pet sitting and dog walking services provided via the Huddle platform.";
    const socialId = String(hp?.social_id || "").trim();
    const displayName = String(hp?.display_name || "").trim();
    const slug = (socialId || displayName || user.id)
      .toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const appUrl = cleanEnv(Deno.env.get("SITE_URL") || "https://huddle.pet").replace(/\/+$/, "");
    stripe.accounts.update(accountId, {
      business_profile: { mcc, url: `${appUrl}/@${slug}`, product_description: productDesc },
    }).catch(() => { /* non-fatal */ });

    const session = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
      },
    });

    return Response.json(
      { client_secret: session.client_secret, publishable_key: publishableKey },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[create-account-session]", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "missing_stripe_keys")
      return Response.json(
        { error: "Stripe keys not configured on server" },
        { status: 500, headers: corsHeaders },
      );
    return Response.json(
      { error: "Internal error", detail: msg },
      { status: 500, headers: corsHeaders },
    );
  }
});
