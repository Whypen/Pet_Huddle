import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type CareMoneyFlowStatus =
  | "paid_pending_care"
  | "care_in_progress_hold"
  | "completed_pending_payout"
  | "payout_released"
  | "disputed_hold"
  | "refund_full_succeeded"
  | "refund_partial_succeeded"
  | "refund_pending"
  | "stripe_failed"
  | "manual_review_required";

type CareTransactionRow = {
  service_chat_id: string;
  chat_id: string;
  owner_id: string;
  owner_name: string | null;
  owner_social_id: string | null;
  carer_id: string;
  carer_name: string | null;
  carer_social_id: string | null;
  booking_status: string | null;
  dispute_status: string | null;
  normalized_money_flow_status: CareMoneyFlowStatus;
  total_paid: number | null;
  service_rate: number | null;
  owner_refunded: number | null;
  carer_receives: number | null;
  platform_fee_gross: number | null;
  stripe_fee: number | null;
  platform_net_retained: number | null;
  currency: string | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  refund_ids: string[] | null;
  transfer_id: string | null;
  transfer_reversal_id: string | null;
  application_fee_id: string | null;
  dispute_id: string | null;
  connected_account_id: string | null;
  stripe_connect_model: string | null;
  db_updated_at: string | null;
  stripe_synced_at: string | null;
  booked_service_hours: number | null;
  actual_service_hours: number | null;
  service_started_at: string | null;
  service_scheduled_end_at: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  dispute_raised_at: string | null;
  service_duration_source: "completed" | "dispute" | "unavailable" | string | null;
};

type CareDecisionType =
  | "no_action_monitor"
  | "full_refund_owner"
  | "partial_refund_owner"
  | "release_payout_to_carer"
  | "split_refund_and_partial_payout"
  | "manual_review";

type CareDecisionStatus =
  | "draft"
  | "submitted"
  | "blocked"
  | "ready_for_execution"
  | "execution_locked"
  | "execution_cancelled"
  | "execution_superseded"
  | "executed_reserved";

type CareQueueFilter = "all" | "needs_sync" | "blocked" | "ready_for_execution" | "locked";

type CareExecutionAttemptStatus =
  | "dry_run_passed"
  | "dry_run_blocked"
  | "live_disabled"
  | "blocked"
  | "failed";

type CareApprovalStatus = "approved" | "rejected" | "revoked";
type CareApprovalRole = "maker" | "checker" | "finance_admin";

type CareDecisionRow = {
  id: string;
  service_chat_id: string;
  payment_intent_id: string | null;
  admin_id: string;
  admin_name: string | null;
  decision_type: CareDecisionType;
  decision_reason: string;
  admin_note: string;
  proposed_owner_refund: number;
  proposed_carer_payout: number;
  proposed_platform_retained: number;
  currency: string;
  dry_run_result: CareDecisionValidation | null;
  status: CareDecisionStatus;
  submitted_by_admin_id?: string | null;
  submitted_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by_admin_id?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
};

type CareExecutionQueueRow = {
  service_chat_id: string;
  decision_id: string;
  lock_id: string | null;
  payment_intent_id: string | null;
  decision_type: CareDecisionType;
  decision_status: CareDecisionStatus;
  lock_status: CareDecisionStatus | null;
  owner_refund_amount: number;
  carer_payout_amount: number;
  platform_retained_amount: number;
  currency: string;
  stripe_sync_snapshot_id: string | null;
  stripe_synced_at: string | null;
  validation_result: CareDecisionValidation | null;
  decision_admin_id: string;
  decision_admin_name: string | null;
  locked_by_admin_id: string | null;
  locked_by_admin_name: string | null;
  locked_at: string | null;
  latest_execution_attempt_id: string | null;
  latest_execution_attempt_status: CareExecutionAttemptStatus | null;
  latest_execution_mode: "dry_run" | "live_disabled" | string | null;
  latest_requested_action: string | null;
  latest_preflight_result: Record<string, unknown> | null;
  latest_stripe_action_plan: Record<string, unknown> | null;
  latest_execution_attempt_created_at: string | null;
  approval_count?: number | null;
  maker_approved?: boolean | null;
  checker_approved?: boolean | null;
  rejected_count?: number | null;
  approved_for_future_live_execution?: boolean | null;
  approval_readiness?: CareApprovalReadiness | null;
  created_at: string;
  updated_at: string;
};

type CareApprovalRow = {
  id: string;
  service_chat_id: string;
  decision_id: string;
  execution_lock_id: string;
  execution_attempt_id: string;
  approver_admin_id: string;
  approver_admin_name: string | null;
  approval_role: CareApprovalRole;
  approval_status: CareApprovalStatus;
  approval_note: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type CareApprovalReadiness = {
  ok?: boolean;
  approved_for_future_live_execution?: boolean;
  errors?: string[];
  warnings?: string[];
  approval_count?: number;
  maker_approved?: boolean;
  checker_approved?: boolean;
  distinct_approver_count?: number;
  rejected_count?: number;
  latest_execution_attempt_id?: string | null;
  latest_attempt_status?: string | null;
  latest_stripe_sync_snapshot_id?: string | null;
  latest_stripe_synced_at?: string | null;
  checked_at?: string | null;
  live_money_movement_enabled?: boolean;
};

type CareDecisionValidation = {
  ok?: boolean;
  status?: CareDecisionStatus;
  manual_review_required?: boolean;
  errors?: string[];
  warnings?: string[];
  preview?: {
    currency?: string;
    total_paid?: number;
    owner_refund?: number;
    carer_payout?: number;
    platform_retained?: number;
    balance_delta?: number;
  };
  service_duration?: {
    booked_service_hours?: number | null;
    actual_service_hours?: number | null;
    service_duration_source?: string | null;
    service_started_at?: string | null;
    service_scheduled_end_at?: string | null;
    checked_in_at?: string | null;
    completed_at?: string | null;
    dispute_raised_at?: string | null;
  };
  db_state?: Record<string, unknown>;
  stripe_state?: Record<string, unknown>;
};

const ADMIN_EMAIL_ALLOWLIST = new Set([
  "hello@huddle.pet",
  "support@huddle.pet",
  "hyphen@huddle.pet",
]);

const decisionTypeLabel: Record<CareDecisionType, string> = {
  no_action_monitor: "No action / monitor",
  full_refund_owner: "Full refund owner",
  partial_refund_owner: "Partial refund owner",
  release_payout_to_carer: "Release payout to carer",
  split_refund_and_partial_payout: "Split refund and partial payout",
  manual_review: "Manual review",
};

const decisionReasonLabel: Record<string, string> = {
  care_quality: "Care quality",
  owner_cancelled: "Owner cancellation",
  carer_no_show: "Carer no-show",
  unsafe_or_policy: "Safety or policy",
  stripe_dispute: "Stripe dispute",
  admin_adjustment: "Admin adjustment",
  other: "Other",
};

const lifecycleSteps: CareDecisionStatus[] = ["draft", "submitted", "ready_for_execution", "execution_locked"];

const lifecycleLabel: Record<CareDecisionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  blocked: "Blocked",
  ready_for_execution: "Ready",
  execution_locked: "Locked",
  execution_cancelled: "Cancelled",
  execution_superseded: "Superseded",
  executed_reserved: "Reserved",
};

const executionAttemptLabel: Record<CareExecutionAttemptStatus, string> = {
  dry_run_passed: "Dry run passed",
  dry_run_blocked: "Blocked",
  live_disabled: "Live execution disabled",
  blocked: "Blocked",
  failed: "Failed",
};

const approvalRoleLabel: Record<CareApprovalRole, string> = {
  maker: "Maker",
  checker: "Checker",
  finance_admin: "Finance admin",
};

const approvalStatusLabel: Record<CareApprovalStatus, string> = {
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Revoked",
};

const statusLabel: Record<CareMoneyFlowStatus, string> = {
  paid_pending_care: "Paid, pending care",
  care_in_progress_hold: "Care in progress, payout hold",
  completed_pending_payout: "Completed, pending payout",
  payout_released: "Payout released",
  disputed_hold: "Dispute hold",
  refund_full_succeeded: "Full refund",
  refund_partial_succeeded: "Partial refund",
  refund_pending: "Refund pending",
  stripe_failed: "Stripe failed",
  manual_review_required: "Manual review required",
};

const statusClass: Record<CareMoneyFlowStatus, string> = {
  paid_pending_care: "border-blue-200 bg-blue-50 text-blue-800",
  care_in_progress_hold: "border-blue-200 bg-blue-50 text-blue-800",
  completed_pending_payout: "border-amber-200 bg-amber-50 text-amber-900",
  payout_released: "border-emerald-200 bg-emerald-50 text-emerald-800",
  disputed_hold: "border-red-200 bg-red-50 text-red-800",
  refund_full_succeeded: "border-slate-300 bg-slate-100 text-slate-700",
  refund_partial_succeeded: "border-purple-200 bg-purple-50 text-purple-800",
  refund_pending: "border-amber-200 bg-amber-50 text-amber-900",
  stripe_failed: "border-red-300 bg-red-50 text-red-900",
  manual_review_required: "border-orange-200 bg-orange-50 text-orange-900",
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
};

const formatMoney = (currency: string | null | undefined, value: number | null | undefined) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const code = (currency || "HKD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-HK", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${code} ${safe.toFixed(2)}`;
  }
};

const compactId = (value: string | null | undefined) => {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
};

const formatHours = (value: number | null | undefined) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return `${parsed.toFixed(1)}h`;
};

const toMoneyNumber = (value: string | number | null | undefined) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value || "0"));
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
};

const createIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const Field = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div className="min-w-0 rounded-lg border bg-muted/20 p-2">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 break-words font-mono text-xs text-foreground">{value ?? "-"}</div>
  </div>
);

const AdminCare = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<CareTransactionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncAll, setSyncAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSending, setMessageSending] = useState<"owner" | "carer" | "both" | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSuccess, setMessageSuccess] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<CareDecisionRow[]>([]);
  const [decisionType, setDecisionType] = useState<CareDecisionType>("no_action_monitor");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [ownerRefundInput, setOwnerRefundInput] = useState("0.00");
  const [carerPayoutInput, setCarerPayoutInput] = useState("0.00");
  const [decisionBusy, setDecisionBusy] = useState<"validate" | "save" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<CareDecisionValidation | null>(null);
  const [executionQueue, setExecutionQueue] = useState<CareExecutionQueueRow[]>([]);
  const [queueFilter, setQueueFilter] = useState<CareQueueFilter>("all");
  const [executionNote, setExecutionNote] = useState("");
  const [executionBusy, setExecutionBusy] = useState<"submit" | "lock" | "cancel" | "prepare" | "dry_check" | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<CareApprovalRow[]>([]);
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalBusy, setApprovalBusy] = useState<CareApprovalRole | "reject" | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null);

  const isAdmin =
    profile?.is_admin === true ||
    profile?.user_role === "admin" ||
    ADMIN_EMAIL_ALLOWLIST.has((user?.email || "").toLowerCase());

  const selected = useMemo(
    () => rows.find((row) => row.service_chat_id === selectedId) ?? null,
    [rows, selectedId],
  );

  const selectedQueueItems = useMemo(
    () => executionQueue.filter((item) => item.service_chat_id === selectedId),
    [executionQueue, selectedId],
  );

  const latestDecision = useMemo(() => {
    if (decisions.length === 0) return null;
    return [...decisions].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0];
  }, [decisions]);

  const latestLock = useMemo(
    () => selectedQueueItems.find((item) => item.lock_status === "execution_locked") || selectedQueueItems.find((item) => item.lock_id) || null,
    [selectedQueueItems],
  );

  const activeApprovals = useMemo(
    () => approvals.filter((approval) => approval.approval_status === "approved"),
    [approvals],
  );

  const currentAdminApprovalRoles = useMemo(
    () => activeApprovals
      .filter((approval) => approval.approver_admin_id === user?.id)
      .map((approval) => approval.approval_role),
    [activeApprovals, user?.id],
  );

  const approvalBadge = useMemo(() => {
    if (!latestLock?.latest_execution_attempt_id) return "Needs approvals";
    if ((latestLock.rejected_count || approvals.some((approval) => approval.approval_status === "rejected")) && !latestLock.approved_for_future_live_execution) {
      return "Rejected";
    }
    if (latestLock.approved_for_future_live_execution) return "Approved for future live execution";
    if (latestLock.maker_approved && latestLock.checker_approved) return "Checker approved";
    if (latestLock.maker_approved) return "Maker approved";
    return "Needs approvals";
  }, [approvals, latestLock]);

  const irreversibleChecklist = useMemo(() => {
    const readiness = latestLock?.approval_readiness;
    const preflightOk = Boolean(latestLock?.latest_preflight_result && (latestLock.latest_preflight_result as { ok?: boolean }).ok === true);
    const lockedMoneyFrozen = Boolean(latestLock?.lock_id && latestLock.lock_status === "execution_locked");
    const stripeFresh = Boolean(
      latestLock?.stripe_synced_at
      && selected?.db_updated_at
      && new Date(latestLock.stripe_synced_at).getTime() >= new Date(selected.db_updated_at).getTime(),
    );
    return [
      { label: "Stripe sync fresh", done: stripeFresh },
      { label: "DB/Stripe status matched", done: stripeFresh && !(readiness?.errors || []).includes("latest_stripe_sync_stale") },
      { label: "Locked money preview frozen", done: lockedMoneyFrozen },
      { label: "Service hours reviewed", done: Boolean(selected?.actual_service_hours || latestLock?.validation_result?.manual_review_required === false || latestLock?.approval_readiness?.warnings?.includes("manual_review_acknowledged_by_execution_lock_note")) },
      { label: "Owner/carer impact reviewed", done: Boolean(latestLock?.latest_preflight_result || latestLock?.validation_result) },
      { label: "Maker/checker approvals complete", done: Boolean(latestLock?.maker_approved && latestLock?.checker_approved && (latestLock.approval_count || 0) >= 2) },
      { label: "Live execution disabled", done: true },
      { label: "Dry run preflight passed", done: preflightOk },
    ];
  }, [latestLock, selected?.actual_service_hours, selected?.db_updated_at]);

  const filteredRows = useMemo(() => {
    if (queueFilter === "all") return rows;
    return rows.filter((row) => {
      const queueItems = executionQueue.filter((item) => item.service_chat_id === row.service_chat_id);
      const hasBlocked = queueItems.some((item) => item.decision_status === "blocked");
      const hasReady = queueItems.some((item) => item.decision_status === "ready_for_execution");
      const hasLocked = queueItems.some((item) => item.lock_status === "execution_locked" || item.decision_status === "execution_locked");
      const needsSync = !row.stripe_synced_at
        || (row.db_updated_at && row.stripe_synced_at && new Date(row.db_updated_at).getTime() > new Date(row.stripe_synced_at).getTime())
        || row.normalized_money_flow_status === "stripe_failed";
      if (queueFilter === "needs_sync") return needsSync;
      if (queueFilter === "blocked") return hasBlocked;
      if (queueFilter === "ready_for_execution") return hasReady;
      if (queueFilter === "locked") return hasLocked;
      return true;
    });
  }, [executionQueue, queueFilter, rows]);

  const moneyPreview = useMemo(() => {
    const total = toMoneyNumber(selected?.total_paid);
    const serviceRate = toMoneyNumber(selected?.service_rate || selected?.carer_receives);
    const ownerRefund = decisionType === "full_refund_owner"
      ? total
      : decisionType === "partial_refund_owner" || decisionType === "split_refund_and_partial_payout"
        ? toMoneyNumber(ownerRefundInput)
        : 0;
    const carerPayout = decisionType === "release_payout_to_carer"
      ? serviceRate
      : decisionType === "split_refund_and_partial_payout"
        ? toMoneyNumber(carerPayoutInput)
        : 0;
    const platformRetained = Math.max(total - ownerRefund - carerPayout, 0);
    return {
      total,
      ownerRefund,
      carerPayout,
      platformRetained,
      balanceDelta: Number((ownerRefund + carerPayout + platformRetained - total).toFixed(2)),
    };
  }, [carerPayoutInput, decisionType, ownerRefundInput, selected?.carer_receives, selected?.service_rate, selected?.total_paid]);

  const dbStripeMismatchWarning = useMemo(() => {
    if (!selected) return null;
    if (!selected.stripe_synced_at) return "No Stripe snapshot is available yet. Sync before validating a decision.";
    const dbTime = selected.db_updated_at ? new Date(selected.db_updated_at).getTime() : 0;
    const stripeTime = selected.stripe_synced_at ? new Date(selected.stripe_synced_at).getTime() : 0;
    if (dbTime > stripeTime) return "DB changed after the latest Stripe sync. Sync this transaction before validating.";
    if (selected.normalized_money_flow_status === "stripe_failed") return "Latest Stripe sync failed. Resolve or resync before validating.";
    return null;
  }, [selected]);

  const loadRows = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("admin_get_care_transactions" as never);
    if (rpcError) {
      setError(rpcError.message || "Unable to load CARE transactions.");
      setRows([]);
      return;
    }
    setRows((Array.isArray(data) ? data : []) as CareTransactionRow[]);
  }, []);

  const loadDecisions = useCallback(async (serviceChatId: string | null) => {
    if (!serviceChatId) {
      setDecisions([]);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc(
      "admin_get_care_money_flow_decisions" as never,
      { p_service_chat_id: serviceChatId } as never,
    );
    if (rpcError) {
      setDecisionError(rpcError.message || "Unable to load decision history.");
      setDecisions([]);
      return;
    }
    setDecisions((Array.isArray(data) ? data : []) as CareDecisionRow[]);
  }, []);

  const loadExecutionQueue = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_get_care_money_flow_execution_queue" as never);
    if (rpcError) {
      setExecutionError(rpcError.message || "Unable to load execution queue.");
      setExecutionQueue([]);
      return;
    }
    setExecutionQueue((Array.isArray(data) ? data : []) as CareExecutionQueueRow[]);
  }, []);

  const loadApprovals = useCallback(async (executionLockId: string | null | undefined) => {
    if (!executionLockId) {
      setApprovals([]);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc(
      "admin_get_care_money_flow_execution_approvals" as never,
      { p_execution_lock_id: executionLockId } as never,
    );
    if (rpcError) {
      setApprovalError(rpcError.message || "Unable to load execution approvals.");
      setApprovals([]);
      return;
    }
    setApprovals((Array.isArray(data) ? data : []) as CareApprovalRow[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void Promise.all([loadRows(), loadExecutionQueue()]).finally(() => setLoading(false));
  }, [authLoading, isAdmin, loadExecutionQueue, loadRows]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-care-money-flow")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_chats" }, () => {
        setLiveTick("DB changed just now");
        void loadRows();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_disputes" }, () => {
        setLiveTick("Dispute changed just now");
        void loadRows();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "care_money_flow_snapshots" }, () => {
        setLiveTick("Stripe snapshot changed just now");
        void loadRows();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "care_money_flow_admin_decisions" }, () => {
        setLiveTick("Decision draft changed just now");
        void loadRows();
        void loadExecutionQueue();
        void loadDecisions(selectedId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "care_money_flow_execution_locks" }, () => {
        setLiveTick("Execution lock changed just now");
        void loadExecutionQueue();
        void loadDecisions(selectedId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "care_money_flow_execution_attempts" }, () => {
        setLiveTick("Execution dry check changed just now");
        void loadExecutionQueue();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "care_money_flow_execution_approvals" }, () => {
        setLiveTick("Execution approval changed just now");
        void loadExecutionQueue();
        void loadApprovals(latestLock?.lock_id);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, latestLock?.lock_id, loadApprovals, loadDecisions, loadExecutionQueue, loadRows, selectedId]);

  useEffect(() => {
    setDecisionError(null);
    setDecisionSuccess(null);
    setValidationResult(null);
    setDecisionType("no_action_monitor");
    setDecisionReason("");
    setDecisionNote("");
    setOwnerRefundInput("0.00");
    setCarerPayoutInput("0.00");
    setExecutionNote("");
    setExecutionError(null);
    setExecutionSuccess(null);
    setApprovalNote("");
    setApprovalError(null);
    setApprovalSuccess(null);
    setApprovals([]);
    void loadDecisions(selectedId);
  }, [loadDecisions, selectedId]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadApprovals(latestLock?.lock_id);
  }, [isAdmin, latestLock?.lock_id, loadApprovals]);

  const syncOne = useCallback(async (row: CareTransactionRow) => {
    setSyncing((current) => ({ ...current, [row.service_chat_id]: true }));
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("admin-sync-care-money-flow", {
      body: { service_chat_id: row.service_chat_id },
    });
    setSyncing((current) => ({ ...current, [row.service_chat_id]: false }));
    if (fnError) {
      setError(fnError.message || "Stripe sync failed.");
      return false;
    }
    if (data && typeof data === "object" && "error" in data) {
      const body = data as Record<string, unknown>;
      setError(String(body.detail || body.error || "Stripe sync failed."));
      return false;
    }
    await loadRows();
    await loadExecutionQueue();
    return true;
  }, [loadExecutionQueue, loadRows]);

  const syncVisible = useCallback(async () => {
    if (syncAll) return;
    setSyncAll(true);
    for (const row of rows) {
      await syncOne(row);
    }
    setSyncAll(false);
  }, [rows, syncAll, syncOne]);

  const sendTeamHuddleMessage = useCallback(async (row: CareTransactionRow, target: "owner" | "carer" | "both") => {
    const body = messageDraft.trim();
    if (!body) {
      setMessageError("Message body is required.");
      return;
    }

    const recipients = target === "both"
      ? [
        { userId: row.owner_id, role: "owner" },
        { userId: row.carer_id, role: "carer" },
      ]
      : [{ userId: target === "owner" ? row.owner_id : row.carer_id, role: target }];

    setMessageSending(target);
    setMessageError(null);
    setMessageSuccess(null);

    for (const recipient of recipients) {
      const { error: sendError } = await supabase.rpc(
        "admin_send_team_huddle_case_message" as never,
        {
          p_case_type: row.dispute_id ? "dispute" : "user",
          p_case_id: row.dispute_id || row.service_chat_id,
          p_recipient_user_id: recipient.userId,
          p_recipient_role: recipient.role,
          p_message_body: body,
          p_idempotency_key: `care:${row.service_chat_id}:${recipient.role}:${createIdempotencyKey()}`,
        } as never,
      );
      if (sendError) {
        setMessageError(sendError.message || "Failed to send Team Huddle message.");
        setMessageSending(null);
        return;
      }
    }

    setMessageSending(null);
    setMessageDraft("");
    setMessageSuccess(target === "both" ? "Message sent to owner and carer as Team Huddle." : `Message sent to ${target} as Team Huddle.`);
  }, [messageDraft]);

  const validateDecision = useCallback(async (row: CareTransactionRow) => {
    setDecisionBusy("validate");
    setDecisionError(null);
    setDecisionSuccess(null);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_validate_care_money_flow_decision" as never,
      {
        p_service_chat_id: row.service_chat_id,
        p_decision_type: decisionType,
        p_decision_reason: decisionReason,
        p_admin_note: decisionNote,
        p_proposed_owner_refund: moneyPreview.ownerRefund,
        p_proposed_carer_payout: moneyPreview.carerPayout,
        p_proposed_platform_retained: moneyPreview.platformRetained,
        p_existing_decision_id: null,
      } as never,
    );
    setDecisionBusy(null);
    if (rpcError) {
      setDecisionError(rpcError.message || "Decision validation failed.");
      return null;
    }
    const result = (data || null) as CareDecisionValidation | null;
    setValidationResult(result);
    setDecisionSuccess(result?.ok ? "Decision validates as ready for a future execution step." : "Decision validation is blocked.");
    return result;
  }, [decisionNote, decisionReason, decisionType, moneyPreview.carerPayout, moneyPreview.ownerRefund, moneyPreview.platformRetained]);

  const saveDecisionDraft = useCallback(async (row: CareTransactionRow) => {
    setDecisionBusy("save");
    setDecisionError(null);
    setDecisionSuccess(null);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_create_care_money_flow_decision" as never,
      {
        p_service_chat_id: row.service_chat_id,
        p_decision_type: decisionType,
        p_decision_reason: decisionReason,
        p_admin_note: decisionNote,
        p_proposed_owner_refund: moneyPreview.ownerRefund,
        p_proposed_carer_payout: moneyPreview.carerPayout,
        p_proposed_platform_retained: moneyPreview.platformRetained,
      } as never,
    );
    setDecisionBusy(null);
    if (rpcError) {
      setDecisionError(rpcError.message || "Unable to save decision draft.");
      return;
    }
    const saved = data as CareDecisionRow | null;
    setValidationResult(saved?.dry_run_result || null);
    setDecisionSuccess(saved?.status === "blocked" ? "Decision draft saved as blocked." : "Decision draft saved.");
    await loadDecisions(row.service_chat_id);
    await loadExecutionQueue();
  }, [decisionNote, decisionReason, decisionType, loadDecisions, loadExecutionQueue, moneyPreview.carerPayout, moneyPreview.ownerRefund, moneyPreview.platformRetained]);

  const submitDecision = useCallback(async (decision: CareDecisionRow) => {
    setExecutionBusy("submit");
    setExecutionError(null);
    setExecutionSuccess(null);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_submit_care_money_flow_decision" as never,
      { p_decision_id: decision.id } as never,
    );
    setExecutionBusy(null);
    if (rpcError) {
      setExecutionError(rpcError.message || "Unable to submit decision.");
      return;
    }
    const updated = data as CareDecisionRow | null;
    setValidationResult(updated?.dry_run_result || null);
    setExecutionSuccess(updated?.status === "ready_for_execution" ? "Decision is ready for execution review." : "Decision submitted but blocked by validation.");
    await loadDecisions(decision.service_chat_id);
    await loadExecutionQueue();
  }, [loadDecisions, loadExecutionQueue]);

  const lockExecutionPackage = useCallback(async (decision: CareDecisionRow) => {
    const note = executionNote.trim();
    if (!note) {
      setExecutionError("Admin note is required to lock the execution package.");
      return;
    }
    setExecutionBusy("lock");
    setExecutionError(null);
    setExecutionSuccess(null);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_lock_care_money_flow_execution" as never,
      { p_decision_id: decision.id, p_admin_note: note } as never,
    );
    setExecutionBusy(null);
    if (rpcError) {
      setExecutionError(rpcError.message || "Unable to lock execution package.");
      return;
    }
    const locked = data as { validation_result?: CareDecisionValidation } | null;
    setValidationResult(locked?.validation_result || null);
    setExecutionSuccess("Execution package locked. No Stripe money movement has been executed.");
    setExecutionNote("");
    await loadDecisions(decision.service_chat_id);
    await loadExecutionQueue();
  }, [executionNote, loadDecisions, loadExecutionQueue]);

  const cancelDecision = useCallback(async (decision: CareDecisionRow) => {
    const note = executionNote.trim();
    if (!note) {
      setExecutionError("Cancellation note is required.");
      return;
    }
    setExecutionBusy("cancel");
    setExecutionError(null);
    setExecutionSuccess(null);
    const { error: rpcError } = await supabase.rpc(
      "admin_cancel_care_money_flow_decision" as never,
      { p_decision_id: decision.id, p_admin_note: note } as never,
    );
    setExecutionBusy(null);
    if (rpcError) {
      setExecutionError(rpcError.message || "Unable to cancel decision.");
      return;
    }
    setExecutionSuccess("Decision cancelled.");
    setExecutionNote("");
    await loadDecisions(decision.service_chat_id);
    await loadExecutionQueue();
  }, [executionNote, loadDecisions, loadExecutionQueue]);

  const prepareExecutionPackage = useCallback(async (lock: CareExecutionQueueRow) => {
    if (!lock.lock_id) {
      setExecutionError("Execution lock is required before preparing the package.");
      return;
    }
    setExecutionBusy("prepare");
    setExecutionError(null);
    setExecutionSuccess(null);
    const { data, error: rpcError } = await supabase.rpc(
      "admin_prepare_care_money_flow_execution" as never,
      { p_execution_lock_id: lock.lock_id } as never,
    );
    setExecutionBusy(null);
    if (rpcError) {
      setExecutionError(rpcError.message || "Unable to prepare execution package.");
      return;
    }
    const attempt = data as { status?: CareExecutionAttemptStatus; preflight_result?: { ok?: boolean } } | null;
    setExecutionSuccess(attempt?.status === "dry_run_passed" ? "Dry run passed." : "Execution package prepared with blockers.");
    await loadExecutionQueue();
    await loadApprovals(lock.lock_id);
  }, [loadApprovals, loadExecutionQueue]);

  const runExecutionDryCheck = useCallback(async (lock: CareExecutionQueueRow) => {
    if (!lock.lock_id) {
      setExecutionError("Execution lock is required before running the dry check.");
      return;
    }
    setExecutionBusy("dry_check");
    setExecutionError(null);
    setExecutionSuccess(null);
    const { data, error: fnError } = await supabase.functions.invoke("admin-execute-care-money-flow", {
      body: {
        execution_lock_id: lock.lock_id,
        execution_mode: "dry_run",
      },
    });
    setExecutionBusy(null);
    if (fnError) {
      setExecutionError(fnError.message || "Execution dry check failed.");
      return;
    }
    if (data && typeof data === "object" && "error" in data) {
      const body = data as Record<string, unknown>;
      setExecutionError(String(body.detail || body.error || "Execution dry check failed."));
      await loadExecutionQueue();
      return;
    }
    setExecutionSuccess("Dry run passed. Live money movement is disabled.");
    await loadExecutionQueue();
    await loadApprovals(lock.lock_id);
  }, [loadApprovals, loadExecutionQueue]);

  const approveExecutionPackage = useCallback(async (lock: CareExecutionQueueRow, role: CareApprovalRole) => {
    if (!lock.latest_execution_attempt_id) {
      setApprovalError("Run an execution dry check before approving.");
      return;
    }
    setApprovalBusy(role);
    setApprovalError(null);
    setApprovalSuccess(null);
    const { error: rpcError } = await supabase.rpc(
      "admin_approve_care_money_flow_execution" as never,
      {
        p_execution_attempt_id: lock.latest_execution_attempt_id,
        p_approval_role: role,
        p_note: approvalNote.trim() || null,
      } as never,
    );
    setApprovalBusy(null);
    if (rpcError) {
      setApprovalError(rpcError.message || "Unable to approve execution package.");
      return;
    }
    setApprovalSuccess(`${approvalRoleLabel[role]} approval saved.`);
    setApprovalNote("");
    await loadExecutionQueue();
    await loadApprovals(lock.lock_id);
  }, [approvalNote, loadApprovals, loadExecutionQueue]);

  const rejectExecutionPackage = useCallback(async (lock: CareExecutionQueueRow) => {
    if (!lock.latest_execution_attempt_id) {
      setApprovalError("Run an execution dry check before rejecting.");
      return;
    }
    const note = approvalNote.trim();
    if (!note) {
      setApprovalError("Rejection note is required.");
      return;
    }
    setApprovalBusy("reject");
    setApprovalError(null);
    setApprovalSuccess(null);
    const { error: rpcError } = await supabase.rpc(
      "admin_reject_care_money_flow_execution" as never,
      {
        p_execution_attempt_id: lock.latest_execution_attempt_id,
        p_note: note,
      } as never,
    );
    setApprovalBusy(null);
    if (rpcError) {
      setApprovalError(rpcError.message || "Unable to reject execution package.");
      return;
    }
    setApprovalSuccess("Execution package rejected.");
    setApprovalNote("");
    await loadExecutionQueue();
    await loadApprovals(lock.lock_id);
  }, [approvalNote, loadApprovals, loadExecutionQueue]);

  if (authLoading || loading) return <div className="p-4 md:p-6 text-sm text-muted-foreground">Loading CARE console...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CARE Money Flow</h1>
            <p className="text-sm text-muted-foreground">
              Confirmed paid care sessions only. Stripe sync is read-only and writes local snapshots.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border bg-muted px-2 py-1 text-xs text-muted-foreground">
              {liveTick || "Live local DB watch active"}
            </span>
            <Button type="button" variant="outline" onClick={() => void loadRows()}>
              Refresh DB
            </Button>
            <Button type="button" onClick={() => void syncVisible()} disabled={syncAll || rows.length === 0}>
              {syncAll ? "Syncing..." : "Refresh Stripe statuses"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3">
          {([
            ["all", "All"],
            ["needs_sync", "Needs sync"],
            ["blocked", "Blocked"],
            ["ready_for_execution", "Ready"],
            ["locked", "Locked"],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={queueFilter === value ? "default" : "outline"}
              onClick={() => setQueueFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-[1280px] w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Care transaction</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Carer</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">Money flow</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Refunded</th>
                  <th className="px-3 py-2">Carer receives</th>
                  <th className="px-3 py-2">Stripe synced</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={11}>
                      No confirmed paid care sessions found.
                    </td>
                  </tr>
                ) : filteredRows.map((row) => (
                  <tr
                    key={row.service_chat_id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-mono text-xs underline decoration-dotted underline-offset-2"
                        onClick={() => setSelectedId(row.service_chat_id)}
                      >
                        {compactId(row.service_chat_id)}
                      </button>
                      <div className="font-mono text-[11px] text-muted-foreground">PI {compactId(row.payment_intent_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.owner_name || "Owner"}</div>
                      <div className="text-xs text-muted-foreground">@{row.owner_social_id || compactId(row.owner_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.carer_name || "Carer"}</div>
                      <div className="text-xs text-muted-foreground">@{row.carer_social_id || compactId(row.carer_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{row.booking_status || "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.dispute_status ? `Dispute: ${row.dispute_status}` : "No dispute"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{formatHours(row.booked_service_hours)} booked / {formatHours(row.actual_service_hours)} actual</div>
                      <div className="text-xs text-muted-foreground">{row.service_duration_source || "unavailable"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClass[row.normalized_money_flow_status]}`}>
                        {statusLabel[row.normalized_money_flow_status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatMoney(row.currency, row.total_paid)}</td>
                    <td className="px-3 py-2">{formatMoney(row.currency, row.owner_refunded)}</td>
                    <td className="px-3 py-2">{formatMoney(row.currency, row.carer_receives)}</td>
                    <td className="px-3 py-2">
                      <div>{formatDateTime(row.stripe_synced_at)}</div>
                      <div className="text-xs text-muted-foreground">DB {formatDateTime(row.db_updated_at)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(syncing[row.service_chat_id])}
                        onClick={() => void syncOne(row)}
                      >
                        {syncing[row.service_chat_id] ? "Syncing" : "Sync"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>CARE Transaction Detail</SheetTitle>
            <SheetDescription>{selected?.service_chat_id ?? ""}</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-sm">
              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Support summary</h3>
                <p className="mt-2 text-muted-foreground">
                  Status: {statusLabel[selected.normalized_money_flow_status]}. Owner refunded {formatMoney(selected.currency, selected.owner_refunded)}.
                  Carer receives {formatMoney(selected.currency, selected.carer_receives)}. Last Stripe sync: {formatDateTime(selected.stripe_synced_at)}.
                </p>
              </section>

              <section className="rounded-xl border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Resolution workflow</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Draft and validate only. This does not refund, pay out, reverse, or move money.
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                    Dry-run only
                  </span>
                </div>

                {dbStripeMismatchWarning ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    {dbStripeMismatchWarning}
                  </div>
                ) : null}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Outcome
                    <select
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                      value={decisionType}
                      onChange={(event) => setDecisionType(event.target.value as CareDecisionType)}
                    >
                      {Object.entries(decisionTypeLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-medium text-muted-foreground">
                    Reason / category
                    <select
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                      value={decisionReason}
                      onChange={(event) => setDecisionReason(event.target.value)}
                    >
                      <option value="">Select reason</option>
                      {Object.entries(decisionReasonLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  {(decisionType === "partial_refund_owner" || decisionType === "split_refund_and_partial_payout") ? (
                    <label className="text-xs font-medium text-muted-foreground">
                      Proposed owner refund
                      <input
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                        min="0"
                        step="0.01"
                        type="number"
                        value={ownerRefundInput}
                        onChange={(event) => setOwnerRefundInput(event.target.value)}
                      />
                    </label>
                  ) : null}

                  {decisionType === "split_refund_and_partial_payout" ? (
                    <label className="text-xs font-medium text-muted-foreground">
                      Proposed carer payout
                      <input
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground"
                        min="0"
                        step="0.01"
                        type="number"
                        value={carerPayoutInput}
                        onChange={(event) => setCarerPayoutInput(event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>

                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  Admin note
                  <Textarea
                    className="mt-1 min-h-24"
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                    placeholder="Internal note required before this can be validated."
                  />
                </label>

                <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Money preview</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Total paid" value={formatMoney(selected.currency, moneyPreview.total)} />
                    <Field label="Owner refund" value={formatMoney(selected.currency, moneyPreview.ownerRefund)} />
                    <Field label="Carer payout" value={formatMoney(selected.currency, moneyPreview.carerPayout)} />
                    <Field label="Platform retained" value={formatMoney(selected.currency, moneyPreview.platformRetained)} />
                    <Field label="Balance delta" value={formatMoney(selected.currency, moneyPreview.balanceDelta)} />
                    <Field label="Stripe mode" value="Read-only dry run" />
                  </div>
                </div>

                {validationResult ? (
                  <div className={`mt-3 rounded-lg border p-3 text-xs ${
                    validationResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"
                  }`}>
                    <div className="font-semibold">Latest validation: {validationResult.status || (validationResult.ok ? "ready_for_execution" : "blocked")}</div>
                    {validationResult.manual_review_required ? (
                      <div className="mt-2">Manual review required before payout execution.</div>
                    ) : null}
                    {(validationResult.errors || []).length > 0 ? (
                      <div className="mt-2">Errors: {(validationResult.errors || []).join(", ")}</div>
                    ) : null}
                    {(validationResult.warnings || []).length > 0 ? (
                      <div className="mt-2">Warnings: {(validationResult.warnings || []).join(", ")}</div>
                    ) : null}
                  </div>
                ) : null}

                {decisionError ? <p className="mt-2 text-xs text-red-700">{decisionError}</p> : null}
                {decisionSuccess ? <p className="mt-2 text-xs text-emerald-700">{decisionSuccess}</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(decisionBusy)}
                    onClick={() => void validateDecision(selected)}
                  >
                    {decisionBusy === "validate" ? "Validating..." : "Validate decision"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(decisionBusy)}
                    onClick={() => void saveDecisionDraft(selected)}
                  >
                    {decisionBusy === "save" ? "Saving..." : "Save decision draft"}
                  </Button>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">Execution readiness</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This only locks the admin decision package. No Stripe money movement has been executed.
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    Approval queue
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {lifecycleSteps.map((step) => {
                    const active = latestDecision?.status === step || latestLock?.lock_status === step;
                    const passed = Boolean(latestDecision && lifecycleSteps.indexOf(latestDecision.status) >= lifecycleSteps.indexOf(step));
                    return (
                      <div
                        key={step}
                        className={`rounded-lg border p-2 text-xs ${
                          active
                            ? "border-blue-200 bg-blue-50 text-blue-900"
                            : passed
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border-slate-200 bg-muted/20 text-muted-foreground"
                        }`}
                      >
                        {lifecycleLabel[step]}
                      </div>
                    );
                  })}
                </div>

                {latestDecision ? (
                  <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{decisionTypeLabel[latestDecision.decision_type]}</div>
                      <span className="rounded-full border bg-background px-2 py-1 text-xs">{lifecycleLabel[latestDecision.status]}</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <Field label="Owner refund" value={formatMoney(latestDecision.currency, latestDecision.proposed_owner_refund)} />
                      <Field label="Carer payout" value={formatMoney(latestDecision.currency, latestDecision.proposed_carer_payout)} />
                      <Field label="Platform retained" value={formatMoney(latestDecision.currency, latestDecision.proposed_platform_retained)} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Save a decision draft before submitting it for execution review.</p>
                )}

                {latestLock ? (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="font-semibold text-blue-950">Locked package summary</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Field label="Lock ID" value={latestLock.lock_id} />
                      <Field label="Stripe snapshot" value={latestLock.stripe_sync_snapshot_id} />
                      <Field label="Stripe synced" value={formatDateTime(latestLock.stripe_synced_at)} />
                      <Field label="Locked by" value={latestLock.locked_by_admin_name || compactId(latestLock.locked_by_admin_id)} />
                      <Field label="Locked at" value={formatDateTime(latestLock.locked_at)} />
                      <Field label="Validation" value={latestLock.validation_result?.ok ? "passed" : "blocked"} />
                      <Field
                        label="Execution dry check"
                        value={latestLock.latest_execution_attempt_status ? executionAttemptLabel[latestLock.latest_execution_attempt_status] : "Not prepared"}
                      />
                      <Field label="Attempt" value={compactId(latestLock.latest_execution_attempt_id)} />
                    </div>
                    <div className="mt-3 rounded-lg border border-blue-100 bg-white/70 p-3 text-xs text-blue-950">
                      Live money movement is disabled. This prepares the execution package only.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(executionBusy)}
                        onClick={() => void prepareExecutionPackage(latestLock)}
                      >
                        {executionBusy === "prepare" ? "Preparing..." : "Prepare execution package"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(executionBusy)}
                        onClick={() => void runExecutionDryCheck(latestLock)}
                      >
                        {executionBusy === "dry_check" ? "Checking..." : "Run execution dry check"}
                      </Button>
                    </div>
                    <div className="mt-3 rounded-lg border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">Maker-checker approvals</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {latestLock.approval_count || 0} approval{(latestLock.approval_count || 0) === 1 ? "" : "s"} recorded.
                            {currentAdminApprovalRoles.length > 0 ? ` You approved as ${currentAdminApprovalRoles.map((role) => approvalRoleLabel[role]).join(", ")}.` : " You have not approved this package."}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-xs font-medium ${
                          latestLock.approved_for_future_live_execution
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : approvalBadge === "Rejected"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}>
                          {approvalBadge}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Field label="Maker approved" value={latestLock.maker_approved ? "yes" : "no"} />
                        <Field label="Checker approved" value={latestLock.checker_approved ? "yes" : "no"} />
                        <Field label="Rejected" value={(latestLock.rejected_count || 0) > 0 ? "yes" : "no"} />
                        <Field label="Future live readiness" value={latestLock.approved_for_future_live_execution ? "approved" : "not ready"} />
                      </div>

                      <label className="mt-3 block text-xs font-medium text-muted-foreground">
                        Approval / rejection note
                        <Textarea
                          className="mt-1 min-h-20"
                          value={approvalNote}
                          onChange={(event) => setApprovalNote(event.target.value)}
                          placeholder="Required for rejection. Optional for approval."
                        />
                      </label>

                      {approvalError ? <p className="mt-2 text-xs text-red-700">{approvalError}</p> : null}
                      {approvalSuccess ? <p className="mt-2 text-xs text-emerald-700">{approvalSuccess}</p> : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!latestLock.latest_execution_attempt_id || Boolean(approvalBusy) || currentAdminApprovalRoles.includes("maker")}
                          onClick={() => void approveExecutionPackage(latestLock, "maker")}
                        >
                          {approvalBusy === "maker" ? "Approving..." : "Approve as maker"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!latestLock.latest_execution_attempt_id || Boolean(approvalBusy) || currentAdminApprovalRoles.some((role) => role === "checker" || role === "finance_admin")}
                          onClick={() => void approveExecutionPackage(latestLock, "checker")}
                        >
                          {approvalBusy === "checker" ? "Approving..." : "Approve as checker"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!latestLock.latest_execution_attempt_id || Boolean(approvalBusy)}
                          onClick={() => void rejectExecutionPackage(latestLock)}
                        >
                          {approvalBusy === "reject" ? "Rejecting..." : "Reject execution package"}
                        </Button>
                      </div>

                      <div className="mt-3">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approvals list</div>
                        {approvals.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No approvals recorded yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {approvals.map((approval) => (
                              <div key={approval.id} className="rounded-lg border bg-muted/20 p-2 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium">{approvalRoleLabel[approval.approval_role]} by {approval.approver_admin_name || compactId(approval.approver_admin_id)}</span>
                                  <span className="rounded-full border bg-background px-2 py-1">{approvalStatusLabel[approval.approval_status]}</span>
                                </div>
                                <div className="mt-1 text-muted-foreground">
                                  {formatDateTime(approval.approved_at || approval.rejected_at || approval.revoked_at || approval.created_at)}
                                </div>
                                {approval.approval_note ? <div className="mt-1 text-muted-foreground">{approval.approval_note}</div> : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border bg-background p-3">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Irreversible-action checklist</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {irreversibleChecklist.map((item) => (
                          <div
                            key={item.label}
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              item.done
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                : "border-slate-200 bg-muted/20 text-muted-foreground"
                            }`}
                          >
                            {item.done ? "Checked" : "Pending"}: {item.label}
                          </div>
                        ))}
                      </div>
                    </div>
                    {latestLock.latest_stripe_action_plan ? (
                      <div className="mt-3 rounded-lg border bg-background p-3">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">View execution action plan</div>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
                          {JSON.stringify(latestLock.latest_stripe_action_plan, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {latestLock.latest_preflight_result ? (
                      <div className="mt-3 rounded-lg border bg-background p-3">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preflight result</div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
                          {JSON.stringify(latestLock.latest_preflight_result, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  Execution review note / cancellation note
                  <Textarea
                    className="mt-1 min-h-20"
                    value={executionNote}
                    onChange={(event) => setExecutionNote(event.target.value)}
                    placeholder="Required to lock or cancel."
                  />
                </label>

                {executionError ? <p className="mt-2 text-xs text-red-700">{executionError}</p> : null}
                {executionSuccess ? <p className="mt-2 text-xs text-emerald-700">{executionSuccess}</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!latestDecision || Boolean(executionBusy) || latestDecision.status === "execution_locked"}
                    onClick={() => latestDecision && void submitDecision(latestDecision)}
                  >
                    {executionBusy === "submit" ? "Submitting..." : "Submit for execution review"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!latestDecision || latestDecision.status !== "ready_for_execution" || Boolean(executionBusy)}
                    onClick={() => latestDecision && void lockExecutionPackage(latestDecision)}
                  >
                    {executionBusy === "lock" ? "Locking..." : "Lock execution package"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!latestDecision || Boolean(executionBusy) || latestDecision.status === "execution_cancelled"}
                    onClick={() => latestDecision && void cancelDecision(latestDecision)}
                  >
                    {executionBusy === "cancel" ? "Cancelling..." : "Cancel decision"}
                  </Button>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Decision history</h3>
                {decisions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No CARE money-flow decisions yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {decisions.map((decision) => (
                      <div key={decision.id} className="rounded-lg border bg-muted/20 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{decisionTypeLabel[decision.decision_type]}</div>
                          <span className={`rounded-full border px-2 py-1 text-xs ${
                            decision.status === "blocked"
                              ? "border-red-200 bg-red-50 text-red-800"
                              : "border-slate-200 bg-background text-slate-700"
                          }`}>
                            {decision.status}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {decisionReasonLabel[decision.decision_reason] || decision.decision_reason} by {decision.admin_name || compactId(decision.admin_id)} at {formatDateTime(decision.created_at)}
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <Field label="Owner refund" value={formatMoney(decision.currency, decision.proposed_owner_refund)} />
                          <Field label="Carer payout" value={formatMoney(decision.currency, decision.proposed_carer_payout)} />
                          <Field label="Retained" value={formatMoney(decision.currency, decision.proposed_platform_retained)} />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{decision.admin_note}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Team Huddle message</h3>
                <Textarea
                  className="mt-2 min-h-24"
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder="Write a Team Huddle support message..."
                />
                {messageError ? <p className="mt-2 text-xs text-red-700">{messageError}</p> : null}
                {messageSuccess ? <p className="mt-2 text-xs text-emerald-700">{messageSuccess}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(messageSending)}
                    onClick={() => void sendTeamHuddleMessage(selected, "owner")}
                  >
                    {messageSending === "owner" ? "Sending..." : "Message owner"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(messageSending)}
                    onClick={() => void sendTeamHuddleMessage(selected, "carer")}
                  >
                    {messageSending === "carer" ? "Sending..." : "Message carer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(messageSending)}
                    onClick={() => void sendTeamHuddleMessage(selected, "both")}
                  >
                    {messageSending === "both" ? "Sending..." : "Message both"}
                  </Button>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Booking summary</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Service chat ID" value={selected.service_chat_id} />
                  <Field label="Chat ID" value={selected.chat_id} />
                  <Field label="Booking status" value={selected.booking_status} />
                  <Field label="Dispute status" value={selected.dispute_status || "No dispute"} />
                  <Field label="Owner" value={`${selected.owner_name || "Owner"} @${selected.owner_social_id || selected.owner_id}`} />
                  <Field label="Carer" value={`${selected.carer_name || "Carer"} @${selected.carer_social_id || selected.carer_id}`} />
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Service duration proof</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Booked hours" value={formatHours(selected.booked_service_hours)} />
                  <Field label="Actual hours" value={formatHours(selected.actual_service_hours)} />
                  <Field label="Booked start" value={formatDateTime(selected.service_started_at)} />
                  <Field label="Booked end" value={formatDateTime(selected.service_scheduled_end_at)} />
                  <Field label="Check-in" value={formatDateTime(selected.checked_in_at)} />
                  <Field label="Completion" value={formatDateTime(selected.completed_at)} />
                  <Field label="Dispute raised" value={formatDateTime(selected.dispute_raised_at)} />
                  <Field label="Duration source" value={selected.service_duration_source || "unavailable"} />
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Payment timeline</h3>
                <div className="mt-2 space-y-2 text-sm">
                  <div>Payment intent: {selected.payment_intent_id ? "present" : "missing"}</div>
                  <div>Refund: {(selected.refund_ids || []).length > 0 ? selected.refund_ids?.join(", ") : "none recorded"}</div>
                  <div>Transfer: {selected.transfer_id || "none recorded"}</div>
                  <div>Transfer reversal: {selected.transfer_reversal_id || "none recorded"}</div>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Stripe status block</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="PaymentIntent" value={selected.payment_intent_id} />
                  <Field label="Charge" value={selected.charge_id} />
                  <Field label="Refund IDs" value={(selected.refund_ids || []).join(", ") || "-"} />
                  <Field label="Transfer" value={selected.transfer_id} />
                  <Field label="Application fee" value={selected.application_fee_id} />
                  <Field label="Connected account" value={selected.connected_account_id} />
                  <Field label="Connect model" value={selected.stripe_connect_model} />
                  <Field label="Stripe synced" value={formatDateTime(selected.stripe_synced_at)} />
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Internal DB status block</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Money flow" value={statusLabel[selected.normalized_money_flow_status]} />
                  <Field label="Total paid" value={formatMoney(selected.currency, selected.total_paid)} />
                  <Field label="Service rate" value={formatMoney(selected.currency, selected.service_rate)} />
                  <Field label="Owner refunded" value={formatMoney(selected.currency, selected.owner_refunded)} />
                  <Field label="Carer receives" value={formatMoney(selected.currency, selected.carer_receives)} />
                  <Field label="Platform fee gross" value={formatMoney(selected.currency, selected.platform_fee_gross)} />
                  <Field label="Stripe fee" value={formatMoney(selected.currency, selected.stripe_fee)} />
                  <Field label="Platform net retained" value={formatMoney(selected.currency, selected.platform_net_retained)} />
                </div>
              </section>

              <div className="sticky bottom-0 -mx-6 border-t bg-background p-4">
                <Button
                  type="button"
                  className="w-full"
                  disabled={Boolean(syncing[selected.service_chat_id])}
                  onClick={() => void syncOne(selected)}
                >
                  {syncing[selected.service_chat_id] ? "Syncing..." : "Sync this transaction"}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminCare;
