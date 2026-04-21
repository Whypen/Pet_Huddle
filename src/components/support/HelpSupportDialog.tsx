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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Help &amp; Support</DialogTitle>
        </DialogHeader>
        <SupportRequestForm
          initialSubject={initialSubject}
          initialMessage={initialMessage}
          onDone={() => closeDialog(false)}
          compact
        />
        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
