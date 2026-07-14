import privacyHtml from "@/legal/privacy.html?raw";
import termsHtml from "@/legal/terms.html?raw";
import communityHtml from "@/legal/community-guidelines.html?raw";
import cookiesHtml from "@/legal/cookies.html?raw";
import privacyChoicesHtml from "@/legal/privacy-choices.html?raw";
import collectionHtml from "@/legal/collection-notice.html?raw";
import serviceAgreementHtml from "@/legal/service-provider-agreement.html?raw";
import bookingTermsHtml from "@/legal/service-requester-agreement.html?raw";

type LegalType = "privacy" | "terms" | "community-guidelines" | "cookies" | "privacy-choices" | "collection-notice" | "service-agreement" | "booking-terms";

const HTML_MAP: Record<LegalType, string> = {
  "privacy": privacyHtml,
  "terms": termsHtml,
  "community-guidelines": communityHtml,
  "cookies": cookiesHtml,
  "privacy-choices": privacyChoicesHtml,
  "collection-notice": collectionHtml,
  "service-agreement": serviceAgreementHtml,
  "booking-terms": bookingTermsHtml,
};

// The generated document owns all legal typography. The app only removes the
// duplicate page title because the surrounding route already renders it.
const EMBED_STYLE = "<style>html,body{background:transparent}.wrap{padding:16px 0 80px}h1{display:none}</style>";

const LEGAL_ROUTE_MAP: Record<string, string> = {
  "privacy.html": "/privacy",
  "terms.html": "/terms",
  "community-guidelines.html": "/community-guidelines",
  "cookies.html": "/cookies",
  "privacy-choices.html": "/privacy-choices",
  "collection-notice.html": "/collection-notice",
};

function withAppStyles(html: string): string {
  const withTopTarget = html.includes("<head>")
    ? html.replace("<head>", `<head><base target="_top" />${EMBED_STYLE}`)
    : html;
  return Object.entries(LEGAL_ROUTE_MAP).reduce(
    (acc, [from, to]) =>
      acc
        .replaceAll(`href="${from}"`, `href="${to}"`)
        .replaceAll(`href='${from}'`, `href='${to}'`),
    withTopTarget,
  );
}

export const LegalContent = ({ type }: { type: LegalType }) => {
  const html = withAppStyles(HTML_MAP[type] ?? privacyHtml);
  return (
    <iframe
      srcDoc={html}
      className="w-full border-0"
      style={{ minHeight: "calc(100vh - 96px)" }}
      title={type}
      sandbox="allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
    />
  );
};
