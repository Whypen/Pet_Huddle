import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HandMetal, Star, X, Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SettingsDrawer } from "@/components/layout/SettingsDrawer";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PlusUpsell } from "@/components/social/PlusUpsell";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUpsell } from "@/hooks/useUpsell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import { demoUsers } from "@/lib/demoData";
import { normalizeMembershipTier } from "@/lib/membership";

type DiscoveryPet = {
  species?: string | null;
  name?: string | null;
};

type DiscoveryProfile = {
  id: string;
  display_name: string | null;
  avatar_url?: string | null;
  verification_status?: string | null;
  has_car?: boolean;
  bio?: string | null;
  relationship_status?: string | null;
  dob?: string | null;
  location_name?: string | null;
  occupation?: string | null;
  school?: string | null;
  major?: string | null;
  tier?: string | null;
  effective_tier?: string | null;
  pets?: DiscoveryPet[] | null;
  pet_species?: string[] | null;
  pet_size?: string | null;
  social_album?: string[] | null;
  show_occupation?: boolean | null;
  show_academic?: boolean | null;
  show_bio?: boolean | null;
  show_relationship_status?: boolean | null;
  show_age?: boolean | null;
  show_gender?: boolean | null;
  show_orientation?: boolean | null;
  show_height?: boolean | null;
  show_weight?: boolean | null;
  gender_genre?: string | null;
  orientation?: string | null;
  social_role?: string | null;
};

const discoverySpeciesOptions = [
  { value: "Any", label: "Any Species" },
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "bird", label: "Bird" },
  { value: "rabbit", label: "Rabbit" },
  { value: "reptile", label: "Reptile" },
  { value: "hamster", label: "Hamster" },
  { value: "others", label: "Others" },
];

const Discover = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { checkStarsAvailable, upsellModal, closeUpsellModal, buyAddOn } = useUpsell();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlusOpen, setIsPlusOpen] = useState(false);
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryRole, setDiscoveryRole] = useState("playdates");
  const [discoveryDistance, setDiscoveryDistance] = useState(10);
  const [discoveryPetSize, setDiscoveryPetSize] = useState("Any");
  const [discoveryGender, setDiscoveryGender] = useState("Any");
  const [discoverySpecies, setDiscoverySpecies] = useState("Any");
  const [discoveryMinAge, setDiscoveryMinAge] = useState(18);
  const [discoveryMaxAge, setDiscoveryMaxAge] = useState(99);
  const [hiddenDiscoveryIds, setHiddenDiscoveryIds] = useState<Set<string>>(new Set());
  const [selectedDiscovery, setSelectedDiscovery] = useState<DiscoveryProfile | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [activeAlbumIndex, setActiveAlbumIndex] = useState(0);
  const [albumUrls, setAlbumUrls] = useState<Record<string, string[]>>({});
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const userAge = profile?.dob
    ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;
  const isMinor = userAge !== null && userAge >= 13 && userAge < 16;
  const membershipTier = normalizeMembershipTier(profile?.effective_tier ?? profile?.tier);
  const isPlus = membershipTier === "plus" || membershipTier === "gold";

  // UAT: Free users have a discovery limit. After limit: blur overlay and upsell.
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const discoveryKey = useMemo(() => {
    const d = new Date();
    return `discovery_seen_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(discoveryKey);
      const n = raw ? Number(raw) : 0;
      setDiscoverySeenToday(Number.isFinite(n) ? n : 0);
    } catch {
      setDiscoverySeenToday(0);
    }
  }, [discoveryKey]);

  // Quota removed — all tiers unlimited
  const bumpDiscoverySeen = async (): Promise<boolean> => {
    setDiscoverySeenToday((prev) => {
      const next = prev + 1;
      try { localStorage.setItem(discoveryKey, String(next)); } catch { /* intentionally empty */ }
      return next;
    });
    return true;
  };

  useEffect(() => {
    if (!profile?.dob) return;
    const birthDate = new Date(profile.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    setDiscoveryMinAge(Math.max(18, age - 3));
    setDiscoveryMaxAge(Math.min(99, age + 3));
  }, [profile?.dob]);

  useEffect(() => {
    const runDiscovery = async () => {
      if (!profile?.id || profile.last_lat == null || profile.last_lng == null) return;
      setDiscoveryLoading(true);
      try {
        const minAge = Math.max(16, discoveryMinAge || 16);
        const maxAge = Math.max(minAge, discoveryMaxAge || 99);
        const payload = {
          userId: profile.id,
          lat: profile.last_lat,
          lng: profile.last_lng,
          radiusKm: discoveryDistance,
          role: discoveryRole,
          gender: discoveryGender !== "Any" ? discoveryGender : null,
          species: discoverySpecies !== "Any" ? [discoverySpecies] : null,
          petSize: discoveryPetSize !== "Any" ? discoveryPetSize : null,
          minAge,
          maxAge,
          advanced: isPlus,
        };
        const { data, error } = await supabase.functions.invoke("social-discovery", { body: payload });
        if (error) throw error;
        setDiscoveryProfiles(data?.profiles || []);
      } catch (err) {
        console.warn("[Discover] Discovery failed", err);
      } finally {
        setDiscoveryLoading(false);
      }
    };
    runDiscovery();
  }, [
    profile?.id,
    profile?.last_lat,
    profile?.last_lng,
    discoveryDistance,
    discoveryRole,
    discoveryPetSize,
    discoveryGender,
    discoverySpecies,
    discoveryMinAge,
    discoveryMaxAge,
    isPlus,
  ]);

  useEffect(() => {
    const loadAlbums = async () => {
      if (discoveryProfiles.length === 0) return;
      const next: Record<string, string[]> = {};
      for (const p of discoveryProfiles) {
        const album = Array.isArray(p?.social_album) ? p.social_album : [];
        if (!album.length) continue;
        const resolved = await Promise.all(
          album.map(async (path: string) => {
            if (!path) return "";
            if (path.startsWith("http")) return path;
            const { data } = await supabase.storage.from("social_album").createSignedUrl(path, 60 * 60);
            return data?.signedUrl || "";
          })
        );
        next[p.id] = resolved.filter(Boolean);
      }
      if (Object.keys(next).length > 0) {
        setAlbumUrls((prev) => ({ ...prev, ...next }));
      }
    };
    loadAlbums();
  }, [discoveryProfiles]);

  const demoProfiles = demoUsers.map((u) => ({
    id: u.id,
    display_name: u.name,
    avatar_url: u.avatarUrl || null,
    verification_status: u.isVerified ? "verified" : "unverified",
    has_car: u.hasCar,
    bio: u.bio,
    relationship_status: u.relationshipStatus || null,
    dob: u.age ? new Date(Date.now() - u.age * 365.25 * 24 * 60 * 60 * 1000).toISOString() : null,
    location_name: u.locationName,
    occupation: u.occupation || null,
    school: u.education || null,
    major: u.degree || null,
    tier: u.isPlus ? "plus" : "free",
    effective_tier: u.isPlus ? "plus" : "free",
    pets: u.pets || [],
    pet_species: (u.pets || []).map((p) => p.species),
    pet_size: null,
    height: u.height || null,
    social_album: u.avatarUrl ? [u.avatarUrl] : [],
    show_occupation: true,
    show_academic: true,
    show_bio: true,
    show_relationship_status: true,
    show_age: true,
    show_gender: true,
    show_orientation: true,
    show_height: true,
    show_weight: true,
    social_role: u.role,
    gender_genre: u.gender || null,
    orientation: u.orientation || null,
  }));

  const resolveDemoPetSize = (profileRow: { pet_size?: string | null; pet_species?: string[] | null }) => {
    if (profileRow?.pet_size) return profileRow.pet_size;
    const species = (profileRow?.pet_species || []).map((s: string) => s.toLowerCase());
    if (species.includes("dog")) return "Medium";
    if (species.includes("cat") || species.includes("rabbit") || species.includes("hamster") || species.includes("bird")) {
      return "Small";
    }
    return null;
  };

  const filteredDemoProfiles = demoProfiles.filter((p) => {
    if (discoveryRole && p.social_role !== discoveryRole) return false;
    if (discoverySpecies !== "Any") {
      const species = (p.pet_species || []).map((s: string) => s.toLowerCase());
      if (!species.includes(discoverySpecies.toLowerCase())) return false;
    }
    if (discoveryGender !== "Any" && p.gender_genre !== discoveryGender) return false;
    const age = p.dob
      ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : null;
    if (age !== null && (age < discoveryMinAge || age > discoveryMaxAge)) return false;
    if (discoveryPetSize !== "Any") {
      const size = resolveDemoPetSize(p);
      if (!size || size !== discoveryPetSize) return false;
    }
    return true;
  });

  const discoverySource = (discoveryProfiles.length > 0 ? discoveryProfiles : filteredDemoProfiles).filter(
    (p) => !hiddenDiscoveryIds.has(p.id)
  );

  return (
    <div className="min-h-screen bg-background pb-nav relative">
      <GlobalHeader
        onUpgradeClick={() => setIsPlusOpen(true)}
        onMenuClick={() => setIsSettingsOpen(true)}
      />

      {isMinor && (
        <div className="absolute inset-x-4 top-24 z-[60] pointer-events-none">
          <div className="rounded-xl border border-brandBlue/30 bg-background/90  px-4 py-3 text-sm font-medium text-brandBlue shadow-card">
            {t("Social features restricted for users under 16.")}
          </div>
        </div>
      )}

      <div className={cn(isMinor && "pointer-events-none opacity-70")}>
        <section className="px-5 pb-4 pt-4">
          <h1 className="text-2xl font-bold mb-3">{t("social.discovery")}</h1>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
            <select
              value={discoveryRole}
              onChange={(e) => setDiscoveryRole(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-xs"
            >
              <option value="playdates">{t("Playdates")}</option>
              <option value="nannies">{t("Nannies")}</option>
              <option value="animal-lovers">{t("Animal Lovers")}</option>
            </select>
            <select
              value={discoverySpecies}
              onChange={(e) => setDiscoverySpecies(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-xs"
            >
              {discoverySpeciesOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
            </select>
            <select
              value={discoveryGender}
              onChange={(e) => setDiscoveryGender(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-xs"
            >
              <option value="Any">{t("Any Gender")}</option>
              {["Male", "Female", "Non-binary", "PNA"].map((gender) => (
                <option key={gender} value={gender}>{gender}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 h-10">
              <span className="text-[10px] text-muted-foreground">{t("Age")}</span>
              <input
                type="number"
                min={16}
                max={99}
                value={discoveryMinAge}
                onChange={(e) => setDiscoveryMinAge(Number(e.target.value || 16))}
                className="w-12 bg-transparent text-[10px] outline-none"
              />
              <span className="text-[10px] text-muted-foreground">-</span>
              <input
                type="number"
                min={16}
                max={99}
                value={discoveryMaxAge}
                onChange={(e) => setDiscoveryMaxAge(Number(e.target.value || 99))}
                className="w-12 bg-transparent text-[10px] outline-none"
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 h-10">
              <span className="text-[10px] text-muted-foreground">{discoveryDistance}km</span>
              <input
                type="range"
                min={0}
                max={150}
                value={discoveryDistance}
                onChange={(e) => setDiscoveryDistance(Number(e.target.value))}
                className="w-24 accent-primary"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 h-10">
              <span className="text-[10px] text-muted-foreground">{t("Pet Size")}</span>
              <select
                value={discoveryPetSize}
                onChange={(e) => setDiscoveryPetSize(e.target.value)}
                className="bg-transparent text-xs outline-none"
                aria-label={t("Pet Size")}
              >
                {["Any", "Small", "Medium", "Large"].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="px-5">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
            {discoveryLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Loading discovery...")}
              </div>
            )}
            {discoverySource.map((p, idx) => {
              const blocked = !isPlus && discoverySeenToday >= 40 && idx >= 40;
              const age = p?.dob
                ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                : "";
              const petSpeciesList = Array.isArray(p?.pet_species)
                ? p.pet_species
                : Array.isArray(p?.pets) && p.pets.length > 0
              ? p.pets.map((pet: { species?: string | null }) => pet.species || "")
              : [];
              const petSpecies = petSpeciesList.length > 0 ? petSpeciesList.join(", ") : "—";
              const album = (albumUrls[p.id] && albumUrls[p.id].length > 0)
                ? albumUrls[p.id]
                : Array.isArray(p?.social_album) && p.social_album.length > 0
                ? p.social_album
                : p.avatar_url
                ? [p.avatar_url]
                : [];
              const cover = album[0];

              return (
                <div
                  key={p.id}
                  className={cn(
                    "min-w-[260px] rounded-2xl border border-border bg-card shadow-card overflow-hidden relative cursor-pointer",
                    blocked && "cursor-not-allowed"
                  )}
                  onClick={async () => {
                    if (blocked) return;
                    const ok = await bumpDiscoverySeen();
                    if (!ok) return;
                    setSelectedDiscovery(p);
                    setActiveAlbumIndex(0);
                    setShowDiscoveryModal(true);
                  }}
                >
                  {/* UAT: Blur overlay for free users after discovery limit */}
                  {blocked && (
                    <div className="absolute inset-0 z-20 bg-white/70  flex flex-col items-center justify-center gap-2 p-4">
                      <Lock className="w-8 h-8 text-brandBlue" />
                      <p className="text-xs text-center font-semibold text-brandText">Upgrade for unlimited discovery</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); setIsPlusOpen(true); }}
                        className="px-4 py-1.5 rounded-full bg-brandBlue text-white text-xs font-bold"
                      >
                        Upgrade
                      </button>
                    </div>
                  )}
                  {cover ? (
                    <img src={cover} alt={p.display_name || ""} className="h-44 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-44 w-full bg-muted" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />

                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.success(t("Wave sent"));
                      }}
                      className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                    >
                      <HandMetal className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        // Quota removed — stars unlimited for all tiers
                        navigate(`/chat-dialogue?id=${p.id}&name=${encodeURIComponent(p.display_name || "")}`);
                      }}
                      className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center"
                    >
                      <Star className="w-4 h-4 text-brandBlue" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setHiddenDiscoveryIds((prev) => new Set(prev).add(p.id));
                      }}
                      className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <div className="text-sm font-semibold">{p.display_name}</div>
                    <div className="text-xs text-white/80">
                      {age ? `${age} • ${p.relationship_status || "—"}` : p.relationship_status || "—"}
                    </div>
                    <div className="text-xs text-white/80 mt-1">{t("Pet")}: {petSpecies}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {showDiscoveryModal && selectedDiscovery && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[2500]"
              onClick={() => setShowDiscoveryModal(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="fixed inset-x-0 bottom-0 z-[2501] bg-card rounded-t-3xl max-w-md mx-auto overflow-hidden"
            >
              <div className="relative">
                <button
                  onClick={() => setShowDiscoveryModal(false)}
                  className="absolute top-3 right-3 z-10 w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-black/50 flex items-center justify-center"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                {(() => {
                  const album = (albumUrls[selectedDiscovery.id] && albumUrls[selectedDiscovery.id].length > 0)
                    ? albumUrls[selectedDiscovery.id]
                    : Array.isArray(selectedDiscovery.social_album) && selectedDiscovery.social_album.length > 0
                    ? selectedDiscovery.social_album
                    : selectedDiscovery.avatar_url
                    ? [selectedDiscovery.avatar_url]
                    : [];
                  const current = album[activeAlbumIndex] || album[0];
                  return (
                    <>
                      {current ? (
                        <img
                          src={current}
                          alt=""
                          className="w-full h-72 object-cover"
                          loading="lazy"
                          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
                          onTouchEnd={(e) => {
                            if (touchStartX == null || album.length <= 1) return;
                            const delta = touchStartX - e.changedTouches[0].clientX;
                            if (Math.abs(delta) > 40) {
                              const nextIndex = delta > 0
                                ? Math.min(activeAlbumIndex + 1, album.length - 1)
                                : Math.max(activeAlbumIndex - 1, 0);
                              setActiveAlbumIndex(nextIndex);
                            }
                            setTouchStartX(null);
                          }}
                        />
                      ) : (
                        <div className="w-full h-72 bg-muted" />
                      )}
                      {album.length > 1 && (
                        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1">
                          {album.map((_: string, idx: number) => (
                            <button
                              key={`dot-${idx}`}
                              onClick={() => setActiveAlbumIndex(idx)}
                              className={cn(
                                "w-2 h-2 rounded-full",
                                idx === activeAlbumIndex ? "bg-white" : "bg-white/40"
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="p-5 max-h-[50vh] overflow-y-auto">
                {(() => {
                  const age = selectedDiscovery?.dob
                    ? Math.floor((Date.now() - new Date(selectedDiscovery.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                    : null;
                  const pets = Array.isArray(selectedDiscovery?.pets) ? selectedDiscovery.pets : [];
                  const petSpecies = Array.isArray(selectedDiscovery?.pet_species)
                    ? selectedDiscovery.pet_species
                    : pets.map((pet: { species?: string | null }) => pet.species || "");
                  return (
                    <>
                      <h3 className="text-xl font-bold">{selectedDiscovery.display_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedDiscovery.show_age !== false && age ? `${age} • ` : ""}
                        {selectedDiscovery.show_relationship_status !== false
                          ? selectedDiscovery.relationship_status || ""
                          : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">{selectedDiscovery.location_name || "—"}</p>

                      {selectedDiscovery.show_bio !== false && selectedDiscovery.bio && (
                        <div className="mt-3">
                          <h4 className="text-sm font-semibold">{t("Bio")}</h4>
                          <p className="text-sm text-muted-foreground">{selectedDiscovery.bio}</p>
                        </div>
                      )}

                      <div className="mt-3">
                        <h4 className="text-sm font-semibold">{t("Pet Info")}</h4>
                        <p className="text-sm text-muted-foreground">
                          {petSpecies.length > 0 ? petSpecies.join(", ") : t("No pet info")}
                        </p>
                      </div>

                      {(selectedDiscovery.show_occupation !== false || selectedDiscovery.show_academic !== false) && (
                        <div className="mt-3 space-y-1">
                          {selectedDiscovery.show_occupation !== false && selectedDiscovery.occupation && (
                            <p className="text-sm text-muted-foreground">
                              {t("Job")}: {selectedDiscovery.occupation}
                            </p>
                          )}
                          {selectedDiscovery.show_academic !== false && (selectedDiscovery.school || selectedDiscovery.major) && (
                            <p className="text-sm text-muted-foreground">
                              {t("School")}: {[selectedDiscovery.school, selectedDiscovery.major].filter(Boolean).join(" • ")}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsDrawer isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <PlusUpsell isOpen={isPlusOpen} onClose={() => setIsPlusOpen(false)} />
      <UpsellModal
        isOpen={upsellModal.isOpen}
        type={upsellModal.type}
        title={upsellModal.title}
        description={upsellModal.description}
        price={upsellModal.price}
        onClose={closeUpsellModal}
        onBuy={() => buyAddOn(upsellModal.type)}
      />
    </div>
  );
};

export default Discover;
