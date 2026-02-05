import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ChevronRight, 
  ChevronLeft,
  PawPrint,
  Stethoscope,
  Heart,
  Camera,
  Loader2,
  Dog,
  Cat,
  Bird
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface PetWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const speciesOptions = [
  { id: "dog", label: "Dog", icon: Dog },
  { id: "cat", label: "Cat", icon: Cat },
  { id: "bird", label: "Bird", icon: Bird },
  { id: "rabbit", label: "Rabbit", icon: PawPrint },
  { id: "reptile", label: "Reptile", icon: PawPrint },
  { id: "hamster", label: "Hamster", icon: PawPrint },
  { id: "others", label: "Others", icon: PawPrint },
];

const dogBreeds = [
  "Golden Retriever", "Labrador Retriever", "German Shepherd", "Bulldog", 
  "Poodle", "Beagle", "Rottweiler", "Yorkshire Terrier", "Boxer", "Dachshund",
  "Siberian Husky", "Great Dane", "Doberman", "Shih Tzu", "Boston Terrier",
  "Bernese Mountain Dog", "Pomeranian", "Havanese", "Cavalier King Charles",
  "Miniature Schnauzer", "Australian Shepherd", "Border Collie", "Corgi"
];

const catBreeds = [
  "Persian", "Maine Coon", "Ragdoll", "British Shorthair", "Siamese",
  "Abyssinian", "Bengal", "Birman", "Oriental Shorthair", "Sphynx",
  "Devon Rex", "Scottish Fold", "Norwegian Forest", "Russian Blue",
  "Burmese", "Tonkinese", "Himalayan", "Somali", "American Shorthair"
];

const birdBreeds = [
  "Parakeet", "Cockatiel", "Lovebird", "African Grey", "Macaw",
  "Cockatoo", "Conure", "Finch", "Canary", "Budgerigar"
];

const exoticBreeds = [
  "Rabbit", "Guinea Pig", "Hamster", "Ferret", "Chinchilla",
  "Hedgehog", "Sugar Glider", "Bearded Dragon", "Leopard Gecko", "Ball Python"
];

const temperamentOptions = [
  "Playful", "Calm", "Energetic", "Shy", "Friendly", "Protective", 
  "Curious", "Independent", "Affectionate", "Anxious", "Aggressive"
];

const genderOptions = ["Male", "Female", "Unknown"];

export const PetWizard = ({ isOpen, onClose, onComplete }: PetWizardProps) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [breedSearch, setBreedSearch] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    species: "",
    breed: "",
    gender: "",
    dob: "",
    weight: "",
    weight_unit: "kg",
    microchip_id: "",
    vaccinations: [] as { name: string; date: string }[],
    temperament: [] as string[],
    bio: "",
    vet_contact: "",
    routine: "",
  });

  const [vaccinationInput, setVaccinationInput] = useState({ name: "", date: "" });

  const getBreedOptions = () => {
    switch (formData.species) {
      case "dog": return dogBreeds;
      case "cat": return catBreeds;
      case "bird": return birdBreeds;
      case "exotic": return exoticBreeds;
      default: return [];
    }
  };

  const filteredBreeds = getBreedOptions().filter(breed => 
    breed.toLowerCase().includes(breedSearch.toLowerCase())
  );

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleTemperament = (temp: string) => {
    setFormData(prev => ({
      ...prev,
      temperament: prev.temperament.includes(temp)
        ? prev.temperament.filter(t => t !== temp)
        : [...prev.temperament, temp]
    }));
  };

  const addVaccination = () => {
    if (vaccinationInput.name && vaccinationInput.date) {
      setFormData(prev => ({
        ...prev,
        vaccinations: [...prev.vaccinations, vaccinationInput]
      }));
      setVaccinationInput({ name: "", date: "" });
    }
  };

  const removeVaccination = (index: number) => {
    setFormData(prev => ({
      ...prev,
      vaccinations: prev.vaccinations.filter((_, i) => i !== index)
    }));
  };

  const validateMicrochip = (value: string) => {
    // Remove any non-digit characters
    const digits = value.replace(/\D/g, '');
    // Limit to 15 digits
    return digits.slice(0, 15);
  };

  const handleNext = () => {
    if (currentStep === 1 && (!formData.name || !formData.species)) {
      toast.error(t("Please enter a name and select a species"));
      return;
    }
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    
    setLoading(true);
    
    try {
      let photoUrl = null;
      
      // Upload photo if selected
      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("pets")
          .upload(fileName, photoFile);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from("pets")
          .getPublicUrl(fileName);
        
        photoUrl = publicUrl;
      }
      
      // Insert pet
      const { error } = await supabase
        .from("pets")
        .insert({
          owner_id: user.id,
          name: formData.name,
          species: formData.species,
          breed: formData.breed || null,
          gender: formData.gender || null,
          dob: formData.dob || null,
          weight: formData.weight ? parseInt(formData.weight) : null,
          weight_unit: formData.weight_unit,
          microchip_id: formData.microchip_id || null,
          vaccinations: formData.vaccinations,
          temperament: formData.temperament,
          bio: formData.bio || null,
          vet_contact: formData.vet_contact || null,
          routine: formData.routine || null,
          photo_url: photoUrl,
        });
      
      if (error) throw error;
      
      toast.success(`${formData.name} ${t("has been added to your huddle! 🎉")}`);
      onComplete();
      onClose();
    } catch (error: any) {
      toast.error(error.message || t("Failed to add pet"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background"
    >
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="p-2 -ml-2">
            <X className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">{t("Add New Pet")}</h1>
          <span className="text-sm text-muted-foreground">{t("Step")} {currentStep}/4</span>
        </div>
        
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-all",
                step <= currentStep ? "bg-accent" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-6 pb-32">
        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
                  <PawPrint className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-xl font-bold">{t("Basic Info")}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Tell us about your pet
                </p>
              </div>
              
              {/* Photo Upload */}
              <div className="flex justify-center">
                <label className="relative cursor-pointer group">
                  <div className={cn(
                    "w-28 h-28 rounded-2xl flex items-center justify-center overflow-hidden",
                    "bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors"
                  )}>
                    {photoPreview ? (
                      <img src={photoPreview} alt={t("Pet")} className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                    <Camera className="w-4 h-4 text-accent-foreground" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                </label>
              </div>
              
              {/* Name */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Pet Name *")}</label>
                <Input
                  type="text"
                  placeholder={t("What's your pet's name?")}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="h-12 rounded-xl"
                />
              </div>
              
              {/* Species */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Species *")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {speciesOptions.map((species) => (
                    <button
                      key={species.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, species: species.id, breed: "" }))}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl transition-all",
                        formData.species === species.id
                          ? "bg-primary text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      <species.icon className="w-6 h-6" />
                      <span className="text-xs font-medium">{t(species.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Breed Search */}
              {formData.species && (
                <div>
                  <label className="text-sm font-medium mb-2 block">{t("Breed")}</label>
                  <Input
                    type="text"
                    placeholder={t("Search breeds...")}
                    value={breedSearch}
                    onChange={(e) => setBreedSearch(e.target.value)}
                    className="h-12 rounded-xl mb-2"
                  />
                  <div className="max-h-40 overflow-auto space-y-1">
                    {filteredBreeds.slice(0, 8).map((breed) => (
                      <button
                        key={breed}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, breed }));
                          setBreedSearch(breed);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2 rounded-lg text-sm transition-all",
                          formData.breed === breed
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted/50 hover:bg-muted"
                        )}
                      >
                        {t(breed)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Gender */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Gender")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {genderOptions.map((gender) => (
                    <button
                      key={gender}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, gender }))}
                      className={cn(
                        "px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        formData.gender === gender
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {t(gender)}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                  <Stethoscope className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-bold">{t("Health Vault")}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {t("Keep track of important health info")}
                </p>
              </div>
              
              {/* DOB & Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">{t("Date of Birth")}</label>
                  <Input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                    className="h-12 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">{t("Weight")} ({formData.weight_unit})</label>
                  <Input
                    type="number"
                    placeholder={t("0")}
                    value={formData.weight}
                    onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                    className="h-12 rounded-xl"
                  />
                </div>
              </div>
              
              {/* Microchip */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("Microchip ID (15 digits)")}
                </label>
                <Input
                  type="text"
                  placeholder={t("000000000000000")}
                  value={formData.microchip_id}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    microchip_id: validateMicrochip(e.target.value) 
                  }))}
                  className="h-12 rounded-xl font-mono"
                  maxLength={15}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.microchip_id.length}/15 {t("digits")}
                </p>
              </div>
              
              {/* Vaccinations */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Vaccinations")}</label>
                <div className="space-y-2">
                  {formData.vaccinations.map((vax, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted rounded-lg p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{vax.name}</p>
                        <p className="text-xs text-muted-foreground">{vax.date}</p>
                      </div>
                      <button
                        onClick={() => removeVaccination(index)}
                        className="text-destructive"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={t("Vaccine name")}
                      value={vaccinationInput.name}
                      onChange={(e) => setVaccinationInput(prev => ({ ...prev, name: e.target.value }))}
                      className="h-10 rounded-lg flex-1"
                    />
                    <Input
                      type="date"
                      value={vaccinationInput.date}
                      onChange={(e) => setVaccinationInput(prev => ({ ...prev, date: e.target.value }))}
                      className="h-10 rounded-lg w-36"
                    />
                    <Button
                      type="button"
                      onClick={addVaccination}
                      variant="outline"
                      className="h-10 px-3"
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Vet Contact */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Vet Contact")}</label>
                <Input
                  type="text"
                  placeholder={t("Vet clinic name or phone")}
                  value={formData.vet_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, vet_contact: e.target.value }))}
                  className="h-12 rounded-xl"
                />
              </div>
            </motion.div>
          )}
          
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-warning" />
                </div>
                <h2 className="text-xl font-bold">{t("Personality")}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {t("Help others understand your pet")}
                </p>
              </div>
              
              {/* Temperament */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Temperament Tags")}</label>
                <div className="flex flex-wrap gap-2">
                  {temperamentOptions.map((temp) => (
                    <button
                      key={temp}
                      type="button"
                      onClick={() => toggleTemperament(temp)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm transition-all",
                        formData.temperament.includes(temp)
                          ? temp === "Aggressive" || temp === "Anxious"
                            ? "bg-destructive text-destructive-foreground"
                            : "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {t(temp)}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Bio */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Bio")}</label>
                <Textarea
                  placeholder={t("Tell us about your pet's personality, likes, and dislikes...")}
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  className="rounded-xl min-h-[120px]"
                />
              </div>
              
              {/* Routine */}
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Daily Routine")}</label>
                <Textarea
                  placeholder={t("Feeding times, walks, medications...")}
                  value={formData.routine}
                  onChange={(e) => setFormData(prev => ({ ...prev, routine: e.target.value }))}
                  className="rounded-xl min-h-[100px]"
                />
              </div>
            </motion.div>
          )}
          
          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4 overflow-hidden">
                  {photoPreview ? (
                    <img src={photoPreview} alt={formData.name} className="w-full h-full object-cover" />
                  ) : (
                    <PawPrint className="w-10 h-10 text-accent" />
                  )}
                </div>
                <h2 className="text-xl font-bold">{t("Review")}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {t("Confirm")} {formData.name}{t("'s details")}
                </p>
              </div>
              
              <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Name")}</span>
                  <span className="font-medium">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("Species")}</span>
                  <span className="font-medium capitalize">{t(formData.species)}</span>
                </div>
                {formData.breed && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Breed")}</span>
                    <span className="font-medium">{t(formData.breed)}</span>
                  </div>
                )}
                {formData.gender && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Gender")}</span>
                    <span className="font-medium">{t(formData.gender)}</span>
                  </div>
                )}
                {formData.dob && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Date of Birth")}</span>
                    <span className="font-medium">{formData.dob}</span>
                  </div>
                )}
                {formData.weight && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Weight")}</span>
                    <span className="font-medium">{formData.weight} {formData.weight_unit}</span>
                  </div>
                )}
                {formData.microchip_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Microchip")}</span>
                    <span className="font-mono text-sm">{formData.microchip_id}</span>
                  </div>
                )}
                {formData.temperament.length > 0 && (
                  <div>
                    <span className="text-muted-foreground block mb-2">{t("Temperament")}</span>
                    <div className="flex flex-wrap gap-1">
                      {formData.temperament.map((temp) => (
                        <span key={temp} className="px-2 py-1 bg-muted rounded-full text-xs">
                          {t(temp)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {formData.vaccinations.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("Vaccinations")}</span>
                    <span className="font-medium">{formData.vaccinations.length} {t("recorded")}</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-4 py-4 flex gap-3">
        {currentStep > 1 && (
          <Button
            variant="outline"
            onClick={handleBack}
            className="h-12 rounded-xl"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            {t("Back")}
          </Button>
        )}
        
        <Button
          onClick={handleNext}
          disabled={loading}
          className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : currentStep === 4 ? (
            `${t("Add")} ${formData.name || t("Pet")}`
          ) : (
            <>
              {t("Continue")}
              <ChevronRight className="w-5 h-5 ml-1" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
};
