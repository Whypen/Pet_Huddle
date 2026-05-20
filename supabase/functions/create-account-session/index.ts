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

const RATE_LIMIT_WINDOW_MS = 60_000;
const IP_RATE_LIMIT_MAX = 80;
const USER_RATE_LIMIT_MAX = 30;
const MAX_BODY_BYTES = 16_000;
const IP_RATE_BUCKET = new Map<string, { count: number; windowStart: number }>();

const getClientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const isWithinRateLimit = (key: string, max: number): { ok: boolean; resetAt?: number } => {
  const now = Date.now();
  const bucket = IP_RATE_BUCKET.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    IP_RATE_BUCKET.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count <= max) return { ok: true };
  return { ok: false, resetAt: bucket.windowStart + RATE_LIMIT_WINDOW_MS };
};

const enforceBodySize = (req: Request): boolean => {
  const rawLength = Number(req.headers.get("content-length") || 0);
  if (!Number.isFinite(rawLength) || rawLength <= 0) return true;
  return rawLength <= MAX_BODY_BYTES;
};

const resolveSupabaseServiceKey = (): string =>
  cleanEnv(Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY"))
  || cleanEnv(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const isJwt = (value: string): boolean => value.split(".").length === 3;

const decodePayload = (value: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(atob(value.split(".")[1]));
  } catch {
    return null;
  }
};

const isUserToken = (value: string): boolean => {
  if (!isJwt(value)) return false;
  const payload = decodePayload(value);
  const role = String(payload?.role || "").trim().toLowerCase();
  return Boolean(payload?.sub) && role !== "anon" && role !== "service_role";
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
    const clientIp = getClientIp(req);
    if (!enforceBodySize(req)) {
      return Response.json({ error: "Request body too large" }, { status: 413, headers: corsHeaders });
    }
    const ipRate = isWithinRateLimit(`create-account-session:ip:${clientIp}`, IP_RATE_LIMIT_MAX);
    if (!ipRate.ok) {
      const wait = Math.max(1, Math.ceil(((ipRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[create-account-session] rate limit blocked by ip", { ip: clientIp });
      return Response.json({ error: "Too many requests" }, {
        status: 429,
        headers: { ...corsHeaders, "Retry-After": String(wait) },
      });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
    const bodyToken = String(body.access_token || "").trim();
    const token =
      [
        bodyToken,
        huddleToken.replace(/^Bearer\s+/i, "").trim(),
        authHeader.replace(/^Bearer\s+/i, "").trim(),
      ].find(isUserToken)
      || [
        bodyToken,
        huddleToken.replace(/^Bearer\s+/i, "").trim(),
        authHeader.replace(/^Bearer\s+/i, "").trim(),
      ].find(isJwt)
      || "";
    if (!token)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") as string,
      resolveSupabaseServiceKey(),
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user)
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const userRate = isWithinRateLimit(`create-account-session:user:${user.id}`, USER_RATE_LIMIT_MAX);
    if (!userRate.ok) {
      const wait = Math.max(1, Math.ceil(((userRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[create-account-session] rate limit blocked by user", { userId: user.id, ip: clientIp });
      return Response.json(
        { error: "Too many requests", code: "user_rate_limited" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": String(wait) } },
      );
    }

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

    const requestedAccountId = String(body.stripe_account_id || "").trim();
    const accountId = requestedAccountId || String(careProfile?.stripe_account_id || "").trim();

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
