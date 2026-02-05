import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface VerificationRow {
  id: string;
  display_name: string | null;
  legal_name: string | null;
  verification_status: string | null;
  verification_comment: string | null;
  avatar_url: string | null;
}

const Admin = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id,display_name,legal_name,verification_status,verification_comment,avatar_url")
      .eq("verification_status", "pending")
      .order("id", { ascending: false });
    setRows((data || []) as VerificationRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.user_role === "admin") {
      load();
    } else {
      setLoading(false);
    }
  }, [profile?.user_role]);

  const review = async (id: string, status: "approved" | "rejected") => {
    await supabase
      .from("profiles")
      .update({
        verification_status: status,
        verification_comment: comment[id] || null,
        is_verified: status === "approved",
      })
      .eq("id", id);
    await load();
  };

  if (loading) return <div className="p-6">{t("Loading...")}</div>;
  if (profile?.user_role !== "admin") return <div className="p-6">{t("Access denied")}</div>;

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold lowercase font-huddle">{t("admin.title") || "admin"}</h1>
      {rows.length === 0 && <p className="text-muted-foreground">{t("No pending verifications")}</p>}
      {rows.map((row) => (
        <div key={row.id} className="border rounded-xl p-3 space-y-2">
          <p className="font-medium">{row.display_name || row.legal_name || row.id}</p>
          <Input
            placeholder={t("Admin comment")}
            value={comment[row.id] || ""}
            onChange={(e) => setComment((prev) => ({ ...prev, [row.id]: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button className="bg-[#3283ff]" onClick={() => review(row.id, "approved")}>
              {t("Approve")}
            </Button>
            <Button variant="outline" onClick={() => review(row.id, "rejected")}>
              {t("Reject")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Admin;
