// =====================================================
// PREMIUM FOOTER — Blue slide-up upsell strip
// Triggers: NoticeBoard 'Create', Mesh-Alert slider > 1km/12h,
//           Chat Media click, 3rd Mesh-Alert broadcast
// =====================================================

import { motion, AnimatePresence } from "framer-motion";
import { Crown, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PremiumFooterProps {
  isOpen: boolean;
  onClose: () => void;
  triggerReason?: string; // e.g. "notice_create" | "mesh_alert" | "chat_media" | "3rd_mesh_alert"
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

export const PremiumFooter = ({ isOpen, onClose, triggerReason = "default" }: PremiumFooterProps) => {
  const navigate = useNavigate();
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

          {/* Blue slide-up footer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-[1600] max-w-md mx-auto"
          >
            <div
              className="rounded-t-2xl p-5 shadow-2xl"
              style={{ backgroundColor: "#7DD3FC" }}
            >
              {/* Close button */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-white" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    huddle Premium
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* Message */}
              <h3 className="text-lg font-bold text-white mb-1">{msg.title}</h3>
              <p className="text-sm text-white/90 mb-4">{msg.body}</p>

              {/* CTA Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigate("/premium");
                    onClose();
                  }}
                  className="flex-1 bg-white text-[#0284C7] font-bold py-3 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow"
                >
                  Upgrade Now
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 rounded-xl text-white/80 text-sm hover:text-white transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
