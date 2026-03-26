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

const APP_STYLE = `<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;color:#424965;font-family:'Urbanist',-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.6}
.wrap{padding:16px 0 80px}
.top,.nav,.meta,.footer{display:none!important}
.card{background:transparent;border:none;box-shadow:none;padding:0}
h1{display:none}
h2{font-size:15px;font-weight:600;color:#1a1f36;margin:22px 0 6px}
p{font-size:14px;color:#424965;margin-bottom:10px}
li{font-size:14px;color:#424965;margin-bottom:4px}
ul{padding-left:18px;margin-bottom:10px}
a{color:#2145CF;text-decoration:none}
.note{padding:10px 12px;background:#f0f4ff;border-radius:10px;color:#21306b;font-size:13px;margin:10px 0}
</style>`;

const LEGAL_ROUTE_MAP: Record<string, string> = {
  "privacy.html": "/privacy",
  "terms.html": "/terms",
  "community-guidelines.html": "/community-guidelines",
  "cookies.html": "/cookies",
  "privacy-choices.html": "/privacy-choices",
  "collection-notice.html": "/collection-notice",
};

function withAppStyles(html: string): string {
  const withStyles = html.replace(/<style>[\s\S]*?<\/style>/, APP_STYLE);
  const withTopTarget = withStyles.includes("<head>")
    ? withStyles.replace("<head>", `<head><base target="_top" />`)
    : withStyles;
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
