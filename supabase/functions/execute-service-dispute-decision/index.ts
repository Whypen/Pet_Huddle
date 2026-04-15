import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-huddle-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") as string,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string,
);

const stripeDefaultSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
const stripeTestSecret = Deno.env.get("STRIPE_TEST_SECRET_KEY") || "";
const stripeLiveSecret = Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "";
const stripeMode = String(Deno.env.get("STRIPE_MODE") || "").trim().toLowerCase();

type DecisionAction = "release_full" | "partial_refund" | "full_refund";

type DisputeRow = {
  id: string;
  service_chat_id: string;
  status: string;
  admin_notes: string | null;
  decision_action: string | null;
  decision_note: string | null;
  decision_payload: Record<string, unknown> | null;
  decision_actor_id: string | null;
  decision_at: string | null;
  decision_version: number | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_connected_account_id: string | null;
  stripe_transfer_id: string | null;
  stripe_refund_id: string | null;
  stripe_idempotency_key: string | null;
  stripe_action_status: string | null;
  stripe_error_code: string | null;
  stripe_error_message: string | null;
  executed_by: string | null;
  executed_at: string | null;
  final_provider_receives_amount: number | null;
  final_customer_refund_amount: number | null;
  final_huddle_retained_amount: number | null;
};

type ServiceChatRow = {
  id: string;
  chat_id: string;
  requester_id: string;
  provider_id: string;
  status: string;
  quote_card: Record<string, unknown> | null;
  request_card: Record<string, unknown> | null;
  stripe_payment_intent_id: string | null;
  payout_release_requested_at: string | null;
  payout_released_at: string | null;
};

type NotificationTarget = {
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  data: Record<string, unknown>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asMoney = (value: number) => Math.max(Number(value.toFixed(2)), 0);
const toCents = (value: number) => Math.round(asMoney(value) * 100);

const pickStripeSecrets = (): string[] => {
  const ordered = stripeMode === "test"
    ? [stripeTestSecret, stripeDefaultSecret, stripeLiveSecret]
    : [stripeLiveSecret, stripeDefaultSecret, stripeTestSecret];
  const candidates = ordered.filter((v) => v.length > 0);
  return [...new Set(candidates)];
};

const makeStripeClient = (secret: string): Stripe =>
  new Stripe(secret, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const isAdminProfile = (profile: { is_admin?: boolean | null; user_role?: string | null } | null) =>
  Boolean(profile?.is_admin) || String(profile?.user_role || "").toLowerCase() === "admin";

const isJwt = (value: string) => value.split(".").length === 3;

const extractUserToken = (req: Request, body: Record<string, unknown>) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const huddleToken = req.headers.get("x-huddle-access-token") ?? "";
  const bodyToken = String(body.access_token || "").trim();
  const candidates = [
    bodyToken,
    huddleToken.replace(/^Bearer\s+/i, "").trim(),
    authHeader.replace(/^Bearer\s+/i, "").trim(),
  ].filter((v) => v.length > 0);

  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const serviceRole = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  return candidates.find((token) => isJwt(token) && token !== anonKey && token !== serviceRole) || null;
};

const normalizeCurrency = (currency: string | null | undefined): string => {
  const normalized = String(currency || "").trim().toLowerCase();
  if (!normalized) return "hkd";
  return normalized;
};

const unresolvedStatuses = new Set(["open", "awaiting_evidence", "under_review", "decision_ready"]);

const buildOutcomeNotifications = (
  action: DecisionAction,
  serviceChat: ServiceChatRow,
  dispute: DisputeRow,
  decisionVersion: number,
  money: Record<string, unknown>,
): NotificationTarget[] => {
  const href = `/chats?tab=service&room=${serviceChat.chat_id}`;
  const executionKey = `dispute:${dispute.id}:v${decisionVersion}:${action}`;
  const baseData = {
    dispute_id: dispute.id,
    service_chat_id: serviceChat.chat_id,
    decision_action: action,
    decision_version: decisionVersion,
    dispute_execution_key: executionKey,
    money,
  };

  if (action === "release_full") {
    return [
      {
        userId: serviceChat.requester_id,
        kind: "service_dispute_resolved_release_full",
        title: "Dispute resolved",
        body: "Decision recorded: payout released to provider. No refund was issued.",
        href,
        data: { ...baseData, audience: "requester" },
      },
      {
        userId: serviceChat.provider_id,
        kind: "service_dispute_resolved_release_full",
        title: "Dispute resolved",
        body: "Decision recorded: payout released to your account.",
        href,
        data: { ...baseData, audience: "provider" },
      },
    ];
  }

  if (action === "partial_refund") {
    return [
      {
        userId: serviceChat.requester_id,
        kind: "service_dispute_resolved_partial_refund",
        title: "Dispute resolved",
        body: "Decision recorded: partial refund approved.",
        href,
        data: { ...baseData, audience: "requester" },
      },
      {
        userId: serviceChat.provider_id,
        kind: "service_dispute_resolved_partial_refund",
        title: "Dispute resolved",
        body: "Decision recorded: partial refund approved. Remaining payout was calculated.",
        href,
        data: { ...baseData, audience: "provider" },
      },
    ];
  }

  return [
    {
      userId: serviceChat.requester_id,
      kind: "service_dispute_resolved_refund_full",
      title: "Dispute resolved",
      body: "Decision recorded: full refund approved.",
      href,
      data: { ...baseData, audience: "requester" },
    },
    {
      userId: serviceChat.provider_id,
      kind: "service_dispute_resolved_refund_full",
      title: "Dispute resolved",
      body: "Decision recorded: full refund approved for requester.",
      href,
      data: { ...baseData, audience: "provider" },
    },
  ];
};

const sendOutcomeNotifications = async (
  notifications: NotificationTarget[],
) => {
  for (const notification of notifications) {
    const executionKey = String(notification.data.dispute_execution_key || "");
    if (!executionKey || !notification.userId) continue;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", notification.userId)
      .eq("type", "services")
      .contains("metadata", { dispute_execution_key: executionKey })
      .limit(1)
      .maybeSingle();

    if (existing?.id) continue;

    await supabase.rpc("service_notify", {
      p_user_id: notification.userId,
      p_kind: notification.kind,
      p_title: notification.title,
      p_body: notification.body,
      p_href: notification.href,
      p_data: notification.data,
    });
  }
};

const computeDecision = (
  action: DecisionAction,
  serviceRate: number,
  customerPlatformFee: number,
  providerPlatformFee: number,
  totalPaid: number,
  serviceRefundInput: number | null,
  waiveCustomerPlatformFee: boolean,
  waiveProviderPlatformFee: boolean,
) => {
  const waiveProviderEffective = action === "full_refund" ? false : waiveProviderPlatformFee;
  const providerFeeDeduction = waiveProviderEffective ? 0 : providerPlatformFee;

  let normalizedServiceRefundInput = 0;
  let customerRefunded = 0;
  let providerReceives = 0;
  let disputeStatus = "decision_ready";
  let auditAction = "disputes_under_review";

  if (action === "release_full") {
    customerRefunded = waiveCustomerPlatformFee ? customerPlatformFee : 0;
    providerReceives = Math.max(serviceRate - providerFeeDeduction, 0);
    disputeStatus = "resolved_release_full";
    auditAction = "disputes_release_full";
  } else if (action === "partial_refund") {
    const requested = serviceRefundInput ?? 0;
    normalizedServiceRefundInput = Math.max(Math.min(requested, serviceRate), 0);
    customerRefunded = normalizedServiceRefundInput + (waiveCustomerPlatformFee ? customerPlatformFee : 0);
    providerReceives = Math.max(serviceRate - normalizedServiceRefundInput - providerFeeDeduction, 0);
    disputeStatus = "resolved_partial_refund";
    auditAction = "disputes_partial_refund";
  } else {
    normalizedServiceRefundInput = serviceRate;
    customerRefunded = serviceRate + (waiveCustomerPlatformFee ? customerPlatformFee : 0);
    providerReceives = 0;
    disputeStatus = "resolved_refund_full";
    auditAction = "disputes_refund_full";
  }

  customerRefunded = asMoney(customerRefunded);
  providerReceives = asMoney(providerReceives);
  const huddleRetained = asMoney(Math.max(totalPaid - customerRefunded - providerReceives, 0));

  return {
    disputeStatus,
    auditAction,
    money: {
      total_paid_amount: asMoney(totalPaid),
      service_rate_amount: asMoney(serviceRate),
      customer_platform_fee_amount: asMoney(customerPlatformFee),
      provider_platform_fee_amount: asMoney(providerPlatformFee),
      platform_fee_amount: asMoney(customerPlatformFee),
      waive_customer_platform_fee: waiveCustomerPlatformFee,
      waive_provider_platform_fee: waiveProviderEffective,
      service_refund_input_amount: asMoney(normalizedServiceRefundInput),
      customer_refund_amount: customerRefunded,
      provider_receives_amount: providerReceives,
      huddle_retained_amount: huddleRetained,
    },
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const token = extractUserToken(req, payload);
    if (!token) return json({ error: "Unauthorized" }, 401);

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, is_admin, user_role, display_name, social_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!isAdminProfile(actorProfile || null)) {
      return json({ error: "Forbidden" }, 403);
    }

    const disputeId = String(payload.dispute_id || "").trim();
    const action = String(payload.action || "").trim().toLowerCase() as DecisionAction;
    const note = String(payload.note || "").trim();
    const waiveCustomerPlatformFee = Boolean(payload.waive_customer_platform_fee);
    const waiveProviderPlatformFee =
      action === "full_refund" ? false : Boolean(payload.waive_provider_platform_fee);
    const refundInputRaw = toNumber(payload.customer_refund_amount);

    if (!disputeId) return json({ error: "dispute_id_required" }, 400);
    if (!["release_full", "partial_refund", "full_refund"].includes(action)) {
      return json({ error: "invalid_action" }, 400);
    }
    if (!note) return json({ error: "admin_note_required" }, 400);
    if (action === "partial_refund" && (refundInputRaw === null || refundInputRaw < 0)) {
      return json({ error: "refund_amount_required" }, 400);
    }

    const { data: dispute, error: disputeErr } = await supabase
      .from("service_disputes")
      .select("*")
      .eq("id", disputeId)
      .maybeSingle<DisputeRow>();
    if (disputeErr) return json({ error: "dispute_lookup_failed", detail: disputeErr.message }, 500);
    if (!dispute) return json({ error: "dispute_not_found" }, 404);

    const { data: serviceChat, error: chatErr } = await supabase
      .from("service_chats")
      .select("id, chat_id, requester_id, provider_id, status, quote_card, request_card, stripe_payment_intent_id, payout_release_requested_at, payout_released_at")
      .eq("id", dispute.service_chat_id)
      .maybeSingle<ServiceChatRow>();
    if (chatErr) return json({ error: "service_chat_lookup_failed", detail: chatErr.message }, 500);
    if (!serviceChat) return json({ error: "service_chat_not_found" }, 404);

    const existingExecution = (dispute.decision_payload?.execution as Record<string, unknown> | undefined) || {};
    const alreadyExecuted =
      dispute.stripe_action_status === "succeeded" &&
      (dispute.executed_at !== null || existingExecution.executed === true);
    if (alreadyExecuted) {
      return json({
        ok: true,
        dispute_id: dispute.id,
        status: dispute.status,
        action: dispute.decision_action,
        source: "manual",
        execution: {
          executed: true,
          idempotent_replay: true,
          stripe_action_status: dispute.stripe_action_status,
          stripe_transfer_id: dispute.stripe_transfer_id,
          stripe_refund_id: dispute.stripe_refund_id,
        },
        money: dispute.decision_payload?.money || null,
      });
    }

    const priorMoney = ((dispute.decision_payload?.money as Record<string, unknown>) || {}) as Record<string, unknown>;
    const quote = (serviceChat.quote_card || {}) as Record<string, unknown>;

    const totalPaid =
      toNumber(priorMoney.total_paid_amount) ??
      toNumber(quote.finalPrice) ??
      toNumber(quote.total_paid) ??
      toNumber(quote.totalPaid) ??
      toNumber(quote.amount_total) ??
      toNumber(quote.amountTotal) ??
      0;
    const customerPlatformFee =
      toNumber(priorMoney.customer_platform_fee_amount) ??
      toNumber(priorMoney.platform_fee_amount) ??
      toNumber(quote.customer_platform_fee_amount) ??
      toNumber(quote.platform_fee_amount) ??
      toNumber(quote.platformFeeAmount) ??
      toNumber(quote.platform_fee) ??
      toNumber(quote.platformFee) ??
      0;
    const providerPlatformFee =
      toNumber(priorMoney.provider_platform_fee_amount) ??
      toNumber(quote.provider_platform_fee_amount) ??
      toNumber(quote.provider_fee) ??
      toNumber(quote.providerFee) ??
      customerPlatformFee;
    const serviceRate = toNumber(priorMoney.service_rate_amount) ?? Math.max(totalPaid - customerPlatformFee, 0);
    const currency = normalizeCurrency(
      String(
        priorMoney.currency ??
          quote.currency ??
          (serviceChat.request_card && (serviceChat.request_card as Record<string, unknown>).currency) ??
          "hkd",
      ),
    );

    const calculated = computeDecision(
      action,
      asMoney(serviceRate),
      asMoney(customerPlatformFee),
      asMoney(providerPlatformFee),
      asMoney(totalPaid),
      refundInputRaw,
      waiveCustomerPlatformFee,
      waiveProviderPlatformFee,
    );

    const paymentIntentId =
      dispute.stripe_payment_intent_id || serviceChat.stripe_payment_intent_id || (dispute.decision_payload?.stripe_context as Record<string, unknown> | undefined)?.stripe_payment_intent_id?.toString() || "";
    if (!paymentIntentId) {
      return json({ error: "missing_payment_intent_id" }, 409);
    }

    const stripeSecrets = pickStripeSecrets();
    if (stripeSecrets.length === 0) {
      return json({ error: "stripe_secret_missing" }, 500);
    }

    let stripe: Stripe | null = null;
    let paymentIntent: Stripe.PaymentIntent | null = null;
    let stripeSecretUsed = "";
    let lastStripeError = "";
    for (const secret of stripeSecrets) {
      try {
        const client = makeStripeClient(secret);
        const intent = await client.paymentIntents.retrieve(paymentIntentId);
        stripe = client;
        paymentIntent = intent;
        stripeSecretUsed = secret;
        break;
      } catch (error) {
        lastStripeError = error instanceof Error ? error.message : String(error);
      }
    }

    if (!stripe || !paymentIntent) {
      return json({ error: "payment_intent_retrieve_failed", detail: lastStripeError }, 500);
    }

    const providerStripeAccountId =
      dispute.stripe_connected_account_id ||
      String(paymentIntent.metadata?.provider_stripe_account_id || "").trim() ||
      "";
    if (!providerStripeAccountId && calculated.money.provider_receives_amount > 0) {
      return json({ error: "missing_provider_connected_account_id" }, 409);
    }

    const chargeId =
      dispute.stripe_charge_id ||
      (typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id || null);

    const transferAlreadyExists =
      Boolean(dispute.stripe_transfer_id) ||
      Boolean(serviceChat.payout_released_at) ||
      Boolean((dispute.decision_payload?.stripe_context as Record<string, unknown> | undefined)?.stripe_transfer_id);

    if ((action === "partial_refund" || action === "full_refund") && transferAlreadyExists) {
      return json({
        error: "transfer_already_created_partial_or_full_refund_blocked",
        detail: "Partial or full refund is blocked because provider transfer already exists.",
      }, 409);
    }

    const retryingSameDecision =
      Boolean(dispute.stripe_idempotency_key) &&
      dispute.decision_action === action &&
      (dispute.stripe_action_status === "failed" || dispute.stripe_action_status === "pending");
    const decisionVersion = retryingSameDecision
      ? Math.max(dispute.decision_version ?? 1, 1)
      : (dispute.decision_version ?? 0) + 1;
    const idempotencyBase = retryingSameDecision
      ? (dispute.stripe_idempotency_key as string)
      : `dispute:${dispute.id}:v${decisionVersion}:${action}`;

    const providerCents = toCents(calculated.money.provider_receives_amount);
    const refundCents = toCents(calculated.money.customer_refund_amount);
    const totalCents = toCents(calculated.money.total_paid_amount);
    if (providerCents + refundCents > totalCents) {
      return json({ error: "money_math_invalid", detail: "provider + refund exceeds total paid" }, 409);
    }

    let stripeTransferId: string | null = dispute.stripe_transfer_id;
    let stripeRefundId: string | null = dispute.stripe_refund_id;

    try {
      if (providerCents > 0 && !transferAlreadyExists) {
        const transfer = await stripe.transfers.create(
          {
            amount: providerCents,
            currency: paymentIntent.currency || currency,
            destination: providerStripeAccountId,
            transfer_group: serviceChat.chat_id ? `service_chat_${serviceChat.chat_id}` : `service_chat_${serviceChat.id}`,
            ...(chargeId ? { source_transaction: chargeId } : {}),
            metadata: {
              dispute_id: dispute.id,
              service_chat_id: serviceChat.chat_id,
              action,
            },
          },
          { idempotencyKey: `${idempotencyBase}:transfer` },
        );
        stripeTransferId = transfer.id;
      }

      if (refundCents > 0) {
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntent.id,
            amount: refundCents,
            metadata: {
              dispute_id: dispute.id,
              service_chat_id: serviceChat.chat_id,
              action,
            },
          },
          { idempotencyKey: `${idempotencyBase}:refund` },
        );
        stripeRefundId = refund.id;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase
        .from("service_disputes")
        .update({
          status: "decision_ready",
          admin_notes: note,
          decision_action: action,
          decision_note: note,
          decision_actor_id: user.id,
          decision_at: new Date().toISOString(),
          decision_version: decisionVersion,
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id: chargeId,
          stripe_connected_account_id: providerStripeAccountId || null,
          stripe_transfer_id: stripeTransferId,
          stripe_refund_id: stripeRefundId,
          stripe_idempotency_key: idempotencyBase,
          stripe_action_status: "failed",
          stripe_error_code: "stripe_execution_error",
          stripe_error_message: message,
          executed_by: user.id,
          executed_at: new Date().toISOString(),
          final_provider_receives_amount: calculated.money.provider_receives_amount,
          final_customer_refund_amount: calculated.money.customer_refund_amount,
          final_huddle_retained_amount: calculated.money.huddle_retained_amount,
          updated_at: new Date().toISOString(),
          decision_payload: {
            ...(dispute.decision_payload || {}),
            source: "manual",
            money: {
              ...calculated.money,
              currency,
            },
            execution: {
              executed: false,
              execution_mode: "live",
              stripe_action_status: "failed",
              stripe_error_message: message,
              stripe_transfer_id: stripeTransferId,
              stripe_refund_id: stripeRefundId,
              stripe_secret_used: stripeSecretUsed ? "configured" : "none",
              idempotency_key: idempotencyBase,
            },
            stripe_context: {
              stripe_payment_intent_id: paymentIntent.id,
              stripe_charge_id: chargeId,
              stripe_connected_account_id: providerStripeAccountId || null,
              stripe_transfer_id: stripeTransferId,
              stripe_refund_id: stripeRefundId,
            },
          },
        })
        .eq("id", dispute.id);

      await supabase.from("admin_audit_logs").insert({
        actor_id: user.id,
        action: `disputes_${action}_failed`,
        target_user_id: serviceChat.requester_id,
        notes: note,
        details: {
          source: "manual",
          dispute_id: dispute.id,
          service_chat_id: serviceChat.chat_id,
          decision_action: action,
          money: {
            ...calculated.money,
            currency,
          },
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id: chargeId,
          stripe_transfer_id: stripeTransferId,
          stripe_refund_id: stripeRefundId,
          idempotency_key: idempotencyBase,
          error: message,
        },
      });

      return json({ error: "stripe_execution_failed", detail: message }, 500);
    }

    const resolvedStatus = calculated.disputeStatus;
    const nowIso = new Date().toISOString();

    const decisionPayload = {
      source: "manual",
      money: {
        ...calculated.money,
        currency,
      },
      stripe_context: {
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        stripe_connected_account_id: providerStripeAccountId || null,
        stripe_transfer_id: stripeTransferId,
        stripe_refund_id: stripeRefundId,
      },
      execution: {
        executed: true,
        execution_mode: "live",
        stripe_action_status: "succeeded",
        idempotency_key: idempotencyBase,
      },
      snapshot_at: nowIso,
      decision_actor_id: user.id,
    };

    const { error: disputeUpdateErr } = await supabase
      .from("service_disputes")
      .update({
        status: resolvedStatus,
        admin_notes: note,
        decision_action: action,
        decision_note: note,
        decision_payload: decisionPayload,
        decision_actor_id: user.id,
        decision_at: nowIso,
        decision_version: decisionVersion,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        stripe_connected_account_id: providerStripeAccountId || null,
        stripe_transfer_id: stripeTransferId,
        stripe_refund_id: stripeRefundId,
        stripe_idempotency_key: idempotencyBase,
        stripe_action_status: "succeeded",
        stripe_error_code: null,
        stripe_error_message: null,
        executed_by: user.id,
        executed_at: nowIso,
        final_provider_receives_amount: calculated.money.provider_receives_amount,
        final_customer_refund_amount: calculated.money.customer_refund_amount,
        final_huddle_retained_amount: calculated.money.huddle_retained_amount,
        updated_at: nowIso,
      })
      .eq("id", dispute.id);
    if (disputeUpdateErr) return json({ error: "dispute_update_failed", detail: disputeUpdateErr.message }, 500);

    const serviceChatPatch: Record<string, unknown> = {
      status: "completed",
      updated_at: nowIso,
    };

    const providerReceives = Number(calculated.money.provider_receives_amount || 0);
    if (action === "full_refund" || providerReceives <= 0) {
      serviceChatPatch.payout_release_requested_at = null;
      serviceChatPatch.payout_released_at = null;
      serviceChatPatch.payout_release_attempted_at = null;
      serviceChatPatch.payout_release_lock_token = null;
      serviceChatPatch.payout_release_locked_at = null;
    } else {
      serviceChatPatch.payout_release_requested_at = serviceChat.payout_release_requested_at || nowIso;
      serviceChatPatch.payout_released_at = serviceChat.payout_released_at || nowIso;
      serviceChatPatch.payout_release_attempted_at = nowIso;
      serviceChatPatch.payout_release_lock_token = null;
      serviceChatPatch.payout_release_locked_at = null;
    }

    const { error: chatUpdateErr } = await supabase
      .from("service_chats")
      .update(serviceChatPatch)
      .eq("id", serviceChat.id);
    if (chatUpdateErr) return json({ error: "service_chat_update_failed", detail: chatUpdateErr.message }, 500);

    const messagePayload = {
      kind: "service_dispute_resolved",
      action,
      dispute_id: dispute.id,
      decision_status: resolvedStatus,
      money: {
        ...calculated.money,
        currency,
      },
      decided_by: user.id,
      decided_at: nowIso,
    };
    await supabase.from("chat_messages").insert({
      chat_id: serviceChat.chat_id,
      sender_id: user.id,
      content: JSON.stringify(messagePayload),
    });

    await supabase
      .from("chats")
      .update({ last_message_at: nowIso })
      .eq("id", serviceChat.chat_id);

    const { error: auditErr } = await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: calculated.auditAction,
      target_user_id: serviceChat.requester_id,
      notes: note,
      details: {
        source: "manual",
        dispute_id: dispute.id,
        service_chat_id: serviceChat.chat_id,
        decision_action: action,
        decision_status: resolvedStatus,
        money: {
          ...calculated.money,
          currency,
        },
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        stripe_connected_account_id: providerStripeAccountId || null,
        stripe_transfer_id: stripeTransferId,
        stripe_refund_id: stripeRefundId,
        idempotency_key: idempotencyBase,
        executed_by: user.id,
        executed_at: nowIso,
      },
    });
    if (auditErr) return json({ error: "audit_write_failed", detail: auditErr.message }, 500);

    const outcomeNotifications = buildOutcomeNotifications(
      action,
      serviceChat,
      dispute,
      decisionVersion,
      {
        ...calculated.money,
        currency,
      },
    );
    await sendOutcomeNotifications(outcomeNotifications);

    return json({
      ok: true,
      dispute_id: dispute.id,
      status: resolvedStatus,
      action,
      source: "manual",
      money: {
        ...calculated.money,
        currency,
      },
      execution: {
        executed: true,
        stripe_action_status: "succeeded",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_charge_id: chargeId,
        stripe_transfer_id: stripeTransferId,
        stripe_refund_id: stripeRefundId,
        idempotency_key: idempotencyBase,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[execute-service-dispute-decision] failed:", message);
    return json({ error: "internal_error", detail: message }, 500);
  }
});
