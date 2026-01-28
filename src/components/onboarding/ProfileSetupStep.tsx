import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, MapPin, Loader2, ChevronRight, Sparkles, Eye, EyeOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProfileData {
  avatarUrl: string;
  displayName: string;
  bio: string;
  genderGenre: string;
  dob: string;
  locationName: string;
  petExperience: string[];
  experienceYears: number;
  height: number | null;
  degree: string;
  school: string;
  major: string;
  affiliation: string;
  ownsPets: boolean;
  socialAvailability: boolean;
  availabilityStatus: string[];
  showGender: boolean;
  showAge: boolean;
  showHeight: boolean;
  showAcademic: boolean;
  showAffiliation: boolean;
  showBio: boolean;
}

interface ProfileSetupStepProps {
  userId: string;
  initialData?: Partial<ProfileData>;
  onComplete: (data: ProfileData) => void;
}

const GENDER_OPTIONS = [
  "Male", "Female", "Non-binary", "Trans Male", "Trans Female", 
  "Genderqueer", "Genderfluid", "Prefer not to say"
];

const GENRE_OPTIONS = [
  "Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", 
  "Asexual", "Queer", "Prefer not to say"
];

const PET_EXPERIENCE_OPTIONS = [
  "Dogs", "Cats", "Birds", "Fish", "Reptiles", 
  "Small Mammals", "Horses", "Exotic Pets", "Farm Animals", "None"
];

const AVAILABILITY_STATUS_OPTIONS = [
  "Pet Parents", "Pet Carer", "Animal Friend (no pet)"
];

export const ProfileSetupStep = ({ userId, initialData, onComplete }: ProfileSetupStepProps) => {
  const [loading, setLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>(initialData?.avatarUrl || "");
  
  const [formData, setFormData] = useState<ProfileData>({
    avatarUrl: initialData?.avatarUrl || "",
    displayName: initialData?.displayName || "",
    bio: initialData?.bio || "",
    genderGenre: initialData?.genderGenre || "",
    dob: initialData?.dob || "",
    locationName: initialData?.locationName || "",
    petExperience: initialData?.petExperience || [],
    experienceYears: initialData?.experienceYears || 0,
    height: initialData?.height || null,
    degree: initialData?.degree || "",
    school: initialData?.school || "",
    major: initialData?.major || "",
    affiliation: initialData?.affiliation || "",
    ownsPets: initialData?.ownsPets || false,
    socialAvailability: initialData?.socialAvailability || false,
    availabilityStatus: initialData?.availabilityStatus || [],
    showGender: initialData?.showGender ?? true,
    showAge: initialData?.showAge ?? true,
    showHeight: initialData?.showHeight ?? true,
    showAcademic: initialData?.showAcademic ?? true,
    showAffiliation: initialData?.showAffiliation ?? true,
    showBio: initialData?.showBio ?? true,
  });

  // Detect location when DOB changes
  useEffect(() => {
    if (formData.dob && !formData.locationName) {
      detectLocation();
    }
  }, [formData.dob]);

  const detectLocation = async () => {
    setDetectingLocation(true);
    try {
      const response = await fetch("https://ipapi.co/json/");
      const data = await response.json();
      if (data.city && data.country_name) {
        setFormData(prev => ({
          ...prev,
          locationName: `${data.city}, ${data.country_name}`
        }));
      }
    } catch (error) {
      console.error("Location detection failed:", error);
    } finally {
      setDetectingLocation(false);
    }
  };

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

  const togglePetExperience = (exp: string) => {
    setFormData(prev => {
      if (exp === "None") {
        return { ...prev, petExperience: prev.petExperience.includes("None") ? [] : ["None"] };
      }
      const filtered = prev.petExperience.filter(e => e !== "None");
      if (filtered.includes(exp)) {
        return { ...prev, petExperience: filtered.filter(e => e !== exp) };
      }
      return { ...prev, petExperience: [...filtered, exp] };
    });
  };

  const toggleAvailabilityStatus = (status: string) => {
    setFormData(prev => {
      if (prev.availabilityStatus.includes(status)) {
        return { ...prev, availabilityStatus: prev.availabilityStatus.filter(s => s !== status) };
      }
      return { ...prev, availabilityStatus: [...prev.availabilityStatus, status] };
    });
  };

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      toast.error("Please enter a display name");
      return;
    }

    setLoading(true);
    try {
      let avatarUrl = formData.avatarUrl;

      // Upload avatar if selected
      if (avatarFile) {
        const fileExt = avatarFile.name.split(".").pop();
        const filePath = `${userId}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, avatarFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        avatarUrl = publicUrl;
      }

      onComplete({ ...formData, avatarUrl });
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile");
    } finally {
      setLoading(false);
    }
  };

  const PrivacyToggle = ({ 
    label, 
    checked, 
    onChange 
  }: { 
    label: string; 
    checked: boolean; 
    onChange: (checked: boolean) => void 
  }) => (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {checked ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      <span>Show to others</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="text-center space-y-2 sticky top-0 bg-background/95 backdrop-blur-sm py-4 -mx-6 px-6 z-10">
        <h2 className="text-2xl font-bold text-foreground">Profile Setup</h2>
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-warning" />
          Filling in more details increases your social level
        </p>
      </div>

      {/* Avatar Upload */}
      <div className="flex justify-center">
        <label className="relative cursor-pointer group">
          <div className="w-28 h-28 rounded-full bg-muted overflow-hidden border-4 border-primary/20 group-hover:border-primary/40 transition-colors">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary-foreground" />
          </div>
          <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </label>
      </div>

      {/* Display Name & Bio */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Display Name *</Label>
          <Input
            value={formData.displayName}
            onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="How should others call you?"
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Bio</Label>
            <PrivacyToggle
              label="Bio"
              checked={formData.showBio}
              onChange={(checked) => setFormData(prev => ({ ...prev, showBio: checked }))}
            />
          </div>
          <Textarea
            value={formData.bio}
            onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
            placeholder="Tell us about yourself..."
            className="rounded-xl resize-none"
            rows={3}
          />
        </div>
      </div>

      {/* Gender & Genre */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Gender & Orientation</Label>
          <PrivacyToggle
            label="Gender"
            checked={formData.showGender}
            onChange={(checked) => setFormData(prev => ({ ...prev, showGender: checked }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={formData.genderGenre.split(" / ")[0] || ""}
            onValueChange={(value) => {
              const genre = formData.genderGenre.split(" / ")[1] || "";
              setFormData(prev => ({ 
                ...prev, 
                genderGenre: genre ? `${value} / ${genre}` : value 
              }));
            }}
          >
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={formData.genderGenre.split(" / ")[1] || ""}
            onValueChange={(value) => {
              const gender = formData.genderGenre.split(" / ")[0] || "";
              setFormData(prev => ({ 
                ...prev, 
                genderGenre: gender ? `${gender} / ${value}` : value 
              }));
            }}
          >
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Orientation" />
            </SelectTrigger>
            <SelectContent>
              {GENRE_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date of Birth */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Date of Birth</Label>
          <PrivacyToggle
            label="Age"
            checked={formData.showAge}
            onChange={(checked) => setFormData(prev => ({ ...prev, showAge: checked }))}
          />
        </div>
        <Input
          type="date"
          value={formData.dob}
          onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
          className="h-12 rounded-xl"
        />
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Location
        </Label>
        <div className="relative">
          <Input
            value={formData.locationName}
            onChange={(e) => setFormData(prev => ({ ...prev, locationName: e.target.value }))}
            placeholder="Your city"
            className="h-12 rounded-xl pr-10"
          />
          {detectingLocation && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Pet Experience */}
      <div className="space-y-3">
        <Label>Pet Experience</Label>
        <div className="flex flex-wrap gap-2">
          {PET_EXPERIENCE_OPTIONS.map(exp => (
            <Badge
              key={exp}
              variant={formData.petExperience.includes(exp) ? "default" : "outline"}
              className="cursor-pointer px-3 py-1.5 text-sm"
              onClick={() => togglePetExperience(exp)}
            >
              {exp}
              {formData.petExperience.includes(exp) && (
                <X className="w-3 h-3 ml-1" />
              )}
            </Badge>
          ))}
        </div>
        {formData.petExperience.length > 0 && !formData.petExperience.includes("None") && (
          <div className="flex items-center gap-3">
            <Label className="text-sm">Years of experience</Label>
            <Input
              type="number"
              min="0"
              max="50"
              value={formData.experienceYears}
              onChange={(e) => setFormData(prev => ({ ...prev, experienceYears: parseInt(e.target.value) || 0 }))}
              className="w-20 h-10 rounded-xl"
            />
          </div>
        )}
      </div>

      {/* Optional Fields - Social Level Boosters */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-warning" />
          Social Level Boosters
        </h3>

        {/* Height */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Height (cm)</Label>
            <PrivacyToggle
              label="Height"
              checked={formData.showHeight}
              onChange={(checked) => setFormData(prev => ({ ...prev, showHeight: checked }))}
            />
          </div>
          <Input
            type="number"
            min="100"
            max="250"
            value={formData.height || ""}
            onChange={(e) => setFormData(prev => ({ ...prev, height: parseInt(e.target.value) || null }))}
            placeholder="Your height in cm"
            className="h-12 rounded-xl"
          />
        </div>

        {/* Academic */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Academic & Skills</Label>
            <PrivacyToggle
              label="Academic"
              checked={formData.showAcademic}
              onChange={(checked) => setFormData(prev => ({ ...prev, showAcademic: checked }))}
            />
          </div>
          <Input
            value={formData.degree}
            onChange={(e) => setFormData(prev => ({ ...prev, degree: e.target.value }))}
            placeholder="Highest Degree (e.g., Bachelor's, Master's)"
            className="h-11 rounded-xl"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={formData.school}
              onChange={(e) => setFormData(prev => ({ ...prev, school: e.target.value }))}
              placeholder="School Name"
              className="h-11 rounded-xl"
            />
            <Input
              value={formData.major}
              onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
              placeholder="Major"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        {/* Affiliation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Affiliation</Label>
            <PrivacyToggle
              label="Affiliation"
              checked={formData.showAffiliation}
              onChange={(checked) => setFormData(prev => ({ ...prev, showAffiliation: checked }))}
            />
          </div>
          <Textarea
            value={formData.affiliation}
            onChange={(e) => setFormData(prev => ({ ...prev, affiliation: e.target.value }))}
            placeholder="Local shelters, clubs, organizations..."
            className="rounded-xl resize-none"
            rows={2}
          />
        </div>

        {/* Pet Ownership */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
          <div>
            <Label>Currently own any pets?</Label>
            <p className="text-xs text-muted-foreground">You can add pet profiles later</p>
          </div>
          <Switch
            checked={formData.ownsPets}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, ownsPets: checked }))}
          />
        </div>

        {/* Social Availability */}
        <div className="space-y-3 p-4 rounded-xl bg-muted/50">
          <div className="flex items-center justify-between">
            <div>
              <Label>Social Availability</Label>
              <p className="text-xs text-muted-foreground">Are you open to connecting?</p>
            </div>
            <Switch
              checked={formData.socialAvailability}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, socialAvailability: checked }))}
            />
          </div>
          
          {formData.socialAvailability && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="pt-3 space-y-2"
            >
              <Label className="text-sm">I identify as:</Label>
              <div className="flex flex-wrap gap-2">
                {AVAILABILITY_STATUS_OPTIONS.map(status => (
                  <Badge
                    key={status}
                    variant={formData.availabilityStatus.includes(status) ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1.5 text-sm"
                    onClick={() => toggleAvailabilityStatus(status)}
                  >
                    {status}
                  </Badge>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Premium Upsell */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-warning/10 to-primary/10 border border-warning/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">Unlock Premium Features</p>
            <p className="text-xs text-muted-foreground">More visibility, advanced matching & more</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full">
            Learn More
          </Button>
        </div>
      </div>

      {/* Continue Button */}
      <Button
        onClick={handleSubmit}
        disabled={loading || !formData.displayName.trim()}
        className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            {formData.ownsPets ? "Continue to Pet Setup" : "Complete Setup"}
            <ChevronRight className="w-5 h-5 ml-2" />
          </>
        )}
      </Button>
    </div>
  );
};
