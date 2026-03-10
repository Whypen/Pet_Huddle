import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { NeuButton } from "@/components/ui/NeuButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import Webcam from "react-webcam";
import { humanError } from "@/lib/humanError";
import { isVerificationStatus } from "@/lib/verificationStatus";
import {
  savePendingSignupVerification,
  SIGNUP_VERIFY_SUBMITTED_KEY,
} from "@/lib/signupOnboarding";

type DocType = "id" | "passport" | "drivers_license";

const COUNTRY_OPTIONS = [
  "Hong Kong",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Singapore",
  "Japan",
  "South Korea",
  "Taiwan",
  "Thailand",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Vietnam",
  "India",
  "France",
  "Germany",
  "Italy",
  "Spain",
  "Netherlands",
  "New Zealand",
];

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
  const location = useLocation();
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
  const selfieCamRef = useRef<Webcam>(null);
  const idCamRef = useRef<Webcam>(null);

  const biometricDisclosure = `We collect your selfie and ID document image to verify your age and identity and to protect our users from fraud and underage access. We generate biometric templates or age estimates from these images solely for this verification. We do not use your biometric data for general facial recognition or any purpose other than verification. Images are deleted after the check; we keep only the outcome (e.g. ‘age verified 18+’) and minimal metadata.`;

  const canNext =
    (step === 1 && country && docType && agreed) ||
    step === 3 ||
    step === 4;
  const returnTo = typeof location.state === "object" && location.state && "returnTo" in location.state
    ? String((location.state as { returnTo?: string }).returnTo || "")
    : "";
  const backTo = typeof location.state === "object" && location.state && "backTo" in location.state
    ? String((location.state as { backTo?: string }).backTo || "")
    : "";
  const fromPage = typeof location.state === "object" && location.state && "from" in location.state
    ? String((location.state as { from?: string }).from || "")
    : "";
  const selectedDocLabel =
    docType === "passport"
      ? "Passport"
      : docType === "drivers_license"
        ? "Driver's License"
        : "ID";
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

  const fileToDataUrl = async (file: File): Promise<string> =>
    await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read captured image"));
      reader.readAsDataURL(file);
    });

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
    if (step === 1) {
      setStep(3);
      return;
    }
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
    if (!selfie || !idDoc || !country || !docType) return;
    if (!user) {
      const selfieData = selfiePreview || await fileToDataUrl(selfie);
      const idData = idPreview || await fileToDataUrl(idDoc);
      savePendingSignupVerification({
        country,
        docType,
        selfieDataUrl: selfieData,
        idDataUrl: idData,
        createdAt: new Date().toISOString(),
      });
      try {
        sessionStorage.setItem(SIGNUP_VERIFY_SUBMITTED_KEY, "true");
      } catch {
        // no-op
      }
      toast.success("Got it – we’ll review your docs soon to welcome you to the safe huddle!");
      if (returnTo) {
        navigate(returnTo);
      } else {
        navigate("/set-profile");
      }
      return;
    }
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
      const pendingStatus = "pending";
      if (!isVerificationStatus(pendingStatus)) {
        toast.error("Invalid verification status");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          verification_status: pendingStatus,
          verification_comment: null,
          verification_document_url: idUrl,
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
      try {
        sessionStorage.setItem(SIGNUP_VERIFY_SUBMITTED_KEY, "true");
      } catch {
        // no-op
      }
      toast.success("Got it – we’ll review your docs soon to welcome you to the safe huddle!");
      if (returnTo) {
        navigate(returnTo);
      } else if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/settings");
      }
      setStep(5);
    } catch (e: unknown) {
      const message = humanError(e);
      toast.error(message || t("Verification upload failed"));
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (backTo) {
      navigate(backTo);
      return;
    }
    if (fromPage) {
      navigate(fromPage, { state: { openSettings: true } });
      return;
    }
    if (returnTo) {
      navigate(returnTo);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/settings");
  };

  return (
    <div className="min-h-svh bg-background pb-safe">
      <header className="flex items-center gap-3 px-4 border-b border-border h-12">
        <button
          type="button"
          onClick={goBack}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:text-brandBlue transition-colors"
          aria-label={t("Back")}
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-base font-semibold">{t("Identity Verification")}</h1>
      </header>
      <div className="p-4 space-y-4 relative overflow-x-hidden">

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t("Country")}</label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="mt-1 h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm">
                <SelectValue placeholder={t("Select country")} />
              </SelectTrigger>
              <SelectContent>
                {!COUNTRY_OPTIONS.includes(country) && country ? (
                  <SelectItem value={country}>{country}</SelectItem>
                ) : null}
                {COUNTRY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
            <SelectTrigger className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm">
              <SelectValue placeholder={t("Select document type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="id">ID</SelectItem>
              <SelectItem value="passport">Passport</SelectItem>
              <SelectItem value="drivers_license">Driver's License</SelectItem>
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground">{biometricDisclosure}</p>
          <div className="flex items-center gap-2">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} />
            <span>{t("Agree & Continue")}</span>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <p>{t("Snap a quick selfie")}</p>
          {!selfiePreview && (
            <div className="rounded-xl overflow-hidden border border-border">
              <Webcam
                ref={selfieCamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: { ideal: "environment" } }}
                className="w-full h-56 object-cover"
              />
            </div>
          )}
          {selfiePreview && (
            <>
              <img src={selfiePreview} alt={t("Selfie preview")} className="rounded-xl border border-border" />
              <NeuButton
                variant="secondary"
                onClick={() => {
                  setSelfie(null);
                  setSelfiePreview(null);
                }}
              >
                {t("Retake")}
              </NeuButton>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {selfiePreview ? t("Tap Submit to continue") : t("Tap Confirm to continue")}
          </p>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          <p>{`Snap your ${selectedDocLabel}`}</p>
          {!idPreview && (
            <div className="rounded-xl overflow-hidden border border-border">
              <Webcam
                ref={idCamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: "user" }}
                className="w-full h-56 object-cover"
              />
            </div>
          )}
          {idPreview && (
            <>
              <img src={idPreview} alt={t("ID preview")} className="rounded-xl border border-border" />
              <NeuButton
                variant="secondary"
                onClick={() => {
                  setIdDoc(null);
                  setIdPreview(null);
                }}
              >
                {t("Retake")}
              </NeuButton>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {idPreview ? t("Tap Submit to continue") : t("Tap Confirm to continue")}
          </p>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <p className="text-[#3283ff] font-medium">{t("Social access granted pending review")}</p>
          <p className="text-xs text-muted-foreground">
            Thanks for completing verification. You can use the Social features for now while we finish our checks. If we later find that you are below the minimum age required for our Social or Chat features, your account may be blocked from these features or from the app entirely, in line with our Terms and Safety Policy.
          </p>
          <NeuButton className="bg-[#3283ff]" onClick={() => navigate(returnTo || "/set-profile")}>
            {t("Back to Chats")}
          </NeuButton>
        </div>
      )}

      {step < 5 && (
        <div className="flex gap-2">
          {step > 1 && (
            <NeuButton
              variant="secondary"
              onClick={() => {
                if (step === 3) {
                  // Keep country/doc/agreement selections when returning to step 1.
                  setStep(1);
                  return;
                }
                if (step === 4) {
                  setStep(3);
                  return;
                }
                setStep((s) => s - 1);
              }}
            >
              {t("Back")}
            </NeuButton>
          )}
          {step < 4 && (
            <NeuButton className="bg-[#3283ff]" disabled={!canNext} onClick={handleNext}>
              {step === 3 ? (selfiePreview ? t("Submit") : t("Confirm")) : t("Submit")}
            </NeuButton>
          )}
          {step === 4 && (
            <NeuButton className="bg-[#3283ff]" disabled={!canNext || saving} onClick={handleNext}>
              {saving ? t("Submitting...") : (idPreview ? t("Submit") : t("Confirm"))}
            </NeuButton>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default VerifyIdentity;
