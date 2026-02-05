import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Settings, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import huddleLogo from "@/assets/huddle-logo.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GlobalHeaderProps {
  onUpgradeClick?: () => void;
  onMenuClick?: () => void;
}

interface Pet {
  id: string;
  name: string;
  photo_url: string | null;
  species: string;
}

export const GlobalHeader = ({ onUpgradeClick, onMenuClick }: GlobalHeaderProps) => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const [pets, setPets] = useState<Pet[]>([]);

  const isPremium = profile?.tier === "premium" || profile?.tier === "gold";

  // Fetch user's pets
  useEffect(() => {
    if (user) {
      fetchPets();
    }
  }, [user]);

  const fetchPets = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, photo_url, species")
        .eq("owner_id", user.id)
        .eq("is_active", true)
        .limit(1);

      if (!error && data) {
        setPets(data);
      }
    } catch (err) {
      console.error("Error fetching pets:", err);
    }
  };

  const handleLogoClick = () => {
    navigate('/');
  };

  const handlePetClick = () => {
    if (pets.length > 0) {
      navigate(`/edit-pet-profile?id=${pets[0].id}`);
    } else {
      navigate('/edit-pet-profile');
    }
  };

  const hasPets = pets.length > 0;
  const firstPet = pets[0];

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3 max-w-md mx-auto">
        {/* Left: Notifications */}
        <button
          className="p-2 rounded-full hover:bg-muted transition-colors relative"
          aria-label={t("Notifications")}
          onClick={() => toast.info(t("Notifications coming soon"))}
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {/* Notification dot */}
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
        </button>

        {/* Centered Logo with Brand Name - Clickable to Dashboard */}
        <button
          onClick={handleLogoClick}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <img
            src={huddleLogo}
            alt={t("huddle")}
            className="h-8 w-8 object-cover rounded-lg"
          />
          <div className="hidden sm:flex flex-col">
            <span className="text-base font-bold lowercase leading-tight font-huddle">{t("huddle")}</span>
          </div>
        </button>

        {/* Right: Settings (Gear) Icon Only */}
        <button
          onClick={onMenuClick || (() => navigate('/settings'))}
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label={t("Settings")}
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
};
