import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("HUDDLE_SUPABASE_SERVICE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeMode = String(Deno.env.get("STRIPE_MODE") || "").trim().toLowerCase();

type ServiceChatRow = {
  id: string;
  chat_id: string;
  requester_id: string;
  provider_id: string;
  status: string | null;
  care_status: string | null;
  stripe_payment_intent_id: string | null;
  payout_released_at: string | null;
  updated_at: string | null;
};

type ServiceDisputeRow = {
  id: string;
  status: string | null;
  stripe_action_status: string | null;
  stripe_error_code: string | null;
  stripe_error_message: string | null;
  final_customer_refund_amount: number | null;
  final_provider_receives_amount: number | null;
  stripe_refund_id: string | null;
  stripe_transfer_id: string | null;
  stripe_charge_id: string | null;
  stripe_connected_account_id: string | null;
};

const supabase = createClient(supabaseUrl, serviceKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown) => String(value || "").trim();

const stripeSecrets = () => {
  const ordered = stripeMode === "test"
    ? [stripeTestSecret, stripeDefaultSecret, stripeLiveSecret]
    : [stripeLiveSecret, stripeDefaultSecret, stripeTestSecret];
  return [...new Set(ordered.filter(Boolean))];
};

const makeStripe = (secret: string) =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const userTokenFromRequest = (req: Request) =>
  clean(req.headers.get("Authorization")).replace(/^Bearer\s+/i, "");

const isAdmin = async (token: string) => {
  if (!token) return { ok: false as const, userId: "" };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user?.id) return { ok: false as const, userId: "" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin,user_role")
    .eq("id", user.id)
    .maybeSingle();
  const admin = Boolean(profile?.is_admin === true || String(profile?.user_role || "").toLowerCase() === "admin");
  return { ok: admin, userId: user.id };
};

const compactStripeObject = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const allowed = [
    "id",
    "object",
    "amount",
    "amount_captured",
    "amount_refunded",
    "application_fee_amount",
    "balance_transaction",
    "charge",
    "created",
    "currency",
    "destination",
    "dispute",
    "failure_code",
    "failure_message",
    "latest_charge",
    "metadata",
    "paid",
    "payment_intent",
    "payment_method_types",
    "refunded",
    "status",
    "transfer",
    "transfer_group",
  ];
  for (const key of allowed) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
};

const redactStripeRaw = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactStripeRaw);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (/secret|client_secret|fingerprint|number|cvc|receipt_email|billing_details|payment_method_details/i.test(key)) continue;
    if (key === "metadata" && raw && typeof raw === "object") {
      const metadata: Record<string, unknown> = {};
      for (const [metaKey, metaValue] of Object.entries(raw as Record<string, unknown>)) {
        if (/email|phone|name|address/i.test(metaKey)) continue;
        metadata[metaKey] = metaValue;
      }
      result[key] = metadata;
      continue;
    }
    result[key] = redactStripeRaw(raw);
  }
  return result;
};

const cents = (amount: number | null | undefined) => Math.max(0, Number(amount || 0));
const statusFromData = (options: {
  charge: Stripe.Charge | null;
  dispute: ServiceDisputeRow | null;
  refunds: Stripe.Refund[];
  serviceChat: ServiceChatRow;
  transfers: Stripe.Transfer[];
}) => {
  if (options.dispute?.stripe_action_status === "failed" || options.dispute?.stripe_error_code) return "stripe_failed";
  const disputeStatus = clean(options.dispute?.status).toLowerCase();
  if (
    ["open", "awaiting_evidence", "under_review", "decision_ready", "resolved_hold"].includes(disputeStatus) ||
    clean(options.serviceChat.status).toLowerCase() === "disputed" ||
    ["under_dispute", "handoff_issue_review"].includes(clean(options.serviceChat.care_status).toLowerCase())
  ) return "disputed_hold";

  const pendingRefund = options.refunds.some((refund) => !["succeeded", "failed", "canceled"].includes(clean(refund.status).toLowerCase()));
  if (pendingRefund) return "refund_pending";
  const succeededRefunds = options.refunds.filter((refund) => clean(refund.status).toLowerCase() === "succeeded" || !refund.status);
  const refundedCents = succeededRefunds.reduce((sum, refund) => sum + cents(refund.amount), 0);
  const chargeAmount = cents(options.charge?.amount);
  if (refundedCents > 0 && chargeAmount > 0 && refundedCents >= chargeAmount) return "refund_full_succeeded";
  if (refundedCents > 0) return "refund_partial_succeeded";
  if (options.transfers.length > 0 || options.serviceChat.payout_released_at) return "payout_released";
  if (clean(options.serviceChat.status).toLowerCase() === "completed") return "completed_pending_payout";
  if (clean(options.serviceChat.status).toLowerCase() === "in_progress" || clean(options.serviceChat.care_status).toLowerCase() === "in_progress") return "care_in_progress_hold";
  return "paid_pending_care";
};

const listTransfers = async (stripe: Stripe, paymentIntent: Stripe.PaymentIntent, charge: Stripe.Charge | null) => {
  const transferIds = new Set<string>();
  const transferGroup = clean(paymentIntent.transfer_group) || clean(charge?.transfer_group);
  const metadataServiceChatId = clean(paymentIntent.metadata?.service_chat_id);
  if (typeof charge?.transfer === "string") transferIds.add(charge.transfer);

  const transfers: Stripe.Transfer[] = [];
  for (const transferId of transferIds) {
    const transfer = await stripe.transfers.retrieve(transferId, { expand: ["reversals"] }).catch(() => null);
    if (transfer) transfers.push(transfer);
  }
  if (transferGroup) {
    const listed = await stripe.transfers.list({ transfer_group: transferGroup, limit: 20 }).catch(() => null);
    for (const transfer of listed?.data || []) {
      if (!transfers.some((item) => item.id === transfer.id)) {
        const expanded = await stripe.transfers.retrieve(transfer.id, { expand: ["reversals"] }).catch(() => transfer);
        transfers.push(expanded);
      }
    }
  }
  if (metadataServiceChatId) {
    const listed = await stripe.transfers.list({ limit: 50 }).catch(() => null);
    for (const transfer of listed?.data || []) {
      if (transfer.metadata?.service_chat_id === metadataServiceChatId && !transfers.some((item) => item.id === transfer.id)) {
        const expanded = await stripe.transfers.retrieve(transfer.id, { expand: ["reversals"] }).catch(() => transfer);
        transfers.push(expanded);
      }
    }
  }
  return transfers;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = await isAdmin(userTokenFromRequest(req));
  if (!admin.ok) return json({ error: "admin_required" }, 403);

  const payload = await req.json().catch(() => ({} as Record<string, unknown>));
  const serviceChatId = clean(payload.service_chat_id);
  const paymentIntentInput = clean(payload.payment_intent_id);
  if (!serviceChatId && !paymentIntentInput) return json({ error: "service_chat_id_or_payment_intent_id_required" }, 400);

  const { data: serviceChat, error: serviceChatError } = serviceChatId
    ? await supabase
      .from("service_chats")
      .select("id,chat_id,requester_id,provider_id,status,care_status,stripe_payment_intent_id,payout_released_at,updated_at")
      .eq("id", serviceChatId)
      .maybeSingle<ServiceChatRow>()
    : await supabase
      .from("service_chats")
      .select("id,chat_id,requester_id,provider_id,status,care_status,stripe_payment_intent_id,payout_released_at,updated_at")
      .eq("stripe_payment_intent_id", paymentIntentInput)
      .maybeSingle<ServiceChatRow>();

  if (serviceChatError) return json({ error: "service_chat_lookup_failed", detail: serviceChatError.message }, 500);
  if (!serviceChat) return json({ error: "service_chat_not_found" }, 404);

  const paymentIntentId = serviceChat.stripe_payment_intent_id || paymentIntentInput;
  if (!paymentIntentId) return json({ error: "missing_payment_intent_id" }, 409);

  const { data: dispute } = await supabase
    .from("service_disputes")
    .select("id,status,stripe_action_status,stripe_error_code,stripe_error_message,final_customer_refund_amount,final_provider_receives_amount,stripe_refund_id,stripe_transfer_id,stripe_charge_id,stripe_connected_account_id")
    .eq("service_chat_id", serviceChat.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<ServiceDisputeRow>();

  const secrets = stripeSecrets();
  if (secrets.length === 0) return json({ error: "stripe_secret_missing" }, 500);

  let stripe: Stripe | null = null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  let lastError = "";
  for (const secret of secrets) {
    try {
      const client = makeStripe(secret);
      const intent = await client.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge", "latest_charge.balance_transaction", "latest_charge.application_fee", "latest_charge.dispute"],
      });
      stripe = client;
      paymentIntent = intent;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!stripe || !paymentIntent) {
    const status = "stripe_failed";
    const { data: snapshot } = await supabase
      .from("care_money_flow_snapshots")
      .insert({
        service_chat_id: serviceChat.id,
        payment_intent_id: paymentIntentId,
        normalized_money_flow_status: status,
        synced_by_admin_id: admin.userId,
        error_code: "payment_intent_retrieve_failed",
        error_message: lastError,
      })
      .select("*")
      .single();
    return json({ ok: false, snapshot, error: "payment_intent_retrieve_failed", detail: lastError }, 502);
  }

  const charge = typeof paymentIntent.latest_charge === "string"
    ? await stripe.charges.retrieve(paymentIntent.latest_charge, {
      expand: ["balance_transaction", "application_fee", "dispute"],
    }).catch(() => null)
    : (paymentIntent.latest_charge as Stripe.Charge | null);
  const refunds = charge?.id
    ? (await stripe.refunds.list({ charge: charge.id, limit: 100 }).catch(() => ({ data: [] as Stripe.Refund[] }))).data
    : (await stripe.refunds.list({ payment_intent: paymentIntent.id, limit: 100 }).catch(() => ({ data: [] as Stripe.Refund[] }))).data;
  const transfers = await listTransfers(stripe, paymentIntent, charge);
  const applicationFee = typeof charge?.application_fee === "string"
    ? await stripe.applicationFees.retrieve(charge.application_fee).catch(() => null)
    : (charge?.application_fee as Stripe.ApplicationFee | null) || null;
  const stripeDispute = typeof charge?.dispute === "string"
    ? await stripe.disputes.retrieve(charge.dispute).catch(() => null)
    : (charge?.dispute as Stripe.Dispute | null) || null;

  const balanceTransactions = [
    charge?.balance_transaction,
    ...refunds.map((refund) => refund.balance_transaction),
    applicationFee?.balance_transaction,
  ].filter(Boolean);

  const normalized = statusFromData({ charge, dispute: dispute || null, refunds, serviceChat, transfers });
  const redactedRaw = redactStripeRaw({
    payment_intent: paymentIntent,
    charge,
    refunds,
    transfers,
    application_fee: applicationFee,
    dispute: stripeDispute,
    balance_transactions: balanceTransactions,
  });

  const { data: snapshot, error: insertError } = await supabase
    .from("care_money_flow_snapshots")
    .insert({
      service_chat_id: serviceChat.id,
      payment_intent_id: paymentIntent.id,
      charge_id: charge?.id || dispute?.stripe_charge_id || null,
      refunds: refunds.map(compactStripeObject),
      transfers: transfers.map((transfer) => ({
        ...compactStripeObject(transfer) as Record<string, unknown>,
        reversals: (transfer.reversals?.data || []).map(compactStripeObject),
      })),
      application_fee: compactStripeObject(applicationFee),
      dispute: compactStripeObject(stripeDispute),
      balance_transactions: balanceTransactions.map(compactStripeObject),
      normalized_money_flow_status: normalized,
      stripe_raw_redacted: redactedRaw,
      synced_by_admin_id: admin.userId,
      error_code: null,
      error_message: null,
    })
    .select("*")
    .single();

  if (insertError) return json({ error: "snapshot_insert_failed", detail: insertError.message }, 500);

  return json({ ok: true, snapshot });
});
