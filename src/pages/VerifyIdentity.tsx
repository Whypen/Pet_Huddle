import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { X } from "lucide-react";
import Webcam from "react-webcam";
import { humanError } from "@/lib/humanError";

type DocType = "id" | "passport" | "drivers_license";

const compressImage = async (file: File) => {
  const maxWidth = 1024;
  // Avoid manual DOM element creation (audit rule): use createImageBitmap + OffscreenCanvas when available.
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = 0.8;
  let blob: Blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  while (blob.size > 500 * 1024 && quality > 0.5) {
    quality -= 0.1;
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  }

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
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const selfieCamRef = useRef<Webcam>(null);
  const idCamRef = useRef<Webcam>(null);

  const biometricDisclosure = `We collect your selfie and ID document image to verify your age and identity and to protect our users from fraud and underage access. We generate biometric templates or age estimates from these images solely for this verification. We do not use your biometric data for general facial recognition or any purpose other than verification. Images are deleted after the check; we keep only the outcome (e.g. ‘age verified 18+’) and minimal metadata.`;

  const canNext =
    (step === 1 && country && docType) ||
    (step === 2 && agreed) ||
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

  const upload = async (file: File, label: string) => {
    if (!user) throw new Error("No user");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${label}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("identity_verification").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const dataUrlToFile = async (dataUrl: string, filename: string) => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type || "image/jpeg" });
  };

  const captureSelfie = async () => {
    const imageSrc = selfieCamRef.current?.getScreenshot();
    if (!imageSrc) {
      toast.error(t("Unable to capture selfie. Please try again."));
      return;
    }
    const file = await dataUrlToFile(imageSrc, "selfie.jpg");
    const compressed = await compressImage(file);
    setSelfie(compressed);
    setSelfiePreview(imageSrc);
  };

  const captureIdDoc = async () => {
    const imageSrc = idCamRef.current?.getScreenshot();
    if (!imageSrc) {
      toast.error(t("Unable to capture ID document. Please try again."));
      return;
    }
    const file = await dataUrlToFile(imageSrc, "id.jpg");
    const compressed = await compressImage(file);
    setIdDoc(compressed);
    setIdPreview(imageSrc);
  };

  const handleNext = async () => {
    if (step === 3) {
      if (!selfie) {
        await captureSelfie();
        return;
      }
      setStep(4);
      return;
    }
    if (step === 4) {
      if (!idDoc) {
        await captureIdDoc();
        return;
      }
      await finish();
      return;
    }
    setStep((s) => s + 1);
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
    } catch (e: unknown) {
      const message = humanError(e);
      toast.error(message || t("Verification upload failed"));
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
      <h1 className="text-2xl font-bold">{t("Identity Verification")}</h1>

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{biometricDisclosure}</p>
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
          <p>{biometricDisclosure}</p>
          <div className="flex items-center gap-2">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} />
            <span>{t("Agree & Continue")}</span>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <p>{t("Selfie capture")}</p>
          <div className="rounded-xl overflow-hidden border border-border">
            <Webcam
              ref={selfieCamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: { ideal: "environment" } }}
              className="w-full h-56 object-cover"
            />
          </div>
          {selfiePreview && (
            <img src={selfiePreview} alt={t("Selfie preview")} className="rounded-xl border border-border" />
          )}
          <p className="text-xs text-muted-foreground">{t("Tap I am ready to continue")}</p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <p>{t("ID document capture")}</p>
          <div className="rounded-xl overflow-hidden border border-border">
            <Webcam
              ref={idCamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "user" }}
              className="w-full h-56 object-cover"
            />
          </div>
          {idPreview && (
            <img src={idPreview} alt={t("ID preview")} className="rounded-xl border border-border" />
          )}
          <p className="text-xs text-muted-foreground">{t("Tap I am ready to submit")}</p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-[#3283ff] font-medium">{t("Social access granted pending review")}</p>
          <p className="text-xs text-muted-foreground">
            Thanks for completing verification. You can use the Social features for now while we finish our checks. If we later find that you are below the minimum age required for our Social or Chat features, your account may be blocked from these features or from the app entirely, in line with our Terms and Safety Policy.
          </p>
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

      {step < 5 && (
        <div className="flex gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}>{t("Back")}</Button>}
          {step < 4 && (
            <Button className="bg-[#3283ff]" disabled={!canNext} onClick={handleNext}>
              {step === 2 ? t("Agree & Continue") : t("I am ready")}
            </Button>
          )}
          {step === 4 && (
            <Button className="bg-[#3283ff]" disabled={!canNext || saving} onClick={handleNext}>
              {saving ? t("Submitting...") : t("I am ready")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default VerifyIdentity;
