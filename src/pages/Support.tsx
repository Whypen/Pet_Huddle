import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/layouts/PageHeader";
import { SupportRequestForm } from "@/components/support/SupportRequestForm";
import { hasNativeShell, shouldSuppressWebHeaderForNativeShell } from "@/lib/nativeShell";

declare global {
  interface Window {
    __HUDDLE_NATIVE_CONTENT_ONLY__?: boolean;
  }
}

const isNativeContentOnly = () =>
  typeof window !== "undefined" && window.__HUDDLE_NATIVE_CONTENT_ONLY__ === true;

const Support = () => {
  const navigate = useNavigate();
  const nativeShellChrome = hasNativeShell() || isNativeContentOnly() || shouldSuppressWebHeaderForNativeShell();
  const [sentTicketNumber, setSentTicketNumber] = useState<string | null>(null);

  return (
    <div className="h-full min-h-0 w-full max-w-full bg-background overflow-x-hidden flex flex-col">
      {!nativeShellChrome ? (
        <PageHeader
          title="Help & Support"
          titleClassName="justify-start"
          showBack
          onBack={() => navigate(-1)}
        />
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={`mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-6 ${nativeShellChrome ? "pt-[72px]" : "pt-[68px]"}`}>
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
        </div>
      </div>
    </div>
  );
};

export default Support;
