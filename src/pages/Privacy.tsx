import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { LegalContent } from "@/components/legal/LegalContent";
import { useLanguage } from "@/contexts/LanguageContext";

const Privacy = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader />
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{t("settings.privacy_policy")}</h1>
      </header>
      <div className="px-4 py-6">
        <LegalContent type="privacy" />
      </div>
    </div>
  );
};

export default Privacy;
