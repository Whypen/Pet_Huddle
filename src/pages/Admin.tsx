import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Flag, ShieldCheck, AlertTriangle } from "lucide-react";

type StatusFilter = "all" | "pending" | "verified" | "unverified";

interface VerificationRow {
  upload_id?: string;
  id: string;
  social_id: string | null;
  email: string | null;
  legal_name: string | null;
  uploaded_at: string | null;
  status: string | null;
  verification_status: string | null;
  verification_comment: string | null;
  avatar_url: string | null;
  document_url?: string | null;
  selfie_url?: string | null;
  country?: string | null;
  document_type?: string | null;
}

const Admin = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, { selfie?: string; doc?: string }>>({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("verification_uploads" as "profiles")
      .select(`
        id,
        user_id,
        document_type,
        document_url,
        selfie_url,
        country,
        status,
        uploaded_at,
        profiles:profiles!verification_uploads_user_id_fkey(
          social_id,
          legal_name,
          email,
          verification_status,
          verification_comment,
          avatar_url
        )
      ` as "*")
      .order("uploaded_at" as "id", { ascending: false });

    if (debouncedSearch) {
      query = query.or(`profiles.social_id.ilike.%${debouncedSearch}%,profiles.email.ilike.%${debouncedSearch}%`);
    }

    if (statusFilter !== "all") {
      query = query.eq("status" as "id", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.warn("[Admin] Failed to load verification uploads:", error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped = ((data || []) as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
      upload_id: row.id as string,
      id: (row.profiles as Record<string, unknown> | null)?.id as string ?? row.user_id as string,
      social_id: (row.profiles as Record<string, unknown> | null)?.social_id as string | null ?? null,
      email: (row.profiles as Record<string, unknown> | null)?.email as string | null ?? null,
      legal_name: (row.profiles as Record<string, unknown> | null)?.legal_name as string | null ?? null,
      verification_status: (row.profiles as Record<string, unknown> | null)?.verification_status as string | null ?? null,
      verification_comment: (row.profiles as Record<string, unknown> | null)?.verification_comment as string | null ?? null,
      avatar_url: (row.profiles as Record<string, unknown> | null)?.avatar_url as string | null ?? null,
      document_url: row.document_url as string | null,
      selfie_url: row.selfie_url as string | null,
      country: row.country as string | null,
      document_type: row.document_type as string | null,
      uploaded_at: row.uploaded_at as string | null,
      status: row.status as string | null,
    }));

    setRows(mapped as VerificationRow[]);

    const urlMap: Record<string, { selfie?: string; doc?: string }> = {};
    for (const row of mapped) {
      if (row.selfie_url) {
        const { data: signed } = await supabase.storage
          .from("identity_verification")
          .createSignedUrl(row.selfie_url, 60 * 15);
        if (signed?.signedUrl) urlMap[row.id] = { ...(urlMap[row.id] || {}), selfie: signed.signedUrl };
      }
      if (row.document_url) {
        const { data: signed } = await supabase.storage
          .from("identity_verification")
          .createSignedUrl(row.document_url, 60 * 15);
        if (signed?.signedUrl) urlMap[row.id] = { ...(urlMap[row.id] || {}), doc: signed.signedUrl };
      }
    }
    setSignedUrls(urlMap);
    setLoading(false);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (profile?.user_role === "admin") {
      load();
    } else {
      setLoading(false);
    }
  }, [profile?.user_role, load]);

  const summaryLabel = useMemo(() => {
    if (debouncedSearch) return `Showing results for "${debouncedSearch}"`;
    if (statusFilter !== "all") return `Filter: ${statusFilter}`;
    return "All submissions";
  }, [debouncedSearch, statusFilter]);

  const review = async (id: string, status: "verified" | "unverified") => {
    const { error } = await supabase.rpc("admin_set_verification_status", {
      p_user_id: id,
      p_decision: status,
      p_comment: comment[id] || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      await supabase.functions.invoke("verification-email", {
        body: {
          userId: id,
          status,
          comment: comment[id] || "",
        },
      });
    } catch (err) {
      console.warn("[Admin] Failed to send verification email:", err);
    }
    await load();
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;
  if (profile?.user_role !== "admin") return <div className="p-6">{t("Access denied")}</div>;

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold lowercase">{t("admin.title") || "admin"}</h1>
        <div className="text-xs text-muted-foreground">{summaryLabel}</div>
      </div>

      {/* Admin section nav tiles */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => navigate("/admin")}
          className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-brandBlue bg-brandBlue/5 px-3 py-3 text-center transition-colors"
        >
          <ShieldCheck className="w-5 h-5 text-brandBlue" />
          <span className="text-xs font-semibold text-brandBlue">KYC Review</span>
        </button>
        <button
          onClick={() => navigate("/admin/control-center")}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-3 text-center hover:border-brandBlue/50 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Disputes</span>
        </button>
        <button
          onClick={() => navigate("/admin/reports")}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-3 text-center hover:border-red-300 transition-colors"
        >
          <Flag className="w-5 h-5 text-red-500" />
          <span className="text-xs font-medium text-red-500">Reports</span>
        </button>
      </div>

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
          <option value="all">All</option>
          <option value="pending">pending</option>
          <option value="verified">verified</option>
          <option value="unverified">unverified</option>
        </select>
      </div>

      {rows.length === 0 && <p className="text-muted-foreground">{t("No verification submissions")}</p>}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="grid grid-cols-6 gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground">
          <div>social_id</div>
          <div>legal_name</div>
          <div>document_type</div>
          <div>status</div>
          <div>uploaded_at</div>
          <div className="text-right">actions</div>
        </div>
        {rows.map((row) => (
          <div key={row.upload_id || row.id} className="grid grid-cols-6 gap-2 px-4 py-3 border-t">
            <div className="text-sm font-medium text-brandText">{row.social_id || "unknown"}</div>
            <div className="text-sm text-brandText/80">{row.legal_name || "-"}</div>
            <div className="text-sm text-brandText/80">{row.document_type || "-"}</div>
            <div className="text-sm text-brandText/80">{row.status || "-"}</div>
            <div className="text-xs text-muted-foreground">
              {row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : "-"}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" className="h-8" onClick={() => review(row.id, "verified")}>
                Verify
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => review(row.id, "unverified")}>
                Unverify
              </Button>
            </div>
          </div>
        ))}
      </div>

      {rows.map((row) => (
        <div key={`${row.id}-images`} className="hidden" aria-hidden>
          {signedUrls[row.id]?.selfie}
          {signedUrls[row.id]?.doc}
        </div>
      ))}
    </div>
  );
};

export default Admin;
