import { useEffect, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  resolveProfilePhotoDisplayUrl,
  uploadProfilePhotoBlob,
  validateProfilePhotoFile,
} from "@/lib/profilePhotos";
import type { ProfilePhotoSlot as ProfilePhotoSlotName, SoloAspect } from "@/types/profilePhotos";
import { slotBriefs } from "./copy/slotBriefs";
import { ProfilePhotoCropper } from "./ProfilePhotoCropper";
import { ProfilePhotoSlotSheet } from "./ProfilePhotoSlotSheet";

type ProfilePhotoSlotProps = {
  slot: ProfilePhotoSlotName;
  value: string | null;
  userId: string | null;
  soloAspect: SoloAspect | null;
  captionValue?: string | null;
  onCaptionChange?: (value: string | null) => void;
  onCaptionCommit?: () => void;
  onUploaded: (slot: ProfilePhotoSlotName, path: string, soloAspect: SoloAspect | null, previousPath: string | null) => void;
  onRemoved: (slot: ProfilePhotoSlotName, previousPath: string | null) => void;
};

export function ProfilePhotoSlot({
  slot,
  value,
  userId,
  soloAspect,
  captionValue,
  onCaptionChange,
  onCaptionCommit,
  onUploaded,
  onRemoved,
}: ProfilePhotoSlotProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(captionValue ?? "");
  const brief = slotBriefs[slot];
  const hasPhoto = Boolean(value);
  const allowCaption = hasPhoto && slot !== "cover";

  useEffect(() => {
    let cancelled = false;
    setDisplayUrl(null);
    void resolveProfilePhotoDisplayUrl(value).then((url) => {
      if (!cancelled) setDisplayUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    setCaptionDraft(captionValue ?? "");
  }, [captionValue]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const validation = validateProfilePhotoFile(file);
    if (validation) {
      toast.error(validation);
      return;
    }
    setActionOpen(false);
    setCropFile(file);
  };

  const handleCropSave = async (blob: Blob, nextSoloAspect: SoloAspect | null) => {
    if (!userId) {
      toast.error("Please sign in to upload photos.");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadProfilePhotoBlob(userId, slot, blob);
      onUploaded(slot, path, nextSoloAspect, value);
      toast.success(`Photo uploaded to ${brief.label}`);
      setCropFile(null);
    } catch {
      toast.error("Couldn't save that photo. Try again in a moment.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="snap-center shrink-0" style={{ width: "clamp(248px, 80%, 332px)", minWidth: "clamp(248px, 80%, 332px)", touchAction: "pan-x pan-y" }}>
      <div
        className={cn(
          "relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl shadow-card",
          hasPhoto
            ? "bg-[var(--bg-muted)]"
            : "cursor-pointer border border-border/70 bg-[linear-gradient(180deg,rgba(248,248,255,0.96),rgba(255,255,255,0.98))] text-center",
        )}
        style={{ touchAction: "pan-x pan-y" }}
      >
        {hasPhoto ? (
          <>
            {displayUrl ? (
              <img src={displayUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-[rgba(66,73,101,0.08)]" />
            )}
            <button
              type="button"
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/86 text-[var(--fg-1)] shadow-sm backdrop-blur-sm"
              onClick={(event) => {
                event.stopPropagation();
                setActionOpen(true);
              }}
              aria-label={`${brief.label}, photo options`}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {allowCaption ? (
              <span
                className="absolute inset-x-3 bottom-3 rounded-[var(--radius-field,14px)] bg-[rgba(33,69,207,0.60)] px-3 py-2 text-left backdrop-blur-md"
                onClick={(event) => event.stopPropagation()}
              >
                <textarea
                  value={captionDraft}
                  placeholder={brief.label}
                  onChange={(event) => {
                    setCaptionDraft(event.target.value);
                    onCaptionChange?.(event.target.value);
                  }}
                  onBlur={() => {
                    onCaptionChange?.(captionDraft.trim() || null);
                    onCaptionCommit?.();
                  }}
                  className="block max-h-[48px] min-h-[44px] w-full resize-none overflow-hidden bg-transparent text-sm font-semibold leading-snug text-white placeholder:text-white/72 outline-none focus:outline-none focus:ring-0"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  rows={2}
                  aria-label={`${brief.label} note`}
                />
              </span>
            ) : null}
            {uploading ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-semibold text-white">
                Uploading
              </span>
            ) : null}
          </>
        ) : (
          <label
            className="absolute inset-0 flex h-full w-full cursor-pointer flex-col items-center justify-center px-5"
          >
            <span className="neu-icon mb-3 flex h-14 w-14 items-center justify-center">
              <Plus className="h-6 w-6 text-[var(--huddle-blue)]" strokeWidth={1.75} />
            </span>
            <span className="text-lg font-bold text-[var(--fg-1)]">{brief.label}</span>
            <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{brief.helper}</span>
            <input
              type="file"
              accept="image/*,.heic,.heif"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={`${brief.label}, ${brief.helper}`}
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      <ProfilePhotoSlotSheet
        isOpen={actionOpen}
        onClose={() => setActionOpen(false)}
        onFileSelected={handleFile}
        onRemove={() => {
          setConfirmingRemove(false);
          setActionOpen(false);
          onRemoved(slot, value);
        }}
        confirmingRemove={confirmingRemove}
        onConfirmingRemoveChange={setConfirmingRemove}
      />

      <ProfilePhotoCropper
        file={cropFile}
        aspect={brief.aspect}
        onCancel={() => setCropFile(null)}
        onSave={handleCropSave}
      />
    </div>
  );
}
