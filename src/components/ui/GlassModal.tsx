/**
 * GlassModal — DESIGN_MASTER_SPEC §3.2 + §3.3
 *
 * Strong-overlay modal (E3 glass surface). Use for critical confirmations,
 * payment flows, KYC, and any top-priority modal action.
 *
 * Usage:
 *   <GlassModal isOpen={open} onClose={() => setOpen(false)} title="Confirm action">
 *     <p>Content here</p>
 *   </GlassModal>
 */

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Max-width class; defaults to "max-w-sm" */
  maxWidth?: string;
  className?: string;
  children: React.ReactNode;
  /** Hide the × close button */
  hideClose?: boolean;
}

export function GlassModal({
  isOpen,
  onClose,
  title,
  maxWidth = "max-w-sm",
  className,
  children,
  hideClose = false,
}: GlassModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — blurred scrim */}
          <motion.div
            key="glass-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[3000] bg-foreground/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal surface — E3 glass */}
          <div className="fixed inset-0 z-[3001] flex items-center justify-center px-4 py-6 pointer-events-none">
            <motion.div
              key="glass-modal-content"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ type: "spring", damping: 26, stiffness: 340 }}
              className={cn(
                "pointer-events-auto mx-auto w-full glass-e3 p-5 max-h-[min(78vh,calc(100svh-120px-env(safe-area-inset-bottom,0px)))] overflow-y-auto",
                maxWidth,
                className,
              )}
            >
              {(title || !hideClose) && (
                <div className="flex items-center justify-between mb-4">
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
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
