/**
 * PlusUpsell — discovery filter upsell modal (Plus / Gold)
 * DESIGN_MASTER_SPEC §E3: glass active modal
 * MASTER_SPEC §2.5: "Plus" / "Gold" naming only
 * Motion: no bounce/decorative spin; spec-compliant 300ms ease
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, Diamond, Star, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { plusTabRoute } from "@/lib/routes";
import { useLanguage } from "@/contexts/LanguageContext";

interface PlusUpsellProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which tier to upsell. Defaults to "plus". */
  tier?: "plus" | "gold";
}

const PLUS_FEATURES = [
  "Verified-only matching",
  "See recently active members",
  "Pet temperament matching",
  "Advanced logistics filters",
  "Mutual friends visibility",
  "Unlimited swipes",
];

const GOLD_FEATURES = [
  "Everything in Plus",
  "Gold status badge",
  "Maximum broadcast radius",
  "Priority in discovery",
  "Exclusive Gold filters",
  "Priority support",
];

export const PlusUpsell = ({ isOpen, onClose, tier = "plus" }: PlusUpsellProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const features = tier === "gold" ? GOLD_FEATURES : PLUS_FEATURES;
  const tierLabel = tier === "gold" ? "Gold" : "Plus";
  const Icon = tier === "gold" ? Star : Diamond;
  const headerBg =
    tier === "gold"
      ? "bg-gradient-to-br from-brandGold via-[#B38F18] to-[#7C6210]"
      : "bg-gradient-to-br from-brandBlue via-[#1B3FB0] to-[#122B80]";
  const tabParam = tier === "gold" ? "Gold" : "Plus";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Glass E3 modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 glass-e3 z-50 overflow-hidden max-w-sm mx-auto"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/10 hover:bg-black/20 transition-colors z-10"
              aria-label="Not now"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* Header gradient */}
            <div className={`${headerBg} px-6 pt-8 pb-10`}>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <h2 className="font-display text-h1 font-semibold text-white mb-1">
                  {t(`Unlock ${tierLabel}`)}
                </h2>
                <p className="text-white/75 text-sub">{t("Unlock the full experience")}</p>
              </div>
            </div>

            {/* Features + CTA */}
            <div className="px-6 py-6 -mt-6 bg-white rounded-t-[20px] relative">
              <div className="space-y-3 mb-6">
                {features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-brandBlue/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-brandBlue" />
                    </div>
                    <span className="text-sub text-brandText">{t(feature)}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => {
                  navigate(plusTabRoute(tabParam));
                  onClose();
                }}
                className={`w-full py-4 rounded-btn font-semibold text-base text-white ${
                  tier === "gold" ? "bg-brandGold" : "bg-brandBlue neu-primary"
                }`}
              >
                {t(`Unlock ${tierLabel}`)}
              </button>

              {/* Not now */}
              <button
                onClick={onClose}
                className="w-full py-3 text-brandText/50 text-sub mt-2"
              >
                {t("Not now")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
