import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Camera, MapPin, Loader2, ChevronRight, Sparkles, Eye, EyeOff, Plus, X, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProfileData {
  avatarUrl: string;
  displayName: string;
  phone: string;
  bio: string;
  genderGenre: string;
  orientation: string;
  dob: string;
  locationName: string;
  petExperience: string[];
  experienceYears: number;
  height: number | null;
  weight: number | null;
  weightUnit: string;
  degree: string;
  school: string;
  major: string;
  occupation: string;
  affiliation: string;
  relationshipStatus: string;
  ownsPets: boolean;
  socialAvailability: boolean;
  availabilityStatus: string[];
  hasCar: boolean;
  languages: string[];
  showGender: boolean;
  showOrientation: boolean;
  showAge: boolean;
  showHeight: boolean;
  showWeight: boolean;
  showAcademic: boolean;
  showOccupation: boolean;
  showAffiliation: boolean;
  showBio: boolean;
}

interface ProfileSetupStepProps {
  userId: string;
  initialData?: Partial<ProfileData>;
  onComplete: (data: ProfileData) => void;
}

const GENDER_OPTIONS = [
  "Male", "Female", "Non-binary", "PNA"
];

const ORIENTATION_OPTIONS = [
  "Straight", "Gay/Lesbian", "Bisexual", "Queer", "PNA"
];

const DEGREE_OPTIONS = [
  "College", "Associate Degree", "Bachelor", "Master", "Doctorate / PhD", "PNA"
];

const RELATIONSHIP_OPTIONS = [
  "Single", "In a relationship", "Open relationship", "Married", "Divorced", "PNA"
];

const PET_EXPERIENCE_OPTIONS = [
  "Dogs", "Cats", "Birds", "Fish", "Reptiles", 
  "Small Mammals", "Horses", "Exotic Pets", "Farm Animals", "None"
];

const AVAILABILITY_STATUS_OPTIONS = [
  "Pet Parents", "Pet Nanny", "Animal Friend (no pet)"
];

const LANGUAGE_OPTIONS = [
  "English", "Cantonese", "Mandarin", "Spanish", "French",
  "Japanese", "Korean", "German", "Portuguese", "Italian"
];

export const ProfileSetupStep = ({ userId, initialData, onComplete }: ProfileSetupStepProps) => {
  const [loading, setLoading] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>(initialData?.avatarUrl || "");
  
  const [formData, setFormData] = useState<ProfileData>({
    avatarUrl: initialData?.avatarUrl || "",
    displayName: initialData?.displayName || "",
    phone: initialData?.phone || "",
    bio: initialData?.bio || "",
    genderGenre: initialData?.genderGenre || "",
    orientation: initialData?.orientation || "",
    dob: initialData?.dob || "",
    locationName: initialData?.locationName || "",
    petExperience: initialData?.petExperience || [],
    experienceYears: initialData?.experienceYears || 0,
    height: initialData?.height || null,
    weight: initialData?.weight || null,
    weightUnit: initialData?.weightUnit || "kg",
    degree: initialData?.degree || "",
    school: initialData?.school || "",
    major: initialData?.major || "",
    occupation: initialData?.occupation || "",
    affiliation: initialData?.affiliation || "",
    relationshipStatus: initialData?.relationshipStatus || "",
    ownsPets: initialData?.ownsPets || false,
    socialAvailability: initialData?.socialAvailability || false,
    availabilityStatus: initialData?.availabilityStatus || [],
    hasCar: initialData?.hasCar || false,
    languages: initialData?.languages || ["English"],
    showGender: initialData?.showGender ?? true,
    showOrientation: initialData?.showOrientation ?? true,
    showAge: initialData?.showAge ?? true,
    showHeight: initialData?.showHeight ?? false,
    showWeight: initialData?.showWeight ?? false,
    showAcademic: initialData?.showAcademic ?? false,
    showOccupation: initialData?.showOccupation ?? false,
    showAffiliation: initialData?.showAffiliation ?? false,
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

  const toggleLanguage = (lang: string) => {
    setFormData(prev => {
      if (prev.languages.includes(lang)) {
        return { ...prev, languages: prev.languages.filter(l => l !== lang) };
      }
      return { ...prev, languages: [...prev.languages, lang] };
    });
  };

  // SPRINT 2: Comprehensive mandatory field validation
  const isMandatoryFieldsValid = () => {
    return (
      formData.displayName.trim().length > 0 &&
      formData.dob.length > 0 &&
      formData.locationName.trim().length > 0 &&
      formData.socialAvailability === true &&
      formData.availabilityStatus.length > 0
    );
  };

  const handleSubmit = async () => {
    if (!formData.displayName.trim()) {
      toast.error("Please enter a display name");
      return;
    }

    if (!formData.dob) {
      toast.error("Please enter your date of birth");
      return;
    }

    if (!formData.locationName.trim()) {
      toast.error("Please enter your location");
      return;
    }

    if (!formData.socialAvailability) {
      toast.error("Please enable social availability");
      return;
    }

    if (formData.availabilityStatus.length === 0) {
      toast.error("Please select at least one availability status");
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

        if (uploadError) {
          console.error("Avatar upload error:", uploadError);
          toast.error("Failed to upload avatar");
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        avatarUrl = publicUrl;
      }

      // Call onComplete which will save to database in Onboarding.tsx
      onComplete({ ...formData, avatarUrl });
      toast.success("Profile information saved!");
    } catch (error: any) {
      console.error("Error in profile setup:", error);
      toast.error(error.message || "Failed to save profile");
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

      {/* Display Name, Phone & Bio */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label><span className="text-destructive">*</span> Display Name</Label>
          <Input
            value={formData.displayName}
            onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="How should others call you?"
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label>Phone (Optional)</Label>
          <Input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="+1 234 567 8900"
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

      {/* Demographics Section */}
      <div className="space-y-4 pt-2 border-t border-border">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Demographics</h3>

        {/* Gender */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Gender</Label>
            <PrivacyToggle
              label="Gender"
              checked={formData.showGender}
              onChange={(checked) => setFormData(prev => ({ ...prev, showGender: checked }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setFormData(prev => ({ ...prev, genderGenre: option }))}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-medium transition-all",
                  formData.genderGenre === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Sexual Orientation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Sexual Orientation</Label>
            <PrivacyToggle
              label="Orientation"
              checked={formData.showOrientation}
              onChange={(checked) => setFormData(prev => ({ ...prev, showOrientation: checked }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ORIENTATION_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setFormData(prev => ({ ...prev, orientation: option }))}
                className={cn(
                  "px-3 py-2 rounded-full text-sm font-medium transition-all",
                  formData.orientation === option
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

      {/* Date of Birth */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label><span className="text-destructive">*</span> Date of Birth</Label>
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
          <span className="text-destructive">*</span> Location
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

      {/* Pet Driver Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
        <div className="flex items-center gap-2">
          <Car className="w-5 h-5 text-primary" />
          <div>
            <Label>Pet Driver</Label>
            <p className="text-xs text-muted-foreground">I have a car and can transport pets</p>
          </div>
        </div>
        <Switch
          checked={formData.hasCar}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, hasCar: checked }))}
        />
      </div>

      {/* Languages */}
      <div className="space-y-3">
        <Label>Languages</Label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map(lang => (
            <Badge
              key={lang}
              variant={formData.languages.includes(lang) ? "default" : "outline"}
              className="cursor-pointer px-3 py-1.5 text-sm"
              onClick={() => toggleLanguage(lang)}
            >
              {lang}
              {formData.languages.includes(lang) && (
                <X className="w-3 h-3 ml-1" />
              )}
            </Badge>
          ))}
        </div>
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

        {/* Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Weight</Label>
            <PrivacyToggle
              label="Weight"
              checked={formData.showWeight}
              onChange={(checked) => setFormData(prev => ({ ...prev, showWeight: checked }))}
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              value={formData.weight || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, weight: parseInt(e.target.value) || null }))}
              placeholder="0"
              className="h-12 rounded-xl flex-1"
            />
            <select
              value={formData.weightUnit}
              onChange={(e) => setFormData(prev => ({ ...prev, weightUnit: e.target.value }))}
              className="h-12 rounded-xl bg-muted border border-border px-3"
            >
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </select>
          </div>
        </div>

        {/* Relationship Status */}
        <div className="space-y-2">
          <Label>Relationship Status</Label>
          <select
            value={formData.relationshipStatus}
            onChange={(e) => setFormData(prev => ({ ...prev, relationshipStatus: e.target.value }))}
            className="w-full h-12 rounded-xl bg-muted border border-border px-3"
          >
            <option value="">Select...</option>
            {RELATIONSHIP_OPTIONS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
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
          <select
            value={formData.degree}
            onChange={(e) => setFormData(prev => ({ ...prev, degree: e.target.value }))}
            className="w-full h-11 rounded-xl bg-muted border border-border px-3 text-sm"
          >
            <option value="">Select degree...</option>
            {DEGREE_OPTIONS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
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

        {/* Occupation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Occupation</Label>
            <PrivacyToggle
              label="Occupation"
              checked={formData.showOccupation}
              onChange={(checked) => setFormData(prev => ({ ...prev, showOccupation: checked }))}
            />
          </div>
          <Input
            value={formData.occupation}
            onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
            placeholder="Job title / Occupation"
            className="h-11 rounded-xl"
          />
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
              <Label><span className="text-destructive">*</span> Social Availability</Label>
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
              <Label className="text-sm"><span className="text-destructive">*</span> I identify as:</Label>
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

      {/* Continue Button */}
      <Button
        onClick={handleSubmit}
        disabled={loading || !isMandatoryFieldsValid()}
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
