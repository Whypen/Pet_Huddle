import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/layouts/PageHeader";
import { SupportRequestForm } from "@/components/support/SupportRequestForm";
import { LegalModal } from "@/components/modals/LegalModal";
import { NeuControl } from "@/components/ui";

declare global {
  interface Window {
    __HUDDLE_NATIVE_CONTENT_ONLY__?: boolean;
  }
}

const isNativeContentOnly = () =>
  typeof window !== "undefined" && window.__HUDDLE_NATIVE_CONTENT_ONLY__ === true;

const Support = () => {
  const navigate = useNavigate();
  const nativeContentOnly = isNativeContentOnly();
  const [legalModal, setLegalModal] = useState<"terms" | "privacy" | null>(null);
  const [sentTicketNumber, setSentTicketNumber] = useState<string | null>(null);

  return (
    <div className="h-full min-h-0 w-full max-w-full bg-background overflow-x-hidden flex flex-col">
      {!nativeContentOnly ? (
        <PageHeader
          title="Help & Support"
          titleClassName="justify-start"
          showBack
          onBack={() => navigate(-1)}
        />
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-6 ${nativeContentOnly ? "pt-[72px]" : "pt-[68px]"}`}>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">
              {sentTicketNumber ? "Message sent!" : "Need help with huddle?"}
            </h2>
            {sentTicketNumber ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your ticket number is <span className="font-mono font-semibold text-brandBlue">{sentTicketNumber}</span>.
              </p>
            ) : (
              <div className="mt-4">
                <SupportRequestForm onSent={setSentTicketNumber} />
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Legal pages</h2>
            <div className="mt-4 flex flex-col gap-3">
              <NeuControl
                type="button"
                variant="tertiary"
                size="sm"
                className="h-auto justify-start px-0 text-left text-primary underline shadow-none"
                onClick={() => setLegalModal("privacy")}
              >
                Privacy Policy
              </NeuControl>
              <NeuControl
                type="button"
                variant="tertiary"
                size="sm"
                className="h-auto justify-start px-0 text-left text-primary underline shadow-none"
                onClick={() => setLegalModal("terms")}
              >
                Terms of Service
              </NeuControl>
            </div>
          </section>
        </div>
      </div>
      <LegalModal isOpen={legalModal === "terms"} onClose={() => setLegalModal(null)} type="terms" />
      <LegalModal isOpen={legalModal === "privacy"} onClose={() => setLegalModal(null)} type="privacy" />
    </div>
  );
};

export default Support;
