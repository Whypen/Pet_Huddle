import { Users, MessageCircle, Stethoscope, MapPin } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Users, label: "nav.social", path: "/social" },
  { icon: MessageCircle, label: "nav.chats", path: "/chats" },
  { icon: Stethoscope, label: "nav.ai_vet", path: "/ai-vet" },
  { icon: MapPin, label: "nav.map", path: "/map" },
];

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <nav className="fixed z-50 left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
      <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md border border-border shadow-elevated rounded-full px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const activeColor = "text-brandBlue";
          const activeBg = "bg-brandBlue/10";

          return (
            <motion.button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-full transition-colors relative min-w-[72px]",
                isActive
                  ? activeColor
                  : "text-muted-foreground hover:text-brandText"
              )}
              whileTap={{ scale: 0.9 }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className={cn("absolute inset-0 rounded-full", activeBg)}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <item.icon className="w-6 h-6 relative z-10" />
              <span className="text-xs font-medium relative z-10">{t(item.label)}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
