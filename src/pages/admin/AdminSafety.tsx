import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";
import { PublicCarerProfileModal } from "@/components/service/PublicCarerProfileModal";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ReportsQueueRow = Database["public"]["Views"]["view_admin_reports_queue"]["Row"] & {
  target_display_name?: string | null;
  target_social_id?: string | null;
  moderation_state?: string | null;
  automation_paused?: boolean | null;
  restriction_flags?: Record<string, boolean> | null;
  case_status?: "open" | "resolved" | "dismissed" | null;
  latest_action_source?: "manual" | "sentinel" | null;
  latest_action?: string | null;
  latest_action_at?: string | null;
  latest_report_source?: string | null;
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
  source_origin?: string | null;
};
type DisputesQueueRow = Database["public"]["Views"]["view_admin_service_disputes_queue"]["Row"] & {
  requester_social_id?: string | null;
  provider_social_id?: string | null;
  evidence_urls?: string[] | null;
  decision_action?: string | null;
  decision_note?: string | null;
  decision_payload?: Record<string, unknown> | null;
  decision_actor_id?: string | null;
  decision_at?: string | null;
  decision_version?: number | null;
  total_paid_amount?: number | null;
  service_rate_amount?: number | null;
  customer_platform_fee_amount?: number | null;
  provider_platform_fee_amount?: number | null;
  provider_receives_amount?: number | null;
  customer_refund_amount?: number | null;
  huddle_retained_amount?: number | null;
  currency_code?: string | null;
};
type AuditTimelineRow = Database["public"]["Views"]["view_admin_safety_audit_timeline"]["Row"] & {
  action_source?: "manual" | "sentinel" | null;
};
type ServiceDisputeRow = Database["public"]["Tables"]["service_disputes"]["Row"] & {
  decision_action?: string | null;
  decision_note?: string | null;
  decision_payload?: Record<string, unknown> | null;
  decision_actor_id?: string | null;
  decision_at?: string | null;
  decision_version?: number | null;
};
type ServiceChatRow = Database["public"]["Tables"]["service_chats"]["Row"];
type ServiceChatMeta = {
  serviceLabel: string;
  bookingPeriodLabel: string;
  serviceDate: string | null;
};
type ServiceChatPreviewData = {
  service_chat_id: string;
  chat_id: string;
  status: string | null;
  requester_id: string | null;
  provider_id: string | null;
  requester_display_name: string | null;
  requester_social_id: string | null;
  provider_display_name: string | null;
  provider_social_id: string | null;
  request_opened_at: string | null;
  payout_release_requested_at: string | null;
  payout_released_at: string | null;
  messages: Array<{
    id: string;
    sender_id: string | null;
    sender_display_name: string | null;
    sender_social_id: string | null;
    content: string | null;
    created_at: string | null;
  }>;
};
type MediaViewerItem = {
  url: string;
  label: string;
};
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
  trust_score: number | null;
  moderation_adjustment: number | null;
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
  | "hard_ban"
  | "pause_sentinel"
  | "mark_dismissed"
  | "mark_false_report";

type PendingReportAction = {
  action: ReportAction;
  pauseSentinel?: boolean;
  reporterUserId?: string | null;
};

type DisputeDecisionAction =
  | "release_full"
  | "partial_refund"
  | "full_refund";

type PendingDisputeAction = {
  action: DisputeDecisionAction;
};

type PendingRestrictionToggle = {
  area: "reports" | "disputes";
  targetUserId: string;
  targetLabel: string;
  key: RestrictionFlagKey;
  nextEnabled: boolean;
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
  { key: "map_hidden", label: "Map Hidden", helper: "User is incognito and not publicly visible on map. Others cannot see this user, but the user can still see themselves on their own map." },
  { key: "map_disabled", label: "Map Disabled", helper: "User cannot pin alerts or create map alert pins." },
];

const restrictionImpactCopy: Record<RestrictionFlagKey, string> = {
  chat_disabled: "Blocks sending messages and starting chats.",
  discovery_hidden: "Removes user from discovery visibility to other users.",
  social_posting_disabled: "Blocks creating posts, comments, and replies.",
  marketplace_hidden: "Hides provider/carer profile from Service surfaces.",
  service_disabled: "Blocks requesting or starting service bookings.",
  map_hidden: "Hides map visibility to other users while preserving self-view.",
  map_disabled: "Blocks creating map pins and map alert reports.",
};

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

const parseAmount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const getDisputeTotalPaidValue = (
  totals: Record<string, number | null>,
  row: DisputesQueueRow,
) =>
  parseAmount(row.total_paid_amount) ??
  (row.service_chat_id ? totals[row.service_chat_id] ?? null : null);
const getDisputeServiceMeta = (
  map: Record<string, ServiceChatMeta | undefined>,
  row: DisputesQueueRow,
): ServiceChatMeta => {
  if (!row.service_chat_id) {
    return { serviceLabel: "Unknown Service", bookingPeriodLabel: "Unknown booking period", serviceDate: null };
  }
  return map[row.service_chat_id] ?? { serviceLabel: "Unknown Service", bookingPeriodLabel: "Unknown booking period", serviceDate: null };
};

const badgeClasses =
  "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground";
const demoBadgeClasses =
  "inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800";
const DEMO_FIXTURE_MARKER = "[DEMO_FIXTURE_ADMIN_SAFETY_V1]";
const automationBadgeClasses =
  "inline-flex items-center rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800";
const DEFAULT_WARN_MESSAGE =
  "Huddle only works when the neighborhood is safe and friendly for everyone.\nWe’ve noticed some recent activity on your account that doesn't quite align with our community standards.\nIf you think this is a mistake, please reach out to our team at support@huddle.pet";

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

const formatReportSourceOrigin = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized === "friends chats" || normalized === "chat" || normalized === "group chat") return "Friends Chats";
  if (normalized === "maps" || normalized === "map") return "Maps";
  if (normalized === "social") return "Social";
  if (normalized === "service chats" || normalized === "service chat" || normalized === "service") return "Service Chats";
  if (normalized === "other") return "Other";
  if (normalized === "unknown") return "Unknown";
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
};

const formatDisputeDecisionAction = (action: DisputeDecisionAction) => {
  if (action === "release_full") return "Release Full";
  if (action === "partial_refund") return "Partial Refund";
  return "Full Refund";
};

const formatMoneyAmount = (value: number) => value.toFixed(2);

const extractMoneyField = (payload: unknown, key: string): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  if (!source.money || typeof source.money !== "object") return null;
  return parseAmount((source.money as Record<string, unknown>)[key]);
};

const formatDisputeStatusLabel = (status: string | null | undefined) => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "open") return "Open";
  if (normalized === "under_review" || normalized === "awaiting_evidence") return "Under Review";
  if (normalized === "decision_ready") return "Decision Ready";
  if (normalized === "resolved_release_full") return "Resolved — Release Full";
  if (normalized === "resolved_partial_refund") return "Resolved — Partial Refund";
  if (normalized === "resolved_refund_full") return "Resolved — Full Refund";
  if (normalized === "resolved_hold") return "Under Review";
  return status ?? "-";
};

const formatCurrencyAmount = (currencyCode: string | null | undefined, amount: number) => {
  const code = (currencyCode ?? "HKD").toUpperCase();
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-HK", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `HK$${safeAmount.toFixed(2)}`;
  }
};

const stripDemoFixtureMarker = (value: string | null | undefined) => {
  if (!value) return "-";
  return value
    .replaceAll(DEMO_FIXTURE_MARKER, "")
    .replace(/\bOpen fixture\.\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const resolveStorageOrPublicUrl = (rawValue: string | null | undefined) => {
  const value = (rawValue ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.replace(/^\/+/, "");
  if (
    normalized.startsWith("notices/") ||
    normalized.startsWith("reports/") ||
    normalized.startsWith("attachments/")
  ) {
    return supabase.storage.from("notices").getPublicUrl(normalized).data.publicUrl;
  }
  if (normalized.startsWith("alerts/")) {
    return supabase.storage.from("alerts").getPublicUrl(normalized).data.publicUrl;
  }
  if (normalized.startsWith("http")) return normalized;
  return supabase.storage.from("notices").getPublicUrl(normalized).data.publicUrl;
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
  const { profile, user, session, loading: authLoading, hydrating } = useAuth();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ActiveTab>("reports");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [reportsQueue, setReportsQueue] = useState<ReportsQueueRow[]>([]);
  const [disputesQueue, setDisputesQueue] = useState<DisputesQueueRow[]>([]);
  const [usersQueue, setUsersQueue] = useState<SafetyUserRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditTimelineRow[]>([]);
  const [queueLoadError, setQueueLoadError] = useState<string | null>(null);
  const [demoReportTargetIds, setDemoReportTargetIds] = useState<Set<string>>(new Set());

  const [caseSelection, setCaseSelection] = useState<CaseSelection>(null);
  const [reportCasefile, setReportCasefile] = useState<ReportCasefileRow[]>([]);
  const [disputeCasefile, setDisputeCasefile] = useState<ServiceDisputeRow | null>(null);
  const [serviceChatPreview, setServiceChatPreview] = useState<ServiceChatPreviewData | null>(null);
  const [serviceChatPreviewOpen, setServiceChatPreviewOpen] = useState(false);
  const [profilePreviewUserId, setProfilePreviewUserId] = useState<string | null>(null);
  const [profilePreviewName, setProfilePreviewName] = useState<string>("");
  const [carerPreviewUserId, setCarerPreviewUserId] = useState<string | null>(null);
  const [userTimeline, setUserTimeline] = useState<SafetyUserTimelineRow[]>([]);
  const [userTimelineFilter, setUserTimelineFilter] = useState<"all" | "reports_received" | "reports_filed" | "disputes" | "penalties" | "audit">("all");
  const [serviceChatTotals, setServiceChatTotals] = useState<Record<string, number | null>>({});
  const [serviceChatMetaById, setServiceChatMetaById] = useState<Record<string, ServiceChatMeta>>({});
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
  const [warnMessageDraft, setWarnMessageDraft] = useState(DEFAULT_WARN_MESSAGE);
  const [pendingAction, setPendingAction] = useState<PendingReportAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [disputeAdminNote, setDisputeAdminNote] = useState("");
  const [pendingDisputeAction, setPendingDisputeAction] = useState<PendingDisputeAction | null>(null);
  const [disputeActionLoading, setDisputeActionLoading] = useState(false);
  const [disputeActionError, setDisputeActionError] = useState<string | null>(null);
  const [disputeActionSuccess, setDisputeActionSuccess] = useState<string | null>(null);
  const [partialRefundInput, setPartialRefundInput] = useState("");
  const [waiveCustomerPlatformFee, setWaiveCustomerPlatformFee] = useState(false);
  const [waiveProviderPlatformFee, setWaiveProviderPlatformFee] = useState(false);
  const [pendingRestrictionToggle, setPendingRestrictionToggle] = useState<PendingRestrictionToggle | null>(null);
  const [restrictionToggleLoading, setRestrictionToggleLoading] = useState(false);
  const [disputeRestrictionTarget, setDisputeRestrictionTarget] = useState<"requester" | "provider">("requester");
  const [disputeParticipantRestrictions, setDisputeParticipantRestrictions] = useState<
    Record<string, { marketplace_hidden: boolean; service_disabled: boolean }>
  >({});
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerTitle, setMediaViewerTitle] = useState("Media Viewer");
  const [mediaViewerItems, setMediaViewerItems] = useState<MediaViewerItem[]>([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
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
  const disputeHeader = selectedDisputeId
    ? disputeQueueById.get(selectedDisputeId)
    : undefined;

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
    const queryRaw = usersSearch.trim().toLowerCase();
    const queryNoAt = queryRaw.startsWith("@") ? queryRaw.slice(1) : queryRaw;
    const filtered = queryRaw
      ? usersQueue.filter((row) => {
          const displayName = (row.display_name ?? "").toLowerCase();
          const social = (row.social_id ?? "").toLowerCase();
          const socialWithAt = `@${social}`;
          const userId = (row.user_id ?? "").toLowerCase();
          return (
            displayName.includes(queryRaw) ||
            social.includes(queryNoAt) ||
            socialWithAt.includes(queryRaw) ||
            userId.includes(queryRaw)
          );
        })
      : usersQueue;
    const rows = [...filtered];
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
  }, [usersQueue, usersSort, usersSearch]);

  const loadQueues = async () => {
    const runLoad = async () => {
      const usersSelect = supabase
        .from("view_admin_safety_users")
        .select("*")
        .order("latest_safety_activity", { ascending: false })
        .limit(500);

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

      return { reportsRes, disputesRes, auditRes, usersRes };
    };

    const normalizeError = (error: { message?: string } | null | undefined) =>
      (error?.message || "").toLowerCase();
    const isAuthError = (error: { message?: string } | null | undefined) => {
      const text = normalizeError(error);
      return (
        text.includes("jwt") ||
        text.includes("token") ||
        text.includes("session") ||
        text.includes("unauthorized") ||
        text.includes("permission denied")
      );
    };

    setQueueLoadError(null);

    let { reportsRes, disputesRes, auditRes, usersRes } = await runLoad();

    const firstError = reportsRes.error || disputesRes.error || auditRes.error || usersRes.error;
    if (isAuthError(firstError)) {
      await supabase.auth.refreshSession();
      const retried = await runLoad();
      reportsRes = retried.reportsRes;
      disputesRes = retried.disputesRes;
      auditRes = retried.auditRes;
      usersRes = retried.usersRes;
    }

    const finalError = reportsRes.error || disputesRes.error || auditRes.error || usersRes.error;
    if (finalError) {
      setQueueLoadError(finalError.message || "Failed to load admin safety data.");
    }

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
          const meta: Record<string, ServiceChatMeta> = {};
          for (const chat of chats) {
            const typedChat = chat as ServiceChatRow;
            const quoteTotal = extractAmountFromPayload(typedChat.quote_card);
            const requestTotal = extractAmountFromPayload(typedChat.request_card);
            totals[typedChat.id] = quoteTotal ?? requestTotal ?? null;
            const requestCard =
              typedChat.request_card && typeof typedChat.request_card === "object"
                ? (typedChat.request_card as Record<string, unknown>)
                : {};
            const serviceTypes = Array.isArray(requestCard.serviceTypes)
              ? requestCard.serviceTypes.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : [];
            const primaryServiceType = String(requestCard.serviceType ?? requestCard.service_type ?? "").trim();
            const serviceLabel = serviceTypes.length > 0
              ? serviceTypes.join(" · ")
              : primaryServiceType || "Unknown Service";
            const requestedDates = Array.isArray(requestCard.requestedDates)
              ? requestCard.requestedDates.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : [];
            const requestedDate = typeof requestCard.requestedDate === "string" ? requestCard.requestedDate : null;
            const sortedDates = requestedDates.length > 0 ? [...requestedDates].sort() : requestedDate ? [requestedDate] : [];
            const firstDate = sortedDates.length > 0 ? sortedDates[0] : null;
            const lastDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
            const bookingPeriodLabel = firstDate
              ? firstDate === lastDate
                ? firstDate
                : `${firstDate} to ${lastDate}`
              : typedChat.request_opened_at
                ? formatDateTime(typedChat.request_opened_at)
                : "Unknown booking period";
            meta[typedChat.id] = {
              serviceLabel,
              bookingPeriodLabel,
              serviceDate: firstDate ?? typedChat.request_opened_at ?? null,
            };
          }
          setServiceChatTotals(totals);
          setServiceChatMetaById(meta);
        }
      } else {
        setServiceChatTotals({});
        setServiceChatMetaById({});
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

  const loadDisputeCasefile = async (disputeId: string | null) => {
    if (!disputeId) {
      setDisputeCasefile(null);
      setServiceChatPreview(null);
      setServiceChatPreviewOpen(false);
      return;
    }

    const { data } = await supabase
      .from("service_disputes")
      .select("*")
      .eq("id", disputeId)
      .maybeSingle();

    setDisputeCasefile((data as ServiceDisputeRow | null) ?? null);
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
    void loadDisputeCasefile(selectedDisputeId);
  }, [selectedDisputeId]);

  useEffect(() => {
    if (!selectedDisputeId) {
      setDisputeParticipantRestrictions({});
      return;
    }
    const run = async () => {
      const requesterId = disputeHeader?.requester_id ?? null;
      const providerId = disputeHeader?.provider_id ?? null;
      const entries = await Promise.all([
        requesterId ? loadRestrictionPairForUser(requesterId).then((flags) => [requesterId, flags] as const) : null,
        providerId ? loadRestrictionPairForUser(providerId).then((flags) => [providerId, flags] as const) : null,
      ]);
      const next: Record<string, { marketplace_hidden: boolean; service_disabled: boolean }> = {};
      for (const entry of entries) {
        if (!entry) continue;
        next[entry[0]] = entry[1];
      }
      setDisputeParticipantRestrictions(next);
    };
    void run();
  }, [selectedDisputeId, disputeHeader?.requester_id, disputeHeader?.provider_id]);

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

  useEffect(() => {
    setPendingDisputeAction(null);
    setDisputeActionError(null);
    setDisputeActionSuccess(null);
    setDisputeAdminNote("");
    setPartialRefundInput("");
    setWaiveCustomerPlatformFee(false);
    setWaiveProviderPlatformFee(false);
    setServiceChatPreview(null);
    setServiceChatPreviewOpen(false);
  }, [selectedDisputeId]);

  if (authLoading || hydrating) {
    return <div className="p-4 md:p-6 text-sm text-muted-foreground">Checking admin access...</div>;
  }

  if (!session && !user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if ((session || user) && !profile) {
    return <div className="p-4 md:p-6 text-sm text-muted-foreground">Resolving admin access...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const reportHeader = selectedReportTargetId
    ? reportQueueByTarget.get(selectedReportTargetId)
    : undefined;
  const currentDisputeMeta: ServiceChatMeta = disputeHeader
    ? getDisputeServiceMeta(serviceChatMetaById, disputeHeader)
    : { serviceLabel: "Unknown Service", bookingPeriodLabel: "Unknown booking period", serviceDate: null };
  const currentReportState = reportHeader?.moderation_state ?? reportCasefile[0]?.moderation_state ?? "active";
  const currentAutomationPaused =
    reportHeader?.automation_paused ?? reportCasefile[0]?.automation_paused ?? false;
  const currentCaseStatus = reportHeader?.case_status ?? reportCasefile[0]?.case_status ?? "open";
  const reportDrawerIsDemo =
    (selectedReportTargetId ? demoReportTargetIds.has(selectedReportTargetId) : false) ||
    reportCasefile.some((row) => hasDemoMarker(row.details));
  const disputePayload = disputeCasefile?.decision_payload ?? disputeHeader?.decision_payload ?? null;
  const disputeTotalPaidAmount = Math.max(
    parseAmount(disputeHeader?.total_paid_amount) ??
    extractMoneyField(disputePayload, "total_paid_amount") ??
    getDisputeTotalPaidValue(serviceChatTotals, disputeHeader ?? ({} as DisputesQueueRow)) ??
    0,
    0,
  );
  const disputeCustomerPlatformFeeAmount = Math.max(
    parseAmount(disputeHeader?.customer_platform_fee_amount) ??
    extractMoneyField(disputePayload, "customer_platform_fee_amount") ??
    extractMoneyField(disputePayload, "platform_fee_amount") ??
    0,
    0,
  );
  const disputeProviderPlatformFeeAmount = Math.max(
    parseAmount(disputeHeader?.provider_platform_fee_amount) ??
    extractMoneyField(disputePayload, "provider_platform_fee_amount") ??
    extractMoneyField(disputePayload, "platform_fee_amount") ??
    disputeCustomerPlatformFeeAmount,
    0,
  );
  const disputeServiceRateAmount = Math.max(
    parseAmount(disputeHeader?.service_rate_amount) ??
    extractMoneyField(disputePayload, "service_rate_amount") ??
    (disputeTotalPaidAmount - disputeCustomerPlatformFeeAmount),
    0,
  );
  const disputeExistingRefundAmount = Math.max(
    parseAmount(disputeHeader?.customer_refund_amount) ??
    extractMoneyField(disputePayload, "customer_refund_amount") ??
    0,
    0,
  );
  const disputeExistingProviderOnFullReleaseAmount = Math.max(
    disputeServiceRateAmount - disputeProviderPlatformFeeAmount,
    0,
  );
  const disputeExistingProviderAmount = Math.max(
    parseAmount(disputeHeader?.provider_receives_amount) ??
    extractMoneyField(disputePayload, "provider_receives_amount") ??
    disputeExistingProviderOnFullReleaseAmount,
    0,
  );
  const disputeExistingHuddleRetainedAmount = Math.max(
    parseAmount(disputeHeader?.huddle_retained_amount) ??
    extractMoneyField(disputePayload, "huddle_retained_amount") ??
    Math.max(disputeTotalPaidAmount - disputeExistingProviderAmount - disputeExistingRefundAmount, 0),
    0,
  );
  const disputeCurrencyCode =
    disputeHeader?.currency_code ??
    (typeof disputeHeader?.decision_payload === "object" &&
    disputeHeader?.decision_payload &&
    typeof (disputeHeader.decision_payload as Record<string, unknown>).money === "object"
      ? ((
          (disputeHeader.decision_payload as Record<string, unknown>).money as Record<string, unknown>
        ).currency as string | undefined)
      : undefined) ??
    "HKD";
  const disputeDecisionSourceLabel = (() => {
    if (!disputeHeader?.decision_action) return "No Decision Yet";
    const source =
      typeof disputeHeader?.decision_payload === "object" &&
      disputeHeader?.decision_payload &&
      typeof (disputeHeader.decision_payload as Record<string, unknown>).source === "string"
        ? String((disputeHeader.decision_payload as Record<string, unknown>).source).toLowerCase()
        : "manual";
    if (source === "sentinel") return "Automation";
    return "Manual";
  })();
  const actionLabel = (action: PendingReportAction) => {
    if (action.action === "clear_restrictions") return "Clear Restrictions";
    if (action.action === "warn") return "Warn";
    if (action.action === "hard_ban") return "Hard Ban";
    if (action.action === "mark_dismissed") return "Mark Dismissed";
    if (action.action === "mark_false_report") return "Mark False Report";
    return action.pauseSentinel ? "Automation: Off" : "Automation: On";
  };

  const needsNote = (action: PendingReportAction) => {
    return action.action === "hard_ban" || action.action === "mark_false_report";
  };

  const refreshSafetyData = async () => {
    setRefreshing(true);
    await loadQueues();
    if (selectedReportTargetId) await loadReportCasefile(selectedReportTargetId);
    if (selectedDisputeId) await loadDisputeCasefile(selectedDisputeId);
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

  async function loadRestrictionPairForUser(userId: string | null | undefined) {
    if (!userId) return { marketplace_hidden: false, service_disabled: false };
    const [marketplaceRes, serviceRes] = await Promise.all([
      supabase.rpc("is_user_restriction_active" as never, {
        p_user_id: userId,
        p_restriction_key: "marketplace_hidden",
      } as never),
      supabase.rpc("is_user_restriction_active" as never, {
        p_user_id: userId,
        p_restriction_key: "service_disabled",
      } as never),
    ]);
    return {
      marketplace_hidden: marketplaceRes.data === true,
      service_disabled: serviceRes.data === true,
    };
  }

  const refreshDisputeParticipantRestrictions = async () => {
    const requesterId = disputeHeader?.requester_id ?? null;
    const providerId = disputeHeader?.provider_id ?? null;
    const entries = await Promise.all([
      requesterId ? loadRestrictionPairForUser(requesterId).then((flags) => [requesterId, flags] as const) : null,
      providerId ? loadRestrictionPairForUser(providerId).then((flags) => [providerId, flags] as const) : null,
    ]);
    const next: Record<string, { marketplace_hidden: boolean; service_disabled: boolean }> = {};
    for (const entry of entries) {
      if (!entry) continue;
      next[entry[0]] = entry[1];
    }
    setDisputeParticipantRestrictions(next);
  };

  const executeRestrictionToggle = async (toggle: PendingRestrictionToggle) => {
    if (restrictionToggleLoading) return;
    setRestrictionToggleLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const restrictionOption = restrictionFlagOptions.find((option) => option.key === toggle.key);
    const note = moderatorNote.trim() || null;
    const { error } = await supabase.rpc(
      "admin_set_user_restriction" as never,
      {
        p_target_user_id: toggle.targetUserId,
        p_restriction_key: toggle.key,
        p_enabled: toggle.nextEnabled,
        p_note: note,
        p_source: "manual",
      } as never,
    );
    setRestrictionToggleLoading(false);
    if (error) {
      if (toggle.area === "reports") {
        setActionError(error.message || "Failed to update restriction.");
      } else {
        setDisputeActionError(error.message || "Failed to update dispute restriction.");
      }
      return;
    }
    if (toggle.area === "reports") {
      setShadowFlags((prev) => ({ ...prev, [toggle.key]: toggle.nextEnabled }));
      setActionSuccess(
        `${restrictionOption?.label ?? toggle.key} ${toggle.nextEnabled ? "enabled" : "disabled"}${toggle.nextEnabled ? " (72h default)" : ""}.`,
      );
    } else {
      setDisputeActionSuccess(
        `${restrictionOption?.label ?? toggle.key} ${toggle.nextEnabled ? "enabled" : "disabled"} for ${toggle.targetLabel}.`,
      );
    }
    await loadQueues();
    if (selectedReportTargetId) await loadReportCasefile(selectedReportTargetId);
    if (selectedDisputeId) {
      await loadDisputeCasefile(selectedDisputeId);
      await refreshDisputeParticipantRestrictions();
    }
    setPendingRestrictionToggle(null);
  };

  const handleRestrictionSwitch = (
    area: "reports" | "disputes",
    targetUserId: string | null | undefined,
    targetLabel: string,
    key: RestrictionFlagKey,
    nextEnabled: boolean,
  ) => {
    if (!targetUserId) return;
    if (nextEnabled) {
      setPendingRestrictionToggle({
        area,
        targetUserId,
        targetLabel,
        key,
        nextEnabled,
      });
      return;
    }
    void executeRestrictionToggle({
      area,
      targetUserId,
      targetLabel,
      key,
      nextEnabled,
    });
  };

  const openServiceChatPreview = async (serviceChatId: string | null) => {
    if (!serviceChatId) return;
    const { data, error } = await supabase.rpc(
      "admin_get_service_chat_preview" as never,
      { p_service_chat_id: serviceChatId } as never,
    );
    if (error) {
      setServiceChatPreview(null);
      setDisputeActionError(error.message || "Unable to load service chat preview.");
      return;
    }
    const preview = (data as ServiceChatPreviewData | null) ?? null;
    setServiceChatPreview(preview);
    setServiceChatPreviewOpen(Boolean(preview));
  };

  const openPublicProfilePreview = (userId: string | null | undefined, fallbackName: string | null | undefined) => {
    if (!userId) return;
    setProfilePreviewUserId(userId);
    setProfilePreviewName(fallbackName ?? "Profile");
  };

  const openMediaViewer = (items: Array<string | null | undefined>, title: string) => {
    const normalized = items
      .map((item, index) => ({ url: resolveStorageOrPublicUrl(item), label: `Item ${index + 1}` }))
      .filter((item) => item.url.length > 0);
    if (normalized.length === 0) return;
    setMediaViewerTitle(title);
    setMediaViewerItems(normalized);
    setMediaViewerIndex(0);
    setMediaViewerOpen(true);
  };

  const openReportActionConfirm = (action: PendingReportAction) => {
    resetActionFeedback();
    setPendingAction(action);
    if (action.action === "warn") {
      setWarnMessageDraft(DEFAULT_WARN_MESSAGE);
    }
  };

  const openFalseReportAction = (reporterUserId: string | null) => {
    setSelectedReporterForPenalty(reporterUserId);
    openReportActionConfirm({
      action: "mark_false_report",
      reporterUserId,
    });
  };

  const resetDisputeActionFeedback = () => {
    setDisputeActionError(null);
    setDisputeActionSuccess(null);
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

    if (pendingAction.action === "clear_restrictions") {
      const { error } = await supabase.rpc(
        "admin_clear_user_restrictions" as never,
        {
          p_target_user_id: selectedReportTargetId,
          p_note: trimmedNote || null,
        } as never,
      );
      setActionLoading(false);
      if (error) {
        setActionError(error.message || "Failed to clear restrictions.");
        return;
      }
      setShadowFlags({
        chat_disabled: false,
        discovery_hidden: false,
        social_posting_disabled: false,
        marketplace_hidden: false,
        service_disabled: false,
        map_hidden: false,
        map_disabled: false,
      });
      setPendingAction(null);
      setActionSuccess("Cleared all active restrictions.");
      await loadQueues();
      await loadReportCasefile(selectedReportTargetId);
      return;
    }

    const payload: Record<string, unknown> = {
      p_target_user_id: selectedReportTargetId,
      p_action: pendingAction.action,
      p_note: trimmedNote || null,
      p_pause_sentinel: pendingAction.action === "pause_sentinel" ? pendingAction.pauseSentinel : null,
      p_reporter_user_id: pendingAction.action === "mark_false_report" ? pendingAction.reporterUserId ?? null : null,
      p_warn_message: pendingAction.action === "warn" ? warnMessageDraft.trim() : null,
    };

    payload.p_restriction_flags = {};

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

  const openDisputeActionConfirm = (action: DisputeDecisionAction) => {
    resetDisputeActionFeedback();
    setPendingDisputeAction({ action });
    setWaiveCustomerPlatformFee(action === "full_refund");
    setWaiveProviderPlatformFee(false);
    if (action === "partial_refund") {
      const existingServiceRefundPortion = Math.min(disputeExistingRefundAmount, disputeServiceRateAmount);
      const seedRefund = Math.min(existingServiceRefundPortion, disputeServiceRateAmount);
      setPartialRefundInput(seedRefund > 0 ? seedRefund.toFixed(2) : "");
    } else {
      setPartialRefundInput("");
    }
  };

  const getPendingDisputeBreakdown = () => {
    const totalPaid = disputeTotalPaidAmount;
    const serviceRate = disputeServiceRateAmount;
    const customerPlatformFee = disputeCustomerPlatformFeeAmount;
    const providerPlatformFee = disputeProviderPlatformFeeAmount;

    if (!pendingDisputeAction) {
      return {
        totalPaid,
        serviceRate,
        customerPlatformFee,
        providerPlatformFee,
        waiveCustomerPlatformFee: false,
        waiveProviderPlatformFee: false,
        providerReceivesOnFullRelease: Math.max(serviceRate - providerPlatformFee, 0),
        providerReceives: disputeExistingProviderAmount,
        customerRefunded: disputeExistingRefundAmount,
        huddleRetains: disputeExistingHuddleRetainedAmount,
      };
    }

    const waiveCustomerFeeEffective = waiveCustomerPlatformFee;
    const waiveProviderFeeEffective = pendingDisputeAction.action === "full_refund" ? false : waiveProviderPlatformFee;
    const providerFeeDeduction = waiveProviderFeeEffective ? 0 : providerPlatformFee;
    const providerReceivesOnFullRelease = Math.max(serviceRate - providerFeeDeduction, 0);
    if (pendingDisputeAction.action === "release_full") {
      const customerRefunded = waiveCustomerFeeEffective ? customerPlatformFee : 0;
      const huddleRetains = Math.max(totalPaid - providerReceivesOnFullRelease - customerRefunded, 0);
      return {
        totalPaid,
        serviceRate,
        customerPlatformFee,
        providerPlatformFee,
        waiveCustomerPlatformFee: waiveCustomerFeeEffective,
        waiveProviderPlatformFee: waiveProviderFeeEffective,
        providerReceivesOnFullRelease,
        providerReceives: providerReceivesOnFullRelease,
        customerRefunded,
        huddleRetains,
      };
    }

    if (pendingDisputeAction.action === "full_refund") {
      const customerRefunded = serviceRate + (waiveCustomerFeeEffective ? customerPlatformFee : 0);
      const providerReceives = 0;
      const huddleRetains = Math.max(totalPaid - customerRefunded - providerReceives, 0);
      return {
        totalPaid,
        serviceRate,
        customerPlatformFee,
        providerPlatformFee,
        waiveCustomerPlatformFee: waiveCustomerFeeEffective,
        waiveProviderPlatformFee: false,
        providerReceivesOnFullRelease,
        providerReceives,
        customerRefunded,
        huddleRetains,
      };
    }

    const parsedServiceRefund = parseAmount(partialRefundInput) ?? 0;
    const serviceRefundPortion = Math.max(Math.min(parsedServiceRefund, serviceRate), 0);
    const customerFeeRefundPortion = waiveCustomerFeeEffective ? customerPlatformFee : 0;
    const customerRefunded = serviceRefundPortion + customerFeeRefundPortion;
    const providerReceives = Math.max(serviceRate - serviceRefundPortion - providerFeeDeduction, 0);
    const huddleRetains = Math.max(totalPaid - customerRefunded - providerReceives, 0);
    return {
      totalPaid,
      serviceRate,
      customerPlatformFee,
      providerPlatformFee,
      waiveCustomerPlatformFee: waiveCustomerFeeEffective,
      waiveProviderPlatformFee: waiveProviderFeeEffective,
      providerReceivesOnFullRelease,
      providerReceives,
      customerRefunded,
      huddleRetains,
    };
  };

  const executeDisputeAction = async () => {
    if (!selectedDisputeId || !pendingDisputeAction || disputeActionLoading) return;

    const trimmedNote = disputeAdminNote.trim();
    if (!trimmedNote) {
      setDisputeActionError("Admin note is required for dispute decisions.");
      return;
    }

    let refundAmount: number | null = null;
    if (pendingDisputeAction.action === "partial_refund") {
      const parsed = parseAmount(partialRefundInput);
      if (parsed === null || parsed < 0) {
        setDisputeActionError("Enter a valid service refund amount.");
        return;
      }
      const maxServiceRefund = disputeServiceRateAmount;
      refundAmount = Math.max(Math.min(parsed, maxServiceRefund), 0);
    }

    setDisputeActionLoading(true);
    setDisputeActionError(null);
    setDisputeActionSuccess(null);

    const { data, error } = await supabase.functions.invoke("execute-service-dispute-decision", {
      body: {
        dispute_id: selectedDisputeId,
        action: pendingDisputeAction.action,
        note: trimmedNote,
        customer_refund_amount: refundAmount,
        waive_customer_platform_fee: waiveCustomerPlatformFee,
        waive_provider_platform_fee: pendingDisputeAction.action === "full_refund" ? false : waiveProviderPlatformFee,
      },
    });

    if (error) {
      setDisputeActionLoading(false);
      setDisputeActionError(error.message || "Failed to apply dispute decision.");
      return;
    }
    if (data && typeof data === "object" && "error" in data) {
      const detail =
        typeof (data as Record<string, unknown>).detail === "string"
          ? String((data as Record<string, unknown>).detail)
          : "";
      const message = String((data as Record<string, unknown>).error || "Failed to apply dispute decision.");
      setDisputeActionLoading(false);
      setDisputeActionError(detail ? `${message}: ${detail}` : message);
      return;
    }

    setPendingDisputeAction(null);
    setDisputeActionLoading(false);
    setDisputeActionSuccess(`Applied: ${formatDisputeDecisionAction(pendingDisputeAction.action)}.`);
    await loadQueues();
    await loadDisputeCasefile(selectedDisputeId);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 md:px-6 lg:px-8 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trust &amp; Safety Console</h1>
          <p className="text-sm text-muted-foreground">Read-only foundation for reports, disputes, and audit trail.</p>
          {queueLoadError ? <p className="mt-1 text-sm text-red-600">{queueLoadError}</p> : null}
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
                      <th className="px-3 py-2 hidden xl:table-cell">Latest Source</th>
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
                        <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
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
                                <button
                                  type="button"
                                  className="truncate text-sm font-medium underline decoration-dotted underline-offset-2"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openPublicProfilePreview(
                                      row.target_user_id,
                                      resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name,
                                    );
                                  }}
                                >
                                  {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name}
                                </button>
                                <button
                                  type="button"
                                  className="block text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openPublicProfilePreview(
                                      row.target_user_id,
                                      resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name,
                                    );
                                  }}
                                >
                                  {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).social}
                                </button>
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
                          <td className="px-3 py-2 hidden xl:table-cell">{formatReportSourceOrigin(row.latest_report_source ?? null)}</td>
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
                          <td className="px-3 py-2">
                            <div className="text-sm font-medium">{getDisputeServiceMeta(serviceChatMetaById, row).serviceLabel}</div>
                            <div className="text-xs text-muted-foreground">
                              Booking period: {getDisputeServiceMeta(serviceChatMetaById, row).bookingPeriodLabel}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/80">
                              Booking ID: {row.service_chat_id ?? "-"}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="truncate text-sm font-medium underline decoration-dotted underline-offset-2"
                              onClick={(event) => {
                                event.stopPropagation();
                                openPublicProfilePreview(
                                  row.requester_id,
                                  resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).name,
                                );
                              }}
                            >
                              {resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).name}
                            </button>
                            <div className="text-xs text-muted-foreground">
                              {resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).social}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/80">
                              {resolveIdentityLabel(row.requester_display_name, row.requester_social_id, row.requester_id).fallback}
                            </div>
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell">
                            <button
                              type="button"
                              className="truncate text-sm font-medium underline decoration-dotted underline-offset-2"
                              onClick={(event) => {
                                event.stopPropagation();
                                setCarerPreviewUserId(row.provider_id ?? null);
                              }}
                            >
                              {resolveIdentityLabel(row.provider_display_name, row.provider_social_id, row.provider_id).name}
                            </button>
                            <div className="text-xs text-muted-foreground">
                              {resolveIdentityLabel(row.provider_display_name, row.provider_social_id, row.provider_id).social}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground/80">
                              {resolveIdentityLabel(row.provider_display_name, row.provider_social_id, row.provider_id).fallback}
                            </div>
                          </td>
                          <td className="px-3 py-2 hidden xl:table-cell">
                            {getDisputeTotalPaidValue(serviceChatTotals, row) !== null
                              ? formatCurrencyAmount(row.currency_code, getDisputeTotalPaidValue(serviceChatTotals, row) ?? 0)
                              : "-"}
                          </td>
                          <td className="px-3 py-2"><span className={badgeClasses}>{formatDisputeStatusLabel(row.dispute_status)}</span></td>
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
                          Moderation State
                          <span className={getSortIconClassName(usersSort.key === "moderation_state")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "reports_received")}>
                          Reports Received
                          <span className={getSortIconClassName(usersSort.key === "reports_received")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "reports_filed")}>
                          Reports Filed
                          <span className={getSortIconClassName(usersSort.key === "reports_filed")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "false_report_count")}>
                          False Reports Count
                          <span className={getSortIconClassName(usersSort.key === "false_report_count")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "penalty_count")}>
                          Penalty Count
                          <span className={getSortIconClassName(usersSort.key === "penalty_count")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "cumulative_penalty_score")}>
                          Cumulative Penalty Score
                          <span className={getSortIconClassName(usersSort.key === "cumulative_penalty_score")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "trust_weight")}>
                          Trust Weight
                          <span className={getSortIconClassName(usersSort.key === "trust_weight")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "disputes_involved")}>
                          Disputes Involved
                          <span className={getSortIconClassName(usersSort.key === "disputes_involved")}>{getSortIcon(usersSort.direction)}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2">
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort(setUsersSort, "latest_safety_activity")}>
                          Latest Safety Activity
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
                            <td className="px-3 py-2">{row.reports_filed ?? 0}</td>
                            <td className="px-3 py-2">{row.false_report_count ?? 0}</td>
                            <td className="px-3 py-2">{row.penalty_count ?? 0}</td>
                            <td className="px-3 py-2">{row.cumulative_penalty_score ?? 0}</td>
                            <td className="px-3 py-2">{row.trust_weight ?? 0}</td>
                            <td className="px-3 py-2">{row.disputes_involved ?? 0}</td>
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
                            <span className={row.action_source === "sentinel" ? automationBadgeClasses : badgeClasses}>
                              {row.action_source === "sentinel" ? "Automation" : "Manual"}
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

      <Sheet modal={false} open={caseSelection !== null} onOpenChange={(open) => !open && setCaseSelection(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[720px] lg:max-w-[860px] overflow-y-auto"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
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
                    <div>Latest Source: {formatReportSourceOrigin(reportHeader?.latest_report_source ?? null)}</div>
                    <div>Case status: {formatCaseStatus(currentCaseStatus)}</div>
                    <div>Automation: {currentAutomationPaused ? "Off" : "On"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={badgeClasses}>Moderation: {formatModerationState(currentReportState)}</span>
                    <span className={currentAutomationPaused ? badgeClasses : automationBadgeClasses}>
                      {currentAutomationPaused ? "Automation: Off" : "Automation: On"}
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
                          <span className={badgeClasses}>Source: {formatReportSourceOrigin(row.source_origin ?? null)}</span>
                          {hasDemoMarker(row.details) ? <span className={demoBadgeClasses}>Demo</span> : null}
                        </div>
                        <div>
                          Reporter:{" "}
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-2"
                            onClick={() =>
                              openPublicProfilePreview(
                                row.reporter_user_id,
                                resolveIdentityLabel(row.reporter_display_name, row.reporter_social_id, row.reporter_user_id).name,
                              )
                            }
                          >
                            {resolveIdentityLabel(row.reporter_display_name, row.reporter_social_id, row.reporter_user_id).name}
                          </button>{" "}
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
                          <button
                            type="button"
                            className="underline decoration-dotted underline-offset-2"
                            onClick={() =>
                              openPublicProfilePreview(
                                row.target_user_id,
                                resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name,
                              )
                            }
                          >
                            {resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).name}
                          </button>{" "}
                          <span className="text-muted-foreground">({resolveIdentityLabel(row.target_display_name, row.target_social_id, row.target_user_id).social})</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(row.categories ?? []).map((tag) => (
                            <span key={`${row.report_id}-${tag}`} className={badgeClasses}>{tag}</span>
                          ))}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{row.details ?? "-"}</div>
                        <div className="flex items-center gap-2">
                          <span>Attachments: {(row.attachment_urls ?? []).length}</span>
                          {(row.attachment_urls ?? []).length > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openMediaViewer(row.attachment_urls ?? [], "Report Attachments")}
                            >
                              View
                            </Button>
                          ) : null}
                        </div>
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
                                handleRestrictionSwitch(
                                  "reports",
                                  selectedReportTargetId,
                                  resolveIdentityLabel(
                                    reportHeader?.target_display_name,
                                    reportHeader?.target_social_id,
                                    selectedReportTargetId,
                                  ).name,
                                  flag.key,
                                  checked,
                                )
                              }
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">Automation</div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{currentAutomationPaused ? "Automation: Off" : "Automation: On"}</span>
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

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "clear_restrictions" })}>
                      Clear Restrictions
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openReportActionConfirm({ action: "warn" })}>
                      Warn
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => openReportActionConfirm({ action: "hard_ban" })}
                    >
                      Hard Ban
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
                  <div className="rounded-md border bg-muted/20 p-2">
                    <div className="text-sm font-medium">
                      Service booked: {currentDisputeMeta.serviceLabel}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Booking period: {currentDisputeMeta.bookingPeriodLabel}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground/80">
                      Booking ID: {disputeHeader?.service_chat_id ?? "-"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Status: {formatDisputeStatusLabel(disputeHeader?.dispute_status)}</div>
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
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() =>
                        openPublicProfilePreview(
                          disputeHeader?.requester_id ?? null,
                          resolveIdentityLabel(disputeHeader?.requester_display_name, disputeHeader?.requester_social_id, disputeHeader?.requester_id).name,
                        )
                      }
                    >
                      {resolveIdentityLabel(disputeHeader?.requester_display_name, disputeHeader?.requester_social_id, disputeHeader?.requester_id).name}
                    </button>{" "}
                    <span className="text-muted-foreground">
                      ({resolveIdentityLabel(disputeHeader?.requester_display_name, disputeHeader?.requester_social_id, disputeHeader?.requester_id).social})
                    </span>
                  </div>
                  <div>
                    Provider:{" "}
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => setCarerPreviewUserId(disputeHeader?.provider_id ?? null)}
                    >
                      {resolveIdentityLabel(disputeHeader?.provider_display_name, disputeHeader?.provider_social_id, disputeHeader?.provider_id).name}
                    </button>{" "}
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
                        <div className="whitespace-pre-wrap break-words">{stripDemoFixtureMarker(disputeCasefile?.description)}</div>
                  <div>Admin notes: {stripDemoFixtureMarker(disputeCasefile?.admin_notes)}</div>
                  <div className="flex items-center gap-2">
                    <span>Evidence: {(disputeCasefile?.evidence_urls ?? disputeHeader?.evidence_urls ?? []).length}</span>
                    {(disputeCasefile?.evidence_urls ?? disputeHeader?.evidence_urls ?? []).length > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openMediaViewer(disputeCasefile?.evidence_urls ?? disputeHeader?.evidence_urls ?? [], "Dispute Evidence")}
                      >
                        View
                      </Button>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-lg border p-3 space-y-3">
                  <h3 className="font-semibold">Dispute Decision Controls</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badgeClasses}>Status: {formatDisputeStatusLabel(disputeHeader?.dispute_status)}</span>
                    <span className={badgeClasses}>
                      Decision Source: {disputeDecisionSourceLabel}
                    </span>
                    {disputeHeader?.decision_at ? (
                      <span className={badgeClasses}>Last Decision: {formatDateTime(disputeHeader.decision_at)}</span>
                    ) : null}
                  </div>

                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-sm font-medium text-amber-900">Funds on Hold</div>
                    <div className="text-xs text-amber-800">
                      This dispute keeps payout on hold until a final decision is recorded.
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Total Paid</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeTotalPaidAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Service Rate</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeServiceRateAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Customer Platform Fee</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeCustomerPlatformFeeAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Provider Platform Fee</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeProviderPlatformFeeAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Provider Receives (Full Release)</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeExistingProviderOnFullReleaseAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Provider Receives</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeExistingProviderAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Customer Refunded</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeExistingRefundAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Huddle Retains</div>
                      <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, disputeExistingHuddleRetainedAmount)}</div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Dispute Restrictions (72h default)</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">Apply to:</span>
                      <select
                        value={disputeRestrictionTarget}
                        onChange={(event) => setDisputeRestrictionTarget(event.target.value as "requester" | "provider")}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="requester">Requester</option>
                        <option value="provider">Provider</option>
                      </select>
                    </div>
                    {(() => {
                      const targetUserId =
                        disputeRestrictionTarget === "provider" ? (disputeHeader?.provider_id ?? null) : (disputeHeader?.requester_id ?? null);
                      const targetLabel =
                        disputeRestrictionTarget === "provider"
                          ? resolveIdentityLabel(disputeHeader?.provider_display_name, disputeHeader?.provider_social_id, disputeHeader?.provider_id).name
                          : resolveIdentityLabel(disputeHeader?.requester_display_name, disputeHeader?.requester_social_id, disputeHeader?.requester_id).name;
                      const targetRestrictions = targetUserId ? disputeParticipantRestrictions[targetUserId] : undefined;
                      return (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="flex items-center justify-between rounded-md border px-3 py-2">
                            <div>
                              <div className="text-sm">Marketplace Hidden</div>
                              <div className="text-xs text-muted-foreground">Hide provider profile from Service surfaces.</div>
                            </div>
                            <Switch
                              checked={targetRestrictions?.marketplace_hidden === true}
                              onCheckedChange={(checked) =>
                                handleRestrictionSwitch("disputes", targetUserId, targetLabel, "marketplace_hidden", checked)
                              }
                            />
                          </label>
                          <label className="flex items-center justify-between rounded-md border px-3 py-2">
                            <div>
                              <div className="text-sm">Service Access Disabled</div>
                              <div className="text-xs text-muted-foreground">Block starting booking/request flows.</div>
                            </div>
                            <Switch
                              checked={targetRestrictions?.service_disabled === true}
                              onCheckedChange={(checked) =>
                                handleRestrictionSwitch("disputes", targetUserId, targetLabel, "service_disabled", checked)
                              }
                            />
                          </label>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="dispute-admin-note">
                      Admin Note (required)
                    </label>
                    <Textarea
                      id="dispute-admin-note"
                      value={disputeAdminNote}
                      onChange={(event) => setDisputeAdminNote(event.target.value)}
                      placeholder="Explain the decision for audit history."
                      rows={3}
                    />
                  </div>

                  {disputeActionError ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {disputeActionError}
                    </div>
                  ) : null}
                  {disputeActionSuccess ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {disputeActionSuccess}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Button type="button" variant="outline" onClick={() => openDisputeActionConfirm("release_full")}>
                      Release Full
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openDisputeActionConfirm("partial_refund")}>
                      Partial Refund
                    </Button>
                    <Button type="button" variant="outline" onClick={() => openDisputeActionConfirm("full_refund")}>
                      Full Refund
                    </Button>
                  </div>
                </section>
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
                            href="#"
                            className="text-sm font-medium underline decoration-dotted underline-offset-2"
                            onClick={(event) => {
                              event.preventDefault();
                              openPublicProfilePreview(userRow.user_id, identity.name);
                            }}
                          >
                            {identity.name}
                          </a>
                          <span className="text-muted-foreground">{identity.social}</span>
                          {userRow.is_banned_effective ? <span className={badgeClasses}>Banned</span> : null}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground/80">{identity.fallback}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>Moderation state: {formatModerationState(userRow.moderation_state)}</div>
                          <div>Automation: {userRow.automation_paused ? "Off" : "On"}</div>
                          <div>Reports received: {userRow.reports_received ?? 0}</div>
                          <div>Reports filed: {userRow.reports_filed ?? 0}</div>
                          <div>False reports: {userRow.false_report_count ?? 0}</div>
                          <div>Penalty count: {userRow.penalty_count ?? 0}</div>
                          <div>Cumulative penalty score: {userRow.cumulative_penalty_score ?? 0}</div>
                          <div>Trust score (base): {userRow.trust_score ?? 0}</div>
                          <div>Moderation adjustment: {userRow.moderation_adjustment ?? 0}</div>
                          <div>Trust weight (effective): {userRow.trust_weight ?? 0}</div>
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

      <Dialog
        open={serviceChatPreviewOpen}
        onOpenChange={(open) => {
          setServiceChatPreviewOpen(open);
          if (!open) setServiceChatPreview(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[82vh] overflow-y-auto !z-[9400]">
          <DialogHeader>
            <DialogTitle>Service Chat Preview (Read-only)</DialogTitle>
            <DialogDescription>
              Admin preview for dispute context only.
            </DialogDescription>
          </DialogHeader>

          {serviceChatPreview ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="font-mono text-xs">Service Chat ID: {serviceChatPreview.service_chat_id}</div>
                <div className="font-mono text-xs">Chat ID: {serviceChatPreview.chat_id}</div>
                <div>Status: {serviceChatPreview.status ?? "-"}</div>
                <div>Opened: {formatDateTime(serviceChatPreview.request_opened_at)}</div>
              </div>
              <div className="rounded-md border p-3 space-y-1">
                <div>
                  Requester: {resolveIdentityLabel(serviceChatPreview.requester_display_name, serviceChatPreview.requester_social_id, serviceChatPreview.requester_id).name}{" "}
                  <span className="text-muted-foreground">({resolveIdentityLabel(serviceChatPreview.requester_display_name, serviceChatPreview.requester_social_id, serviceChatPreview.requester_id).social})</span>
                </div>
                <div>
                  Provider: {resolveIdentityLabel(serviceChatPreview.provider_display_name, serviceChatPreview.provider_social_id, serviceChatPreview.provider_id).name}{" "}
                  <span className="text-muted-foreground">({resolveIdentityLabel(serviceChatPreview.provider_display_name, serviceChatPreview.provider_social_id, serviceChatPreview.provider_id).social})</span>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Messages ({serviceChatPreview.messages.length})
                </div>
                {serviceChatPreview.messages.length === 0 ? (
                  <div className="text-muted-foreground">No messages found for this service chat.</div>
                ) : (
                  <div className="space-y-2">
                    {serviceChatPreview.messages.map((message) => (
                      <div key={message.id} className="rounded-md border p-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {resolveIdentityLabel(message.sender_display_name, message.sender_social_id, message.sender_id).name}{" "}
                            ({resolveIdentityLabel(message.sender_display_name, message.sender_social_id, message.sender_id).social})
                          </span>
                          <span>{formatDateTime(message.created_at)}</span>
                        </div>
                        <div className="whitespace-pre-wrap break-words">{message.content ?? "-"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No chat preview loaded.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={mediaViewerOpen}
        onOpenChange={(open) => {
          setMediaViewerOpen(open);
          if (!open) {
            setMediaViewerItems([]);
            setMediaViewerIndex(0);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[86vh] overflow-y-auto !z-[9500]">
          <DialogHeader>
            <DialogTitle>{mediaViewerTitle}</DialogTitle>
            <DialogDescription>
              {mediaViewerItems.length > 0 ? `Item ${mediaViewerIndex + 1} of ${mediaViewerItems.length}` : "No media items."}
            </DialogDescription>
          </DialogHeader>
          {mediaViewerItems.length > 0 ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-2">
                {/\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?.*)?$/i.test(mediaViewerItems[mediaViewerIndex].url) ? (
                  <img
                    src={mediaViewerItems[mediaViewerIndex].url}
                    alt={mediaViewerItems[mediaViewerIndex].label}
                    className="mx-auto max-h-[60vh] w-auto rounded-md object-contain"
                  />
                ) : (
                  <iframe
                    src={mediaViewerItems[mediaViewerIndex].url}
                    title={mediaViewerItems[mediaViewerIndex].label}
                    className="h-[60vh] w-full rounded-md border bg-white"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={mediaViewerIndex <= 0}
                  onClick={() => setMediaViewerIndex((prev) => Math.max(prev - 1, 0))}
                >
                  Prev
                </Button>
                <div className="text-xs text-muted-foreground">
                  {mediaViewerItems[mediaViewerIndex].url}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={mediaViewerIndex >= mediaViewerItems.length - 1}
                  onClick={() => setMediaViewerIndex((prev) => Math.min(prev + 1, mediaViewerItems.length - 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No media to preview.</div>
          )}
        </DialogContent>
      </Dialog>

      <PublicProfileSheet
        isOpen={Boolean(profilePreviewUserId)}
        onClose={() => {
          setProfilePreviewUserId(null);
          setProfilePreviewName("");
        }}
        loading={false}
        fallbackName={profilePreviewName}
        viewedUserId={profilePreviewUserId}
        data={null}
        zIndexBase={9100}
      />
      <PublicCarerProfileModal
        isOpen={Boolean(carerPreviewUserId)}
        providerUserId={carerPreviewUserId}
        onClose={() => setCarerPreviewUserId(null)}
        canRequestService={false}
        zIndexBase={9200}
      />

      <AlertDialog
        open={pendingRestrictionToggle !== null}
        onOpenChange={(open) => {
          if (!open && !restrictionToggleLoading) setPendingRestrictionToggle(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Restriction</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRestrictionToggle
                ? `${restrictionFlagOptions.find((option) => option.key === pendingRestrictionToggle.key)?.label ?? pendingRestrictionToggle.key} will be applied to ${pendingRestrictionToggle.targetLabel}.`
                : "Confirm restriction update."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingRestrictionToggle ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div>{restrictionImpactCopy[pendingRestrictionToggle.key]}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                This restriction lasts 72 hours by default and applies across sessions until expiry or manual clear.
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restrictionToggleLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restrictionToggleLoading || !pendingRestrictionToggle}
              onClick={(event) => {
                event.preventDefault();
                if (!pendingRestrictionToggle) return;
                void executeRestrictionToggle(pendingRestrictionToggle);
              }}
            >
              {restrictionToggleLoading ? "Applying..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  : pendingAction?.action === "warn"
                    ? "This sends a warning chat message to the user and updates moderation state to under review."
                  : "This moderation action will be applied immediately and written to admin audit logs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingAction && needsNote(pendingAction) && !moderatorNote.trim() ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Moderator note is required before confirming.
            </div>
          ) : null}
          {pendingAction?.action === "warn" ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="warn-message-draft">
                Warning message (editable)
              </label>
              <Textarea
                id="warn-message-draft"
                value={warnMessageDraft}
                onChange={(event) => setWarnMessageDraft(event.target.value)}
                rows={5}
                placeholder={DEFAULT_WARN_MESSAGE}
              />
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

      <AlertDialog open={pendingDisputeAction !== null} onOpenChange={(open) => !open && setPendingDisputeAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDisputeAction ? `Confirm ${formatDisputeDecisionAction(pendingDisputeAction.action)}` : "Confirm Dispute Decision"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This executes the Stripe-backed dispute decision and records immutable admin audit metadata.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingDisputeAction ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Total Paid</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().totalPaid)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Service Rate</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().serviceRate)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Customer Platform Fee</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().customerPlatformFee)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Provider Platform Fee</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().providerPlatformFee)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Waive Platform Fee from Customer</div>
                  <div className="font-medium">{getPendingDisputeBreakdown().waiveCustomerPlatformFee ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Waive Platform Fee from Provider</div>
                  <div className="font-medium">{getPendingDisputeBreakdown().waiveProviderPlatformFee ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Provider Receives on Full Release</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().providerReceivesOnFullRelease)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Provider Receives</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().providerReceives)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Customer Refunded</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().customerRefunded)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Huddle Retains</div>
                  <div className="font-medium">{formatCurrencyAmount(disputeCurrencyCode, getPendingDisputeBreakdown().huddleRetains)}</div>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waiveCustomerPlatformFee}
                    onChange={(event) => setWaiveCustomerPlatformFee(event.target.checked)}
                  />
                  <span>Waive platform fee from Customer</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waiveProviderPlatformFee}
                    onChange={(event) => setWaiveProviderPlatformFee(event.target.checked)}
                    disabled={pendingDisputeAction.action === "full_refund"}
                  />
                  <span>Waive platform fee from Provider</span>
                </label>
              </div>

              {pendingDisputeAction.action === "partial_refund" ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="partial-refund-amount">
                    Partial refund amount (service refund only)
                  </label>
                  <input
                    id="partial-refund-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={partialRefundInput}
                    onChange={(event) => setPartialRefundInput(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    placeholder={`0.00 (max ${formatCurrencyAmount(disputeCurrencyCode, disputeServiceRateAmount)})`}
                  />
                </div>
              ) : null}

              {!disputeAdminNote.trim() ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Admin note is required before confirming.
                </div>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={disputeActionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void executeDisputeAction();
              }}
              disabled={disputeActionLoading}
            >
              {disputeActionLoading ? "Applying..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSafety;
