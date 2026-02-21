import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { ShieldCheck, CheckCircle, X, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { humanizeError } from "@/lib/humanizeError";

type Step = 1 | 2 | 3 | 4 | 5;

type DocType = "passport" | "drivers_license" | "id_card";

type DocOption = { label: string; value: DocType };

const docOptions: DocOption[] = [
  { label: "ID Card", value: "id_card" },
  { label: "Passport", value: "passport" },
  { label: "Driver's Licence", value: "drivers_license" },
];

const countries = [
  "Argentina","Australia","Austria","Belgium","Brazil","Canada","Chile","China","Colombia","Denmark","Finland","France","Germany",
  "Greece","Hong Kong","Hungary","Iceland","India","Indonesia","Ireland","Israel","Italy","Japan","Kenya","Malaysia","Mexico",
  "Netherlands","New Zealand","Nigeria","Norway","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia",
  "Singapore","South Africa","South Korea","Spain","Sweden","Switzerland","Taiwan","Thailand","Turkey","Ukraine","United Arab Emirates",
  "United Kingdom","United States","Vietnam"
];

const compressImage = async (file: File) => {
  const maxBytes = 500 * 1024;
  const bitmap = await createImageBitmap(file);
  const maxDim = 1280;
  let scale = Math.min(1, maxDim / bitmap.width, maxDim / bitmap.height);
  let quality = 0.82;

  const renderBlob = async (currentScale: number, currentQuality: number) => {
    const width = Math.round(bitmap.width * currentScale);
    const height = Math.round(bitmap.height * currentScale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", currentQuality),
    );
  };

  let blob = await renderBlob(scale, quality);
  while (blob.size > maxBytes && (quality > 0.4 || scale > 0.5)) {
    if (quality > 0.4) {
      quality = Math.max(0.4, quality - 0.08);
    } else {
      scale = Math.max(0.5, scale * 0.85);
    }
    blob = await renderBlob(scale, quality);
  }

  return new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: "image/jpeg" });
};

const dataUrlToFile = async (dataUrl: string, filename: string) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
};

const VerifyIdentity = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { data, update } = useSignup();
  const [step, setStep] = useState<Step>(1);
  const [legalName, setLegalName] = useState(data.legal_name || "");
  const [countryOpen, setCountryOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [agree1, setAgree1] = useState(false);
  const [agree2, setAgree2] = useState(false);
  const [agree3, setAgree3] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [forceResubmit, setForceResubmit] = useState(false);
  const [faceStatus, setFaceStatus] = useState("Ready");
  const [isWide, setIsWide] = useState(window.innerWidth > window.innerHeight);
  const docCamRef = useRef<Webcam>(null);
  const selfieCamRef = useRef<Webcam>(null);

  const phoneCountry = useMemo(() => {
    const phone = profile?.phone || user?.phone || "";
    if (phone.startsWith("+852")) return "Hong Kong";
    return "";
  }, [profile?.phone, user?.phone]);

  const verificationStatus = String(profile?.verification_status ?? "").trim().toLowerCase();
  const showVerified = verificationStatus === "verified";
  const showUnverified = verificationStatus === "unverified" && Boolean(profile?.verification_comment);
  const showPending = verificationStatus === "pending";
  const showUploadForm = (!showVerified && !showPending && !showUnverified) || forceResubmit;

  // Prefill legal name from profile on mount
  useEffect(() => {
    if (profile?.legal_name && !legalName) {
      setLegalName(profile.legal_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.legal_name]);

  useEffect(() => {
    if (!country && phoneCountry) {
      setCountry(phoneCountry);
    }
  }, [country, phoneCountry]);

  useEffect(() => {
    update({ legal_name: legalName });
  }, [legalName, update]);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const legalNameValid = useMemo(() => legalName.trim().split(/\s+/).length >= 2, [legalName]);
  const agreementsValid = agree1 && agree2 && agree3;

  const handleSnap = async (ref: RefObject<Webcam>, label: string) => {
    const shot = ref.current?.getScreenshot();
    if (!shot) {
      toast.error(humanizeError("Unable to take photo. Please try again."));
      return null;
    }
    const file = await dataUrlToFile(shot, `${label}.jpg`);
    const compressed = await compressImage(file);
    return { file: compressed, preview: shot };
  };

  const finishVerification = useCallback(async () => {
    if (!user?.id || !docFile || !selfieFile || !docType || !country || !legalNameValid) return;
    setSaving(true);
    const timestamp = Date.now();
    const docPath = `${user.id}/${docType}_front_${timestamp}.jpg`;
    const selfiePath = `${user.id}/selfie_liveness_${timestamp}.jpg`;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        toast.error("Please sign in again.");
        return;
      }

      const { error: docErr } = await supabase.storage.from("identity_verification").upload(docPath, docFile, { upsert: false });
      if (docErr) throw docErr;

      const { error: selfieErr } = await supabase.storage.from("identity_verification").upload(selfiePath, selfieFile, { upsert: false });
      if (selfieErr) {
        await supabase.storage.from("identity_verification").remove([docPath]);
        throw selfieErr;
      }

      const { error: finalizeError } = await supabase.rpc("finalize_identity_submission", {
        p_doc_type: docType,
        p_doc_path: docPath,
        p_selfie_path: selfiePath,
        p_country: country,
        p_legal_name: legalName,
      });
      if (finalizeError) {
        await supabase.storage.from("identity_verification").remove([docPath, selfiePath]);
        throw finalizeError;
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate("/signup/verify", { state: { verificationSubmitted: true } });
      }, 1200);
      setStep(5);
    } catch (e: unknown) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }, [country, docFile, docType, legalName, legalNameValid, navigate, selfieFile, user?.id]);

  useEffect(() => {
    if (step !== 4) return;
    type FaceDetectorCtor = new () => {
      detect: (source: HTMLVideoElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
    };
    const FaceDetectorClass = (window as unknown as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
    const detector = FaceDetectorClass ? new FaceDetectorClass() : null;
    if (!detector) return;
    let active = true;
    const tick = async () => {
      if (!active) return;
      const video = selfieCamRef.current?.video as HTMLVideoElement | undefined;
      if (video && video.readyState >= 2) {
        try {
          const faces = await detector.detect(video);
          if (!faces.length) {
            setFaceStatus("Positioning...");
          } else {
            const box = faces[0].boundingBox;
            const ratio = (box.width * box.height) / (video.videoWidth * video.videoHeight);
            setFaceStatus(ratio < 0.08 ? "Move closer" : "Looks good");
          }
        } catch {
          setFaceStatus("Positioning...");
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      active = false;
    };
  }, [step]);

  const docInstructions = docType === "passport"
    ? "Rotate phone to wide view. Align the photo page and the bottom text lines (MRZ)."
    : "Align the front of your card within the frame.";

  const handleBack = () => {
    if (step > 1) setStep((prev) => (prev - 1) as Step);
  };

  if (showVerified) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 flex flex-col items-center justify-center text-center">
        <ShieldCheck className="h-12 w-12 text-brandGold" />
        <h1 className="mt-4 text-2xl font-bold text-brandText">You&apos;re Verified! 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          You&apos;ve now got a verified badge on your profile —
          Thanks for being part of keeping huddle community genuine and warm.
        </p>
      </div>
    );
  }

  if (showPending && !forceResubmit) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 flex flex-col items-center justify-center text-center">
        <ShieldCheck className="h-12 w-12 text-brandBlue" />
        <h1 className="mt-4 text-2xl font-bold text-brandText">Verification in review</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          We&apos;re reviewing your documents now. You&apos;ll see your verified badge as soon as the review is complete.
        </p>
        <Button className="mt-6 h-10 bg-brandBlue" onClick={() => navigate("/")}>
          Back to Home
        </Button>
      </div>
    );
  }

  if (showUnverified) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-bold text-brandText">Verification Not Verified</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          We couldn&apos;t verify your identity based on the info provided
          (common reasons: blurry photo, mismatched details, expired document, or unclear selfie).
          Please try again.
        </p>
        <Button
          className="mt-6 h-10 bg-brandBlue"
          onClick={async () => {
            if (!user?.id) return;
            const { error } = await supabase
              .from("profiles")
              .update({ verification_comment: null })
              .eq("id", user.id);
            if (error) {
              toast.error(humanizeError(error));
              return;
            }
            await refreshProfile();
            setStep(1);
            setForceResubmit(true);
          }}
        >
          Resubmit
        </Button>
      </div>
    );
  }

  if (!showUploadForm) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 flex flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-bold text-brandText">Verification in review</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          We&apos;re reviewing your submission. You&apos;ll see an update here once it&apos;s completed.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-6 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          className="p-2 -ml-2"
          aria-label="Return"
          disabled={step === 1}
        >
          <ArrowLeft className={`h-5 w-5 ${step === 1 ? "text-muted-foreground/40" : "text-brandText"}`} />
        </button>
        <button onClick={() => navigate("/signup/verify")} className="p-2" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {step === 1 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-brandBlue/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-brandBlue animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-brandText">Verify your identity</h1>
              <p className="text-sm text-muted-foreground">
                At huddle, trust is our foundation. Verifying your identity helps us eliminate bad actors and ensures that when you connect
                with a neighbor for a playdate or care, you’re dealing with a real, vetted member of our community. It’s how we keep the
                'huddle' safe for everyone.
              </p>
            </div>
          </div>
          <Button className="w-full h-10" onClick={() => setStep(2)}>
            Get Started
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Legal Name</label>
            <Input
              className={`h-10 ${!legalNameValid && legalName ? "border-red-500" : ""}`}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Your legal name"
            />
            {!legalNameValid && legalName && (
              <p className="text-xs text-red-500 mt-1">Please enter at least 2 words</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Country</label>
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full h-10 justify-between">
                  {country || "Select a country"}
                  <span className="text-muted-foreground">▾</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search country..." />
                  <CommandList>
                    <CommandEmpty>No results</CommandEmpty>
                    {countries.map((item) => (
                      <CommandItem
                        key={item}
                        onSelect={() => {
                          setCountry(item);
                          setCountryOpen(false);
                        }}
                      >
                        {item}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Document type</label>
            <div className="grid gap-3 mt-2">
              {docOptions.map((option) => (
                <button
                  key={option.value}
                  className={`rounded-xl border p-4 text-left hover:border-brandBlue ${
                    docType === option.value ? "border-brandBlue" : "border-brandText/30"
                  }`}
                  onClick={() => setDocType(option.value)}
                >
                  <div className="font-semibold text-brandText">{option.label}</div>
                </button>
              ))}
            </div>
          </div>
          <Button
            className="w-full h-10"
            onClick={() => setStep(3)}
            disabled={!legalNameValid || !country || !docType}
          >
            Next
          </Button>
        </div>
      )}

      {step === 3 && docType && (
        <div className="mt-6 space-y-4">
          <div className="text-sm text-muted-foreground">{docInstructions}</div>
          <div className="relative rounded-2xl overflow-hidden border border-brandText/20">
            <Webcam
              ref={docCamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "environment" }}
              className="w-full h-64 object-cover"
              onUserMediaError={() => setPermissionDenied(true)}
            />
            {docType === "passport" ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`relative w-[85%] aspect-[3/2] border-2 rounded-lg ${
                    isWide ? "shadow-[0_0_12px_rgba(207,171,33,0.7)]" : ""
                  }`}
                  style={{ borderColor: isWide ? "#CFAB21" : "#4a4a4a" }}
                >
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-black/20" />
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-[85%] aspect-[3/2] border-2 border-brandBlue/60 rounded-lg">
                  <div className="absolute -top-1 -left-1 h-5 w-5 border-t-2 border-l-2 border-brandBlue animate-pulse" />
                  <div className="absolute -top-1 -right-1 h-5 w-5 border-t-2 border-r-2 border-brandBlue animate-pulse" />
                  <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-2 border-l-2 border-brandBlue animate-pulse" />
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-2 border-r-2 border-brandBlue animate-pulse" />
                </div>
              </div>
            )}
          </div>
          {docPreview && (
            <div className="space-y-2">
              <img src={docPreview} alt="Document preview" className="w-full rounded-xl border border-border" />
              <Button variant="outline" onClick={() => { setDocFile(null); setDocPreview(null); }}>
                Retake
              </Button>
            </div>
          )}
          {!docPreview && (
            <Button
              className="w-full h-10"
              onClick={async () => {
                if (!isWide) {
                  toast.error("Please rotate to wide view to take your document photo.");
                  return;
                }
                const shotResult = await handleSnap(docCamRef, "document");
                if (!shotResult) return;
                setDocFile(shotResult.file);
                setDocPreview(shotResult.preview);
              }}
            >
              Take photo
            </Button>
          )}
          {docPreview && (
            <Button className="w-full h-10" onClick={() => setStep(4)}>
              Looks good
            </Button>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-brandText/20">
            <Webcam
              ref={selfieCamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "user" }}
              className="w-full h-64 object-cover"
              onUserMediaError={() => setPermissionDenied(true)}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[55%] h-[70%] rounded-full border-2 border-green-500/80" />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{faceStatus}</div>
          {selfiePreview && (
            <div className="space-y-2">
              <img src={selfiePreview} alt="Selfie preview" className="w-full rounded-xl border border-border" />
              <Button variant="outline" onClick={() => { setSelfieFile(null); setSelfiePreview(null); }}>
                Retake
              </Button>
            </div>
          )}
          {!selfiePreview && (
            <Button
              className="w-full h-10"
              onClick={async () => {
                const shotResult = await handleSnap(selfieCamRef, "selfie");
                if (!shotResult) return;
                setSelfieFile(shotResult.file);
                setSelfiePreview(shotResult.preview);
              }}
            >
              Take selfie
            </Button>
          )}
          {selfiePreview && (
            <Button className="w-full h-10" onClick={() => setStep(5)}>
              Next
            </Button>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-white p-3">
              <div className="text-xs text-muted-foreground mb-2">Document</div>
              {docPreview ? (
                <img src={docPreview} alt="Document" className="w-full rounded-md" />
              ) : (
                <div className="text-xs text-muted-foreground">No document photo yet</div>
              )}
            </div>
            <div className="rounded-xl border border-border bg-white p-3">
              <div className="text-xs text-muted-foreground mb-2">Selfie</div>
              {selfiePreview ? (
                <img src={selfiePreview} alt="Selfie" className="w-full rounded-md" />
              ) : (
                <div className="text-xs text-muted-foreground">No selfie photo yet</div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={agree1} onCheckedChange={(v) => setAgree1(Boolean(v))} />
              My legal name matches the document.
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={agree2} onCheckedChange={(v) => setAgree2(Boolean(v))} />
              The images are clear and without glare.
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={agree3} onCheckedChange={(v) => setAgree3(Boolean(v))} />
              All 4 corners of my ID are visible.
            </label>
          </div>
          <Button
            className="w-full h-10"
            disabled={!selfieFile || !docFile || !agreementsValid || saving}
            onClick={finishVerification}
          >
            {saving ? "Submitting..." : "Submit"}
          </Button>
        </div>
      )}

      {showSuccess && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40">
          <div className="w-24 h-24 rounded-full bg-white shadow-lg flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
        </div>
      )}

      <Dialog open={permissionDenied} onOpenChange={setPermissionDenied}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-brandText text-base font-semibold">Camera permissions needed</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Please enable camera access in your browser settings and refresh this page to continue verification.
          </p>
          <Button className="w-full h-10 mt-4" onClick={() => setPermissionDenied(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VerifyIdentity;
