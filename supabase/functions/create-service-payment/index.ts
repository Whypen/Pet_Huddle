import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeModeHint = String(Deno.env.get("STRIPE_MODE") || "").toLowerCase();

const resolveMode = (origin: string | null, successUrl?: string, cancelUrl?: string): "test" | "live" => {
  if (stripeModeHint === "test") return "test";
  if (stripeModeHint === "live") return "live";
  const host = `${origin || ""} ${successUrl || ""} ${cancelUrl || ""}`.toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1")) return "test";
  return "live";
};

const pickStripeSecret = (mode: "test" | "live"): string =>
  mode === "test"
    ? stripeTestSecret || stripeDefaultSecret
    : stripeLiveSecret || stripeDefaultSecret;

const STRIPE_MINIMUM_CHARGE_CENTS: Record<string, number> = {
  aud: 50,
  cad: 50,
  eur: 50,
  gbp: 30,
  hkd: 400,
  jpy: 50,
  sgd: 50,
  usd: 50,
};
const CARE_PAYMENT_RETRY_LOCK_MS = 5 * 60 * 1000;
const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
const CARE_CANCELLATION_TERMS = "More than 72 hours before care starts -- full refund. 24 to 72 hours before -- 50% refund; huddle retains the remaining 50%. Less than 24 hours before -- the booking is final and non-refundable.";
const CARE_NO_START_POLICY = {
  version: "13 July 2026",
  minimumBookingMinutes: 60,
  scheduledEndCancellation: true,
  settlement: "no_start_responsibility_matrix_v2",
} as const;
const toStripeMinorUnitAmount = (amount: number, currency: string) =>
  STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(amount)
    : Math.round(amount * 100);

const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const firstSecretKey = (value: string | null | undefined) => {
  const raw = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const fromArray = parsed.map((item) => String(item || "").trim()).find(Boolean);
      if (fromArray) return fromArray;
    }
    if (parsed && typeof parsed === "object") {
      const fromObject = Object.values(parsed).map((item) => String(item || "").trim()).find(Boolean);
      if (fromObject) return fromObject;
    }
  } catch {
    // Fall through to delimited secret parsing.
  }
  return raw.split(/[\s,]+/).map((item) => item.trim().replace(/^['"]+|['"]+$/g, "")).find(Boolean) || "";
};
const supabaseServiceKey =
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const appEnv = String(Deno.env.get("APP_ENV") || Deno.env.get("HUDDLE_ENV") || Deno.env.get("ENVIRONMENT") || Deno.env.get("VERCEL_ENV") || "").toLowerCase();
const isNonProductionRuntime = appEnv === "staging" || appEnv === "preview" || appEnv === "development" || appEnv === "test" || appEnv === "local" || appEnv === "dev";

type ServicePaymentStage =
  | "service_chat_load_failed"
  | "quote_invalid"
  | "no_start_policy_acknowledgement_required"
  | "snapshot_pending_write_failed"
  | "stripe_customer_create_failed"
  | "stripe_checkout_create_failed"
  | "service_chat_update_failed";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const clean = (value: unknown): string => String(value || "").trim();
const stageJson = (stage: ServicePaymentStage, message: string, status = 500, exposeStage = isNonProductionRuntime, details?: Record<string, unknown>) =>
  json(exposeStage ? { error: message, stage, ...(details || {}) } : { error: message }, status);

const stripeErrorFields = (error: unknown) => {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    type: clean(value.type),
    code: clean(value.code),
    statusCode: typeof value.statusCode === "number" ? value.statusCode : null,
    message: clean(value.message),
  };
};

const logStageError = (stage: ServicePaymentStage, error: unknown) => {
  const fields = stripeErrorFields(error);
  console.error("[create-service-payment] failed:", {
    stage,
    type: fields.type || undefined,
    code: fields.code || undefined,
    statusCode: fields.statusCode || undefined,
    message: fields.message || (error instanceof Error ? error.message : String(error)),
  });
};

const requireSnapshotString = (snapshot: Record<string, unknown>, key: string, label: string): string => {
  const value = clean(snapshot[key]);
  if (!value) throw new Error(`${label} is required`);
  return value;
};
const parseRequestDates = (requestCard: Record<string, unknown>) => {
  const requestedDates = Array.isArray(requestCard.requestedDates)
    ? requestCard.requestedDates.map(clean).filter(Boolean).sort()
    : [];
  const fallbackDate = clean(requestCard.requestedDate);
  return {
    firstDate: requestedDates[0] || fallbackDate,
    lastDate: requestedDates[requestedDates.length - 1] || fallbackDate,
  };
};
const tzOffsetSuffix = (requestCard: Record<string, unknown>) => {
  const raw = clean(requestCard.tzOffset) || clean(requestCard.timezoneOffset) || clean(requestCard.tzOffsetMinutes);
  if (/^[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^[+-]?\d+$/.test(raw)) {
    const value = Number(raw);
    const totalMinutes = Math.abs(value) <= 14 ? Math.abs(value) * 60 : Math.abs(value);
    const sign = Math.abs(value) <= 14
      ? (value < 0 ? "-" : "+")
      : (value <= 0 ? "+" : "-");
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${sign}${hours}:${minutes}`;
  }
  return "Z";
};
const buildServiceDateTime = (date: string, time: string, requestCard: Record<string, unknown>) => {
  if (!date || !time) return "";
  const parsed = new Date(`${date}T${time}:00${tzOffsetSuffix(requestCard)}`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};
const buildServiceWindow = (requestCard: Record<string, unknown>, startDate: string, startTime: string, endDate: string, endTime: string) => {
  const explicitStartAt = clean(requestCard.startAtIso) || clean(requestCard.startAt);
  const explicitEndAt = clean(requestCard.endAtIso) || clean(requestCard.endAt);
  const startAt = explicitStartAt || buildServiceDateTime(startDate, startTime, requestCard);
  const rawEndAt = explicitEndAt || buildServiceDateTime(endDate, endTime, requestCard);
  if (!startAt || !rawEndAt) return { startAt, endAt: rawEndAt, error: "" };
  const startMs = new Date(startAt).getTime();
  const endMs = new Date(rawEndAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return { startAt, endAt: rawEndAt, error: "booking_time_invalid" };
  if (endMs <= startMs) return { startAt, endAt: rawEndAt, error: "booking_time_invalid" };
  return { startAt, endAt: rawEndAt, error: "" };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(accessToken);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const serviceChatId = String(payload.service_chat_id || "").trim();
    const successUrl = String(payload.success_url || "").trim();
    const cancelUrl = String(payload.cancel_url || "").trim();
    const incomingSnapshot = typeof payload.booking_snapshot === "object" && payload.booking_snapshot !== null
      ? (payload.booking_snapshot as Record<string, unknown>)
      : null;
    const exposeStage = isNonProductionRuntime || `${successUrl} ${cancelUrl}`.toLowerCase().includes("localhost");

    if (!serviceChatId || !successUrl || !cancelUrl) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!incomingSnapshot) {
      return json({ error: "Booking confirmation is required" }, 400);
    }

    const serviceChatResult = await supabase
      .from("service_chats")
      .select("id, chat_id, requester_id, provider_id, status, request_card, quote_card")
      .eq("id", serviceChatId)
      .maybeSingle();
    const { data: serviceChat, error: serviceChatErr } = serviceChatResult;
    if (serviceChatErr) {
      logStageError("service_chat_load_failed", serviceChatErr);
      return stageJson("service_chat_load_failed", "Service lookup failed", 500, exposeStage);
    }
    if (!serviceChat) return json({ error: "Service chat not found" }, 404);
    if (serviceChat.requester_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (serviceChat.status !== "pending") return json({ error: "Service is no longer pending" }, 409);
    if (serviceChat.provider_id === user.id) {
      return json({ error: "You can't book your own care service.", code: "owner_cannot_book_own_service" }, 409);
    }

    // Amount and currency are authoritative from the server-side quote_card, not the client.
    // This prevents a requester from manipulating the charge amount or currency.
    const quoteCard = (serviceChat.quote_card || {}) as Record<string, unknown>;
    const rate = String(quoteCard.rate || "").trim();
    const finalPriceStr = String(quoteCard.finalPrice || "").trim();
    const parsedPrice = Number(finalPriceStr);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return stageJson("quote_invalid", "Quote has no valid price", 409, exposeStage);
    }
    const currency = String(quoteCard.currency || "").trim().toLowerCase();
    if (!currency) {
      return stageJson("quote_invalid", "Quote has no currency", 409, exposeStage);
    }
    const amountCents = toStripeMinorUnitAmount(parsedPrice, currency);

    const { data: providerCarer, error: providerErr } = await supabase
      .from("pet_care_profiles")
      .select("stripe_account_id, stripe_payout_status, stripe_payouts_enabled, currency")
      .eq("user_id", serviceChat.provider_id)
      .maybeSingle();
    if (providerErr) return json({ error: "Provider lookup failed" }, 500);
    if (!providerCarer?.stripe_account_id || providerCarer.stripe_payout_status !== "complete" || providerCarer.stripe_payouts_enabled !== true) {
      return json({
        error: "Provider has not completed payout setup",
        code: "provider_payout_setup_required",
        action: "refresh_stripe_account_status",
      }, 409);
    }
    if (String(providerCarer.currency || "").trim().toLowerCase() !== currency) {
      return stageJson("quote_invalid", "Quote currency does not match provider profile currency", 409, exposeStage);
    }

    const incomingRequesterId = clean(incomingSnapshot.requesterId);
    const incomingProviderId = clean(incomingSnapshot.providerId);
    if ((incomingRequesterId && incomingRequesterId !== user.id) || (incomingProviderId && incomingProviderId !== serviceChat.provider_id)) {
      return json({ error: "Booking confirmation is out of date" }, 400);
    }

    const mode = resolveMode(req.headers.get("origin"), successUrl, cancelUrl);
    const stripeSecret = pickStripeSecret(mode);
    if (!stripeSecret) return json({ error: "Stripe secret key missing on server" }, 500);
    const stripe = createStripeClient(stripeSecret);

    const createRequesterStripeCustomer = async () => {
      const authUser = await supabase.auth.admin.getUserById(user.id);
      const customer = await stripe.customers.create({
        email: authUser.data?.user?.email || undefined,
        metadata: { user_id: user.id },
      });
      const nextCustomerId = customer.id;
      const { error: customerUpdateErr } = await supabase.from("profiles").update({ stripe_customer_id: nextCustomerId }).eq("id", user.id);
      if (customerUpdateErr) {
        logStageError("service_chat_update_failed", customerUpdateErr);
        return { customerId: "", response: stageJson("service_chat_update_failed", "Customer profile could not be saved", 500, exposeStage) };
      }
      return { customerId: nextCustomerId, response: null };
    };

    let customerId: string | null = null;
    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    customerId = (requesterProfile?.stripe_customer_id as string | null) ?? null;
    try {
      if (customerId) {
        try {
          const existingCustomer = await stripe.customers.retrieve(customerId);
          if ((existingCustomer as unknown as { deleted?: boolean }).deleted === true) customerId = null;
        } catch (error) {
          const fields = stripeErrorFields(error);
          if (fields.code !== "resource_missing") throw error;
          customerId = null;
        }
      }
      if (!customerId) {
        const created = await createRequesterStripeCustomer();
        if (created.response) return created.response;
        customerId = created.customerId;
      }
    } catch (error) {
      logStageError("stripe_customer_create_failed", error);
      return stageJson("stripe_customer_create_failed", "Stripe customer could not be created", 500, exposeStage, { stripe: stripeErrorFields(error) });
    }

    // Owner pays 0% (promotional — encourages adoption). Carer's payout still nets 10%,
    // covering Stripe processing + platform costs. Change these two numbers only — the
    // frontend mirror (CARE_REQUESTER_FEE_RATE / CARE_PROVIDER_FEE_RATE in
    // NativeServiceChatScreen.tsx) must be kept identical to what's charged here.
    const REQUESTER_FEE_RATE = 0;
    const PROVIDER_FEE_RATE = 0.10;
    const quoteCents = amountCents; // authoritative from server-side quote_card
    const requesterFee = Math.round(quoteCents * REQUESTER_FEE_RATE);
    const providerFee = Math.round(quoteCents * PROVIDER_FEE_RATE);
    const customerTotal = quoteCents + requesterFee;
    const minimumChargeCents = STRIPE_MINIMUM_CHARGE_CENTS[currency] || 0;
    if (minimumChargeCents > 0 && customerTotal < minimumChargeCents) {
      return stageJson("quote_invalid", `Quote total is below Stripe minimum for ${currency.toUpperCase()}`, 409, exposeStage);
    }
    const providerPayout = quoteCents - providerFee;
    const platformGross = requesterFee + providerFee;

    const requestCard = (serviceChat.request_card || {}) as Record<string, unknown>;
    const requestDates = parseRequestDates(requestCard);
    const vetAuthorization = (incomingSnapshot.emergencyVetAuthorization || {}) as Record<string, unknown>;
    const vetAuthChoiceProvided = typeof vetAuthorization.authorized === "boolean";
    const vetAuthorized = vetAuthChoiceProvided ? vetAuthorization.authorized === true : false;
    const vetCapMinor = Number(vetAuthorization.capMinor || 0);
    const vetAuthCurrency = clean(vetAuthorization.currency) || currency;
    if (!vetAuthChoiceProvided) {
      return json({ error: "Emergency vet authorization choice is required" }, 400);
    }
    if (vetAuthorized && (!Number.isFinite(vetCapMinor) || vetCapMinor <= 0)) {
      return json({ error: "Add an emergency vet care limit to continue." }, 400);
    }
    const { data: careAgreement, error: agreementErr } = await supabase
      .from("service_care_agreements")
      .select("requester_signature, requester_signature_path, requester_signed_at, scope_version_id, scope_hash")
      .eq("service_chat_id", serviceChat.id)
      .maybeSingle();
    if (agreementErr) {
      logStageError("service_chat_load_failed", agreementErr);
      return stageJson("service_chat_load_failed", "Care Agreement lookup failed", 500, exposeStage);
    }
    const agreementRequesterSignature = careAgreement?.requester_signature && typeof careAgreement.requester_signature === "object"
      ? careAgreement.requester_signature as Record<string, unknown>
      : null;
    let scopeOwnerSignature: Record<string, unknown> | null = null;
    let scopeOwnerSignaturePath = "";
    let scopeOwnerSignedAt = "";
    if (!incomingSnapshot.requesterSignature && !agreementRequesterSignature) {
      const { data: activeScopeSignature, error: activeScopeSignatureErr } = await supabase
        .from("care_scope_versions")
        .select("scope_hash, care_scope_signatures!inner(signature,image_bucket,image_path,signed_at,role)")
        .eq("service_chat_id", serviceChat.id)
        .eq("is_active", true)
        .eq("care_scope_signatures.role", "owner")
        .limit(1)
        .maybeSingle();
      if (activeScopeSignatureErr) {
        logStageError("service_chat_load_failed", activeScopeSignatureErr);
        return stageJson("service_chat_load_failed", "Care Agreement lookup failed", 500, exposeStage);
      }
      const signatureRows = Array.isArray(activeScopeSignature?.care_scope_signatures)
        ? activeScopeSignature.care_scope_signatures
        : activeScopeSignature?.care_scope_signatures
          ? [activeScopeSignature.care_scope_signatures]
          : [];
      const ownerSignatureRow = signatureRows.find((row) => row && typeof row === "object") as Record<string, unknown> | undefined;
      scopeOwnerSignature = ownerSignatureRow?.signature && typeof ownerSignatureRow.signature === "object"
        ? ownerSignatureRow.signature as Record<string, unknown>
        : null;
      scopeOwnerSignaturePath = clean(ownerSignatureRow?.image_path);
      scopeOwnerSignedAt = clean(ownerSignatureRow?.signed_at);
    }
    const requesterSignature = incomingSnapshot.requesterSignature && typeof incomingSnapshot.requesterSignature === "object"
      ? incomingSnapshot.requesterSignature as Record<string, unknown>
      : agreementRequesterSignature
        ? {
          ...agreementRequesterSignature,
          imageBucket: "care_agreements",
          imagePath: clean(careAgreement?.requester_signature_path),
          path: clean(careAgreement?.requester_signature_path) || clean(agreementRequesterSignature.path),
          signedAt: clean(careAgreement?.requester_signed_at) || clean(agreementRequesterSignature.signedAt),
        }
        : scopeOwnerSignature
          ? {
            ...scopeOwnerSignature,
            imageBucket: "care_agreements",
            imagePath: scopeOwnerSignaturePath,
            path: scopeOwnerSignaturePath || clean(scopeOwnerSignature.path),
            signedAt: scopeOwnerSignedAt || clean(scopeOwnerSignature.signedAt),
          }
        : null;
    // Preferred vet contact is optional — the carer decides if it is left blank.
    const serviceWindow = buildServiceWindow(
      requestCard,
      requestDates.firstDate,
      clean(requestCard.startTime),
      requestDates.lastDate,
      clean(requestCard.endTime),
    );
    // requireSnapshotString THROWS on a missing field (by design, to fail loudly) — but a raw
    // throw here skips every other graceful 400/409 response in this function and falls into
    // the catch-all at the bottom, which returns a generic 500 "internal_error". That mis-reports
    // an ordinary missing-field client issue (e.g. Care Instructions not filled in yet) as a
    // server crash, with the real reason invisible to both the user and the logs. Scope the
    // catch to just this construction so the actual field name reaches the client as a normal 400.
    let snapshot: Record<string, unknown>;
    try {
      snapshot = {
        serviceType: clean(quoteCard.serviceType) || clean(requestCard.serviceType) || requireSnapshotString(incomingSnapshot, "serviceType", "Service type"),
        petId: clean(quoteCard.petId) || clean(requestCard.petId) || clean(incomingSnapshot.petId),
        petName: clean(quoteCard.petName) || clean(requestCard.petName) || requireSnapshotString(incomingSnapshot, "petName", "Pet name"),
        petSpecies: clean(quoteCard.petSpecies) || clean(requestCard.petSpecies) || clean(quoteCard.petType) || clean(requestCard.petType) || clean(incomingSnapshot.petSpecies) || clean(incomingSnapshot.petType),
        petBreed: clean(quoteCard.petBreed) || clean(requestCard.petBreed) || clean(incomingSnapshot.petBreed),
        startAt: serviceWindow.startAt,
        endAt: serviceWindow.endAt,
        handoffMethod: requireSnapshotString(incomingSnapshot, "handoffMethod", "Service location or handoff method"),
        otherTasks: clean(quoteCard.otherTasks),
        scopeTasks: Array.isArray(quoteCard.scopeTasks) ? quoteCard.scopeTasks.map(clean).filter(Boolean) : [],
        scopeFrequency: clean(quoteCard.scopeFrequency),
        contact: requireSnapshotString(incomingSnapshot, "contact", "Contact"),
        emergencyContact: requireSnapshotString(incomingSnapshot, "emergencyContact", "Emergency contact"),
        handoffLocation: requireSnapshotString(incomingSnapshot, "handoffLocation", "Hand-off location"),
        careInstructions: clean(incomingSnapshot.careInstructions),
        medicationAllergyNotes: clean(incomingSnapshot.medicationAllergyNotes),
        behaviorEscapeRisk: clean(incomingSnapshot.behaviorEscapeRisk),
        emergencyVetContact: clean(incomingSnapshot.emergencyVetContact),
        emergencyVetPermission: vetAuthorized,
        emergencyVetAuthorization: {
          authorized: vetAuthorized,
          ...(vetAuthorized ? { capMinor: vetCapMinor, currency: vetAuthCurrency } : {}),
        },
        price: {
          currency,
          providerQuote: quoteCents,
          requesterTotal: customerTotal,
        },
        noStartPolicy: CARE_NO_START_POLICY,
        cancellationTerms: CARE_CANCELLATION_TERMS,
        disputeIssueWindow: "If something serious happens -- provider no-show, handoff issue, or safety concern -- send the case with evidence through huddle's booking dispute process. huddle may hold payment or review the outcome based on the available records; no response time or outcome is guaranteed.",
        termsVersion: clean(incomingSnapshot.termsVersion),
        termsPath: clean(incomingSnapshot.termsPath),
        agreedAt: clean(incomingSnapshot.agreedAt) || new Date().toISOString(),
        requesterSignature,
        requesterId: user.id,
        providerId: serviceChat.provider_id,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Booking confirmation is incomplete", code: "booking_snapshot_field_missing" }, 400);
    }
    if (!snapshot.startAt) return json({ error: "Booking start time is required" }, 400);
    if (!snapshot.endAt) return json({ error: "Booking end time is required" }, 400);
    if (serviceWindow.error) return json({ error: "Booking end time must be after the start time", code: serviceWindow.error }, 400);

    const { data: noStartPolicyAcknowledgement, error: noStartPolicyAcknowledgementErr } = await supabase.rpc(
      "current_service_no_start_policy_acknowledgement",
      { p_service_chat_id: serviceChat.id },
    );
    if (noStartPolicyAcknowledgementErr) {
      return stageJson("no_start_policy_acknowledgement_required", "Both parties must accept the no-start policy before payment.", 409, exposeStage, {
        code: clean(noStartPolicyAcknowledgementErr.message),
      });
    }
    snapshot.noStartPolicyAcknowledgement = noStartPolicyAcknowledgement;

    const { error: validateSnapshotErr } = await supabase.rpc("validate_service_booking_snapshot", { p_snapshot: snapshot });
    if (validateSnapshotErr) {
      return stageJson("snapshot_pending_write_failed", "Booking confirmation is incomplete", 400, exposeStage, {
        code: clean(validateSnapshotErr.message),
      });
    }

    const ownerPaymentConsent = {
      scopeVersionRequired: true,
      paymentAmount: customerTotal,
      paymentCurrency: currency,
      providerQuote: quoteCents,
      requesterFee,
      providerFee,
      platformGross,
      cancellationRefundAcknowledged: true,
      noStartPolicyAcknowledged: true,
      noStartPolicy: CARE_NO_START_POLICY,
      termsPath: snapshot.termsPath,
      termsVersion: snapshot.termsVersion,
      checkoutRequestedAt: new Date().toISOString(),
    };
    const { data: consentVersion, error: consentErr } = await supabase.rpc("record_owner_payment_consent", {
      p_service_chat_id: serviceChat.id,
      p_consent: ownerPaymentConsent,
    });
    if (consentErr) {
      if (consentErr.message === "care_scope_payment_pending") {
        return json({ error: "A payment for this booking is already in progress.", code: "care_scope_payment_pending" }, 409);
      }
      return json({ error: consentErr.message || "Care Agreement signatures are required before payment", code: "care_scope_not_mutually_signed" }, 409);
    }
    const scopeVersion = consentVersion as { id?: string; scope_hash?: string } | null;
    const scopeVersionId = clean(scopeVersion?.id);
    const scopeHash = clean(scopeVersion?.scope_hash);
    if (!scopeVersionId || !scopeHash) {
      return json({ error: "Care scope version is not ready for payment", code: "care_scope_version_missing" }, 409);
    }

    const { error: snapshotErr } = await supabase
      .from("service_chats")
      .update({ booking_snapshot_pending: snapshot })
      .eq("id", serviceChat.id)
      .eq("status", "pending");
    if (snapshotErr) {
      logStageError("snapshot_pending_write_failed", snapshotErr);
      return stageJson("snapshot_pending_write_failed", "Booking confirmation could not be saved", 500, exposeStage);
    }

    // Idempotency key scoped to this service chat prevents duplicate checkout
    // sessions if the client retries on network failure.
    let session: Stripe.Checkout.Session;
    const paymentAttemptId = crypto.randomUUID();
    try {
      session = await stripe.checkout.sessions.create(
        {
          customer: customerId,
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency,
                unit_amount: customerTotal,
                product_data: {
                  name: "Pet Care Service Booking",
                  description: (() => {
                    const feeSuffix = REQUESTER_FEE_RATE > 0 ? ` - includes ${Math.round(REQUESTER_FEE_RATE * 100)}% platform service fee` : "";
                    return rate ? `Service booking (${rate})${feeSuffix}` : `Service booking${feeSuffix}`;
                  })(),
                },
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            metadata: {
              type: "service_booking",
              service_chat_id: serviceChat.id,
              chat_id: serviceChat.chat_id,
              requester_id: user.id,
              provider_id: serviceChat.provider_id,
              provider_stripe_account_id: providerCarer.stripe_account_id,
              quote_cents: String(quoteCents),
              requester_fee_cents: String(requesterFee),
              provider_fee_cents: String(providerFee),
              customer_total_cents: String(customerTotal),
              platform_gross_cents: String(platformGross),
              platform_fee_cents: String(platformGross),   // kept for backward compat with any tooling
              provider_payout_cents: String(providerPayout),
              scope_version_id: scopeVersionId,
              scope_hash: scopeHash,
            },
          },
          metadata: {
            type: "service_booking",
            service_chat_id: serviceChat.id,
            chat_id: serviceChat.chat_id,
            user_id: user.id,
            requester_id: user.id,
            provider_id: serviceChat.provider_id,
            payment_attempt_id: paymentAttemptId,
            scope_version_id: scopeVersionId,
            scope_hash: scopeHash,
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey: `svc_pay_${serviceChat.id}_${mode}_${customerId}_${currency}_${customerTotal}_${scopeVersionId}_${scopeHash}_${paymentAttemptId}` },
      );
    } catch (error) {
      logStageError("stripe_checkout_create_failed", error);
      return stageJson("stripe_checkout_create_failed", "Stripe Checkout could not be created", 500, exposeStage, { stripe: stripeErrorFields(error) });
    }

    const stripeExpiresAtMs = typeof session.expires_at === "number" ? session.expires_at * 1000 : 0;
    const retryLockExpiresAtMs = Date.now() + CARE_PAYMENT_RETRY_LOCK_MS;
    const pendingExpiresAt = new Date(stripeExpiresAtMs > 0 ? Math.min(stripeExpiresAtMs, retryLockExpiresAtMs) : retryLockExpiresAtMs).toISOString();
    const { error: pendingErr } = await supabase.rpc("begin_service_care_payment_pending", {
      p_service_chat_id: serviceChat.id,
      p_checkout_session_id: session.id,
      p_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : "",
      p_scope_version_id: scopeVersionId,
      p_scope_hash: scopeHash,
      p_expires_at: pendingExpiresAt,
    });
    if (pendingErr) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error("[create-service-payment] checkout_session_expire_failed_after_scope_race", stripeErrorFields(expireError));
      }
      return json({ error: pendingErr.message || "Care scope changed before payment could start", code: "care_scope_payment_lock_failed" }, 409);
    }

    const { error: checkoutSessionErr } = await supabase
      .from("service_chats")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", serviceChat.id)
      .eq("status", "pending");
    if (checkoutSessionErr) {
      logStageError("service_chat_update_failed", checkoutSessionErr);
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error("[create-service-payment] checkout_session_expire_failed_after_save_error", stripeErrorFields(expireError));
      }
      await supabase
        .from("care_scope_versions")
        .update({
          payment_status: "failed",
          payment_scope_conflict_reason: "checkout_session_save_failed",
          payment_pending_expires_at: new Date().toISOString(),
        })
        .eq("id", scopeVersionId)
        .eq("checkout_session_id", session.id);
      await supabase
        .from("service_chats")
        .update({
          booking_snapshot_pending: null,
          stripe_checkout_session_id: null,
        })
        .eq("id", serviceChat.id)
        .eq("status", "pending");
      return stageJson("service_chat_update_failed", "Checkout session could not be saved", 500, exposeStage);
    }

    return json({
      mode,
      url: session.url,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[create-service-payment] unhandled_crash:", { message, stack });
    // Surface the real message/stage instead of a bare "internal_error" so a crash is
    // diagnosable from the client's own error popup, not just server logs.
    return json({ error: message || "internal_error", code: "unhandled_crash", stack }, 500);
  }
});
