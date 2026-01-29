import { motion, AnimatePresence } from "framer-motion";
import { X, User, Settings, Shield, HelpCircle, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { icon: User, label: "Profile", href: "/edit-profile" },
  { icon: Settings, label: "Account Settings", href: "#" },
  { icon: Shield, label: "Privacy Policy", href: "#" },
  { icon: HelpCircle, label: "Help & Support", href: "#" },
];

export const SettingsDrawer = ({ isOpen, onClose }: SettingsDrawerProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

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
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <h2 className="text-xl font-semibold">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
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
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
