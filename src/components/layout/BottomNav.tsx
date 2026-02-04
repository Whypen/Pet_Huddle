import { Home, Users, MessageCircle, Stethoscope, MapPin } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, label: "nav.home", path: "/" },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-elevated">
      <div className="flex items-center justify-around h-nav max-w-md mx-auto px-2 pb-safe">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === "/" && location.pathname === "/");
          // Brand hierarchy: Home = green (#A6D539), all others = Huddle Blue (#3283FF)
          const isHomeIcon = item.path === "/";
          const activeColor = isHomeIcon ? "text-[#A6D539]" : "text-[#3283FF]";
          const activeBg = isHomeIcon ? "bg-[#A6D539]/10" : "bg-[#3283FF]/10";

          return (
            <motion.button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-4 rounded-xl transition-colors relative",
                isActive
                  ? activeColor
                  : "text-muted-foreground hover:text-foreground"
              )}
              whileTap={{ scale: 0.9 }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className={cn("absolute inset-0 rounded-xl", activeBg)}
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
