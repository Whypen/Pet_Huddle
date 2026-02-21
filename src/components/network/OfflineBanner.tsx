import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, CloudOff, Check } from "lucide-react";
import { useNetwork } from "@/contexts/NetworkContext";
import { cn } from "@/lib/utils";

export const OfflineBanner = () => {
  const { isOnline, isServerReachable, retryConnection, pendingActions } = useNetwork();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [recentlyRestored, setRecentlyRestored] = useState(false);

  // Show banner when offline or server unreachable
  useEffect(() => {
    if (!isOnline || !isServerReachable) {
      setShowBanner(true);
      setRecentlyRestored(false);
    } else if (showBanner) {
      // Show "restored" message briefly before hiding
      setRecentlyRestored(true);
      const timer = setTimeout(() => {
        setShowBanner(false);
        setRecentlyRestored(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isServerReachable, showBanner]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await retryConnection();
    setIsRetrying(false);
  };

  const getBannerContent = () => {
    if (recentlyRestored) {
      return {
        icon: <Check className="w-4 h-4" />,
        message: "Connection restored",
        bgColor: "bg-[#A6D539]",
        textColor: "text-white",
      };
    }

    if (!isOnline) {
      return {
        icon: <WifiOff className="w-4 h-4" />,
        message: "You're offline",
        bgColor: "bg-yellow-500",
        textColor: "text-yellow-1000",
      };
    }

    if (!isServerReachable) {
      return {
        icon: <CloudOff className="w-4 h-4" />,
        message: "Maintenance mode",
        bgColor: "bg-orange-500",
        textColor: "text-orange-900",
      };
    }

    return null;
  };

  const content = getBannerContent();

  if (!showBanner || !content) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 px-4 py-2 flex items-center justify-center gap-3",
          content.bgColor,
          content.textColor
        )}
      >
        <div className="flex items-center gap-2">
          {content.icon}
          <span className="text-sm font-medium">{content.message}</span>
          {pendingActions.length > 0 && !recentlyRestored && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
              {pendingActions.length} pending
            </span>
          )}
        </div>

        {!recentlyRestored && (
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              "bg-white/20 hover:bg-white/30 transition-colors",
              isRetrying && "opacity-50 cursor-not-allowed"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", isRetrying && "animate-spin")} />
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default OfflineBanner;
