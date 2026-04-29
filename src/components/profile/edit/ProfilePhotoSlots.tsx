import type { ProfilePhotos, ProfilePhotoSlot as ProfilePhotoSlotName, SoloAspect } from "@/types/profilePhotos";
import { ProfilePhotoSlot } from "./ProfilePhotoSlot";
import { SLOT_ORDER } from "./copy/slotBriefs";

type ProfilePhotoSlotsProps = {
  photos: ProfilePhotos;
  userId: string | null;
  onChange: (next: ProfilePhotos | ((previous: ProfilePhotos) => ProfilePhotos)) => void;
  onPhotosCommit?: (photos: ProfilePhotos) => void;
  onCaptionCommit?: (photos: ProfilePhotos) => void;
  onPreviousPathQueued?: (path: string | null) => void;
};

const CAPTION_KEYS = {
  establishing: "establishing_caption",
  pack: "pack_caption",
  solo: "solo_caption",
  closer: "closer_caption",
} as const;

const captionKeyForSlot = (slot: ProfilePhotoSlotName) =>
  slot === "cover" ? null : CAPTION_KEYS[slot];

const progressClass = (completion: number) => {
  if (completion < 30) return "bg-[var(--coral-orange)] text-white";
  if (completion < 60) return "bg-[var(--lime-green)] text-[var(--huddle-blue)]";
  return "bg-[var(--huddle-blue)] text-white";
};

export function ProfilePhotoSlots({
  photos,
  userId,
  onChange,
  onPhotosCommit,
  onCaptionCommit,
  onPreviousPathQueued,
}: ProfilePhotoSlotsProps) {
  const completedCount = SLOT_ORDER.filter((slot) => Boolean(photos[slot])).length;
  const completion = completedCount * 20;

  const updateSlot = (
    slot: ProfilePhotoSlotName,
    path: string,
    soloAspect: SoloAspect | null,
    previousPath: string | null,
  ) => {
    onPreviousPathQueued?.(previousPath);
    let committedPhotos: ProfilePhotos | null = null;
    onChange((previous) => {
      const nextPhotos = {
        ...previous,
        [slot]: path,
        solo_aspect: slot === "solo" ? soloAspect ?? previous.solo_aspect ?? "4:5" : previous.solo_aspect,
      };
      committedPhotos = nextPhotos;
      return nextPhotos;
    });
    window.setTimeout(() => {
      if (committedPhotos) onPhotosCommit?.(committedPhotos);
    }, 0);
  };

  const removeSlot = (slot: ProfilePhotoSlotName, previousPath: string | null) => {
    onPreviousPathQueued?.(previousPath);
    const captionKey = captionKeyForSlot(slot);
    let committedPhotos: ProfilePhotos | null = null;
    onChange((previous) => {
      const nextPhotos = {
        ...previous,
        [slot]: null,
        ...(captionKey ? { [captionKey]: null } : {}),
        solo_aspect: slot === "solo" ? null : previous.solo_aspect,
      };
      committedPhotos = nextPhotos;
      return nextPhotos;
    });
    window.setTimeout(() => {
      if (committedPhotos) onPhotosCommit?.(committedPhotos);
    }, 0);
  };

  return (
    <section className="mx-auto w-full max-w-[var(--app-max-width,430px)] space-y-2" aria-label="Your photos">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your photos</h3>
        <span className={`ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill,9999px)] text-[11px] font-extrabold ${progressClass(completion)}`}>
          {completion}%
        </span>
      </div>

      <div className="flex snap-x snap-mandatory gap-[6px] overflow-x-auto overflow-y-visible scrollbar-hide pb-3 pt-1" style={{ touchAction: "pan-x pan-y" }}>
        {SLOT_ORDER.map((slot) => {
          const captionKey = captionKeyForSlot(slot);
          return (
            <ProfilePhotoSlot
              key={slot}
              slot={slot}
              value={photos[slot]}
              userId={userId}
              soloAspect={photos.solo_aspect}
              captionValue={captionKey ? photos[captionKey] : null}
              onCaptionChange={captionKey ? (caption) => onChange((previous) => ({ ...previous, [captionKey]: caption })) : undefined}
              onCaptionCommit={captionKey ? (caption) => {
                let committedPhotos: ProfilePhotos | null = null;
                onChange((previous) => {
                  const nextPhotos = { ...previous, [captionKey]: caption };
                  committedPhotos = nextPhotos;
                  return nextPhotos;
                });
                window.setTimeout(() => {
                  if (committedPhotos) onCaptionCommit?.(committedPhotos);
                }, 0);
              } : undefined}
              onUploaded={updateSlot}
              onRemoved={removeSlot}
            />
          );
        })}
      </div>

      <div className="sr-only" aria-live="polite">
        Profile photos {completion}% complete.
      </div>
    </section>
  );
}
