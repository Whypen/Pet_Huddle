import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Lightbulb, Clock, Loader2, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { EmptyPetState } from "@/components/pets/EmptyPetState";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { computeAgeYears, computeNextEvent, formatNextEventLabel, type PetReminder } from "@/utils/petLogic";

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  weight: number | null;
  weight_unit: string;
  dob: string | null;
  photo_url: string | null;
}

// SPRINT 2: Species-specific huddle Wisdom tips
const wisdomTips: Record<string, string[]> = {
  Dog: [
    "home.wisdom.dog.1",
    "home.wisdom.dog.2",
    "home.wisdom.dog.3",
    "home.wisdom.dog.4",
  ],
  Cat: [
    "home.wisdom.cat.1",
    "home.wisdom.cat.2",
    "home.wisdom.cat.3",
    "home.wisdom.cat.4",
  ],
  Bird: [
    "home.wisdom.bird.1",
    "home.wisdom.bird.2",
    "home.wisdom.bird.3",
    "home.wisdom.bird.4",
  ],
  Rabbit: [
    "home.wisdom.rabbit.1",
    "home.wisdom.rabbit.2",
    "home.wisdom.rabbit.3",
    "home.wisdom.rabbit.4",
  ],
  Reptile: [
    "home.wisdom.reptile.1",
    "home.wisdom.reptile.2",
    "home.wisdom.reptile.3",
    "home.wisdom.reptile.4",
  ],
  Hamster: [
    "home.wisdom.hamster.1",
    "home.wisdom.hamster.2",
    "home.wisdom.hamster.3",
    "home.wisdom.hamster.4",
  ],
  Others: [
    "home.wisdom.other.1",
    "home.wisdom.other.2",
    "home.wisdom.other.3",
    "home.wisdom.other.4",
  ],
};

const Index = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { t } = useLanguage();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nextEventLabel, setNextEventLabel] = useState<string>("—");

  useEffect(() => {
    if (user?.id) {
      fetchPets();
    }
  }, [user?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("pets-home-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pets" },
        () => {
          fetchPets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPets = async () => {
    try {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed, weight, weight_unit, dob, photo_url")
        .eq("owner_id", user?.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (error) throw error;

      setPets(data || []);
      if (data && data.length > 0) {
        setSelectedPet(data[0]);
      }
    } catch (error) {
      console.error("Error fetching pets:", error);
    } finally {
      setLoading(false);
    }
  };

  // UAT: Next Event must pull from Supabase reminders table.
  useEffect(() => {
    (async () => {
      if (!user?.id || !selectedPet?.id) {
        setNextEventLabel("—");
        return;
      }
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        const res = await (supabase as any)
          .from("reminders")
          .select("id,pet_id,due_date,kind,reason")
          .eq("owner_id", user.id)
          .eq("pet_id", selectedPet.id)
          .gte("due_date", todayISO)
          .order("due_date", { ascending: true })
          .limit(50);
        if (res.error) throw res.error;
        const reminders = (res.data ?? []) as PetReminder[];
        const ev = computeNextEvent(selectedPet.dob, reminders);
        setNextEventLabel(formatNextEventLabel(ev));
      } catch (e) {
        // If table isn't present yet on a dev instance, keep UI stable.
        console.warn("[Index] failed to load reminders", e);
        setNextEventLabel("—");
      }
    })();
  }, [selectedPet?.dob, selectedPet?.id, user?.id]);

  // SPRINT 2: Case-insensitive species matching for wisdom tips
  const getRandomTip = (species: string) => {
    const normalizedSpecies = species.charAt(0).toUpperCase() + species.slice(1).toLowerCase();
    const tips = wisdomTips[normalizedSpecies] || wisdomTips.Others || wisdomTips.Dog;
    return tips[Math.floor(Math.random() * tips.length)];
  };

  const displayName = profile?.display_name || t("Friend");
  const firstName = displayName.split(" ")[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />
      
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div>
            <motion.h1 
              className="text-2xl font-bold flex items-center gap-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {t("home.greeting").replace("{name}", firstName)}
              <ProfileBadges 
                isVerified={profile?.is_verified} 
                hasCar={profile?.has_car} 
                size="md"
              />
            </motion.h1>
            <p className="text-muted-foreground text-sm">{t("home.subtitle")}</p>
          </div>
        </div>
      </header>

      {pets.length === 0 ? (
        /* Empty State */
        <section className="px-5 py-8">
          <EmptyPetState onAddPet={() => navigate("/edit-pet-profile")} />
        </section>
      ) : (
        <>
          {/* Pet Selector - Fixed border cropping */}
          <section className="px-5 py-3">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 overflow-visible">
              {pets.map((pet) => (
                <motion.button
                  key={pet.id}
                  onClick={() => {
                    setSelectedPet(pet);
                  }}
                  whileTap={{ scale: 0.95 }}
                  className="relative flex-shrink-0 p-1" // Added padding to prevent border clipping
                >
                  <div className={cn(
                    "w-16 h-16 rounded-full overflow-hidden ring-4 transition-all",
                    selectedPet?.id === pet.id
                      ? "ring-primary shadow-soft"
                      : "ring-transparent hover:ring-muted"
                  )}>
                    {pet.photo_url ? (
                      <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <span className="text-lg font-bold text-muted-foreground">
                          {pet.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  {selectedPet?.id === pet.id && (
                    <motion.div 
                      layoutId="petHighlight"
                      className="absolute inset-1 rounded-full bg-primary/20 pointer-events-none"
                    />
                  )}
                </motion.button>
              ))}
              <button 
                onClick={() => navigate("/edit-pet-profile")}
                className="flex-shrink-0 w-16 h-16 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors ml-1"
              >
                <Plus className="w-6 h-6 text-muted-foreground" />
              </button>
            </div>
          </section>

          {/* Selected Pet Card - SPRINT 3: Card navigates to Expanded Info */}
          {selectedPet && (
            <section className="px-5 py-3">
              <motion.div
                layout
                onClick={() => navigate(`/pet-details?id=${selectedPet.id}`)}
                className="relative rounded-2xl overflow-hidden shadow-card cursor-pointer hover:shadow-lg transition-shadow"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/edit-pet-profile?id=${selectedPet.id}`);
                  }}
                  className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-sm"
                  aria-label={t("Edit Pet")}
                >
                  <Settings className="w-4 h-4 text-muted-foreground" />
                </button>
                <div className="absolute inset-0">
                  {selectedPet.photo_url ? (
                    <img
                      src={selectedPet.photo_url}
                      alt={selectedPet.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent" />
                </div>
                <div className="relative p-5 pt-24">
                  <motion.div
                    key={selectedPet.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="text-left">
                      {/*
                        UAT: show age as computed, no duplicated per-page math.
                        Keep existing label format.
                      */}
                      <h2 className="text-2xl font-bold text-primary-foreground">
                        {selectedPet.name}
                        {selectedPet.dob && `, ${computeAgeYears(selectedPet.dob)} Years Old`}
                      </h2>
                    </div>
                    <div className="flex gap-4 mt-2 text-primary-foreground/80 text-sm flex-wrap">
                      {selectedPet.weight && (
                        <>
                          <span>{t("Weight")}: {selectedPet.weight}{selectedPet.weight_unit}</span>
                <span>{t("•")}</span>
                        </>
                      )}
                      <span className="capitalize">{selectedPet.species}</span>
                      {selectedPet.breed && (
                        <>
                <span>{t("•")}</span>
                          <span>{selectedPet.breed}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-4 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-primary-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          {t("home.next_event")}: {nextEventLabel}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </section>
          )}

          {/* huddle Wisdom */}
          {selectedPet && (
            <section className="px-5 py-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-5 shadow-card"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-primary-foreground mb-1">{t("home.wisdom")}</h4>
                    <p className="text-sm text-primary-foreground/90">
                      {t(getRandomTip(selectedPet.species))}
                    </p>
                  </div>
                </div>
              </motion.div>
            </section>
          )}
        </>
      )}

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default Index;
