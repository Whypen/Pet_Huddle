// =====================================================
// PREMIUM FOOTER — Huddle Blue slide-up upsell strip
// Triggers: NoticeBoard 'Create', Mesh-Alert slider > 1km/12h,
//           Chat Media click, 3rd Mesh-Alert broadcast
// Brand: premium surfaces use Premium Gold #CFAB21
// =====================================================

import { motion, AnimatePresence } from "framer-motion";
import { Crown, X, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface PremiumFooterProps {
  isOpen: boolean;
  onClose: () => void;
  triggerReason?: string; // "notice_create" | "mesh_alert" | "chat_media" | "3rd_mesh_alert"
}

const TRIGGER_MESSAGES: Record<string, { title: string; body: string }> = {
  notice_create: {
    title: "Notice Board is Premium only",
    body: "Upgrade to post notices, share updates, and connect with your huddle community.",
  },
  mesh_alert: {
    title: "Extended Broadcast needs Premium",
    body: "Free users broadcast within 1 km. Upgrade for up to 5 km mesh alerts.",
  },
  chat_media: {
    title: "Media sharing is a Premium perk",
    body: "Send photos & files in chats. Unlock unlimited media with Premium.",
  },
  "3rd_mesh_alert": {
    title: "Alert limit reached",
    body: "Free users get 2 mesh alerts per day. Upgrade for unlimited emergency broadcasts.",
  },
  default: {
    title: "Unlock the full huddle experience",
    body: "Premium gives you access to all features — starting at just $8.99/month.",
  },
};

// Feature checklist — rendered inside every footer instance
const PREMIUM_FEATURES = [
  "Verified Status",
  "5 km Broadcast Radius",
  "Notice Board Access",
  "Chat Image Access",
  "Priority Visibility",
  "Ad-Free Experience",
];

export const PremiumFooter = ({ isOpen, onClose, triggerReason = "default" }: PremiumFooterProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const msg = TRIGGER_MESSAGES[triggerReason] || TRIGGER_MESSAGES.default;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Semi-transparent backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[1500]"
          />

          {/* Premium Gold slide-up footer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-[var(--nav-height)] left-0 right-0 z-[1600] max-w-md mx-auto"
          >
            <div
              className="rounded-t-2xl p-5 shadow-2xl bg-brandGold"
            >
              {/* Header row: crown + title + close */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-brandText" />
                  <span className="text-sm font-bold text-brandText uppercase tracking-wide">
                    {t("huddle Premium")}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-black/10 transition-colors"
                >
                  <X className="w-5 h-5 text-brandText" />
                </button>
              </div>

              {/* Contextual trigger message */}
              <h3 className="text-lg font-bold text-brandText mb-1">{t(msg.title)}</h3>
              <p className="text-sm text-brandText/90 mb-3">{t(msg.body)}</p>

              {/* Feature checklist — always visible */}
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-4">
                {PREMIUM_FEATURES.map((feature) => (
                  <span key={feature} className="flex items-center gap-1 text-xs text-brandText/90">
                    <Check className="w-3 h-3 text-brandText flex-shrink-0" />
                    {t(feature)}
                  </span>
                ))}
              </div>

              {/* CTA buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigate("/premium");
                    onClose();
                  }}
                  className="flex-1 bg-brandBlue font-bold py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow text-white"
                >
                  {t("Upgrade Now")}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 rounded-xl text-brandText/70 text-sm hover:text-brandText transition-colors"
                >
                  {t("Maybe Later")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
