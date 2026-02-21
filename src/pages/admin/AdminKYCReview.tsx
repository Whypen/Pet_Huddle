import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { humanizeError } from "@/lib/humanizeError";

type StatusFilter = "all" | "pending" | "verified" | "unverified";

type VerificationUpload = {
  id: string;
  user_id: string;
  document_type: string;
  document_url: string;
  selfie_url: string | null;
  country: string | null;
  legal_name: string | null;
  status: string;
  uploaded_at: string;
  social_id: string | null;
  email: string | null;
  verification_status: string | null;
  verification_comment: string | null;
};

const AdminKYCReview = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [uploads, setUploads] = useState<VerificationUpload[]>([]);
  const [selected, setSelected] = useState<VerificationUpload | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const isAdmin = profile?.is_admin === true;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadUploads = useCallback(async () => {
    let query = supabase
      .from("verification_uploads")
      .select(
        "id, user_id, document_type, document_url, selfie_url, country, legal_name, status, uploaded_at, profiles!verification_uploads_user_id_fkey(social_id, email, verification_status, verification_comment)"
      )
      .order("uploaded_at", { ascending: false });

    if (debouncedSearch) {
      query = query.or(`profiles.social_id.ilike.%${debouncedSearch}%,profiles.email.ilike.%${debouncedSearch}%`);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(humanizeError(error));
      return;
    }
    const mapped = (data || []).map((row: Record<string, unknown>) => {
      const profileRow = row.profiles as Record<string, unknown> | null;
      return {
        id: row.id as string,
        user_id: row.user_id as string,
        document_type: row.document_type as string,
        document_url: row.document_url as string,
        selfie_url: row.selfie_url as string | null,
        country: row.country as string | null,
        legal_name: row.legal_name as string | null,
        status: row.status as string,
        uploaded_at: row.uploaded_at as string,
        social_id: (profileRow?.social_id as string | null) ?? null,
        email: (profileRow?.email as string | null) ?? null,
        verification_status: (profileRow?.verification_status as string | null) ?? null,
        verification_comment: (profileRow?.verification_comment as string | null) ?? null,
      };
    });
    setUploads(mapped as VerificationUpload[]);
    if (!selected && mapped.length) {
      setSelected(mapped[0] as VerificationUpload);
    }
  }, [debouncedSearch, selected, statusFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadUploads();
  }, [isAdmin, loadUploads]);

  useEffect(() => {
    const loadSigned = async () => {
      if (!selected) return;
      const { data: docSigned } = await supabase.storage
        .from("identity_verification")
        .createSignedUrl(selected.document_url, 60);
      const { data: selfieSigned } = selected.selfie_url
        ? await supabase.storage.from("identity_verification").createSignedUrl(selected.selfie_url, 60)
        : { data: null };
      setDocUrl(docSigned?.signedUrl || null);
      setSelfieUrl(selfieSigned?.signedUrl || null);
    };
    void loadSigned();
  }, [selected]);

  const handleReview = async (action: "verify" | "unverify") => {
    if (!selected) return;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      toast.error("Please sign in again.");
      return;
    }
    const { error } = await supabase.rpc("admin_set_verification_status", {
      p_user_id: selected.user_id,
      p_decision: action === "verify" ? "verified" : "unverified",
      p_comment: notes || null,
    });
    if (error) {
      toast.error(humanizeError(error));
      return;
    }
    toast.success(action === "verify" ? "Verified" : "Unverified");
    setSelected(null);
    setDocUrl(null);
    setSelfieUrl(null);
    setNotes("");
    await loadUploads();
  };

  const selectedLabel = useMemo(
    () =>
      selected
        ? `${selected.social_id || "unknown"} (${selected.document_type})`
        : "Select a submission",
    [selected],
  );

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-muted-foreground">
          Admin access required.{" "}
          <button className="text-brandBlue underline" onClick={() => navigate("/")}>
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-6">
      <h1 className="text-xl font-bold text-brandText">KYC Review</h1>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
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
      <div className="mt-4 grid gap-4 lg:grid-cols-[300px,1fr]">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Submissions</div>
          <div className="rounded-xl border border-border bg-white">
            {uploads.length === 0 && <div className="p-4 text-xs text-muted-foreground">No submissions</div>}
            {uploads.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left px-4 py-3 border-b last:border-b-0 ${
                  selected?.id === item.id ? "bg-brandBlue/5" : ""
                }`}
                onClick={() => setSelected(item)}
              >
                <div className="text-sm font-medium text-brandText">{item.social_id || "unknown"}</div>
                <div className="text-xs text-muted-foreground">{item.legal_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{item.document_type} · {item.status}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="text-sm font-medium text-brandText">{selectedLabel}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-3">
              <div className="text-xs text-muted-foreground mb-2">Document</div>
              {docUrl ? (
                <img src={docUrl} alt="Document" className="w-full rounded-md" />
              ) : (
                <div className="text-xs text-muted-foreground">No document</div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-white p-3">
              <div className="text-xs text-muted-foreground mb-2">Selfie</div>
              {selfieUrl ? (
                <img src={selfieUrl} alt="Selfie" className="w-full rounded-md" />
              ) : (
                <div className="text-xs text-muted-foreground">No selfie</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 space-y-3">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10"
            />
            <div className="flex gap-2">
              <Button className="w-full h-10" onClick={() => handleReview("verify")} disabled={!selected}>
                Verify
              </Button>
              <Button variant="destructive" className="w-full h-10" onClick={() => handleReview("unverify")} disabled={!selected}>
                Unverify
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminKYCReview;
