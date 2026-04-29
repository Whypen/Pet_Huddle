import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Loader2, Star, User, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PublicProfileView } from "@/components/profile/PublicProfileView";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { canonicalizeSocialAlbumEntries, resolveSocialAlbumUrlMap } from "@/lib/socialAlbum";
import { normalizeProfilePhotos } from "@/lib/profilePhotos";
import { toast } from "sonner";
import { quotaConfig } from "@/config/quotaConfig";
import { resolveStarQuotaTier } from "@/lib/starQuota";
import { StarUpgradeSheet } from "@/components/monetization/StarUpgradeSheet";
import { handoffStripeCheckout } from "@/lib/stripeCheckout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendStarChat } from "@/lib/starChat";
import { GlassModal } from "@/components/ui/GlassModal";
import { GlassSheet } from "@/components/ui/GlassSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { PetDetailsBody, getSterilizedLabel, toTitleCase } from "@/components/pets/PetDetailsBody";

type PublicProfileSheetData = {
  created_at?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  availability_status?: string[] | null;
  social_role?: string | null;
  social_id?: string | null;
  verification_status?: string | null;
  is_verified?: boolean | null;
  has_car?: boolean | null;
  dob?: string | null;
  gender_genre?: string | null;
  orientation?: string | null;
  height?: number | string | null;
  pet_experience?: string[] | null;
  pet_experience_years?: number | string | null;
  experience_years?: number | string | null;
  relationship_status?: string | null;
  degree?: string | null;
  school?: string | null;
  major?: string | null;
  occupation?: string | null;
  affiliation?: string | null;
  location_name?: string | null;
  languages?: string[] | null;
  social_album?: string[] | null;
  photos?: unknown;
  profile_editorial_v1?: boolean | null;
  tier?: string | null;
  effective_tier?: string | null;
  pet_heads?: Array<{
    id: string;
    name?: string | null;
    species?: string | null;
    dob?: string | null;
    photo_url?: string | null;
    photoUrl?: string | null;
    is_public?: boolean | null;
  }> | null;
  show_age?: boolean | null;
  show_gender?: boolean | null;
  show_orientation?: boolean | null;
  show_height?: boolean | null;
  show_relationship_status?: boolean | null;
  show_academic?: boolean | null;
  show_occupation?: boolean | null;
  show_affiliation?: boolean | null;
  show_bio?: boolean | null;
  non_social?: boolean | null;
};

type PublicProfileSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  fallbackName?: string;
  data: PublicProfileSheetData | null;
  viewedUserId?: string | null;
  onStarQuotaBlocked?: (tier: "plus" | "gold") => void;
  hideStartChatAction?: boolean;
  zIndexBase?: number;
};

export const PublicProfileSheet = ({ isOpen, onClose, loading, fallbackName, data, viewedUserId, onStarQuotaBlocked, hideStartChatAction = false, zIndexBase = 5500 }: PublicProfileSheetProps) => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [resolvedData, setResolvedData] = useState<PublicProfileSheetData | null>(data);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [socialAlbumUrls, setSocialAlbumUrls] = useState<Record<string, string>>({});
  const [memberNumber, setMemberNumber] = useState<number | null>(null);
  const [petViewOpen, setPetViewOpen] = useState(false);
  const [petViewLoading, setPetViewLoading] = useState(false);
  const [petViewData, setPetViewData] = useState<Record<string, unknown> | null>(null);
  const [starUpgradeTier, setStarUpgradeTier] = useState<"plus" | "gold" | null>(null);
  const [starUpgradeBilling, setStarUpgradeBilling] = useState<"monthly" | "annual">("monthly");
  const [starCheckoutLoading, setStarCheckoutLoading] = useState(false);
  const [confirmStarOpen, setConfirmStarOpen] = useState(false);
  const [starSending, setStarSending] = useState(false);
  const [starFlightVisible, setStarFlightVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setResolvedData(data);
  }, [data]);

  useEffect(() => {
    if (!isOpen || !viewedUserId) return;
    let cancelled = false;
    const load = async () => {
      setResolvedLoading(true);
      try {
        const { data: profileRow, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", viewedUserId)
          .maybeSingle();
        let resolvedRow = profileRow as Record<string, unknown> | null;
        if (error || !resolvedRow) {
          const { data: publicRow } = await supabase
            .from("profiles_public")
            .select("id, display_name, avatar_url, availability_status, user_role, has_car, location_name")
            .eq("id", viewedUserId)
            .maybeSingle();
          resolvedRow = (publicRow as Record<string, unknown> | null) ?? null;
        }
        if (!resolvedRow) {
          if (!cancelled) setResolvedData((data as PublicProfileSheetData | null) ?? null);
          return;
        }
        const { data: pets } = await supabase
          .from("pets")
          .select("id, name, species, dob, photo_url, is_active, is_public")
          .eq("owner_id", viewedUserId);
        const petHeads = (pets || []).filter((pet) => pet.is_active !== false);
        if (!cancelled) {
          setResolvedData({
            ...(data as Record<string, unknown> | null || {}),
            ...resolvedRow,
            pet_heads: petHeads,
          });
        }
      } catch {
        if (!cancelled) setResolvedData((data as PublicProfileSheetData | null) ?? null);
      } finally {
        if (!cancelled) setResolvedLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [data, isOpen, viewedUserId]);

  useEffect(() => {
    if (!isOpen || !resolvedData?.created_at) {
      setMemberNumber(null);
      return;
    }
    let cancelled = false;
    const loadMemberNumber = async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .lte("created_at", resolvedData.created_at);
      if (!cancelled) setMemberNumber(error ? null : count ?? null);
    };
    void loadMemberNumber();
    return () => {
      cancelled = true;
    };
  }, [isOpen, resolvedData?.created_at]);

  const socialAlbum = useMemo(
    () => canonicalizeSocialAlbumEntries(Array.isArray(resolvedData?.social_album) ? resolvedData.social_album : []),
    [resolvedData?.social_album]
  );

  useEffect(() => {
    let cancelled = false;
    const resolveAlbumUrls = async () => {
      const next = await resolveSocialAlbumUrlMap(socialAlbum, 60 * 60);
      if (!cancelled) {
        setSocialAlbumUrls((prev) => {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(next);
          if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) {
            return prev;
          }
          return next;
        });
      }
    };
    void resolveAlbumUrls();
    return () => {
      cancelled = true;
    };
  }, [socialAlbum]);

  const experienceYearsValue = resolvedData?.pet_experience_years ?? resolvedData?.experience_years ?? "";
  const availabilityStatus = Array.isArray(resolvedData?.availability_status) && resolvedData?.availability_status.length > 0
    ? resolvedData.availability_status
    : resolvedData?.social_role
    ? [resolvedData.social_role]
    : [];
  const petHeads = Array.isArray(resolvedData?.pet_heads)
    ? resolvedData.pet_heads.map((pet) => ({
        id: pet.id,
        name: pet.name ?? null,
        species: pet.species ?? null,
        dob: pet.dob ?? null,
        photoUrl: pet.photoUrl ?? pet.photo_url ?? null,
        isPublic: pet.is_public ?? false,
      }))
    : [];

  const canInteract = Boolean(viewedUserId && profile?.id && viewedUserId !== profile.id);
  const viewerAge = useMemo(() => {
    if (!profile?.dob) return null;
    const birthDate = new Date(profile.dob);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return age;
  }, [profile?.dob]);
  const starAllowedByAge = viewerAge == null || viewerAge >= 16;

  const openStarUpsell = (tier: "plus" | "gold") => {
    if (onStarQuotaBlocked) {
      onStarQuotaBlocked(tier);
      return;
    }
    setStarUpgradeTier(tier);
    setStarUpgradeBilling("monthly");
  };

  const handleStar = async () => {
    if (!viewedUserId || !profile?.id) return;
    const tier = resolveStarQuotaTier(profile?.tier);
    if (tier === "free") {
      openStarUpsell("plus");
      return;
    }
    try {
      const result = await sendStarChat({
        senderId: profile.id,
        senderTier: profile?.tier,
        targetUserId: viewedUserId,
        targetName: resolvedData?.display_name || fallbackName || "Conversation",
      });
      if (result.status === "free_tier") {
        openStarUpsell("plus");
        return;
      }
      if (result.status === "exhausted") {
        if (result.upgradeTier === "gold") {
          openStarUpsell("gold");
        } else {
          toast.info(quotaConfig.copy.stars.exhausted);
        }
        return;
      }
      if (result.status === "blocked") {
        toast.error("Cannot start chat with this user.");
        return;
      }
      if (result.status !== "sent") {
        throw new Error("star_failed");
      }
      setStarFlightVisible(true);
      window.setTimeout(() => {
        navigate(`/chat-dialogue?room=${encodeURIComponent(result.roomId)}&name=${encodeURIComponent(resolvedData?.display_name || fallbackName || "Conversation")}&with=${encodeURIComponent(viewedUserId)}`);
        onClose();
        setStarFlightVisible(false);
      }, 900);
    } catch {
      toast.error("Unable to open chat right now.");
    } finally {
      setStarSending(false);
    }
  };

  const closeStarSheet = () => {
    if (starCheckoutLoading) return;
    setStarUpgradeTier(null);
  };

  const handleStarSheetUpgrade = async () => {
    if (!starUpgradeTier || starCheckoutLoading) return;
    setStarCheckoutLoading(true);
    try {
      const selectedPlan = quotaConfig.stripePlans[starUpgradeTier][starUpgradeBilling];
      await handoffStripeCheckout({
        mode: "subscription",
        type: `${starUpgradeTier}_${starUpgradeBilling === "annual" ? "annual" : "monthly"}`,
        lookupKey: selectedPlan.lookupKey,
        priceId: selectedPlan.priceId,
        successUrl: `${window.location.origin}/premium`,
        cancelUrl: window.location.href,
      }, "profile-star-upgrade");
    } catch {
      toast.error("Unable to start checkout right now.");
    } finally {
      setStarCheckoutLoading(false);
    }
  };

  const openPetView = async (petId: string, isPublic: boolean) => {
    if (!isPublic || !petId) return;
    setPetViewOpen(true);
    setPetViewLoading(true);
    try {
      const { data: petRow, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .maybeSingle();
      if (error) throw error;
      setPetViewData((petRow as Record<string, unknown>) || null);
    } catch {
      setPetViewData(null);
      toast.error("Unable to load pet details.");
    } finally {
      setPetViewLoading(false);
    }
  };

  const closePetView = () => {
    setPetViewOpen(false);
    setPetViewData(null);
    setPetViewLoading(false);
  };

  const petAge = (() => {
    const dob = typeof petViewData?.dob === "string" ? petViewData.dob : "";
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years -= 1;
    return years >= 0 ? years : null;
  })();
  const petName = String(petViewData?.name || "Pet");
  const petSpecies = typeof petViewData?.species === "string" ? toTitleCase(petViewData.species) || "Species" : "Species";
  const petBreed = typeof petViewData?.breed === "string" ? petViewData.breed.trim() : "";
  const petGender = typeof petViewData?.gender === "string" ? petViewData.gender : "";
  const petNeuteredSpayed = Boolean(petViewData?.neutered_spayed);
  const petAgeLabel = petAge == null ? "" : `${petAge} ${petAge === 1 ? "year" : "years"}`;

  const profileContent = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0 flex items-baseline gap-2">
          <div className="truncate text-sm font-semibold text-brandText">
            {resolvedData?.display_name || fallbackName || "Profile"}
          </div>
          {resolvedData?.social_id ? (
            <div className="truncate text-xs font-medium text-[rgba(74,73,101,0.55)]">
              @{resolvedData.social_id}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canInteract && starAllowedByAge && !hideStartChatAction ? (
            <button
              type="button"
              onClick={() => setConfirmStarOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/80"
              aria-label="Start chat"
            >
              <Star className="h-4 w-4 text-brandBlue" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/80"
            aria-label="Close profile"
          >
            <X className="h-4 w-4 text-brandText/70" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {(loading || resolvedLoading) ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brandBlue" />
          </div>
        ) : resolvedData?.non_social === true ? (
          <div className="flex h-full items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-5 text-center">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/70">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-brandText">{resolvedData?.display_name || fallbackName || "User"}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                This user has enabled Non-Social mode and is not available for discovery or chat.
              </p>
            </div>
          </div>
        ) : resolvedData ? (
          <PublicProfileView
            displayName={resolvedData.display_name || fallbackName || ""}
            bio={resolvedData.bio || ""}
            memberSince={resolvedData.created_at ?? null}
            memberNumber={memberNumber}
            membershipTier={resolvedData.effective_tier ?? resolvedData.tier ?? null}
            availabilityStatus={availabilityStatus}
            isVerified={resolvedData.is_verified === true}
            hasCar={Boolean(resolvedData.has_car)}
            photoUrl={resolvedData.avatar_url || null}
            dob={resolvedData.dob || ""}
            gender={resolvedData.gender_genre || ""}
            orientation={resolvedData.orientation || ""}
            height={String(resolvedData.height ?? "")}
            petExperience={Array.isArray(resolvedData.pet_experience) ? resolvedData.pet_experience : []}
            experienceYears={String(experienceYearsValue ?? "")}
            relationshipStatus={resolvedData.relationship_status || ""}
            degree={resolvedData.degree || ""}
            school={resolvedData.school || ""}
            major={resolvedData.major || ""}
            occupation={resolvedData.occupation || ""}
            affiliation={resolvedData.affiliation || ""}
            locationName={resolvedData.location_name || ""}
            languages={Array.isArray(resolvedData.languages) ? resolvedData.languages : []}
            socialAlbum={socialAlbum}
            socialAlbumUrls={socialAlbumUrls}
            photos={normalizeProfilePhotos(resolvedData.photos, {
              avatarUrl: resolvedData.avatar_url ?? null,
              socialAlbum,
            })}
            petHeads={petHeads}
            onPetClick={(petId, isPublic) => { void openPetView(petId, isPublic); }}
            visibility={{
              show_age: resolvedData.show_age !== false,
              show_gender: resolvedData.show_gender !== false,
              show_orientation: resolvedData.show_orientation !== false,
              show_height: resolvedData.show_height !== false,
              show_relationship_status: resolvedData.show_relationship_status !== false,
              show_academic: resolvedData.show_academic !== false,
              show_occupation: resolvedData.show_occupation !== false,
              show_affiliation: resolvedData.show_affiliation !== false,
              show_bio: resolvedData.show_bio !== false,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Profile not found
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {isMobile ? (
            <GlassSheet
              isOpen={isOpen}
              onClose={onClose}
              className="h-[88svh] max-h-[calc(100svh-env(safe-area-inset-bottom,0px)-8px)] p-0"
              contentClassName="p-0 pr-0 overflow-hidden"
              hideClose
              zIndexBase={zIndexBase}
            >
              {profileContent}
            </GlassSheet>
          ) : (
            <GlassModal
              isOpen={isOpen}
              onClose={onClose}
              maxWidth="max-w-[560px]"
              className="h-[80svh] max-h-[80svh] overflow-hidden p-0"
              hideClose
              zIndexBase={zIndexBase}
            >
              {profileContent}
            </GlassModal>
          )}
          <Dialog open={confirmStarOpen} onOpenChange={(open) => {
            if (starSending) return;
            setConfirmStarOpen(open);
          }}>
            <DialogContent className="max-w-sm !z-[9800] !top-[38%] !translate-y-0">
              <DialogHeader>
                <DialogTitle>Use a Star to connect?</DialogTitle>
                <DialogDescription>This starts a conversation immediately.</DialogDescription>
              </DialogHeader>
              <DialogFooter className="!flex-row gap-2 pt-2">
                <button
                  type="button"
                  className="flex-1 h-10 rounded-full border border-border bg-[#eceff4] px-4 text-sm font-semibold text-[#4a4965]"
                  disabled={starSending}
                  onClick={() => setConfirmStarOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 h-10 rounded-full bg-[#F5C85C] px-4 text-sm font-semibold text-[#2C2A19] disabled:opacity-50"
                  disabled={starSending}
                  onClick={async () => {
                    setStarSending(true);
                    setConfirmStarOpen(false);
                    await handleStar();
                  }}
                >
                  {starSending ? "Sending..." : "Send Star"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AnimatePresence>
            {starFlightVisible && (
              <motion.div
                className="pointer-events-none fixed inset-0"
                style={{ zIndex: zIndexBase + 250 }}
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="absolute left-[22%] top-[74%] -translate-x-1/2 -translate-y-1/2 text-[#F5C85C] drop-shadow-[0_18px_36px_rgba(245,200,92,0.42)]"
                  initial={{ scale: 0.78, x: 0, y: 0, rotate: -18, opacity: 0.9 }}
                  animate={{ scale: 0.42, x: 178, y: -348, rotate: 20, opacity: 0 }}
                  transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Star size={42} fill="currentColor" stroke="currentColor" strokeWidth={1.8} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {petViewOpen && (
              <>
                <motion.div
                  className="fixed inset-0 bg-black/45"
                  style={{ zIndex: zIndexBase + 100 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closePetView}
                />
                <motion.div
                  className="fixed inset-0 flex items-center justify-center px-4"
                  style={{ zIndex: zIndexBase + 101 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="max-h-[82svh] w-[min(calc(100vw-32px),460px)] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <div className="truncate text-sm font-semibold text-brandText">
                        {typeof petViewData?.name === "string" && petViewData.name.trim() ? petViewData.name : "Pet profile"}
                      </div>
                      <button
                        type="button"
                        onClick={closePetView}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/80"
                        aria-label="Close pet profile"
                      >
                        <X className="h-4 w-4 text-brandText/70" />
                      </button>
                    </div>
                    <div className="max-h-[calc(82svh-57px)] overflow-y-auto p-4">
                      {petViewLoading ? (
                        <div className="flex h-48 items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-brandBlue" />
                        </div>
                      ) : petViewData ? (
                        <div className="space-y-4">
                          <div
                            className="relative mx-auto flex aspect-[5/8] w-full flex-col overflow-hidden bg-white"
                            style={{
                              borderRadius: 14,
                              border: "1.5px solid rgba(176,190,220,0.68)",
                              boxShadow: [
                                "inset 0 0 0 1px rgba(255,255,255,0.52)",
                                "inset 0 0 18px rgba(66,73,101,0.04)",
                                "0 2px 6px rgba(0,0,0,0.06)",
                                "0 12px 36px rgba(66,73,101,0.14)",
                              ].join(", "),
                            }}
                          >
                            <div
                              aria-hidden
                              className="absolute left-1/2 z-[2] -translate-x-1/2"
                              style={{
                                top: 12,
                                width: "28%",
                                height: 11,
                                borderRadius: 999,
                                background: "#ffffff",
                                border: "1px solid rgba(140,155,190,0.45)",
                                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.7)",
                              }}
                            />
                            <div className="relative flex-1 overflow-hidden">
                              {typeof petViewData.photo_url === "string" && petViewData.photo_url ? (
                                <img src={petViewData.photo_url} alt={petName} className="absolute inset-0 h-full w-full object-cover object-center" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-[rgba(237,237,250,0.7)]">
                                  <Camera className="h-10 w-10 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="h-px shrink-0 bg-[rgba(176,190,220,0.45)]" />
                            <div className="flex shrink-0 flex-col items-center gap-[5px] px-4 pb-[14px] pt-4 text-center">
                              <h2 className="w-full truncate text-[clamp(18px,5.5vw,24px)] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
                                {petName}
                              </h2>
                              <p className="w-full truncate text-[clamp(14px,4vw,16px)] font-medium text-[var(--text-secondary)]">
                                {[petSpecies, petBreed].filter(Boolean).join(" · ")}
                              </p>
                              {(petGender || petNeuteredSpayed) ? (
                                <p className="text-[clamp(14px,3.8vw,16px)] text-[rgba(66,73,101,0.58)]">
                                  {[petGender, petNeuteredSpayed ? getSterilizedLabel(petGender) : null].filter(Boolean).join("  ·  ")}
                                </p>
                              ) : null}
                              {petAgeLabel ? (
                                <p className="text-[clamp(14px,3.8vw,16px)] text-[rgba(66,73,101,0.58)]">
                                  {petAgeLabel}
                                </p>
                              ) : null}
                              <p className="mt-1 text-[clamp(9px,2.5vw,11px)] font-semibold uppercase tracking-[0.18em] text-[rgba(66,73,101,0.32)]">
                                PET ID
                              </p>
                            </div>
                          </div>
                          <PetDetailsBody
                            className="pt-1"
                            data={{
                              dob: typeof petViewData.dob === "string" ? petViewData.dob : null,
                              weight: typeof petViewData.weight === "string" || typeof petViewData.weight === "number" ? petViewData.weight : null,
                              weightUnit: typeof petViewData.weight_unit === "string" ? petViewData.weight_unit : null,
                              microchipId: typeof petViewData.microchip_id === "string" ? petViewData.microchip_id : null,
                              bio: typeof petViewData.bio === "string" ? petViewData.bio : null,
                              routine: typeof petViewData.routine === "string" ? petViewData.routine : null,
                              temperament: Array.isArray(petViewData.temperament) ? (petViewData.temperament as string[]) : null,
                              reminder: (petViewData.set_reminder as Parameters<typeof PetDetailsBody>[0]["data"]["reminder"]) ?? null,
                              vetVisits: Array.isArray(petViewData.vet_visit_records) ? (petViewData.vet_visit_records as Parameters<typeof PetDetailsBody>[0]["data"]["vetVisits"]) : null,
                              medications: Array.isArray(petViewData.medications) ? (petViewData.medications as Parameters<typeof PetDetailsBody>[0]["data"]["medications"]) : null,
                              clinicName: typeof petViewData.clinic_name === "string" ? petViewData.clinic_name : null,
                              preferredVet: typeof petViewData.preferred_vet === "string" ? petViewData.preferred_vet : null,
                              phoneNo: typeof petViewData.phone_no === "string" ? petViewData.phone_no : null,
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                          Pet profile not found
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </>
      )}
      <StarUpgradeSheet
        isOpen={Boolean(starUpgradeTier)}
        tier={starUpgradeTier || "plus"}
        billing={starUpgradeBilling}
        loading={starCheckoutLoading}
        onClose={closeStarSheet}
        onBillingChange={setStarUpgradeBilling}
        onUpgrade={handleStarSheetUpgrade}
      />
    </AnimatePresence>
  );
};
