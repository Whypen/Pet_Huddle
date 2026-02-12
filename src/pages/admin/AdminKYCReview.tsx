import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

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
};

const AdminKYCReview = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [uploads, setUploads] = useState<VerificationUpload[]>([]);
  const [selected, setSelected] = useState<VerificationUpload | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const isAdmin = profile?.is_admin === true;

  const loadUploads = useCallback(async () => {
    const { data, error } = await supabase
      .from("verification_uploads")
      .select("id, user_id, document_type, document_url, selfie_url, country, legal_name, status, uploaded_at")
      .eq("status", "pending")
      .order("uploaded_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setUploads((data || []) as VerificationUpload[]);
    if (!selected && data && data.length) {
      setSelected(data[0] as VerificationUpload);
    }
  }, [selected]);

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

  const handleReview = async (action: "approve" | "reject") => {
    if (!selected) return;
    const { error } = await supabase.rpc("handle_identity_review", {
      target_user_id: selected.user_id,
      action,
      notes,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(action === "approve" ? "Approved" : "Rejected");
    setSelected(null);
    setDocUrl(null);
    setSelfieUrl(null);
    setNotes("");
    await loadUploads();
  };

  const selectedLabel = useMemo(
    () =>
      selected
        ? `${selected.legal_name || "Unknown"} (${selected.document_type})`
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
      <div className="mt-4 grid gap-4 lg:grid-cols-[300px,1fr]">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Pending Submissions</div>
          <div className="rounded-xl border border-border bg-white">
            {uploads.length === 0 && <div className="p-4 text-xs text-muted-foreground">No pending items</div>}
            {uploads.map((item) => (
              <button
                key={item.id}
                className={`w-full text-left px-4 py-3 border-b last:border-b-0 ${
                  selected?.id === item.id ? "bg-brandBlue/5" : ""
                }`}
                onClick={() => setSelected(item)}
              >
                <div className="text-sm font-medium text-brandText">{item.legal_name || item.user_id}</div>
                <div className="text-xs text-muted-foreground">{item.document_type}</div>
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
              placeholder="Reviewer notes (optional)"
              className="h-9"
            />
            <div className="flex gap-2">
              <Button className="w-full h-10" onClick={() => handleReview("approve")} disabled={!selected}>
                Approve
              </Button>
              <Button variant="destructive" className="w-full h-10" onClick={() => handleReview("reject")} disabled={!selected}>
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminKYCReview;
