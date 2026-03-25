import { AnimatePresence, motion } from "framer-motion";
import { Copy, Send, X } from "lucide-react";
import { NeuButton } from "@/components/ui/NeuButton";
import { buildSocialShareLinks } from "@/lib/socialShare";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  onShareAction?: () => void;
}

export const ShareSheet = ({ open, onClose, url, title, description, imageUrl, onShareAction }: ShareSheetProps) => {
  const navigate = useNavigate();
  const links = buildSocialShareLinks(url);
  const payloadText = url.trim();

  const handleSystemShare = async () => {
    if (!navigator.share) return false;
    try {
      const basePayload: ShareData = {
        title: title || "Huddle",
        url,
      };

      if (imageUrl && typeof navigator.canShare === "function" && typeof File !== "undefined") {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const blob = await response.blob();
            const ext = blob.type.split("/")[1] || "jpg";
            const file = new File([blob], `huddle-share.${ext}`, { type: blob.type || "image/jpeg" });
            const filePayload: ShareData = { ...basePayload, files: [file] };
            if (navigator.canShare(filePayload)) {
              await navigator.share(filePayload);
              toast.success("Shared");
              return true;
            }
          }
        } catch {
          // Fall back to URL-only sharing if file fetch fails.
        }
      }

      await navigator.share(basePayload);
      toast.success("Shared");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info("Share canceled");
        return true;
      }
      toast.error("Unable to share right now");
      return true;
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(payloadText);
      toast.success("Link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[4000] bg-black/50 flex items-center justify-center px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl p-4 max-w-[420px] w-full shadow-elevated"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-brandText">Share</h3>
              <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <a className="neu-rest rounded-xl p-3 text-center text-xs" href={links.whatsapp} target="_blank" rel="noreferrer" onClick={onShareAction}>
                WhatsApp
              </a>
              <a className="neu-rest rounded-xl p-3 text-center text-xs" href={links.facebook} target="_blank" rel="noreferrer" onClick={onShareAction}>
                Facebook
              </a>
              <a className="neu-rest rounded-xl p-3 text-center text-xs" href={links.threads} target="_blank" rel="noreferrer" onClick={onShareAction}>
                Threads
              </a>
              <a className="neu-rest rounded-xl p-3 text-center text-xs" href={links.instagram} target="_blank" rel="noreferrer" onClick={onShareAction}>
                Instagram
              </a>
              <button
                type="button"
                className="neu-rest rounded-xl p-3 text-center text-xs"
                onClick={() => {
                  onShareAction?.();
                  navigate(`/chats?shareUrl=${encodeURIComponent(url)}`);
                  onClose();
                }}
              >
                Huddle Chats
              </button>
              <button
                type="button"
                className="neu-rest rounded-xl p-3 text-center text-xs"
                onClick={() => {
                  onShareAction?.();
                  void copyLink();
                }}
              >
                Copy Link
              </button>
            </div>

            <NeuButton
              variant="secondary"
              className="w-full"
              onClick={async () => {
                onShareAction?.();
                const usedSystem = await handleSystemShare();
                if (!usedSystem) {
                  await copyLink();
                }
                onClose();
              }}
            >
              <Send className="w-4 h-4" />
              Share
            </NeuButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
