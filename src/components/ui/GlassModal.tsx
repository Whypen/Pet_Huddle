// GlassModal — E3 active modal (DESIGN_MASTER_SPEC §1.1 Level 3)
// ONLY use for: critical confirmations, payment modals, KYC, high-priority dialogs

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassModalProps {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  showClose?: boolean;
  title?: string;
}

export const GlassModal = ({ open, onClose, children, className, showClose = true, title }: GlassModalProps) => {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 -[2px] z-50"
            aria-hidden="true"
          />

          {/* Modal — 300ms entrance per spec §11.2 */}
          <motion.div
            key="modal-content"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "fixed inset-x-4 top-1/2 -translate-y-1/2 z-50",
              "max-w-sm mx-auto",
              "glass-e3",
              "p-6",
              className,
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "glass-modal-title" : undefined}
          >
            {showClose && onClose && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-brandText/60" strokeWidth={1.75} />
              </button>
            )}
            {title && (
              <h2 id="glass-modal-title" className="font-display text-h2 font-semibold text-brandText mb-4 pr-8">
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
