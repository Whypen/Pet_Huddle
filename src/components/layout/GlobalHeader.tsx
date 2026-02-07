import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import huddleLogo from "@/assets/huddle-logo-transparent.png";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
  const { user } = useAuth();
  const { t } = useLanguage();
  const [pets, setPets] = useState<Pet[]>([]);

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
      <div className="flex items-center justify-between px-4 max-w-md mx-auto h-12">
        {/* Left brand wordmark (UAT: fontSize 24 bold) */}
        <button
          onClick={handleLogoClick}
          className="text-brandText font-bold lowercase text-[24px] leading-none"
          aria-label={t("huddle")}
        >
          {t("huddle")}
        </button>

        {/* Centered Logo */}
        <button
          onClick={handleLogoClick}
          className="absolute left-1/2 -translate-x-1/2 hover:opacity-80 transition-opacity"
        >
          <img
            src={huddleLogo}
            alt={t("huddle")}
            className="h-8 w-8 object-contain"
          />
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
