import { FormEvent } from "react";
import { ImagePlus, Lock, SendHorizontal } from "lucide-react";
import { NeuButton } from "@/components/ui/NeuButton";
import { ExternalLinkPreviewCard } from "@/components/ui/ExternalLinkPreviewCard";
import type { ExternalLinkPreview } from "@/lib/externalLinkPreview";

type PrimaryAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
} | null;

type Props = {
  waitingForCounterparty: boolean;
  peerName: string;
  actionPrimary: PrimaryAction;
  canDispute: boolean;
  status: "pending" | "booked" | "in_progress" | "completed" | "disputed";
  isRequester: boolean;
  hasQuote: boolean;
  submittingAction: boolean;
  composer: string;
  hasUploads: boolean;
  hasLinkPreview: boolean;
  composerLocked: boolean;
  sendingMessage: boolean;
  servicePeriodPassed: boolean;
  activePreviewUrl: string | null;
  composerPreview: ExternalLinkPreview | null;
  onComposerChange: (next: string) => void;
  onSendMessage: (event: FormEvent) => void;
  onAttachPhoto: () => void;
  onDismissPreview: (url: string) => void;
  onOpenDispute: () => void;
  onAskRevise: () => void;
  chatDisabled?: boolean;
};

export const ActionBar = ({
  waitingForCounterparty,
  peerName,
  actionPrimary,
  canDispute,
  status,
  isRequester,
  hasQuote,
  submittingAction,
  composer,
  hasUploads,
  hasLinkPreview,
  composerLocked,
  sendingMessage,
  servicePeriodPassed,
  activePreviewUrl,
  composerPreview,
  onComposerChange,
  onSendMessage,
  onAttachPhoto,
  onDismissPreview,
  onOpenDispute,
  onAskRevise,
  chatDisabled = false,
}: Props) => {
  return (
    <div className="space-y-2 border-t border-border/40 bg-background px-4 py-2 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+16px)]">
      {waitingForCounterparty ? (
        <p className="text-xs text-muted-foreground">Waiting for {peerName} to confirm…</p>
      ) : null}

      {activePreviewUrl ? (
        <ExternalLinkPreviewCard
          url={activePreviewUrl}
          preview={composerPreview}
          onRemove={() => onDismissPreview(activePreviewUrl)}
        />
      ) : null}

      <div className="flex items-center gap-2">
        {actionPrimary ? (
          <NeuButton size="sm" onClick={actionPrimary.onClick} disabled={submittingAction || Boolean(actionPrimary.disabled)}>
            {actionPrimary.label}
          </NeuButton>
        ) : null}
        {canDispute && status !== "disputed" ? (
          <NeuButton variant="secondary" size="sm" onClick={onOpenDispute} disabled={submittingAction}>
            Dispute
          </NeuButton>
        ) : null}
        {status === "pending" && isRequester && hasQuote ? (
          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={onAskRevise}>
            Ask to revise
          </button>
        ) : null}
      </div>

      <form onSubmit={onSendMessage} className="flex items-center gap-2">
        {chatDisabled ? (
          <div className="flex h-10 flex-1 items-center gap-2 rounded-[12px] border border-amber-200 bg-amber-50 px-3 text-xs text-amber-900">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Your messaging access is currently restricted due to recent account activity that does not meet our community safety standards.
            </span>
          </div>
        ) : (
        <div className="flex h-10 flex-1 items-center gap-2 rounded-[12px] bg-[rgba(255,255,255,0.72)] px-1.5 shadow-[inset_2px_2px_5px_rgba(163,168,190,0.30),inset_-1px_-1px_4px_rgba(255,255,255,0.90)]">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-transparent disabled:opacity-45"
            onClick={onAttachPhoto}
            aria-label="Upload photo"
            disabled={composerLocked || submittingAction}
          >
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
          </button>
          <input
            value={composer}
            onChange={(e) => onComposerChange(e.target.value)}
            disabled={composerLocked || submittingAction}
            placeholder={composerLocked ? "Request a quote to start conversation" : isRequester ? "Ask a question" : ""}
            className="h-10 flex-1 border-0 bg-transparent px-1 text-[16px] text-[var(--text-primary,#424965)] outline-none focus:outline-none"
          />
        </div>
        )}
        <button
          type="submit"
          disabled={chatDisabled || composerLocked || sendingMessage || (!composer.trim() && !hasUploads && !hasLinkPreview)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brandBlue text-white shadow-[0_4px_16px_rgba(33,69,207,0.28)] disabled:opacity-45"
          aria-label="Send message"
        >
          <SendHorizontal className="h-4.5 w-4.5" />
        </button>
      </form>
      {!servicePeriodPassed && status === "in_progress" ? (
        <p className="text-[11px] text-muted-foreground">Mark finished will unlock after the service end time.</p>
      ) : null}
    </div>
  );
};
