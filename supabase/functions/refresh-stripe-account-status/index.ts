// refresh-stripe-account-status
// Fetches the Stripe account and syncs all wallet fields to DB.
// Called after the embedded onboarding modal exits (belt-and-suspenders alongside webhook).

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
const RATE_BUCKETS = new Map<string, { count: number; windowStart: number }>();

const getClientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const isWithinRateLimit = (key: string, max: number): { ok: boolean; resetAt?: number } => {
  const now = Date.now();
  const bucket = RATE_BUCKETS.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    RATE_BUCKETS.set(key, { count: 1, windowStart: now });
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

const resolveSecret = (): string => {
  const live = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY"));
  const def = cleanEnv(Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
  const hint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();
  if (hint === "live" && live) return live;
  if (live && def.startsWith("sk_test_")) return live;
  return def || live || "";
};

const resolvePayoutStatus = (
  detailsSubmitted: boolean,
  payoutsEnabled: boolean,
  currentlyDue: string[],
): "pending" | "needs_action" | "complete" => {
  if (detailsSubmitted && payoutsEnabled && currentlyDue.length === 0) return "complete";
  if (currentlyDue.length > 0 || !payoutsEnabled) return "needs_action";
  return "pending";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const clientIp = getClientIp(req);
    if (!enforceBodySize(req)) {
      return Response.json({ error: "Request body too large" }, { status: 413, headers: corsHeaders });
    }
    const ipRate = isWithinRateLimit(`refresh-stripe-account-status:ip:${clientIp}`, IP_RATE_LIMIT_MAX);
    if (!ipRate.ok) {
      const wait = Math.max(1, Math.ceil(((ipRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[refresh-stripe-account-status] rate limit blocked by ip", { ip: clientIp });
      return Response.json(
        { error: "Too many requests", code: "ip_rate_limited" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": String(wait) } },
      );
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

    const userRate = isWithinRateLimit(`refresh-stripe-account-status:user:${user.id}`, USER_RATE_LIMIT_MAX);
    if (!userRate.ok) {
      const wait = Math.max(1, Math.ceil(((userRate.resetAt ?? Date.now()) - Date.now()) / 1000));
      console.warn("[refresh-stripe-account-status] rate limit blocked by user", { userId: user.id, ip: clientIp });
      return Response.json(
        { error: "Too many requests", code: "user_rate_limited" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": String(wait) } },
      );
    }

    // ── Get existing account id ───────────────────────────────────────────
    const { data: profile } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const accountId = String(
      (profile as Record<string, unknown> | null)?.stripe_account_id || "",
    ).trim();

    if (!accountId) {
      return Response.json({ status: "pending", code: "no_account" }, { headers: corsHeaders });
    }

    const secret = resolveSecret();
    if (!secret)
      return Response.json(
        { error: "Stripe secret key missing" },
        { status: 500, headers: corsHeaders },
      );

    const stripe = new Stripe(secret, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // ── Fetch account from Stripe ─────────────────────────────────────────
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(accountId);
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("no such account")) {
        return Response.json(
          { status: "pending", code: "account_not_found" },
          { headers: corsHeaders },
        );
      }
      throw e;
    }

    const currentlyDue = Array.isArray(account.requirements?.currently_due)
      ? (account.requirements?.currently_due ?? []).filter(Boolean)
      : [];
    const eventuallyDue = Array.isArray(account.requirements?.eventually_due)
      ? (account.requirements?.eventually_due ?? []).filter(Boolean)
      : [];
    const detailsSubmitted = account.details_submitted === true;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;
    const payoutStatus = resolvePayoutStatus(detailsSubmitted, payoutsEnabled, currentlyDue);

    const update: Record<string, unknown> = {
      stripe_details_submitted: detailsSubmitted,
      stripe_charges_enabled: chargesEnabled,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_requirements_currently_due: currentlyDue,
      stripe_payout_status: payoutStatus,
      stripe_requirements_state: {
        currently_due: currentlyDue,
        eventually_due: eventuallyDue,
        synced_at: new Date().toISOString(),
      },
    };
    if (payoutsEnabled) {
      update.stripe_onboarding_completed_at = new Date().toISOString();
    }

    await supabase
      .from("pet_care_profiles")
      .update(update)
      .eq("user_id", user.id);

    return Response.json(
      {
        status: payoutStatus,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
        currently_due: currentlyDue,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[refresh-stripe-account-status]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: "Internal error", detail: msg },
      { status: 500, headers: corsHeaders },
    );
  }
});
