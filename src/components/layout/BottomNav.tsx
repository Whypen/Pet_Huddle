import { PawPrint, Users, MessageCircle, Stethoscope, MapPin } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: PawPrint, label: "Pet", path: "/" },
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border/30 shadow-elevated">
      <div className="flex items-center justify-around h-nav max-w-md mx-auto px-2 pb-safe">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);

          return (
            <motion.button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] py-1.5 px-3 rounded-xl transition-colors relative",
                isActive
                  ? "text-brandBlue"
                  : "text-brandText/40 hover:text-brandText/60"
              )}
              whileTap={{ scale: 0.92 }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 rounded-xl bg-brandBlue/8"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <item.icon className={cn("w-5 h-5 relative z-10", isActive ? "stroke-[2]" : "stroke-[1.75]")} />
              <span className="text-[10px] font-medium relative z-10 leading-tight">
                {item.label === "Pet" ? t("Pet") : t(item.label)}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
