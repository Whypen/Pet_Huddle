import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user, profile } = useAuth();
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const [wantsReply, setWantsReply] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!open || ticketNumber) return;
    setSubject(initialSubject);
    setMessage(initialMessage);
  }, [initialMessage, initialSubject, open, ticketNumber]);

  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTicketNumber(null);
    }
    onOpenChange(nextOpen);
  };

  const submitSupport = async () => {
    if (submitting) return;
    const trimmedMessage = message.trim();
    const trimmedSubject = subject.trim() || "Support Request";
    if (!trimmedMessage) return;

    setSubmitting(true);
    try {
      const userEmail = (profile as Record<string, unknown> | null)?.email as string | null ?? user?.email ?? "";
      const displayName = (profile as Record<string, unknown> | null)?.display_name as string | null ?? user?.email ?? "User";
      const { data, error } = await supabase.functions.invoke("submit-support-ticket", {
        body: {
          name: displayName,
          email: userEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
          wants_reply: wantsReply,
        },
      });
      if (error) throw error;
      const nextTicketNumber = (data as { ticket_number?: string } | null)?.ticket_number ?? null;
      setTicketNumber(nextTicketNumber);
      setSubject("");
      setMessage("");
      setWantsReply(true);
    } catch {
      toast.error("Couldn't send your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Help &amp; Support</DialogTitle>
        </DialogHeader>
        {ticketNumber ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">Message sent</p>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Your ticket number is <span className="font-mono font-semibold text-brandBlue">{ticketNumber}</span>. We'll be in touch soon.
            </p>
            <button
              type="button"
              onClick={() => closeDialog(false)}
              className="mt-2 h-11 w-full rounded-xl bg-brandBlue text-[14px] font-[500] text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="pl-1 text-[13px] font-semibold text-[var(--text-primary,#424965)]">Subject</label>
                <div className="form-field-rest relative flex items-center">
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject (optional)"
                    className="field-input-core"
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="pl-1 text-[13px] font-semibold text-[var(--text-primary,#424965)]">Message</label>
                <div className="form-field-rest relative h-auto min-h-[96px] py-3">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="How can we help?"
                    className="field-input-core min-h-[72px] resize-none"
                    disabled={submitting}
                  />
                </div>
              </div>
              <label className="flex cursor-pointer select-none items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={wantsReply}
                  onChange={(event) => setWantsReply(event.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded accent-brandBlue"
                  disabled={submitting}
                />
                <span className="text-[13px] text-[var(--text-secondary)]">
                  You may follow up with me via email if needed.
                </span>
              </label>
            </div>
            <DialogFooter className="!flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => closeDialog(false)}
                disabled={submitting}
                className="h-11 flex-1 rounded-xl border border-[var(--border)] text-[14px] font-[500] text-[var(--text-primary)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSupport}
                disabled={submitting || !message.trim()}
                className="h-11 flex-1 rounded-xl bg-brandBlue text-[14px] font-[500] text-white disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
