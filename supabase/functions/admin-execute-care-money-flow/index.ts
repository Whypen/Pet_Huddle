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
const liveExecutionEnabled = Deno.env.get("CARE_MONEY_FLOW_LIVE_EXECUTION_ENABLED") === "true";
// Phase 7 ships the live Stripe code path, but this internal release flag keeps it unreachable until Phase 8 approval.
const phase5ExecutionEnabled = false;
const STRIPE_SYNC_STALE_MS = 30 * 60 * 1000;

const supabase = createClient(supabaseUrl, serviceKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (value: unknown) => String(value || "").trim();
const bearerToken = (req: Request) => clean(req.headers.get("Authorization")).replace(/^Bearer\s+/i, "");

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

const money = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0;
};

const toCents = (value: unknown) => Math.round(money(value) * 100);

const stripeSecrets = () => [
  Deno.env.get("STRIPE_SECRET_KEY") || "",
  Deno.env.get("STRIPE_TEST_SECRET_KEY") || "",
  Deno.env.get("STRIPE_LIVE_SECRET_KEY") || "",
].map((value) => value.trim()).filter(Boolean);

const makeStripe = (secret: string) => new Stripe(secret, { apiVersion: "2023-10-16" });

const redactStripeObject = (value: unknown): unknown => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactStripeObject);
  const source = value as Record<string, unknown>;
  const blocked = new Set([
    "client_secret",
    "receipt_email",
    "billing_details",
    "payment_method_details",
    "source",
    "card",
    "bank_account",
  ]);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !blocked.has(key))
      .map(([key, item]) => [key, redactStripeObject(item)]),
  );
};

const isActiveStripeDispute = (snapshot: Record<string, unknown> | null) => {
  const dispute = (snapshot?.dispute || null) as Record<string, unknown> | null;
  const status = clean(dispute?.status).toLowerCase();
  return Boolean(status && !["lost", "won", "warning_closed", "needs_response_resolved", "closed"].includes(status));
};

const buildApprovalReadiness = (approvals: Array<Record<string, unknown>>, attempt: Record<string, unknown> | null) => {
  const approved = approvals.filter((approval) => approval.approval_status === "approved");
  const makerApprovals = approved.filter((approval) => approval.approval_role === "maker");
  const checkerApprovals = approved.filter((approval) => ["checker", "finance_admin"].includes(clean(approval.approval_role)));
  const approverIds = new Set(approved.map((approval) => clean(approval.approver_admin_id)).filter(Boolean));
  const rejectedCount = approvals.filter((approval) => approval.approval_status === "rejected").length;
  const preflightOk = Boolean((attempt?.preflight_result as { ok?: boolean } | undefined)?.ok);
  const ok = preflightOk && approved.length >= 2 && makerApprovals.length > 0 && checkerApprovals.length > 0 && approverIds.size >= 2 && rejectedCount === 0;
  return {
    ok,
    approved_for_future_live_execution: ok,
    approval_count: approved.length,
    maker_approved: makerApprovals.length > 0,
    checker_approved: checkerApprovals.length > 0,
    distinct_approver_count: approverIds.size,
    rejected_count: rejectedCount,
    live_money_movement_enabled: false,
  };
};

const buildActionPlan = (
  lock: Record<string, unknown>,
  attempt: Record<string, unknown> | null,
  approvalReadiness: Record<string, unknown>,
) => {
  const ownerRefund = money(lock.owner_refund_amount);
  const carerPayout = money(lock.carer_payout_amount);
  const platformRetained = money(lock.platform_retained_amount);
  return {
    live_money_movement_enabled: liveExecutionEnabled && phase5ExecutionEnabled,
    phase: "phase_7_live_execution_scaffold",
    approval_readiness: approvalReadiness,
    requested_action: clean(attempt?.requested_action) || clean(lock.decision_type),
    payment_intent_id: clean(lock.payment_intent_id),
    currency: clean(lock.currency) || "HKD",
    amounts: {
      owner_refund: ownerRefund,
      carer_payout: carerPayout,
      platform_retained: platformRetained,
      total_locked: Number((ownerRefund + carerPayout + platformRetained).toFixed(2)),
    },
    stripe_steps: [
      { type: "refund_owner", enabled: liveExecutionEnabled && phase5ExecutionEnabled && ownerRefund > 0, amount: ownerRefund },
      { type: "transfer_carer", enabled: liveExecutionEnabled && phase5ExecutionEnabled && carerPayout > 0, amount: carerPayout },
      { type: "retain_platform", enabled: false, amount: platformRetained },
    ],
    idempotency_keys: {
      combined: clean(attempt?.idempotency_key) || null,
      refund: clean(attempt?.idempotency_key) ? `${clean(attempt?.idempotency_key)}:refund` : null,
      transfer: clean(attempt?.idempotency_key) ? `${clean(attempt?.idempotency_key)}:transfer` : null,
    },
    note: liveExecutionEnabled && phase5ExecutionEnabled
      ? "Live execution code path is enabled for this request after preflight."
      : "Live money movement is disabled. This prepares the execution package only.",
  };
};

const createExecutionAttempt = async (
  lock: Record<string, unknown>,
  adminUserId: string,
  executionMode: "dry_run" | "live_disabled" | "live",
  requestedAction: string,
  status: string,
  preflight: Record<string, unknown>,
  plan: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => {
  const { data, error } = await supabase
    .from("care_money_flow_execution_attempts")
    .insert({
      service_chat_id: lock.service_chat_id,
      decision_id: lock.decision_id,
      execution_lock_id: lock.id,
      payment_intent_id: lock.payment_intent_id,
      requested_by_admin_id: adminUserId,
      execution_mode: executionMode,
      requested_action: requestedAction,
      idempotency_key: `care-exec:${executionMode}:${lock.id}:${requestedAction}:${crypto.randomUUID()}`,
      owner_refund_amount: lock.owner_refund_amount,
      carer_payout_amount: lock.carer_payout_amount,
      platform_retained_amount: lock.platform_retained_amount,
      currency: lock.currency,
      preflight_result: preflight,
      stripe_action_plan: plan,
      status,
      live_execution_enabled_at_request: liveExecutionEnabled && phase5ExecutionEnabled,
      ...extra,
    })
    .select("*")
    .single();
  return { data, error };
};

const updateAttempt = async (attemptId: string, patch: Record<string, unknown>) => {
  const { data, error } = await supabase
    .from("care_money_flow_execution_attempts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", attemptId)
    .select("*")
    .single();
  return { data, error };
};

const runLiveStripeExecution = async (
  lock: Record<string, unknown>,
  decision: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  attempt: Record<string, unknown>,
) => {
  const action = clean(decision.decision_type);
  const refundCents = toCents(lock.owner_refund_amount);
  const transferCents = toCents(lock.carer_payout_amount);
  const currency = clean(lock.currency).toLowerCase() || "hkd";
  const paymentIntentId = clean(lock.payment_intent_id);
  const secrets = stripeSecrets();
  if (secrets.length === 0) throw new Error("stripe_secret_missing");

  let stripe: Stripe | null = null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  let lastError = "";
  for (const secret of secrets) {
    try {
      const client = makeStripe(secret);
      const intent = await client.paymentIntents.retrieve(paymentIntentId);
      stripe = client;
      paymentIntent = intent;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!stripe || !paymentIntent) throw new Error(`payment_intent_retrieve_failed:${lastError}`);

  const chargeId = typeof paymentIntent.latest_charge === "string"
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id || clean((snapshot.charge_id as string | undefined));
  const connectedAccountId = clean(paymentIntent.metadata?.provider_stripe_account_id)
    || clean((snapshot.stripe_raw_redacted as Record<string, unknown> | undefined)?.provider_stripe_account_id);
  const baseKey = clean(attempt.idempotency_key);
  const stripeResponse: Record<string, unknown> = {};
  let refundId: string | null = null;
  let transferId: string | null = null;

  if (action === "no_action_monitor") {
    return {
      status: "no_action_confirmed",
      stripe_refund_id: null,
      stripe_transfer_id: null,
      stripe_response_redacted: { no_action_confirmed: true },
    };
  }

  if (action === "manual_review") {
    return {
      status: "manual_review_required",
      stripe_refund_id: null,
      stripe_transfer_id: null,
      stripe_response_redacted: { manual_review_required: true },
    };
  }

  if (refundCents > 0 && ["full_refund_owner", "partial_refund_owner", "split_refund_and_partial_payout"].includes(action)) {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntent.id,
        amount: refundCents,
        metadata: {
          service_chat_id: clean(lock.service_chat_id),
          decision_id: clean(lock.decision_id),
          execution_lock_id: clean(lock.id),
          action,
        },
      },
      { idempotencyKey: `${baseKey}:refund` },
    );
    refundId = refund.id;
    stripeResponse.refund = redactStripeObject(refund);
  }

  if (transferCents > 0 && ["release_payout_to_carer", "split_refund_and_partial_payout"].includes(action)) {
    if (!connectedAccountId) throw new Error("missing_provider_connected_account_id");
    const transfer = await stripe.transfers.create(
      {
        amount: transferCents,
        currency,
        destination: connectedAccountId,
        transfer_group: `service_chat_${clean(lock.service_chat_id)}`,
        ...(chargeId ? { source_transaction: chargeId } : {}),
        metadata: {
          service_chat_id: clean(lock.service_chat_id),
          decision_id: clean(lock.decision_id),
          execution_lock_id: clean(lock.id),
          action,
        },
      },
      { idempotencyKey: `${baseKey}:transfer` },
    );
    transferId = transfer.id;
    stripeResponse.transfer = redactStripeObject(transfer);
  }

  return {
    status: refundId && transferId ? "execution_succeeded" : "execution_succeeded",
    stripe_refund_id: refundId,
    stripe_transfer_id: transferId,
    stripe_response_redacted: stripeResponse,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !serviceKey) return json({ error: "server_not_configured" }, 500);

  const admin = await isAdmin(bearerToken(req));
  if (!admin.ok) return json({ error: "admin_required" }, 403);

  const payload = await req.json().catch(() => ({} as Record<string, unknown>));
  const executionLockId = clean(payload.execution_lock_id);
  const requestedMode = clean(payload.execution_mode) || "dry_run";
  if (!executionLockId) return json({ error: "execution_lock_id_required" }, 400);
  if (!["dry_run", "live"].includes(requestedMode)) return json({ error: "execution_mode_invalid" }, 400);

  const { data: lock, error: lockError } = await supabase
    .from("care_money_flow_execution_locks")
    .select("*")
    .eq("id", executionLockId)
    .maybeSingle();
  if (lockError) return json({ error: "execution_lock_lookup_failed", detail: lockError.message }, 500);
  if (!lock) return json({ error: "execution_lock_not_found" }, 404);
  if (lock.lock_status !== "execution_locked") return json({ error: "execution_lock_not_active" }, 409);

  const { data: decision, error: decisionError } = await supabase
    .from("care_money_flow_admin_decisions")
    .select("*")
    .eq("id", lock.decision_id)
    .maybeSingle();
  if (decisionError) return json({ error: "decision_lookup_failed", detail: decisionError.message }, 500);
  if (!decision) return json({ error: "decision_not_found" }, 404);
  if (decision.status !== "execution_locked") return json({ error: "decision_not_execution_locked" }, 409);

  const { data: latestSnapshot } = await supabase
    .from("care_money_flow_snapshots")
    .select("id,synced_at,payment_intent_id,charge_id,dispute,stripe_raw_redacted,error_code,error_message")
    .eq("service_chat_id", lock.service_chat_id)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestSnapshot?.id) return json({ error: "latest_stripe_sync_required" }, 409);
  if (latestSnapshot.error_code || latestSnapshot.error_message) return json({ error: "latest_stripe_sync_failed" }, 409);
  if (latestSnapshot.payment_intent_id !== lock.payment_intent_id) return json({ error: "stripe_snapshot_payment_intent_mismatch" }, 409);
  const snapshotTime = latestSnapshot.synced_at ? new Date(latestSnapshot.synced_at).getTime() : 0;
  if (!snapshotTime || Date.now() - snapshotTime > STRIPE_SYNC_STALE_MS) return json({ error: "latest_stripe_sync_stale" }, 409);

  const requestedAction = clean(decision.decision_type);
  const activeMode = requestedMode === "live" ? "live" : "dry_run";
  const { data: existingAttempt } = await supabase
    .from("care_money_flow_execution_attempts")
    .select("*")
    .eq("execution_lock_id", executionLockId)
    .eq("requested_action", requestedAction)
    .eq("execution_mode", activeMode)
    .in("status", ["dry_run_passed", "live_disabled"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestPreflightAttempt } = await supabase
    .from("care_money_flow_execution_attempts")
    .select("*")
    .eq("execution_lock_id", executionLockId)
    .eq("requested_action", requestedAction)
    .eq("execution_mode", "dry_run")
    .eq("status", "dry_run_passed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const attempt = existingAttempt || latestPreflightAttempt || null;
  const { data: approvals } = await supabase
    .from("care_money_flow_execution_approvals")
    .select("approval_role,approval_status,approver_admin_id")
    .eq("execution_lock_id", executionLockId)
    .eq("execution_attempt_id", attempt?.id || "00000000-0000-0000-0000-000000000000");
  const approvalReadiness = buildApprovalReadiness((approvals || []) as Array<Record<string, unknown>>, attempt as Record<string, unknown> | null);
  const plan = buildActionPlan(lock as Record<string, unknown>, attempt as Record<string, unknown> | null, approvalReadiness);
  const amountsTotal = Number((money(lock.owner_refund_amount) + money(lock.carer_payout_amount) + money(lock.platform_retained_amount)).toFixed(2));
  const lockedTotal = Number(money(lock.owner_refund_amount) + money(lock.carer_payout_amount) + money(lock.platform_retained_amount));
  const preflightErrors = [
    !clean(lock.payment_intent_id) ? "missing_payment_intent_id" : null,
    !clean(attempt?.idempotency_key) && requestedMode === "live" ? "idempotency_key_required" : null,
    isActiveStripeDispute(latestSnapshot as Record<string, unknown>) && requestedAction !== "manual_review" ? "active_stripe_dispute" : null,
    Math.abs(amountsTotal - lockedTotal) > 0.01 ? "amount_mismatch" : null,
    requestedMode === "live" && !approvalReadiness.approved_for_future_live_execution ? "maker_checker_approval_required" : null,
  ].filter(Boolean);
  const preflight = {
    ok: preflightErrors.length === 0,
    errors: preflightErrors,
    checked_at: new Date().toISOString(),
    latest_stripe_sync_snapshot_id: latestSnapshot.id,
    approval_readiness: approvalReadiness,
    live_money_movement_enabled: liveExecutionEnabled && phase5ExecutionEnabled,
  };

  if (requestedMode === "dry_run") {
    if (attempt) return json({ ok: true, status: attempt.status, attempt, stripe_action_plan: attempt.stripe_action_plan || plan });
    const { data: inserted, error: insertError } = await createExecutionAttempt(
      lock as Record<string, unknown>,
      admin.userId,
      "dry_run",
      requestedAction,
      preflightErrors.length > 0 ? "dry_run_blocked" : "dry_run_passed",
      { ...preflight, edge_preflight: true },
      plan,
      preflightErrors.length > 0 ? { error_code: "execution_preflight_blocked", error_message: preflightErrors.join(", ") } : {},
    );
    if (insertError) return json({ error: "execution_attempt_insert_failed", detail: insertError.message }, 500);
    return json({ ok: preflightErrors.length === 0, status: inserted.status, attempt: inserted, stripe_action_plan: plan }, preflightErrors.length > 0 ? 409 : 200);
  }

  if (!liveExecutionEnabled || !phase5ExecutionEnabled) {
    const { data: existingLiveDisabled } = await supabase
      .from("care_money_flow_execution_attempts")
      .select("*")
      .eq("execution_lock_id", executionLockId)
      .eq("requested_action", requestedAction)
      .eq("execution_mode", "live_disabled")
      .eq("status", "live_disabled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingLiveDisabled) {
      return json({ ok: false, status: "live_disabled", attempt: existingLiveDisabled, stripe_action_plan: existingLiveDisabled.stripe_action_plan || plan }, 409);
    }
    const { data: inserted, error: insertError } = await createExecutionAttempt(
      lock as Record<string, unknown>,
      admin.userId,
      "live_disabled",
      requestedAction,
      "live_disabled",
      {
        ...preflight,
        ok: false,
        blocked: true,
        reason: "live_money_movement_disabled",
      },
      plan,
      {
        error_code: "live_money_movement_disabled",
        error_message: "Live money movement is disabled. This prepares the execution package only.",
      },
    );
    if (insertError) return json({ error: "execution_attempt_insert_failed", detail: insertError.message }, 500);
    return json({ ok: false, status: "live_disabled", attempt: inserted, stripe_action_plan: plan }, 409);
  }

  if (preflightErrors.length > 0) {
    const { data: inserted, error: insertError } = await createExecutionAttempt(
      lock as Record<string, unknown>,
      admin.userId,
      "live",
      requestedAction,
      "blocked",
      preflight,
      plan,
      { error_code: "execution_preflight_blocked", error_message: preflightErrors.join(", ") },
    );
    if (insertError) return json({ error: "execution_attempt_insert_failed", detail: insertError.message }, 500);
    return json({ ok: false, status: "blocked", attempt: inserted, stripe_action_plan: plan }, 409);
  }

  const { data: started, error: startedError } = await createExecutionAttempt(
    lock as Record<string, unknown>,
    admin.userId,
    "live",
    requestedAction,
    "execution_started",
    preflight,
    plan,
    { executed_by_admin_id: admin.userId, executed_at: new Date().toISOString() },
  );
  if (startedError) return json({ error: "execution_attempt_insert_failed", detail: startedError.message }, 500);

  try {
    const result = await runLiveStripeExecution(
      lock as Record<string, unknown>,
      decision as Record<string, unknown>,
      latestSnapshot as Record<string, unknown>,
      started as Record<string, unknown>,
    );
    const { data: completed, error: completedError } = await updateAttempt(started.id, {
      status: result.status,
      stripe_refund_id: result.stripe_refund_id,
      stripe_transfer_id: result.stripe_transfer_id,
      stripe_response_redacted: result.stripe_response_redacted,
      execution_completed_at: new Date().toISOString(),
    });
    if (completedError) return json({ error: "execution_attempt_update_failed", detail: completedError.message }, 500);
    return json({ ok: true, status: result.status, attempt: completed, stripe_action_plan: plan });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { data: failed } = await updateAttempt(started.id, {
      status: "execution_failed",
      error_code: "stripe_execution_error",
      error_message: message,
      execution_completed_at: new Date().toISOString(),
    });
    return json({ ok: false, status: "execution_failed", attempt: failed, error: "stripe_execution_error" }, 502);
  }
});
