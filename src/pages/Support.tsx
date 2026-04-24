import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/layouts/PageHeader";
import { SupportRequestForm } from "@/components/support/SupportRequestForm";

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
            <h2 className="text-lg font-semibold text-foreground">Need help with Huddle?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Send your message directly to the Huddle support team here. If we don&apos;t already have your email,
              the public form will ask for it so the team can follow up.
            </p>
            <div className="mt-4">
              <SupportRequestForm />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground">Legal pages</h2>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link className="font-medium text-primary underline underline-offset-4" to="/privacy">
                Privacy Policy
              </Link>
              <Link className="font-medium text-primary underline underline-offset-4" to="/terms">
                Terms of Service
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Support;
