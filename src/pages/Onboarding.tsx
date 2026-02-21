import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import huddleLogo from "@/assets/huddle-logo-transparent.png";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SecurityIdentityStep } from "@/components/onboarding/SecurityIdentityStep";
import { ProfileSetupStep } from "@/components/onboarding/ProfileSetupStep";
import { PetSetupStep } from "@/components/onboarding/PetSetupStep";
import { useLanguage } from "@/contexts/LanguageContext";
import { humanError } from "@/lib/humanError";

// LEGACY: Onboarding page is retained for reference only.
// Do not route to `/onboarding`; App.tsx hard-redirects to `/`.

type OnboardingPhase = "security" | "profile" | "pet";

type ProfileSetupData = {
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  genderGenre?: string | null;
  dob?: string | null;
  locationName?: string | null;
  locationCountry?: string | null;
  locationDistrict?: string | null;
  petExperience: string[];
  experienceYears: number;
  height?: number | null;
  degree?: string | null;
  school?: string | null;
  major?: string | null;
  affiliation?: string | null;
  ownsPets: boolean;
  socialAvailability: boolean;
  availabilityStatus: string[];
  hasCar: boolean;
  languages: string[];
  showGender: boolean;
  showAge: boolean;
  showHeight: boolean;
  showAcademic: boolean;
  showAffiliation: boolean;
  showBio: boolean;
};

const Onboarding = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<OnboardingPhase>("security");
  const [loading, setLoading] = useState(false);
  
  // Security step data
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "none">("none");
  
  // Track if user owns pets (from profile step)
  const [ownsPets, setOwnsPets] = useState(false);

  // Redirect if already onboarded
  useEffect(() => {
    if (profile?.onboarding_completed) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (profile?.legal_name && !legalName) setLegalName(profile.legal_name);
    const metaPhone = typeof user?.user_metadata?.phone === "string" ? user.user_metadata.phone : "";
    const authPhone = typeof user?.phone === "string" ? user.phone : "";
    const profilePhone = typeof profile?.phone === "string" ? profile.phone : "";
    const raw = metaPhone || authPhone || profilePhone || "";
    const next = raw.trim();
    if ((next === "+0000000000" || next === "+10000000000")) {
      return;
    }
    if (next && !phone) setPhone(next);
  }, [profile, legalName, phone, user?.phone, user?.user_metadata?.phone]);

  const handleSecurityComplete = async () => {
    if (!user) return;
    
    // Save security info to profile
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          legal_name: legalName.trim() ? legalName.trim() : null,
          phone: phone.trim() ? phone.trim() : null,
          verification_status: verificationStatus === "pending" ? "pending" : null,
        })
        .eq("id", user.id);

      if (error) throw error;
      
      setPhase("profile");
    } catch (error: unknown) {
      const message = humanError(error);
      toast.error(message || t("Failed to save security information"));
    }
  };

  const handleProfileComplete = async (profileData: ProfileSetupData) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: profileData.displayName,
          avatar_url: profileData.avatarUrl || null,
          bio: profileData.bio || null,
          gender_genre: profileData.genderGenre || null,
          dob: profileData.dob || null,
          location_name: profileData.locationName || null,
          location_country: profileData.locationCountry || null,
          location_district: profileData.locationDistrict || null,
          pet_experience: profileData.petExperience,
          experience_years: profileData.experienceYears,
          height: profileData.height,
          degree: profileData.degree || null,
          school: profileData.school || null,
          major: profileData.major || null,
          affiliation: profileData.affiliation || null,
          owns_pets: profileData.ownsPets,
          social_availability: profileData.socialAvailability,
          availability_status: profileData.availabilityStatus,
          has_car: profileData.hasCar,
          languages: profileData.languages,
          show_gender: profileData.showGender,
          show_age: profileData.showAge,
          show_height: profileData.showHeight,
          show_academic: profileData.showAcademic,
          show_affiliation: profileData.showAffiliation,
          show_bio: profileData.showBio,
          onboarding_completed: !profileData.ownsPets, // Complete if not adding pets
        })
        .eq("id", user.id);

      if (error) throw error;
      
      setOwnsPets(profileData.ownsPets);
      
      if (profileData.ownsPets) {
        setPhase("pet");
      } else {
        await refreshProfile();
        toast.success(t("Welcome to Huddle! 🎉"));
        navigate("/", { replace: true });
      }
    } catch (error: unknown) {
      const message = humanError(error);
      toast.error(message || t("Failed to save profile"));
    } finally {
      setLoading(false);
    }
  };

  const handlePetComplete = async () => {
    if (!user) return;
    
    try {
      // Mark onboarding as complete
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      if (error) throw error;
      
      await refreshProfile();
      toast.success(t("Welcome to Huddle! 🎉"));
      localStorage.removeItem("huddle_offline_actions");
      localStorage.removeItem("pending_addon");
      navigate("/", { replace: true });
    } catch (error: unknown) {
      const message = humanError(error);
      toast.error(message || t("Failed to complete setup"));
    }
  };

  const handlePetSkip = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      if (error) throw error;
      
      await refreshProfile();
      toast.success(t("Welcome to Huddle! You can add pets later."));
      localStorage.removeItem("huddle_offline_actions");
      localStorage.removeItem("pending_addon");
      navigate("/", { replace: true });
    } catch (error: unknown) {
      const message = humanError(error);
      toast.error(message || t("Failed to complete setup"));
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-soft via-background to-accent-soft">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80  border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden">
              <img src={huddleLogo} alt={t("huddle")} className="w-full h-full object-contain" />
            </div>
            <span className="font-bold text-lg text-brandText lowercase">{t("huddle")}</span>
          </div>
          
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className={`h-1.5 rounded-full transition-all ${
              phase === "security" ? "w-8 bg-primary" : "w-2 bg-primary"
            }`} />
            <div className={`h-1.5 rounded-full transition-all ${
              phase === "profile" ? "w-8 bg-primary" : phase === "pet" ? "w-2 bg-primary" : "w-2 bg-muted"
            }`} />
            <div className={`h-1.5 rounded-full transition-all ${
              phase === "pet" ? "w-8 bg-primary" : "w-2 bg-muted"
            }`} />
          </div>
        </div>
      </div>

      {/* Main Content with Styled Scrollbar */}
      <div className="max-w-md mx-auto px-6 py-6 h-[calc(100vh-88px)] overflow-y-auto scrollbar-visible">
        <AnimatePresence mode="wait">
          {phase === "security" && (
            <motion.div
              key="security"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <SecurityIdentityStep
                legalName={legalName}
                phone={phone}
                onLegalNameChange={setLegalName}
                onPhoneChange={setPhone}
                onVerificationStatusChange={(status) => setVerificationStatus(status)}
                onContinue={handleSecurityComplete}
              />
            </motion.div>
          )}

          {phase === "profile" && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <ProfileSetupStep
                userId={user.id}
                initialData={{
                  displayName: profile?.display_name || "",
                  phone: profile?.phone || "",
                  locationName: profile?.location_name || "",
                  locationCountry: profile?.location_country || "",
                  locationDistrict: profile?.location_district || "",
                }}
                onComplete={handleProfileComplete}
              />
            </motion.div>
          )}

          {phase === "pet" && (
            <motion.div
              key="pet"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <PetSetupStep
                userId={user.id}
                onComplete={handlePetComplete}
                onSkip={handlePetSkip}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;
