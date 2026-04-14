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
  target_display_name?: string | null;
  target_social_id?: string | null;
  moderation_state?: string | null;
  automation_paused?: boolean | null;
  restriction_flags?: Record<string, boolean> | null;
  case_status?: "open" | "resolved" | "dismissed" | null;
  latest_action_source?: "manual" | "sentinel" | null;
};
type ReportCasefileRow = Database["public"]["Views"]["view_admin_report_casefile"]["Row"] & {
  target_display_name?: string | null;
  target_social_id?: string | null;
  reporter_display_name?: string | null;
  reporter_social_id?: string | null;
  moderation_state?: string | null;
  automation_paused?: boolean | null;
  restriction_flags?: Record<string, boolean> | null;
  case_status?: "open" | "resolved" | "dismissed" | null;
  moderation_note?: string | null;
  reporter_false_report_count?: number | null;
};
type DisputesQueueRow = Database["public"]["Views"]["view_admin_service_disputes_queue"]["Row"] & {
  requester_social_id?: string | null;
  provider_social_id?: string | null;
  evidence_urls?: string[] | null;
};
type AuditTimelineRow = Database["public"]["Views"]["view_admin_safety_audit_timeline"]["Row"] & {
  action_source?: "manual" | "sentinel" | null;
};
type ServiceDisputeRow = Database["public"]["Tables"]["service_disputes"]["Row"];
type ServiceChatRow = Database["public"]["Tables"]["service_chats"]["Row"];
type SafetyUserRow = {
  user_id: string | null;
  display_name: string | null;
  social_id: string | null;
  moderation_state: string | null;
  automation_paused: boolean | null;
  case_status: string | null;
  is_banned_effective: boolean | null;
  reports_received: number | null;
  reports_filed: number | null;
  false_report_count: number | null;
  penalty_count: number | null;
  cumulative_penalty_score: number | null;
  trust_weight: number | null;
  disputes_involved: number | null;
  latest_safety_activity: string | null;
};
type SafetyUserTimelineRow = {
  user_id: string | null;
  event_type: string;
  event_group: string;
  event_date: string | null;
  description: string | null;
  related_id: string | null;
  severity: string | null;
  source: string | null;
};

type ActiveTab = "reports" | "disputes" | "users" | "audit";

type CaseSelection =
  | { type: "report"; targetUserId: string }
  | { type: "dispute"; disputeId: string }
  | { type: "user"; userId: string }
  | null;

type SortDirection = "asc" | "desc";
type ReportsSortKey =
  | "target_identity"
  | "report_count"
  | "unique_reporters"
  | "total_score"
  | "latest_report_at"
  | "attachment_evidence_count"
  | "case_status";
type DisputesSortKey =
  | "booking_id"
  | "requester"
  | "provider"
  | "total_paid"
  | "dispute_status"
  | "dispute_created_at"
  | "dispute_updated_at";
type AuditSortKey = "source" | "action" | "target" | "actor" | "created_at";
type UsersSortKey =
  | "identity"
  | "moderation_state"
  | "reports_received"
  | "reports_filed"
  | "false_report_count"
  | "penalty_count"
  | "cumulative_penalty_score"
  | "trust_weight"
  | "disputes_involved"
  | "latest_safety_activity";

type SortState<K extends string> = {
  key: K;
  direction: SortDirection;
};

type ReportAction =
  | "clear_restrictions"
  | "warn"
  | "shadow_restrict"
  | "hard_ban"
  | "pause_sentinel"
  | "mark_dismissed"
  | "mark_false_report";

type PendingReportAction = {
  action: ReportAction;
  pauseSentinel?: boolean;
  reporterUserId?: string | null;
};

type RestrictionFlagKey =
  | "chat_disabled"
  | "discovery_hidden"
  | "social_posting_disabled"
  | "marketplace_hidden"
  | "service_disabled"
  | "map_hidden"
  | "map_disabled";

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
const restrictionFlagOptions: Array<{ key: RestrictionFlagKey; label: string; helper: string }> = [
  { key: "chat_disabled", label: "Chat Disabled", helper: "User cannot send messages or start chats." },
  { key: "discovery_hidden", label: "Discovery Hidden", helper: "User is removed from discovery visibility." },
  { key: "social_posting_disabled", label: "Social Posting Disabled", helper: "User cannot create posts, comments, or replies." },
  { key: "marketplace_hidden", label: "Marketplace Hidden", helper: "User’s Carer/Provider profile is hidden from Service tab." },
  { key: "service_disabled", label: "Service Access Disabled", helper: "User cannot browse/request provider profiles or start service booking/request flows." },
  { key: "map_hidden", label: "Map Hidden", helper: "User is incognito and not publicly visible on map." },
  { key: "map_disabled", label: "Map Disabled", helper: "User cannot pin alerts or create map alert pins." },
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
const demoBadgeClasses =
  "inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800";
const DEMO_FIXTURE_MARKER = "[DEMO_FIXTURE_ADMIN_SAFETY_V1]";
const sentinelBadgeClasses =
  "inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800";

const resolveIdentityLabel = (displayName: string | null | undefined, socialId: string | null | undefined, fallbackId: string | null | undefined) => {
  const name = displayName?.trim() || "Unknown User";
  const social = socialId?.trim() ? `@${socialId.trim()}` : "@unknown";
  return { name, social, fallback: fallbackId ?? "-" };
};

const formatCaseStatus = (status: string | null | undefined) => {
  if (status === "resolved") return "Resolved";
  if (status === "dismissed") return "Dismissed";
  return "Open";
};

const formatModerationState = (value: string | null | undefined) => {
  if (!value) return "active";
  return value.replaceAll("_", " ");
};

const formatEventGroupLabel = (group: string) => {
  if (group === "reports_received") return "Reports Received";
  if (group === "reports_filed") return "Reports Filed";
  if (group === "disputes") return "Disputes";
  if (group === "penalties") return "Penalties";
  return "Audit";
};

const eventBadgeClassByGroup = (group: string) => {
  if (group === "penalties") {
    return "inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700";
  }
  if (group === "disputes") {
    return "inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700";
  }
  if (group === "audit") {
    return "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700";
  }
  return "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700";
};

const ADMIN_EMAIL_ALLOWLIST = new Set([
  "twenty_illkid@msn.com",
  "fongpoman114@gmail.com",
  "kuriocollectives@gmail.com",
]);

const AdminSafety = () => {
  const { profile, user, loading: authLoading, hydrating } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("reports");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [reportsQueue, setReportsQueue] = useState<ReportsQueueRow[]>([]);
  const [disputesQueue, setDisputesQueue] = useState<DisputesQueueRow[]>([]);
  const [usersQueue, setUsersQueue] = useState<SafetyUserRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditTimelineRow[]>([]);
  const [demoReportTargetIds, setDemoReportTargetIds] = useState<Set<string>>(new Set());

  const [caseSelection, setCaseSelection] = useState<CaseSelection>(null);
  const [reportCasefile, setReportCasefile] = useState<ReportCasefileRow[]>([]);
  const [disputeCasefile, setDisputeCasefile] = useState<ServiceDisputeRow | null>(null);
  const [serviceChatPreview, setServiceChatPreview] = useState<ServiceChatRow | null>(null);
  const [userTimeline, setUserTimeline] = useState<SafetyUserTimelineRow[]>([]);
  const [userTimelineFilter, setUserTimelineFilter] = useState<"all" | "reports_received" | "reports_filed" | "disputes" | "penalties" | "audit">("all");
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
  const [usersSort, setUsersSort] = useState<SortState<UsersSortKey>>({
    key: "latest_safety_activity",
    direction: "desc",
  });
  const [usersSearch, setUsersSearch] = useState("");
  const [moderatorNote, setModeratorNote] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingReportAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reportsCaseFilter, setReportsCaseFilter] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [selectedReporterForPenalty, setSelectedReporterForPenalty] = useState<string | null>(null);
  const [shadowFlags, setShadowFlags] = useState<Record<RestrictionFlagKey, boolean>>({
    chat_disabled: false,
    discovery_hidden: false,
    social_posting_disabled: false,
    marketplace_hidden: false,
    service_disabled: false,
    map_hidden: false,
    map_disabled: false,
  });

  const selectedReportTargetId = caseSelection?.type === "report" ? caseSelection.targetUserId : null;
  const selectedDisputeId = caseSelection?.type === "dispute" ? caseSelection.disputeId : null;
  const selectedUserId = caseSelection?.type === "user" ? caseSelection.userId : null;
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

  const hasDemoMarker = (value: string | null | undefined) =>
    typeof value === "string" && value.includes(DEMO_FIXTURE_MARKER);

  const isDemoAuditRow = (row: AuditTimelineRow) => {
    if (hasDemoMarker(row.notes)) return true;
    if (row.details && typeof row.details === "object") {
      const payload = row.details as Record<string, unknown>;
      if (payload.demo_fixture_tag === DEMO_FIXTURE_MARKER) return true;
    }
    return false;
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
    const rows = [...reportsQueue].filter((row) => {
      if (reportsCaseFilter === "all") return true;
      return (row.case_status ?? "open") === reportsCaseFilter;
    });
    rows.sort((a, b) => {
      let result = 0;
      switch (reportsSort.key) {
        case "target_identity":
          result = compareStrings(
            `${a.target_display_name ?? ""} ${a.target_social_id ?? ""} ${a.target_user_id ?? ""}`,
            `${b.target_display_name ?? ""} ${b.target_social_id ?? ""} ${b.target_user_id ?? ""}`,
          );
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
        case "case_status":
          result = compareStrings(a.case_status, b.case_status);
          break;
      }
      return applyDirection(result, reportsSort.direction);
    });
    return rows;
  }, [reportsQueue, reportsSort, reportsCaseFilter]);

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
        case "source":
          result = compareStrings(a.action_source, b.action_source);
          break;
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

  const usersSorted = useMemo(() => {
    const rows = [...usersQueue];
    rows.sort((a, b) => {
      let result = 0;
      switch (usersSort.key) {
        case "identity":
          result = compareStrings(
            `${a.display_name ?? ""} ${a.social_id ?? ""} ${a.user_id ?? ""}`,
            `${b.display_name ?? ""} ${b.social_id ?? ""} ${b.user_id ?? ""}`,
          );
          break;
        case "moderation_state":
          result = compareStrings(a.moderation_state, b.moderation_state);
          break;
        case "reports_received":
          result = compareNumbers(a.reports_received, b.reports_received);
          break;
        case "reports_filed":
          result = compareNumbers(a.reports_filed, b.reports_filed);
          break;
        case "false_report_count":
          result = compareNumbers(a.false_report_count, b.false_report_count);
          break;
        case "penalty_count":
          result = compareNumbers(a.penalty_count, b.penalty_count);
          break;
        case "cumulative_penalty_score":
          result = compareNumbers(a.cumulative_penalty_score, b.cumulative_penalty_score);
          break;
        case "trust_weight":
          result = compareNumbers(a.trust_weight, b.trust_weight);
          break;
        case "disputes_involved":
          result = compareNumbers(a.disputes_involved, b.disputes_involved);
          break;
        case "latest_safety_activity":
          result = compareNumbers(parseTime(a.latest_safety_activity), parseTime(b.latest_safety_activity));
          break;
      }
      return applyDirection(result, usersSort.direction);
    });
    return rows;
  }, [usersQueue, usersSort]);

  const loadQueues = async () => {
    const userQuery = usersSearch.trim();
    const wildcard = `%${userQuery}%`;
    let usersSelect = supabase
      .from("view_admin_safety_users")
      .select("*")
      .order("latest_safety_activity", { ascending: false })
      .limit(500);
    if (userQuery.length > 0) {
      usersSelect = usersSelect.or(
        `display_name.ilike.${wildcard},social_id.ilike.${wildcard},user_id::text.ilike.${wildcard}`,
      );
    }

    const [reportsRes, disputesRes, auditRes, usersRes] = await Promise.all([
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
      usersSelect,
    ]);

    if (!reportsRes.error) {
      const reportRows = (reportsRes.data ?? []) as ReportsQueueRow[];
      setReportsQueue(reportRows);

      const targetIds = reportRows
        .map((row) => row.target_user_id)
        .filter((value): value is string => Boolean(value));

      if (targetIds.length > 0) {
        const { data: demoRows } = await supabase
          .from("view_admin_report_casefile")
          .select("target_user_id, details")
          .in("target_user_id", Array.from(new Set(targetIds)))
          .ilike("details", `%${DEMO_FIXTURE_MARKER}%`);

        const nextDemoIds = new Set<string>((demoRows ?? [])
          .map((row) => row.target_user_id)
          .filter((value): value is string => Boolean(value)));
        setDemoReportTargetIds(nextDemoIds);
      } else {
        setDemoReportTargetIds(new Set());
      }
    }
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
    if (!usersRes.error) setUsersQueue((usersRes.data ?? []) as unknown as SafetyUserRow[]);
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
        setServiceChatPreview(null);
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
    const loadUserTimeline = async () => {
      if (!selectedUserId) {
        setUserTimeline([]);
        return;
      }
      let query = supabase
        .from("view_admin_safety_user_timeline")
        .select("*")
        .eq("user_id", selectedUserId)
        .order("event_date", { ascending: false })
        .limit(400);
      if (userTimelineFilter !== "all") {
        query = query.eq("event_group", userTimelineFilter);
      }
      const { data } = await query;
      setUserTimeline((data ?? []) as unknown as SafetyUserTimelineRow[]);
    };

    void loadUserTimeline();
  }, [selectedUserId, userTimelineFilter]);

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
      service_disabled: sourceFlags.service_disabled === true,
      map_hidden: sourceFlags.map_hidden === true,
      map_disabled: sourceFlags.map_disabled === true,
    });
    const firstReporter = reportCasefile.find((row) => Boolean(row.reporter_user_id))?.reporter_user_id ?? null;
    setSelectedReporterForPenalty(firstReporter);
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
  const currentCaseStatus = reportHeader?.case_status ?? reportCasefile[0]?.case_status ?? "open";
  const reportDrawerIsDemo =
    (selectedReportTargetId ? demoReportTargetIds.has(selectedReportTargetId) : false) ||
    reportCasefile.some((row) => hasDemoMarker(row.details));

  const actionLabel = (action: PendingReportAction) => {
    if (action.action === "clear_restrictions") return "Clear Restrictions";
    if (action.action === "warn") return "Warn";
    if (action.action === "shadow_restrict") return "Shadow Restrict";
    if (action.action === "hard_ban") return "Hard Ban";
    if (action.action === "mark_dismissed") return "Mark Dismissed";
    if (action.action === "mark_false_report") return "Mark False Report";
    return action.pauseSentinel ? "Pause Sentinel" : "Resume Sentinel";
  };

  const needsNote = (action: PendingReportAction) => {
    return action.action === "hard_ban" || action.action === "mark_false_report";
  };

  const refreshSafetyData = async () => {
    setRefreshing(true);
    await loadQueues();
    if (selectedReportTargetId) await loadReportCasefile(selectedReportTargetId);
    if (selectedUserId) {
      let query = supabase
        .from("view_admin_safety_user_timeline")
        .select("*")
        .eq("user_id", selectedUserId)
        .order("event_date", { ascending: false })
        .limit(400);
      if (userTimelineFilter !== "all") {
        query = query.eq("event_group", userTimelineFilter);
      }
      const { data } = await query;
      setUserTimeline((data ?? []) as unknown as SafetyUserTimelineRow[]);
    }
    setRefreshing(false);
  };

  const openFalseReportAction = (reporterUserId: string | null) => {
    setSelectedReporterForPenalty(reporterUserId);
    openReportActionConfirm({
      action: "mark_false_report",
      reporterUserId,
    });
  };

  const openServiceChatPreview = async (serviceChatId: string | null) => {
    if (!serviceChatId) return;
    const { data } = await supabase
      .from("service_chats")
      .select("*")
      .eq("id", serviceChatId)
      .maybeSingle();
    setServiceChatPreview(data ?? null);
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
    if (pendingAction.action === "mark_false_report" && !pendingAction.reporterUserId) {
      setActionError("Select a reporter to penalize for false report.");
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
      p_reporter_user_id: pendingAction.action === "mark_false_report" ? pendingAction.reporterUserId ?? null : null,
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trust &amp; Safety Console</h1>
          <p className="text-sm text-muted-foreground">Read-only foundation for reports, disputes, and audit trail.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { void refreshSafetyData(); }} disabled={refreshing || loading}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading safety queues...</div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
          <TabsList>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="disputes">Disputes</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="reports" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">Case Status Filter</div>
              <select
                value={reportsCaseFilter}
                onChange={(event) => setReportsCaseFilter(event.target.value as "open" | "resolved" | "dismissed" | "all")}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
                <option value="all">All</option>
              </select>
            </div>
            <div className="rounded-xl border bg-card">
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-[920px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                    <tr className="text-left">
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "target_identity")}>
                          Target User
                          <span className={getSortIconClassName(reportsSort.key === "target_identity")}>{getSortIcon(reportsSort.direction)}</span>
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
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setReportsSort, "case_status")}>
                          Case Status
                          <span className={getSortIconClassName(reportsSort.key === "case_status")}>{getSortIcon(reportsSort.direction)}</span>
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
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0">
                                <a
                                  href={`/carerprofile?user_id=${row.target_user_id ?? ""}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="truncate text-sm font-medium underline decoration-dotted underline-offset-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name}
                                </a>
                                <a
                                  href={`/carerprofile?user_id=${row.target_user_id ?? ""}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).social}
                                </a>
                                <div className="font-mono text-[10px] text-muted-foreground/80">
                                  {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).fallback}
                                </div>
                              </div>
                              {row.target_user_id && demoReportTargetIds.has(row.target_user_id) ? (
                                <span className={demoBadgeClasses}>Demo</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">{row.report_count ?? 0}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{row.unique_reporters ?? 0}</td>
                          <td className="px-3 py-2">{row.total_score ?? 0}</td>
                          <td className="px-3 py-2">{formatDateTime(row.latest_report_at)}</td>
                          <td className="px-3 py-2 hidden lg:table-cell">{row.has_attachments ? 1 : 0}</td>
                          <td className="px-3 py-2 hidden xl:table-cell">
                            <span className={badgeClasses}>{formatCaseStatus(row.case_status)}</span>
                          </td>
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
                          <td className="px-3 py-2">
                            <a
                              href={`/carerprofile?user_id=${row.requester_id ?? ""}`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-sm font-medium underline decoration-dotted underline-offset-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).name}
                            </a>
                            <div className="text-xs text-muted-foreground">
                              {resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).social}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/80">
                              {resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).fallback}
                            </div>
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell">
                            <a
                              href={`/carerprofile?user_id=${row.provider_id ?? ""}`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-sm font-medium underline decoration-dotted underline-offset-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {resolveIdentityLabel(row.provider_display_name, row.provider_social_id, row.provider_id).name}
                            </a>
                            <div className="text-xs text-muted-foreground">
                              {resolveIdentityLabel(row.provider_display_name, row.provider_social_id, row.provider_id).social}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/80">
                              {resolveIdentityLabel(row.provider_display_name, row.provider_social_id, row.provider_id).fallback}
                            </div>
                          </td>
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

          <TabsContent value="users" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={usersSearch}
                onChange={(event) => setUsersSearch(event.target.value)}
                placeholder="Search name, @social_id, or UUID"
                className="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void refreshSafetyData();
                }}
                disabled={refreshing || loading}
              >
                Search
              </Button>
              {usersSearch.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setUsersSearch("");
                    void refreshSafetyData();
                  }}
                  disabled={refreshing || loading}
                >
                  Clear
                </Button>
              ) : null}
            </div>
            <div className="rounded-xl border bg-card">
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-[1180px] w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur supports-[backdrop-filter]:bg-muted/70">
                    <tr className="text-left">
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "identity")}>
                          Name
                          <span className={getSortIconClassName(usersSort.key === "identity")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "moderation_state")}>
                          Moderation
                          <span className={getSortIconClassName(usersSort.key === "moderation_state")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "reports_received")}>
                          Reports Received
                          <span className={getSortIconClassName(usersSort.key === "reports_received")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "reports_filed")}>
                          Reports Filed
                          <span className={getSortIconClassName(usersSort.key === "reports_filed")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden xl:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "false_report_count")}>
                          False Reports
                          <span className={getSortIconClassName(usersSort.key === "false_report_count")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "penalty_count")}>
                          Penalties
                          <span className={getSortIconClassName(usersSort.key === "penalty_count")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden xl:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "cumulative_penalty_score")}>
                          Penalty Score
                          <span className={getSortIconClassName(usersSort.key === "cumulative_penalty_score")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden xl:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "trust_weight")}>
                          Trust Weight
                          <span className={getSortIconClassName(usersSort.key === "trust_weight")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 hidden lg:table-cell">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "disputes_involved")}>
                          Disputes
                          <span className={getSortIconClassName(usersSort.key === "disputes_involved")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "latest_safety_activity")}>
                          Latest Activity
                          <span className={getSortIconClassName(usersSort.key === "latest_safety_activity")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersSorted.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          No users in safety index yet.
                        </td>
                      </tr>
                    ) : (
                      usersSorted.map((row) => {
                        const identity = resolveIdentityLabel(row.display_name, row.social_id, row.user_id);
                        return (
                          <tr
                            key={row.user_id ?? `${identity.name}-${identity.social}`}
                            className={`cursor-pointer border-b last:border-b-0 hover:bg-muted/30 ${row.is_banned_effective ? "opacity-80" : ""}`}
                            onClick={() => {
                              if (!row.user_id) return;
                              setCaseSelection({ type: "user", userId: row.user_id });
                            }}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{identity.name}</div>
                                  <div className="text-xs text-muted-foreground">{identity.social}</div>
                                  <div className="font-mono text-[10px] text-muted-foreground/80">{identity.fallback}</div>
                                </div>
                                {row.is_banned_effective ? <span className={badgeClasses}>Banned</span> : null}
                              </div>
                            </td>
                            <td className="px-3 py-2"><span className={badgeClasses}>{formatModerationState(row.moderation_state)}</span></td>
                            <td className="px-3 py-2">{row.reports_received ?? 0}</td>
                            <td className="px-3 py-2 hidden lg:table-cell">{row.reports_filed ?? 0}</td>
                            <td className="px-3 py-2 hidden xl:table-cell">{row.false_report_count ?? 0}</td>
                            <td className="px-3 py-2 hidden lg:table-cell">{row.penalty_count ?? 0}</td>
                            <td className="px-3 py-2 hidden xl:table-cell">{row.cumulative_penalty_score ?? 0}</td>
                            <td className="px-3 py-2 hidden xl:table-cell">{row.trust_weight ?? 0}</td>
                            <td className="px-3 py-2 hidden lg:table-cell">{row.disputes_involved ?? 0}</td>
                            <td className="px-3 py-2">{formatDateTime(row.latest_safety_activity)}</td>
                          </tr>
                        );
                      })
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
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setAuditSort, "source")}>
                          Source
                          <span className={getSortIconClassName(auditSort.key === "source")}>{getSortIcon(auditSort.direction)}</span>
                        </button>
                      </th>
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
                        <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          No audit entries yet.
                        </td>
                      </tr>
                    ) : (
                      auditSorted.map((row) => (
                        <tr key={row.audit_id} className="border-b last:border-b-0 align-top hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <span className={row.action_source === "sentinel" ? sentinelBadgeClasses : badgeClasses}>
                              {row.action_source === "sentinel" ? "Sentinel" : "Manual"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={badgeClasses}>{row.action}</span>
                              {isDemoAuditRow(row) ? <span className={demoBadgeClasses}>Demo</span> : null}
                            </div>
                          </td>
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
                  {resolveIdentityLabel(reportHeader?.target_display_name, reportHeader?.target_social_id, selectedReportTargetId).name}{" "}
                  ({resolveIdentityLabel(reportHeader?.target_display_name, reportHeader?.target_social_id, selectedReportTargetId).social})
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
                    <div>Case status: {formatCaseStatus(currentCaseStatus)}</div>
                    <div>Latest source: {reportHeader?.latest_action_source === "sentinel" ? "Sentinel" : "Manual"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeClasses}>Moderation: {currentReportState}</span>
                    <span className={badgeClasses}>
                      {currentAutomationPaused ? "Sentinel Paused" : "Sentinel Active"}
                    </span>
                    <span className={reportHeader?.latest_action_source === "sentinel" ? sentinelBadgeClasses : badgeClasses}>
                      {reportHeader?.latest_action_source === "sentinel" ? "Sentinel" : "Manual"}
                    </span>
                    {reportDrawerIsDemo ? (
                      <span className={demoBadgeClasses}>Demo Fixture</span>
                    ) : null}
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
                          {hasDemoMarker(row.details) ? <span className={demoBadgeClasses}>Demo</span> : null}
                        </div>
                        <div>
                          Reporter:{" "}
                          <a href={`/carerprofile?user_id=${row.reporter_user_id}`} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                            {resolveIdentityLabel(row.reporter_display_name, row.reporter_social_id, row.reporter_user_id).name}
                          </a>{" "}
                          <span className="text-muted-foreground">({resolveIdentityLabel(row.reporter_display_name, row.reporter_social_id, row.reporter_user_id).social})</span>
                          <span className="ml-2 text-xs text-muted-foreground">False-report count: {row.reporter_false_report_count ?? 0}</span>
                          {row.reporter_user_id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="ml-2 h-7 px-2 text-xs"
                              onClick={() => openFalseReportAction(row.reporter_user_id)}
                            >
                              Mark False Report
                            </Button>
                          ) : null}
                        </div>
                        <div>
                          Target:{" "}
                          <a href={`/carerprofile?user_id=${row.target_user_id}`} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                            {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name}
                          </a>{" "}
                          <span className="text-muted-foreground">({resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).social})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(row.categories ?? []).map((tag) => (
                            <span key={`${row.report_id}-${tag}`} className={badgeClasses}>{tag}</span>
                          ))}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{row.details ?? "-"}</div>
                        <div>Attachments: {(row.attachment_urls ?? []).length}</div>
                        {(row.attachment_urls ?? []).length > 0 ? (
                          <div className="space-y-1">
                            {(row.attachment_urls ?? []).map((url, index) => (
                              <div key={`${row.report_id}-att-${index}`} className="text-xs">
                                <a href={url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                                  Attachment {index + 1}
                                </a>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {row.support_subject ? (
                          <div className="text-xs text-muted-foreground">
                            Linked Support Ticket: {row.support_subject}
                          </div>
                        ) : null}
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
                      placeholder="Required for Hard Ban and Mark False Report."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Shadow Restriction Flags</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {restrictionFlagOptions.map((flag) => (
                        <label key={flag.key} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <div>
                            <div className="text-sm">{flag.label}</div>
                            <div className="text-xs text-muted-foreground">{flag.helper}</div>
                          </div>
                          <div className="shrink-0">
                            <Switch
                              checked={shadowFlags[flag.key]}
                              onCheckedChange={(checked) =>
                                setShadowFlags((prev) => ({ ...prev, [flag.key]: checked }))
                              }
                            />
                          </div>
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

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "clear_restrictions" })}>
                      Clear Restrictions
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
                      Pause Sentinel
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "mark_dismissed" })}>
                      Mark Dismissed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openFalseReportAction(selectedReporterForPenalty)}
                    >
                      Mark False Report
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
                  <div>
                    Requester:{" "}
                    <a
                      href={`/carerprofile?user_id=${disputeHeader?.requester_id ?? ""}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2"
                    >
                      {resolveIdentityLabel(disputeHeader?.requester_display_name, disputeHeader?.requester_social_id, disputeHeader?.requester_id).name}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      ({resolveIdentityLabel(disputeHeader?.requester_display_name, disputeHeader?.requester_social_id, disputeHeader?.requester_id).social})
                    </span>
                  </div>
                  <div>
                    Provider:{" "}
                    <a
                      href={`/carerprofile?user_id=${disputeHeader?.provider_id ?? ""}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-2"
                    >
                      {resolveIdentityLabel(disputeHeader?.provider_display_name, disputeHeader?.provider_social_id, disputeHeader?.provider_id).name}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      ({resolveIdentityLabel(disputeHeader?.provider_display_name, disputeHeader?.provider_social_id, disputeHeader?.provider_id).social})
                    </span>
                  </div>
                  <div className="font-mono text-xs">
                    Service Chat:{" "}
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => {
                        void openServiceChatPreview(disputeHeader?.service_chat_id ?? null);
                      }}
                    >
                      {disputeHeader?.service_chat_id ?? "-"}
                    </button>{" "}
                  </div>
                  <div className="font-mono text-xs">Payment intent: {disputeHeader?.stripe_payment_intent_id ?? "-"}</div>
                </section>

                <section className="rounded-lg border p-3 space-y-2">
                  <h3 className="font-semibold">Dispute Detail</h3>
                  <div className="whitespace-pre-wrap break-words">{disputeCasefile?.description ?? "-"}</div>
                  <div>Admin notes: {disputeCasefile?.admin_notes ?? "-"}</div>
                  <div>Evidence URLs: {(disputeCasefile?.evidence_urls ?? disputeHeader?.evidence_urls ?? []).length}</div>
                  {(disputeCasefile?.evidence_urls ?? disputeHeader?.evidence_urls ?? []).length > 0 ? (
                    <div className="space-y-1">
                      {(disputeCasefile?.evidence_urls ?? disputeHeader?.evidence_urls ?? []).map((url, index) => (
                        <div key={`${selectedDisputeId}-evidence-${index}`} className="text-xs">
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2"
                          >
                            Evidence {index + 1}
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                {serviceChatPreview ? (
                  <section className="rounded-lg border p-3 space-y-2">
                    <h3 className="font-semibold">Service Chat Preview (Read-only)</h3>
                    <div className="font-mono text-xs">Chat ID: {serviceChatPreview.id}</div>
                    <div>Status: {serviceChatPreview.status}</div>
                    <div>Requester finished: {serviceChatPreview.requester_mark_finished ? "Yes" : "No"}</div>
                    <div>Provider finished: {serviceChatPreview.provider_mark_finished ? "Yes" : "No"}</div>
                    <div>Request opened: {formatDateTime(serviceChatPreview.request_opened_at)}</div>
                    <div>Payout release requested: {formatDateTime(serviceChatPreview.payout_release_requested_at)}</div>
                    <div>Payout released: {formatDateTime(serviceChatPreview.payout_released_at)}</div>
                  </section>
                ) : null}
              </div>
            </>
          )}

          {caseSelection?.type === "user" && (
            <>
              <SheetHeader>
                <SheetTitle>User Safety Case File</SheetTitle>
                <SheetDescription>
                  {resolveIdentityLabel(
                    usersQueue.find((row) => row.user_id === selectedUserId)?.display_name,
                    usersQueue.find((row) => row.user_id === selectedUserId)?.social_id,
                    selectedUserId,
                  ).name}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <section className="rounded-lg border p-3 space-y-2">
                  <h3 className="font-semibold">User Summary</h3>
                  {(() => {
                    const userRow = usersQueue.find((row) => row.user_id === selectedUserId);
                    if (!userRow) {
                      return <p className="text-muted-foreground">No user summary found.</p>;
                    }
                    const identity = resolveIdentityLabel(userRow.display_name, userRow.social_id, userRow.user_id);
                    return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/carerprofile?user_id=${userRow.user_id ?? ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium underline decoration-dotted underline-offset-2"
                          >
                            {identity.name}
                          </a>
                          <span className="text-muted-foreground">{identity.social}</span>
                          {userRow.is_banned_effective ? <span className={badgeClasses}>Banned</span> : null}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground/80">{identity.fallback}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>Moderation state: {formatModerationState(userRow.moderation_state)}</div>
                          <div>Sentinel: {userRow.automation_paused ? "Paused" : "Active"}</div>
                          <div>Reports received: {userRow.reports_received ?? 0}</div>
                          <div>Reports filed: {userRow.reports_filed ?? 0}</div>
                          <div>False reports: {userRow.false_report_count ?? 0}</div>
                          <div>Penalty count: {userRow.penalty_count ?? 0}</div>
                          <div>Cumulative penalty score: {userRow.cumulative_penalty_score ?? 0}</div>
                          <div>Trust weight: {userRow.trust_weight ?? 0}</div>
                          <div>Disputes involved: {userRow.disputes_involved ?? 0}</div>
                          <div>Latest safety activity: {formatDateTime(userRow.latest_safety_activity)}</div>
                        </div>
                      </div>
                    );
                  })()}
                </section>

                <section className="rounded-lg border p-3 space-y-3">
                  <h3 className="font-semibold">Unified History Timeline</h3>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: "All" },
                      { id: "reports_received", label: "Reports Received" },
                      { id: "reports_filed", label: "Reports Filed" },
                      { id: "disputes", label: "Disputes" },
                      { id: "penalties", label: "Penalties" },
                      { id: "audit", label: "Audit" },
                    ].map((filter) => (
                      <Button
                        key={filter.id}
                        type="button"
                        size="sm"
                        variant={userTimelineFilter === filter.id ? "default" : "outline"}
                        onClick={() =>
                          setUserTimelineFilter(
                            filter.id as "all" | "reports_received" | "reports_filed" | "disputes" | "penalties" | "audit",
                          )
                        }
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                  {userTimeline.length === 0 ? (
                    <p className="text-muted-foreground">No timeline entries for this user.</p>
                  ) : (
                    <div className="space-y-2">
                      {userTimeline.map((event) => (
                        <div
                          key={`${event.event_group}-${event.related_id}-${event.event_date}`}
                          className="rounded-md border p-2 space-y-1"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={eventBadgeClassByGroup(event.event_group)}>
                              {formatEventGroupLabel(event.event_group)}
                            </span>
                            <span className={badgeClasses}>{event.event_type}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTime(event.event_date)}</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words">{event.description ?? "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            Source: {event.source ?? "-"} | Severity: {event.severity ?? "-"} | Related: {event.related_id ?? "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                : pendingAction?.action === "mark_false_report"
                  ? "This applies a false-report penalty to the selected reporter and writes immutable audit history."
                  : "This moderation action will be applied immediately and written to admin audit logs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingAction && needsNote(pendingAction) && !moderatorNote.trim() ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Moderator note is required before confirming.
            </div>
          ) : null}
          {pendingAction?.action === "mark_false_report" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="false-report-reporter-select">
                Reporter to penalize
              </label>
              <select
                id="false-report-reporter-select"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedReporterForPenalty ?? ""}
                onChange={(event) => {
                  const next = event.target.value || null;
                  setSelectedReporterForPenalty(next);
                  setPendingAction((prev) =>
                    prev
                      ? {
                          ...prev,
                          reporterUserId: next,
                        }
                      : prev,
                  );
                }}
              >
                <option value="">Select reporter</option>
                {Array.from(
                  new Map(
                    reportCasefile
                      .filter((row) => Boolean(row.reporter_user_id))
                      .map((row) => [row.reporter_user_id as string, row]),
                  ).values(),
                ).map((row) => (
                  <option key={`dialog-reporter-${row.report_id}`} value={row.reporter_user_id ?? ""}>
                    {resolveIdentityLabel(row.reporter_display_name, row.reporter_social_id, row.reporter_user_id).name} ({resolveIdentityLabel(row.reporter_display_name, row.reporter_social_id, row.reporter_user_id).social})
                  </option>
                ))}
              </select>
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
