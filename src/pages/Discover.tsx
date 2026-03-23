import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, Loader2, Lock, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { StarUpgradeSheet } from "@/components/monetization/StarUpgradeSheet";
import { FilterSheet } from "@/components/social/FilterSheet";
import { defaultFilters, type FilterState } from "@/components/social/filterTypes";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUpsell } from "@/hooks/useUpsell";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { UpsellModal } from "@/components/monetization/UpsellModal";
import { MediaThumb } from "@/components/media/MediaThumb";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlList } from "@/lib/socialAlbum";
import profilePlaceholder from "@/assets/Profile Placeholder.png";
import discoverAgeGateImage from "@/assets/Notifications/Discover age gate.png";
import { WaveHandIcon } from "@/components/icons/WaveHandIcon";
import { getQuotaCapsForTier, quotaConfig, type QuotaBillingCycle } from "@/config/quotaConfig";
import { startStripeCheckout } from "@/lib/stripeCheckout";

type DiscoveryPet = {
  species?: string | null;
  name?: string | null;
  is_active?: boolean | null;
  is_public?: boolean | null;
};

type DiscoveryProfile = {
  id: string;
  display_name: string | null;
  avatar_url?: string | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  has_car?: boolean;
  bio?: string | null;
  relationship_status?: string | null;
  dob?: string | null;
  location_name?: string | null;
  occupation?: string | null;
  school?: string | null;
  major?: string | null;
  tier?: string | null;
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

const getVisiblePetSpecies = (profile: DiscoveryProfile) => {
  const pets = Array.isArray(profile.pets) ? profile.pets : [];
  const visibleFromPets = pets
    .filter((pet) => pet && pet.is_active !== false && pet.is_public !== false)
    .map((pet) => (pet.species || "").trim())
    .filter((species) => species.length > 0);

  if (visibleFromPets.length > 0) return visibleFromPets;
  if (Array.isArray(profile.pet_species)) return profile.pet_species.filter((species): species is string => typeof species === "string" && species.length > 0);
  return [];
};

const DISCOVER_MIN_AGE_MESSAGE = "User must be 16+ to access Discover feature on Chats.";
const DISCOVER_AGE_GATE_BODY =
  "Discover & Chat features are for 16+ only. For now, join the social conversation and help protect the pack by keeping an eye on the Map.";

const extractDistrictToken = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1] || parts[0] || raw || null;
  if (parts.length === 2) return parts[0] || raw || null;
  return parts[0] || raw || null;
};

const resolveDiscoveryLocationLabel = ({
  liveLocationDistrict,
  pinDistrict,
  profileLocationDistrict,
  profileLocationName,
}: {
  liveLocationDistrict?: string | null;
  pinDistrict?: string | null;
  profileLocationDistrict?: string | null;
  profileLocationName?: string | null;
}) =>
  extractDistrictToken(liveLocationDistrict) ||
  extractDistrictToken(pinDistrict) ||
  extractDistrictToken(profileLocationDistrict) ||
  extractDistrictToken(profileLocationName) ||
  null;

const Discover = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t } = useLanguage();
  const { checkStarsAvailable, upsellModal, closeUpsellModal, buyAddOn } = useUpsell();

  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [premiumTier, setPremiumTier] = useState<"plus" | "gold">("plus");
  const [premiumBilling, setPremiumBilling] = useState<QuotaBillingCycle>("monthly");
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<FilterState>(defaultFilters);

  const openPremiumForTier = (tier: "plus" | "gold") => {
    setPremiumTier(tier);
    setPremiumBilling("monthly");
    setIsPremiumOpen(true);
  };

  const handlePremiumUpgrade = async () => {
    if (premiumLoading) return;
    setPremiumLoading(true);
    try {
      const plan = quotaConfig.stripePlans[premiumTier][premiumBilling === "annual" ? "annual" : "monthly"];
      const url = await startStripeCheckout({
        mode: "subscription",
        type: `${premiumTier}_${premiumBilling === "annual" ? "annual" : "monthly"}`,
        lookupKey: plan.lookupKey,
        priceId: plan.priceId,
        successUrl: `${window.location.origin}/premium`,
        cancelUrl: window.location.href,
      });
      window.location.assign(url);
    } catch {
      toast.error("Unable to start checkout right now.");
    } finally {
      setPremiumLoading(false);
    }
  };
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryRole, setDiscoveryRole] = useState("playdates");
  const [discoveryDistance, setDiscoveryDistance] = useState(10);
  const [discoveryPetSize, setDiscoveryPetSize] = useState("Any");
  const [discoveryGender, setDiscoveryGender] = useState("Any");
  const [discoverySpecies, setDiscoverySpecies] = useState("Any");
  const [discoveryMinAge, setDiscoveryMinAge] = useState(16);
  const [discoveryMaxAge, setDiscoveryMaxAge] = useState(99);
  const [hiddenDiscoveryIds, setHiddenDiscoveryIds] = useState<Set<string>>(new Set());
  const [selectedDiscovery, setSelectedDiscovery] = useState<DiscoveryProfile | null>(null);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [activeAlbumIndex, setActiveAlbumIndex] = useState(0);
  const [albumUrls, setAlbumUrls] = useState<Record<string, string[]>>({});

  const userAge = profile?.dob
    ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;
  const discoverChatAgeBlocked = userAge !== null && userAge < 16;
  const effectiveTier = profile?.effective_tier || profile?.tier || "free";
  const isPremium = effectiveTier === "plus" || effectiveTier === "gold";

  // Daily discovery quota by tier from canonical quota config.
  const [discoverySeenToday, setDiscoverySeenToday] = useState(0);
  const discoveryKey = useMemo(() => {
    const d = new Date();
    return `discovery_seen_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${profile?.id || "anon"}`;
  }, [profile?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(discoveryKey);
      const n = raw ? Number(raw) : 0;
      setDiscoverySeenToday(Number.isFinite(n) ? n : 0);
    } catch {
      setDiscoverySeenToday(0);
    }
  }, [discoveryKey]);

  const discoveryDailyCap = getQuotaCapsForTier(effectiveTier).discoveryViewsPerDay;
  const discoveryQuotaReached = Number.isFinite(discoveryDailyCap) && discoveryDailyCap !== null && discoverySeenToday >= discoveryDailyCap;

  const bumpDiscoverySeen = async (): Promise<boolean> => {
    if (discoveryQuotaReached) return false;
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
    setDiscoveryMinAge(Math.max(16, age - 3));
    setDiscoveryMaxAge(Math.min(99, age + 3));
  }, [profile?.dob]);

  useEffect(() => {
    const runDiscovery = async () => {
      if (!profile?.id) return;
      if (discoverChatAgeBlocked) {
        setDiscoveryProfiles([]);
        setDiscoveryError(null);
        return;
      }
      setDiscoveryLoading(true);
      try {
        let anchorLat: number | null = typeof profile.last_lat === "number" ? profile.last_lat : null;
        let anchorLng: number | null = typeof profile.last_lng === "number" ? profile.last_lng : null;
        if (anchorLat == null || anchorLng == null) {
          const { data: loc } = await supabase
            .from("user_locations")
            .select("location")
            .eq("user_id", profile.id)
            .eq("is_public", true)
            .maybeSingle();
          const point = (loc?.location || null) as unknown as { coordinates?: unknown } | null;
          const coords = Array.isArray(point?.coordinates) ? point?.coordinates : null;
          if (coords && typeof coords[0] === "number" && typeof coords[1] === "number") {
            anchorLng = Number(coords[0]);
            anchorLat = Number(coords[1]);
          }
        }
        if (anchorLat == null || anchorLng == null) {
          setDiscoveryProfiles([]);
          setDiscoveryError("Discovery works best with location on.");
          return;
        }
        const minAge = Math.max(16, discoveryMinAge || 16);
        const maxAge = Math.max(minAge, discoveryMaxAge || 99);
        const { data, error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
          "social_discovery",
          {
            p_user_id: profile.id,
            p_lat: anchorLat,
            p_lng: anchorLng,
            p_radius_m: Math.max(1000, Math.round((discoveryDistance || 5) * 1000)),
            p_min_age: minAge,
            p_max_age: maxAge,
            p_role: discoveryRole,
            p_gender: discoveryGender !== "Any" ? discoveryGender : null,
            p_species: discoverySpecies !== "Any" ? [discoverySpecies] : null,
            p_pet_size: discoveryPetSize !== "Any" ? discoveryPetSize : null,
            p_advanced: isPremium,
          }
        );
        if (error) throw error;
        let profiles = Array.isArray(data) ? data : [];
        const pinDistrictByUserId = new Map<string, string | null>();
        const liveLocationDistrictByUserId = new Map<string, string | null>();

        if (profiles.length === 0) {
          const { data: fallbackPins, error: fallbackError } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
            "get_friend_pins_nearby",
            {
              p_lat: anchorLat,
              p_lng: anchorLng,
              p_radius_m: Math.max(1000, Math.round((discoveryDistance || 5) * 1000)),
            }
          );
          if (!fallbackError && Array.isArray(fallbackPins) && fallbackPins.length > 0) {
            const fallbackMeta = new Map(
              (fallbackPins as Array<Record<string, unknown>>).map((row) => [
                String(row.id),
                {
                  location_name: typeof row.location_name === "string" ? row.location_name : null,
                  avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
                  display_name: typeof row.display_name === "string" ? row.display_name : "User",
                },
              ])
            );
            for (const [id, meta] of fallbackMeta.entries()) {
              pinDistrictByUserId.set(id, extractDistrictToken(meta.location_name || null));
            }
            const fallbackIds = Array.from(fallbackMeta.keys());
            const { data: fallbackProfiles, error: fallbackProfilesError } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url, verification_status, is_verified, bio, relationship_status, dob, location_name, occupation, school, major, tier, social_album, pets(species,name,is_active,is_public)")
              .in("id", fallbackIds)
              .or("non_social.is.null,non_social.eq.false")
              .or("account_status.is.null,account_status.eq.active");

            if (fallbackProfilesError) throw fallbackProfilesError;

            profiles = (((fallbackProfiles || []) as unknown) as DiscoveryProfile[]).map((row) => {
              const meta = fallbackMeta.get(row.id);
              const pinDistrict = pinDistrictByUserId.get(row.id) || null;
              return {
                ...row,
                display_name: row.display_name || meta?.display_name || "User",
                avatar_url: row.avatar_url || meta?.avatar_url || null,
                location_name: resolveDiscoveryLocationLabel({
                  pinDistrict,
                  profileLocationName: row.location_name || meta?.location_name || null,
                }),
              };
            });
          }
        }
        const profileIds = profiles
          .map((row) => String((row as DiscoveryProfile).id || "").trim())
          .filter(Boolean);
        if (profileIds.length > 0) {
          const { data: liveRows } = await supabase
            .from("user_locations")
            .select("user_id, location_name, updated_at")
            .in("user_id", profileIds)
            .order("updated_at", { ascending: false });
          for (const row of (liveRows || []) as Array<{ user_id?: string | null; location_name?: string | null }>) {
            const userId = String(row.user_id || "").trim();
            if (!userId || liveLocationDistrictByUserId.has(userId)) continue;
            const district = extractDistrictToken(row.location_name || null);
            liveLocationDistrictByUserId.set(userId, district);
            if (!pinDistrictByUserId.has(userId)) {
              pinDistrictByUserId.set(userId, district);
            }
          }

          const { data: profileRows } = await supabase
            .from("profiles")
            .select("id, location_name, location_district")
            .in("id", profileIds);
          const profileDistrictByUserId = new Map<string, string | null>();
          const profileLocationByUserId = new Map<string, string | null>();
          for (const row of (profileRows || []) as Array<{ id?: string | null; location_name?: string | null; location_district?: string | null }>) {
            const userId = String(row.id || "").trim();
            if (!userId) continue;
            profileDistrictByUserId.set(userId, extractDistrictToken(row.location_district || null));
            profileLocationByUserId.set(userId, String(row.location_name || "").trim() || null);
          }

          profiles = profiles.map((row) => {
            const userId = String(row.id || "").trim();
            return {
              ...row,
              location_name: resolveDiscoveryLocationLabel({
                liveLocationDistrict: liveLocationDistrictByUserId.get(userId) || null,
                pinDistrict: pinDistrictByUserId.get(userId) || null,
                profileLocationDistrict: profileDistrictByUserId.get(userId) || null,
                profileLocationName: profileLocationByUserId.get(userId) || row.location_name || null,
              }),
            };
          });
        }
        setDiscoveryError(null);
        setDiscoveryProfiles(profiles);
      } catch (err) {
        console.warn("[Discover] discovery fetch failed", err);
        setDiscoveryError("Live discovery is temporarily unavailable.");
        setDiscoveryProfiles([]);
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
    isPremium,
    discoverChatAgeBlocked,
  ]);

  useEffect(() => {
    const loadAlbums = async () => {
      if (discoveryProfiles.length === 0) return;
      const next: Record<string, string[]> = {};
      for (const p of discoveryProfiles) {
        const album = canonicalizeSocialAlbumEntries(Array.isArray(p?.social_album) ? p.social_album : []);
        if (!album.length) continue;
        next[p.id] = await resolveSocialAlbumUrlList(album, 60 * 60);
      }
      if (Object.keys(next).length > 0) {
        setAlbumUrls((prev) => ({ ...prev, ...next }));
      }
    };
    loadAlbums();
  }, [discoveryProfiles]);

  const discoverySource = discoveryProfiles.filter((p) => !hiddenDiscoveryIds.has(p.id));

  return (
    <div className="min-h-svh bg-background pb-nav relative">
      <GlobalHeader
        onUpgradeClick={() => openPremiumForTier("plus")}
      />

      <div>
        <section className="px-5 pb-4 pt-4">
          <h1 className="text-2xl font-bold mb-3">{t("social.discovery")}</h1>
          {discoveryError ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {discoveryError}
              <button className="ml-2 underline" onClick={() => window.location.reload()}>Retry</button>
            </div>
          ) : null}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
            {/* Advanced Filters button */}
            <button
              onClick={() => setFilterSheetOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-background text-xs font-medium shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t("Filters")}
            </button>
            <select
              value={discoveryRole}
              onChange={(e) => setDiscoveryRole(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
            >
              <option value="playdates">{t("Playdates")}</option>
              <option value="nannies">{t("Nannies")}</option>
              <option value="animal-lovers">{t("Animal Lovers")}</option>
            </select>
            <select
              value={discoverySpecies}
              onChange={(e) => setDiscoverySpecies(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
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
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs"
            >
              <option value="Any">{t("Any Gender")}</option>
              {["Male", "Female", "Non-binary"].map((gender) => (
                <option key={gender} value={gender}>{gender}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 h-9">
              <span className="text-[10px] text-muted-foreground">{t("Age")}</span>
              <input
                type="number"
                min={16}
                max={99}
                value={discoveryMinAge}
                onChange={(e) => setDiscoveryMinAge(Number(e.target.value || 16))}
                className="w-12 bg-transparent text-[10px] outline-none"
                onBlur={() => setDiscoveryMinAge((prev) => Math.max(16, Math.min(99, Number.isFinite(prev) ? prev : 16)))}
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
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 h-9">
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
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 h-9">
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
          {Number.isFinite(discoveryMinAge) && discoveryMinAge < 16 && (
            <p className="mt-2 text-center text-xs text-[#7D86A6]">{DISCOVER_MIN_AGE_MESSAGE}</p>
          )}
        </section>

        {discoverChatAgeBlocked ? (
          <section className="px-5 pt-3 pb-[calc(var(--nav-height)+env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto flex w-full max-w-md flex-col items-center">
              <img
                src={discoverAgeGateImage}
                alt="Discover age gate"
                className="w-full max-w-[360px] object-contain"
              />
              <p className="mt-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                {DISCOVER_AGE_GATE_BODY}
              </p>
            </div>
          </section>
        ) : (
        <section className="px-5">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
            {discoveryLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Loading discovery...")}
              </div>
            )}
            {discoverySource.map((p) => {
              const blocked = !!discoveryQuotaReached;
              const age = p?.dob
                ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
                : "";
              const petSpeciesList = getVisiblePetSpecies(p);
              const petSpecies = petSpeciesList.length > 0 ? petSpeciesList.join(", ") : "—";
              const album = (albumUrls[p.id] && albumUrls[p.id].length > 0)
                ? albumUrls[p.id]
                : Array.isArray(p?.social_album) && p.social_album.length > 0
                ? p.social_album
                : p.avatar_url
                ? [p.avatar_url]
                : [];
              const cover = album[0] || profilePlaceholder;

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
                  {/* Quota lock overlay */}
                  {blocked && (
                    <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-md flex flex-col items-center justify-center gap-2 p-4">
                      <Lock className="w-8 h-8 text-brandBlue" />
                      <p className="text-xs text-center font-semibold text-brandText">{quotaConfig.copy.discovery.exhausted.free}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); openPremiumForTier("plus"); }}
                        className="px-4 py-1.5 rounded-full bg-brandBlue text-white text-xs font-bold"
                      >
                        {t("See plans")}
                      </button>
                    </div>
                  )}
                  <img
                    src={cover}
                    alt={p.display_name || ""}
                    className="h-44 w-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = profilePlaceholder; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />

                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.success(t("Wave sent"));
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98]"
                    >
                      <WaveHandIcon size={32} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        navigate(`/chats?with=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.display_name || "Conversation")}`);
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
        )}
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
                  className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center"
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
                  const current = album[activeAlbumIndex] || album[0] || profilePlaceholder;
                  return (
                    <>
                      <MediaThumb
                        src={current}
                        alt={selectedDiscovery.display_name || "Discovery profile"}
                        className="w-full h-72 rounded-none border-0"
                        fallbackSrc={profilePlaceholder}
                      />
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
                  const petSpecies = selectedDiscovery ? getVisiblePetSpecies(selectedDiscovery) : [];
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

      <FilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={advancedFilters}
        onApply={(f) => setAdvancedFilters(f)}
        onPremiumClick={(tier) => { setFilterSheetOpen(false); openPremiumForTier(tier); }}
      />
      <StarUpgradeSheet
        isOpen={isPremiumOpen}
        tier={premiumTier}
        billing={premiumBilling}
        loading={premiumLoading}
        onClose={() => { if (!premiumLoading) setIsPremiumOpen(false); }}
        onBillingChange={setPremiumBilling}
        onUpgrade={handlePremiumUpgrade}
      />
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
