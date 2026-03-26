/**
 * GlassSheet — DESIGN_MASTER_SPEC §3.2 + §3.3
 *
 * E2 glass bottom-sheet / drawer. Use for: filter sheets, action pickers,
 * media viewers, non-critical confirmations.
 *
 * Usage:
 *   <GlassSheet isOpen={open} onClose={() => setOpen(false)} title="Filters">
 *     <FilterContent />
 *   </GlassSheet>
 */

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Additional class on the backdrop */
  backdropClassName?: string;
  /** Additional class on the sheet panel */
  className?: string;
  /** Additional class on the internal body container */
  contentClassName?: string;
  children: React.ReactNode;
  /** Hide the × close button */
  hideClose?: boolean;
}

export function GlassSheet({
  isOpen,
  onClose,
  title,
  backdropClassName,
  className,
  contentClassName,
  children,
  hideClose = false,
}: GlassSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="glass-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className={cn("fixed inset-0 z-[4200] bg-foreground/20 backdrop-blur-sm", backdropClassName)}
            onClick={onClose}
          />

          {/* Sheet — slides up from bottom, E2 glass */}
          <motion.div
            key="glass-sheet-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className={cn(
              "fixed left-0 right-0 z-[4210] mx-auto w-full max-w-[var(--app-max-width,430px)] glass-e2",
              "rounded-t-[20px] p-5 pb-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+18px)] max-h-[calc(100vh-env(safe-area-inset-bottom)-8px)]",
              "flex flex-col",
              className,
            )}
            style={{ bottom: "0px" }}
          >
            {/* Drag handle */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-brandText/20" />

            {(title || !hideClose) && (
              <div className="flex items-center justify-between mt-2 mb-4">
                {title && (
                  <h2 className="text-base font-bold text-brandText">{title}</h2>
                )}
                {!hideClose && (
                  <button
                    onClick={onClose}
                    className="ml-auto p-1 rounded-full hover:bg-black/5 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4 text-brandText/60" />
                  </button>
                )}
              </div>
            )}
            <div className={cn("min-h-0 flex-1 overflow-y-auto pr-1", contentClassName)}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
