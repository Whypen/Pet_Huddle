import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
const phase5ExecutionEnabled = false;

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
    live_money_movement_enabled: false,
    phase: "phase_5_approval_scaffold",
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
      { type: "refund_owner", enabled: false, amount: ownerRefund },
      { type: "transfer_carer", enabled: false, amount: carerPayout },
      { type: "retain_platform", enabled: false, amount: platformRetained },
    ],
    note: "Live money movement is disabled. This prepares the execution package only.",
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
    .select("id,synced_at,payment_intent_id,error_code,error_message")
    .eq("service_chat_id", lock.service_chat_id)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latestSnapshot?.id) return json({ error: "latest_stripe_sync_required" }, 409);
  if (latestSnapshot.error_code || latestSnapshot.error_message) return json({ error: "latest_stripe_sync_failed" }, 409);
  if (latestSnapshot.payment_intent_id !== lock.payment_intent_id) return json({ error: "stripe_snapshot_payment_intent_mismatch" }, 409);

  const requestedAction = clean(decision.decision_type);
  const activeMode = requestedMode === "live" ? "live_disabled" : "dry_run";
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

  const attempt = existingAttempt || null;
  const { data: approvals } = await supabase
    .from("care_money_flow_execution_approvals")
    .select("approval_role,approval_status,approver_admin_id")
    .eq("execution_lock_id", executionLockId)
    .eq("execution_attempt_id", attempt?.id || "00000000-0000-0000-0000-000000000000");
  const approvalReadiness = buildApprovalReadiness((approvals || []) as Array<Record<string, unknown>>, attempt as Record<string, unknown> | null);
  const plan = buildActionPlan(lock as Record<string, unknown>, attempt as Record<string, unknown> | null, approvalReadiness);

  if (requestedMode === "dry_run") {
    if (attempt) return json({ ok: true, status: attempt.status, attempt, stripe_action_plan: attempt.stripe_action_plan || plan });
    const { data: inserted, error: insertError } = await supabase
      .from("care_money_flow_execution_attempts")
      .insert({
        service_chat_id: lock.service_chat_id,
        decision_id: lock.decision_id,
        execution_lock_id: lock.id,
        payment_intent_id: lock.payment_intent_id,
        requested_by_admin_id: admin.userId,
        execution_mode: "dry_run",
        requested_action: requestedAction,
        idempotency_key: `care-exec-edge:${lock.id}:${requestedAction}:${crypto.randomUUID()}`,
        owner_refund_amount: lock.owner_refund_amount,
        carer_payout_amount: lock.carer_payout_amount,
        platform_retained_amount: lock.platform_retained_amount,
        currency: lock.currency,
        preflight_result: {
          ok: true,
          checked_at: new Date().toISOString(),
          latest_stripe_sync_snapshot_id: latestSnapshot.id,
          edge_preflight: true,
        },
        stripe_action_plan: plan,
        status: "dry_run_passed",
      })
      .select("*")
      .single();
    if (insertError) return json({ error: "execution_attempt_insert_failed", detail: insertError.message }, 500);
    return json({ ok: true, status: "dry_run_passed", attempt: inserted, stripe_action_plan: plan });
  }

  if (!liveExecutionEnabled || !phase5ExecutionEnabled) {
    const { data: inserted, error: insertError } = await supabase
      .from("care_money_flow_execution_attempts")
      .insert({
        service_chat_id: lock.service_chat_id,
        decision_id: lock.decision_id,
        execution_lock_id: lock.id,
        payment_intent_id: lock.payment_intent_id,
        requested_by_admin_id: admin.userId,
        execution_mode: "live_disabled",
        requested_action: requestedAction,
        idempotency_key: `care-exec-live-disabled:${lock.id}:${requestedAction}:${crypto.randomUUID()}`,
        owner_refund_amount: lock.owner_refund_amount,
        carer_payout_amount: lock.carer_payout_amount,
        platform_retained_amount: lock.platform_retained_amount,
        currency: lock.currency,
        preflight_result: {
          ok: false,
          blocked: true,
          checked_at: new Date().toISOString(),
          latest_stripe_sync_snapshot_id: latestSnapshot.id,
          reason: "live_money_movement_disabled",
        },
        stripe_action_plan: plan,
        status: "live_disabled",
        error_code: "live_money_movement_disabled",
        error_message: "Live money movement is disabled. This prepares the execution package only.",
      })
      .select("*")
      .single();
    if (insertError) return json({ error: "execution_attempt_insert_failed", detail: insertError.message }, 500);
    return json({ ok: false, status: "live_disabled", attempt: inserted, stripe_action_plan: plan }, 409);
  }

  return json({ ok: false, status: "blocked", error: "phase_5_live_execution_not_enabled" }, 501);
});
