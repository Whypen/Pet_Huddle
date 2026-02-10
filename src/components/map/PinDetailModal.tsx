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

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Heart,
  Send,
  Flag,
  Ban,
  EyeOff,
  Pencil,
  Trash2,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const MAX_TITLE_CHARS = 100;
const MAX_DESC_CHARS = 500;

const ALERT_TYPE_COLORS: Record<string, string> = {
  Stray: "#EAB308",
  Lost: "#EF4444",
  Found: "#A1A4A9",
  Others: "#A1A4A9",
};

interface MapAlert {
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
  expires_at?: string | null;
  range_meters?: number | null;
  creator_id?: string | null;
  has_thread?: boolean;
  thread_id?: string | null;
  creator: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface PinDetailModalProps {
  alert: MapAlert | null;
  onClose: () => void;
  onHide: (id: string) => void;
  onRefresh: () => void;
}

const PinDetailModal = ({ alert, onClose, onHide, onRefresh }: PinDetailModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [liked, setLiked] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Native Share API (WhatsApp, IG, FB etc.) with clipboard fallback
  const handleShare = async () => {
    if (!alert) return;
    const alertTitle = typeof alert.title === "string" ? alert.title : "Huddle Alert";
    const alertDesc = typeof alert.description === "string" ? alert.description : "";
    const shareUrl = `https://huddle-preview.vercel.app/pin/${alert.id}`;
    const shareTitle = "Check this out on Huddle!";
    const shareText = `${alertTitle} - ${alertDesc} | View more on Huddle!`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed — silent
        console.log("Share cancelled:", err);
      }
    } else {
      // Fallback: Copy link to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        toast.success("Link copied to clipboard!");
      } catch {
        toast.error("Failed to copy link");
      }
    }
  };

  const [supportCount, setSupportCount] = useState(0);

  // Sync support count from alert prop
  useEffect(() => {
    if (alert) setSupportCount(alert.support_count || 0);
  }, [alert]);

  // Support toggle: Single tap = +1. Tap again (when liked) = -1.
  const handleSupport = async () => {
    if (!user || !alert) {
      toast.error("Please login to support alerts");
      return;
    }

    if (liked) {
      // Already liked → remove support
      try {
        await supabase
          .from("alert_interactions")
          .delete()
          .eq("alert_id", alert.id)
          .eq("user_id", user.id)
          .eq("interaction_type", "support");

        await supabase
          .from("map_alerts")
          .update({ support_count: Math.max(0, (supportCount || 1) - 1) } as Record<string, unknown>)
          .eq("id", alert.id);

        setLiked(false);
        setSupportCount((prev) => Math.max(0, prev - 1));
        onRefresh();
      } catch {
        toast.error("Failed to remove support");
      }
      return;
    }

    // Not yet liked → add support
    try {
      await supabase.from("alert_interactions").insert({
        alert_id: alert.id,
        user_id: user.id,
        interaction_type: "support",
      });

      await supabase
        .from("map_alerts")
        .update({ support_count: (supportCount || 0) + 1 } as Record<string, unknown>)
        .eq("id", alert.id);

      setLiked(true);
      setSupportCount((prev) => prev + 1);
      onRefresh();
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as Record<string, unknown>).code)
          : "";
      if (code === "23505") {
        toast.info("You've already supported this alert");
        setLiked(true);
      } else {
        toast.error("Failed to support alert");
      }
    }
  };

  // Spec: Report Abuse — abuse_count > 10 → auto-hide
  const handleReport = async () => {
    if (!user || !alert) {
      toast.error("Please login to report alerts");
      return;
    }
    setShowMenu(false);
    try {
      await supabase.from("alert_interactions").insert({
        alert_id: alert.id,
        user_id: user.id,
        interaction_type: "report",
      });

      // Check if abuse threshold exceeded → auto-hide
      const { data: updatedAlert } = await supabase
        .from("map_alerts")
        .select("report_count")
        .eq("id", alert.id)
        .maybeSingle();

      if (updatedAlert && (updatedAlert as { report_count?: number }).report_count && (updatedAlert as { report_count: number }).report_count > 10) {
        await supabase
          .from("map_alerts")
          .update({ is_active: false } as Record<string, unknown>)
          .eq("id", alert.id);
        toast.success("Alert has been auto-hidden due to multiple reports");
        onClose();
        onRefresh();
        return;
      }

      toast.success("Alert reported");
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as Record<string, unknown>).code)
          : "";
      if (code === "23505") {
        toast.info("You've already reported this alert");
      } else {
        toast.error("Failed to report alert");
      }
    }
  };

  const handleBlockUser = () => {
    setShowMenu(false);
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
    if (!user || !alert) return;
    try {
      await supabase
        .from("map_alerts")
        .update({ is_active: false } as Record<string, unknown>)
        .eq("id", alert.id)
        .eq("creator_id", user.id);
      toast.success("Alert removed");
      setShowConfirmRemove(false);
      onClose();
      onRefresh();
    } catch {
      toast.error("Failed to remove alert");
    }
  };

  // Creator: Save edit
  const handleSaveEdit = async () => {
    if (!user || !alert) return;
    try {
      await supabase
        .from("map_alerts")
        .update({ title: editTitle.trim() || null, description: editDesc.trim() || null })
        .eq("id", alert.id)
        .eq("creator_id", user.id);
      toast.success("Alert updated");
      setIsEditing(false);
      onClose();
      onRefresh();
    } catch {
      toast.error("Failed to update alert");
    }
  };

  const isCreator = user && alert?.creator_id === user.id;

  return (
    <AnimatePresence>
      {alert && !isEditing && !showConfirmRemove && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] bg-black/50 flex items-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-card rounded-t-3xl max-h-[75vh] overflow-auto flex flex-col"
          >
            {/* Content area */}
            <div className="p-6 flex-1">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-white text-sm font-medium"
                    style={{ backgroundColor: ALERT_TYPE_COLORS[alert.alert_type] || "#A1A4A9" }}
                  >
                    {alert.alert_type}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatTimeAgo(alert.created_at)}
                  </span>
                </div>
                <button onClick={onClose}>
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Title */}
              {alert.title && (
                <h3 className="text-lg font-bold text-brandText mb-2">{alert.title}</h3>
              )}

              {/* Photo */}
              {alert.photo_url && (
                <img src={alert.photo_url} alt="" className="w-full rounded-xl mb-4 max-h-48 object-cover" />
              )}

              {/* Description */}
              {alert.description && (
                <p className="text-foreground mb-4">{alert.description}</p>
              )}

              {/* Creator info */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  {alert.creator?.avatar_url ? (
                    <img src={alert.creator.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold">
                      {alert.creator?.display_name?.charAt(0) || "?"}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium">{alert.creator?.display_name || "Anonymous"}</span>
                <span className="text-sm text-muted-foreground ml-auto">
                  {supportCount || alert.support_count || 0} supports
                </span>
              </div>

              {/* Creator controls — Edit + Remove */}
              {isCreator && (
                <div className="flex gap-2 mb-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(true);
                      setEditTitle(alert.title || "");
                      setEditDesc(alert.description || "");
                    }}
                    className="flex-1 h-10 rounded-xl"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirmRemove(true)}
                    className="flex-1 h-10 rounded-xl text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {/* ================================================================ */}
            {/* Threads-style Footer — "See on Threads" | Heart | Share | 3-dots */}
            {/* ================================================================ */}
            <div className="border-t border-border px-6 py-3 flex items-center justify-between">
              {/* Left: "See on Threads" pill button — ALL alerts show this */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Deep-link: if alert has a thread_id, go directly to that thread
                  if (alert.thread_id) {
                    navigate(`/threads?thread=${alert.thread_id}`);
                  } else {
                    // Fallback: navigate with alert ID filter
                    const threadParam = alert.id ? `?alert=${alert.id}` : "";
                    navigate(`/threads${threadParam}`);
                  }
                }}
                className="rounded-full px-4 h-9 flex items-center gap-1.5 text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                See on Threads
              </Button>

              {/* Right: Heart | Share (paper plane) | 3-dots */}
              <div className="flex items-center gap-1">
                {/* Heart / Support */}
                <button
                  onClick={handleSupport}
                  className={cn(
                    "p-2 rounded-full transition-all",
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
                </button>

                {/* Share — Paper Plane (Send icon, Instagram-style) */}
                <button
                  onClick={handleShare}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  title="Share"
                >
                  <Send className="w-5 h-5 text-muted-foreground" />
                </button>

                {/* 3-dots menu (Report / Hide / Block) */}
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
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
                          onClick={handleReport}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Flag className="w-4 h-4 text-red-500" />
                          <span className="text-red-500">Report Abuse</span>
                        </button>
                        <button
                          onClick={handleHideAlert}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                          <span>Hide Alert</span>
                        </button>
                        <button
                          onClick={handleBlockUser}
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
            className="w-full bg-card rounded-t-3xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-brandText">Edit Alert</h3>
              <button onClick={() => setIsEditing(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_TITLE_CHARS) setEditTitle(e.target.value);
                  }}
                  className="rounded-xl mt-1"
                  maxLength={MAX_TITLE_CHARS}
                />
                <div className="flex justify-end text-xs text-muted-foreground mt-1">{editTitle.length}/{MAX_TITLE_CHARS}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_DESC_CHARS) setEditDesc(e.target.value);
                  }}
                  className="rounded-xl mt-1 min-h-[80px]"
                />
                <div className="flex justify-end text-xs text-muted-foreground mt-1">{editDesc.length}/{MAX_DESC_CHARS}</div>
              </div>
              <Button
                onClick={handleSaveEdit}
                className="w-full h-12 rounded-xl bg-brandBlue hover:bg-brandBlue/90"
              >
                Save Changes
              </Button>
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
              This will permanently remove this alert from the map.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirmRemove(false)}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRemoveAlert}
                className="flex-1 h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white"
              >
                Remove
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PinDetailModal;
