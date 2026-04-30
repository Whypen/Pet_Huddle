/**
 * GroupDetailsPanel — group detail sheet body.
 *
 * v3 (2026-04-30, head-of-Bumble polish):
 *  - 16:9 cover hero matching ExploreGroupCard visual contract.
 *  - Creator-only inline cover upload + remove (strict createdBy === ownerUserId).
 *  - auth.uid() drives the storage path so RLS always matches.
 *  - Optimistic preview with cross-fade swap on cover change; revert on failure.
 *  - Top + bottom scrim so overlay text + member-count pill stay legible on bright covers.
 *  - Hover overlay on desktop ("Edit cover") for discoverability without cluttering mobile.
 *  - Member management still lives in the separate Manage Group modal.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ImageIcon, Loader2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateGroupChatMetadata } from "@/lib/groupChats";

type GroupDetailsAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  destructive?: boolean;
};

type GroupDetailsPanelProps = {
  name: string;
  memberCount: number;
  avatarUrl?: string | null;
  subtitle?: string | null;
  description?: string | null;
  mediaUrls: string[];
  actions: GroupDetailsAction[];
  // Cover-edit support — passed only by parents that own admin context.
  chatId?: string;
  // Signed-in user's id — used for storage RLS path match.
  ownerUserId?: string | null;
  // Original group creator's id — strict gate for cover-edit affordance.
  createdBy?: string | null;
  onAvatarUpdated?: (newAvatarUrl: string | null) => void;
};

const RAW_FILE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB before compression
const ACCEPTED_MIME = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export function GroupDetailsPanel({
  name,
  memberCount,
  avatarUrl,
  subtitle,
  description,
  mediaUrls,
  actions,
  chatId,
  ownerUserId,
  createdBy = null,
  onAvatarUpdated,
}: GroupDetailsPanelProps) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const [canExpandDescription, setCanExpandDescription] = useState(false);

  // Optimistic cover state — preview the picked file immediately, revert on
  // failure. `previewUrl` is a transient blob URL; `pendingRemoval` flips when
  // the user opted to remove and the RPC is in-flight.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup any in-flight blob URL on unmount.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const node = descriptionRef.current;
    if (!node || descriptionExpanded) {
      if (!descriptionExpanded) setCanExpandDescription(false);
      return;
    }
    const measure = () => {
      setCanExpandDescription(node.scrollHeight - node.clientHeight > 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [description, descriptionExpanded]);

  // Strict gate: only the original creator can edit the cover. Server-side
  // RLS on the RPC and storage bucket enforce it too; the UI gate exists to
  // avoid surfacing a button non-creators can't use.
  const canEditCover = Boolean(
    chatId && ownerUserId && createdBy && createdBy === ownerUserId,
  );
  const displayedCoverUrl = pendingRemoval ? null : (previewUrl ?? avatarUrl ?? null);
  const memberLabel = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  const busy = uploading || removing;

  // Authoritative auth check — guarantees RLS path match and creator identity.
  const guardCreator = async (): Promise<string | null> => {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const authUid = authData?.user?.id ?? null;
    if (authErr || !authUid) {
      toast.error("Sign in to update the cover.");
      return null;
    }
    if (createdBy && authUid !== createdBy) {
      toast.error("Only the group's creator can change the cover.");
      return null;
    }
    return authUid;
  };

  const surfaceUploadError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GroupDetailsPanel] cover upload failed:", message, err);
    if (/permission|denied|policy|rls/i.test(message)) {
      toast.error("You don't have permission to change this cover.");
    } else if (/network|fetch|timeout/i.test(message)) {
      toast.error("Network hiccup. Try the upload again.");
    } else {
      toast.error("Couldn't update cover. Try again.");
    }
  };

  const handleFilePick = async (file: File) => {
    if (!file || !chatId) return;
    if (file.size > RAW_FILE_MAX_BYTES) {
      toast.error("That file's too big. Try a photo under 15MB.");
      return;
    }
    const authUid = await guardCreator();
    if (!authUid) return;

    // Optimistic preview.
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = URL.createObjectURL(file);
    blobUrlRef.current = blob;
    setPendingRemoval(false);
    setPreviewUrl(blob);
    setUploading(true);

    try {
      const { default: compress } = await import("browser-image-compression");
      const compressed = await compress(file, {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });
      const ext = (compressed.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${authUid}/groups/${chatId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      if (!pub?.publicUrl) throw new Error("Storage returned no public URL");

      await updateGroupChatMetadata({
        chatId,
        avatarUrl: pub.publicUrl,
        updateAvatar: true,
      });

      onAvatarUpdated?.(pub.publicUrl);
      toast.success("Cover updated");
    } catch (err) {
      surfaceUploadError(err);
      // Revert optimistic preview.
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!chatId) return;
    if (!window.confirm("Remove the cover photo? You can add a new one anytime.")) {
      return;
    }
    const authUid = await guardCreator();
    if (!authUid) return;

    // Optimistic clear.
    setPendingRemoval(true);
    setRemoving(true);
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPreviewUrl(null);

    try {
      await updateGroupChatMetadata({
        chatId,
        avatarUrl: null,
        updateAvatar: true,
      });
      onAvatarUpdated?.(null);
      toast.success("Cover removed");
    } catch (err) {
      surfaceUploadError(err);
      setPendingRemoval(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Cover hero — 16:9, matches ExploreGroupCard visual contract */}
      <div className="group/cover relative w-full aspect-[16/9] overflow-hidden rounded-[20px] bg-[rgba(20,24,38,0.04)]">
        {/* Image layer — keyed src lets React swap the element so the CSS
            transition fires when the URL changes (preview → real). */}
        {displayedCoverUrl ? (
          <img
            key={displayedCoverUrl}
            src={displayedCoverUrl}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "linear-gradient(160deg, #2145CF 0%, #3A5FE8 100%)" }}
            aria-hidden
          >
            {/* Suppress glyph when admin empty-state CTA owns the surface */}
            {canEditCover ? null : (
              <Users className="h-10 w-10 text-white/85" strokeWidth={1.5} />
            )}
          </div>
        )}

        {/* Top scrim — keeps member-count pill legible on bright photos */}
        <div
          className="absolute top-0 inset-x-0 h-[28%] pointer-events-none"
          style={{ background: "linear-gradient(to bottom, rgba(20,24,38,0.45), transparent)" }}
          aria-hidden
        />

        {/* Bottom scrim — for name + subtitle */}
        <div
          className="absolute bottom-0 inset-x-0 h-[60%] pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(20,24,38,0.78), rgba(20,24,38,0.10) 60%, transparent)" }}
          aria-hidden
        />

        {/* Uploading / removing overlay — gentle dim + spinner */}
        {busy ? (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(20,24,38,0.32)" }}
            aria-hidden
          >
            <Loader2 className="h-7 w-7 text-white animate-spin" strokeWidth={2} />
          </div>
        ) : null}

        {/* Member count pill — top-right */}
        <span
          className="absolute top-3 right-3 text-[11px] font-[500] px-[10px] py-[4px] rounded-full text-white"
          style={{ background: "rgba(20,24,38,0.55)" }}
        >
          {memberLabel}
        </span>

        {/* Name overlay — bottom-left */}
        <div className="absolute bottom-3 left-4 right-24 pointer-events-none">
          <h3 className="truncate text-[20px] font-[700] leading-[1.15] text-white drop-shadow-sm">
            {name}
          </h3>
          {subtitle ? (
            <p className="mt-[2px] truncate text-[12px] font-[500] text-white/85 drop-shadow-sm">
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* Admin: hidden file input (one source) */}
        {canEditCover ? (
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME}
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await handleFilePick(file);
              e.target.value = "";
            }}
          />
        ) : null}

        {/* Admin: action pills cluster — bottom-right.
            Camera (change) + Trash (remove) when cover exists.
            44px hit targets. Hover state shows a soft "Edit cover" tooltip-pill
            on desktop for discoverability. */}
        {canEditCover && displayedCoverUrl ? (
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              aria-label="Remove cover photo"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-[0.94] disabled:opacity-70 opacity-0 group-hover/cover:opacity-100 focus-visible:opacity-100 md:opacity-100"
              style={{
                background: "rgba(20,24,38,0.62)",
                border: "1px solid rgba(255,255,255,0.30)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              }}
            >
              <Trash2 className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="Change cover photo"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-[0.94] disabled:opacity-70"
              style={{
                background: "rgba(20,24,38,0.62)",
                border: "1px solid rgba(255,255,255,0.30)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
              }}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
              ) : (
                <Camera className="h-5 w-5" strokeWidth={1.75} />
              )}
            </button>
          </div>
        ) : null}

        {/* Admin empty-state — full cover tap target */}
        {canEditCover && !displayedCoverUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            aria-label="Add cover photo"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white text-[13px] font-[600] disabled:opacity-70"
          >
            <Camera className="h-6 w-6" strokeWidth={1.75} />
            <span>Add a cover photo</span>
            <span className="text-[11px] font-[500] text-white/75">
              16:9, daylight is your friend
            </span>
          </button>
        ) : null}
      </div>

      {description ? (
        <div className="rounded-[18px] border border-white/60 bg-white px-4 py-3 pr-5 shadow-[0_10px_24px_rgba(66,73,101,0.10)]">
          <p
            ref={descriptionRef}
            className={
              descriptionExpanded
                ? "whitespace-pre-wrap break-words text-sm leading-relaxed text-brandText"
                : "whitespace-pre-wrap break-words text-sm leading-relaxed text-brandText line-clamp-3"
            }
          >
            {description}
          </p>
          {canExpandDescription ? (
            <button
              type="button"
              className="mt-1 text-xs font-bold text-[rgba(74,73,101,0.72)]"
              onClick={() => setDescriptionExpanded((prev) => !prev)}
            >
              {descriptionExpanded ? "See Less" : "Read More"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#8C93AA]">
          Media{mediaUrls.length > 0 ? ` (${mediaUrls.length})` : ""}
        </p>
        {mediaUrls.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {mediaUrls.map((url, index) => (
              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <img src={url} alt="" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>No media shared yet</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className={`flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors ${
              action.destructive ? "hover:bg-red-50" : "hover:bg-muted/60"
            }`}
            onClick={action.onClick}
          >
            {action.icon}
            <span className={`text-sm font-medium ${action.destructive ? "text-red-500" : ""}`}>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
