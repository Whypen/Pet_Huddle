import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type DocType = "id" | "passport" | "drivers_license";

const VerifyIdentity = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [agreed, setAgreed] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const canNext =
    (step === 1 && country && docType) ||
    (step === 2 && agreed) ||
    (step === 3 && selfie) ||
    (step === 4 && idDoc);

  const upload = async (file: File, label: string) => {
    if (!user) throw new Error("No user");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${label}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("identity_verification").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const finish = async () => {
    if (!user || !selfie || !idDoc || !country || !docType) return;
    setSaving(true);
    try {
      const selfieUrl = await upload(selfie, "selfie");
      const idUrl = await upload(idDoc, "id");
      const { error } = await supabase
        .from("profiles")
        .update({
          verification_status: "pending",
          verification_comment: null,
          verification_document_url: idUrl,
          is_verified: false,
        })
        .eq("id", user.id);
      if (error) throw error;

      const { error: auditError } = await supabase.from("admin_audit_logs").insert({
        admin_id: user.id,
        action: "kyc_submitted",
        target_user_id: user.id,
        details: { country, docType, selfieUrl, idUrl },
      });
      if (auditError) {
        console.warn("[VerifyIdentity] Failed to write admin audit log:", auditError.message);
      }

      setStep(5);
    } catch (e: any) {
      toast.error(e.message || t("Verification upload failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold lowercase font-huddle">{t("verify.title") || "verify identity"}</h1>

      {step === 1 && (
        <div className="space-y-3">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger><SelectValue placeholder={t("Select country")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="HK">Hong Kong</SelectItem>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="UK">United Kingdom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
            <SelectTrigger><SelectValue placeholder={t("Select document type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="id">ID</SelectItem>
              <SelectItem value="passport">Passport</SelectItem>
              <SelectItem value="drivers_license">Driver's License</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 text-sm">
          <p>{t("We process identity and biometric data for verification and delete according to policy.")}</p>
          <div className="flex items-center gap-2">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} />
            <span>{t("I agree & continue")}</span>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <p>{t("Selfie capture")}</p>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setSelfie(e.target.files?.[0] || null)} />
          <p className="text-xs text-muted-foreground">{t("Tap I am ready to continue")}</p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <p>{t("ID document capture")}</p>
          <input type="file" accept="image/*" capture="user" onChange={(e) => setIdDoc(e.target.files?.[0] || null)} />
          <p className="text-xs text-muted-foreground">{t("Tap I am ready to submit")}</p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-[#3283ff] font-medium">{t("Social access granted pending review")}</p>
          <Button className="bg-[#3283ff]" onClick={() => navigate("/settings")}>
            {t("Back to Settings")}
          </Button>
        </div>
      )}

      {step < 5 && (
        <div className="flex gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}>{t("Back")}</Button>}
          {step < 4 && (
            <Button className="bg-[#3283ff]" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              {t("I am ready")}
            </Button>
          )}
          {step === 4 && (
            <Button className="bg-[#3283ff]" disabled={!canNext || saving} onClick={finish}>
              {saving ? t("Submitting...") : t("I am ready")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default VerifyIdentity;
