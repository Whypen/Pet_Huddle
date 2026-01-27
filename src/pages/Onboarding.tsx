import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, 
  User, 
  Briefcase, 
  ChevronRight, 
  ChevronLeft,
  Phone,
  Calendar,
  Camera,
  Check,
  Loader2,
  Car,
  Languages,
  PawPrint
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const steps = [
  { id: 1, title: "Security", icon: Shield, description: "Verify your identity" },
  { id: 2, title: "Verification", icon: Check, description: "Government ID check" },
  { id: 3, title: "Profile", icon: User, description: "Tell us about yourself" },
  { id: 4, title: "Skills", icon: Briefcase, description: "Your expertise" },
];

const relationshipOptions = ["Single", "In a Relationship", "Married", "Prefer not to say"];
const genderOptions = ["Male", "Female", "Non-binary", "Prefer not to say"];
const languageOptions = ["English", "Spanish", "French", "German", "Mandarin", "Cantonese", "Japanese", "Korean", "Portuguese", "Italian", "Arabic", "Hindi"];
const petExperienceOptions = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Horses", "Exotic Pets"];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    legal_name: "",
    phone: "",
    gender_genre: "",
    dob: "",
    relationship_status: "",
    languages: [] as string[],
    pet_experience: [] as string[],
    has_car: false,
    location_name: "",
  });

  // Redirect if already onboarded
  useEffect(() => {
    if (profile?.onboarding_completed) {
      navigate("/", { replace: true });
    }
  }, [profile, navigate]);

  // Auto-detect location
  useEffect(() => {
    const detectLocation = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        if (data.city) {
          setFormData(prev => ({ ...prev, location_name: `${data.city}, ${data.country_name}` }));
        }
      } catch (error) {
        console.log("Could not detect location");
      }
    };
    detectLocation();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleArrayItem = (array: string[], item: string) => {
    return array.includes(item) 
      ? array.filter(i => i !== item)
      : [...array, item];
  };

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleNext = async () => {
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
    } else {
      await handleComplete();
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
      let avatarUrl = null;
      
      // Upload avatar if selected
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${user.id}/avatar.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, avatarFile, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);
        
        avatarUrl = publicUrl;
      }
      
      // Update profile
      const { error } = await supabase
        .from("profiles")
        .update({
          legal_name: formData.legal_name,
          phone: formData.phone,
          gender_genre: formData.gender_genre,
          dob: formData.dob || null,
          relationship_status: formData.relationship_status,
          languages: formData.languages,
          pet_experience: formData.pet_experience,
          has_car: formData.has_car,
          location_name: formData.location_name,
          avatar_url: avatarUrl,
          is_verified: true, // Mock verification
          onboarding_completed: true,
        })
        .eq("id", user.id);
      
      if (error) throw error;
      
      await refreshProfile();
      toast.success("Welcome to Huddle! 🎉");
      navigate("/", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "Failed to complete onboarding");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Security Information</h2>
              <p className="text-muted-foreground text-sm mt-1">
                This information is kept private and secure
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Legal Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Enter your legal name"
                    value={formData.legal_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                    className="pl-12 h-12 rounded-xl"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="pl-12 h-12 rounded-xl"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        );
      
      case 2:
        return (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-warning" />
              </div>
              <h2 className="text-xl font-bold">Identity Verification</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Verify your identity to earn a Gold Badge
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-warning/10 to-accent/10 rounded-2xl p-6 border border-warning/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-warning flex items-center justify-center flex-shrink-0">
                  <Check className="w-6 h-6 text-warning-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Stripe Identity</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Securely verify your identity using government-issued ID
                  </p>
                </div>
              </div>
              
              <Button
                onClick={() => toast.success("Identity verified! 🎉")}
                className="w-full mt-6 h-12 rounded-xl bg-warning hover:bg-warning/90 text-warning-foreground font-semibold"
              >
                Verify via Government ID
              </Button>
              
              <p className="text-xs text-center text-muted-foreground mt-4">
                Mock verification - will be replaced with Stripe Identity
              </p>
            </div>
            
            <button 
              onClick={handleNext}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              Skip for now
            </button>
          </motion.div>
        );
      
      case 3:
        return (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">Your Profile</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Let others know who you are
              </p>
            </div>
            
            {/* Avatar Upload */}
            <div className="flex justify-center">
              <label className="relative cursor-pointer group">
                <div className={cn(
                  "w-28 h-28 rounded-full flex items-center justify-center overflow-hidden",
                  "bg-muted border-4 border-dashed border-border group-hover:border-primary transition-colors"
                )}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Camera className="w-4 h-4 text-primary-foreground" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </label>
            </div>
            
            <div className="space-y-4">
              {/* Gender */}
              <div>
                <label className="text-sm font-medium mb-2 block">Gender</label>
                <div className="grid grid-cols-2 gap-2">
                  {genderOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, gender_genre: option }))}
                      className={cn(
                        "px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        formData.gender_genre === option
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Date of Birth */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Date of Birth 
                  {formData.dob && (
                    <span className="text-muted-foreground ml-2">
                      ({calculateAge(formData.dob)} years old)
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                    className="pl-12 h-12 rounded-xl"
                  />
                </div>
              </div>
              
              {/* Relationship Status */}
              <div>
                <label className="text-sm font-medium mb-2 block">Relationship Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {relationshipOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, relationship_status: option }))}
                      className={cn(
                        "px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        formData.relationship_status === option
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        );
      
      case 4:
        return (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold">Skills & Experience</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Help us match you with the right community
              </p>
            </div>
            
            {/* Languages */}
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <Languages className="w-4 h-4" /> Languages
              </label>
              <div className="flex flex-wrap gap-2">
                {languageOptions.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      languages: toggleArrayItem(prev.languages, lang)
                    }))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm transition-all",
                      formData.languages.includes(lang)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Pet Experience */}
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <PawPrint className="w-4 h-4" /> Pet Experience
              </label>
              <div className="flex flex-wrap gap-2">
                {petExperienceOptions.map((exp) => (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      pet_experience: toggleArrayItem(prev.pet_experience, exp)
                    }))}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm transition-all",
                      formData.pet_experience.includes(exp)
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Has Car */}
            <div
              onClick={() => setFormData(prev => ({ ...prev, has_car: !prev.has_car }))}
              className={cn(
                "flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all",
                formData.has_car
                  ? "bg-primary/10 border-2 border-primary"
                  : "bg-muted border-2 border-transparent"
              )}
            >
              <div className="flex items-center gap-3">
                <Car className={cn("w-6 h-6", formData.has_car ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="font-medium">I have a car</p>
                  <p className="text-xs text-muted-foreground">Can transport pets or travel to locations</p>
                </div>
              </div>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                formData.has_car
                  ? "border-primary bg-primary"
                  : "border-muted-foreground"
              )}>
                {formData.has_car && <Check className="w-4 h-4 text-primary-foreground" />}
              </div>
            </div>
            
            {/* Location */}
            {formData.location_name && (
              <div className="bg-muted rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Detected Location</p>
                <p className="font-medium">{formData.location_name}</p>
              </div>
            )}
          </motion.div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Welcome to Huddle</h1>
          <span className="text-sm text-muted-foreground">Step {currentStep} of 4</span>
        </div>
        
        <div className="flex gap-2">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                "flex-1 h-1.5 rounded-full transition-all",
                step.id <= currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>
      
      {/* Step Content */}
      <div className="flex-1 px-6 py-8 overflow-auto">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>
      
      {/* Navigation */}
      <div className="bg-card border-t border-border px-6 py-4 flex gap-3">
        {currentStep > 1 && (
          <Button
            variant="outline"
            onClick={handleBack}
            className="h-12 rounded-xl"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back
          </Button>
        )}
        
        <Button
          onClick={handleNext}
          disabled={loading}
          className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : currentStep === 4 ? (
            "Complete Setup"
          ) : (
            <>
              Continue
              <ChevronRight className="w-5 h-5 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Onboarding;
