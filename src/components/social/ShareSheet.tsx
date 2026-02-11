import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildSocialShareLinks } from "@/lib/socialShare";
import { toast } from "sonner";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  text: string;
}

export const ShareSheet = ({ open, onClose, url, text }: ShareSheetProps) => {
  const links = buildSocialShareLinks(url, text);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[4000] bg-black/50 flex items-center justify-center px-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-elevated"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-brandText">Share to...</h3>
              <button onClick={onClose}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <a className="flex flex-col items-center gap-1 text-xs text-muted-foreground" href={links.whatsapp} target="_blank" rel="noreferrer">
                <span className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">WA</span>
                WhatsApp
              </a>
              <a className="flex flex-col items-center gap-1 text-xs text-muted-foreground" href={links.facebook} target="_blank" rel="noreferrer">
                <span className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center">FB</span>
                Facebook
              </a>
              <a className="flex flex-col items-center gap-1 text-xs text-muted-foreground" href={links.messenger} target="_blank" rel="noreferrer">
                <span className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center">MS</span>
                Messenger
              </a>
              <a className="flex flex-col items-center gap-1 text-xs text-muted-foreground" href={links.instagram} target="_blank" rel="noreferrer">
                <span className="w-10 h-10 rounded-full bg-pink-500 text-white flex items-center justify-center">IG</span>
                Instagram
              </a>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${text} ${url}`.trim());
                  toast.success("Link copied to clipboard!");
                } catch {
                  toast.error("Failed to copy link");
                }
              }}
            >
              Copy Link
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
