import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, Star, SlidersHorizontal, HandMetal } from "lucide-react";
import sarahBella from "@/assets/users/sarah-bella.jpg";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { FilterSheet, FilterState, defaultFilters } from "@/components/social/FilterSheet";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { ActiveFilters } from "@/components/social/ActiveFilters";
import { NoticeBoard } from "@/components/social/NoticeBoard";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const nearbyUsers = [
  { id: 1, name: "Marcus", location: "Central Park", isVerified: true, hasCar: false },
  { id: 2, name: "Emma", location: "Dog Run", isVerified: false, hasCar: true },
  { id: 3, name: "James", location: "Pet Cafe", isVerified: true, hasCar: true },
];

const Social = () => {
  const { profile } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [cardPosition, setCardPosition] = useState({ x: 0, y: 0, rotate: 0 });
  const [showCard, setShowCard] = useState(true);

  const isPremium = profile?.user_role === 'premium';

  const handleSwipe = (direction: "left" | "right") => {
    const xMove = direction === "right" ? 500 : -500;
    setCardPosition({ x: xMove, y: 0, rotate: direction === "right" ? 20 : -20 });
    setTimeout(() => {
      setShowCard(false);
      setTimeout(() => {
        setCardPosition({ x: 0, y: 0, rotate: 0 });
        setShowCard(true);
      }, 300);
    }, 200);
  };

  const handleApplyFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const handleRemoveFilter = (key: keyof FilterState, value?: string) => {
    if (key === "species" && value) {
      setFilters(prev => ({
        ...prev,
        species: prev.species.filter(s => s !== value)
      }));
    } else if (key === "role") {
      setFilters(prev => ({ ...prev, role: defaultFilters.role }));
    } else if (key === "distance") {
      setFilters(prev => ({ ...prev, distance: defaultFilters.distance }));
    } else if (key === "ageRange") {
      setFilters(prev => ({ ...prev, ageRange: defaultFilters.ageRange }));
    } else if (key === "gender") {
      setFilters(prev => ({ ...prev, gender: "" }));
    } else if (key === "petHeight") {
      setFilters(prev => ({ ...prev, petHeight: "" }));
    }
  };

  // Get role label for display
  const getRoleLabel = () => {
    const labels: Record<string, string> = { playdates: "Playdates", nannies: "Nannies", "animal-lovers": "Animal Lovers" };
    return labels[filters.role] || "Playdates";
  };

  return (
    <div className="min-h-screen bg-background pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />
      
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-4">
        <h1 className="text-2xl font-bold">Discovery</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFilterOpen(true)}
            className="p-2 rounded-full hover:bg-muted transition-colors relative"
          >
            <SlidersHorizontal className="w-6 h-6 text-muted-foreground" />
            {/* Filter active indicator */}
            {(filters.species.length > 0 || filters.distance !== defaultFilters.distance || filters.gender || filters.petHeight) && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <Settings className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Active Filters */}
      <section className="px-5">
        <ActiveFilters filters={filters} onRemove={handleRemoveFilter} />
      </section>

      {/* Current Role Display */}
      <section className="px-5 py-2">
        <div className="flex gap-2">
          <span className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium">
            {getRoleLabel()}
          </span>
        </div>
      </section>

      {/* Main Discovery Card */}
      <section className="px-5 py-4">
        <div className="relative h-[420px]">
          <AnimatePresence>
            {showCard && (
              <motion.div
                style={{ x: cardPosition.x, y: cardPosition.y, rotate: cardPosition.rotate }}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 100) {
                    handleSwipe(info.offset.x > 0 ? "right" : "left");
                  }
                }}
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-elevated cursor-grab active:cursor-grabbing"
              >
                <img 
                  src={sarahBella} 
                  alt="Sarah & Bella" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/30 to-transparent" />
                
                {/* Card Content */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-accent text-accent-foreground text-xs font-semibold px-2 py-1 rounded-full">
                      ✓ Verified
                    </span>
                    <ProfileBadges isVerified={true} hasCar={true} />
                  </div>
                  <h3 className="text-2xl font-bold text-primary-foreground">Sarah, 31 Years Old</h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="bg-primary-foreground/20 text-primary-foreground text-xs px-3 py-1 rounded-full">
                      #TrailHiker
                    </span>
                    <span className="bg-primary-foreground/20 text-primary-foreground text-xs px-3 py-1 rounded-full">
                      #DogFriendly
                    </span>
                  </div>
                  <p className="text-primary-foreground/90 text-sm mt-3">
                    Love hiking with Bella and meeting new friends! Available for weekend adventures.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 mt-4">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe("left")}
            className="w-14 h-14 rounded-full bg-card shadow-card flex items-center justify-center border border-border"
          >
            <X className="w-6 h-6 text-destructive" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe("right")}
            className="w-16 h-16 rounded-full bg-accent shadow-card flex items-center justify-center"
          >
            <HandMetal className="w-7 h-7 text-accent-foreground" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="w-14 h-14 rounded-full bg-card shadow-card flex items-center justify-center border border-border"
          >
            <Star className="w-6 h-6 text-warning" />
          </motion.button>
        </div>
      </section>

      {/* Huddle Nearby */}
      <section className="px-5 py-4">
        <h3 className="text-lg font-semibold mb-3">Huddle Nearby</h3>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
          {nearbyUsers.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col items-center gap-2 flex-shrink-0"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent p-0.5">
                  <div className="w-full h-full rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
                    {user.name.charAt(0)}
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <ProfileBadges isVerified={user.isVerified} hasCar={user.hasCar} size="sm" />
                </div>
              </div>
              <span className="text-xs font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.location}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Notice Board */}
      <section className="px-5 py-4 pb-8">
        <NoticeBoard 
          isPremium={isPremium} 
          onPremiumClick={() => setIsPremiumOpen(true)} 
        />
      </section>

      {/* Drawers & Modals */}
      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <FilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={handleApplyFilters}
        onPremiumClick={() => {
          setIsFilterOpen(false);
          setTimeout(() => setIsPremiumOpen(true), 300);
        }}
      />
      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default Social;
