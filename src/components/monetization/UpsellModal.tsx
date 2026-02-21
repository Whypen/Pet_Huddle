// =====================================================
// UPSELL MODAL — in-app purchase modal (stars, slots, media)
// DESIGN_MASTER_SPEC §E3: glass active modal
// MASTER_SPEC §2.5: no "Plus Tip:" or "Plus" in copy
// Motion: spec-compliant 300ms cubic-bezier, no bounce
// =====================================================

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Camera, Sparkles, Star, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface UpsellModalProps {
  isOpen: boolean;
  type: "star" | "emergency_alert" | "media" | "family_slot" | null;
  title: string;
  description: string;
  price: number;
  onClose: () => void;
  onBuy: () => void;
}

const ICON_MAP = {
  star: Star,
  emergency_alert: AlertTriangle,
  media: Camera,
  family_slot: Users,
};

export const UpsellModal = ({
  isOpen,
  type,
  title,
  description,
  price,
  onClose,
  onBuy,
}: UpsellModalProps) => {
  const { t } = useLanguage();
  if (!type) return null;

  const Icon = ICON_MAP[type];

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
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 glass-e3 max-w-sm mx-auto p-6 z-50"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 transition-colors"
              aria-label="Not now"
            >
              <X className="w-5 h-5 text-brandText/60" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-brandBlue/10 flex items-center justify-center">
                <Icon className="w-8 h-8 text-brandBlue" />
              </div>
            </div>

            {/* Title */}
            <h2 className="font-display text-h2 font-semibold text-brandText text-center mb-2">
              {title}
            </h2>

            {/* Description */}
            <p className="text-center text-brandSubtext text-sub mb-6">{description}</p>

            {/* Price */}
            <div className="bg-[#F3F4F6] rounded-card p-4 mb-6 text-center">
              <p className="text-helper text-brandText/60 mb-1">{t("One-time purchase")}</p>
              <p className="font-display text-h1 font-semibold text-brandText">
                ${price.toFixed(2)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={onClose} variant="ghost" className="flex-1">
                {t("Not now")}
              </Button>
              <Button onClick={onBuy} variant="default" className="flex-1">
                <Sparkles className="w-4 h-4 mr-1" />
                {t("Buy Now")}
              </Button>
            </div>

            {/* Contextual hint for media type — no "Plus Tip:" copy */}
            {type === "media" && (
              <div className="mt-4 p-3 bg-brandBlue/5 rounded-btn border border-brandBlue/10">
                <p className="text-helper text-center text-brandText/60">
                  <span className="font-semibold text-brandBlue">
                    {t("Plus includes unlimited media uploads and more")}
                  </span>
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
