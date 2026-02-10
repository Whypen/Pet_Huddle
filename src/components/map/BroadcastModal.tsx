/**
 * BroadcastModal.tsx — Full-screen Broadcast Creation Modal
 *
 * Spec: Dropdown Topic (Stray/Lost/Others), Title (100 char),
 * Desc (500 char), Image upload, "Post on Threads" checkbox,
 * Tier gating: Free (10km/12h), Premium (25km/24h), Gold (50km/48h),
 * Add-on (150km/72h)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Camera,
  Loader2,
  ChevronDown,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useUpsellBanner } from "@/contexts/UpsellBannerContext";

const MAX_TITLE_CHARS = 100;
const MAX_DESC_CHARS = 500;

const ALERT_TYPE_COLORS: Record<string, string> = {
  Stray: "#EAB308",
  Lost: "#EF4444",
  Others: "#A1A4A9",
};

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: { lat: number; lng: number } | null;
  address?: string;
  onSuccess: () => void;
  extraBroadcast72h: number;
  onQuotaRefresh: () => void;
}

const BroadcastModal = ({
  isOpen,
  onClose,
  selectedLocation,
  address,
  onSuccess,
  extraBroadcast72h,
  onQuotaRefresh,
}: BroadcastModalProps) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { showUpsellBanner } = useUpsellBanner();

  const [alertType, setAlertType] = useState("Stray");
  const [alertTitle, setAlertTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [postOnThreads, setPostOnThreads] = useState(false);
  const [selectedRangeKm, setSelectedRangeKm] = useState<number | null>(null);
  const [selectedDurationH, setSelectedDurationH] = useState<number | null>(null);
  const [showManualAddress, setShowManualAddress] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3s timer: if address still "Searching..." after 3s, show manual input
  useEffect(() => {
    if (!isOpen) {
      setShowManualAddress(false);
      setManualAddress("");
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const addressReady = typeof address === "string" && address.length > 0 && !address.includes("Searching");
    if (addressReady) {
      setShowManualAddress(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    // Start 3s timer
    timerRef.current = setTimeout(() => {
      console.log("[BroadcastModal] 3s timer expired — showing manual address input");
      setShowManualAddress(true);
    }, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isOpen, address]);

  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "premium" || effectiveTier === "gold";
  const broadcastRange = effectiveTier === "gold" ? 50 : isPremium ? 25 : 10;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const resetForm = useCallback(() => {
    setAlertType("Stray");
    setAlertTitle("");
    setDescription("");
    setImageFile(null);
    setImagePreview(null);
    setPostOnThreads(false);
    setSelectedRangeKm(null);
    setSelectedDurationH(null);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!user || !selectedLocation) {
      toast.error("Please select a location first");
      return;
    }

    setCreating(true);
    try {
      let photoUrl: string | null = null;

      // Image upload — no media quota (removed per mandate)
      if (imageFile) {
        const compressed = await imageCompression(imageFile, { maxSizeMB: 0.5, useWebWorker: true });
        const uploadFile = compressed instanceof File ? compressed : imageFile;
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("alerts")
          .upload(fileName, uploadFile);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("alerts")
          .getPublicUrl(fileName);
        photoUrl = publicUrl;
      }

      const rangeKm = selectedRangeKm ?? broadcastRange;
      const durH = selectedDurationH ?? (effectiveTier === "gold" ? 48 : isPremium ? 24 : 12);
      const expiresAt = new Date(Date.now() + durH * 60 * 60 * 1000).toISOString();

      const { data: insertedAlert, error } = await supabase
        .from("map_alerts")
        .insert({
          creator_id: user.id,
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
          alert_type: alertType,
          title: alertTitle.trim() || null,
          description: description.trim() || null,
          photo_url: photoUrl,
          range_meters: Math.round(rangeKm * 1000),
          expires_at: expiresAt,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        const errObj = typeof error === "object" && error !== null ? (error as unknown as Record<string, unknown>) : null;
        const msg = typeof errObj?.message === "string" ? (errObj.message as string) : "";
        if (msg.includes("quota_exceeded")) {
          showUpsellBanner({
            message: "Limited. You have reached your Broadcast limit for this week.",
            ctaLabel: "Go to Premium",
            onCta: () => {
              sessionStorage.setItem("pending_addon", "emergency_alert");
              navigate("/premium");
            },
          });
          setCreating(false);
          return;
        }
        throw error;
      }

      const alertId = (insertedAlert as { id?: string } | null)?.id;
      toast.success("Alert broadcasted!");

      // PHASE 2.2: Threads auto-duplication — capture thread_id and attach to map_alerts
      if (postOnThreads && (alertType === "Stray" || alertType === "Lost")) {
        try {
          const { data: threadData, error: threadErr } = await supabase.from("threads" as "profiles").insert({
            user_id: user.id,
            title: alertTitle.trim() || `Broadcast (${alertType})`,
            content: description.trim() || "",
            tags: ["News"],
            hashtags: [],
            images: photoUrl ? [photoUrl] : [],
          } as Record<string, unknown>).select("id").maybeSingle();

          if (threadErr) {
            console.warn("[Broadcast] Thread insert failed:", threadErr);
            toast.info("Alert posted but thread sync failed");
          }

          // Link the thread_id back to the map alert
          const threadId = (threadData as { id?: string } | null)?.id;
          if (threadId && alertId) {
            await supabase
              .from("map_alerts")
              .update({ thread_id: threadId } as Record<string, unknown>)
              .eq("id", alertId);
            console.log(`[Broadcast] Linked thread_id=${threadId} to alert_id=${alertId}`);
          }
        } catch (threadCatchErr) {
          console.warn("[Broadcast] Thread sync catch:", threadCatchErr);
        }
      }

      handleClose();
      onSuccess();
      onQuotaRefresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || "Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] bg-black/50 flex items-end"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-card rounded-t-3xl p-6 max-h-[90vh] overflow-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-brandText">Broadcast Alert</h2>
              <button onClick={handleClose}>
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Location display — with 3s manual fallback */}
            {selectedLocation && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground">
                  {manualAddress
                    ? manualAddress
                    : typeof address === "string" && address.length > 0 && !address.includes("Searching")
                      ? address
                      : showManualAddress
                        ? `Location: ${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`
                        : "Searching address..."}
                </p>
                {showManualAddress && !manualAddress && (
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Input
                      placeholder="Enter address manually"
                      value={manualAddress}
                      onChange={(e) => setManualAddress(e.target.value)}
                      className="rounded-xl text-sm h-9 flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl text-xs"
                      onClick={() => {
                        if (manualAddress.trim()) {
                          toast.success("Address set");
                        }
                      }}
                    >
                      Use
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Spec: Dropdown Topic selector */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Topic</label>
              <div className="relative">
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full h-11 rounded-xl border border-border bg-white px-4 text-sm font-medium appearance-none pr-10"
                  style={{ color: ALERT_TYPE_COLORS[alertType] }}
                >
                  <option value="Stray">Stray</option>
                  <option value="Lost">Lost</option>
                  <option value="Others">Others</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Title — max 100 chars */}
            <div className="space-y-1 mb-3">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                placeholder=""
                value={alertTitle}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_TITLE_CHARS) setAlertTitle(e.target.value);
                }}
                className="rounded-xl"
                maxLength={MAX_TITLE_CHARS}
              />
              <div className="flex justify-end text-xs text-muted-foreground">
                <span>{alertTitle.length}/{MAX_TITLE_CHARS}</span>
              </div>
            </div>

            {/* Description — max 500 chars */}
            <div className="space-y-1 mb-3">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                placeholder=""
                value={description}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_DESC_CHARS) setDescription(e.target.value);
                }}
                className="rounded-xl min-h-[80px]"
              />
              <div className="flex justify-end text-xs text-muted-foreground">
                <span>{description.length}/{MAX_DESC_CHARS}</span>
              </div>
            </div>

            {/* Image upload */}
            {imagePreview ? (
              <div className="relative mb-3">
                <img src={imagePreview} alt="" className="rounded-xl max-h-32 object-cover w-full" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer mb-3">
                <Camera className="w-5 h-5" />
                Add Photo
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
            )}

            {/* Range/Duration tier-gated dropdowns */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Range</div>
                <select
                  value={String(selectedRangeKm ?? broadcastRange)}
                  onChange={(e) => setSelectedRangeKm(Number(e.target.value))}
                  className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="2">2km</option>
                  <option value="10" disabled={broadcastRange < 10}>10km{broadcastRange < 10 ? " (Premium)" : ""}</option>
                  <option value="20" disabled={broadcastRange < 20}>20km{broadcastRange < 20 ? " (Premium)" : ""}</option>
                  <option value="25" disabled={broadcastRange < 25}>25km{broadcastRange < 25 ? " (Gold)" : ""}</option>
                  <option value="50" disabled={broadcastRange < 50}>50km{broadcastRange < 50 ? " (Gold)" : ""}</option>
                  <option value="150" disabled={extraBroadcast72h <= 0}>150km (Add-on)</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Duration</div>
                <select
                  value={String(selectedDurationH ?? (effectiveTier === "gold" ? 48 : isPremium ? 24 : 12))}
                  onChange={(e) => setSelectedDurationH(Number(e.target.value))}
                  className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="12">12h</option>
                  <option value="24" disabled={!isPremium}>24h{!isPremium ? " (Premium)" : ""}</option>
                  <option value="48" disabled={effectiveTier !== "gold"}>48h{effectiveTier !== "gold" ? " (Gold)" : ""}</option>
                  <option value="72" disabled={extraBroadcast72h <= 0}>72h (Add-on)</option>
                </select>
              </div>
            </div>

            {/* Post on Threads checkbox — Stray/Lost only */}
            {(alertType === "Stray" || alertType === "Lost") && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <input
                  type="checkbox"
                  checked={postOnThreads}
                  onChange={(e) => setPostOnThreads(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Post on Threads
              </label>
            )}

            {/* Submit button — disabled while address is still searching */}
            <Button
              onClick={handleSubmit}
              disabled={creating || !selectedLocation}
              className="w-full h-12 rounded-xl text-white font-semibold"
              style={{ backgroundColor: ALERT_TYPE_COLORS[alertType] }}
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Broadcast {alertType} Alert
                </span>
              )}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BroadcastModal;
