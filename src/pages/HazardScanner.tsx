import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, AlertTriangle, Info, CheckCircle, ArrowLeft, Loader2, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";

interface HazardResult {
  object: string;
  category: 'TOXIC_PLANT' | 'TOXIC_FOOD' | 'CHEMICAL' | 'INERT';
  toxicity_level?: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
  immediate_action?: string;
}

const HazardScanner = () => {
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
          toast.success(`Image optimized (saved ${savedKB}KB)`);
        }
      } catch (error) {
        console.error("Compression error:", error);
        toast.error("Failed to process image");
      }
    }
  };

  const scanImage = async () => {
    if (!imageFile || !user) return;

    setScanning(true);

    try {
      // RATE LIMITING: Check if user can perform scan (3 scans/hour for free tier)
      const { data: canScan, error: rateLimitError } = await supabase
        .rpc('check_scan_rate_limit', { user_uuid: user.id });

      if (rateLimitError) {
        console.error("Rate limit check failed:", rateLimitError);
      }

      if (canScan === false) {
        toast.error("Rate limit exceeded. Free tier: 3 scans per hour. Upgrade to Premium for unlimited scans!");
        setScanning(false);
        return;
      }

      // CACHE CHECK: Generate image hash to check for duplicate scans
      const imageHash = await generateImageHash(imageFile);

      // Check cache first
      const { data: cachedResult, error: cacheError } = await supabase
        .from('triage_cache')
        .select('*')
        .eq('image_hash', imageHash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cachedResult) {
        // CACHE HIT: Use cached result instead of calling GPT-4o-mini
        console.log("Cache hit! Saved API costs.");
        toast.success("🎯 Found in community cache - $0 cost!", {
          description: `This ${cachedResult.object_identified} has been scanned ${cachedResult.hit_count || 1} time(s) before`
        });

        const cachedScanResult: HazardResult = {
          object: cachedResult.object_identified,
          category: cachedResult.hazard_type,
          toxicity_level: cachedResult.toxicity_level,
          immediate_action: cachedResult.immediate_action
        };

        setResult(cachedScanResult);

        // Update cache hit count
        await supabase
          .from('triage_cache')
          .update({
            hit_count: (cachedResult.hit_count || 0) + 1,
            last_accessed_at: new Date().toISOString()
          })
          .eq('id', cachedResult.id);

        if (cachedScanResult.category !== 'INERT') {
          setShowIntentGate(true);
        }

        setScanning(false);
        return;
      }

      // CACHE MISS: Upload image and call AI
      const fileExt = imageFile.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("hazard-scans")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("hazard-scans")
        .getPublicUrl(filePath);

      // Record scan for rate limiting
      await supabase.from('scan_rate_limits').insert({
        user_id: user.id,
        scan_timestamp: new Date().toISOString()
      });

      // In production, this would call GPT-4o-mini Vision API via Supabase Edge Function
      // For MVP/demo, we'll simulate the response
      await simulateAIResponse(publicUrl, imageHash);

    } catch (error: any) {
      console.error("Scan error:", error);
      toast.error("Failed to scan image");
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

  const simulateAIResponse = async (imageUrl: string, imageHash: string) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock response - in production, this would come from GPT-4o-mini
    const mockResult: HazardResult = {
      object: "Chocolate bar",
      category: "TOXIC_FOOD",
      toxicity_level: "HIGH",
      immediate_action: "Contact your vet immediately. Do NOT induce vomiting. Monitor for symptoms including vomiting, diarrhea, increased heart rate, and seizures."
    };

    setResult(mockResult);

    // CACHE WRITE: Store result for future scans (uses service_role via RLS policy)
    // In production, the Edge Function would handle this
    try {
      await supabase.from('triage_cache').insert({
        image_hash: imageHash,
        object_identified: mockResult.object,
        is_hazard: mockResult.category !== 'INERT',
        hazard_type: mockResult.category,
        toxicity_level: mockResult.toxicity_level,
        immediate_action: mockResult.immediate_action,
        ai_response: mockResult,
        hit_count: 1
      });
    } catch (cacheWriteError) {
      // Non-critical error, continue even if cache write fails
      console.warn("Failed to write to cache:", cacheWriteError);
    }

    // If hazard detected, show intent gate
    if (mockResult.category !== 'INERT') {
      setShowIntentGate(true);
    } else {
      // If inert, save and show success
      await saveToDatabase(imageUrl, mockResult, false);
      toast.success("Photo saved - no hazards detected!");
    }
  };

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
            <h1 className="font-semibold text-lg">AI Hazard Scanner</h1>
            <p className="text-xs text-muted-foreground">Powered by AI Triage Scribe</p>
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
                <h2 className="text-xl font-semibold">Scan for Hazards</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a photo of any object your pet found. AI will identify if it's toxic or safe.
                </p>
              </div>

              <label className="block">
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium mb-1">Choose Photo</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG up to 5MB</p>
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
                <h3 className="font-semibold text-lg mb-2">Hazard Detected</h3>
                <p className="text-sm text-muted-foreground">
                  <strong>{result.object}</strong> identified as {result.category.replace(/_/g, ' ').toLowerCase()}
                </p>
              </div>

              <p className="text-center font-medium">Did your pet eat or ingest this?</p>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => handleIntentSelection(false)}
                  variant="outline"
                  className="h-16 rounded-xl flex-col gap-1"
                >
                  <Info className="w-6 h-6 text-primary" />
                  <span className="text-sm">Just Curious</span>
                </Button>
                <Button
                  onClick={() => handleIntentSelection(true)}
                  className="h-16 rounded-xl bg-destructive hover:bg-destructive/90 flex-col gap-1"
                >
                  <AlertTriangle className="w-6 h-6" />
                  <span className="text-sm">Ingested!</span>
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
                    <h3 className="font-semibold text-lg">Educational Info</h3>
                    <p className="text-sm text-muted-foreground">{result.object}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Hazard Type</p>
                    <p className="font-medium">{result.category.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Toxicity Level</p>
                    <p className="font-medium">{result.toxicity_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">What to Know</p>
                    <p className="text-sm">Keep this away from your pet. If ingested, contact your veterinarian immediately.</p>
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
                    <h3 className="font-semibold text-lg text-destructive">EMERGENCY</h3>
                    <p className="text-sm">Immediate action required</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-destructive/5 rounded-lg p-4">
                    <p className="text-xs font-semibold text-destructive mb-2">IMMEDIATE ACTION:</p>
                    <p className="text-sm font-medium">{result.immediate_action}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Toxicity Level</p>
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
                <h3 className="font-semibold text-lg mb-2">All Clear!</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  <strong>{result.object}</strong> appears to be safe
                </p>
                <p className="text-xs text-muted-foreground">Photo saved to your history</p>
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
