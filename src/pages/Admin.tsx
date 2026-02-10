import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VerificationRow {
  upload_id?: string;
  id: string;
  display_name: string | null;
  legal_name: string | null;
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
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, { selfie?: string; doc?: string }>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("verification_uploads" as "profiles")
      .select(`
        id,
        user_id,
        document_type,
        document_url,
        selfie_url,
        country,
        status,
        profiles:profiles!verification_uploads_user_id_fkey(
          id,
          display_name,
          legal_name,
          verification_status,
          verification_comment,
          avatar_url
        )
      ` as "*")
      .eq("status" as "id", "pending")
      .order("uploaded_at" as "id", { ascending: false });

    if (error) {
      console.warn("[Admin] Failed to load verification uploads:", error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped = ((data || []) as Record<string, unknown>[]).map((row: Record<string, unknown>) => ({
      upload_id: row.id as string,
      id: (row.profiles as Record<string, unknown> | null)?.id as string ?? row.user_id as string,
      display_name: (row.profiles as Record<string, unknown> | null)?.display_name as string | null ?? null,
      legal_name: (row.profiles as Record<string, unknown> | null)?.legal_name as string | null ?? null,
      verification_status: (row.profiles as Record<string, unknown> | null)?.verification_status as string | null ?? null,
      verification_comment: (row.profiles as Record<string, unknown> | null)?.verification_comment as string | null ?? null,
      avatar_url: (row.profiles as Record<string, unknown> | null)?.avatar_url as string | null ?? null,
      document_url: row.document_url as string | null,
      selfie_url: row.selfie_url as string | null,
      country: row.country as string | null,
      document_type: row.document_type as string | null,
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
  };

  useEffect(() => {
    if (profile?.user_role === "admin") {
      load();
    } else {
      setLoading(false);
    }
  }, [profile?.user_role]);

  const review = async (id: string, status: "approved" | "rejected", uploadId?: string) => {
    const target = rows.find((row) => row.id === id);
    await supabase
      .from("profiles")
      .update({
        verification_status: status,
        verification_comment: comment[id] || null,
        is_verified: status === "approved",
      })
      .eq("id", id);
    if (uploadId) {
      await supabase
        .from("verification_uploads" as "profiles")
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.id || null,
          rejection_reason: status === "rejected" ? comment[id] || null : null,
        } as Record<string, unknown>)
        .eq("id" as "created_at", uploadId);
    }
    if (target?.selfie_url || target?.document_url) {
      const paths = [target.selfie_url, target.document_url].filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabase.storage.from("identity_verification").remove(paths);
      }
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
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold lowercase">{t("admin.title") || "admin"}</h1>
      {rows.length === 0 && <p className="text-muted-foreground">{t("No pending verifications")}</p>}
      {rows.map((row) => (
        <div key={row.id} className="border rounded-xl p-3 space-y-2">
          <p className="font-medium">{row.display_name || row.legal_name || row.id}</p>
          <div className="grid grid-cols-2 gap-2">
            {signedUrls[row.id]?.selfie ? (
              <img
                src={signedUrls[row.id]?.selfie}
                alt={t("Selfie")}
                className="w-full rounded-lg border"
              />
            ) : (
              <div className="rounded-lg border p-2 text-xs text-muted-foreground">
                {t("Selfie not available")}
              </div>
            )}
            {signedUrls[row.id]?.doc ? (
              <img
                src={signedUrls[row.id]?.doc}
                alt={t("ID document")}
                className="w-full rounded-lg border"
              />
            ) : (
              <div className="rounded-lg border p-2 text-xs text-muted-foreground">
                {t("ID document not available")}
              </div>
            )}
          </div>
          <Input
            placeholder={t("Admin comment")}
            value={comment[row.id] || ""}
            onChange={(e) => setComment((prev) => ({ ...prev, [row.id]: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button className="bg-[#3283ff]" onClick={() => review(row.id, "approved", row.upload_id)}>
              {t("Approve")}
            </Button>
            <Button variant="outline" onClick={() => review(row.id, "rejected", row.upload_id)}>
              {t("Reject")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Admin;
