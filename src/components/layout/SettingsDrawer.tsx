import { motion, AnimatePresence } from "framer-motion";
import { X, User, Settings, Shield, HelpCircle, LogOut, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDrawer = ({ isOpen, onClose }: SettingsDrawerProps) => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const { t } = useLanguage();

  const isVerified = profile?.is_verified;
  const isPremium = profile?.tier === "premium" || profile?.tier === "gold";

  const menuItems = [
    { icon: User, label: t("settings.profile"), href: "/edit-profile" },
    { icon: Settings, label: t("settings.title"), href: "/settings" },
    { icon: Crown, label: t("premium.title"), href: "/subscription" },
    { icon: Shield, label: t("settings.privacy_policy"), href: "#privacy" },
    { icon: HelpCircle, label: t("settings.help_support"), href: "#" },
  ];

  const handleMenuClick = (href: string) => {
    if (href === "#privacy") {
      onClose();
      navigate("/settings");
    } else if (href !== "#") {
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
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {profile?.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={t("Profile")}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center",
                        isVerified ? "bg-primary" : "bg-muted"
                      )}
                    >
                      {isVerified ? (
                        <Crown className="w-3 h-3 text-white" />
                      ) : (
                        <Shield className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold">{profile?.display_name || t("User")}</p>
                    <p className="text-xs text-muted-foreground">
                      {isVerified ? t("settings.verified_badge") : t("settings.pending")}
                    </p>
                    <span
                      className={cn(
                        "inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full",
                        isPremium
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isPremium ? t("header.premium") : t("header.free")}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Menu Items */}
              <div className="flex-1 py-4">
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
              
              {/* Version Footer */}
              <div className="px-6 pb-4 text-center">
                <span className="text-xs text-muted-foreground">{t("v1.0.0 (2026)")}</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
