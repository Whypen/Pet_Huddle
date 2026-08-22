import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SupportRequestForm } from "@/components/support/SupportRequestForm";

type HelpSupportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSubject?: string;
  initialMessage?: string;
};

export function HelpSupportDialog({
  open,
  onOpenChange,
  initialSubject = "",
  initialMessage = "",
}: HelpSupportDialogProps) {
  const closeDialog = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-h-[min(760px,calc(100svh-32px))] max-w-[560px] overflow-y-auto rounded-[24px] border-border/70 bg-card p-0 shadow-[0_24px_80px_rgba(33,69,207,0.16)]">
        <DialogHeader className="border-b border-border/70 px-6 pb-4 pt-6 pr-14">
          <DialogTitle className="text-[22px] font-bold leading-7 text-brandText">Need help with huddle?</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 pt-5">
          <SupportRequestForm
            initialSubject={initialSubject}
            initialMessage={initialMessage}
            onDone={() => closeDialog(false)}
            compact
          />
        </div>
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
