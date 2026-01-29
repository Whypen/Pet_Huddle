import { motion } from "framer-motion";
import { User, Crown, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import huddleLogo from "@/assets/huddle-logo.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface GlobalHeaderProps {
  onUpgradeClick?: () => void;
}

export const GlobalHeader = ({ onUpgradeClick }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const isPremium = profile?.user_role === 'premium';

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3 max-w-md mx-auto">
        {/* User Icon & Status */}
        <button 
          onClick={() => navigate('/edit-profile')}
          className="flex items-center gap-2"
        >
          <div className="relative">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt="Profile" 
                className="w-9 h-9 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center ring-2 ring-border">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            {isPremium && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 flex items-center justify-center">
                <Crown className="w-2.5 h-2.5 text-amber-900" />
              </div>
            )}
          </div>
          <div className="text-left">
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              isPremium 
                ? "bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800"
                : "bg-muted text-muted-foreground"
            )}>
              {isPremium ? "Premium" : "Free"}
            </span>
          </div>
        </button>

        {/* Centered Logo */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <img 
            src={huddleLogo} 
            alt="Huddle" 
            className="h-8 w-auto object-contain"
          />
        </div>

        {/* Upgrade Button (only for free users) */}
        {!isPremium && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onUpgradeClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-amber-900 text-xs font-semibold shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Upgrade
          </motion.button>
        )}

        {/* Spacer for premium users to balance layout */}
        {isPremium && <div className="w-20" />}
      </div>
    </header>
  );
};
