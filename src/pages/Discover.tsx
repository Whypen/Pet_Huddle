import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, SlidersHorizontal, HandMetal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import sarahBella from "@/assets/users/sarah-bella.jpg";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { FilterSheet, FilterState, defaultFilters } from "@/components/social/FilterSheet";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { ActiveFilters } from "@/components/social/ActiveFilters";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { useUpsell } from "@/hooks/useUpsell";
import { UpsellModal } from "@/components/monetization/UpsellModal";

const Discover = () => {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<{
    id: string;
    name: string;
    location: string;
    isVerified: boolean;
    hasCar: boolean;
    bio: string;
  } | null>(null);
  const [showStarPopup, setShowStarPopup] = useState(false);
  const [starPopupMessage, setStarPopupMessage] = useState("");
  const { upsellModal, closeUpsellModal, buyAddOn, checkStarsAvailable } = useUpsell();

  const nearbyUsers = [
    { id: 1, name: "social.user.marcus.name", location: "social.location.central_park", isVerified: true, hasCar: false },
    { id: 2, name: "social.user.emma.name", location: "social.location.dog_run", isVerified: false, hasCar: true },
    { id: 3, name: "social.user.james.name", location: "social.location.pet_cafe", isVerified: true, hasCar: true },
  ];
  const [discoveryProfiles, setDiscoveryProfiles] = useState<any[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // SPRINT 3: Initialize age filter to ±3 years from user's age
  const getUserAge = () => {
    if (!profile?.dob) return 25; // Default age if not set
    const birthDate = new Date(profile.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const userAge = getUserAge();
  const isUnder16 = userAge < 16;
  const [filters, setFilters] = useState<FilterState>({
    ...defaultFilters,
    ageRange: [Math.max(18, userAge - 3), Math.min(99, userAge + 3)]
  });
  const [cardPosition, setCardPosition] = useState({ x: 0, y: 0, rotate: 0 });
  const [showCard, setShowCard] = useState(true);

  const isPremium = profile?.tier === "premium" || profile?.tier === "gold";

  const mainProfile = {
    id: "sarah",
    name: "social.profile.sarah.name",
    location: "social.profile.sarah.location",
    isVerified: true,
    hasCar: true,
    bio: "social.profile.sarah.bio",
    title: "social.profile.sarah.title",
    photoAlt: "social.profile.sarah.photo_alt",
  };
  const activeProfile = discoveryProfiles[0]
    ? {
        id: discoveryProfiles[0].id,
        name: discoveryProfiles[0].display_name || "social.profile.sarah.name",
        location: "social.profile.sarah.location",
        isVerified: discoveryProfiles[0].is_verified,
        hasCar: discoveryProfiles[0].has_car,
        bio: discoveryProfiles[0].bio || "social.profile.sarah.bio",
        title: "social.profile.sarah.title",
        photoAlt: "social.profile.sarah.photo_alt",
      }
    : mainProfile;

  const openProfileModal = (profileData: typeof mainProfile) => {
    setSelectedProfile(profileData);
    setShowProfileModal(true);
  };

  useEffect(() => {
    const runDiscovery = async () => {
      if (!profile?.id || profile.last_lat == null || profile.last_lng == null) return;
      setDiscoveryLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("social-discovery", {
          body: {
            userId: profile.id,
            lat: profile.last_lat,
            lng: profile.last_lng,
            radiusKm: filters.distance,
            minAge: filters.ageRange[0],
            maxAge: filters.ageRange[1],
          },
        });
        if (error) throw error;
        setDiscoveryProfiles(data?.profiles || []);
      } catch (err) {
        console.warn("[Discover] Discovery failed", err);
      } finally {
        setDiscoveryLoading(false);
      }
    };

    runDiscovery();
  }, [profile?.id, profile?.last_lat, profile?.last_lng, filters.distance, filters.ageRange]);

  const handleSwipe = (direction: "left" | "right") => {
    const xMove = direction === "right" ? 500 : -500;
    setCardPosition({ x: xMove, y: 0, rotate: direction === "right" ? 20 : -20 });
    setTimeout(() => {
      setShowCard(false);
      if (direction === "right") {
        setShowMatchModal(true);
      }
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
    const labels: Record<string, string> = {
      playdates: t("social.playdates"),
      nannies: t("social.nannies"),
      "animal-lovers": t("social.animal_lovers"),
    };
    return labels[filters.role] || t("social.playdates");
  };

  return (
    <div className="min-h-screen bg-background pb-nav relative">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {isUnder16 && (
        <div className="absolute inset-x-4 top-24 z-[60] pointer-events-none">
          <div className="rounded-xl border border-[#3283ff]/30 bg-background/90 backdrop-blur px-4 py-3 text-sm font-medium text-[#3283ff] shadow-card">
            {t("Social features restricted for users under 16.")}
          </div>
        </div>
      )}

      <div className={cn(isUnder16 && "pointer-events-none opacity-70")}>
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4 pb-4">
          <h1 className="text-2xl font-bold">{t("social.discovery")}</h1>
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
          </div>
        </header>

      {/* Star Pop-up */}
      <AnimatePresence>
        {showStarPopup && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-card shadow-elevated border border-border rounded-xl px-4 py-2"
          >
            <p className="text-sm font-medium">{t(starPopupMessage)}</p>
          </motion.div>
        )}
      </AnimatePresence>

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
                onClick={() => openProfileModal(activeProfile)}
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-elevated cursor-grab active:cursor-grabbing"
              >
                <img 
                  src={sarahBella} 
                  alt={t(activeProfile.photoAlt)} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/30 to-transparent" />
                
                {/* Card Content */}
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-[#3283FF] text-white text-xs font-semibold px-2 py-1 rounded-full">
                      {t("✓ Verified")}
                    </span>
                    <ProfileBadges isVerified={true} hasCar={true} />
                  </div>
                  <h3 className="text-2xl font-bold text-primary-foreground">{t(activeProfile.title)}</h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="bg-primary-foreground/20 text-primary-foreground text-xs px-3 py-1 rounded-full">
                      {t("social.profile.tag.trail_hiker")}
                    </span>
                    <span className="bg-primary-foreground/20 text-primary-foreground text-xs px-3 py-1 rounded-full">
                      {t("social.profile.tag.dog_friendly")}
                    </span>
                  </div>
                  <p className="text-primary-foreground/90 text-sm mt-3">
                    {t(activeProfile.bio)}
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
            className="w-16 h-16 rounded-full bg-[#3283FF] shadow-card flex items-center justify-center"
          >
            <HandMetal className="w-7 h-7 text-accent-foreground" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="w-14 h-14 rounded-full bg-card shadow-card flex items-center justify-center border border-border"
              onClick={async () => {
                const ok = await checkStarsAvailable();
                if (!ok) {
                  setStarPopupMessage("Buy a star pack to immediately chat with the user");
                  setShowStarPopup(true);
                  setTimeout(() => setShowStarPopup(false), 2500);
                  return;
                }
                setStarPopupMessage("Boost sent");
                setShowStarPopup(true);
                setTimeout(() => setShowStarPopup(false), 2000);
              }}
          >
            <Star className="w-6 h-6" style={{ color: "#3283FF" }} />
          </motion.button>
        </div>
        </section>

        {/* Huddle Nearby */}
        <section className="px-5 py-4">
        <h3 className="text-lg font-semibold mb-3 font-huddle">{t("social.nearby")}</h3>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
          {nearbyUsers.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer"
              onClick={() => openProfileModal({
                id: String(user.id),
                name: user.name,
                location: user.location,
                isVerified: user.isVerified,
                hasCar: user.hasCar,
                bio: "social.profile.nearby_bio",
              })}
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent p-0.5">
                  <div className="w-full h-full rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
                    {t(user.name).charAt(0)}
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1">
                  <ProfileBadges isVerified={user.isVerified} hasCar={user.hasCar} size="sm" />
                </div>
              </div>
              <span className="text-xs font-medium">{t(user.name)}</span>
              <span className="text-xs text-muted-foreground">{t(user.location)}</span>
            </motion.div>
          ))}
        </div>
        </section>

        {/* Discovery only */}
      </div>

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
      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />
      <AnimatePresence>
        {showMatchModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMatchModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-x-6 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-card rounded-2xl p-6 z-50 shadow-elevated text-center"
            >
              <h2 className="text-2xl font-bold mb-2">{t("social.match")}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t("social.match_message")}
              </p>
              <Button
                onClick={() => {
                  setShowMatchModal(false);
                  navigate(`/chat-dialogue?id=${activeProfile.id}&name=${encodeURIComponent(t(activeProfile.name))}`);
                }}
                className="w-full"
              >
                {t("Start Chat")}
              </Button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfileModal && selectedProfile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="fixed inset-x-4 top-16 bottom-16 max-w-md mx-auto bg-card rounded-2xl p-6 z-50 shadow-elevated flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t(selectedProfile.name)}</h2>
                <button onClick={() => setShowProfileModal(false)} className="p-2 rounded-full hover:bg-muted">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <ProfileBadges isVerified={selectedProfile.isVerified} hasCar={selectedProfile.hasCar} size="md" />
                <span className="text-sm text-muted-foreground">{t(selectedProfile.location)}</span>
              </div>
              <p className="text-sm text-foreground mb-6">{t(selectedProfile.bio)}</p>
              <div className="mt-auto space-y-2">
                <Button
                  onClick={() => {
                    setShowProfileModal(false);
                    navigate(`/chat-dialogue?id=${selectedProfile.id}`);
                  }}
                  className="w-full"
                >
                  {t("Normal Chat")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowProfileModal(false);
                    navigate("/map?mode=broadcast");
                  }}
                  className="w-full"
                >
                  {t("Broadcast Alert")}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Discover;
