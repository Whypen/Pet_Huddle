import { FormEvent } from "react";
import { ImagePlus, SendHorizontal } from "lucide-react";
import { NeuButton } from "@/components/ui/NeuButton";

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
  composerLocked: boolean;
  sendingMessage: boolean;
  servicePeriodPassed: boolean;
  onComposerChange: (next: string) => void;
  onSendMessage: (event: FormEvent) => void;
  onAttachPhoto: () => void;
  onOpenDispute: () => void;
  onAskRevise: () => void;
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
  composerLocked,
  sendingMessage,
  servicePeriodPassed,
  onComposerChange,
  onSendMessage,
  onAttachPhoto,
  onOpenDispute,
  onAskRevise,
}: Props) => {
  return (
    <div className="border-t border-border/40 bg-background px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))] space-y-2">
      {waitingForCounterparty ? (
        <p className="text-xs text-muted-foreground">Waiting for {peerName} to confirm…</p>
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
        <button
          type="submit"
          disabled={composerLocked || sendingMessage || !composer.trim()}
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
