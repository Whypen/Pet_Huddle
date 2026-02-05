import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/useApi";
import { useLanguage } from "@/contexts/LanguageContext";
import huddleLogo from "@/assets/huddle-logo.jpg";

interface FounderMessageProps {
  onClose: () => void;
}

export const FounderMessage = ({ onClose }: FounderMessageProps) => {
  const { t } = useLanguage();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { getFounderMessage } = useApi();

  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const result = await getFounderMessage();
        if (result.success && result.data?.message) {
          setMessage(result.data.message);
        } else {
          // Default message if API fails
          setMessage(
            t(
              "Welcome to huddle! 🐾\n\nI built this app because I believe every pet deserves the best care, and every pet parent deserves a supportive community.\n\nWhether you're looking for a trusted pet sitter, seeking advice from Dr. huddle, or just want to connect with fellow animal lovers in your area - we're here for you.\n\nThank you for joining our pack. Together, we're making pet care social.\n\nWith love,\nThe huddle Team"
            )
          );
        }
      } catch (error) {
        console.error("Error fetching founder message:", error);
        setMessage(
          t(
            "Welcome to huddle! 🐾\n\nThank you for joining our community of pet lovers. We're excited to have you here!\n\nExplore, connect, and give your pets the best care possible.\n\nThe huddle Team"
          )
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMessage();
  }, [getFounderMessage]);

  const handleClose = () => {
    localStorage.setItem("founder_message_shown", "true");
    onClose();
  };

  if (loading) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-card rounded-3xl w-full max-w-sm overflow-hidden shadow-elevated"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div className="bg-gradient-to-br from-primary via-primary/90 to-accent p-6 text-center relative">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="w-20 h-20 mx-auto rounded-full bg-white shadow-lg overflow-hidden mb-3">
              <img src={huddleLogo} alt={t("huddle")} className="w-full h-full object-cover" />
            </div>

            <h2 className="text-xl font-bold text-white mb-1 font-huddle">{t("Welcome to huddle")}</h2>
            <p className="text-white/80 text-sm">{t("Family mesh for pets")}</p>
          </div>

          {/* Message content */}
          <div className="p-6">
            <div className="text-sm text-foreground whitespace-pre-line leading-relaxed font-huddle">
              {message}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <Button
              onClick={handleClose}
              className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white"
            >
              <Heart className="w-4 h-4" />
              {t("Let's Get Started")}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FounderMessage;
