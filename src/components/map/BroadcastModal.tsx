import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getBroadcastPinStyle, normalizeBroadcastAlertType } from "@/lib/broadcastPinStyle";
import { humanError } from "@/lib/humanError";
import { toast } from "sonner";

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocation: { lat: number; lng: number } | null;
  alertType: string;
  onAlertTypeChange: (next: string) => void;
  onRequestPinLocation: () => void;
  onClearLocation: () => void;
  onRequestUpgrade: () => void;
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
      support_count: number;
      report_count: number;
      created_at: string;
      creator_id: string | null;
      thread_id: string | null;
      creator: { display_name: string | null; avatar_url: string | null } | null;
      expires_at?: string | null;
      range_meters?: number | null;
    };
  }) => void;
  onError: () => void;
}

const BroadcastModal = ({
  isOpen,
  onClose,
  selectedLocation,
  alertType,
  onAlertTypeChange,
  onRequestPinLocation,
  onClearLocation,
  onRequestUpgrade,
  onSuccess,
  onError,
}: BroadcastModalProps) => {
  const { user, profile } = useAuth();
  const [alertTitle, setAlertTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [postOnThreads, setPostOnThreads] = useState(false);
  const [creating, setCreating] = useState(false);
  const normalizedType = useMemo(() => normalizeBroadcastAlertType(alertType), [alertType]);
  const pinStyle = useMemo(() => getBroadcastPinStyle(normalizedType), [normalizedType]);
  const tier = String(profile?.effective_tier || profile?.tier || "free").toLowerCase();
  const baseRangeKm = tier === "gold" ? 50 : tier === "premium" ? 25 : 10;
  const baseDurationHours = tier === "gold" ? 48 : tier === "premium" ? 24 : 12;
  const [extraBroadcast72h, setExtraBroadcast72h] = useState<number>(0);
  const capRangeKm = extraBroadcast72h > 0 ? 150 : baseRangeKm;
  const capDurationHours = extraBroadcast72h > 0 ? 72 : baseDurationHours;
  const [rangeKm, setRangeKm] = useState<number>(baseRangeKm);
  const [durationHours, setDurationHours] = useState<number>(baseDurationHours);
  const [showUpsell, setShowUpsell] = useState(false);
  const upsellOnceRef = useRef(false);
  const upsellResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    setRangeKm((current) => Math.min(current, capRangeKm));
    setDurationHours((current) => Math.min(current, capDurationHours));
  }, [capDurationHours, capRangeKm, isOpen]);

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

  const handleSubmit = async () => {
    if (!user || !selectedLocation) {
      toast.error("Pin location first");
      return;
    }
    if (rangeKm > capRangeKm || durationHours > capDurationHours) {
      toast.error(`Tier limit exceeded. Max ${capRangeKm}km and ${capDurationHours}h for your plan.`);
      onError();
      return;
    }

    setCreating(true);
    let photoUrl: string | null = null;
    let createdAlertId: string | null = null;
    try {
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop() || "jpg";
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const upload = await supabase.storage.from("alerts").upload(fileName, imageFile);
        if (upload.error) throw upload.error;
        photoUrl = supabase.storage.from("alerts").getPublicUrl(fileName).data.publicUrl;
      }

      console.log("[BROADCAST_PAYLOAD]", {
        type: normalizedType,
        title: alertTitle.trim(),
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        rangeKm,
        durationHours,
        postOnThreads,
        hasImage: Boolean(photoUrl),
      });

      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      const rangeMeters = Math.round(rangeKm * 1000);
      const locationLabel = "Pinned Location";

      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes.data.session;
      console.log("[UAT_AUTH_STATE]", {
        sessionPresent: Boolean(session),
        accessTokenPresent: Boolean(session?.access_token),
        sessionUserId: session?.user?.id ?? null,
        contextUserId: user?.id ?? null,
      });
      const { data: whoami, error: whoErr } = await supabase.rpc("debug_whoami");
      console.log("[UAT_WHOAMI]", { whoami, error: whoErr?.message ?? null });

      const { data, error } = await supabase
        .from("map_alerts")
        .insert({
          creator_id: user.id,
          alert_type: normalizedType,
          title: alertTitle.trim() || null,
          description: description.trim() || null,
          photo_url: photoUrl,
          media_urls: photoUrl ? [photoUrl] : null,
          address: null,
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
          range_meters: rangeMeters,
          range_km: rangeKm,
          duration_hours: durationHours,
          expires_at: expiresAt,
          post_on_social: postOnThreads,
          posted_to_threads: postOnThreads,
          location_street: null,
          location_district: null,
        })
        .select("id, created_at, expires_at, range_meters")
        .single();

      if (error) throw error;
      createdAlertId = data.id;

      let threadId: string | null = null;
      if (postOnThreads && (normalizedType === "Stray" || normalizedType === "Lost" || normalizedType === "Others")) {
        const canonicalTitle = alertTitle.trim() || `${normalizedType} Alert`;
        const canonicalText = [
          `Type: ${normalizedType}`,
          canonicalTitle ? `Title: ${canonicalTitle}` : "",
          description.trim() ? `Description: ${description.trim()}` : "",
          `Location: ${locationLabel}`,
        ]
          .filter(Boolean)
          .join("\n");

        const { data: threadRow, error: threadError } = await supabase
          .from("threads")
          .insert({
            user_id: user.id,
            title: canonicalTitle,
            content: canonicalText,
            images: photoUrl ? [photoUrl] : [],
            is_map_alert: true,
            map_id: data.id,
            is_public: true,
          })
          .select("id")
          .single();

        if (threadError) {
          console.error("[SOCIAL_DUPLICATION_ERROR]", threadError);
          toast.error(`Pinned, but Social failed: ${humanError(threadError)}`);
          await supabase
          .from("map_alerts")
          .update({ social_status: "failed" } as Record<string, unknown>)
          .eq("id", data.id);
        } else {
          threadId = threadRow.id;
          await supabase
            .from("map_alerts")
            .update({
              thread_id: threadId,
              social_post_id: threadId,
              posted_to_threads: true,
              social_status: "posted",
              social_url: `/threads/${threadId}`,
            } as Record<string, unknown>)
            .eq("id", data.id);
        }
      }

      console.log("[RPC_RESULT]", { alert_id: data.id, thread_id: threadId, mode: "direct_insert_map_alerts" });

      onSuccess({
        alertId: data.id,
        threadId,
        alert: {
          id: data.id,
          latitude: selectedLocation.lat,
          longitude: selectedLocation.lng,
          alert_type: normalizedType,
          title: alertTitle.trim() || null,
          description: description.trim() || null,
          photo_url: photoUrl,
          support_count: 0,
          report_count: 0,
          created_at: data.created_at || new Date().toISOString(),
          creator_id: user.id,
          thread_id: threadId,
          social_post_id: threadId,
          post_on_social: postOnThreads,
          expires_at: data.expires_at ?? expiresAt,
          range_meters: data.range_meters ?? rangeMeters,
          range_km: rangeKm,
          duration_hours: durationHours,
          creator: {
            display_name: profile?.display_name || null,
            avatar_url: profile?.avatar_url || null,
          },
        },
      });

      toast.success("Your pin is live!");
      onClose();
    } catch (err) {
      if (createdAlertId) {
        await supabase.from("map_alerts").delete().eq("id", createdAlertId);
      }
      console.error("[BASELINE_INSERT_ERROR]", err);
      toast.error(`Broadcast failed: ${humanError(err)}`);
      onError();
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
          className="fixed inset-0 z-[5000] bg-black/50 flex items-end"
          onClick={onClose}
        >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full bg-card rounded-t-3xl p-6 max-h-[90vh] overflow-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-brandText">Broadcast Alert</h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  if (selectedLocation) {
                    onClearLocation();
                  } else {
                    onRequestPinLocation();
                    onClose();
                  }
                }}
                className={[
                  "h-9 rounded-full px-4 text-xs font-semibold",
                  selectedLocation ? "bg-muted text-muted-foreground hover:bg-muted" : "bg-[#2145CF] text-white hover:bg-[#1b39ab]",
                ].join(" ")}
              >
                {selectedLocation ? "Remove Location" : "Pin location"}
              </Button>
              <button onClick={onClose} aria-label="Close">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Topic</label>
              <select
                value={normalizedType}
                onChange={(e) => onAlertTypeChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-white px-4 text-sm font-medium"
                style={{ color: pinStyle.color }}
              >
                <option value="Stray">Stray</option>
                <option value="Lost">Lost</option>
                <option value="Others">Others</option>
              </select>
            </div>

            <div className="mb-4 rounded-xl border border-border p-3">
              <div className="text-xs text-muted-foreground mb-2">
                Tier limit: up to {baseRangeKm}km and {baseDurationHours}h
              </div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Range: {rangeKm} km
              </label>
              <input
                type="range"
                min={1}
                max={150}
                step={1}
                value={rangeKm}
                onPointerDown={() => {
                  upsellOnceRef.current = false;
                }}
                onPointerUp={() => {
                  upsellOnceRef.current = false;
                }}
                onTouchEnd={() => {
                  upsellOnceRef.current = false;
                }}
                onChange={(e) => handleRangeChange(Number(e.target.value))}
                className="w-full"
              />
              <label className="text-xs font-medium text-muted-foreground mb-1 mt-3 block">
                Duration: {durationHours} h
              </label>
              <input
                type="range"
                min={1}
                max={72}
                step={1}
                value={durationHours}
                onPointerDown={() => {
                  upsellOnceRef.current = false;
                }}
                onPointerUp={() => {
                  upsellOnceRef.current = false;
                }}
                onTouchEnd={() => {
                  upsellOnceRef.current = false;
                }}
                onChange={(e) => handleDurationChange(Number(e.target.value))}
                className="w-full"
              />
              {showUpsell && extraBroadcast72h <= 0 ? (
                <div className="mt-3 rounded-xl border border-[#EAB308]/30 bg-[#FEF9C3] p-3 text-xs text-[#854D0E] flex items-center justify-between gap-3">
                  <span>Upgrade your membership to enjoy this perk!</span>
                  <button
                    type="button"
                    onClick={onRequestUpgrade}
                    className="shrink-0 rounded-full bg-[#A6D539] px-3 py-1 text-[11px] font-semibold text-brandText"
                  >
                    Upgrade
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-1 mb-3">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={alertTitle} onChange={(e) => setAlertTitle(e.target.value.slice(0, 100))} />
            </div>

            <div className="space-y-1 mb-3">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} className="min-h-[80px]" />
            </div>

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
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImageFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setImagePreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}

            <label className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <input
                type="checkbox"
                checked={postOnThreads}
                onChange={(e) => setPostOnThreads(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              Posted on Social
            </label>

            <Button
              onClick={handleSubmit}
              disabled={creating || !selectedLocation}
              className="w-full h-12 rounded-xl text-white font-semibold"
              style={{ backgroundColor: pinStyle.color }}
            >
              {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Broadcast {normalizedType} Alert
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
