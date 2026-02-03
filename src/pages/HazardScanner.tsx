import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, AlertTriangle, Info, CheckCircle, ArrowLeft, Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { useLanguage } from "@/contexts/LanguageContext";

interface HazardResult {
  object: string;
  category: 'TOXIC_PLANT' | 'TOXIC_FOOD' | 'CHEMICAL' | 'INERT';
  toxicity_level?: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  immediate_action?: string;
}

const HazardScanner = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<HazardResult | null>(null);
  const [ingested, setIngested] = useState<boolean | null>(null);
  const [showIntentGate, setShowIntentGate] = useState(false);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // COST OPTIMIZATION: Compress images to max 200KB before upload
        // This reduces storage costs and GPT-4o-mini Vision API token usage
        const options = {
          maxSizeMB: 0.2, // 200KB
          maxWidthOrHeight: 1024,
          useWebWorker: true,
          fileType: 'image/jpeg'
        };

        const compressedFile = await imageCompression(file, options);

        setImageFile(compressedFile);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(compressedFile);

        if (compressedFile.size < file.size) {
          const savedKB = ((file.size - compressedFile.size) / 1024).toFixed(0);
          toast.success(`${t("Image optimized (saved")} ${savedKB}${t("KB)")}`);
        }
      } catch (error) {
        console.error("Compression error:", error);
        toast.error(t("Failed to process image"));
      }
    }
  };

  const scanImage = async () => {
    if (!imageFile || !user) return;

    setScanning(true);

    try {
      // Generate image hash for cache lookup
      const imageHash = await generateImageHash(imageFile);

      // Upload image before server-side scan
      const fileExt = imageFile.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("hazard-scans")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("hazard-scans")
        .getPublicUrl(filePath);

      // Server-authoritative scan via Edge Function (rate limit + cache)
      const { data, error } = await supabase.functions.invoke("hazard-scan", {
        body: { userId: user.id, imageUrl: publicUrl, imageHash }
      });

      if (error) throw error;

      if (data?.error === "rate_limit_exceeded") {
        toast.error(t("Rate limit exceeded. Free tier: 3 scans per 24 hours. Upgrade to Premium for unlimited scans!"));
        setScanning(false);
        return;
      }

      if (data?.result) {
        const scanResult = data.result as HazardResult;
        setResult(scanResult);

        if (scanResult.category !== "INERT") {
          setShowIntentGate(true);
        } else {
          await saveToDatabase(publicUrl, scanResult, false);
          toast.success(t("Photo saved - no hazards detected!"));
        }
      }

    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error(t("Failed to scan image"));
    } finally {
      setScanning(false);
    }
  };

  // Generate SHA-256 hash of image for cache deduplication
  const generateImageHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  // simulateAIResponse removed — handled server-side

  const handleIntentSelection = async (didIngest: boolean) => {
    if (!result || !imageFile || !user) return;

    setIngested(didIngest);
    setShowIntentGate(false);

    // Upload to storage
    const fileExt = imageFile.name.split(".").pop();
    const filePath = `${user.id}/${Date.now()}.${fileExt}`;

    const { data: { publicUrl } } = supabase.storage
      .from("hazard-scans")
      .getPublicUrl(filePath);

    await saveToDatabase(publicUrl, result, didIngest);
  };

  const saveToDatabase = async (imageUrl: string, scanResult: HazardResult, wasIngested: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase.from("hazard_identifications").insert({
        user_id: user.id,
        image_url: imageUrl,
        object_identified: scanResult.object,
        is_hazard: scanResult.category !== 'INERT',
        hazard_type: scanResult.category,
        toxicity_level: scanResult.toxicity_level,
        ingested: wasIngested,
        immediate_action: scanResult.immediate_action,
        ai_response: scanResult
      });

      if (error) throw error;
    } catch (error) {
      console.error("Failed to save scan:", error);
    }
  };

  const resetScanner = () => {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setIngested(null);
    setShowIntentGate(false);
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-lg">{t("AI Hazard Scanner")}</h1>
            <p className="text-xs text-muted-foreground">{t("Powered by AI Triage Scribe")}</p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <AnimatePresence mode="wait">
          {/* Upload State */}
          {!imagePreview && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
                  <Camera className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">{t("Scan for Hazards")}</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a photo of any object your pet found. AI will identify if it's toxic or safe.
                </p>
              </div>

              <label className="block">
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">{t("Choose Photo")}</p>
                  <p className="text-xs text-muted-foreground">{t("PNG, JPG up to 5MB")}</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            </motion.div>
          )}

          {/* Preview & Scan */}
          {imagePreview && !result && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <img src={imagePreview} alt="Preview" className="w-full rounded-xl" />

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={resetScanner}
                  className="flex-1 h-12 rounded-xl"
                  disabled={scanning}
                >
                  Change Photo
                </Button>
                <Button
                  onClick={scanImage}
                  disabled={scanning}
                  className="flex-1 h-12 rounded-xl"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Scan for Hazards
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Intent Gate */}
          {showIntentGate && result && result.category !== 'INERT' && (
            <motion.div
              key="intent"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="bg-warning/10 border-2 border-warning/30 rounded-xl p-6 text-center">
                <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-3" />
                <h3 className="font-semibold text-lg mb-2">{t("Hazard Detected")}</h3>
                <p className="text-sm text-muted-foreground">
                  <strong>{result.object}</strong> identified as {result.category.replace(/_/g, ' ').toLowerCase()}
                </p>
              </div>

              <p className="text-center font-medium">{t("Did your pet eat or ingest this?")}</p>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => handleIntentSelection(false)}
                  variant="outline"
                  className="h-16 rounded-xl flex-col gap-1"
                >
                  <Info className="w-6 h-6 text-primary" />
                  <span className="text-sm">{t("Just Curious")}</span>
                </Button>
                <Button
                  onClick={() => handleIntentSelection(true)}
                  className="h-16 rounded-xl bg-destructive hover:bg-destructive/90 flex-col gap-1"
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span className="text-sm">{t("Ingested!")}</span>
                </Button>
              </div>
            </motion.div>
          )}

          {/* Educational View (Just Curious) */}
          {!showIntentGate && result && ingested === false && (
            <motion.div
              key="educational"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="bg-primary/10 border-2 border-primary/30 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Info className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{t("Educational Info")}</h3>
                    <p className="text-sm text-muted-foreground">{result.object}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("Hazard Type")}</p>
                    <p className="font-medium">{result.category.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("Toxicity Level")}</p>
                    <p className="font-medium">{result.toxicity_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("What to Know")}</p>
                    <p className="text-sm">{t("Keep this away from your pet. If ingested, contact your veterinarian immediately.")}</p>
                  </div>
                </div>
              </div>

              <Button onClick={resetScanner} className="w-full h-12 rounded-xl">
                Scan Another Item
              </Button>
            </motion.div>
          )}

          {/* Emergency View (Ingested) */}
          {!showIntentGate && result && ingested === true && (
            <motion.div
              key="emergency"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="bg-destructive/10 border-2 border-destructive rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-destructive">{t("EMERGENCY")}</h3>
                    <p className="text-sm">{t("Immediate action required")}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-destructive/5 rounded-lg p-4">
                    <p className="text-xs font-semibold text-destructive mb-2">{t("IMMEDIATE ACTION:")}</p>
                    <p className="text-sm font-medium">{result.immediate_action}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("Toxicity Level")}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-destructive rounded-full h-2"
                          style={{
                            width: result.toxicity_level === 'SEVERE' ? '100%' :
                                  result.toxicity_level === 'HIGH' ? '75%' :
                                  result.toxicity_level === 'MODERATE' ? '50%' : '25%'
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-destructive">{result.toxicity_level}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => window.open('tel:emergency-vet')}
                className="w-full h-14 rounded-xl bg-destructive hover:bg-destructive/90 text-lg font-semibold"
              >
                Call Emergency Vet Now
              </Button>

              <Button onClick={resetScanner} variant="outline" className="w-full h-12 rounded-xl">
                Scan Another Item
              </Button>
            </motion.div>
          )}

          {/* INERT Result */}
          {result && result.category === 'INERT' && !showIntentGate && (
            <motion.div
              key="safe"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="bg-success/10 border-2 border-success rounded-xl p-6 text-center">
                <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">{t("All Clear!")}</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  <strong>{result.object}</strong> appears to be safe
                </p>
                <p className="text-xs text-muted-foreground">{t("Photo saved to your history")}</p>
              </div>

              <Button onClick={resetScanner} className="w-full h-12 rounded-xl">
                Scan Another Item
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default HazardScanner;
