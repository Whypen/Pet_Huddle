// =====================================================
// PLUS/GOLD FOOTER — slide-up upsell strip (Plus / Gold)
// Triggers: NoticeBoard 'Create', broadcast slider, chat media
// DESIGN_MASTER_SPEC §E2: glass bottom sheet
// MASTER_SPEC §2.5: "Plus" / "Gold" naming only
// =====================================================

import { AnimatePresence, motion } from "framer-motion";
import { Check, Diamond, Star, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { plusTabRoute } from "@/lib/routes";
import { useLanguage } from "@/contexts/LanguageContext";

interface PlusFooterProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which tier to upsell: "plus" | "gold". Defaults to "plus". */
  tier?: "plus" | "gold";
  triggerReason?: string;
}

const PLUS_MESSAGES: Record<string, { title: string; body: string }> = {
  notice_create: {
    title: "Posting is a Plus perk",
    body: "Unlock Plus to share updates and connect with your community.",
  },
  broadcast_alert: {
    title: "Broadcast slots are full",
    body: "Remove an active pin or unlock Plus for expanded reach.",
  },
  chat_media: {
    title: "Media sharing needs Plus",
    body: "Send photos in chats — included with Plus.",
  },
  default: {
    title: "More with Plus",
    body: "Unlock verified status, extended broadcasts, and priority visibility.",
  },
};

const GOLD_MESSAGES: Record<string, { title: string; body: string }> = {
  broadcast_alert: {
    title: "Broadcast slots are full",
    body: "Remove an active pin or unlock Gold for maximum reach.",
  },
  default: {
    title: "Go further with Gold",
    body: "Maximum broadcast range, unlimited swipes, and exclusive Gold status.",
  },
};

const PLUS_FEATURES = [
  "Verified Status",
  "Extended Broadcast Range",
  "Longer Duration",
  "Priority Visibility",
  "Ad-Free Experience",
];

const GOLD_FEATURES = [
  "Maximum Broadcast Range",
  "Unlimited Swipes",
  "Gold Status Badge",
  "Priority Support",
  "Exclusive Filters",
];

export const PlusFooter = ({
  isOpen,
  onClose,
  tier = "plus",
  triggerReason = "default",
}: PlusFooterProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const messages = tier === "gold" ? GOLD_MESSAGES : PLUS_MESSAGES;
  const msg = messages[triggerReason] || messages.default;
  const features = tier === "gold" ? GOLD_FEATURES : PLUS_FEATURES;
  const tierLabel = tier === "gold" ? "Gold" : "Plus";
  const Icon = tier === "gold" ? Star : Diamond;
  const headerBg = tier === "gold" ? "bg-brandGold" : "bg-brandBlue";
  const headerText = tier === "gold" ? "text-brandText" : "text-white";
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
            className="fixed inset-0 bg-black/30 z-40"
          />

          {/* Glass slide-up footer (E2 surface) */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-[var(--nav-height)] left-0 right-0 z-50 max-w-md mx-auto"
          >
            <div className={`${headerBg} rounded-t-[20px] p-5 shadow-e3`}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${headerText}`} />
                  <span className={`text-sub font-semibold ${headerText} uppercase tracking-wide`}>
                    {t(`Unlock ${tierLabel}`)}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-black/10 transition-colors"
                  aria-label="Not now"
                >
                  <X className={`w-5 h-5 ${headerText}`} />
                </button>
              </div>

              {/* Contextual message */}
              <h3 className={`text-h3 font-semibold ${headerText} mb-1`}>{t(msg.title)}</h3>
              <p className={`text-sub ${headerText}/80 mb-3`}>{t(msg.body)}</p>

              {/* Feature checklist */}
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-4">
                {features.map((feature) => (
                  <span key={feature} className={`flex items-center gap-1 text-helper ${headerText}/90`}>
                    <Check className={`w-3 h-3 ${headerText} flex-shrink-0`} />
                    {t(feature)}
                  </span>
                ))}
              </div>

              {/* CTAs */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigate(plusTabRoute(tabParam));
                    onClose();
                  }}
                  className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 font-semibold py-3 rounded-btn text-sub transition-colors text-white"
                >
                  {t(`Unlock ${tierLabel}`)}
                </button>
                <button
                  onClick={onClose}
                  className={`px-4 py-3 rounded-btn text-sub transition-colors ${headerText}/70`}
                >
                  {t("Not now")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
