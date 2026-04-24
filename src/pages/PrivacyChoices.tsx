import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { LegalContent } from "@/components/legal/LegalContent";
import { BackButton } from "@/components/ui/BackButton";
import privacyChoicesHtml from "@/legal/privacy-choices.html?raw";

declare global {
  interface Window {
    __HUDDLE_NATIVE_CONTENT_ONLY__?: boolean;
  }
}

const isNativeContentOnly = () =>
  typeof window !== "undefined" && window.__HUDDLE_NATIVE_CONTENT_ONLY__ === true;

const getPrivacyChoicesBodyHtml = () => {
  if (typeof DOMParser === "undefined") {
    return privacyChoicesHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? privacyChoicesHtml;
  }

  return new DOMParser().parseFromString(privacyChoicesHtml, "text/html").body.innerHTML;
};

const PrivacyChoices = () => {
  const nativeContentOnly = isNativeContentOnly();

  return (
    <div className="h-full min-h-0 w-full max-w-full bg-background overflow-x-hidden">
      {!nativeContentOnly ? (
        <>
          <GlobalHeader />
          <header className="flex items-center gap-3 px-4 border-b border-border h-12">
            <BackButton />
            <h1 className="text-base font-semibold">Your Privacy Choices</h1>
          </header>
        </>
      ) : null}
      {nativeContentOnly ? (
        <div
          className="px-4 pb-8 pt-[72px] text-[#424965] [&_.wrap]:mx-auto [&_.wrap]:max-w-[680px] [&_.wrap]:p-0 [&_a]:text-[#2145CF] [&_h1]:hidden [&_h2]:mb-[6px] [&_h2]:mt-[22px] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:leading-[1.4] [&_h2]:text-[#1a1f36] [&_li]:mb-1 [&_li]:text-sm [&_li]:leading-[1.72] [&_p]:mb-[10px] [&_p]:text-sm [&_p]:leading-[1.72] [&_ul]:mb-[10px] [&_ul]:pl-[18px]"
          dangerouslySetInnerHTML={{ __html: getPrivacyChoicesBodyHtml() }}
        />
      ) : (
        <div className="px-4 py-6">
          <LegalContent type="privacy-choices" />
        </div>
      )}
    </div>
  );
};

export default PrivacyChoices;
