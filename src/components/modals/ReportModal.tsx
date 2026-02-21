import { useState } from "react";
import { Flag, CheckCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ReportReason =
  | "harassment"
  | "spam"
  | "inappropriate_content"
  | "fake_profile"
  | "scam"
  | "underage"
  | "other";

type ReportContextType = "chat" | "profile" | "social_post" | "other";

const REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment or bullying",
  spam: "Spam or unwanted messages",
  inappropriate_content: "Inappropriate content",
  fake_profile: "Fake or impersonation account",
  scam: "Scam or fraud",
  underage: "Appears to be underage",
  other: "Other",
};

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  targetId: string;
  targetName: string;
  contextType?: ReportContextType;
  contextId?: string;
  /** Called after report is submitted — parent can trigger block if toggle was on */
  onAlsoBlock?: () => Promise<void>;
}

/**
 * ReportModal — category select, optional details, submit, success.
 * Optional "Also block?" toggle. Mobile-first, 44px tap targets.
 */
export function ReportModal({
  open,
  onClose,
  targetId,
  targetName,
  contextType = "chat",
  contextId,
  onAlsoBlock,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = reason !== "" && !loading;
  const detailsLength = details.length;
  const MAX_DETAILS = 1000;

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("submit_report", {
        p_reported_id: targetId,
        p_context_type: contextType,
        p_context_id: contextId ?? null,
        p_reason: reason as ReportReason,
        p_details: details.trim() || null,
      });

      if (error) throw error;

      if (alsoBlock && onAlsoBlock) {
        await onAlsoBlock();
      }

      setSubmitted(true);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to submit report");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    // Reset state on close
    setReason("");
    setDetails("");
    setAlsoBlock(false);
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm w-[92vw] rounded-2xl p-6 gap-0">
        {submitted ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="font-bold text-foreground text-lg">Report submitted</h3>
            <p className="text-sm text-muted-foreground">
              Thanks for keeping huddle safe. Our team will review your report within 24 hours.
            </p>
            {alsoBlock && (
              <p className="text-xs text-muted-foreground mt-1">
                {targetName} has also been blocked.
              </p>
            )}
            <Button
              className="mt-4 h-11 w-full bg-brandBlue hover:bg-brandBlue/90 text-white"
              onClick={handleClose}
            >
              Done
            </Button>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <DialogHeader className="mb-4">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-500" />
                <DialogTitle className="text-lg font-bold text-foreground">
                  Report {targetName}
                </DialogTitle>
              </div>
            </DialogHeader>

            {/* Reason select */}
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Reason <span className="text-red-500">*</span>
              </label>
              <div className="space-y-1.5">
                {(Object.keys(REASON_LABELS) as ReportReason[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={[
                      "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors min-h-[44px]",
                      reason === r
                        ? "border-brandBlue bg-brandBlue/5 text-brandBlue font-medium"
                        : "border-border text-foreground hover:border-brandBlue/50",
                    ].join(" ")}
                  >
                    {REASON_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional details */}
            <div className="mb-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Additional details{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={details}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_DETAILS) setDetails(e.target.value);
                }}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-brandBlue/50 transition-all"
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {detailsLength}/{MAX_DETAILS}
              </p>
            </div>

            {/* Also block toggle */}
            {onAlsoBlock && (
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 mb-6">
                <Label htmlFor="also-block" className="text-sm text-foreground cursor-pointer">
                  Also block {targetName}
                </Label>
                <Switch
                  id="also-block"
                  checked={alsoBlock}
                  onCheckedChange={setAlsoBlock}
                />
              </div>
            )}

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
                className="h-11 flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Submit Report"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
