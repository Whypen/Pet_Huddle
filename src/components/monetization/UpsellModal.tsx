// =====================================================
// UPSELL MODAL - Smart Revenue Triggers
// =====================================================

import { motion, AnimatePresence } from "framer-motion";
import { X, Star, AlertTriangle, Camera, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const COLOR_MAP = {
  star: {
    bg: "from-amber-400 to-amber-500",
    iconBg: "bg-amber-100 dark:bg-amber-900/20",
    iconColor: "text-amber-600",
  },
  emergency_alert: {
    bg: "from-red-400 to-red-500",
    iconBg: "bg-red-100 dark:bg-red-900/20",
    iconColor: "text-red-600",
  },
  media: {
    bg: "from-blue-400 to-blue-500",
    iconBg: "bg-blue-100 dark:bg-blue-900/20",
    iconColor: "text-blue-600",
  },
  family_slot: {
    bg: "from-green-400 to-green-500",
    iconBg: "bg-green-100 dark:bg-green-900/20",
    iconColor: "text-green-600",
  },
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
  if (!type) return null;

  const Icon = ICON_MAP[type];
  const colors = COLOR_MAP[type];

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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-card border border-border rounded-2xl p-6 z-50 shadow-2xl"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div
                className={`w-16 h-16 rounded-full ${colors.iconBg} flex items-center justify-center`}
              >
                <Icon className={`w-8 h-8 ${colors.iconColor}`} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center mb-2">{title}</h2>

            {/* Description */}
            <p className="text-center text-muted-foreground mb-6">{description}</p>

            {/* Price */}
            <div className="bg-muted/50 rounded-xl p-4 mb-6 text-center">
              <p className="text-sm text-muted-foreground mb-1">One-time purchase</p>
              <p className="text-3xl font-bold">${price.toFixed(2)}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={onClose} variant="outline" className="flex-1">
                Maybe Later
              </Button>
              <Button
                onClick={onBuy}
                className={`flex-1 bg-gradient-to-r ${colors.bg} hover:opacity-90 text-white`}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Buy Now
              </Button>
            </div>

            {/* Premium Upsell (for media type) */}
            {type === "media" && (
              <div className="mt-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-xs text-center text-muted-foreground">
                  💡 <span className="font-semibold">Premium Tip:</span> Get unlimited media
                  uploads + more features for just $8.99/month
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
