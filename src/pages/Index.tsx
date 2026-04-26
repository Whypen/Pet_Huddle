import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, Lightbulb, Clock, Loader2, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { EmptyPetState } from "@/components/pets/EmptyPetState";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { useAuth } from "@/contexts/AuthContext";
import { resolveCopy } from "@/lib/copy";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatPetAge, computeNextEvent, formatNextEventLabel, type PetReminder } from "@/utils/petLogic";

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  weight: number | null;
  weight_unit: string;
  dob: string | null;
  photo_url: string | null;
  is_active: boolean;
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

const formatSpeciesLabel = (value: string) =>
  String(value || "")
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const t = resolveCopy;
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nextEventLabel, setNextEventLabel] = useState<string>("—");
  const [selectedPetIndex, setSelectedPetIndex] = useState(0);
  const [firstTimeNoPetView, setFirstTimeNoPetView] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const petsDebounceRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const fetchPets = useCallback(async () => {
    try {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed, weight, weight_unit, dob, photo_url, is_active")
        .eq("owner_id", user?.id)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const nextPets = data || [];
      setPets(nextPets);
      if (nextPets.length > 0) {
        setSelectedPetIndex(0);
        setSelectedPet(nextPets[0]);
      } else {
        setSelectedPetIndex(0);
        setSelectedPet(null);
      }
    } catch (error) {
      console.error("Error fetching pets:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if ((location.state as { fromSetProfileNoPet?: boolean } | null)?.fromSetProfileNoPet === true) {
      setFirstTimeNoPetView(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (user?.id) {
      void fetchPets();
    }
  }, [user?.id, fetchPets]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`pets-home-realtime-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pets", filter: `owner_id=eq.${user.id}` },
        () => {
          if (petsDebounceRef.current !== null) window.clearTimeout(petsDebounceRef.current);
          petsDebounceRef.current = window.setTimeout(() => {
            petsDebounceRef.current = null;
            void fetchPets();
          }, 350);
        }
      )
      .subscribe();

    return () => {
      if (petsDebounceRef.current !== null) window.clearTimeout(petsDebounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [fetchPets, user?.id]);

  useEffect(() => {
    if (pets.length === 0) {
      setSelectedPet(null);
      setSelectedPetIndex(0);
      return;
    }
    const safeIndex = Math.min(selectedPetIndex, pets.length - 1);
    if (safeIndex !== selectedPetIndex) {
      setSelectedPetIndex(safeIndex);
      return;
    }
    const nextSelected = pets[safeIndex] || null;
    if (!nextSelected) return;
    if (selectedPet?.id !== nextSelected.id) {
      setSelectedPet(nextSelected);
    }
  }, [pets, selectedPet?.id, selectedPetIndex]);

  const scrollToPetIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const container = carouselRef.current;
    const card = cardRefs.current[index];
    if (!container || !card) return;
    const left = card.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
    container.scrollTo({ left: Math.max(0, left), behavior });
  }, []);

  useEffect(() => {
    if (pets.length <= 1) return;
    const timer = window.setTimeout(() => {
      scrollToPetIndex(selectedPetIndex, "auto");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pets.length, scrollToPetIndex, selectedPetIndex]);

  const handleCarouselScroll = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;
    const centerX = container.scrollLeft + container.clientWidth / 2;
    let nextIndex = selectedPetIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const distance = Math.abs(cardCenter - centerX);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextIndex = index;
      }
    });
    if (nextIndex !== selectedPetIndex) {
      setSelectedPetIndex(nextIndex);
    }
  }, [selectedPetIndex]);

  // UAT: Next Event must pull from Supabase reminders table.
  useEffect(() => {
    (async () => {
      if (!user?.id || !selectedPet?.id) {
        setNextEventLabel("—");
        return;
      }
      if (selectedPet.is_active === false) {
        setNextEventLabel("—");
        return;
      }
      try {
        const todayISO = new Date().toISOString().slice(0, 10);
        const res = await supabase
          .from("reminders" as "profiles")
          .select("id,pet_id,due_date,kind,reason" as "*")
          .eq("owner_id" as "id", user.id)
          .eq("pet_id" as "id", selectedPet.id)
          .gte("due_date" as "id", todayISO)
          .order("due_date" as "id", { ascending: true })
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
  }, [selectedPet?.dob, selectedPet?.id, selectedPet?.is_active, user?.id]);

  // SPRINT 2: Case-insensitive species matching for wisdom tips
  const getRandomTip = (species: string) => {
    const normalizedSpecies = species.charAt(0).toUpperCase() + species.slice(1).toLowerCase();
    const tips = wisdomTips[normalizedSpecies];
    if (!tips?.length) return null;
    const tipKey = tips[Math.floor(Math.random() * tips.length)];
    const tipText = t(tipKey).trim();
    const fallbackLeaf = tipKey.split(".").at(-1) || "";
    if (!tipText || tipText === tipKey || tipText === fallbackLeaf) return null;
    return tipText;
  };

  const displayName = profile?.display_name || t("Friend");
  const firstName = displayName.split(" ")[0];
  const avatarUrl = profile?.avatar_url ? String(profile.avatar_url) : "";
  const avatarInitial = firstName.trim().charAt(0).toUpperCase() || "U";
  const socialRoleText = (() => {
    const roles = Array.isArray(profile?.availability_status)
      ? profile.availability_status
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .map((entry) => (/^animal friend\s*\(no pet\)$/i.test(entry) ? "Animal Friend" : entry))
      : [];
    return roles.length > 0 ? roles.join(" · ") : "Animal Friend";
  })();
  const selectedPetTip = selectedPet ? getRandomTip(selectedPet.species) : null;

  if (loading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto touch-pan-y bg-background pb-nav">
      <GlobalHeader
        onUpgradeClick={() => setIsPremiumOpen(true)}
      />
      
      {/* Page header — editorial cadence, no hype copy */}
      <header className="px-5 pt-5 pb-2">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full border-2 bg-[rgba(33,69,207,0.10)]",
              profile?.is_verified === true ? "border-brandBlue" : "border-[#C9CEDA]"
            )}
            aria-hidden
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[26px] font-[700] text-[var(--color-brand,#2145CF)]">
                {avatarInitial}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-[700] leading-tight text-brandText tracking-tight">
                {displayName}
              </h1>
              <ProfileBadges
                isVerified={profile?.is_verified === true}
                hasCar={profile?.has_car}
                size="md"
              />
            </div>
            <p className="mt-1 truncate text-[15px] font-[600] text-brandSubtext/80">
              {socialRoleText}
            </p>
          </div>
        </div>
      </header>

      {pets.length === 0 ? (
        /* Empty State */
        <section className="px-5 pt-1 pb-24">
          <EmptyPetState
            onAddPet={() => navigate("/edit-pet-profile")}
            firstTimeFromSetProfile={firstTimeNoPetView}
          />
        </section>
      ) : (
        <>
          {/* Selected Pet Card - SPRINT 3: Card navigates to Expanded Info */}
          {selectedPet && (
            <section className="pt-1 pb-3">
              {pets.length >= 1 ? (
                <div
                  ref={carouselRef}
                  onScroll={handleCarouselScroll}
                  className="flex snap-x snap-mandatory gap-[6px] overflow-x-auto overflow-y-visible touch-pan-x scrollbar-hide pt-1 pb-3"
                >
                  <div className="shrink-0 w-[clamp(8px,2.8vw,14px)]" aria-hidden />
                  {pets.map((pet, index) => (
                    <motion.div
                      key={pet.id}
                      ref={(node) => {
                        cardRefs.current[index] = node;
                      }}
                      layout
                      onClick={() => navigate(`/pet-details?id=${pet.id}`)}
                      className="relative snap-center shrink-0 overflow-hidden rounded-2xl shadow-card cursor-pointer transition-shadow"
                      animate={
                        index === selectedPetIndex
                          ? {
                              scale: 1,
                              opacity: 1,
                              y: [0, -1.5, 0],
                              boxShadow: [
                                "0 10px 22px rgba(66,73,101,0.12)",
                                "0 12px 26px rgba(66,73,101,0.15)",
                                "0 10px 22px rgba(66,73,101,0.12)",
                              ],
                            }
                          : {
                              scale: 0.85,
                              opacity: 0.7,
                              y: 0,
                              boxShadow: "0 6px 14px rgba(66,73,101,0.08)",
                            }
                      }
                      transition={
                        index === selectedPetIndex
                          ? {
                              scale: { duration: 0.22, ease: "easeOut" },
                              opacity: { duration: 0.22, ease: "easeOut" },
                              y: { duration: 3.2, ease: "easeInOut", repeat: Infinity },
                              boxShadow: { duration: 3.2, ease: "easeInOut", repeat: Infinity },
                            }
                          : { duration: 0.22, ease: "easeOut" }
                      }
                      style={{
                        width: "clamp(248px, 80%, 332px)",
                        minWidth: "clamp(248px, 80%, 332px)",
                        aspectRatio: "4 / 5",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/edit-pet-profile?id=${pet.id}`);
                        }}
                        className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-sm"
                        aria-label={t("Edit Pet")}
                      >
                        <Settings className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <div className="absolute inset-0 bg-black/10">
                        {pet.photo_url ? (
                          <img
                            src={pet.photo_url}
                            alt={pet.name}
                            className="w-full h-full object-cover object-center"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent" />
                      </div>
                      <div className="relative h-full p-5 flex items-end">
                        <motion.div
                          key={pet.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="w-full"
                        >
                          <h2 className="text-2xl font-bold text-primary-foreground">{pet.name}</h2>
                          <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold capitalize">
                              {formatSpeciesLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ""}
                            </span>
                            {pet.dob && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
                                {formatPetAge(pet.dob)}
                              </span>
                            )}
                            {pet.weight && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
                                {pet.weight}{pet.weight_unit}
                              </span>
                            )}
                          </div>
                          {index === selectedPetIndex && pet.is_active !== false && (
                            <div className="mt-3 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
                              <div className="flex items-center gap-2 text-primary-foreground">
                                <Clock className="w-4 h-4" strokeWidth={1.75} />
                                <span className="text-sm font-medium">
                                  {t("home.next_event")}: {nextEventLabel}
                                </span>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                  <div
                    className="relative snap-center shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(248,248,255,0.96),rgba(255,255,255,0.98))] shadow-card"
                    style={{
                      width: "clamp(248px, 80%, 332px)",
                      minWidth: "clamp(248px, 80%, 332px)",
                      aspectRatio: "4 / 5",
                    }}
                  >
                    <div className="h-full w-full flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => navigate("/edit-pet-profile")}
                        className="neu-icon w-16 h-16"
                        aria-label="Add pet"
                      >
                        <Plus className="w-6 h-6 text-brandBlue" />
                      </button>
                    </div>
                  </div>
                  <div className="shrink-0 w-[clamp(8px,2.8vw,14px)]" aria-hidden />
                </div>
              ) : (
                <div className="px-5 flex justify-center">
                  <motion.div
                    layout
                    onClick={() => navigate(`/pet-details?id=${selectedPet.id}`)}
                    className="relative w-full max-w-[var(--app-max-width,430px)] h-[clamp(320px,52svh,500px)] rounded-2xl overflow-hidden shadow-card cursor-pointer hover:shadow-lg transition-shadow"
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
                    <div className="absolute inset-0 bg-black/10">
                      {selectedPet.photo_url ? (
                        <img
                          src={selectedPet.photo_url}
                          alt={selectedPet.name}
                          className="w-full h-full object-cover object-center"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent" />
                    </div>
                    <div className="relative h-full p-5 flex items-end">
                      <motion.div
                        key={selectedPet.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full"
                      >
                        <h2 className="text-2xl font-bold text-primary-foreground">
                          {selectedPet.name}
                        </h2>
                        <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold capitalize">
                            {formatSpeciesLabel(selectedPet.species)}{selectedPet.breed ? ` · ${selectedPet.breed}` : ""}
                          </span>
                          {selectedPet.dob && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
                              {formatPetAge(selectedPet.dob)}
                            </span>
                          )}
                          {selectedPet.weight && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
                              {selectedPet.weight}{selectedPet.weight_unit}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 bg-primary-foreground/20 backdrop-blur-sm rounded-xl px-4 py-3">
                          <div className="flex items-center gap-2 text-primary-foreground">
                            <Clock className="w-4 h-4" strokeWidth={1.75} />
                            <span className="text-sm font-medium">
                              {t("home.next_event")}: {nextEventLabel}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              )}
            </section>
          )}

          {/* Pet care tip */}
          {selectedPetTip && (
            <section className="px-5 pb-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-e1 p-4 flex items-start gap-3"
              >
                <div className="neu-icon flex-shrink-0">
                  <Lightbulb className="w-5 h-5 text-brandBlue" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-brandSubtext/80 leading-relaxed">
                    {selectedPetTip}
                  </p>
                </div>
              </motion.div>
            </section>
          )}
        </>
      )}

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default Index;
