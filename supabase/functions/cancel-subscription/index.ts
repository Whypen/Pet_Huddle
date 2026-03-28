import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") as string;

const stripe = new Stripe(stripeSecret, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const SHARE_PERKS_KEYS = new Set(["sharePerks", "family_member", "Family_Member", "share_perks", "familymember"]);
const ALLOWED_REASONS = new Set([
  "Too expensive",
  "Not using it enough",
  "Not enough value",
  "Temporary break",
  "Found another option",
  "Other",
]);

type CancelTarget = "base" | "share_perks";

const mapStripeStatusToProfileStatus = (status: string): string => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "active" || normalized === "trialing") return "premium_active";
  if (normalized === "past_due" || normalized === "incomplete") return "premium_pending";
  if (normalized === "canceled" || normalized === "unpaid" || normalized === "incomplete_expired") return "premium_cancelled";
  return "premium_pending";
};

const parseSharePerksIds = (prefs: unknown): string[] => {
  if (!prefs || typeof prefs !== "object") return [];
  const raw = (prefs as Record<string, unknown>).share_perks_subscription_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
};

const updatedPeriodEndIso = (subscription: Stripe.Subscription): string | null => (
  typeof subscription.current_period_end === "number"
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null
);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleTokenHeader = req.headers.get("x-huddle-access-token") ?? "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const huddleToken = huddleTokenHeader.replace(/^Bearer\s+/i, "").trim();
    const accessToken = [bearerToken, huddleToken].find((token) => token.split(".").length === 3) || "";
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const payload = (await req.json().catch(() => null)) as
      | { target?: unknown; reason?: unknown; reasonOther?: unknown; previewOnly?: unknown }
      | null;
    const target = String(payload?.target || "").trim().toLowerCase() as CancelTarget;
    const previewOnly = payload?.previewOnly === true;
    const reason = String(payload?.reason || "").trim();
    const reasonOther = String(payload?.reasonOther || "").trim();

    if (target !== "base" && target !== "share_perks") {
      return json({ error: "Invalid cancel target" }, 400);
    }
    if (!previewOnly && !ALLOWED_REASONS.has(reason)) {
      return json({ error: "Cancellation reason is required" }, 400);
    }
    if (!previewOnly && reason === "Other" && !reasonOther) {
      return json({ error: "Please provide details for Other reason" }, 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id,stripe_customer_id,stripe_subscription_id,share_perks_subscription_id,prefs,subscription_cancel_requested_at,share_perks_cancel_requested_at",
      )
      .eq("id", authData.user.id)
      .single();
    if (profileError || !profile) return json({ error: "Profile not found" }, 404);

    const stripeCustomerId = String(profile.stripe_customer_id || "").trim();
    let subscriptionId = "";
    if (target === "base") {
      subscriptionId = String(profile.stripe_subscription_id || "").trim();
    } else {
      subscriptionId = String(profile.share_perks_subscription_id || "").trim();
      if (!subscriptionId) {
        const ids = parseSharePerksIds(profile.prefs);
        subscriptionId = ids[0] || "";
      }
    }
    if (!subscriptionId) {
      return json({ error: "No active subscription found for this item" }, 409);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || "";
    if (stripeCustomerId && customerId && stripeCustomerId !== customerId) {
      return json({ error: "Subscription ownership mismatch" }, 403);
    }

    if (target === "share_perks") {
      const isSharePerks =
        SHARE_PERKS_KEYS.has(String(subscription.metadata?.type || "").trim())
        || subscription.items.data.some((item) => String(item.price?.id || "").trim() === String(Deno.env.get("STRIPE_PRICE_FAMILY_MEMBER") || "").trim());
      if (!isSharePerks) {
        return json({ error: "Target subscription is not Share Perks" }, 409);
      }
    }

    const periodEndIso = updatedPeriodEndIso(subscription);
    if (previewOnly) {
      return json({
        success: true,
        target,
        endDate: periodEndIso,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      });
    }

    const updatedSubscription = subscription.cancel_at_period_end
      ? subscription
      : await stripe.subscriptions.update(subscription.id, {
          cancel_at_period_end: true,
          metadata: {
            ...subscription.metadata,
            cancel_reason: reason,
            cancel_reason_other: reason === "Other" ? reasonOther : "",
            cancel_requested_at: new Date().toISOString(),
            cancel_target: target,
          },
        });

    const scheduledPeriodEndIso = updatedPeriodEndIso(updatedSubscription);

    const nowIso = new Date().toISOString();
    if (target === "base") {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          subscription_status: mapStripeStatusToProfileStatus(updatedSubscription.status),
          subscription_current_period_end: scheduledPeriodEndIso,
          subscription_cancel_at_period_end: true,
          subscription_cancel_requested_at: profile.subscription_cancel_requested_at || nowIso,
          subscription_cancel_reason: reason,
          subscription_cancel_reason_other: reason === "Other" ? reasonOther : null,
          updated_at: nowIso,
        })
        .eq("id", authData.user.id);
      if (updateError) throw updateError;
    } else {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          share_perks_subscription_id: updatedSubscription.id,
          share_perks_subscription_status: updatedSubscription.status,
          share_perks_subscription_current_period_end: scheduledPeriodEndIso,
          share_perks_cancel_at_period_end: true,
          share_perks_cancel_requested_at: profile.share_perks_cancel_requested_at || nowIso,
          share_perks_cancel_reason: reason,
          share_perks_cancel_reason_other: reason === "Other" ? reasonOther : null,
          updated_at: nowIso,
        })
        .eq("id", authData.user.id);
      if (updateError) throw updateError;
    }

    return json({
      success: true,
      target,
      endDate: scheduledPeriodEndIso,
      cancelAtPeriodEnd: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cancel-subscription]", message);
    return json({ error: message || "Internal error" }, 500);
  }
});
