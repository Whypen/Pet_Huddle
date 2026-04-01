// create-or-get-stripe-account
// Silent, idempotent Stripe Express connected account creation.
// Called from CarerProfile on first skill selection (debounced, no UI blocking).
// Does NOT create account sessions — that is create-account-session's job.
//
// Stripe account type: "express" — confirmed in use by existing create-stripe-connect-link
// edge function. Account Sessions (accountSessions.create) support Express accounts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cleanEnv = (v: string | undefined | null): string => {
  const r = String(v || "").trim();
  if (!r) return "";
  if ((r.startsWith('"') && r.endsWith('"')) || (r.startsWith("'") && r.endsWith("'")))
    return r.slice(1, -1).trim();
  return r;
};

const resolveStripeSecret = (): string => {
  const live = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY"));
  const def = cleanEnv(Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
  const hint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();
  if (hint === "live" && live) return live;
  if (live && def.startsWith("sk_test_")) return live;
  return def || live || "";
};

const COUNTRY_MAP: Record<string, string> = {
  "hong kong": "HK", "hong kong sar": "HK", "hong kong sar china": "HK",
  "singapore": "SG", "united states": "US", "united states of america": "US",
  "united kingdom": "GB", "great britain": "GB", "australia": "AU",
  "japan": "JP", "canada": "CA", "new zealand": "NZ", "taiwan": "TW",
  "macau": "MO", "macao": "MO",
};
const normalizeCountry = (c: string): string | null => {
  const s = String(c || "").trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_MAP[s.toLowerCase()] || null;
};

const slugify = (v: string) =>
  String(v || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

const splitName = (n: string) => {
  const parts = String(n || "").trim().replace(/\s+/g, " ").split(" ");
  return { first: parts[0] || null, last: parts.slice(1).join(" ") || null };
};

// MCC mapping — deterministic primary-service rule.
// "Vet / Licensed Care" skill present → 0742 (veterinary services)
// All other provider profiles → 7299 (misc personal services)
const VET_SKILL = "Vet / Licensed Care";
const MCC_VET = "0742";
const MCC_DEFAULT = "7299";

// Product descriptions aligned with MCC/industry
const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  [MCC_VET]: "Professional veterinary pet care services provided via the Huddle platform.",
  [MCC_DEFAULT]: "Independent pet sitting and dog walking services provided via the Huddle platform.",
};

const resolveMcc = (skills: string[]): string =>
  skills.includes(VET_SKILL) ? MCC_VET : MCC_DEFAULT;

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

    // ── Check existing account (idempotency) ───────────────────────────────
    const [profileResult, huddleProfileResult] = await Promise.all([
      supabase
        .from("pet_care_profiles")
        .select("stripe_account_id, skills")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("social_id, display_name, legal_name, phone, location_country")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const existing = profileResult.data as Record<string, unknown> | null;
    const hp = huddleProfileResult.data as Record<string, unknown> | null;
    const existingAccountId = String(existing?.stripe_account_id || "").trim();

    const secret = resolveStripeSecret();
    if (!secret)
      return Response.json(
        { error: "Stripe secret key missing on server" },
        { status: 500, headers: corsHeaders },
      );

    const stripe = new Stripe(secret, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // If account already exists, verify it's still valid then return early
    if (existingAccountId) {
      try {
        await stripe.accounts.retrieve(existingAccountId);
        return Response.json(
          { stripe_account_id: existingAccountId, created: false },
          { headers: corsHeaders },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message.toLowerCase() : "";
        if (!msg.includes("no such account")) throw e;
        // Account deleted from Stripe — fall through to create fresh
      }
    }

    // ── Resolve prefill data ───────────────────────────────────────────────
    const skills = (existing?.skills as string[]) ?? [];
    const mcc = resolveMcc(skills);
    const productDescription = PRODUCT_DESCRIPTIONS[mcc];

    const email = String(user.email || "").trim() || undefined;
    const socialId = String(hp?.social_id || "").trim();
    const displayName = String(hp?.display_name || "").trim();
    const legalName = String(hp?.legal_name || displayName || "").trim();
    const phone = String(hp?.phone || "").trim() || undefined;
    const country = normalizeCountry(String(hp?.location_country || "")) ?? undefined;
    const usernameSlug = slugify(socialId || displayName || user.id);
    const { first, last } = splitName(legalName);
    const appUrl = cleanEnv(
      Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL") || "https://huddle.pet",
    ).replace(/\/+$/, "");
    const profileUrl = `${appUrl}/@${usernameSlug}`;

    // ── Create Express account with prefills ───────────────────────────────
    const account = await stripe.accounts.create(
      {
        type: "express",
        email,
        country,
        business_type: "individual",
        ...(first || last
          ? { individual: { first_name: first ?? undefined, last_name: last ?? undefined, phone } }
          : {}),
        business_profile: {
          mcc,
          url: profileUrl,
          product_description: productDescription,
        },
        metadata: {
          huddle_user_id: user.id,
          huddle_social_id: socialId || user.id,
        },
      },
      { idempotencyKey: `huddle_connect_${user.id}` },
    );

    // ── Persist to DB ──────────────────────────────────────────────────────
    await supabase.from("pet_care_profiles").upsert(
      {
        user_id: user.id,
        stripe_account_id: account.id,
        stripe_details_submitted: account.details_submitted === true,
        stripe_charges_enabled: account.charges_enabled === true,
        stripe_payouts_enabled: account.payouts_enabled === true,
        stripe_payout_status: "pending",
        stripe_onboarding_started_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return Response.json(
      { stripe_account_id: account.id, created: true },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[create-or-get-stripe-account]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "Internal error", detail: msg },
      { status: 500, headers: corsHeaders },
    );
  }
});
