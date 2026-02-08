import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UpsellBannerState = {
  open: boolean;
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export function UpsellBanner({ state, onClose }: { state: UpsellBannerState; onClose: () => void }) {
  return (
    <AnimatePresence>
      {state.open ? (
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.98 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className={cn(
            "fixed left-1/2 -translate-x-1/2 z-[9999] w-[calc(min(28rem,100%-1rem))]",
            // place above BottomNav (h-nav ~64px + safe padding)
            "bottom-[84px]"
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-brandGold bg-white/95 backdrop-blur-md px-4 py-3 shadow-elevated">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-brandGold/15 text-brandGold">
              <Sparkles className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-brandText">Upgrade for more!</div>
              <div className="text-xs text-brandText/80 mt-0.5 break-words">{state.message}</div>
              {state.ctaLabel && state.onCta ? (
                <div className="mt-2">
                  <Button
                    onClick={state.onCta}
                    className="h-9 rounded-xl bg-brandBlue text-white hover:bg-brandBlue/90"
                  >
                    {state.ctaLabel}
                  </Button>
                </div>
              ) : null}
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-2 text-brandText/70 hover:bg-brandText/5"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

