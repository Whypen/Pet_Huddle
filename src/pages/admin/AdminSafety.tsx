import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ReportsQueueRow = Database["public"]["Views"]["view_admin_reports_queue"]["Row"] & {
  moderation_state?: string | null;
  automation_paused?: boolean | null;
  restriction_flags?: Record<string, boolean> | null;
};
type ReportCasefileRow = Database["public"]["Views"]["view_admin_report_casefile"]["Row"] & {
  moderation_state?: string | null;
  automation_paused?: boolean | null;
  restriction_flags?: Record<string, boolean> | null;
  moderation_note?: string | null;
};
type DisputesQueueRow = Database["public"]["Views"]["view_admin_service_disputes_queue"]["Row"];
type AuditTimelineRow = Database["public"]["Views"]["view_admin_safety_audit_timeline"]["Row"];
type ServiceDisputeRow = Database["public"]["Tables"]["service_disputes"]["Row"];

type ActiveTab = "reports" | "disputes" | "audit";

type CaseSelection =
  | { type: "report"; targetUserId: string }
  | { type: "dispute"; disputeId: string }
  | null;

type SortDirection = "asc" | "desc";
type ReportsSortKey =
  | "target_user_id"
  | "report_count"
  | "unique_reporters"
  | "total_score"
  | "latest_report_at"
  | "attachment_evidence_count"
  | "latest_support_subject";
type DisputesSortKey =
  | "booking_id"
  | "requester"
  | "provider"
  | "total_paid"
  | "dispute_status"
  | "dispute_created_at"
  | "dispute_updated_at";
type AuditSortKey = "action" | "target" | "actor" | "created_at";

type SortState<K extends string> = {
  key: K;
  direction: SortDirection;
};

type ReportAction = "set_active" | "warn" | "shadow_restrict" | "hard_ban" | "pause_sentinel";

type PendingReportAction = {
  action: ReportAction;
  pauseSentinel?: boolean;
};

type RestrictionFlagKey =
  | "chat_disabled"
  | "discovery_hidden"
  | "social_posting_disabled"
  | "marketplace_hidden"
  | "map_hidden";

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
};

const parseTime = (value: string | null) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const compareStrings = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });

const compareNumbers = (a: number | null | undefined, b: number | null | undefined) =>
  (a ?? 0) - (b ?? 0);

const applyDirection = (value: number, direction: SortDirection) =>
  direction === "desc" ? -value : value;

const getSortIcon = (direction: SortDirection) => (direction === "desc" ? "▼" : "▲");
const getSortIconClassName = (active: boolean) =>
  `text-[10px] leading-none ${active ? "text-slate-400" : "text-slate-300"}`;

const unresolvedStatuses = new Set(["open", "awaiting_evidence", "under_review", "decision_ready"]);
const restrictionFlagOptions: Array<{ key: RestrictionFlagKey; label: string }> = [
  { key: "chat_disabled", label: "Chat Disabled" },
  { key: "discovery_hidden", label: "Discovery Hidden" },
  { key: "social_posting_disabled", label: "Social Posting Disabled" },
  { key: "marketplace_hidden", label: "Marketplace Hidden" },
  { key: "map_hidden", label: "Map Hidden" },
];

const parseNumberCandidate = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const extractAmountFromPayload = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const keys = [
    "total_paid",
    "totalPaid",
    "total_amount",
    "totalAmount",
    "amount_total",
    "amountTotal",
    "final_amount",
    "finalAmount",
    "amount",
    "price",
  ];
  for (const key of keys) {
    const candidate = parseNumberCandidate(source[key]);
    if (candidate !== null) return candidate;
  }
  return null;
};

const getDisputeTotalPaidValue = (
  totals: Record<string, number | null>,
  row: DisputesQueueRow,
) => (row.service_chat_id ? totals[row.service_chat_id] ?? null : null);

const badgeClasses =
  "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground";

const ADMIN_EMAIL_ALLOWLIST = new Set([
  "twenty_illkid@msn.com",
  "fongpoman114@gmail.com",
  "kuriocollectives@gmail.com",
]);

const AdminSafety = () => {
  const { profile, user, loading: authLoading, hydrating } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("reports");
  const [loading, setLoading] = useState(true);

  const [reportsQueue, setReportsQueue] = useState<ReportsQueueRow[]>([]);
  const [disputesQueue, setDisputesQueue] = useState<DisputesQueueRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditTimelineRow[]>([]);

  const [caseSelection, setCaseSelection] = useState<CaseSelection>(null);
  const [reportCasefile, setReportCasefile] = useState<ReportCasefileRow[]>([]);
  const [disputeCasefile, setDisputeCasefile] = useState<ServiceDisputeRow | null>(null);
  const [serviceChatTotals, setServiceChatTotals] = useState<Record<string, number | null>>({});
  const [reportsSort, setReportsSort] = useState<SortState<ReportsSortKey>>({
    key: "latest_report_at",
    direction: "desc",
  });
  const [disputesSort, setDisputesSort] = useState<SortState<DisputesSortKey>>({
    key: "dispute_created_at",
    direction: "desc",
  });
  const [auditSort, setAuditSort] = useState<SortState<AuditSortKey>>({
    key: "created_at",
    direction: "desc",
  });
  const [moderatorNote, setModeratorNote] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingReportAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [shadowFlags, setShadowFlags] = useState<Record<RestrictionFlagKey, boolean>>({
    chat_disabled: false,
    discovery_hidden: false,
    social_posting_disabled: false,
    marketplace_hidden: false,
    map_hidden: false,
  });

  const selectedReportTargetId = caseSelection?.type === "report" ? caseSelection.targetUserId : null;
  const selectedDisputeId = caseSelection?.type === "dispute" ? caseSelection.disputeId : null;
  const isAdmin =
    profile?.is_admin === true ||
    profile?.user_role === "admin" ||
    ADMIN_EMAIL_ALLOWLIST.has((user?.email || "").toLowerCase());

  const reportQueueByTarget = useMemo(() => {
    const byId = new Map<string, ReportsQueueRow>();
    for (const row of reportsQueue) {
      if (row.target_user_id) byId.set(row.target_user_id, row);
    }
    return byId;
  }, [reportsQueue]);

  const resetActionFeedback = () => {
    setActionError(null);
    setActionSuccess(null);
  };

  const disputeQueueById = useMemo(() => {
    const byId = new Map<string, DisputesQueueRow>();
    for (const row of disputesQueue) {
      if (row.dispute_id) byId.set(row.dispute_id, row);
    }
    return byId;
  }, [disputesQueue]);

  const toggleSort = <K extends string>(
    setter: Dispatch<SetStateAction<SortState<K>>>,
    key: K,
  ) => {
    setter((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "desc" ? "asc" : "desc" };
      }
      return { key, direction: "desc" };
    });
  };

  const reportsSorted = useMemo(() => {
    const rows = [...reportsQueue];
    rows.sort((a, b) => {
      let result = 0;
      switch (reportsSort.key) {
        case "target_user_id":
          result = compareStrings(a.target_user_id, b.target_user_id);
          break;
        case "report_count":
          result = compareNumbers(a.report_count, b.report_count);
          break;
        case "unique_reporters":
          result = compareNumbers(a.unique_reporters, b.unique_reporters);
          break;
        case "total_score":
          result = compareNumbers(a.total_score, b.total_score);
          break;
        case "latest_report_at":
          result = compareNumbers(parseTime(a.latest_report_at), parseTime(b.latest_report_at));
          break;
        case "attachment_evidence_count":
          result = compareNumbers(a.has_attachments ? 1 : 0, b.has_attachments ? 1 : 0);
          break;
        case "latest_support_subject":
          result = compareStrings(a.latest_support_subject, b.latest_support_subject);
          break;
      }
      return applyDirection(result, reportsSort.direction);
    });
    return rows;
  }, [reportsQueue, reportsSort]);

  const disputesSorted = useMemo(() => {
    const rows = [...disputesQueue];
    rows.sort((a, b) => {
      const unresolvedRankA = unresolvedStatuses.has(a.dispute_status ?? "") ? 1 : 0;
      const unresolvedRankB = unresolvedStatuses.has(b.dispute_status ?? "") ? 1 : 0;
      let result = 0;
      switch (disputesSort.key) {
        case "booking_id":
          result = compareStrings(a.service_chat_id, b.service_chat_id);
          break;
        case "requester":
          result = compareStrings(
            a.requester_display_name ?? a.requester_id,
            b.requester_display_name ?? b.requester_id,
          );
          break;
        case "provider":
          result = compareStrings(
            a.provider_display_name ?? a.provider_id,
            b.provider_display_name ?? b.provider_id,
          );
          break;
        case "total_paid":
          result = compareNumbers(
            getDisputeTotalPaidValue(serviceChatTotals, a),
            getDisputeTotalPaidValue(serviceChatTotals, b),
          );
          break;
        case "dispute_status":
          result = compareNumbers(unresolvedRankA, unresolvedRankB);
          if (result === 0) {
            result = compareStrings(a.dispute_status, b.dispute_status);
          }
          break;
        case "dispute_created_at":
          result = compareNumbers(parseTime(a.dispute_created_at), parseTime(b.dispute_created_at));
          if (result === 0) {
            result = compareNumbers(unresolvedRankA, unresolvedRankB);
          }
          break;
        case "dispute_updated_at":
          result = compareNumbers(parseTime(a.dispute_updated_at), parseTime(b.dispute_updated_at));
          break;
      }
      return applyDirection(result, disputesSort.direction);
    });
    return rows;
  }, [disputesQueue, disputesSort, serviceChatTotals]);

  const auditSorted = useMemo(() => {
    const rows = [...auditRows];
    rows.sort((a, b) => {
      let result = 0;
      switch (auditSort.key) {
        case "action":
          result = compareStrings(a.action, b.action);
          break;
        case "target":
          result = compareStrings(a.target_display_name ?? a.target_user_id, b.target_display_name ?? b.target_user_id);
          break;
        case "actor":
          result = compareStrings(a.actor_display_name ?? a.actor_id, b.actor_display_name ?? b.actor_id);
          break;
        case "created_at":
          result = compareNumbers(parseTime(a.created_at), parseTime(b.created_at));
          break;
      }
      return applyDirection(result, auditSort.direction);
    });
    return rows;
  }, [auditRows, auditSort]);

  const loadQueues = async () => {
    const [reportsRes, disputesRes, auditRes] = await Promise.all([
      supabase
        .from("view_admin_reports_queue")
        .select("*")
        .order("latest_report_at", { ascending: false }),
      supabase
        .from("view_admin_service_disputes_queue")
        .select("*")
        .order("dispute_created_at", { ascending: false }),
      supabase
        .from("view_admin_safety_audit_timeline")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (!reportsRes.error) setReportsQueue((reportsRes.data ?? []) as ReportsQueueRow[]);
    if (!disputesRes.error) {
      const rows = disputesRes.data ?? [];
      setDisputesQueue(rows);
      const chatIds = rows.map((row) => row.service_chat_id).filter((value): value is string => Boolean(value));
      if (chatIds.length > 0) {
        const { data: chats } = await supabase
          .from("service_chats")
          .select("id, quote_card, request_card")
          .in("id", Array.from(new Set(chatIds)));
        if (chats) {
          const totals: Record<string, number | null> = {};
          for (const chat of chats) {
            const quoteTotal = extractAmountFromPayload(chat.quote_card);
            const requestTotal = extractAmountFromPayload(chat.request_card);
            totals[chat.id] = quoteTotal ?? requestTotal ?? null;
          }
          setServiceChatTotals(totals);
        }
      } else {
        setServiceChatTotals({});
      }
    }
    if (!auditRes.error) setAuditRows(auditRes.data ?? []);
  };

  const loadReportCasefile = async (targetUserId: string | null) => {
    if (!targetUserId) {
      setReportCasefile([]);
      return;
    }

    const { data } = await supabase
      .from("view_admin_report_casefile")
      .select("*")
      .eq("target_user_id", targetUserId)
      .order("report_created_at", { ascending: false });

    setReportCasefile((data ?? []) as ReportCasefileRow[]);
  };

  useEffect(() => {
    const load = async () => {
      if (authLoading || hydrating) {
        return;
      }

      if (!isAdmin) {
        setLoading(false);
        return;
      }

      setLoading(true);
      await loadQueues();
      setLoading(false);
    };

    void load();
  }, [authLoading, hydrating, isAdmin]);

  useEffect(() => {
    void loadReportCasefile(selectedReportTargetId);
  }, [selectedReportTargetId]);

  useEffect(() => {
    const loadDisputeCasefile = async () => {
      if (!selectedDisputeId) {
        setDisputeCasefile(null);
        return;
      }

      const { data } = await supabase
        .from("service_disputes")
        .select("*")
        .eq("id", selectedDisputeId)
        .maybeSingle();

      setDisputeCasefile(data ?? null);
    };

    void loadDisputeCasefile();
  }, [selectedDisputeId]);

  useEffect(() => {
    resetActionFeedback();
    if (!selectedReportTargetId) {
      setModeratorNote("");
      setPendingAction(null);
      return;
    }
    const sourceFlags = (
      reportCasefile[0]?.restriction_flags ??
      reportQueueByTarget.get(selectedReportTargetId)?.restriction_flags ??
      {}
    ) as Record<string, boolean>;
    setShadowFlags({
      chat_disabled: sourceFlags.chat_disabled === true,
      discovery_hidden: sourceFlags.discovery_hidden === true,
      social_posting_disabled: sourceFlags.social_posting_disabled === true,
      marketplace_hidden: sourceFlags.marketplace_hidden === true,
      map_hidden: sourceFlags.map_hidden === true,
    });
  }, [selectedReportTargetId, reportCasefile, reportQueueByTarget]);

  if (authLoading || hydrating) {
    return <div className="p-4 md:p-6 text-sm text-muted-foreground">Checking admin access...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const reportHeader = selectedReportTargetId
    ? reportQueueByTarget.get(selectedReportTargetId)
    : undefined;
  const disputeHeader = selectedDisputeId
    ? disputeQueueById.get(selectedDisputeId)
    : undefined;
  const currentReportState = reportHeader?.moderation_state ?? reportCasefile[0]?.moderation_state ?? "active";
  const currentAutomationPaused =
    reportHeader?.automation_paused ?? reportCasefile[0]?.automation_paused ?? false;

  const actionLabel = (action: PendingReportAction) => {
    if (action.action === "set_active") return "Set Active";
    if (action.action === "warn") return "Warn";
    if (action.action === "shadow_restrict") return "Shadow Restrict";
    if (action.action === "hard_ban") return "Hard Ban";
    return action.pauseSentinel ? "Pause Sentinel" : "Resume Sentinel";
  };

  const needsNote = (action: PendingReportAction) => {
    if (action.action === "pause_sentinel") return action.pauseSentinel === true;
    return true;
  };

  const openReportActionConfirm = (action: PendingReportAction) => {
    resetActionFeedback();
    setPendingAction(action);
  };

  const executeReportAction = async () => {
    if (!selectedReportTargetId || !pendingAction || actionLoading) return;

    const requiresNote = needsNote(pendingAction);
    const trimmedNote = moderatorNote.trim();
    if (requiresNote && !trimmedNote) {
      setActionError("Moderator note is required for this action.");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    const payload: Record<string, unknown> = {
      p_target_user_id: selectedReportTargetId,
      p_action: pendingAction.action,
      p_note: trimmedNote || null,
      p_pause_sentinel: pendingAction.action === "pause_sentinel" ? pendingAction.pauseSentinel : null,
    };

    if (pendingAction.action === "shadow_restrict") {
      const activeFlags = restrictionFlagOptions.reduce<Record<string, boolean>>((acc, option) => {
        if (shadowFlags[option.key]) {
          acc[option.key] = true;
        }
        return acc;
      }, {});
      payload.p_restriction_flags = activeFlags;
    } else {
      payload.p_restriction_flags = {};
    }

    const { data, error } = await supabase.rpc(
      "admin_apply_report_moderation" as never,
      payload as never,
    );

    if (error) {
      setActionLoading(false);
      setActionError(error.message || "Failed to apply moderation action.");
      return;
    }

    setPendingAction(null);
    setActionLoading(false);
    setActionSuccess(`Applied: ${actionLabel(pendingAction)}.`);

    await loadQueues();
    await loadReportCasefile(selectedReportTargetId);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6 lg:px-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Trust &amp; Safety Console</h1>
        <p className="text-sm text-muted-foreground">Read-only foundation for reports, disputes, and audit trail.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading safety queues...</div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <TabsList>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="disputes">Disputes</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-3">
            <div className="rounded-xl border bg-card">
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-[920px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                    <tr className="text-left">
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "target_user_id")}>
                          Target User
                          <span className={getSortIconClassName(reportsSort.key === "target_user_id")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "report_count")}>
                          Reports
                          <span className={getSortIconClassName(reportsSort.key === "report_count")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "unique_reporters")}>
                          Unique Reporters
                          <span className={getSortIconClassName(reportsSort.key === "unique_reporters")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "total_score")}>
                          Total Score
                          <span className={getSortIconClassName(reportsSort.key === "total_score")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "latest_report_at")}>
                          Latest Report
                          <span className={getSortIconClassName(reportsSort.key === "latest_report_at")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "attachment_evidence_count")}>
                          Attachment Evidence
                          <span className={getSortIconClassName(reportsSort.key === "attachment_evidence_count")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden xl:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "latest_support_subject")}>
                          Latest Support Subject
                          <span className={getSortIconClassName(reportsSort.key === "latest_support_subject")}>{getSortIcon(reportsSort.direction)}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsSorted.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          No reports in queue yet.
                        </td>
                      </tr>
                    ) : (
                      reportsSorted.map((row) => (
                        <tr
                          key={row.target_user_id ?? `${row.latest_report_at}-unknown`}
                          className="cursor-pointer border-b last:border-b-0 hover:bg-muted/30"
                          onClick={() => {
                            if (!row.target_user_id) return;
                            setCaseSelection({ type: "report", targetUserId: row.target_user_id });
                          }}
                        >
                          <td className="px-3 py-2 font-mono text-xs">{row.target_user_id ?? "-"}</td>
                          <td className="px-3 py-2">{row.report_count ?? 0}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{row.unique_reporters ?? 0}</td>
                          <td className="px-3 py-2">{row.total_score ?? 0}</td>
                          <td className="px-3 py-2">{formatDateTime(row.latest_report_at)}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{row.has_attachments ? 1 : 0}</td>
                          <td className="px-3 py-2 hidden xl:table-cell">{row.latest_support_subject ?? "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="disputes" className="space-y-3">
            <div className="rounded-xl border bg-card">
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-[1040px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                    <tr className="text-left">
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "booking_id")}>
                          Booking
                          <span className={getSortIconClassName(disputesSort.key === "booking_id")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "requester")}>
                          Requester
                          <span className={getSortIconClassName(disputesSort.key === "requester")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "provider")}>
                          Provider
                          <span className={getSortIconClassName(disputesSort.key === "provider")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden xl:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "total_paid")}>
                          Total Paid
                          <span className={getSortIconClassName(disputesSort.key === "total_paid")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "dispute_status")}>
                          Status
                          <span className={getSortIconClassName(disputesSort.key === "dispute_status")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "dispute_updated_at")}>
                          Latest Update
                          <span className={getSortIconClassName(disputesSort.key === "dispute_updated_at")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setDisputesSort, "dispute_created_at")}>
                          Created
                          <span className={getSortIconClassName(disputesSort.key === "dispute_created_at")}>{getSortIcon(disputesSort.direction)}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputesSorted.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          No disputes in queue yet.
                        </td>
                      </tr>
                    ) : (
                      disputesSorted.map((row) => (
                        <tr
                          key={row.dispute_id ?? `${row.service_chat_id}-unknown`}
                          className="cursor-pointer border-b last:border-b-0 hover:bg-muted/30"
                          onClick={() => {
                            if (!row.dispute_id) return;
                            setCaseSelection({ type: "dispute", disputeId: row.dispute_id });
                          }}
                        >
                          <td className="px-3 py-2 font-mono text-xs">{row.service_chat_id ?? "-"}</td>
                          <td className="px-3 py-2">{row.requester_display_name ?? row.requester_id ?? "-"}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{row.provider_display_name ?? row.provider_id ?? "-"}</td>
                          <td className="px-3 py-2 hidden xl:table-cell">
                            {getDisputeTotalPaidValue(serviceChatTotals, row) ?? "-"}
                          </td>
                          <td className="px-3 py-2"><span className={badgeClasses}>{row.dispute_status}</span></td>
                          <td className="px-3 py-2 hidden lg:table-cell">{formatDateTime(row.dispute_updated_at)}</td>
                          <td className="px-3 py-2">{formatDateTime(row.dispute_created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-3">
            <div className="rounded-xl border bg-card">
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-[860px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                    <tr className="text-left">
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setAuditSort, "action")}>
                          Action
                          <span className={getSortIconClassName(auditSort.key === "action")}>{getSortIcon(auditSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setAuditSort, "target")}>
                          Target
                          <span className={getSortIconClassName(auditSort.key === "target")}>{getSortIcon(auditSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setAuditSort, "actor")}>
                          Actor
                          <span className={getSortIconClassName(auditSort.key === "actor")}>{getSortIcon(auditSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setAuditSort, "created_at")}>
                          Created
                          <span className={getSortIconClassName(auditSort.key === "created_at")}>{getSortIcon(auditSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden xl:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditSorted.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          No audit entries yet.
                        </td>
                      </tr>
                    ) : (
                      auditSorted.map((row) => (
                        <tr key={row.audit_id} className="border-b last:border-b-0 align-top hover:bg-muted/30">
                          <td className="px-3 py-2"><span className={badgeClasses}>{row.action}</span></td>
                          <td className="px-3 py-2">{row.target_display_name ?? row.target_user_id ?? "-"}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{row.actor_display_name ?? row.actor_id}</td>
                          <td className="px-3 py-2">{formatDateTime(row.created_at)}</td>
                          <td className="px-3 py-2 hidden xl:table-cell max-w-[420px] whitespace-pre-wrap break-words">{row.notes ?? "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <Sheet open={caseSelection !== null} onOpenChange={(open) => !open && setCaseSelection(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[720px] lg:max-w-[860px] overflow-y-auto">
          {caseSelection?.type === "report" && (
            <>
              <SheetHeader>
                <SheetTitle>Report Case File</SheetTitle>
                <SheetDescription>
                  Target {selectedReportTargetId}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <section className="rounded-lg border p-3 space-y-2">
                  <h3 className="font-semibold">Queue Summary</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Reports: {reportHeader?.report_count ?? 0}</div>
                    <div>Unique reporters: {reportHeader?.unique_reporters ?? 0}</div>
                    <div>Total score: {reportHeader?.total_score ?? 0}</div>
                    <div>Latest: {formatDateTime(reportHeader?.latest_report_at ?? null)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeClasses}>Moderation: {currentReportState}</span>
                    <span className={badgeClasses}>
                      {currentAutomationPaused ? "Sentinel Paused" : "Sentinel Active"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(reportHeader?.category_tags ?? []).map((tag) => (
                      <span key={tag} className={badgeClasses}>{tag}</span>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border p-3 space-y-3">
                  <h3 className="font-semibold">Timeline</h3>
                  {reportCasefile.length === 0 ? (
                    <p className="text-muted-foreground">No report timeline available.</p>
                  ) : (
                    reportCasefile.map((row) => (
                      <div key={row.report_id} className="rounded-md border p-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={badgeClasses}>Score {row.score}</span>
                          <span className={badgeClasses}>{formatDateTime(row.report_created_at)}</span>
                        </div>
                        <div>Reporter: {row.reporter_display_name ?? row.reporter_user_id}</div>
                        <div>Target: {row.target_display_name ?? row.target_user_id}</div>
                        <div className="flex flex-wrap gap-2">
                          {(row.categories ?? []).map((tag) => (
                            <span key={`${row.report_id}-${tag}`} className={badgeClasses}>{tag}</span>
                          ))}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{row.details ?? "-"}</div>
                        <div>Attachments: {(row.attachment_urls ?? []).length}</div>
                        <div className="text-xs text-muted-foreground">
                          Support mirror: {row.support_subject ?? "-"}
                        </div>
                      </div>
                    ))
                  )}
                </section>

                <section className="rounded-lg border p-3 space-y-3">
                  <h3 className="font-semibold">Moderation Controls</h3>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="moderator-note">
                      Moderator Note
                    </label>
                    <Textarea
                      id="moderator-note"
                      value={moderatorNote}
                      onChange={(event) => setModeratorNote(event.target.value)}
                      placeholder="Required for Set Active, Warn, Shadow Restrict, Hard Ban, and Pause Sentinel ON."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Shadow Restriction Flags</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {restrictionFlagOptions.map((flag) => (
                        <label key={flag.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <span className="text-sm">{flag.label}</span>
                          <Switch
                            checked={shadowFlags[flag.key]}
                            onCheckedChange={(checked) =>
                              setShadowFlags((prev) => ({ ...prev, [flag.key]: checked }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Pause Sentinel</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{currentAutomationPaused ? "Paused" : "Active"}</span>
                      <Switch
                        checked={currentAutomationPaused}
                        onCheckedChange={(checked) =>
                          openReportActionConfirm({ action: "pause_sentinel", pauseSentinel: checked })
                        }
                      />
                    </div>
                  </div>

                  {actionError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {actionError}
                    </div>
                  ) : null}
                  {actionSuccess ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {actionSuccess}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "set_active" })}>
                      Set Active
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "warn" })}>
                      Warn
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "shadow_restrict" })}>
                      Shadow Restrict
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => openReportActionConfirm({ action: "hard_ban" })}
                    >
                      Hard Ban
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        openReportActionConfirm({
                          action: "pause_sentinel",
                          pauseSentinel: !currentAutomationPaused,
                        })
                      }
                    >
                      {currentAutomationPaused ? "Resume Sentinel" : "Pause Sentinel"}
                    </Button>
                  </div>
                </section>
              </div>
            </>
          )}

          {caseSelection?.type === "dispute" && (
            <>
              <SheetHeader>
                <SheetTitle>Dispute Case File</SheetTitle>
                <SheetDescription>
                  Dispute {selectedDisputeId}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <section className="rounded-lg border p-3 space-y-2">
                  <h3 className="font-semibold">Dispute Summary</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Status: {disputeHeader?.dispute_status ?? "-"}</div>
                    <div>Category: {disputeHeader?.dispute_category ?? "-"}</div>
                    <div>Chat status: {disputeHeader?.chat_status ?? "-"}</div>
                    <div>Evidence count: {disputeHeader?.evidence_count ?? 0}</div>
                    <div>Created: {formatDateTime(disputeHeader?.dispute_created_at ?? null)}</div>
                    <div>Updated: {formatDateTime(disputeHeader?.dispute_updated_at ?? null)}</div>
                  </div>
                </section>

                <section className="rounded-lg border p-3 space-y-2">
                  <h3 className="font-semibold">Participants</h3>
                  <div>Requester: {disputeHeader?.requester_display_name ?? disputeHeader?.requester_id ?? "-"}</div>
                  <div>Provider: {disputeHeader?.provider_display_name ?? disputeHeader?.provider_id ?? "-"}</div>
                  <div className="font-mono text-xs">Service chat: {disputeHeader?.service_chat_id ?? "-"}</div>
                  <div className="font-mono text-xs">Payment intent: {disputeHeader?.stripe_payment_intent_id ?? "-"}</div>
                </section>

                <section className="rounded-lg border p-3 space-y-2">
                  <h3 className="font-semibold">Dispute Detail</h3>
                  <div className="whitespace-pre-wrap break-words">{disputeCasefile?.description ?? "-"}</div>
                  <div>Admin notes: {disputeCasefile?.admin_notes ?? "-"}</div>
                  <div>Evidence URLs: {(disputeCasefile?.evidence_urls ?? []).length}</div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction ? `Confirm ${actionLabel(pendingAction)}` : "Confirm Action"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.action === "hard_ban"
                ? "This action is irreversible and will apply a full account ban with identifier blocks."
                : "This moderation action will be applied immediately and written to admin audit logs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingAction && needsNote(pendingAction) && !moderatorNote.trim() ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Moderator note is required before confirming.
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void executeReportAction();
              }}
              disabled={actionLoading}
            >
              {actionLoading ? "Applying..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSafety;
