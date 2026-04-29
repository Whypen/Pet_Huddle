import { RefreshCw, Trash2 } from "lucide-react";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { NeuButton } from "@/components/ui/NeuButton";

type ProfilePhotoSlotSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (file: File | undefined) => void;
  onRemove: () => void;
  confirmingRemove: boolean;
  onConfirmingRemoveChange: (open: boolean) => void;
};

export function ProfilePhotoSlotSheet({
  isOpen,
  onClose,
  onFileSelected,
  onRemove,
  confirmingRemove,
  onConfirmingRemoveChange,
}: ProfilePhotoSlotSheetProps) {
  return (
    <>
      <GlassSheet isOpen={isOpen} onClose={onClose} title="Photo options" contentClassName="pb-5">
        <div className="space-y-2">
          <label
            className="relative flex h-14 w-full cursor-pointer items-center gap-3 overflow-hidden rounded-[var(--radius-md)] px-4 text-left text-sm font-semibold text-[var(--fg-1)] transition-colors hover:bg-white/35"
          >
            <RefreshCw className="h-4 w-4 text-[var(--huddle-blue)]" strokeWidth={1.75} />
            Replace photo
            <input
              type="file"
              accept="image/*,.heic,.heif"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Replace photo"
              onChange={(event) => {
                onFileSelected(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="flex h-14 w-full items-center gap-3 rounded-[var(--radius-md)] px-4 text-left text-sm font-semibold text-[var(--validation-red)] transition-colors hover:bg-white/35"
            onClick={() => onConfirmingRemoveChange(true)}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            Remove photo
          </button>
        </div>
      </GlassSheet>

      <GlassModal
        isOpen={confirmingRemove}
        onClose={() => onConfirmingRemoveChange(false)}
        title="Remove this photo?"
        hideClose
      >
        <p className="type-body-sm mb-5 text-[var(--fg-2)]">It'll disappear from your profile right away.</p>
        <div className="grid grid-cols-2 gap-3">
          <NeuButton
            type="button"
            variant="secondary"
            onClick={() => onConfirmingRemoveChange(false)}
          >
            Keep it
          </NeuButton>
          <NeuButton
            type="button"
            variant="destructive"
            onClick={onRemove}
          >
            Remove
          </NeuButton>
        </div>
      </GlassModal>
    </>
  );
}
