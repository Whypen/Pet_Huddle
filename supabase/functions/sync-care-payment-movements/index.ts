import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.1";

const clean = (value: unknown) => String(value || "").trim();
const firstSecretKey = (value: string | null | undefined) => {
  const raw = clean(value).replace(/^['"]+|['"]+$/g, "");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(clean).find(Boolean) || "";
    if (parsed && typeof parsed === "object") return Object.values(parsed).map(clean).find(Boolean) || "";
  } catch {
    // Fall through to delimited secret parsing.
  }
  return raw.split(/[\s,]+/).map(clean).find(Boolean) || "";
};

const projectRef = Deno.env.get("SUPABASE_PROJECT_REF") || "ztrbourwcnhrpmzwlrcn";
const configuredSupabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseUrl = configuredSupabaseUrl.includes(projectRef) ? configuredSupabaseUrl : `https://${projectRef}.supabase.co`;
const serviceKey = firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
  || firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY"))
  || firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS"));
const acceptedTokens = Array.from(new Set([
  firstSecretKey(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEY")),
  firstSecretKey(Deno.env.get("SUPABASE_SECRET_KEYS")),
].filter(Boolean)));
const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeModeHint = clean(Deno.env.get("STRIPE_MODE")).toLowerCase();
const stripeSecrets = () => Array.from(new Set(
  (stripeModeHint === "live"
    ? [stripeLiveSecret, stripeDefaultSecret, stripeTestSecret]
    : [stripeTestSecret, stripeDefaultSecret, stripeLiveSecret])
    .map(clean).filter(Boolean),
));
const makeStripe = (secret: string) => new Stripe(secret, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const supabase = createClient(supabaseUrl, serviceKey);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const iso = (seconds: unknown) => {
  const numeric = Number(seconds || 0);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric * 1000).toISOString() : null;
};
const addBusinessDays = (value: string, days: number) => {
  const date = new Date(value);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString();
};
const safeError = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/sk_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 320);
};

type Movement = {
  id: string;
  service_chat_id: string;
  movement_kind: "owner_refund" | "carer_payout";
  stripe_refund_id?: string | null;
  stripe_transfer_id?: string | null;
  stripe_connected_account_id?: string | null;
  stripe_destination_payment_id?: string | null;
  stripe_payout_id?: string | null;
  sync_attempt_count?: number | null;
  created_at?: string | null;
};

const retrieveFromOwningStripe = async <T,>(operation: (stripe: Stripe) => Promise<T>) => {
  let lastError = "stripe_object_not_found";
  for (const secret of stripeSecrets()) {
    try {
      const stripe = makeStripe(secret);
      return { object: await operation(stripe), stripe };
    } catch (error) {
      lastError = safeError(error);
    }
  }
  throw new Error(lastError);
};

const findPayoutForDestinationPayment = async (
  stripe: Stripe,
  connectedAccountId: string,
  destinationPaymentId: string,
  preferredPayoutId?: string | null,
): Promise<{ payout: Stripe.Payout; balanceTransactionId: string } | null> => {
  const inspectPayout = async (payout: Stripe.Payout) => {
    let txnStartingAfter: string | undefined;
    do {
      const transactionPage = await stripe.balanceTransactions.list(
        { payout: payout.id, limit: 100, ...(txnStartingAfter ? { starting_after: txnStartingAfter } : {}) },
        { stripeAccount: connectedAccountId },
      );
      const matchingTransaction = (transactionPage.data as Stripe.BalanceTransaction[]).find((transaction: Stripe.BalanceTransaction) => {
        const source = typeof transaction.source === "string" ? transaction.source : transaction.source?.id;
        return source === destinationPaymentId;
      });
      if (matchingTransaction) return { payout, balanceTransactionId: matchingTransaction.id };
      if (!transactionPage.has_more || transactionPage.data.length === 0) break;
      txnStartingAfter = transactionPage.data[transactionPage.data.length - 1].id;
    } while (txnStartingAfter);
    return null;
  };

  if (preferredPayoutId) {
    try {
      const preferred = await stripe.payouts.retrieve(preferredPayoutId, {}, { stripeAccount: connectedAccountId });
      return await inspectPayout(preferred);
    } catch {
      return null;
    }
  }
  // Automatic payouts are newest-first. One bounded page is enough because a
  // missed match remains due and the payout webhook supplies the exact payout.
  const page = await stripe.payouts.list({ limit: 100 }, { stripeAccount: connectedAccountId });
  for (const payout of page.data as Stripe.Payout[]) {
    const match = await inspectPayout(payout);
    if (match) return match;
  }
  return null;
};

const destinationPaymentsForPayout = async (connectedAccountId: string, payoutId: string) => {
  const result = await retrieveFromOwningStripe((client) => client.payouts.retrieve(
    payoutId,
    {},
    { stripeAccount: connectedAccountId },
  ));
  const stripe = result.stripe;
  const destinationPaymentIds = new Set<string>();
  let startingAfter: string | undefined;
  do {
    const page = await stripe.balanceTransactions.list(
      { payout: payoutId, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      { stripeAccount: connectedAccountId },
    );
    for (const transaction of page.data as Stripe.BalanceTransaction[]) {
      const source = typeof transaction.source === "string" ? transaction.source : transaction.source?.id;
      if (source) destinationPaymentIds.add(source);
    }
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  } while (startingAfter);
  return Array.from(destinationPaymentIds);
};

const syncRefund = async (movement: Movement) => {
  const refundId = clean(movement.stripe_refund_id);
  if (!refundId) throw new Error("refund_id_missing");
  const result = await retrieveFromOwningStripe((stripe) => stripe.refunds.retrieve(refundId));
  const refund = result.object as Stripe.Refund;
  const destination = (refund as unknown as { destination_details?: Record<string, unknown> | null }).destination_details || {};
  const destinationType = clean(destination.type);
  const destinationData = destinationType && destination[destinationType] && typeof destination[destinationType] === "object"
    ? destination[destinationType] as Record<string, unknown>
    : {};
  const stripeCreatedAt = iso(refund.created) || new Date().toISOString();
  const normalizedStatus = clean(refund.status).toLowerCase();
  const status = normalizedStatus === "succeeded" ? "succeeded"
    : normalizedStatus === "failed" ? "failed"
    : normalizedStatus === "canceled" ? "canceled"
    : "pending";
  const referenceStatus = clean(destinationData.reference_status) || null;
  const nextSyncAt = status === "pending"
    ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
    : referenceStatus === "pending" || (!referenceStatus && status === "succeeded")
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;
  const { error } = await supabase.from("care_payment_movements").update({
    amount_minor: refund.amount,
    currency: clean(refund.currency).toUpperCase() || null,
    status,
    stripe_payment_intent_id: typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || null,
    stripe_created_at: stripeCreatedAt,
    processed_at: status === "succeeded" ? stripeCreatedAt : null,
    estimated_arrival_at: status === "succeeded" ? addBusinessDays(stripeCreatedAt, 10) : null,
    refund_reference_value: clean(destinationData.reference) || null,
    refund_reference_status: referenceStatus,
    refund_reference_type: clean(destinationData.reference_type) || (destinationType ? `${destinationType}_reference` : null),
    last_synced_at: new Date().toISOString(),
    next_sync_at: nextSyncAt,
    sync_attempt_count: 0,
    reconciliation_attention_at: null,
    failure_code: status === "failed" ? clean(refund.failure_reason) || "refund_failed" : null,
    failure_message_safe: status === "failed" ? "Stripe reported that the refund failed." : null,
    updated_at: new Date().toISOString(),
  }).eq("id", movement.id);
  if (error) throw new Error(`refund_ledger_update_failed:${error.message}`);
};

const syncPayout = async (
  movement: Movement,
  preferredPayoutId?: string | null,
  preferredConnectedAccountId?: string | null,
) => {
  const transferId = clean(movement.stripe_transfer_id);
  if (!transferId) throw new Error("transfer_id_missing");
  const result = await retrieveFromOwningStripe((client) => client.transfers.retrieve(transferId));
  const transfer = result.object as Stripe.Transfer;
  const stripe = result.stripe;
  const connectedAccountId = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id || "";
  const destinationPaymentId = typeof transfer.destination_payment === "string"
    ? transfer.destination_payment
    : transfer.destination_payment?.id || "";
  if (!connectedAccountId || !destinationPaymentId) throw new Error("transfer_destination_link_pending");
  if (preferredConnectedAccountId && preferredConnectedAccountId !== connectedAccountId) {
    throw new Error("payout_connected_account_mismatch");
  }
  const payoutMatch = await findPayoutForDestinationPayment(
    stripe,
    connectedAccountId,
    destinationPaymentId,
    preferredPayoutId || movement.stripe_payout_id,
  );
  const payout = payoutMatch?.payout || null;
  const payoutStatus = clean(payout?.status).toLowerCase();
  const status = !payout ? "submitted"
    : payoutStatus === "paid" ? "paid"
    : payoutStatus === "failed" ? "failed"
    : payoutStatus === "canceled" ? "canceled"
    : payoutStatus === "in_transit" ? "in_transit"
    : "pending";
  const trace = (payout as unknown as { trace_id?: { status?: string | null; value?: string | null } | null } | null)?.trace_id;
  const arrivalAt = payout ? iso(payout.arrival_date) : null;
  const nextSyncAt = status === "paid" && (!clean(trace?.value) || clean(trace?.status) === "pending")
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : status === "submitted"
      ? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
      : ["pending", "in_transit"].includes(status)
        ? new Date(Date.now() + 60 * 60 * 1000).toISOString()
        : null;
  const { error } = await supabase.from("care_payment_movements").update({
    amount_minor: transfer.amount,
    currency: clean(transfer.currency).toUpperCase() || null,
    status,
    stripe_connected_account_id: connectedAccountId,
    stripe_destination_payment_id: destinationPaymentId,
    stripe_payout_id: payout?.id || null,
    stripe_connected_balance_transaction_id: payoutMatch?.balanceTransactionId || null,
    stripe_created_at: iso(transfer.created),
    processed_at: iso(transfer.created),
    estimated_arrival_at: arrivalAt,
    paid_at: status === "paid" ? arrivalAt : null,
    payout_trace_value: clean(trace?.value) || null,
    payout_trace_status: clean(trace?.status) || null,
    last_synced_at: new Date().toISOString(),
    next_sync_at: nextSyncAt,
    sync_attempt_count: 0,
    reconciliation_attention_at: null,
    failure_code: status === "failed" ? clean(payout?.failure_code) || "payout_failed" : null,
    failure_message_safe: status === "failed" ? "Stripe reported that the payout failed." : null,
    updated_at: new Date().toISOString(),
  }).eq("id", movement.id);
  if (error) throw new Error(`payout_ledger_update_failed:${error.message}`);
};

serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const bearer = clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  if (!serviceKey || !acceptedTokens.includes(bearer)) return json({ ok: false, error: "unauthorized" }, 401);
  if (stripeSecrets().length === 0) return json({ ok: false, error: "stripe_secret_missing" }, 500);

  const payload = await request.json().catch(() => ({} as Record<string, unknown>));
  const serviceChatId = clean(payload.service_chat_id);
  const preferredPayoutId = clean(payload.payout_id);
  const preferredConnectedAccountId = clean(payload.stripe_account_id);
  let query = supabase.from("care_payment_movements").select(
    "id,service_chat_id,movement_kind,stripe_refund_id,stripe_transfer_id,stripe_connected_account_id,stripe_destination_payment_id,stripe_payout_id,sync_attempt_count,created_at",
  );
  if (serviceChatId) {
    query = query.eq("service_chat_id", serviceChatId);
  } else if (preferredPayoutId && preferredConnectedAccountId) {
    const destinationPaymentIds = await destinationPaymentsForPayout(preferredConnectedAccountId, preferredPayoutId);
    if (destinationPaymentIds.length === 0) {
      return json({ ok: true, checked: 0, synced: 0, exact_payout_match: false, failures: [] });
    }
    query = query
      .eq("movement_kind", "carer_payout")
      .eq("stripe_connected_account_id", preferredConnectedAccountId)
      .in("stripe_destination_payment_id", destinationPaymentIds);
  } else {
    query = query
      .not("next_sync_at", "is", null)
      .lte("next_sync_at", new Date().toISOString())
      .order("next_sync_at", { ascending: true })
      .limit(50);
  }
  const { data, error } = await query;
  if (error) return json({ ok: false, error: "movement_load_failed", detail: error.message }, 500);

  let synced = 0;
  let skippedPreTransfer = 0;
  const failures: Array<{ id: string; code: string }> = [];
  for (const movement of (data || []) as Movement[]) {
    if (movement.movement_kind === "carer_payout" && !clean(movement.stripe_transfer_id)) {
      // A service-keyed pre-transfer attempt is intentionally retained in Care
      // History. Stripe reconciliation starts only after a transfer exists.
      skippedPreTransfer += 1;
      continue;
    }
    try {
      if (movement.movement_kind === "owner_refund") await syncRefund(movement);
      else await syncPayout(movement, preferredPayoutId || null, preferredConnectedAccountId || null);
      synced += 1;
    } catch (syncError) {
      const detail = safeError(syncError);
      failures.push({ id: movement.id, code: detail.split(":")[0] || "sync_failed" });
      const nextAttempt = (Number(movement.sync_attempt_count) || 0) + 1;
      const retryDelayMs = nextAttempt === 1
        ? 15 * 60 * 1000
        : nextAttempt === 2
          ? 60 * 60 * 1000
          : nextAttempt === 3
            ? 6 * 60 * 60 * 1000
            : null;
      await supabase.from("care_payment_movements").update({
        sync_attempt_count: nextAttempt,
        failure_code: detail.split(":")[0] || "sync_failed",
        failure_message_safe: detail,
        last_synced_at: new Date().toISOString(),
        next_sync_at: retryDelayMs === null ? null : new Date(Date.now() + retryDelayMs).toISOString(),
        reconciliation_attention_at: retryDelayMs === null ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", movement.id);
    }
  }
  return json({ ok: failures.length === 0, checked: data?.length || 0, synced, skipped_pre_transfer: skippedPreTransfer, failures });
});
