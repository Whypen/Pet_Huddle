import { useState } from "react";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { PlusUpsell } from "@/components/social/PlusUpsell";
import { NoticeBoard } from "@/components/social/NoticeBoard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { useUpsell } from "@/hooks/useUpsell";
import { UpsellModal } from "@/components/monetization/UpsellModal";

const Social = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);
  const { upsellModal, closeUpsellModal, buyAddOn } = useUpsell();

  const getUserAge = () => {
    if (!profile?.dob) return 25;
    const birthDate = new Date(profile.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const userAge = getUserAge();
  const isUnder16 = userAge < 16;

  return (
    <div className="min-h-screen bg-background pb-nav relative">
      <GlobalHeader
        onUpgradeClick={() => setIsPlusOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {isUnder16 && (
        <div className="absolute inset-x-4 top-24 z-[60] pointer-events-none">
          <div className="rounded-xl border border-brandBlue/30 bg-background/90  px-4 py-3 text-sm font-medium text-brandBlue shadow-card">
            {t("Social features restricted for users under 16.")}
          </div>
        </div>
      )}

      <div className={cn(isUnder16 && "pointer-events-none opacity-70")}>
        <section className="px-5 py-2 pb-8">
          <NoticeBoard onPlusClick={() => setIsPlusOpen(true)} />
        </section>
      </div>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PlusUpsell isOpen={isPlusOpen} onClose={() => setIsPlusOpen(false)} />
      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />
    </div>
  );
};

export default Social;
