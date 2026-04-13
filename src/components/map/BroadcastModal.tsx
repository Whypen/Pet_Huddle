import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Camera, ChevronDown, Loader2, MapPin, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NeuButton } from "@/components/ui/NeuButton";
import { NeuSlider } from "@/components/ui/NeuSlider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getBroadcastPinStyle, normalizeBroadcastAlertType } from "@/lib/broadcastPinStyle";
import { quotaConfig } from "@/config/quotaConfig";
import { humanError } from "@/lib/humanError";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/constants";
import { toast } from "sonner";
import { MediaThumb } from "@/components/media/MediaThumb";
import { detectSensitiveImage } from "@/lib/sensitiveContent";

type BroadcastMedia = {
  file: File;
  previewUrl: string;
};

const MAX_BROADCAST_MEDIA = 10;
type UploadLifecycleStatus = "idle" | "uploading" | "success" | "error";

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: { lat: number; lng: number } | null;
  selectedAddress?: string | null;
  alertType: string;
  onAlertTypeChange: (next: string) => void;
  onRequestPinLocation: () => void;
  onClearLocation: () => void;
  onSuccess: (payload?: {
    alertId: string | null;
    threadId: string | null;
    alert: {
      id: string;
      latitude: number;
      longitude: number;
      alert_type: string;
      title: string | null;
      description: string | null;
      photo_url: string | null;
      media_urls?: string[] | null;
      support_count: number;
      report_count: number;
      created_at: string;
      creator_id: string | null;
      thread_id: string | null;
      creator: { display_name: string | null; avatar_url: string | null } | null;
      expires_at?: string | null;
      range_meters?: number | null;
      is_sensitive?: boolean;
    };
  }) => void;
  onError: () => void;
}

const BroadcastModal = ({
  isOpen,
  onClose,
  selectedLocation,
  selectedAddress,
  alertType,
  onAlertTypeChange,
  onRequestPinLocation,
  onClearLocation,
  onSuccess,
  onError,
}: BroadcastModalProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [alertTitle, setAlertTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaFiles, setMediaFiles] = useState<BroadcastMedia[]>([]);
  const [postOnThreads, setPostOnThreads] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [sensitiveSuggested, setSensitiveSuggested] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadLifecycleStatus>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const normalizedType = useMemo(() => normalizeBroadcastAlertType(alertType), [alertType]);
  const pinStyle = useMemo(() => getBroadcastPinStyle(normalizedType), [normalizedType]);
  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const baseRangeKm = tier === "gold" ? 50 : tier === "plus" ? 25 : 10;
  const baseDurationHours = tier === "gold" ? 48 : tier === "plus" ? 24 : 12;
  const [extraBroadcast72h, setExtraBroadcast72h] = useState<number>(0);
  const capRangeKm = extraBroadcast72h > 0 ? 150 : baseRangeKm;
  const capDurationHours = extraBroadcast72h > 0 ? 72 : baseDurationHours;
  const [rangeKm, setRangeKm] = useState<number>(baseRangeKm);
  const [durationHours, setDurationHours] = useState<number>(baseDurationHours);
  const [showUpsell, setShowUpsell] = useState(false);
  const upsellOnceRef = useRef(false);
  const upsellResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadTickerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);
  const RANGE_STEPS = [1, 5, 10, 25, 50, 100, 150];
  const DURATION_STEPS = [1, 3, 6, 12, 24, 48, 72];

  useEffect(() => {
    if (!isOpen) return;
    setShowUpsell(false);
    upsellOnceRef.current = false;
    if (upsellResetTimerRef.current) clearTimeout(upsellResetTimerRef.current);

    (async () => {
      if (!user) return;
      const r = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: unknown }>)(
        "get_quota_snapshot"
      );
      if (r.error) return;
      const row = Array.isArray(r.data) ? r.data[0] : r.data;
      const extra = row && typeof (row as Record<string, unknown>).extra_broadcast_72h === "number"
        ? ((row as Record<string, unknown>).extra_broadcast_72h as number)
        : 0;
      setExtraBroadcast72h(extra);
    })();
  }, [isOpen, user]);

  const clearUploadTicker = () => {
    if (uploadTickerRef.current) {
      window.clearInterval(uploadTickerRef.current);
      uploadTickerRef.current = null;
    }
  };

  const startUploadTicker = () => {
    clearUploadTicker();
    setUploadStatus("uploading");
    setUploadProgress(8);
    uploadTickerRef.current = window.setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 6, 92));
    }, 180);
  };

  useEffect(() => {
    if (!isOpen) return;
    setRangeKm((current) => Math.min(current, capRangeKm));
    setDurationHours((current) => Math.min(current, capDurationHours));
  }, [capDurationHours, capRangeKm, isOpen]);

  useEffect(() => {
    return () => {
      mediaFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      clearUploadTicker();
    };
  }, [mediaFiles]);

  useEffect(() => {
    if (mediaFiles.length > 0) return;
    setIsSensitive(false);
    setSensitiveSuggested(false);
  }, [mediaFiles.length]);

  const showUpsellOncePerDrag = () => {
    if (upsellOnceRef.current) return;
    upsellOnceRef.current = true;
    setShowUpsell(true);
    if (upsellResetTimerRef.current) clearTimeout(upsellResetTimerRef.current);
    upsellResetTimerRef.current = setTimeout(() => {
      upsellOnceRef.current = false;
    }, 1000);
  };

  const handleRangeChange = (nextValue: number) => {
    if (nextValue > capRangeKm) {
      setRangeKm(capRangeKm);
      showUpsellOncePerDrag();
      return;
    }
    setRangeKm(nextValue);
  };

  const handleDurationChange = (nextValue: number) => {
    if (nextValue > capDurationHours) {
      setDurationHours(capDurationHours);
      showUpsellOncePerDrag();
      return;
    }
    setDurationHours(nextValue);
  };

  const removeMediaAt = (index: number) => {
    setMediaFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const handleMediaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const availableSlots = Math.max(0, MAX_BROADCAST_MEDIA - mediaFiles.length);
    if (availableSlots <= 0) {
      toast.error(`You can upload up to ${MAX_BROADCAST_MEDIA} photos.`);
      event.target.value = "";
      return;
    }

    const acceptedFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, availableSlots);
    if (acceptedFiles.length < files.length) {
      toast.info(`Only the first ${MAX_BROADCAST_MEDIA} photos are kept.`);
    }

    const prepared = acceptedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setMediaFiles((prev) => [...prev, ...prepared]);
    const firstImage = acceptedFiles[0];
    if (firstImage) {
      void detectSensitiveImage(firstImage)
        .then((result) => {
          if (!result.isSensitive) return;
          setIsSensitive(true);
          setSensitiveSuggested(true);
        })
        .catch(() => {
          // Soft suggestion only.
        });
    }
    event.target.value = "";
  };

  const resetComposer = () => {
    setAlertTitle("");
    setDescription("");
    setMediaFiles((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setPostOnThreads(false);
    setIsSensitive(false);
    setSensitiveSuggested(false);
    setRangeKm(baseRangeKm);
    setDurationHours(baseDurationHours);
    clearUploadTicker();
    setUploadStatus("idle");
    setUploadProgress(0);
  };

  const handleSubmit = async () => {
    if (!user || !selectedLocation) {
      toast.error("Pin location first");
      return;
    }
    if (rangeKm > capRangeKm || durationHours > capDurationHours) {
      toast.error("Adjust range or duration to continue.");
      onError();
      return;
    }

    setCreating(true);
    let photoUrl: string | null = null;
    let photoUrls: string[] = [];
    let createdAlertId: string | null = null;
    try {
      let resolvedAddress = selectedAddress || null;
      if (!resolvedAddress && selectedLocation) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${selectedLocation.lng},${selectedLocation.lat}.json?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}&types=address,place,locality,neighborhood&limit=1&language=en`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            resolvedAddress = String(data?.features?.[0]?.place_name || "").trim() || null;
          }
        } catch {
          resolvedAddress = selectedAddress || null;
        }
      }

      if (mediaFiles.length > 0) {
        startUploadTicker();
        const uploaded: string[] = [];
        try {
          for (const [index, item] of mediaFiles.entries()) {
            const fileExt = item.file.name.split(".").pop() || "jpg";
            const fileName = `${user.id}/${Date.now()}-${index}.${fileExt}`;
            const upload = await supabase.storage.from("alerts").upload(fileName, item.file);
            if (upload.error) throw upload.error;
            const publicUrl = supabase.storage.from("alerts").getPublicUrl(fileName).data.publicUrl;
            if (publicUrl) uploaded.push(publicUrl);
            const ratio = (index + 1) / mediaFiles.length;
            setUploadProgress(Math.max(8, Math.min(96, Math.round(8 + ratio * 88))));
          }
          clearUploadTicker();
          setUploadStatus("success");
          setUploadProgress(100);
          window.setTimeout(() => {
            setUploadStatus((prev) => (prev === "success" ? "idle" : prev));
            setUploadProgress((prev) => (prev === 100 ? 0 : prev));
          }, 1200);
        } catch (uploadError) {
          clearUploadTicker();
          setUploadStatus("error");
          setUploadProgress(0);
          window.setTimeout(() => setUploadStatus("idle"), 2000);
          throw uploadError;
        }
        photoUrls = uploaded.filter(Boolean);
        photoUrl = photoUrls[0] || null;
      }

      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      const rangeMeters = Math.round(rangeKm * 1000);
      const payload = {
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        type: normalizedType,
        title: alertTitle.trim() || null,
        description: description.trim() || null,
        address: resolvedAddress,
        photo_url: photoUrl,
        images: photoUrls,
        range_meters: rangeMeters,
        expires_at: expiresAt,
        post_on_social: postOnThreads,
        post_on_threads: postOnThreads,
        is_sensitive: isSensitive,
      };

      const rpcResult = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        "create_alert_thread_and_pin",
        { payload }
      );
      if (rpcResult.error) throw rpcResult.error;

      const rpcData = (rpcResult.data || {}) as { alert_id?: string | null; thread_id?: string | null };
      createdAlertId = rpcData.alert_id ?? null;
      if (!createdAlertId) {
        throw { message: "Broadcast create RPC did not return alert_id" };
      }
      const threadId: string | null = rpcData.thread_id ?? null;

      onSuccess({
        alertId: createdAlertId,
        threadId,
        alert: {
          id: createdAlertId,
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
          alert_type: normalizedType,
          title: alertTitle.trim() || null,
          description: description.trim() || null,
          photo_url: photoUrl,
          media_urls: photoUrls,
          support_count: 0,
          report_count: 0,
          created_at: new Date().toISOString(),
          creator_id: user.id,
          thread_id: threadId,
          social_post_id: threadId,
          post_on_social: postOnThreads,
          expires_at: expiresAt,
          range_meters: rangeMeters,
          range_km: rangeKm,
          duration_hours: durationHours,
          is_sensitive: isSensitive,
          creator: {
            display_name: profile?.display_name || null,
            avatar_url: profile?.avatar_url || null,
          },
        },
      });

      toast.success("Your pin is live!");
      resetComposer();
      onClose();
    } catch (err) {
      console.error("[BASELINE_INSERT_ERROR]", err);
      const normalizedError = humanError(err).toLowerCase();
      if (normalizedError.includes("active broadcast") || normalizedError.includes("slot")) {
        toast.error(quotaConfig.copy.broadcast.slotsFull);
      } else {
        toast.error(`Broadcast failed: ${humanError(err)}`);
      }
      onError();
    } finally {
      setCreating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5000] bg-black/50"
          onClick={onClose}
        >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="fixed left-0 right-0 bottom-0 w-full bg-card rounded-t-3xl p-6 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+12px)] max-h-[100svh] overflow-auto border-t border-border shadow-elevated"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-brandText">Broadcast Alert</h2>
            <div className="flex items-center gap-2">
              <button onClick={onClose} aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

            <div className="mb-4 flex items-center gap-2">
              {/* Pin button + type select — single compound field */}
              <div className="form-field-rest relative flex flex-1 min-w-0 items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedLocation) {
                      onClearLocation();
                      return;
                    }
                    onRequestPinLocation();
                  }}
                  className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full ml-1"
                  style={selectedLocation
                    ? { background: "rgba(115,122,140,0.12)" }
                    : { background: `${pinStyle.color}1a` }
                  }
                  aria-label={selectedLocation ? "Clear pinned location" : "Pin location"}
                  title={selectedLocation ? "Clear pinned location" : "Pin location"}
                >
                  {selectedLocation ? (
                    <X className="h-3.5 w-3.5 text-[#737A8C]" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5" style={{ color: pinStyle.color }} strokeWidth={2.5} />
                  )}
                </button>
                {/* Thin divider */}
                <div className="mx-2 h-4 w-px shrink-0 bg-border/60" />
                <select
                  value={normalizedType}
                  onChange={(e) => onAlertTypeChange(e.target.value)}
                  className="field-input-core appearance-none bg-transparent pr-9 text-sm font-semibold"
                  style={{ color: pinStyle.color }}
                >
                  <option value="Stray">Stray</option>
                  <option value="Lost">Lost</option>
                  <option value="Caution">Caution</option>
                  <option value="Others">Others</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 h-4 w-4 text-[var(--text-tertiary)]" />
              </div>
              {/* On Social — height matches form-field-rest (52px) */}
              <div className="flex shrink-0 h-[52px] items-center gap-2 rounded-[14px] bg-muted/50 px-3">
                <span className="text-sm font-medium text-brandText whitespace-nowrap">On Social</span>
                <Switch checked={postOnThreads} onCheckedChange={setPostOnThreads} />
              </div>
            </div>
            {!selectedLocation ? (
              <p className="mb-3 text-xs font-medium text-[var(--text-tertiary)]">
                Tap the Pin icon to place your alert.
              </p>
            ) : null}

            <div className="mb-4 rounded-xl border border-border bg-white p-4">
              <div className="space-y-4">
                <NeuSlider
                  label="Reach"
                  showValue
                  formatValue={(v) => `${RANGE_STEPS[v] ?? rangeKm} km`}
                  min={0}
                  max={RANGE_STEPS.length - 1}
                  step={1}
                  value={[Math.max(0, RANGE_STEPS.indexOf(rangeKm))]}
                  onValueChange={([idx = 0]) => handleRangeChange(RANGE_STEPS[idx] ?? rangeKm)}
                />
                <NeuSlider
                  label="Duration"
                  showValue
                  formatValue={(v) => `${DURATION_STEPS[v] ?? durationHours} hrs`}
                  min={0}
                  max={DURATION_STEPS.length - 1}
                  step={1}
                  value={[Math.max(0, DURATION_STEPS.indexOf(durationHours))]}
                  onValueChange={([idx = 0]) => handleDurationChange(DURATION_STEPS[idx] ?? durationHours)}
                />
              </div>
              {showUpsell && extraBroadcast72h <= 0 ? (
                <div className="mt-3 rounded-xl border border-border bg-white p-3 text-xs text-brandText flex items-center justify-between gap-3">
                  <span>Upgrade to spread wider & stay longer!</span>
                  <button
                    type="button"
                    onClick={() => navigate("/premium")}
                    className="shrink-0 rounded-full border border-brandBlue/25 bg-white px-3 py-1 text-[11px] font-semibold text-brandBlue"
                  >
                    Unlock
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mb-3 space-y-3">
              <div className="form-field-rest relative flex items-center">
                <Input
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value.slice(0, 100))}
                  placeholder="Describe the situation"
                  className="field-input-core h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none focus-visible:ring-0"
                />
              </div>

              <div className="form-field-rest relative h-auto min-h-[112px] py-3">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  className="field-input-core min-h-[88px] resize-none rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none focus-visible:ring-0"
                  placeholder="Details help everyone stay connected"
                />
              </div>
            </div>

            {mediaFiles.length > 0 ? (
              <div className="mt-4 mb-3 flex items-start">
                <div className="flex flex-wrap items-start gap-3">
                  {mediaFiles.map((item, index) => (
                    <div key={`${item.previewUrl}-${index}`} className="relative h-[150px] w-[150px] shrink-0 overflow-hidden rounded-[24px]">
                      <MediaThumb
                        src={item.previewUrl}
                        alt={`Broadcast preview ${index + 1}`}
                        className={`h-full w-full rounded-[24px] ${uploadStatus === "uploading" ? "opacity-70 blur-[1.5px]" : ""}`}
                      />
                      {uploadStatus === "uploading" ? (
                        <div className="pointer-events-none absolute inset-0 z-[8] flex items-center justify-center bg-black/25 text-xs font-semibold text-white">
                          Uploading {Math.round(uploadProgress)}%
                        </div>
                      ) : null}
                      <button
                        onClick={() => removeMediaAt(index)}
                        className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {mediaFiles.length > 0 ? (
              <div className="mb-3">
                <label className="flex items-start gap-2 text-xs text-[rgba(74,73,101,0.78)]">
                  <input
                    type="checkbox"
                    checked={isSensitive}
                    onChange={(event) => {
                      setIsSensitive(event.target.checked);
                      if (!event.target.checked) setSensitiveSuggested(false);
                    }}
                    className="mt-[2px] h-4 w-4 rounded border-border"
                  />
                  <span>This photo contains injury, blood, sensitive or disturbing content</span>
                </label>
                {sensitiveSuggested ? (
                  <p className="mt-1 text-xs text-[#B46900]">Detected possible sensitive content</p>
                ) : null}
              </div>
            ) : null}

            <div className="mb-1 flex items-center gap-3">
              <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-muted/60 hover:bg-muted">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleMediaChange}
                />
              </label>
              <NeuButton
                onClick={handleSubmit}
                disabled={creating || !selectedLocation}
                className="flex-1 h-12 rounded-xl font-semibold disabled:bg-muted disabled:text-muted-foreground"
                style={creating || !selectedLocation ? undefined : { backgroundColor: pinStyle.color, color: "#fff" }}
              >
                {creating ? (
                  uploadStatus === "uploading"
                    ? <span className="text-sm font-semibold">Uploading {Math.round(uploadProgress)}%</span>
                    : <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Broadcast {normalizedType} Alert
                  </span>
                )}
              </NeuButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default BroadcastModal;
