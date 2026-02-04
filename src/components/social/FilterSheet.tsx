import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Dog, Cat, User, Car, GraduationCap, Shield, Zap, Users, Heart, Bird, PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECIES_LIST } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (filters: FilterState) => void;
  onPremiumClick: () => void;
}

export interface FilterState {
  role: "playdates" | "nannies" | "animal-lovers";
  selectedRoles?: ("playdates" | "nannies" | "animal-lovers")[];
  species: string[];
  distance: number;
  seeFurther: boolean; // SPRINT 3: See Further toggle for extending max distance
  ageRange: [number, number];
  gender: string;
  petHeight: string;
  languages: string[]; // SPRINT 3: Language filter
  // Premium filters (stored but not applied for free users)
  verifiedOnly: boolean;
  activeNow: boolean;
  temperamentMatch: boolean;
  hasCar: boolean;
  petSchoolGrad: boolean;
  commonFriends: boolean;
}

// SPRINT 3: Default filters with 150km max distance, ±3 year age range
export const defaultFilters: FilterState = {
  role: "playdates",
  species: [],
  distance: 50,
  seeFurther: false, // Default to standard range
  ageRange: [18, 65], // Will be dynamically set to user's age ±3 in component
  gender: "",
  petHeight: "",
  languages: [],
  verifiedOnly: false,
  activeNow: false,
  temperamentMatch: false,
  hasCar: false,
  petSchoolGrad: false,
  commonFriends: false,
};

const roles = [
  { id: "nannies", labelKey: "social.nannies" },
  { id: "playdates", labelKey: "social.playdates" },
  { id: "animal-lovers", labelKey: "social.animal_lovers" },
] as const;

// Species options from master list with icons
const getSpeciesIcon = (species: string) => {
  switch (species) {
    case "Dog": return Dog;
    case "Cat": return Cat;
    case "Bird": return Bird;
    default: return PawPrint;
  }
};

const speciesOptions = [
  ...SPECIES_LIST.filter(s => s !== "Others").map(s => ({
    id: s.toLowerCase(),
    label: s,
    icon: getSpeciesIcon(s)
  })),
  { id: "people", label: "People Only", icon: User },
];

const genderOptions = ["Any", "Male", "Female", "Non-binary"];
const petHeightOptions = ["Any", "Small", "Medium", "Large", "Extra Large"];

// SPRINT 3: Language filter options
const languageOptions = [
  "English", "Cantonese", "Mandarin", "Spanish", "French",
  "Japanese", "Korean", "German", "Portuguese", "Italian"
];

export const FilterSheet = ({ isOpen, onClose, filters, onApply, onPremiumClick }: FilterSheetProps) => {
  const { t } = useLanguage();
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  const handleRoleChange = (role: FilterState["role"]) => {
    setLocalFilters(prev => ({ ...prev, role }));
  };

  const handleSpeciesToggle = (species: string) => {
    setLocalFilters(prev => ({
      ...prev,
      species: prev.species.includes(species)
        ? prev.species.filter(s => s !== species)
        : [...prev.species, species]
    }));
  };

  const handlePremiumToggle = (key: keyof FilterState) => {
    onPremiumClick();
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
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

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-card rounded-t-3xl z-50 max-h-[90vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-xl font-bold">{t("Filters")}</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Basic Filters Section */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  {t("Basic Filters")}
                </h3>

                {/* Role Multi-Select (Checkboxes) */}
                <div className="mb-5">
                  <label className="text-sm font-medium mb-3 block">{t("Looking for")}</label>
                  <div className="space-y-2">
                    {roles.map((role) => {
                      const isSelected = localFilters.selectedRoles?.includes(role.id) || localFilters.role === role.id;
                      return (
                        <button
                          key={role.id}
                          onClick={() => {
                            setLocalFilters(prev => {
                              const currentRoles = prev.selectedRoles || [prev.role];
                              const newRoles = currentRoles.includes(role.id)
                                ? currentRoles.filter(r => r !== role.id)
                                : [...currentRoles, role.id];
                              return { 
                                ...prev, 
                                selectedRoles: newRoles.length > 0 ? newRoles : [role.id],
                                role: newRoles[0] as FilterState["role"]
                              };
                            });
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-xl border transition-all",
                            isSelected
                              ? "bg-accent/10 border-accent text-foreground"
                              : "bg-card border-border text-muted-foreground hover:border-primary/30"
                          )}
                        >
                          <div className={cn(
                            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                            isSelected
                              ? "bg-accent border-accent"
                              : "border-muted-foreground/40"
                          )}>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                                <path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/>
                              </svg>
                            )}
                          </div>
                          <span className="font-medium">{t(role.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Species Selector */}
                <div className="mb-5">
                  <label className="text-sm font-medium mb-2 block">{t("Species")}</label>
                  <div className="flex gap-2 flex-wrap">
                    {speciesOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => handleSpeciesToggle(option.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border",
                          localFilters.species.includes(option.id)
                            ? "bg-accent text-accent-foreground border-accent"
                            : "bg-card border-border text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        <option.icon className="w-4 h-4" />
                        {t(option.label)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Distance Slider - SPRINT 3: 150km max, See Further toggle */}
                <div className="mb-5">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium">{t("Distance")}</label>
                    <span className="text-sm font-semibold text-primary">
                      {t("map.distance_km").replace("{count}", String(localFilters.distance))}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={localFilters.seeFurther ? "500" : "150"}
                    value={localFilters.distance > 150 && !localFilters.seeFurther ? 150 : localFilters.distance}
                    onChange={(e) => setLocalFilters(prev => ({ ...prev, distance: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{t("map.distance_km").replace("{count}", "1")}</span>
                    <span>
                      {localFilters.seeFurther
                        ? t("map.distance_km").replace("{count}", "500")
                        : t("map.distance_km_max").replace("{count}", "150")}
                    </span>
                  </div>
                  {/* See Further Toggle */}
                  <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-muted/50">
                    <div>
                      <label className="text-sm font-medium">{t("See Further")}</label>
                      <p className="text-xs text-muted-foreground">{t("Extend search beyond 150km")}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={localFilters.seeFurther}
                      onChange={(e) => setLocalFilters(prev => ({ ...prev, seeFurther: e.target.checked }))}
                      className="w-5 h-5 rounded accent-primary cursor-pointer"
                    />
                  </div>
                </div>

                {/* Demographics */}
                <div className="mb-5">
                  <label className="text-sm font-medium mb-3 block">{t("Demographics")}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Age Range */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("Age Range")}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={localFilters.ageRange[0]}
                          onChange={(e) => setLocalFilters(prev => ({ 
                            ...prev, 
                            ageRange: [parseInt(e.target.value), prev.ageRange[1]] 
                          }))}
                          className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <span className="text-muted-foreground">-</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={localFilters.ageRange[1]}
                          onChange={(e) => setLocalFilters(prev => ({ 
                            ...prev, 
                            ageRange: [prev.ageRange[0], parseInt(e.target.value)] 
                          }))}
                          className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">{t("Gender")}</label>
                      <select
                        value={localFilters.gender}
                        onChange={(e) => setLocalFilters(prev => ({ ...prev, gender: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                      >
                        {genderOptions.map(opt => (
                          <option key={opt} value={opt === "Any" ? "" : opt}>{t(opt)}</option>
                        ))}
                      </select>
                    </div>

                    {/* Pet Height */}
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">{t("Pet Height")}</label>
                      <select
                        value={localFilters.petHeight}
                        onChange={(e) => setLocalFilters(prev => ({ ...prev, petHeight: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/50 appearance-none"
                      >
                        {petHeightOptions.map(opt => (
                          <option key={opt} value={opt === "Any" ? "" : opt}>{t(opt)}</option>
                        ))}
                      </select>
                    </div>

                    {/* SPRINT 3: Language Filter */}
                    <div className="col-span-2">
                      <label className="text-xs text-muted-foreground mb-1 block">{t("Languages")}</label>
                      <div className="flex flex-wrap gap-2">
                        {languageOptions.map((lang) => {
                          const isSelected = localFilters.languages.includes(lang);
                          return (
                            <button
                              key={lang}
                              onClick={() => {
                                setLocalFilters(prev => ({
                                  ...prev,
                                  languages: isSelected
                                    ? prev.languages.filter(l => l !== lang)
                                    : [...prev.languages, lang]
                                }));
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                              )}
                            >
                              {t(lang)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Premium Filters Section */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("Premium Filters")}
                  </h3>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-[#3283FF] to-[#1E40AF] text-xs font-semibold text-white">
                    <Lock className="w-3 h-3" />
                    {t("PRO")}
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Verification */}
                  <PremiumToggle
                    icon={Shield}
                    label={t("Verified Only")}
                    description={t("ID-checked users only")}
                    checked={localFilters.verifiedOnly}
                    onToggle={() => handlePremiumToggle("verifiedOnly")}
                  />

                  {/* Activity */}
                  <PremiumToggle
                    icon={Zap}
                    label={t("Active Now")}
                    description={t("Seen in last 24 hours")}
                    checked={localFilters.activeNow}
                    onToggle={() => handlePremiumToggle("activeNow")}
                  />

                  {/* Compatibility */}
                  <PremiumToggle
                    icon={Heart}
                    label={t("Pet Temperament Match")}
                    description={t("Filter by personality sync")}
                    checked={localFilters.temperamentMatch}
                    onToggle={() => handlePremiumToggle("temperamentMatch")}
                  />

                  {/* Logistics & Skills */}
                  <div className="p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium">{t("Logistics & Skills")}</span>
                      <Lock className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handlePremiumToggle("hasCar")}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-full text-sm border transition-all",
                          localFilters.hasCar
                            ? "bg-accent text-accent-foreground border-accent"
                            : "bg-card border-border text-muted-foreground"
                        )}
                      >
                        <Car className="w-4 h-4" />
                        {t("Has a Car")}
                      </button>
                      <button
                        onClick={() => handlePremiumToggle("petSchoolGrad")}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-full text-sm border transition-all",
                          localFilters.petSchoolGrad
                            ? "bg-accent text-accent-foreground border-accent"
                            : "bg-card border-border text-muted-foreground"
                        )}
                      >
                        <GraduationCap className="w-4 h-4" />
                        {t("Pet School Graduates")}
                      </button>
                    </div>
                  </div>

                  {/* Connections */}
                  <PremiumToggle
                    icon={Users}
                    label={t("Common Huddle Friends")}
                    description={t("Show mutual connections")}
                    checked={localFilters.commonFriends}
                    onToggle={() => handlePremiumToggle("commonFriends")}
                  />
                </div>
              </div>
            </div>

            {/* Sticky Apply Button */}
            <div className="p-4 border-t border-border bg-card">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleApply}
                className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg shadow-lg"
              >
                {t("Apply Filters")}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

interface PremiumToggleProps {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}

const PremiumToggle = ({ icon: Icon, label, description, checked, onToggle }: PremiumToggleProps) => (
  <button
    onClick={onToggle}
    className="w-full flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border hover:border-primary/30 transition-all"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center">
        <Icon className="w-5 h-5 text-[#3283FF]" />
      </div>
      <div className="text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <Lock className="w-3 h-3 text-primary" />
        </div>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
    <div className={cn(
      "w-12 h-7 rounded-full transition-colors relative",
      checked ? "bg-accent" : "bg-border"
    )}>
      <div className={cn(
        "absolute top-1 w-5 h-5 rounded-full bg-card shadow-sm transition-transform",
        checked ? "translate-x-6" : "translate-x-1"
      )} />
    </div>
  </button>
);
