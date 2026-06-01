import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, Clock, Inbox, Mail, RefreshCw, RotateCw, Send, ShieldAlert, Tag, X } from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CaseQueueRow = {
  case_id: string;
  case_type: string;
  source_id: string;
  source_channel: string | null;
  user_id: string | null;
  user_display_name: string | null;
  support_name: string | null;
  support_email: string | null;
  support_message: string | null;
  support_wants_reply: boolean | null;
  ticket_number: string | null;
  owner_role: string | null;
  category: string | null;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  risk_level: "critical" | "high" | "medium" | "low";
  status: string;
  subject: string | null;
  summary: string | null;
  sla_due_at: string | null;
  last_activity_at: string | null;
  latest_review_id: string | null;
  latest_sentiment: string | null;
  latest_missing_information: string[] | null;
  latest_recommended_next_action: string | null;
  latest_requires_admin_approval: boolean | null;
  latest_admin_intervention_reason: string | null;
  latest_confidence: number | null;
  latest_draft_id: string | null;
  latest_delivery_channel: "email" | "huddle_inbox" | "care_message" | "both" | null;
  latest_recipient_email: string | null;
  latest_draft_subject: string | null;
  latest_draft_body: string | null;
  latest_final_subject: string | null;
  latest_final_body: string | null;
  latest_internal_note: string | null;
  latest_draft_status: string | null;
  latest_sent_at: string | null;
  metadata: Record<string, unknown> | null;
};

type CaseEvent = {
  id: string;
  event_type: string;
  event_note: string | null;
  created_at: string;
};

type QueueFilter = "pending" | "urgent" | "system" | "waiting" | "resolved" | "archived" | "all";
type ArchiveReason = "no_action_needed" | "test_or_noise" | "duplicate" | "system_diagnostic";
type SetupState = {
  kind: "not_installed" | "load_failed";
  message: string;
};

const priorityClass: Record<string, string> = {
  P0: "bg-red-600 text-white border-red-600",
  P1: "bg-red-50 text-red-700 border-red-200",
  P2: "bg-amber-50 text-amber-700 border-amber-200",
  P3: "bg-blue-50 text-blue-700 border-blue-200",
  P4: "bg-slate-50 text-slate-600 border-slate-200",
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
};

const isOverdue = (value: string | null | undefined) => {
  if (!value) return false;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && ms < Date.now();
};

const cleanLabel = (value: string | null | undefined) =>
  (value || "Uncategorized").replace(/_/g, " ");

const genericMissingInfo = new Set([
  "The email or phone number linked to the account",
  "The booking, report, post, or payment this relates to",
  "Screenshots, photos, date, and approximate time if relevant",
]);

const archiveReasons: Array<[ArchiveReason, string]> = [
  ["no_action_needed", "No action"],
  ["test_or_noise", "Test/noise"],
  ["duplicate", "Duplicate"],
  ["system_diagnostic", "System"],
];

const normalizeText = (value: string | null | undefined) => String(value || "").toLowerCase();

const isSystemCase = (row: CaseQueueRow) => {
  const subject = normalizeText(row.subject);
  const message = normalizeText(row.support_message);
  const text = [
    row.subject,
    row.summary,
    row.support_message,
    row.support_email,
    row.category,
  ].map(normalizeText).join(" ");
  return (
    text.includes("brevo") ||
    text.includes("autosync") ||
    text.includes("template proof") ||
    text.includes("test send") ||
    text.includes("technical detail") ||
    text.includes("system_diagnostic") ||
    /^(test|testing|testing again|hihi)$/i.test(subject) ||
    /^(test|testing|testing again)$/i.test(message)
  );
};

const isUrgentCase = (row: CaseQueueRow) => {
  if (["resolved", "dismissed"].includes(row.status) || isSystemCase(row)) return false;
  if (["P0", "P1"].includes(row.priority)) return true;
  if (["critical", "high"].includes(row.risk_level)) return true;
  return row.priority === "P2" && isOverdue(row.sla_due_at);
};

const displayMissingInfo = (row: CaseQueueRow) => {
  if (isSystemCase(row)) return [];
  const items = row.latest_missing_information || [];
  const specific = items.filter((item) => !genericMissingInfo.has(item));
  return specific.length > 0 ? specific : [];
};

const suggestedAction = (row: CaseQueueRow) => {
  if (isSystemCase(row)) return "Archive as system/test noise, or escalate internally if this reflects a real product issue.";
  if (row.category === "refund_payout_payment") return "Check payment state first, then send an acknowledgement or evidence request. Do not promise an outcome.";
  if (row.category === "safety_review") return "Review safety context before replying. Escalate if there is harm, harassment, fraud, or legal/privacy risk.";
  if (row.category === "account_or_verification") return "Verify account context, then send the draft or ask only for the missing account detail.";
  return row.latest_recommended_next_action || "Send the draft if accurate, archive if this is test/noise, or mark resolved if no reply is needed.";
};

export default function AdminSupportCases() {
  const { profile, session, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<CaseQueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("case"));
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [deliveryChannel, setDeliveryChannel] = useState<"email" | "huddle_inbox" | "care_message" | "both">("email");
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [archiveReason, setArchiveReason] = useState<ArchiveReason>("no_action_needed");

  const isAdmin = Boolean(profile?.is_admin === true || String(profile?.user_role || "").toLowerCase() === "admin");

  const selected = useMemo(
    () => rows.find((row) => row.case_id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    setSetupState(null);
    const { data, error } = await supabase
      .from("view_admin_case_queue" as never)
      .select("*")
      .order("priority", { ascending: true })
      .order("last_activity_at", { ascending: false });
    if (error) {
      const rawMessage = String(error.message || "");
      if (
        rawMessage.includes("view_admin_case_queue") ||
        rawMessage.toLowerCase().includes("schema cache") ||
        rawMessage.toLowerCase().includes("could not find the table")
      ) {
        setSetupState({
          kind: "not_installed",
          message: "The CS case foundation has not been applied to this Supabase project yet.",
        });
      } else {
        setSetupState({
          kind: "load_failed",
          message: "Support cases could not be loaded. Please refresh, then check the admin audit/logs if it continues.",
        });
        toast.error("Unable to load support cases.");
      }
      setRows([]);
      setLoading(false);
      return;
    }
    const nextRows = ((data ?? []) as unknown as CaseQueueRow[]);
    setRows(nextRows);
    setFilter((currentFilter) => {
      if (currentFilter !== "pending") return currentFilter;
      const hasPendingUserCases = nextRows.some((row) => !["resolved", "dismissed"].includes(row.status) && row.latest_draft_status !== "sent" && !isSystemCase(row));
      const hasSystemCases = nextRows.some((row) => !["resolved", "dismissed"].includes(row.status) && isSystemCase(row));
      return !hasPendingUserCases && hasSystemCases ? "system" : currentFilter;
    });
    const requested = new URLSearchParams(window.location.search).get("case");
    setSelectedId((currentSelectedId) => {
      if (requested && nextRows.some((row) => row.case_id === requested)) return requested;
      if (currentSelectedId && nextRows.some((row) => row.case_id === currentSelectedId)) return currentSelectedId;
      return nextRows[0]?.case_id ?? null;
    });
    setLoading(false);
  }, []);

  const loadEvents = useCallback(async (caseId: string | null) => {
    if (!caseId) {
      setEvents([]);
      return;
    }
    const { data } = await supabase
      .from("admin_case_events" as never)
      .select("id,event_type,event_note,created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(30);
    setEvents(((data ?? []) as unknown as CaseEvent[]));
  }, []);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    void loadRows();
  }, [authLoading, isAdmin, loadRows]);

  useEffect(() => {
    if (!selected) return;
    setSubject(selected.latest_final_subject || selected.latest_draft_subject || selected.subject || "");
    setMessage(selected.latest_final_body || selected.latest_draft_body || "");
    setInternalNote(selected.latest_internal_note || "");
    setDeliveryChannel(selected.latest_delivery_channel || "email");
    setResolveOnSend(false);
    void loadEvents(selected.case_id);
    setSearchParams(selected.case_id ? { case: selected.case_id } : {});
  }, [loadEvents, selected, setSearchParams]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "all") return true;
      if (filter === "urgent") return isUrgentCase(row);
      if (filter === "system") return isSystemCase(row);
      if (filter === "waiting") return row.status === "waiting_for_user" || row.latest_draft_status === "needs_more_info";
      if (filter === "resolved") return row.status === "resolved";
      if (filter === "archived") return row.status === "dismissed";
      return !["resolved", "dismissed"].includes(row.status) && row.latest_draft_status !== "sent" && !isSystemCase(row);
    });
  }, [filter, rows]);

  const visibleCaseIds = useMemo(() => filteredRows.map((row) => row.case_id), [filteredRows]);
  const visibleSelectedCount = selectedCaseIds.filter((id) => visibleCaseIds.includes(id)).length;
  const allVisibleSelected = visibleCaseIds.length > 0 && visibleSelectedCount === visibleCaseIds.length;

  const toggleCaseSelection = (caseId: string, checked: boolean) => {
    setSelectedCaseIds((current) => {
      if (checked) return current.includes(caseId) ? current : [...current, caseId];
      return current.filter((id) => id !== caseId);
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedCaseIds((current) => {
      if (!checked) return current.filter((id) => !visibleCaseIds.includes(id));
      return Array.from(new Set([...current, ...visibleCaseIds]));
    });
  };

  const saveDraft = async () => {
    if (!selected?.latest_draft_id) return;
    setBusy("save");
    const { error } = await supabase
      .from("admin_case_drafts" as never)
      .update({
        final_subject: subject,
        final_body: message,
        internal_note: internalNote || null,
        delivery_channel: deliveryChannel,
        status: "edited",
      } as never)
      .eq("id", selected.latest_draft_id);
    setBusy(null);
    if (error) {
      toast.error(error.message || "Unable to save draft.");
      return;
    }
    toast.success("Draft saved.");
    await loadRows();
  };

  const sendDraft = async () => {
    if (!selected?.latest_draft_id) return;
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required.");
      return;
    }
    if (deliveryChannel !== "email") {
      toast.error("Email is ready in this build. Care and Huddle inbox delivery are next after message-path verification.");
      return;
    }
    setBusy("send");
    const { error } = await supabase.functions.invoke("send-approved-case-draft", {
      body: {
        draft_id: selected.latest_draft_id,
        subject,
        message,
        internal_note: internalNote || null,
        resolve_case: resolveOnSend,
      },
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Unable to send reply.");
      return;
    }
    toast.success("Email sent from support@huddle.pet.");
    await loadRows();
  };

  const regenerate = async () => {
    if (!selected) return;
    setBusy("regenerate");
    const { error } = await supabase.functions.invoke("daily-admin-case-review", {
      body: { case_id: selected.case_id, force: true, send_summary: false },
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Unable to regenerate draft.");
      return;
    }
    toast.success("Draft regenerated.");
    await loadRows();
  };

  const markResolved = async () => {
    if (!selected) return;
    setBusy("resolve");
    const { error } = await supabase
      .from("admin_cases" as never)
      .update({ status: "resolved" } as never)
      .eq("id", selected.case_id);
    setBusy(null);
    if (error) {
      toast.error(error.message || "Unable to resolve case.");
      return;
    }
    toast.success("Case resolved.");
    await loadRows();
  };

  const bulkUpdateStatus = async (status: "resolved" | "dismissed") => {
    const ids = selectedCaseIds.filter((id) => rows.some((row) => row.case_id === id));
    if (ids.length === 0) return;
    const reasonLabel = archiveReasons.find(([value]) => value === archiveReason)?.[1] || "No action";
    setBusy(status === "resolved" ? "bulk-resolve" : "bulk-archive");
    const { error } = await supabase
      .from("admin_cases" as never)
      .update({ status } as never)
      .in("id", ids);
    if (error) {
      setBusy(null);
      toast.error(error.message || "Unable to update selected cases.");
      return;
    }

    await supabase.from("admin_case_events" as never).insert(
      ids.map((caseId) => ({
        case_id: caseId,
        actor_id: session?.user?.id ?? null,
        event_type: status === "resolved" ? "case_bulk_resolved" : "case_bulk_archived",
        event_note: status === "resolved" ? "Case moved to resolved from bulk action." : `Case archived from bulk action: ${reasonLabel}.`,
        details: { source: "admin_support_cases", selected_count: ids.length, archive_reason: status === "dismissed" ? archiveReason : null },
      })) as never,
    );

    setSelectedCaseIds((current) => current.filter((id) => !ids.includes(id)));
    setBusy(null);
    toast.success(`${ids.length} case${ids.length === 1 ? "" : "s"} ${status === "resolved" ? "moved to resolved" : "archived"}.`);
    await loadRows();
  };

  if (authLoading || loading) return <div className="p-6 text-sm text-muted-foreground">Loading support cases...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const pendingCount = rows.filter((row) => !["resolved", "dismissed"].includes(row.status) && row.latest_draft_status !== "sent" && !isSystemCase(row)).length;
  const urgentCount = rows.filter(isUrgentCase).length;
  const systemCount = rows.filter((row) => !["resolved", "dismissed"].includes(row.status) && isSystemCase(row)).length;
  const waitingCount = rows.filter((row) => row.status === "waiting_for_user" || row.latest_draft_status === "needs_more_info").length;
  const archivedCount = rows.filter((row) => row.status === "dismissed").length;
  const selectedMissingInfo = selected ? displayMissingInfo(selected) : [];

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-brandText">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 md:h-screen md:flex-row">
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold">CS approval inbox</h1>
              <p className="mt-1 text-sm text-slate-500">Review AI-drafted Help & Support replies before they are sent.</p>
            </div>
            <Button variant="outline" onClick={loadRows} disabled={busy === "refresh"}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </header>

          <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 xl:grid-cols-7">
            {([
              ["pending", "Needs reply", pendingCount],
              ["urgent", "Urgent", urgentCount],
              ["system", "System/test", systemCount],
              ["waiting", "Waiting", waitingCount],
              ["resolved", "Resolved", rows.filter((row) => row.status === "resolved").length],
              ["archived", "Archived", archivedCount],
              ["all", "All", rows.length],
            ] as Array<[QueueFilter, string, number]>).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`h-11 rounded-md border px-3 text-left text-sm transition ${
                  filter === key ? "border-brandBlue bg-blue-50 text-brandBlue" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="block truncate font-medium">{label}</span>
                <span className="text-xs opacity-75">{count}</span>
              </button>
            ))}
          </div>

          {!setupState && filteredRows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
                  aria-label="Select all visible cases"
                />
                <span>{visibleSelectedCount > 0 ? `${visibleSelectedCount} selected` : "Select visible"}</span>
              </label>
              {selectedCaseIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
                    <Tag className="h-3.5 w-3.5 text-slate-500" />
                    {archiveReasons.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setArchiveReason(value)}
                        className={`rounded px-2 py-0.5 text-xs ${
                          archiveReason === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedCaseIds([])}
                    disabled={busy === "bulk-resolve" || busy === "bulk-archive"}
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bulkUpdateStatus("dismissed")}
                    disabled={busy === "bulk-resolve" || busy === "bulk-archive"}
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => bulkUpdateStatus("resolved")}
                    disabled={busy === "bulk-resolve" || busy === "bulk-archive"}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Move to resolved
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">{archivedCount} archived</span>
              )}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {setupState ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brandBlue">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="max-w-md">
                  <p className="text-base font-semibold">
                    {setupState.kind === "not_installed" ? "CS foundation is not connected yet" : "Cases could not load"}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{setupState.message}</p>
                </div>
                <div className="grid w-full max-w-lg gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>The approval inbox UI is available.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 text-amber-600" />
                    <span>Apply the case foundation migration and deploy the review/send functions before live use.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Inbox className="mt-0.5 h-4 w-4 text-slate-500" />
                    <span>Once connected, pending Help & Support drafts will appear here for approval.</span>
                  </div>
                </div>
                <Button variant="outline" onClick={loadRows}>
                  <RefreshCw className="h-4 w-4" />
                  Check again
                </Button>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center gap-2 p-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">No cases in this view</p>
                <p className="max-w-sm text-sm text-slate-500">Daily summaries are only sent when a case is pending approval.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <div
                    key={row.case_id}
                    className={`grid w-full grid-cols-[auto_1fr_auto] gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      selected?.case_id === row.case_id ? "bg-blue-50/70" : "bg-white"
                    }`}
                  >
                    <Checkbox
                      checked={selectedCaseIds.includes(row.case_id)}
                      onCheckedChange={(checked) => toggleCaseSelection(row.case_id, checked === true)}
                      className="mt-1"
                      aria-label={`Select ${row.subject || row.ticket_number || "support case"}`}
                    />
                    <button type="button" onClick={() => setSelectedId(row.case_id)} className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={priorityClass[row.priority] || priorityClass.P3}>
                          {row.priority}
                        </Badge>
                        <p className="truncate text-sm font-semibold">{row.subject || row.ticket_number || "Support case"}</p>
                        {isSystemCase(row) ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">system/test</span>
                        ) : null}
                        {isOverdue(row.sla_due_at) && !isSystemCase(row) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">
                            <Clock className="h-3 w-3" />
                            overdue
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{row.summary || "No AI summary yet."}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{row.ticket_number || row.source_id}</span>
                        <span>{cleanLabel(row.category)}</span>
                        <span>{row.latest_draft_status || "no draft"}</span>
                      </div>
                    </button>
                    <div className="hidden text-right text-xs text-slate-500 xl:block">
                      <p>{formatDateTime(row.last_activity_at)}</p>
                      <p className="mt-1">{row.owner_role || "CS L1"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white md:w-[440px] xl:w-[520px]">
          {selected ? (
            <>
              <header className="border-b border-slate-200 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={priorityClass[selected.priority] || priorityClass.P3}>
                        {selected.priority}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        {cleanLabel(selected.category)}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        {selected.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <h2 className="mt-3 truncate text-lg font-semibold">{selected.subject || selected.ticket_number || "Support case"}</h2>
                    <p className="mt-1 text-sm text-slate-500">{selected.support_name || selected.user_display_name || "Member"} · {selected.support_email || "No email"}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={regenerate} disabled={busy === "regenerate"}>
                    <RotateCw className="h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 text-brandBlue" />
                      <div>
                        <p className="text-sm font-semibold">AI review</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{selected.summary || "No summary yet."}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Confidence {Math.round((selected.latest_confidence || 0) * 100)}% · {selected.latest_sentiment || "neutral"} · due {formatDateTime(selected.sla_due_at)}
                        </p>
                      </div>
                    </div>
                    {selected.latest_admin_intervention_reason ? (
                      <p className="mt-3 rounded-md bg-white px-3 py-2 text-xs text-slate-600">{selected.latest_admin_intervention_reason}</p>
                    ) : null}
                  </section>

                  <section className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-medium text-slate-500">Reply to</p>
                      <p className="mt-1 truncate text-sm text-slate-700">{selected.support_email || selected.latest_recipient_email || "No email"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-medium text-slate-500">SLA</p>
                      <p className={`mt-1 text-sm ${isOverdue(selected.sla_due_at) ? "text-red-700" : "text-slate-700"}`}>
                        {isOverdue(selected.sla_due_at) ? "Overdue" : "Due"} · {formatDateTime(selected.sla_due_at)}
                      </p>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <p className="text-sm font-semibold">Next action</p>
                    <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                      {suggestedAction(selected)}
                    </p>
                  </section>

                  {selectedMissingInfo.length ? (
                    <section className="space-y-2">
                      <p className="text-sm font-semibold">Missing information</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedMissingInfo.map((item) => (
                          <span key={item} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800">
                            {item}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <p className="text-sm font-semibold">Original message</p>
                    <div className="max-h-[180px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">
                      {selected.support_message || "Open the source ticket for full context."}
                    </div>
                  </section>

                  <section className="space-y-3 rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Reply composer</p>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Mail className="h-3.5 w-3.5" />
                        support@huddle.pet
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ["email", "Email", Mail, false],
                        ["huddle_inbox", "Huddle inbox", Inbox, true],
                        ["care_message", "Care message", Inbox, true],
                        ["both", "Both", Send, true],
                      ] as const).map(([value, label, Icon, disabled]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={disabled}
                          onClick={() => setDeliveryChannel(value)}
                          className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm ${
                            deliveryChannel === value
                              ? "border-brandBlue bg-blue-50 text-brandBlue"
                              : "border-slate-200 bg-white text-slate-600"
                          } disabled:cursor-not-allowed disabled:opacity-45`}
                          title={disabled ? "Planned after the existing message path is verified." : undefined}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">Subject</span>
                      <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">Message</span>
                      <Textarea value={message} onChange={(event) => setMessage(event.target.value)} className="min-h-[240px]" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">Internal note</span>
                      <Textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} className="min-h-[72px]" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={resolveOnSend} onChange={(event) => setResolveOnSend(event.target.checked)} />
                      Mark resolved after sending
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="outline" onClick={saveDraft} disabled={!selected.latest_draft_id || busy === "save"}>
                        Save
                      </Button>
                      <Button variant="outline" onClick={markResolved} disabled={busy === "resolve"}>
                        Resolve
                      </Button>
                      <Button onClick={sendDraft} disabled={!selected.latest_draft_id || busy === "send"}>
                        <Send className="h-4 w-4" />
                        Send email
                      </Button>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <p className="text-sm font-semibold">Audit timeline</p>
                    <div className="space-y-2">
                      {events.length === 0 ? (
                        <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">No events yet.</p>
                      ) : events.map((event) => (
                        <div key={event.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">{event.event_type.replace(/_/g, " ")}</p>
                            <p className="text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
                          </div>
                          {event.event_note ? <p className="mt-1 text-sm text-slate-600">{event.event_note}</p> : null}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <Inbox className="h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-medium">No case selected</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
