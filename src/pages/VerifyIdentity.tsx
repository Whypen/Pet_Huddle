import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { X } from "lucide-react";

type DocType = "id" | "passport" | "drivers_license";

const compressImage = async (file: File) => {
  const img = document.createElement("img");
  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  img.src = dataUrl;
  await new Promise((resolve) => (img.onload = resolve));

  const maxWidth = 1024;
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.8;
  let blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > 500 * 1024 && quality > 0.5) {
    quality -= 0.1;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }

  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" });
};

const VerifyIdentity = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState<DocType | "">("");
  const [agreed, setAgreed] = useState(false);
  const [safeHarborAccepted, setSafeHarborAccepted] = useState(false);
  const [showSafeHarborModal, setShowSafeHarborModal] = useState(false);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const canNext =
    (step === 1 && country && docType) ||
    (step === 2 && agreed && safeHarborAccepted) ||
    (step === 3 && selfie) ||
    (step === 4 && idDoc);

  useEffect(() => {
    const loadCountry = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("location_country")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.location_country) {
        setCountry(data.location_country);
      }
    };
    loadCountry();
  }, [user?.id]);

  useEffect(() => {
    if (step === 2) {
      setShowSafeHarborModal(true);
    }
  }, [step]);

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

      const mappedDocType =
        docType === "id" ? "id_card" : docType === "drivers_license" ? "drivers_license" : docType;

      const { error: uploadRowError } = await supabase
        .from("verification_uploads")
        .insert({
          user_id: user.id,
          document_type: mappedDocType,
          document_url: idUrl,
          selfie_url: selfieUrl,
          country,
          status: "pending",
        });
      if (uploadRowError) throw uploadRowError;
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

      await refreshProfile();
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate("/chats");
      }, 1200);
      setStep(5);
    } catch (e: any) {
      toast.error(e.message || t("Verification upload failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 relative">
      <button
        onClick={() => navigate(-1)}
        className="absolute right-5 top-[50px] z-[9999] w-10 h-10 rounded-full bg-background/80 border border-border flex items-center justify-center"
        aria-label={t("Close")}
      >
        <X className="w-5 h-5" />
      </button>
      <h1 className="text-2xl font-bold lowercase font-huddle">{t("verify.title") || "verify identity"}</h1>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("We collect your selfie and ID document image to verify your age and identity.")}
          </p>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("Country")}</label>
            <input
              value={country}
              disabled
              className="mt-1 h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm"
            />
          </div>
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
          <div className="flex items-start gap-2">
            <Checkbox checked={safeHarborAccepted} onCheckedChange={(v) => setSafeHarborAccepted(Boolean(v))} />
            <span className="text-xs text-muted-foreground">
              I acknowledge that 'huddle' is a marketplace platform and sitters are independent contractors, not employees of 'huddle'. 'huddle' is not responsible for any injury, property damage, or loss occurring during a booking. I agree to use the in-app dispute resolution system before contacting any financial institution for a chargeback.
            </span>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <p>{t("Selfie capture")}</p>
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setSelfie(await compressImage(f));
            }}
          />
          <p className="text-xs text-muted-foreground">{t("Tap I am ready to continue")}</p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <p>{t("ID document capture")}</p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setIdDoc(await compressImage(f));
            }}
          />
          <p className="text-xs text-muted-foreground">{t("Tap I am ready to submit")}</p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-[#3283ff] font-medium">{t("Social access granted pending review")}</p>
          <Button className="bg-[#3283ff]" onClick={() => navigate("/chats")}>
            {t("Back to Chats")}
          </Button>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30">
          <div className="w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>
      )}

      <Dialog open={showSafeHarborModal} onOpenChange={setShowSafeHarborModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Safe Harbor Agreement</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            I acknowledge that 'huddle' is a marketplace platform and sitters are independent contractors, not employees of 'huddle'. 'huddle' is not responsible for any injury, property damage, or loss occurring during a booking. I agree to use the in-app dispute resolution system before contacting any financial institution for a chargeback.
          </p>
          <label className="text-xs text-muted-foreground mt-2 block">
            <input
              type="checkbox"
              checked={safeHarborAccepted}
              onChange={(e) => setSafeHarborAccepted(e.target.checked)}
              className="mr-2 align-middle"
            />
            I am 18+ and agree to the Terms of Service and Privacy Policy.
          </label>
          <DialogFooter>
            <Button disabled={!safeHarborAccepted} onClick={() => setShowSafeHarborModal(false)}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
