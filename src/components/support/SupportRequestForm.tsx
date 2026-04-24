import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTurnstile } from "@/hooks/useTurnstile";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { FormField, FormTextArea, NeuCheckbox, NeuControl } from "@/components/ui";
import { postPublicFunction } from "@/lib/publicFunctionClient";

declare global {
  interface Window {
    __huddleSupportSubmitDiag?: {
      attempted: boolean;
      tokenLengthAtSubmit: number;
      status: number | null;
      succeeded: boolean;
      error: string | null;
      ticketNumber: string | null;
      updatedAt: string;
    };
  }
}

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
  const defaultWantsReply = true;
  const [wantsReply, setWantsReply] = useState(defaultWantsReply);
  const requiresReplyEmail = !knownEmail;
  const needsTurnstile = !user;
  const turnstileReady = !needsTurnstile || supportTurnstile.isTokenUsable;

  const recordSubmitDiag = (next: Partial<NonNullable<Window["__huddleSupportSubmitDiag"]>>) => {
    if (typeof window === "undefined") return;
    window.__huddleSupportSubmitDiag = {
      attempted: false,
      tokenLengthAtSubmit: 0,
      status: null,
      succeeded: false,
      error: null,
      ticketNumber: null,
      ...window.__huddleSupportSubmitDiag,
      ...next,
      updatedAt: new Date().toISOString(),
    };
  };

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
      setSubmitError("Enter your email so the support team can follow up.");
      return;
    }

    let turnstileToken = "";
    if (needsTurnstile) {
      turnstileToken = supportTurnstile.getToken();
      recordSubmitDiag({
        attempted: true,
        tokenLengthAtSubmit: turnstileToken.length,
        status: null,
        succeeded: false,
        error: null,
        ticketNumber: null,
      });
      if (!turnstileToken) {
        supportTurnstile.reset();
        const nextError =
          supportTurnstile.error
            ? String(supportTurnstile.error)
            : "Complete human verification first.";
        recordSubmitDiag({ error: nextError });
        setSubmitError(nextError);
        return;
      }
    } else {
      recordSubmitDiag({
        attempted: true,
        tokenLengthAtSubmit: 0,
        status: null,
        succeeded: false,
        error: null,
        ticketNumber: null,
      });
    }

    setSubmitting(true);
    try {
      const { data, error, status } = await postPublicFunction<{ ticket_number?: string }>(
        "submit-support-ticket",
        {
          name: knownName,
          email: trimmedReplyEmail,
          subject: trimmedSubject,
          message: trimmedMessage,
          wants_reply: wantsReply,
          turnstile_token: needsTurnstile ? turnstileToken : undefined,
        },
        { accessToken: session?.access_token ?? null },
      );

      if (error) {
        recordSubmitDiag({
          status,
          succeeded: false,
          error: error.message,
        });
        throw error;
      }

      const nextTicketNumber = (data as { ticket_number?: string } | null)?.ticket_number ?? null;
      recordSubmitDiag({
        status,
        succeeded: true,
        error: null,
        ticketNumber: nextTicketNumber,
      });
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
        <NeuControl
          type="button"
          onClick={() => {
            resetForm();
            onDone?.();
          }}
          size="lg"
          fullWidth
          className="mt-2"
        >
          Done
        </NeuControl>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FormField
        label="Subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Subject (optional)"
        disabled={submitting}
      />

      <FormTextArea
        label="Message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="How can we help?"
        className="[&_textarea]:min-h-[72px]"
        disabled={submitting}
      />

      {knownEmail ? (
        <NeuCheckbox
          checked={wantsReply}
          onCheckedChange={(checked) => setWantsReply(Boolean(checked))}
          label="You may follow up with me via email if needed."
          disabled={submitting}
        />
      ) : null}

      {requiresReplyEmail ? (
        <FormField
          type="email"
          label="Email"
          value={replyEmail}
          onChange={(event) => setReplyEmail(event.target.value)}
          placeholder="name@email.com"
          autoComplete="email"
          disabled={submitting}
        />
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
        <NeuControl
          type="button"
          onClick={() => {
            resetForm();
            onDone?.();
          }}
          disabled={submitting}
          variant="secondary"
          size="lg"
          className="flex-1"
        >
          Cancel
        </NeuControl>
        <NeuControl
          type="button"
          onClick={submitSupport}
          disabled={submitting || !message.trim() || (needsTurnstile && (!supportTurnstile.enabled || !turnstileReady))}
          loading={submitting}
          size="lg"
          className="flex-1"
        >
          Send
        </NeuControl>
      </div>
    </div>
  );
}
