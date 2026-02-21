// GlassSheet — E2 glass bottom sheet (DESIGN_MASTER_SPEC §1.1 Level 2)
// ONLY use for: bottom sheets, broadcast composer, comment composer, cart overlay
// NOT for: page backgrounds, headers, nav, content cards

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassSheetProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  /** Apply glass-scrim safeguard when sheet is over media/maps */
  overMedia?: boolean;
}

export const GlassSheet = ({ open, onClose, children, className, overMedia = false }: GlassSheetProps) => {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
            aria-hidden="true"
          />

          {/* Sheet — slides up 240ms per spec §11.2 */}
          <motion.div
            key="sheet"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "fixed bottom-0 inset-x-0 z-50 max-w-md mx-auto",
              "glass-e2",
              "rounded-t-glass pb-safe",
              overMedia && "glass-scrim",
              className,
            )}
            role="dialog"
            aria-modal="true"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 bg-gray-300/60 rounded-full" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
