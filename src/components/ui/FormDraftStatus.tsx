import { DraftMode, DraftStatus } from "@/lib/formDraftConfigs";
import { Loader2 } from "lucide-react";

type FormDraftStatusProps = {
  mode: DraftMode;
  status: DraftStatus;
  onDiscard?: () => void;
  onReload?: () => void;
};

const getStatusLabel = (mode: DraftMode, status: DraftStatus): string => {
  if (status === "saving") return "Saving...";
  if (status === "saved") return mode === "local-only" ? "Saved" : "Saved";
  if (status === "offline_draft") return "Offline draft saved";
  if (status === "error") return "Couldn't save. Your draft is still stored on this device.";
  if (status === "restored") return "";
  return "";
};

export function FormDraftStatus({
  mode,
  status,
  onDiscard,
  onReload,
}: FormDraftStatusProps) {
  const label = getStatusLabel(mode, status);
  const showActions = mode === "local-and-remote" && (onDiscard || onReload);

  if (!label && !showActions) return null;

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 min-h-4">
        {status === "saving" ? <Loader2 size={12} className="animate-spin" /> : null}
        <span>{label}</span>
      </div>
      {showActions ? (
        <div className="flex items-center gap-3">
          {onDiscard ? (
            <button type="button" className="underline underline-offset-2" onClick={onDiscard}>
              Discard draft
            </button>
          ) : null}
          {onReload ? (
            <button type="button" className="underline underline-offset-2" onClick={onReload}>
              Reload saved
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
