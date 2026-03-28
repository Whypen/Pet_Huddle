import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cleanEnv = (value: string | undefined | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (
    (raw.startsWith("\"") && raw.endsWith("\"")) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
};

const stripeDefaultSecret = cleanEnv(Deno.env.get("STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_API_KEY"));
const stripeTestSecret = cleanEnv(Deno.env.get("STRIPE_TEST_SECRET_KEY"));
const stripeLiveSecret = cleanEnv(Deno.env.get("STRIPE_LIVE_SECRET_KEY"));
const stripeModeHint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();
const configuredPublicAppUrl = cleanEnv(
  Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("SITE_URL") || Deno.env.get("APP_URL") || "https://huddle.pet",
);

const isLocalHostUrl = (value: string | undefined | null): boolean => {
  if (!value) return false;
  return value.includes("://localhost") || value.includes("://127.0.0.1");
};

const pickStripeSecret = (mode: "test" | "live"): string => {
  const defaultIsTest = stripeDefaultSecret.startsWith("sk_test_");
  const defaultIsLive = stripeDefaultSecret.startsWith("sk_live_");
  if (mode === "test") {
    if (stripeTestSecret) return stripeTestSecret;
    if (defaultIsTest) return stripeDefaultSecret;
    return "";
  }
  if (stripeLiveSecret) return stripeLiveSecret;
  if (defaultIsLive) return stripeDefaultSecret;
  return "";
};

const isHttpsUrl = (value: string | undefined | null): boolean =>
  String(value || "").trim().startsWith("https://");

const normalizeBaseUrl = (value: string): string => {
  const next = String(value || "").trim();
  if (!next) return "https://huddle.pet";
  if (!next.startsWith("https://")) return "https://huddle.pet";
  return next.replace(/\/+$/, "");
};

const buildFallbackConnectUrl = (path: "/carerprofile/stripe-return" | "/carerprofile/stripe-refresh"): string =>
  `${normalizeBaseUrl(configuredPublicAppUrl)}${path}`;

const resolveMode = (origin: string | null, returnUrl?: string, refreshUrl?: string): "test" | "live" => {
  const insecureReturn = Boolean(returnUrl && !String(returnUrl).startsWith("https://"));
  const insecureRefresh = Boolean(refreshUrl && !String(refreshUrl).startsWith("https://"));
  if (insecureReturn || insecureRefresh) return "test";
  if (stripeModeHint === "test") return "test";
  if (stripeModeHint === "live") return "live";
  if (isLocalHostUrl(origin) || isLocalHostUrl(returnUrl) || isLocalHostUrl(refreshUrl)) return "test";
  return "live";
};

const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const toSafeString = (value: unknown): string => String(value ?? "").trim();

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  "hong kong": "HK",
  "hong kong sar": "HK",
  "hong kong sar china": "HK",
  "china": "CN",
  "united states": "US",
  "united states of america": "US",
  "united kingdom": "GB",
  "great britain": "GB",
  "singapore": "SG",
  "japan": "JP",
  "taiwan": "TW",
  "macau": "MO",
  "macao": "MO",
  "australia": "AU",
  "new zealand": "NZ",
  "canada": "CA",
};

const normalizeCountryIso2 = (country: string): string | null => {
  const normalized = toSafeString(country);
  if (!normalized) return null;
  if (/^[A-Za-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return COUNTRY_NAME_TO_ISO2[normalized.toLowerCase()] || null;
};

const normalizeCurrency = (currency: string): string | null => {
  const normalized = toSafeString(currency).toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : null;
};

const splitLegalName = (fullName: string): { firstName: string | null; lastName: string | null } => {
  const normalized = toSafeString(fullName).replace(/\s+/g, " ");
  if (!normalized) return { firstName: null, lastName: null };
  const parts = normalized.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const slugify = (value: string): string =>
  toSafeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const resolvePayoutStatus = (
  detailsSubmitted: boolean,
  payoutsEnabled: boolean,
  currentlyDue: string[],
): "pending" | "needs_action" | "complete" => {
  if (detailsSubmitted && payoutsEnabled && currentlyDue.length === 0) return "complete";
  if (currentlyDue.length > 0 || !payoutsEnabled) return "needs_action";
  return "pending";
};

const syncStripeStatus = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  accountId: string,
  account: Stripe.Account,
) => {
  const currentlyDue = Array.isArray(account.requirements?.currently_due)
    ? account.requirements?.currently_due?.filter(Boolean)
    : [];
  const detailsSubmitted = account.details_submitted === true;
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const payoutStatus = resolvePayoutStatus(detailsSubmitted, payoutsEnabled, currentlyDue);

  const { error } = await supabase
    .from("pet_care_profiles")
    .upsert(
      {
        user_id: userId,
        stripe_account_id: accountId,
        stripe_details_submitted: detailsSubmitted,
        stripe_charges_enabled: chargesEnabled,
        stripe_payouts_enabled: payoutsEnabled,
        stripe_requirements_currently_due: currentlyDue,
        stripe_payout_status: payoutStatus,
      },
      { onConflict: "user_id" },
    );
  if (error) throw error;

  return payoutStatus;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const huddleTokenHeader = req.headers.get("x-huddle-access-token") ?? "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const huddleToken = huddleTokenHeader.replace(/^Bearer\s+/i, "").trim();
    const accessToken = [bearerToken, huddleToken].find((token) => token.split(".").length === 3) || "";
    if (!accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      accessToken
    );
    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profileRow) {
      return Response.json(
        { error: "Profile is not completed yet. Finish Set Profile first.", code: "profile_missing" },
        { status: 409, headers: corsHeaders },
      );
    }

    const { action, returnUrl, refreshUrl } = await req.json() as {
      action: "create_link" | "check_status";
      returnUrl?: string;
      refreshUrl?: string;
    };
    const requestOrigin = req.headers.get("origin");
    const runningLocal =
      isLocalHostUrl(requestOrigin) ||
      isLocalHostUrl(returnUrl) ||
      isLocalHostUrl(refreshUrl);
    let mode: "test" | "live" = resolveMode(requestOrigin, returnUrl, refreshUrl);
    let stripeSecret = pickStripeSecret(mode);
    if (!stripeSecret && mode === "test") {
      const liveFallback = pickStripeSecret("live");
      if (liveFallback) {
        mode = "live";
        stripeSecret = liveFallback;
      }
    }
    if (!stripeSecret) {
      return Response.json(
        {
          error: mode === "test"
            ? "Stripe test secret key missing on server"
            : "Stripe live secret key missing on server",
          code: "missing_stripe_secret",
          mode,
        },
        { status: 500, headers: corsHeaders },
      );
    }
    const stripe = createStripeClient(stripeSecret);

    const { data: profile } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id,currency")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: huddleProfile } = await supabase
      .from("profiles")
      .select("social_id,display_name,phone,location_country,legal_name,currency")
      .eq("id", user.id)
      .maybeSingle();

    const userEmail = toSafeString(user.email || "");
    const socialId = toSafeString((huddleProfile as { social_id?: string | null } | null)?.social_id || "");
    const displayName = toSafeString((huddleProfile as { display_name?: string | null } | null)?.display_name || "");
    const legalName = toSafeString((huddleProfile as { legal_name?: string | null } | null)?.legal_name || displayName);
    const phone = toSafeString((huddleProfile as { phone?: string | null } | null)?.phone || "");
    const countryIso2 = normalizeCountryIso2(
      toSafeString((huddleProfile as { location_country?: string | null } | null)?.location_country || ""),
    );
    const marketCurrency =
      normalizeCurrency(
        toSafeString(
          (profile as { currency?: string | null } | null)?.currency
            || (huddleProfile as { currency?: string | null } | null)?.currency
            || "",
        ),
      ) || (countryIso2 === "HK" ? "hkd" : null);
    const usernameSlug = slugify(socialId || displayName || user.id);
    const { firstName, lastName } = splitLegalName(legalName);

    // Keep creation payload minimal to avoid Stripe country/account capability
    // mismatches that can hard-fail onboarding link creation.
    const accountPayloadBase: Stripe.AccountCreateParams = {
      type: "express",
      email: userEmail || undefined,
      country: countryIso2 || undefined,
      metadata: {
        huddle_user_id: socialId || user.id,
        huddle_username: socialId || displayName || user.id,
      },
    };

    if (action === "create_link") {
      if (!returnUrl || !refreshUrl) {
        return Response.json({ error: "returnUrl and refreshUrl required" }, { status: 400, headers: corsHeaders });
      }
      const safeReturnUrl = mode === "live" && !isHttpsUrl(returnUrl)
        ? buildFallbackConnectUrl("/carerprofile/stripe-return")
        : returnUrl;
      const safeRefreshUrl = mode === "live" && !isHttpsUrl(refreshUrl)
        ? buildFallbackConnectUrl("/carerprofile/stripe-refresh")
        : refreshUrl;
      const linkKeySuffix = Math.floor(Date.now() / 60000);

      let accountId = (profile as { stripe_account_id?: string } | null)?.stripe_account_id;

      const createFreshAccountLink = async () => {
        // Idempotency key prevents duplicate Connect accounts if the client
        // retries on network failure before the account ID is written to DB.
        const account = await stripe.accounts.create(
          accountPayloadBase,
          { idempotencyKey: `huddle_connect_${user.id}` },
        );
        accountId = account.id;
        await syncStripeStatus(supabase, user.id, accountId, account);
        return await stripe.accountLinks.create({
          account: accountId,
          refresh_url: safeRefreshUrl,
          return_url: safeReturnUrl,
          type: "account_onboarding",
          collection_options: { fields: "currently_due" },
        }, {
          idempotencyKey: `huddle_connect_link_${user.id}_${accountId}_${linkKeySuffix}`,
        });
      };

      try {
        const link = accountId
          ? await (async () => {
              const refreshedAccount = await stripe.accounts.retrieve(accountId as string);
              await syncStripeStatus(supabase, user.id, accountId as string, refreshedAccount);
              return await stripe.accountLinks.create({
                account: accountId as string,
                refresh_url: safeRefreshUrl,
                return_url: safeReturnUrl,
                type: "account_onboarding",
                collection_options: { fields: "currently_due" },
              }, {
                idempotencyKey: `huddle_connect_link_${user.id}_${accountId}_${linkKeySuffix}`,
              });
            })()
          : await createFreshAccountLink();
        return Response.json({ url: link.url, mode }, { headers: corsHeaders });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("no such account")) {
          const link = await createFreshAccountLink();
          return Response.json({ url: link.url, mode }, { headers: corsHeaders });
        }
        throw error;
      }
    }

    if (action === "check_status") {
      const accountId = (profile as { stripe_account_id?: string } | null)?.stripe_account_id;
      if (!accountId) {
        return Response.json({ status: "pending" }, { headers: corsHeaders });
      }
      try {
        const account = await stripe.accounts.retrieve(accountId);
        const payoutStatus = await syncStripeStatus(supabase, user.id, accountId, account);
        return Response.json({ status: payoutStatus, mode }, { headers: corsHeaders });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("no such account")) {
          return Response.json({ status: "pending", code: "stripe_account_mismatch", mode }, { headers: corsHeaders });
        }
        throw error;
      }
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("[create-stripe-connect-link]", err);
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    const lowered = message.toLowerCase();
    if (lowered.includes("connect") && lowered.includes("enabled")) {
      return Response.json(
        {
          error: "Stripe Connect is not enabled for this Stripe account.",
          code: "stripe_connect_not_enabled",
          detail: message,
          type: name,
        },
        { status: 500, headers: corsHeaders },
      );
    }
    if (lowered.includes("account") && lowered.includes("invalid")) {
      return Response.json(
        {
          error: "Stripe account state is invalid. Please retry payout setup.",
          code: "stripe_account_invalid",
          detail: message,
          type: name,
        },
        { status: 500, headers: corsHeaders },
      );
    }
    if (lowered.includes("invalid api key")) {
      return Response.json({ error: "Stripe API key is invalid or missing on server", code: "stripe_invalid_api_key" }, { status: 500, headers: corsHeaders });
    }
    if (lowered.includes("no such account")) {
      return Response.json({ error: "Stripe account not found. Please retry payout setup.", code: "stripe_account_not_found" }, { status: 500, headers: corsHeaders });
    }
    return Response.json(
      { error: "Internal error", code: "connect_link_internal_error", detail: message, type: name },
      { status: 500, headers: corsHeaders },
    );
  }
});
