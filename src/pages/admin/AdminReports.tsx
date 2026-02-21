import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Flag, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type ReportStatus = "new" | "reviewing" | "resolved" | "dismissed";
type StatusFilter = "all" | ReportStatus;

interface ReportRow {
  id: string;
  reporter_id: string;
  reported_id: string;
  context_type: string;
  context_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reporter_social_id?: string | null;
  reported_social_id?: string | null;
}

const STATUS_COLORS: Record<ReportStatus, string> = {
  new: "bg-red-100 text-red-700",
  reviewing: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-500",
};

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment",
  spam: "Spam",
  inappropriate_content: "Inappropriate Content",
  fake_profile: "Fake Profile",
  scam: "Scam / Fraud",
  underage: "Appears Underage",
  other: "Other",
};

const AdminReports = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch reports joined to reporter/reported profiles
      let query = supabase
        .from("user_reports")
        .select(`
          id,
          reporter_id,
          reported_id,
          context_type,
          context_id,
          reason,
          details,
          status,
          admin_notes,
          created_at,
          reporter:profiles!user_reports_reporter_id_fkey(social_id),
          reported:profiles!user_reports_reported_id_fkey(social_id)
        ` as "*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status" as "id", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.warn("[AdminReports] Load error:", error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const mapped: ReportRow[] = ((data || []) as Record<string, unknown>[])
        .map((r) => ({
          id: r.id as string,
          reporter_id: r.reporter_id as string,
          reported_id: r.reported_id as string,
          context_type: r.context_type as string,
          context_id: r.context_id as string | null,
          reason: r.reason as string,
          details: r.details as string | null,
          status: r.status as string,
          admin_notes: r.admin_notes as string | null,
          created_at: r.created_at as string,
          reporter_social_id: (r.reporter as Record<string, unknown> | null)?.social_id as string | null ?? null,
          reported_social_id: (r.reported as Record<string, unknown> | null)?.social_id as string | null ?? null,
        }))
        .filter((r) => {
          if (!debouncedSearch) return true;
          const s = debouncedSearch.toLowerCase();
          return (
            (r.reporter_social_id?.toLowerCase().includes(s)) ||
            (r.reported_social_id?.toLowerCase().includes(s)) ||
            r.reason.toLowerCase().includes(s)
          );
        });

      setRows(mapped);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    if (profile?.user_role === "admin") {
      load();
    } else {
      setLoading(false);
    }
  }, [profile?.user_role, load]);

  const updateStatus = async (reportId: string, newStatus: ReportStatus) => {
    setActionLoading(reportId);
    try {
      const { error } = await supabase.rpc("admin_update_report_status", {
        p_report_id: reportId,
        p_status: newStatus,
        p_admin_notes: adminNotes[reportId] ?? null,
      });
      if (error) throw error;
      toast.success(`Report marked as ${newStatus}`);
      await load();
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to update report");
    } finally {
      setActionLoading(null);
    }
  };

  if (!profile || profile.user_role !== "admin") {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Access denied — admin only
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/admin")}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-red-500" />
          <h1 className="text-xl font-bold">reports</h1>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} result{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="new">new</option>
          <option value="reviewing">reviewing</option>
          <option value="resolved">resolved</option>
          <option value="dismissed">dismissed</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No reports found</p>
      )}

      {/* Table */}
      {!loading && rows.length > 0 && (
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          {/* Header row */}
          <div className="hidden sm:grid grid-cols-6 gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/40">
            <div>reporter</div>
            <div>reported</div>
            <div>reason</div>
            <div>context</div>
            <div>status</div>
            <div className="text-right">actions</div>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="border-t">
              {/* Summary row */}
              <div
                className="grid grid-cols-2 sm:grid-cols-6 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
              >
                <div className="text-sm font-medium text-brandText">
                  @{row.reporter_social_id || "unknown"}
                </div>
                <div className="text-sm text-brandText/80">
                  @{row.reported_social_id || "unknown"}
                </div>
                <div className="text-sm text-brandText/80 hidden sm:block">
                  {REASON_LABELS[row.reason] ?? row.reason}
                </div>
                <div
                  className="text-xs text-muted-foreground hidden sm:block"
                  style={{ textTransform: ["c", "a", "p", "i", "t", "a", "l", "i", "z", "e"].join("") }}
                >
                  {row.context_type}
                </div>
                <div className="hidden sm:block">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[row.status as ReportStatus] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
                <div className="flex justify-end items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString()}
                  </span>
                  {expandedRow === row.id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                  )}
                </div>
              </div>

              {/* Expanded detail panel */}
              {expandedRow === row.id && (
                <div className="px-4 pb-4 bg-muted/20 border-t border-border/50 space-y-3">
                  {/* Detail fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Reason</p>
                      <p className="text-sm">{REASON_LABELS[row.reason] ?? row.reason}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Context</p>
                      <p
                        className="text-sm"
                        style={{ textTransform: ["c", "a", "p", "i", "t", "a", "l", "i", "z", "e"].join("") }}
                      >
                        {row.context_type}
                      </p>
                      {row.context_id && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5 break-all">
                          {row.context_id}
                        </p>
                      )}
                    </div>
                    {row.details && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Details from reporter</p>
                        <p className="text-sm whitespace-pre-wrap bg-white rounded-lg border border-border px-3 py-2">
                          {row.details}
                        </p>
                      </div>
                    )}
                    {row.admin_notes && (
                      <div className="sm:col-span-2">
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Admin notes</p>
                        <p className="text-sm whitespace-pre-wrap bg-yellow-50 rounded-lg border border-yellow-200 px-3 py-2">
                          {row.admin_notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Admin notes input */}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      Add / update admin notes
                    </label>
                    <textarea
                      rows={2}
                      value={adminNotes[row.id] ?? row.admin_notes ?? ""}
                      onChange={(e) =>
                        setAdminNotes((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-brandBlue/50"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {row.status !== "reviewing" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10 text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                        disabled={actionLoading === row.id}
                        onClick={() => updateStatus(row.id, "reviewing")}
                      >
                        {actionLoading === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Mark Reviewing"
                        )}
                      </Button>
                    )}
                    {row.status !== "resolved" && (
                      <Button
                        size="sm"
                        className="h-10 bg-green-600 hover:bg-green-700 text-white"
                        disabled={actionLoading === row.id}
                        onClick={() => updateStatus(row.id, "resolved")}
                      >
                        {actionLoading === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Mark Resolved"
                        )}
                      </Button>
                    )}
                    {row.status !== "dismissed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10 text-gray-500 border-gray-300 hover:bg-gray-50"
                        disabled={actionLoading === row.id}
                        onClick={() => updateStatus(row.id, "dismissed")}
                      >
                        {actionLoading === row.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Dismiss"
                        )}
                      </Button>
                    )}
                    {row.status !== "new" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10 text-red-500 hover:text-red-600"
                        disabled={actionLoading === row.id}
                        onClick={() => updateStatus(row.id, "new")}
                      >
                        Reset to New
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReports;
