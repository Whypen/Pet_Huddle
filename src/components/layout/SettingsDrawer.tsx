import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Settings, LogOut, Crown, Bug, FileText, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getRemainingStarsFromSnapshot } from "@/lib/starQuota";
import { SettingsProfileSummary } from "@/components/layout/SettingsProfileSummary";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDrawer = ({ isOpen, onClose }: SettingsDrawerProps) => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { t } = useLanguage();
  const [starsRemaining, setStarsRemaining] = useState<number | null>(null);

  const isVerified = profile?.is_verified === true;

  useEffect(() => {
    if (!isOpen || !profile?.id) return;
    let cancelled = false;
    const loadStars = async () => {
      const snapshot = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: { message?: string } | null }>)("get_quota_snapshot");
      if (snapshot.error) {
        if (!cancelled) setStarsRemaining(0);
        return;
      }
      const row = Array.isArray(snapshot.data) ? snapshot.data[0] : snapshot.data;
      const typed = (row || {}) as { tier?: string; stars_used_cycle?: number; extra_stars?: number };
      const nextRemaining = getRemainingStarsFromSnapshot(profile?.tier, typed);
      if (!cancelled) setStarsRemaining(nextRemaining);
    };
    void loadStars();
    return () => {
      cancelled = true;
    };
  }, [isOpen, profile?.id, profile?.tier]);

  const menuItems = [
    { icon: User, label: t("settings.profile"), href: "/edit-profile" },
    { icon: Settings, label: t("settings.title"), href: "/settings" },
    { icon: Crown, label: t("premium.title"), href: "/premium" },
    { icon: FileText, label: t("Privacy & Safety Policy"), href: "/privacy" },
    { icon: Scale, label: t("settings.terms"), href: "/terms" },
  ];

  const handleMenuClick = (href: string) => {
    if (href !== "#") {
      onClose();
      navigate(href);
    }
  };

  const handleLogout = async () => {
    await signOut();
    onClose();
    navigate("/auth");
  };

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
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50"
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-card z-50 shadow-elevated"
          >
            <div className="flex flex-col h-full">
              {/* Header with User Info */}
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{t("settings.title")}</h2>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-muted transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* User Summary */}
                <SettingsProfileSummary
                  displayName={profile?.display_name || t("User")}
                  avatarUrl={profile?.avatar_url || null}
                  isVerified={isVerified}
                  tierValue={String(profile?.effective_tier || profile?.tier || "free")}
                  starsLabel={String(Math.max(0, Number(starsRemaining || 0)))}
                  onStarsClick={() => {
                    onClose();
                    navigate("/premium");
                  }}
                />
              </div>
              
              {/* Menu Items */}
              <div className="flex-1 py-4 overflow-y-auto scrollbar-visible">
                {menuItems.map((item, index) => (
                  <motion.button
                    key={item.label}
                    onClick={() => handleMenuClick(item.href)}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex items-center gap-4 px-6 py-4 w-full hover:bg-muted transition-colors text-left"
                    )}
                  >
                    <item.icon className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">{item.label}</span>
                  </motion.button>
                ))}
              </div>
              
              {/* Logout */}
              <div className="p-4 border-t border-border">
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-4 px-6 py-4 w-full rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">{t("settings.logout")}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
