import { motion, AnimatePresence } from "framer-motion";
import { X, Crown, Check, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface PremiumUpsellProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PremiumUpsell = ({ isOpen, onClose }: PremiumUpsellProps) => {
  const { t } = useLanguage();
  const features = [
    t("Verified-only matching"),
    t("See who's active now"),
    t("Pet temperament matching"),
    t("Advanced logistics filters"),
    t("Mutual friends visibility"),
    t("Unlimited swipes"),
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-foreground/60 backdrop-blur-md z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-card rounded-3xl z-50 overflow-hidden max-w-sm mx-auto shadow-elevated"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header with Gradient */}
            <div className="relative bg-gradient-to-br from-brandGold via-[#B38F18] to-[#7C6210] px-6 pt-8 pb-12">
              <div className="absolute inset-0 overflow-hidden">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="absolute -top-20 -right-20 w-40 h-40 bg-white/10 rounded-full"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                  className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full"
                />
              </div>
              
              <div className="relative text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
                >
                <Crown className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-1">{t("Huddle Premium")}</h2>
              <p className="text-white/80 text-sm">{t("Unlock the full experience")}</p>
            </div>
          </div>

            {/* Features */}
            <div className="px-6 py-6 -mt-6 bg-card rounded-t-3xl relative">
              <div className="space-y-3 mb-6">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </motion.div>
                ))}
              </div>

              {/* Pricing */}
              <div className="text-center mb-5">
                <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold">{t("$9.99")}</span>
                  <span className="text-muted-foreground">{t("/month")}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t("Cancel anytime")}</p>
              </div>

              {/* CTA Button */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 rounded-xl bg-brandGold text-brandText font-semibold text-lg shadow-lg flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                {t("Upgrade to Premium")}
              </motion.button>

              {/* Skip */}
              <button
                onClick={onClose}
                className="w-full py-3 text-muted-foreground text-sm mt-3"
              >
                {t("Maybe later")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
