import { useState } from "react";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BlockModalProps {
  open: boolean;
  onClose: () => void;
  targetName: string;
  isBlocked: boolean;
  onBlock: () => Promise<void>;
  onUnblock: () => Promise<void>;
}

/**
 * BlockModal — confirms block / unblock action.
 * Mobile-first: 44px tap targets, no hover dependency.
 */
export function BlockModal({
  open,
  onClose,
  targetName,
  isBlocked,
  onBlock,
  onUnblock,
}: BlockModalProps) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleAction = async () => {
    setLoading(true);
    try {
      if (isBlocked) {
        await onUnblock();
      } else {
        await onBlock();
      }
      setDone(true);
      setTimeout(() => {
        setDone(false);
        onClose();
      }, 1200);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setDone(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm w-[92vw] rounded-2xl p-6 gap-0">
        {done ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground">
              {isBlocked ? `${targetName} unblocked` : `${targetName} blocked`}
            </p>
          </div>
        ) : isBlocked ? (
          /* ── Unblock confirmation ── */
          <>
            <DialogHeader className="mb-4">
              <DialogTitle className="text-lg font-bold text-foreground">
                Unblock {targetName}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-6">
              Unblocking will allow {targetName} to message you and see your profile again.
            </p>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 flex-1"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                className="h-11 flex-1 bg-brandBlue hover:bg-brandBlue/90 text-white"
                onClick={handleAction}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unblock"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* ── Block confirmation ── */
          <>
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <DialogTitle className="text-lg font-bold text-foreground">
                  Block {targetName}?
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-2 mb-6">
              <p className="text-sm text-muted-foreground">When you block someone:</p>
              <ul className="text-sm text-muted-foreground space-y-1.5 pl-3">
                <li className="flex gap-2">
                  <span className="text-foreground font-medium mt-0.5">·</span>
                  Neither of you can send new messages
                </li>
                <li className="flex gap-2">
                  <span className="text-foreground font-medium mt-0.5">·</span>
                  You won't see each other in Discovery
                </li>
                <li className="flex gap-2">
                  <span className="text-foreground font-medium mt-0.5">·</span>
                  Existing chat history is preserved
                </li>
                <li className="flex gap-2">
                  <span className="text-foreground font-medium mt-0.5">·</span>
                  Stars spent are not refunded
                </li>
                <li className="flex gap-2">
                  <span className="text-foreground font-medium mt-0.5">·</span>
                  You can unblock at any time
                </li>
              </ul>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="h-11 flex-1"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="h-11 flex-1"
                onClick={handleAction}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Block"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
