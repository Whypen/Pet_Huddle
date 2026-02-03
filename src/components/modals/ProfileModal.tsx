import { motion, AnimatePresence } from "framer-motion";
import { X, Hand, Heart, Star } from "lucide-react";
import { ProfileBadges } from "@/components/ui/ProfileBadges";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  const { t } = useLanguage();
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
              {/* Header with Avatar */}
              <div className="relative h-48 bg-gradient-to-br from-primary to-accent">
                {profile.avatarUrl && (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              </div>

              {/* Profile Info */}
              <div className="px-6 -mt-10 relative">
                <div className="flex items-end gap-3 mb-4">
                  <div className="w-20 h-20 rounded-full border-4 border-card overflow-hidden bg-muted">
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt={profile.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                        {profile.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold">{profile.name}</h2>
                      {profile.age && <span className="text-muted-foreground">{profile.age}</span>}
                      <ProfileBadges
                        isVerified={profile.isVerified}
                        hasCar={profile.hasCar}
                        size="md"
                      />
                    </div>
                    {profile.isVerified && (
                      <span className="text-xs text-accent font-medium">✓ {t("social.verified")}</span>
                    )}
                  </div>
                </div>

                {/* Bio */}
                {profile.bio && (
                  <p className="text-sm text-muted-foreground mb-4">{profile.bio}</p>
                )}

                {/* Details */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {profile.education && (
                    <span className="px-3 py-1.5 rounded-full bg-muted text-xs font-medium">
                      🎓 {profile.education}
                    </span>
                  )}
                  {profile.height && (
                    <span className="px-3 py-1.5 rounded-full bg-muted text-xs font-medium">
                      📏 {profile.height}cm
                    </span>
                  )}
                  {profile.occupation && (
                    <span className="px-3 py-1.5 rounded-full bg-muted text-xs font-medium">
                      💼 {profile.occupation}
                    </span>
                  )}
                </div>

                {/* Pet Gallery */}
                {profile.pets && profile.pets.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold mb-2">Pets</h3>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {profile.pets.map((pet) => (
                        <div key={pet.id} className="flex-shrink-0 text-center">
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted mb-1">
                            {pet.photoUrl ? (
                              <img
                                src={pet.photoUrl}
                                alt={pet.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-lg">
                                🐾
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-medium">{pet.name}</span>
                          <span className="text-xs text-muted-foreground block capitalize">
                            {pet.species}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                <span className="text-xs font-medium">Star</span>
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
                    🎉
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
