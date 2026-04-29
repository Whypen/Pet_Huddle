import { motion, AnimatePresence } from "framer-motion";
import { X, Hand, Heart, Star } from "lucide-react";
import { resolveCopy } from "@/lib/copy";
import { useState } from "react";
import { PublicProfileView } from "@/components/profile/PublicProfileView";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    id: string;
    name: string;
    age?: number;
    bio?: string;
    education?: string;
    height?: number;
    occupation?: string;
    isVerified?: boolean;
    hasCar?: boolean;
    avatarUrl?: string;
    pets?: Array<{
      id: string;
      name: string;
      species: string;
      dob?: string | null;
      photoUrl?: string;
    }>;
  };
  onWave?: () => void;
  onSupport?: () => void;
  onStar?: () => void;
}

export const ProfileModal = ({
  isOpen,
  onClose,
  profile,
  onWave,
  onSupport,
  onStar,
}: ProfileModalProps) => {
  const t = resolveCopy;
  const [showMatchPopup, setShowMatchPopup] = useState(false);

  const handleWave = () => {
    // Simulate double wave match (20% chance for demo)
    if (Math.random() < 0.2) {
      setShowMatchPopup(true);
      setTimeout(() => setShowMatchPopup(false), 3000);
    }
    onWave?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
          />

          {/* Modal - anchored below header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-[70px] left-4 right-4 max-w-md mx-auto bg-card rounded-2xl z-50 overflow-hidden shadow-elevated max-h-[70vh]"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Scrollable Content */}
            <div className="overflow-y-auto max-h-[calc(70vh-80px)]">
              <PublicProfileView
                displayName={profile.name}
                bio={profile.bio || ""}
                memberSince={null}
                memberNumber={null}
                membershipTier={null}
                availabilityStatus={[]}
                isVerified={profile.isVerified === true}
                hasCar={profile.hasCar === true}
                photoUrl={profile.avatarUrl || null}
                dob=""
                gender=""
                orientation=""
                height={profile.height ? String(profile.height) : ""}
                petExperience={[]}
                experienceYears=""
                relationshipStatus=""
                degree={profile.education || ""}
                school=""
                major=""
                occupation={profile.occupation || ""}
                affiliation=""
                locationName=""
                languages={[]}
                socialAlbum={[]}
                socialAlbumUrls={{}}
                petHeads={(profile.pets || []).map((pet) => ({
                  id: pet.id,
                  name: pet.name,
                  species: pet.species,
                  dob: pet.dob,
                  photoUrl: pet.photoUrl || null,
                  isPublic: true,
                }))}
                visibility={{
                  show_age: false,
                  show_gender: false,
                  show_orientation: false,
                  show_height: Boolean(profile.height),
                  show_relationship_status: false,
                  show_academic: Boolean(profile.education),
                  show_occupation: Boolean(profile.occupation),
                  show_affiliation: false,
                  show_bio: Boolean(profile.bio),
                }}
              />
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-around p-4 border-t border-border bg-card">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleWave}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <Hand className="w-6 h-6 text-accent-foreground" />
                </div>
                <span className="text-xs font-medium">{t("social.wave")}</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onSupport}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Heart className="w-6 h-6 text-destructive" />
                </div>
                <span className="text-xs font-medium">{t("social.support")}</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onStar}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Star className="w-6 h-6 text-warning" />
                </div>
                <span className="text-xs font-medium">{t("Star")}</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Match Popup */}
          <AnimatePresence>
            {showMatchPopup && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none"
              >
                <div className="bg-gradient-to-br from-accent to-primary rounded-3xl p-8 text-center shadow-elevated">
                  <motion.div
                    animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                    className="text-6xl mb-4"
                  >
                    *
                  </motion.div>
                  <h2 className="text-2xl font-bold text-primary-foreground mb-2">
                    {t("social.match")}
                  </h2>
                  <p className="text-primary-foreground/80">
                    You and {profile.name} waved at each other!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
};
