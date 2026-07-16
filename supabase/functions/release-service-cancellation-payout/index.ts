// Pays any explicitly recorded carer cancellation payout when an OWNER cancels a paid booking
// late. The current Huddle policy retains the 24-72h amount at the platform; only an explicitly
// recorded payout (for example the non-refundable under-24h tier) can enter this path. Deliberately
// NOT a branch inside release-service-payout:
// that function's preflight (check-in evidence, hard-completion, dispute checks) is specific
// to a booking that actually happened, none of which applies to a cancellation. Keeping this
// separate means the completed-booking payout path — the one carrying almost all payout
// volume — is untouched by this change.
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

const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") || "ztrbourwcnhrpmzwlrcn";
const configuredSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseUrl = configuredSupabaseUrl.includes(projectRef) ? configuredSupabaseUrl : `https://${projectRef}.supabase.co`;
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
const supabaseSecretKey =
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const supabaseApiKey =
  firstSecretKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")) ||
  firstSecretKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEY")) ||
  firstSecretKey(Deno.env.get("SUPABASE_ANON_KEY")) ||
  supabaseSecretKey;
const supabase = createClient(supabaseUrl, supabaseSecretKey || supabaseApiKey);
const releaseServicePayoutSecret = Deno.env.get("RELEASE_SERVICE_PAYOUT_SECRET") || "";
const serviceRoleKey = supabaseSecretKey;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown): string => String(value || "").trim();

const stripeSecretsByPreference = () => {
  const ordered = stripeModeHint === "live"
    ? [stripeLiveSecret, stripeDefaultSecret, stripeTestSecret]
    : [stripeTestSecret, stripeDefaultSecret, stripeLiveSecret];
  return Array.from(new Set(ordered.map(clean).filter(Boolean)));
};
const createStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });
const retrievePaymentIntentWithOwningKey = async (paymentIntentId: string) => {
  let lastError = "";
  for (const secret of stripeSecretsByPreference()) {
    try {
      const stripe = createStripeClient(secret);
      return { paymentIntent: await stripe.paymentIntents.retrieve(paymentIntentId), stripe };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError || "payment_intent_retrieve_failed");
};
const authorizedBackendCaller = (req: Request): boolean => {
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const internalSecret = req.headers.get("x-huddle-internal-secret") || "";
  return Boolean(
    (serviceRoleKey && bearer === serviceRoleKey) ||
    (releaseServicePayoutSecret && internalSecret === releaseServicePayoutSecret),
  );
};

const unlockPayout = async (serviceChatId: string, lockToken: string) => {
  await supabase.rpc("unlock_service_payout_release_by_service_id", { p_service_chat_id: serviceChatId, p_lock_token: lockToken });
};
const markPayoutFailed = async (serviceChatId: string, lockToken: string, reason: string) => {
  await supabase.rpc("mark_service_payout_release_failed_by_service_id", { p_service_chat_id: serviceChatId, p_lock_token: lockToken, p_reason: reason });
};
const markPayoutManualRecovery = async (serviceChatId: string, lockToken: string, reason: string, transferId?: string | null) => {
  await supabase.rpc("mark_service_payout_manual_recovery_by_service_id", { p_service_chat_id: serviceChatId, p_lock_token: lockToken, p_reason: reason, p_stripe_transfer_id: transferId || null });
};
const moneyAlert = async (serviceChatId: string, code: string, detail: Record<string, unknown> = {}) => {
  console.error("[release-service-cancellation-payout] money_flow_alert", JSON.stringify({ service_chat_id: serviceChatId, code, ...detail }));
  try {
    await supabase.from("admin_audit_logs").insert({
      action: `service_cancellation_payout_${code}`,
      notes: `Cancellation payout blocked: ${code}`,
      details: { service_chat_id: serviceChatId, ...detail },
    });
  } catch {
    // Preserve the money guard result even if audit logging is unavailable.
  }
};

const cancellationPayoutSelect =
  "id, status, cancellation_provider_payout_cents, refund_issued_at, stripe_payment_intent_id, stripe_transfer_id, payout_release_requested_at, payout_released_at, manual_recovery_required_at, manual_recovery_reason, provider_id, request_card";

const resolveCancellationPayoutServiceChat = async (inputId: string) => {
  return await supabase
    .from("service_chats")
    .select(cancellationPayoutSelect)
    .eq("id", inputId)
    .eq("status", "cancelled")
    .maybeSingle();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorizedBackendCaller(req)) return json({ error: "Unauthorized" }, 401);
  if (stripeSecretsByPreference().length === 0) return json({ error: "Missing Stripe secret key" }, 500);

  let serviceChatId = "";
  let payoutServiceChatId = "";
  let lockToken = "";
  let stripeTransferCreated = false;
  let stripeTransferId: string | null = null;

  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    serviceChatId = String(payload.service_chat_id || "").trim();
    if (!serviceChatId) return json({ error: "Missing service_chat_id" }, 400);

    lockToken = crypto.randomUUID();

    const { data: preflightRow, error: preflightError } = await resolveCancellationPayoutServiceChat(serviceChatId);
    if (preflightError) return json({ error: "preflight_failed", detail: preflightError.message }, 500);
    if (!preflightRow) return json({ error: "service_chat_not_found", alert: true, service_chat_id: serviceChatId }, 404);
    const targetServiceChatId = String(preflightRow.id);
    payoutServiceChatId = targetServiceChatId;
    if (preflightRow.status !== "cancelled") {
      return json({ error: "not_cancelled", service_chat_id: serviceChatId }, 409);
    }
    if (preflightRow.payout_released_at && !preflightRow.stripe_transfer_id) {
      await moneyAlert(targetServiceChatId, "released_without_transfer_id");
      return json({ error: "released_without_transfer_id", alert: true, service_chat_id: serviceChatId }, 409);
    }
    if (preflightRow.manual_recovery_required_at) {
      await moneyAlert(targetServiceChatId, "manual_recovery_required", { reason: preflightRow.manual_recovery_reason || "unknown" });
      return json({ error: "manual_recovery_required", alert: true, service_chat_id: serviceChatId }, 409);
    }
    const cancellationPayoutCents = Number(preflightRow.cancellation_provider_payout_cents || 0);
    if (!Number.isFinite(cancellationPayoutCents) || cancellationPayoutCents <= 0) {
      return json({ error: "no_cancellation_payout_due", service_chat_id: serviceChatId }, 409);
    }
    const servicePaymentIntentId = clean(preflightRow.stripe_payment_intent_id);
    if (!servicePaymentIntentId) {
      await moneyAlert(serviceChatId, "missing_payment_intent", {});
      return json({ error: "missing_payment_intent", alert: true, service_chat_id: serviceChatId }, 409);
    }

    const { data: claimRow, error: claimError } = await supabase.rpc("claim_service_payout_release_by_service_id", {
      p_service_chat_id: targetServiceChatId,
      p_lock_token: lockToken,
    });
    if (claimError) return json({ error: "claim_failed", detail: claimError.message }, 500);
    const claimPayload = (claimRow || {}) as Record<string, unknown>;
    if (claimPayload.claimed !== true) {
      return json({ ok: true, skipped: "already_claimed_or_released" });
    }

    let stripe: Stripe;
    let paymentIntent: Stripe.PaymentIntent;
    try {
      const resolved = await retrievePaymentIntentWithOwningKey(servicePaymentIntentId);
      stripe = resolved.stripe;
      paymentIntent = resolved.paymentIntent;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPayoutFailed(targetServiceChatId, lockToken, `payment_intent_retrieve_failed:${message}`);
      await moneyAlert(targetServiceChatId, "payment_intent_retrieve_failed", { payment_intent_id: servicePaymentIntentId, detail: message });
      return json({ error: "payment_intent_retrieve_failed", alert: true, detail: message }, 502);
    }
    const providerStripeAccountId = clean(paymentIntent.metadata?.provider_stripe_account_id);
    if (!providerStripeAccountId) {
      await markPayoutFailed(targetServiceChatId, lockToken, "missing_payout_metadata");
      await moneyAlert(targetServiceChatId, "missing_payout_metadata", { payment_intent_id: paymentIntent.id });
      return json({ error: "missing_payout_metadata", alert: true, service_chat_id: serviceChatId }, 409);
    }
    if (paymentIntent.status !== "succeeded") {
      await markPayoutFailed(targetServiceChatId, lockToken, `payment_intent_not_succeeded:${paymentIntent.status}`);
      await moneyAlert(targetServiceChatId, "payment_intent_not_succeeded", { payment_intent_id: paymentIntent.id, status: paymentIntent.status });
      return json({ error: "payment_intent_not_succeeded", alert: true, payment_intent_status: paymentIntent.status }, 409);
    }
    const { error: payoutRecordError } = await supabase.rpc("upsert_care_payment_movement", {
      p_service_chat_id: targetServiceChatId,
      p_movement_kind: "carer_payout",
      p_movement_reason: "cancellation_payout",
      p_source_kind: "release_service_cancellation_payout",
      p_source_record_id: targetServiceChatId,
      p_amount_minor: cancellationPayoutCents,
      p_currency: clean(paymentIntent.currency).toUpperCase(),
      p_status: "submitted",
      p_stripe_payment_intent_id: paymentIntent.id,
      p_stripe_refund_id: null,
      p_stripe_transfer_id: null,
      p_requested_at: clean(preflightRow.payout_release_requested_at) || new Date().toISOString(),
      p_processed_at: null,
    });
    if (payoutRecordError) {
      await markPayoutFailed(targetServiceChatId, lockToken, `payout_record_failed:${payoutRecordError.message}`);
      return json({ error: "payout_record_failed", alert: true }, 500);
    }
    // Sanity check: the retained-carer amount plus what was already refunded to the owner
    // must not exceed what Stripe actually captured — guards against a bad/duplicated value.
    const amountReceived = Number(paymentIntent.amount_received || 0);
    if (cancellationPayoutCents > amountReceived) {
      await markPayoutFailed(targetServiceChatId, lockToken, "cancellation_payout_exceeds_amount_received");
      await moneyAlert(targetServiceChatId, "cancellation_payout_exceeds_amount_received", { payment_intent_id: paymentIntent.id, amount_received: amountReceived, cancellation_payout_cents: cancellationPayoutCents });
      return json({ error: "cancellation_payout_exceeds_amount_received", alert: true }, 409);
    }

    const latestChargeId = typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : (paymentIntent.latest_charge as { id?: string } | null)?.id || undefined;
    const transferCreateParams: Stripe.TransferCreateParams = {
      amount: cancellationPayoutCents,
      currency: paymentIntent.currency || "usd",
      destination: providerStripeAccountId,
      transfer_group: `service_chat_${targetServiceChatId}`,
      metadata: {
        service_chat_id: targetServiceChatId,
        payment_intent_id: paymentIntent.id,
        reason: "owner_late_cancellation_retained_payout",
      },
    };
    if (latestChargeId) transferCreateParams.source_transaction = latestChargeId;

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create(
        transferCreateParams,
        { idempotencyKey: `service_cancellation_payout:${targetServiceChatId}:${cancellationPayoutCents}:${paymentIntent.id}` },
      );
      stripeTransferCreated = true;
      stripeTransferId = transfer.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPayoutFailed(targetServiceChatId, lockToken, `stripe_transfer_failed:${message}`);
      await moneyAlert(targetServiceChatId, "stripe_transfer_failed", { payment_intent_id: paymentIntent.id, detail: message });
      return json({ error: "stripe_transfer_failed", alert: true, detail: message }, 502);
    }

    const { data: releaseUpdateRow, error: releaseUpdateError } = await supabase.rpc("mark_service_payout_released_by_service_id", {
      p_service_chat_id: targetServiceChatId,
      p_lock_token: lockToken,
      p_stripe_transfer_id: transfer.id,
    });
    const releaseUpdatePayload = (releaseUpdateRow || {}) as Record<string, unknown>;
    if (releaseUpdateError || releaseUpdatePayload.updated !== true) {
      await markPayoutManualRecovery(targetServiceChatId, lockToken, "db_mark_release_failed_after_transfer", transfer.id);
      await moneyAlert(targetServiceChatId, "db_mark_release_failed_after_transfer", { transfer_id: transfer.id, detail: releaseUpdateError?.message || "no_row_updated" });
      return json({ error: "db_mark_release_failed_after_transfer", alert: true, stripe_transfer_id: transfer.id }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    if (serviceChatId) {
      const safeServiceChatId = payoutServiceChatId || serviceChatId;
      if (stripeTransferCreated) {
        await markPayoutManualRecovery(safeServiceChatId, lockToken, "exception_after_stripe_transfer", stripeTransferId);
      } else if (lockToken) {
        await unlockPayout(safeServiceChatId, lockToken);
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[release-service-cancellation-payout] failed:", message);
    return json({ error: "internal_error", detail: message }, 500);
  }
});
