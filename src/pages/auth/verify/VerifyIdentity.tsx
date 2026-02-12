import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { ShieldCheck, CheckCircle, X } from "lucide-react";
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

type Step = 1 | 2 | 3 | 4 | 5;
type DocType = "passport" | "drivers_license" | "id_card";

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
  const { user } = useAuth();
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
  const [faceStatus, setFaceStatus] = useState("Face not found");
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  const docCamRef = useRef<Webcam>(null);
  const selfieCamRef = useRef<Webcam>(null);

  useEffect(() => {
    update({ legal_name: legalName });
  }, [legalName, update]);

  useEffect(() => {
    const onResize = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const legalNameValid = useMemo(() => legalName.trim().split(/\s+/).length >= 2, [legalName]);
  const agreementsValid = agree1 && agree2 && agree3;

  const handleCapture = async (ref: RefObject<Webcam>, label: string) => {
    const shot = ref.current?.getScreenshot();
    if (!shot) {
      toast.error("Unable to capture image. Please try again.");
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
      const { error: docErr } = await supabase.storage.from("identity_verification").upload(docPath, docFile, { upsert: false });
      if (docErr) throw docErr;

      const { error: selfieErr } = await supabase.storage.from("identity_verification").upload(selfiePath, selfieFile, { upsert: false });
      if (selfieErr) {
        await supabase.storage.from("identity_verification").remove([docPath]);
        throw selfieErr;
      }

      const { error: finalizeError } = await supabase.rpc("finalize_identity_submission", {
        doc_type: docType,
        doc_path: docPath,
        selfie_path: selfiePath,
        country,
        legal_name: legalName,
      });
      if (finalizeError) {
        await supabase.storage.from("identity_verification").remove([docPath, selfiePath]);
        throw finalizeError;
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        navigate("/onboarding");
      }, 1200);
      setStep(5);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message || "Verification upload failed");
    } finally {
      setSaving(false);
    }
  }, [country, docFile, docType, legalName, legalNameValid, navigate, selfieFile, user?.id]);

  useEffect(() => {
    if (step !== 5) return;
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
            setFaceStatus("Face not found");
          } else {
            const box = faces[0].boundingBox;
            const ratio = (box.width * box.height) / (video.videoWidth * video.videoHeight);
            setFaceStatus(ratio < 0.08 ? "Move closer" : "Looks good");
          }
        } catch {
          setFaceStatus("Face not found");
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
    ? "Rotate phone to Landscape. Align the photo page and the bottom text lines (MRZ)."
    : "Align the front of your card within the frame.";

  return (
    <div className="min-h-screen bg-background px-6 py-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2" aria-label="Back">
          <X className="h-5 w-5" />
        </button>
        <div className="text-sm text-muted-foreground">Step {step} of 5</div>
      </div>

      {step === 1 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-brandBlue/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-brandBlue animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-brandText">Verify your identity</h1>
              <p className="text-sm text-muted-foreground">
                At huddle, trust is our foundation.... keep the 'huddle' safe for everyone.
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
              className={`h-9 ${!legalNameValid && legalName ? "border-red-500" : ""}`}
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
                <Button variant="outline" className="w-full h-9 justify-between">
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
          <Button className="w-full h-10" onClick={() => setStep(3)} disabled={!legalNameValid || !country}>
            Next
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-brandText">Select document type</h2>
          <div className="grid gap-3">
            {[
              { label: "Passport", value: "passport", sub: "Global" },
              { label: "Driver's License", value: "drivers_license", sub: "Local" },
              { label: "National ID", value: "id_card", sub: "Local" },
            ].map((item) => (
              <button
                key={item.value}
                className="rounded-xl border border-brandText/30 p-4 text-left hover:border-brandBlue"
                onClick={() => {
                  setDocType(item.value as DocType);
                  setStep(4);
                }}
              >
                <div className="font-semibold text-brandText">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.sub}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4 && docType && (
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
                    isLandscape ? "shadow-[0_0_12px_rgba(207,171,33,0.7)]" : ""
                  }`}
                  style={{ borderColor: isLandscape ? "#CFAB21" : "#4a4a4a" }}
                >
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-black/20" />
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-[70%] aspect-[2/3] border-2 border-brandBlue/60 rounded-lg">
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
                const captured = await handleCapture(docCamRef, "document");
                if (!captured) return;
                setDocFile(captured.file);
                setDocPreview(captured.preview);
              }}
            >
              Capture
            </Button>
          )}
          {docPreview && (
            <Button className="w-full h-10" onClick={() => setStep(5)}>
              Looks good
            </Button>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="mt-6 space-y-4">
          <div className="relative rounded-2xl overflow-hidden border border-brandText/20">
            <Webcam
              ref={selfieCamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "user" }}
              className="w-full h-64 object-cover"
              onUserMediaError={() => setPermissionDenied(true)}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.5) 42%)",
                backdropFilter: "blur(4px)",
              }}
            />
            {docPreview && (
              <img src={docPreview} alt="Document thumbnail" className="absolute top-3 right-3 h-16 w-24 rounded-md border border-white" />
            )}
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
                const captured = await handleCapture(selfieCamRef, "selfie");
                if (!captured) return;
                setSelfieFile(captured.file);
                setSelfiePreview(captured.preview);
              }}
            >
              Take Selfie
            </Button>
          )}
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
