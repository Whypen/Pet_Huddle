/**
 * PinDetailModal.tsx — Viewer POV & Abuse Shield
 *
 * Spec:
 * - Full view modal for alert details
 * - Threads-style footer: 3-dots (Report/Hide/Block) | Share | Heart | "See on Threads"
 * - Native Web Share API with clipboard fallback
 * - abuse_count > 10 → DB active=false → immediate hide
 * - Creator can Edit/Remove (all alert types)
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  X,
  Heart,
  Send,
  Flag,
  Ban,
  EyeOff,
  Pencil,
  Trash2,
  MoreHorizontal,
  Camera,
} from "lucide-react";
import { NeuButton } from "@/components/ui/NeuButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { PostMediaCarousel } from "@/components/social/PostMediaCarousel";
import { ShareSheet } from "@/components/social/ShareSheet";
import { areUsersBlocked } from "@/lib/blocking";
import { MediaThumb } from "@/components/media/MediaThumb";
import { buildShareModel, type ShareModel } from "@/lib/shareModel";
import { ReportModal } from "@/components/moderation/ReportModal";

const DEMO_SEEDED = String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? "false") === "true";

const MAX_TITLE_CHARS = 100;
const MAX_DESC_CHARS = 500;
const MAX_BROADCAST_MEDIA = 10;

type EditableBroadcastMedia = {
  id: string;
  url: string;
  file?: File;
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  Stray:   "#EAB308",
  Lost:    "#EF4444",
  Caution: "#2145CF",
  Found:   "#A1A4A9",
  Others:  "#A1A4A9",
};

const timeAgo = (iso: string) => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
};

interface MapAlert {
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
  expires_at?: string | null;
  duration_hours?: number | null;
  range_meters?: number | null;
  range_km?: number | null;
  creator_id?: string | null;
  has_thread?: boolean;
  thread_id?: string | null;
  posted_to_threads?: boolean;
  post_on_social?: boolean;
  social_post_id?: string | null;
  social_status?: string | null;
  social_url?: string | null;
  is_sensitive?: boolean;
  location_street?: string | null;
  location_district?: string | null;
  creator: {
    display_name: string | null;
    social_id?: string | null;
    avatar_url: string | null;
  } | null;
}

interface PinDetailModalProps {
  alert: MapAlert | null;
  onClose: () => void;
  onHide: (id: string) => void;
  onRefresh: () => void;
  onOpenProfile?: (userId: string, fallbackName: string) => void;
}

  const PinDetailModal = ({ alert, onClose, onHide, onRefresh, onOpenProfile }: PinDetailModalProps) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [liked, setLiked] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editMedia, setEditMedia] = useState<EditableBroadcastMedia[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareModel | null>(null);

  const [supportCount, setSupportCount] = useState(0);

  // Sync support count from alert prop
  useEffect(() => {
    if (alert) {
      setSupportCount(alert.support_count || 0);
    }
  }, [alert]);

  useEffect(() => {
    let cancelled = false;
    const loadSupportState = async () => {
      if (!alert || !user) {
        if (!cancelled) setLiked(false);
        return;
      }
      const { data } = await supabase
        .from("broadcast_alert_interactions" as "profiles")
        .select("id")
        .eq("alert_id", alert.id)
        .eq("user_id", user.id)
        .eq("interaction_type", "support")
        .maybeSingle();
      if (!cancelled) setLiked(Boolean(data));
    };
    void loadSupportState();
    return () => {
      cancelled = true;
    };
  }, [alert, user]);

  const syncSupportCount = useCallback(async () => {
    if (!alert) return;
    const { count } = await supabase
      .from("broadcast_alert_interactions" as "profiles")
      .select("id", { count: "exact", head: true })
      .eq("alert_id", alert.id)
      .eq("interaction_type", "support");
    setSupportCount(Number(count ?? 0));
  }, [alert]);

  const enqueueSupportNotification = useCallback(async () => {
    if (!alert?.creator_id || !user?.id) return;
    if (alert.creator_id === user.id) return;
    await (supabase.rpc as (fn: string, params?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
      "upsert_notification_window",
      {
        p_owner_user_id: alert.creator_id,
        p_subject_id: alert.id,
        p_subject_type: "alert",
        p_kind: "alert_like",
        p_category: "map",
        p_href: `/map?alert=${encodeURIComponent(alert.id)}`,
        p_actor_id: user.id,
        p_actor_name: profile?.display_name || "Someone",
      }
    );
  }, [alert?.creator_id, alert?.id, profile?.display_name, user?.id]);

  // Support toggle: Single tap = +1. Tap again (when liked) = -1.
  const handleSupport = async () => {
    if (!user || !alert) {
      toast.error("Please login to support alerts");
      return;
    }
    if (alert.creator_id) {
      const blocked = await areUsersBlocked(user.id, alert.creator_id);
      if (blocked) {
        toast.error("You cannot support this user.");
        return;
      }
    }

    if (liked) {
      // Already liked → remove support
      try {
        const { error } = await supabase
          .from("broadcast_alert_interactions" as "profiles")
          .delete()
          .eq("alert_id", alert.id)
          .eq("user_id", user.id)
          .eq("interaction_type", "support");
        if (error) throw error;

        setLiked(false);
        await syncSupportCount();
        onRefresh();
      } catch {
        toast.error("Failed to remove support");
      }
      return;
    }

    // Not yet liked → add support
    try {
      const { error } = await (supabase.from("broadcast_alert_interactions" as "profiles") as unknown as {
        upsert: (v: object, o: object) => Promise<{ error: unknown }>;
      }).upsert(
        { alert_id: alert.id, user_id: user.id, interaction_type: "support" },
        { onConflict: "alert_id,user_id,interaction_type", ignoreDuplicates: true },
      );
      if (error) throw error;

      setLiked(true);
      await syncSupportCount();
      await enqueueSupportNotification();
      onRefresh();
    } catch {
      toast.error("Failed to support alert");
    }
  };

  const handleReportModalOpen = async () => {
    if (!user || !alert) {
      toast.error("Please login to report alerts");
      return;
    }
    if (!alert.creator_id) {
      toast.error("Unable to submit report right now.");
      return;
    }
    if (alert.creator_id) {
      const blocked = await areUsersBlocked(user.id, alert.creator_id);
      if (blocked) {
        toast.error("You cannot report this user.");
        return;
      }
    }
    setShowMenu(false);
    setReportOpen(true);
  };

  // Keep alert abuse interaction in sync after shared report modal submission.
  const handleReportSubmitSuccess = useCallback(async () => {
    if (!user || !alert) return;
    try {
      const { error } = await (supabase.from("broadcast_alert_interactions" as "profiles") as unknown as {
        upsert: (v: object, o: object) => Promise<{ error: unknown }>;
      }).upsert(
        { alert_id: alert.id, user_id: user.id, interaction_type: "report" },
        { onConflict: "alert_id,user_id,interaction_type", ignoreDuplicates: true },
      );
      if (error) throw error;

      onRefresh();
    } catch {
      toast.error("Report sent, but alert abuse signal failed to sync.");
    }
  }, [alert, onRefresh, user]);

  const handleBlockUser = async () => {
    if (!alert?.creator_id) return;
    const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
      "block_user",
      { p_blocked_id: alert.creator_id }
    );
    if (error) {
      toast.error(error.message || "Unable to block user right now");
      return;
    }
    setConfirmBlock(false);
    setShowMenu(false);
    onHide(alert.id);
    onRefresh();
    onClose();
    toast.success("You won't see posts from this user");
  };

  const handleHideAlert = () => {
    if (!alert) return;
    setShowMenu(false);
    onHide(alert.id);
    onClose();
  };

  // Creator: Remove alert
  const handleRemoveAlert = async () => {
    if (!alert || !user) return;
    const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
      "delete_broadcast_alert",
      {
        p_alert_id: alert.id,
      }
    );
    if (error) {
      toast.error(error.message || "Failed to remove alert");
      return;
    }

    setShowConfirmRemove(false);
    onHide(alert.id);
    onRefresh();
    onClose();
    toast.success("Broadcast removed");
  };

  // Creator: Save edit
  const handleSaveEdit = async () => {
    if (!user || !alert) return;
    const nextTitle = editTitle.trim();
    const nextDesc = editDesc.trim();

    if (!nextTitle) {
      toast.error("Title is required");
      return;
    }
    if (nextTitle.length > MAX_TITLE_CHARS || nextDesc.length > MAX_DESC_CHARS) {
      toast.error("Please shorten the alert details");
      return;
    }

    const existingUrls = editMedia.filter((item) => !item.file).map((item) => item.url);
    const newUploads = await Promise.all(
      editMedia.filter((item) => item.file).map(async (item, index) => {
        const file = item.file as File;
        const fileExt = file.name.split(".").pop() || "jpg";
        const fileName = `${user.id}/${Date.now()}-edit-${index}.${fileExt}`;
        const upload = await supabase.storage.from("alerts").upload(fileName, file);
        if (upload.error) throw upload.error;
        return supabase.storage.from("alerts").getPublicUrl(fileName).data.publicUrl;
      })
    );
    const nextImages = [...existingUrls, ...newUploads].filter(Boolean);

    const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>)(
      "update_broadcast_alert",
      {
        p_alert_id: alert.id,
        p_patch: {
          title: nextTitle,
          description: nextDesc,
          photo_url: nextImages[0] || null,
          images: nextImages,
        },
      }
    );
    if (error) {
      toast.error(error.message || "Failed to update alert");
      return;
    }
    if (!data) {
      toast.error("Failed to update alert");
      return;
    }

    await Promise.resolve(onRefresh());
    setIsEditing(false);
    toast.success("Broadcast updated");
  };

  const isCreator = user && alert?.creator_id === user.id;
  const canRemove = Boolean(isCreator);
  const isSocial = Boolean(alert?.post_on_social || alert?.social_post_id || alert?.thread_id);
  const socialThreadId = alert?.thread_id || (alert?.social_post_id ? String(alert.social_post_id) : null);

  const openShareSheet = useCallback(async () => {
    if (!alert?.id) return;

    let displayName = alert?.creator?.display_name || null;
    let socialId = alert?.creator?.social_id || null;
    const creatorId = String(alert?.creator_id || "").trim();

    if (creatorId && (!displayName || !socialId)) {
      try {
        const { data: creatorProfile } = await (supabase
          .from("profiles")
          .select("display_name,social_id")
          .eq("id", creatorId)
          .maybeSingle() as Promise<{ data: { display_name?: string | null; social_id?: string | null } | null; error: { message?: string } | null }>);
        displayName = creatorProfile?.display_name || displayName;
        socialId = creatorProfile?.social_id || socialId;
      } catch {
        // Non-blocking: continue with next fallback.
      }
    }

    if (socialThreadId && (!displayName || !socialId)) {
      try {
        const { data: threadRow } = await (supabase
          .from("threads")
          .select("user_id")
          .eq("id", socialThreadId)
          .maybeSingle() as Promise<{ data: { user_id?: string | null } | null; error: { message?: string } | null }>);
        const authorId = String(threadRow?.user_id || "").trim();
        if (authorId) {
          const { data: profileRow } = await (supabase
            .from("profiles")
            .select("display_name,social_id")
            .eq("id", authorId)
            .maybeSingle() as Promise<{ data: { display_name?: string | null; social_id?: string | null } | null; error: { message?: string } | null }>);
          displayName = profileRow?.display_name || displayName;
          socialId = profileRow?.social_id || socialId;
        }
      } catch {
        // Keep share UX non-blocking if enrichment query fails.
      }
    }

    const firstAlertImage = (
      Array.isArray(alert.media_urls)
        ? alert.media_urls.find((entry) => typeof entry === "string" && entry.trim().length > 0)
        : null
    ) || (alert.photo_url ? String(alert.photo_url).trim() : null);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    setSharePayload(
      buildShareModel({
        origin,
        contentType: "alert",
        contentId: alert.id,
        surface: "Map",
        appContentId: alert.id,
        displayName,
        socialId,
        contentSnippet: alert?.description || alert?.title || null,
        imagePath: firstAlertImage,
      }),
    );
    setShareOpen(true);
  }, [
    alert?.creator?.display_name,
    alert?.creator?.social_id,
    alert?.creator_id,
    alert?.description,
    alert?.id,
    alert?.media_urls,
    alert?.photo_url,
    alert?.title,
    socialThreadId,
  ]);

  const handleShareAction = useCallback(async () => {
    if (!socialThreadId) return;

    try {
      await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "record_thread_share_click",
        { p_thread_id: socialThreadId },
      );
    } catch {
      // Keep current non-blocking behavior if share count RPC is unavailable.
    }
  }, [socialThreadId]);

  const removeEditMediaAt = (index: number) => {
    setEditMedia((prev) => {
      const target = prev[index];
      if (target?.file) URL.revokeObjectURL(target.url);
      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const handleEditMediaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const availableSlots = Math.max(0, MAX_BROADCAST_MEDIA - editMedia.length);
    if (availableSlots <= 0) {
      toast.error(`You can upload up to ${MAX_BROADCAST_MEDIA} photos.`);
      event.target.value = "";
      return;
    }
    const acceptedFiles = files.filter((file) => file.type.startsWith("image/")).slice(0, availableSlots);
    if (acceptedFiles.length < files.length) {
      toast.info(`Only the first ${MAX_BROADCAST_MEDIA} photos are kept.`);
    }
    setEditMedia((prev) => [
      ...prev,
      ...acceptedFiles.map((file, index) => ({
        id: `new-${Date.now()}-${index}`,
        url: URL.createObjectURL(file),
        file,
      })),
    ]);
    event.target.value = "";
  };

  useEffect(() => {
    if (!isEditing || !alert) return;
    const source = alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : [];
    setEditMedia(source.map((url, index) => ({ id: `existing-${index}`, url })));
  }, [alert, isEditing]);

  useEffect(() => {
    return () => {
      editMedia.forEach((item) => {
        if (item.file) URL.revokeObjectURL(item.url);
      });
    };
  }, [editMedia]);

  return (
    <>
    <AnimatePresence>
      {alert && !isEditing && !showConfirmRemove && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5000] bg-black/50 flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[var(--app-max-width,430px)] bg-card rounded-t-3xl max-h-[calc(100svh-env(safe-area-inset-bottom,0px)-8px)] overflow-hidden flex min-h-0 flex-col"
          >
            {/* Content area */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-4 overscroll-contain">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-white text-sm font-medium"
                    style={{ backgroundColor: ALERT_TYPE_COLORS[alert.alert_type] || "#A1A4A9" }}
                  >
                    {alert.alert_type} · {timeAgo(alert.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {canRemove && (
                    <>
                      {isCreator && (
                        <NeuButton
                          variant="secondary"
                          onClick={() => {
                            setIsEditing(true);
                            setEditTitle(alert.title || "");
                            setEditDesc(alert.description || "");
                            setEditMedia((alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : []).map((url, index) => ({
                              id: `existing-${index}`,
                              url,
                            })));
                          }}
                          className="h-9 w-9 rounded-full p-0"
                          aria-label="Edit alert"
                          title="Edit alert"
                        >
                          <Pencil className="w-4 h-4" />
                        </NeuButton>
                      )}
                      <NeuButton
                        variant="secondary"
                        onClick={() => setShowConfirmRemove(true)}
                        className="h-9 w-9 rounded-full p-0 text-red-500 border-red-200 hover:bg-red-50"
                        aria-label="Remove alert"
                        title="Remove alert"
                      >
                        <Trash2 className="w-4 h-4" />
                      </NeuButton>
                    </>
                  )}
                  <button onClick={onClose}>
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Title */}
              {alert.title && (
                <h3 className="text-lg font-bold text-brandText mb-2">{alert.title}</h3>
              )}

              {/* Description */}
              {alert.description && (
                <p className="text-foreground mb-4">{alert.description}</p>
              )}

              {/* Photo */}
              {(alert.media_urls?.length || alert.photo_url) ? (
                <div className="mb-4 w-full">
                  <PostMediaCarousel
                    isSensitive={alert.is_sensitive === true}
                    items={(alert.media_urls?.length ? alert.media_urls : alert.photo_url ? [alert.photo_url] : []).map((src, index) => ({
                      src,
                      alt: `${alert.title || "Alert photo"} ${index + 1}`,
                    }))}
                  />
                </div>
              ) : null}

              {/* Creator info */}
              <button
                type="button"
                className="mb-4 flex items-center gap-2"
                onClick={() => {
                  const creatorId = alert.creator_id || null;
                  if (!creatorId || !onOpenProfile) return;
                  onOpenProfile(creatorId, alert.creator?.display_name || "User");
                }}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {alert.creator?.avatar_url ? (
                    <img src={alert.creator.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold">
                      {alert.creator?.display_name?.charAt(0) || "?"}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium underline-offset-2 hover:underline">{alert.creator?.display_name || "Anonymous"}</span>
              </button>

            </div>

            {/* Footer row (See on Social left, support + 3-dot menu right) */}
            <div className="sticky bottom-0 border-t border-border bg-card px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] flex items-center justify-end">
              {(!alert.is_demo || DEMO_SEEDED) && isSocial ? (
                <button
                  type="button"
                  onClick={() => {
                    if (socialThreadId) {
                      navigate(`/social?focus=${encodeURIComponent(socialThreadId)}`);
                      return;
                    }
                    if (alert.social_url?.startsWith("/")) {
                      const [, rawQuery = ""] = alert.social_url.split("?");
                      const params = new URLSearchParams(rawQuery);
                      const focus = params.get("focus") || params.get("thread");
                      if (alert.social_url.startsWith("/threads")) {
                        navigate(focus ? `/social?focus=${encodeURIComponent(focus)}` : "/social");
                        return;
                      }
                      navigate(alert.social_url);
                      return;
                    }
                    toast.info("That post is no longer available.");
                  }}
                  className="mr-auto text-sm font-medium text-[#2145CF] underline underline-offset-2"
                >
                  See on Social
                </button>
              ) : (
                <div className="mr-auto" />
              )}

              <div className="flex items-center gap-1">
                {/* Heart / Support */}
                <button
                  onClick={handleSupport}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-2 transition-all",
                    liked ? "bg-red-50" : "hover:bg-muted"
                  )}
                  title="Support"
                >
                  <Heart
                    className={cn(
                      "w-5 h-5 transition-colors",
                      liked ? "text-red-500 fill-red-500" : "text-muted-foreground"
                    )}
                  />
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">{supportCount}</span>
                </button>

                {/* Share (between support and action) */}
                <button
                  type="button"
                  onClick={openShareSheet}
                  className="inline-flex items-center gap-0.5 rounded-full px-2 py-2 transition-all hover:bg-muted"
                  title="Share"
                >
                  <Send className="w-4 h-4 text-muted-foreground" />
                </button>

                {/* 3-dots menu (Report / Hide / Block) */}
                <div className="relative">
                <button
                  onClick={() => { setShowMenu(!showMenu); setConfirmBlock(false); }}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  title="More"
                >
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                </button>

                  <AnimatePresence>
                    {showMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute right-0 bottom-12 bg-card border border-border rounded-xl shadow-elevated py-1 w-44 z-50"
                      >
                        <button
                          onClick={() => {
                            void handleReportModalOpen();
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Flag className="w-4 h-4 text-muted-foreground" />
                          <span>Report</span>
                        </button>
                        <button
                          onClick={handleHideAlert}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                          <span>Hide alert</span>
                        </button>
                        <button
                          onClick={() => { setConfirmBlock(true); setShowMenu(false); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Ban className="w-4 h-4 text-muted-foreground" />
                          <span>Block User</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}

      {/* Edit modal */}
      {alert && isEditing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[3000] bg-black/50 flex items-end"
          onClick={() => setIsEditing(false)}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[var(--app-max-width,430px)] bg-card rounded-t-3xl p-6 max-h-[calc(100svh-var(--nav-height,64px)-env(safe-area-inset-bottom,0px)-8px)] overflow-y-auto"
            style={{ marginBottom: "calc(var(--nav-height,64px) + env(safe-area-inset-bottom,0px))" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-brandText">Edit Alert</h3>
              <button onClick={() => setIsEditing(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="form-field-rest relative flex items-center">
                <Input
                  value={editTitle}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_TITLE_CHARS) setEditTitle(e.target.value);
                  }}
                  placeholder="Describe the situation"
                  className="field-input-core h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none focus-visible:ring-0"
                />
              </div>
              <div className="form-field-rest relative h-auto min-h-[112px] py-3">
                <Textarea
                  value={editDesc}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_DESC_CHARS) setEditDesc(e.target.value);
                  }}
                  className="field-input-core min-h-[88px] resize-none rounded-none border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none focus-visible:ring-0"
                  placeholder="Details help everyone stay connected"
                />
              </div>
              {editMedia.length > 0 ? (
                <div className="mt-4 mb-3 flex items-start">
                  <div className="flex flex-wrap items-start gap-3">
                    {editMedia.map((item, index) => (
                      <div key={item.id} className="relative h-[150px] w-[150px] shrink-0 overflow-hidden rounded-[24px]">
                        <MediaThumb src={item.url} alt={`Broadcast preview ${index + 1}`} className="h-full w-full rounded-[24px]" />
                        <button
                          onClick={() => removeEditMediaAt(index)}
                          className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/45"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <label className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-muted/60 hover:bg-muted">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleEditMediaChange}
                  />
                </label>
              </div>
              <NeuButton
                onClick={handleSaveEdit}
                className="w-full h-12 rounded-xl bg-brandBlue hover:bg-brandBlue/90"
              >
                Save Changes
              </NeuButton>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Remove confirmation dialog */}
      {alert && showConfirmRemove && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center px-6"
          onClick={() => setShowConfirmRemove(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-elevated"
          >
            <h3 className="text-lg font-bold text-brandText mb-2">Remove Alert?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              This will archive this alert from the map.
            </p>
            <div className="flex gap-3">
              <NeuButton
                variant="secondary"
                onClick={() => setShowConfirmRemove(false)}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </NeuButton>
              <NeuButton
                onClick={handleRemoveAlert}
                className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white"
              >
                Remove
              </NeuButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <ReportModal
      open={reportOpen}
      onClose={() => setReportOpen(false)}
      targetUserId={alert?.creator_id ?? null}
      targetName={alert?.creator?.display_name || "User"}
      source="Map"
      onSubmitSuccess={handleReportSubmitSuccess}
    />

    {sharePayload && (
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        share={sharePayload}
        onShareAction={() => void handleShareAction()}
      />
    )}

    <AlertDialog open={confirmBlock} onOpenChange={(v) => !v && setConfirmBlock(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Block {alert?.creator?.display_name ?? "this user"}?</AlertDialogTitle>
          <AlertDialogDescription>
            You will no longer see their posts or alerts, and they won't be able to interact with you.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmBlock(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBlockUser}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Block
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default PinDetailModal;
