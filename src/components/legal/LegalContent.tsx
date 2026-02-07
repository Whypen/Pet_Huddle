import privacyText from "./privacy.txt?raw";
import termsText from "./terms.txt?raw";

export const LegalContent = ({ type }: { type: "privacy" | "terms" }) => {
  // Ironclad Legal Framework: content MUST be sourced from the repo's RTF-derived text files.
  // This avoids drift between the legal documents and in-app rendering.
  const content = type === "privacy" ? privacyText : termsText;

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-brandText">
      {content}
    </div>
  );
};
