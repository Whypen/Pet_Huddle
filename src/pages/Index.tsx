import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Stethoscope, MapPin, Users, MessageCircle, Plus, Lightbulb, Clock, Loader2 } from "lucide-react";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { EmptyPetState } from "@/components/pets/EmptyPetState";
import { PetWizard } from "@/components/pets/PetWizard";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

const quickActions = [
  { icon: Stethoscope, label: "AI Vet", path: "/ai-vet", color: "bg-primary" },
  { icon: MapPin, label: "Map", path: "/map", color: "bg-accent" },
  { icon: Users, label: "Social", path: "/social", color: "bg-primary" },
  { icon: MessageCircle, label: "Chat", path: "/chats", color: "bg-accent" },
];

const wisdomTips: Record<string, string[]> = {
  dog: [
    "Dogs need 1-2 hours of exercise daily. Consider adding an extra evening walk!",
    "Regular brushing helps reduce shedding and keeps your dog's coat healthy.",
    "Mental stimulation is just as important as physical exercise for dogs.",
  ],
  cat: [
    "Cats need fresh water daily. Consider a cat fountain to encourage hydration.",
    "Provide scratching posts to keep your cat's claws healthy and save your furniture.",
    "Cats are crepuscular - most active at dawn and dusk. Plan playtime accordingly!",
  ],
  bird: [
    "Birds need 10-12 hours of sleep. Cover their cage at night for quality rest.",
    "Fresh fruits and vegetables should be part of your bird's daily diet.",
    "Birds are social creatures and need daily interaction and mental stimulation.",
  ],
  exotic: [
    "Research your exotic pet's specific habitat needs for optimal health.",
    "Exotic pets often have unique dietary requirements - consult a specialist vet.",
    "Temperature and humidity control is crucial for most exotic pets.",
  ],
};

const Index = () => {
  const { profile } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPetWizardOpen, setIsPetWizardOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPets();
  }, []);

  const fetchPets = async () => {
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed, weight, weight_unit, dob, photo_url")
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

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      years--;
    }
    return years;
  };

  const getRandomTip = (species: string) => {
    const tips = wisdomTips[species] || wisdomTips.dog;
    return tips[Math.floor(Math.random() * tips.length)];
  };

  const displayName = profile?.display_name || "Friend";
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
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div>
            <motion.h1 
              className="text-2xl font-bold flex items-center gap-2"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Hi, {firstName}! 👋
              <ProfileBadges 
                isVerified={profile?.is_verified} 
                hasCar={profile?.has_car} 
                size="md"
              />
            </motion.h1>
            <p className="text-muted-foreground text-sm">Let's care for your pets</p>
          </div>
        </div>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 rounded-full hover:bg-muted transition-colors"
        >
          <Settings className="w-6 h-6 text-muted-foreground" />
        </button>
      </header>

      {pets.length === 0 ? (
        /* Empty State */
        <section className="px-5 py-8">
          <EmptyPetState onAddPet={() => setIsPetWizardOpen(true)} />
        </section>
      ) : (
        <>
          {/* Pet Selector */}
          <section className="px-5 py-3">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
              {pets.map((pet) => (
                <motion.button
                  key={pet.id}
                  onClick={() => setSelectedPet(pet)}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "relative flex-shrink-0 w-16 h-16 rounded-full overflow-hidden ring-4 transition-all",
                    selectedPet?.id === pet.id
                      ? "ring-primary shadow-soft"
                      : "ring-transparent hover:ring-muted"
                  )}
                >
                  {pet.photo_url ? (
                    <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <span className="text-lg font-bold text-muted-foreground">
                        {pet.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  {selectedPet?.id === pet.id && (
                    <motion.div 
                      layoutId="petHighlight"
                      className="absolute inset-0 bg-primary/20"
                    />
                  )}
                </motion.button>
              ))}
              <button 
                onClick={() => setIsPetWizardOpen(true)}
                className="flex-shrink-0 w-16 h-16 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              >
                <Plus className="w-6 h-6 text-muted-foreground" />
              </button>
            </div>
          </section>

          {/* Selected Pet Card */}
          {selectedPet && (
            <section className="px-5 py-3">
              <motion.div 
                layout
                className="relative rounded-2xl overflow-hidden shadow-card"
              >
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
                    <h2 className="text-2xl font-bold text-primary-foreground">
                      {selectedPet.name}
                      {selectedPet.dob && `, ${calculateAge(selectedPet.dob)} Years Old`}
                    </h2>
                    <div className="flex gap-4 mt-2 text-primary-foreground/80 text-sm flex-wrap">
                      {selectedPet.weight && (
                        <>
                          <span>Weight: {selectedPet.weight}{selectedPet.weight_unit}</span>
                          <span>•</span>
                        </>
                      )}
                      <span className="capitalize">{selectedPet.species}</span>
                      {selectedPet.breed && (
                        <>
                          <span>•</span>
                          <span>{selectedPet.breed}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-4 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-primary-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm font-medium">Next Event: Mid-day Walk, 12:00 PM</span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </section>
          )}

          {/* Huddle Wisdom */}
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
                    <h4 className="font-semibold text-primary-foreground mb-1">Huddle Wisdom</h4>
                    <p className="text-sm text-primary-foreground/90">
                      {getRandomTip(selectedPet.species)}
                    </p>
                  </div>
                </div>
              </motion.div>
            </section>
          )}
        </>
      )}

      {/* Quick Actions */}
      <section className="px-5 py-4 pb-8">
        <div className="flex justify-around">
          {quickActions.map((action, index) => (
            <motion.a
              key={action.label}
              href={action.path}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              whileTap={{ scale: 0.9 }}
              className="flex flex-col items-center gap-2"
            >
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center shadow-card",
                action.color
              )}>
                <action.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{action.label}</span>
            </motion.a>
          ))}
        </div>
      </section>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PetWizard 
        isOpen={isPetWizardOpen} 
        onClose={() => setIsPetWizardOpen(false)} 
        onComplete={fetchPets}
      />
    </div>
  );
};

export default Index;
