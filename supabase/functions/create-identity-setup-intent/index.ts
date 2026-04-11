import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const supabase = createClient(supabaseUrl, serviceRoleKey);

type Payload = {
  action?: "create" | "status";
  stripeMode?: "test" | "live" | null;
  attemptId?: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const corsPreflightResponse = () =>
  new Response("ok", {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });

const withCors = (_req: Request, response: Response) => {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "*");
  return response;
};

const isMissingCustomerError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no such customer/i.test(message);
};

const resolveStripeKeyPair = (
  req: Request,
  preferredMode?: "test" | "live" | null,
): { secretKey: string; publishableKey: string; mode: "test" | "live" } => {
  const origin = req.headers.get("origin") || "";
  const isLocalHttp = /^http:\/\/((localhost|127\.0\.0\.1|0\.0\.0\.0)|([a-z0-9-]+\.localhost)|([a-z0-9-]+\.local)|((10|192\.168|172\.(1[6-9]|2\d|3[0-1]))\.[0-9.]+))(:\d+)?$/i.test(origin);

  const testSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
  const testPublishable = Deno.env.get("STRIPE_TEST_PUBLISHABLE_KEY") || "";

  const liveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
  const livePublishable = Deno.env.get("STRIPE_LIVE_PUBLISHABLE_KEY") || Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "";

  if (isLocalHttp) {
    if (testSecret && testPublishable) {
      return { secretKey: testSecret, publishableKey: testPublishable, mode: "test" };
    }
    // Test keys not configured — fall through to live keys.
    // The function executes server-side over HTTPS, so live keys are safe
    // regardless of the client's HTTP (localhost) origin.
  }

  if (liveSecret && livePublishable) {
    return { secretKey: liveSecret, publishableKey: livePublishable, mode: "live" };
  }
  if (testSecret && testPublishable) {
    return { secretKey: testSecret, publishableKey: testPublishable, mode: "test" };
  }

  throw new Error("missing_stripe_keys");
};

type StripeCustomer = {
  id: string;
  deleted?: boolean;
};

type StripeSetupIntent = {
  id: string;
  client_secret?: string | null;
  status?: string | null;
  payment_method?: string | { id?: string | null } | null;
  last_setup_error?: {
    code?: string | null;
    message?: string | null;
  } | null;
};

type StripePaymentMethod = {
  type?: string | null;
  billing_details?: {
    name?: string | null;
  } | null;
  card?: {
    brand?: string | null;
    last4?: string | null;
    fingerprint?: string | null;
  } | null;
};

const BLOCKED_IDENTITY_MESSAGE =
  "We’re unable to complete verification for this account. If you think this is a mistake, contact us via Help & Support.";

const trimToNull = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

async function updateIdentityVerificationState(params: {
  userId: string;
  setupIntentId: string;
  cardStatus: "not_started" | "pending" | "passed" | "failed";
  cardVerified: boolean;
  cardVerifiedAt: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardFingerprint: string | null;
  legalName: string | null;
  verificationStatus: "unverified" | "pending" | "verified";
  verificationRejectionCode: string | null;
}) {
  const nowIso = new Date().toISOString();
  const { error: identityUpdateError } = await supabase
    .from("identity_card_verifications")
    .upsert({
      user_id: params.userId,
      stripe_setup_intent_id: params.setupIntentId,
      card_verification_status: params.cardStatus,
      card_verified: params.cardVerified,
      card_verified_at: params.cardStatus === "passed" ? params.cardVerifiedAt : null,
      card_brand: params.cardBrand,
      card_last4: params.cardLast4,
      card_fingerprint: params.cardFingerprint,
      updated_at: nowIso,
    }, { onConflict: "user_id" });
  if (identityUpdateError) throw identityUpdateError;

  const profileUpdatePayload: Record<string, unknown> = {
    stripe_setup_intent_id: params.setupIntentId,
    card_verification_status: params.cardStatus,
    card_verified: params.cardVerified,
    card_verified_at: params.cardStatus === "passed" ? params.cardVerifiedAt : null,
    card_brand: params.cardBrand,
    card_last4: params.cardLast4,
    verification_status: params.verificationStatus,
    is_verified: params.verificationStatus === "verified",
    verification_rejection_code: params.verificationRejectionCode,
  };
  if (params.legalName !== null) {
    profileUpdatePayload.legal_name = params.legalName;
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update(profileUpdatePayload)
    .eq("id", params.userId);
  if (updateError) throw updateError;
}

async function stripeRequest<T>(
  secretKey: string,
  path: string,
  init?: { method?: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("stripe_timeout"), 8000);
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(init?.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init?.body?.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : `stripe_http_${response.status}`;
    throw new Error(errorMessage);
  }
  return payload as T;
}

async function persistStripeCustomerId(userId: string, customerId: string) {
  const { error: identityError } = await supabase
    .from("identity_card_verifications")
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (identityError) throw identityError;

  // UPDATE only — upsert would INSERT with missing NOT NULL columns if no profile row exists.
  const { error } = await supabase
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId);
  if (error) throw error;
}

async function createStripeCustomer(params: { userId: string; userEmail?: string; stripe: { secretKey: string } }) {
  const body = new URLSearchParams();
  if (params.userEmail) body.set("email", params.userEmail);
  body.set("metadata[user_id]", params.userId);
  const customer = await stripeRequest<StripeCustomer>(params.stripe.secretKey, "customers", {
    method: "POST",
    body,
  });
  await persistStripeCustomerId(params.userId, customer.id);
  return customer.id;
}

async function ensureCustomerId(params: {
  userId: string;
  userEmail?: string;
  currentCustomerId: string | null;
  stripe: { secretKey: string };
}) {
  if (!params.currentCustomerId) {
    return createStripeCustomer({ userId: params.userId, userEmail: params.userEmail, stripe: params.stripe });
  }

  try {
    const existing = await stripeRequest<StripeCustomer>(params.stripe.secretKey, `customers/${encodeURIComponent(params.currentCustomerId)}`);
    if (existing.deleted) {
      return createStripeCustomer({ userId: params.userId, userEmail: params.userEmail, stripe: params.stripe });
    }
    return params.currentCustomerId;
  } catch (error) {
    if (!isMissingCustomerError(error)) throw error;
    return createStripeCustomer({ userId: params.userId, userEmail: params.userEmail, stripe: params.stripe });
  }
}

async function reconcileCardStatusFromStripe(params: {
  userId: string;
  setupIntentId: string;
  stripe: { secretKey: string };
}) {
  const setupIntent = await stripeRequest<StripeSetupIntent>(
    params.stripe.secretKey,
    `setup_intents/${encodeURIComponent(params.setupIntentId)}`,
  );

  const stripeStatus = String(setupIntent.status || "").toLowerCase();
  let cardStatus: "not_started" | "pending" | "passed" | "failed" = "not_started";
  let cardVerified = false;
  let cardVerifiedAt: string | null = null;
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardFingerprint: string | null = null;
  let legalName: string | null = null;
  let verificationRejectionCode: string | null = null;
  let blockedIdentity = false;

  if (stripeStatus === "succeeded") {
    cardStatus = "passed";
    cardVerified = true;
    cardVerifiedAt = new Date().toISOString();
  } else if (
    stripeStatus === "processing"
    || stripeStatus === "requires_confirmation"
    || stripeStatus === "requires_action"
  ) {
    cardStatus = "pending";
  } else if (
    stripeStatus === "requires_payment_method"
    || stripeStatus === "canceled"
  ) {
    cardStatus = "failed";
  }

  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id || null;

  if (paymentMethodId) {
    try {
      const paymentMethod = await stripeRequest<StripePaymentMethod>(
        params.stripe.secretKey,
        `payment_methods/${encodeURIComponent(paymentMethodId)}`,
      );
      legalName = trimToNull(paymentMethod?.billing_details?.name);
      if (paymentMethod?.type === "card" && paymentMethod.card) {
        cardBrand = paymentMethod.card.brand || null;
        cardLast4 = paymentMethod.card.last4 || null;
        cardFingerprint = trimToNull(paymentMethod.card.fingerprint);
      }
    } catch {
      // best-effort enrichment only
    }
  }

  let verificationStatus: "unverified" | "pending" | "verified" = "unverified";
  if (cardStatus === "passed" && legalName && cardLast4 && cardFingerprint) {
    const { data: blockedData, error: blockedError } = await supabase.rpc("check_blocked_identity_verification", {
      p_legal_name: legalName,
      p_card_last4: cardLast4,
      p_card_fingerprint: cardFingerprint,
    });
    if (blockedError) throw blockedError;
    blockedIdentity = Boolean((blockedData as { blocked?: boolean } | null)?.blocked);
    if (blockedIdentity) {
      cardStatus = "failed";
      cardVerified = false;
      cardVerifiedAt = null;
      verificationStatus = "unverified";
      verificationRejectionCode = "blocked_identity";
    }
  }

  if (!blockedIdentity) {
    await updateIdentityVerificationState({
      userId: params.userId,
      setupIntentId: setupIntent.id,
      cardStatus,
      cardVerified,
      cardVerifiedAt,
      cardBrand,
      cardLast4,
      cardFingerprint,
      legalName,
      verificationStatus: "pending",
      verificationRejectionCode: null,
    });

    const { data: statusData, error: statusError } = await supabase
      .rpc("refresh_identity_verification_status", { p_user_id: params.userId });
    if (statusError && !String(statusError.message || "").includes("profile_not_found")) throw statusError;
    verificationStatus = String(statusData || "unverified") as "unverified" | "pending" | "verified";
  } else {
    await updateIdentityVerificationState({
      userId: params.userId,
      setupIntentId: setupIntent.id,
      cardStatus,
      cardVerified,
      cardVerifiedAt,
      cardBrand,
      cardLast4,
      cardFingerprint,
      legalName,
      verificationStatus,
      verificationRejectionCode,
    });
  }

  return {
    cardStatus,
    cardVerified,
    cardVerifiedAt,
    cardBrand,
    cardLast4,
    cardFingerprint,
    legalName,
    setupIntentId: setupIntent.id,
    verificationStatus,
    verificationRejectionCode,
    blockedIdentity: blockedIdentity ? {
      blocked: true,
      message: BLOCKED_IDENTITY_MESSAGE,
    } : {
      blocked: false,
      message: null,
    },
    stripeStatus,
    lastSetupError: setupIntent.last_setup_error ?? null,
  };
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return corsPreflightResponse();
    }
    if (req.method !== "POST") {
      return withCors(req, json({ error: "method_not_allowed" }, 405));
    }

    // Prefer x-huddle-access-token (user JWT sent by invokeAuthedFunction).
    // Authorization header carries the gateway anon key, not the user token.
    const huddleToken = req.headers.get("x-huddle-access-token") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = huddleToken || authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return withCors(req, json({ error: "missing_token" }, 401));

    const authUser = await supabase.auth.getUser(accessToken);
    const userId = authUser.data?.user?.id;
    const userEmail = authUser.data?.user?.email || undefined;
    if (!userId) return withCors(req, json({ error: "unauthorized" }, 401));

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const preferredStripeMode =
      payload.stripeMode === "live" || payload.stripeMode === "test" ? payload.stripeMode : null;
    const { secretKey: stripeSecretKey, publishableKey: stripePublishableKey, mode: stripeMode } = resolveStripeKeyPair(
      req,
      preferredStripeMode,
    );
    const stripe = { secretKey: stripeSecretKey };
    const action = payload.action || "create";

    if (action === "status") {
      const [{ data: profile, error: profileError }, { data: identityRow, error: identityError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,card_verification_status,card_verified,card_verified_at,card_brand,card_last4,stripe_setup_intent_id,verification_status,legal_name,verification_rejection_code")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("identity_card_verifications")
          .select("stripe_customer_id,stripe_setup_intent_id,card_verification_status,card_verified,card_verified_at,card_brand,card_last4,card_fingerprint")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (profileError) throw profileError;
      if (identityError) throw identityError;

      let resolvedCardStatus: "not_started" | "pending" | "passed" | "failed" =
        (profile?.card_verification_status ?? identityRow?.card_verification_status ?? "not_started") as "not_started" | "pending" | "passed" | "failed";
      let resolvedCardVerified = Boolean(profile?.card_verified ?? identityRow?.card_verified);
      let resolvedCardBrand = profile?.card_brand ?? identityRow?.card_brand ?? null;
      let resolvedCardLast4 = profile?.card_last4 ?? identityRow?.card_last4 ?? null;
      let resolvedLegalName = profile?.legal_name ?? null;
      let resolvedCardFingerprintPresent = Boolean(identityRow?.card_fingerprint);
      let resolvedCardVerifiedAt = profile?.card_verified_at ?? identityRow?.card_verified_at ?? null;
      let resolvedVerificationStatus = profile?.verification_status ?? ((resolvedCardStatus === "pending" || resolvedCardStatus === "passed") ? "pending" : "unverified");
      let resolvedVerificationRejectionCode = trimToNull(profile?.verification_rejection_code) ?? null;
      let resolvedSetupIntentId = profile?.stripe_setup_intent_id ?? identityRow?.stripe_setup_intent_id ?? null;
      let resolvedLastSetupError: { message?: string | null; code?: string | null } | null = null;
      let resolvedBlockedIdentity = resolvedVerificationRejectionCode === "blocked_identity"
        ? { blocked: true, message: BLOCKED_IDENTITY_MESSAGE }
        : { blocked: false, message: null };

      if (resolvedSetupIntentId && (resolvedCardStatus === "pending" || resolvedCardStatus === "failed" || !resolvedCardVerified)) {
        try {
          const reconciled = await reconcileCardStatusFromStripe({
            userId,
            setupIntentId: resolvedSetupIntentId,
            stripe,
          });
          resolvedCardStatus = reconciled.cardStatus;
          resolvedCardVerified = reconciled.cardVerified;
          resolvedCardBrand = reconciled.cardBrand;
          resolvedCardLast4 = reconciled.cardLast4;
          resolvedLegalName = reconciled.legalName;
          resolvedCardFingerprintPresent = Boolean(reconciled.cardFingerprint);
          resolvedCardVerifiedAt = reconciled.cardVerifiedAt;
          resolvedVerificationStatus = reconciled.verificationStatus;
          resolvedVerificationRejectionCode = reconciled.verificationRejectionCode;
          resolvedSetupIntentId = reconciled.setupIntentId;
          resolvedBlockedIdentity = reconciled.blockedIdentity;
          resolvedLastSetupError = reconciled.lastSetupError ? {
            message: reconciled.lastSetupError.message ?? null,
            code: reconciled.lastSetupError.code ?? null,
          } : null;
        } catch (error) {
          console.warn("[create-identity-setup-intent.status] stripe reconcile skipped", error instanceof Error ? error.message : String(error));
        }
      }

      return withCors(req, json({
        ok: true,
        cardStatus: resolvedCardStatus,
        cardVerified: resolvedCardVerified,
        cardVerifiedAt: resolvedCardVerifiedAt,
        cardBrand: resolvedCardBrand,
        cardLast4: resolvedCardLast4,
        legalName: resolvedLegalName,
        cardFingerprintPresent: resolvedCardFingerprintPresent,
        setupIntentId: resolvedSetupIntentId,
        verificationStatus: resolvedVerificationStatus,
        verificationRejectionCode: resolvedVerificationRejectionCode,
        blockedIdentity: resolvedBlockedIdentity,
        lastSetupError: resolvedLastSetupError,
        publishableKey: stripePublishableKey,
        stripeMode,
      }));
    }

    const [{ data: profile, error: profileError }, { data: identityRow, error: identityError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,stripe_customer_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("identity_card_verifications")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (identityError) throw identityError;

    let customerId = await ensureCustomerId({
      userId,
      userEmail,
      currentCustomerId: profile?.stripe_customer_id || identityRow?.stripe_customer_id || null,
      stripe,
    });

    let setupIntent;
    const attemptId =
      typeof payload.attemptId === "string" && payload.attemptId.trim().length > 0
        ? payload.attemptId.trim()
        : crypto.randomUUID();
    const setupIntentIdempotencyKey = `identity_setup_intent:${userId}:${attemptId}:${preferredStripeMode || "auto"}`;
    try {
      const body = new URLSearchParams();
      body.set("customer", customerId);
      body.set("payment_method_types[0]", "card");
      body.set("usage", "off_session");
      body.set("metadata[user_id]", userId);
      body.set("metadata[purpose]", "identity_card_verification");
      setupIntent = await stripeRequest<StripeSetupIntent>(stripe.secretKey, "setup_intents", {
        method: "POST",
        body,
        idempotencyKey: setupIntentIdempotencyKey,
      });
    } catch (error) {
      if (!isMissingCustomerError(error)) throw error;
      customerId = await createStripeCustomer({ userId, userEmail, stripe });
      const body = new URLSearchParams();
      body.set("customer", customerId);
      body.set("payment_method_types[0]", "card");
      body.set("usage", "off_session");
      body.set("metadata[user_id]", userId);
      body.set("metadata[purpose]", "identity_card_verification");
      setupIntent = await stripeRequest<StripeSetupIntent>(stripe.secretKey, "setup_intents", {
        method: "POST",
        body,
        idempotencyKey: setupIntentIdempotencyKey,
      });
    }

    const nowIso = new Date().toISOString();
    const { error: identityUpsertError } = await supabase
      .from("identity_card_verifications")
      .upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_setup_intent_id: setupIntent.id,
        updated_at: nowIso,
      }, { onConflict: "user_id" });
    if (identityUpsertError) throw identityUpsertError;

    // UPDATE only — upsert would INSERT with missing NOT NULL columns if no profile row exists.
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        stripe_setup_intent_id: setupIntent.id,
      })
      .eq("id", userId);
    if (profileUpdateError) throw profileUpdateError;

    const { data: statusData, error: statusError } = await supabase
      .rpc("refresh_identity_verification_status", { p_user_id: userId });
    // Gracefully handle profile_not_found — card data is in identity_card_verifications.
    if (statusError && !String(statusError.message || "").includes("profile_not_found")) throw statusError;
    const verificationStatus = String(statusData || "unverified");

    return withCors(req, json({
      ok: true,
      publishableKey: stripePublishableKey,
      stripeMode,
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret,
      attemptId,
      verificationStatus,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-identity-setup-intent]", message);
    return withCors(req, json({ error: message || "unknown_error" }, 500));
  }
});
