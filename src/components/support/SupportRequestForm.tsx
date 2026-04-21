import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { postPublicFunction } from "@/lib/publicFunctionClient";

type SupportRequestFormProps = {
  initialSubject?: string;
  initialMessage?: string;
  onDone?: () => void;
  compact?: boolean;
};

export function SupportRequestForm({
  initialSubject = "",
  initialMessage = "",
  onDone,
  compact = false,
}: SupportRequestFormProps) {
  const { user, profile, session } = useAuth();
  const [subject, setSubject] = useState(initialSubject);
  const [message, setMessage] = useState(initialMessage);
  const [replyEmail, setReplyEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const supportTurnstile = useTurnstile("support_ticket");

  const knownEmail = useMemo(
    () => String((profile as Record<string, unknown> | null)?.email || user?.email || "").trim(),
    [profile, user?.email],
  );
  const knownName = useMemo(
    () => String((profile as Record<string, unknown> | null)?.display_name || user?.email || "Guest").trim(),
    [profile, user?.email],
  );
  const effectiveEmail = knownEmail || replyEmail.trim();
  const defaultWantsReply = Boolean(knownEmail);
  const [wantsReply, setWantsReply] = useState(defaultWantsReply);
  const requiresReplyEmail = wantsReply && !knownEmail;
  const needsTurnstile = !user;

  useEffect(() => {
    if (ticketNumber) return;
    setSubject(initialSubject);
    setMessage(initialMessage);
    setWantsReply(defaultWantsReply);
  }, [defaultWantsReply, initialMessage, initialSubject, ticketNumber]);

  const resetForm = () => {
    setTicketNumber(null);
    setSubmitError("");
    setSubject(initialSubject);
    setMessage(initialMessage);
    setReplyEmail("");
    setWantsReply(defaultWantsReply);
    supportTurnstile.reset();
  };

  const submitSupport = async () => {
    if (submitting) return;
    const trimmedMessage = message.trim();
    const trimmedSubject = subject.trim() || "Support Request";
    const trimmedReplyEmail = effectiveEmail.trim();

    setSubmitError("");

    if (!trimmedMessage) {
      setSubmitError("Please tell us how we can help.");
      return;
    }

    if (requiresReplyEmail && !trimmedReplyEmail) {
      setSubmitError("Enter your email if you want a reply.");
      return;
    }

    let turnstileToken = "";
    if (needsTurnstile) {
      turnstileToken = supportTurnstile.getToken();
      if (!turnstileToken) {
        supportTurnstile.reset();
        setSubmitError(
          supportTurnstile.error
            ? String(supportTurnstile.error)
            : "Complete human verification first.",
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data, error } = await postPublicFunction<{ ticket_number?: string }>(
        "submit-support-ticket",
        {
          name: knownName,
          email: wantsReply ? trimmedReplyEmail : "",
          subject: trimmedSubject,
          message: trimmedMessage,
          wants_reply: wantsReply,
          turnstile_token: needsTurnstile ? turnstileToken : undefined,
        },
        { accessToken: session?.access_token ?? null },
      );

      if (error) throw error;

      const nextTicketNumber = (data as { ticket_number?: string } | null)?.ticket_number ?? null;
      setTicketNumber(nextTicketNumber);
      setSubject(initialSubject);
      setMessage(initialMessage);
      setReplyEmail("");
      setWantsReply(defaultWantsReply);
      supportTurnstile.consumeToken();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Couldn't send your message. Please try again.";
      setSubmitError(messageText);
      toast.error("Couldn't send your message. Please try again.");
      if (needsTurnstile) supportTurnstile.reset();
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketNumber) {
    return (
      <div className="space-y-3 py-2 text-center">
        <p className="text-[15px] font-semibold text-[var(--text-primary)]">Message sent</p>
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Your ticket number is <span className="font-mono font-semibold text-brandBlue">{ticketNumber}</span>. We&apos;ll be in touch soon.
        </p>
        <button
          type="button"
          onClick={() => {
            resetForm();
            onDone?.();
          }}
          className="mt-2 h-11 w-full rounded-xl bg-brandBlue text-[14px] font-[500] text-white"
        >
          Done
        </button>
      </div>
    );
  }

  return (
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

      {requiresReplyEmail ? (
        <div className="space-y-1.5">
          <label className="pl-1 text-[13px] font-semibold text-[var(--text-primary,#424965)]">Email</label>
          <div className="form-field-rest relative flex items-center">
            <input
              type="email"
              value={replyEmail}
              onChange={(event) => setReplyEmail(event.target.value)}
              placeholder="name@email.com"
              className="field-input-core"
              autoComplete="email"
              disabled={submitting}
            />
          </div>
        </div>
      ) : null}

      {needsTurnstile ? (
        <div className="space-y-1.5">
          <TurnstileWidget
            siteKeyMissing={!supportTurnstile.enabled}
            setContainer={supportTurnstile.setContainer}
            className="min-h-[65px]"
          />
          {!supportTurnstile.enabled ? (
            <p className="text-[12px] text-[var(--text-secondary)]">
              Human verification is temporarily unavailable.
            </p>
          ) : null}
        </div>
      ) : null}

      {submitError ? (
        <p className="text-[12px] font-medium text-[#ef6450]">{submitError}</p>
      ) : null}

      <div className={compact ? "!flex-row flex gap-2 pt-2" : "flex flex-col gap-2 pt-2 sm:flex-row"}>
        <button
          type="button"
          onClick={() => {
            resetForm();
            onDone?.();
          }}
          disabled={submitting}
          className="h-11 flex-1 rounded-xl border border-[var(--border)] text-[14px] font-[500] text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submitSupport}
          disabled={submitting || !message.trim() || (needsTurnstile && !supportTurnstile.enabled)}
          className="h-11 flex-1 rounded-xl bg-brandBlue text-[14px] font-[500] text-white disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
