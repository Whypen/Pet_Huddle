import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { LegalContent } from "@/components/legal/LegalContent";
import { useLanguage } from "@/contexts/LanguageContext";
import { BackButton } from "@/components/ui/BackButton";

const Terms = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />
      <header className="flex items-center gap-3 px-4 border-b border-border h-12">
        <BackButton />
        <h1 className="text-base font-semibold">{t("settings.terms")}</h1>
      </header>
      <div className="px-4 py-6">
        <LegalContent type="terms" />
      </div>
    </div>
  );
};

export default Terms;
