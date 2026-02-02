import { useState, useEffect } from "react";
import { ArrowLeft, Camera, Loader2, Save, Car, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Option constants matching database schema
const genderOptions = ["Male", "Female", "Non-binary", "PNA"];
const orientationOptions = ["Straight", "Gay/Lesbian", "Bisexual", "Queer", "PNA"];
const degreeOptions = ["College", "Associate Degree", "Bachelor", "Master", "Doctorate / PhD", "PNA"];
const relationshipOptions = ["Single", "In a relationship", "Open relationship", "Married", "Divorced", "PNA"];
const petExperienceOptions = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others"];
const languageOptions = ["English", "Cantonese", "Mandarin", "Spanish", "French", "Japanese", "Korean", "German", "Portuguese", "Italian"];
const availabilityOptions = ["Pet Parents", "Pet Nanny", "Animal Friend (no pet)"];

const EditProfile = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [customLanguage, setCustomLanguage] = useState("");

  const [formData, setFormData] = useState({
    // Basic Info
    display_name: "",
    phone: "",
    dob: "",
    bio: "",

    // Demographics
    gender_genre: "",
    orientation: "",

    // Physical
    height: "",
    weight: "",
    weight_unit: "kg",

    // Education & Career
    degree: "",
    school: "",
    major: "",
    affiliation: "",
    occupation: "",

    // Social & Lifestyle
    relationship_status: "",
    has_car: false,
    languages: [] as string[],
    location_name: "",

    // Pet Experience
    pet_experience: [] as string[],
    experience_years: "",

    // Social Settings
    owns_pets: false,
    social_availability: false,
    availability_status: [] as string[],

    // Privacy toggles
    show_gender: true,
    show_orientation: true,
    show_age: true,
    show_height: false,
    show_weight: false,
    show_academic: false,
    show_affiliation: false,
    show_occupation: false,
    show_bio: true,
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || "",
        phone: profile.phone || "",
        dob: profile.dob || "",
        bio: profile.bio || "",
        gender_genre: profile.gender_genre || "",
        orientation: profile.orientation || "",
        height: profile.height?.toString() || "",
        weight: profile.weight?.toString() || "",
        weight_unit: profile.weight_unit || "kg",
        degree: profile.degree || "",
        school: profile.school || "",
        major: profile.major || "",
        affiliation: profile.affiliation || "",
        occupation: profile.occupation || "",
        relationship_status: profile.relationship_status || "",
        has_car: profile.has_car || false,
        languages: profile.languages || [],
        location_name: profile.location_name || "",
        pet_experience: profile.pet_experience || [],
        experience_years: profile.experience_years?.toString() || "",
        owns_pets: profile.owns_pets || false,
        social_availability: profile.social_availability || false,
        availability_status: profile.availability_status || [],
        show_gender: profile.show_gender ?? true,
        show_orientation: profile.show_orientation ?? true,
        show_age: profile.show_age ?? true,
        show_height: profile.show_height ?? false,
        show_weight: profile.show_weight ?? false,
        show_academic: profile.show_academic ?? false,
        show_affiliation: profile.show_affiliation ?? false,
        show_occupation: profile.show_occupation ?? false,
        show_bio: profile.show_bio ?? true,
      });
      if (profile.avatar_url) {
        setPhotoPreview(profile.avatar_url);
      }
    }
  }, [profile]);

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

  const toggleArrayItem = (field: "availability_status" | "pet_experience" | "languages", item: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(s => s !== item)
        : [...prev[field], item]
    }));
  };

  const addCustomLanguage = () => {
    if (customLanguage.trim() && !formData.languages.includes(customLanguage.trim())) {
      setFormData(prev => ({
        ...prev,
        languages: [...prev.languages, customLanguage.trim()]
      }));
      setCustomLanguage("");
    }
  };

  const removeLanguage = (lang: string) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.filter(l => l !== lang)
    }));
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);

    try {
      let avatarUrl = profile?.avatar_url;

      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${user.id}/avatar.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, photoFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);

        avatarUrl = publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: formData.display_name,
          phone: formData.phone || null,
          bio: formData.bio,
          gender_genre: formData.gender_genre || null,
          orientation: formData.orientation || null,
          dob: formData.dob || null,
          height: formData.height ? parseInt(formData.height) : null,
          weight: formData.weight ? parseInt(formData.weight) : null,
          weight_unit: formData.weight_unit,
          degree: formData.degree || null,
          school: formData.school || null,
          major: formData.major || null,
          affiliation: formData.affiliation || null,
          occupation: formData.occupation || null,
          relationship_status: formData.relationship_status || null,
          has_car: formData.has_car,
          languages: formData.languages.length > 0 ? formData.languages : null,
          location_name: formData.location_name || null,
          pet_experience: formData.pet_experience.length > 0 ? formData.pet_experience : null,
          experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
          owns_pets: formData.owns_pets,
          social_availability: formData.social_availability,
          availability_status: formData.availability_status,
          show_gender: formData.show_gender,
          show_orientation: formData.show_orientation,
          show_age: formData.show_age,
          show_height: formData.show_height,
          show_weight: formData.show_weight,
          show_academic: formData.show_academic,
          show_affiliation: formData.show_affiliation,
          show_occupation: formData.show_occupation,
          show_bio: formData.show_bio,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      await refreshProfile();
      toast.success("Profile updated!");
      navigate(-1);
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      {/* Page Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Edit Profile</h1>
        <Button onClick={handleSave} disabled={loading} size="sm" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </header>

      <StyledScrollArea className="flex-1 px-4 py-6" maxHeight="calc(100vh - 180px)">
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="w-28 h-28 rounded-full flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <Camera className="w-4 h-4 text-accent-foreground" />
              </div>
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>
          </div>

          {/* BASIC INFO */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Info</h3>

            {/* Display Name */}
            <div>
              <label className="text-sm font-medium mb-2 block">Display Name</label>
              <Input
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="Your display name"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium mb-2 block">Phone</label>
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 234 567 8900"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Date of Birth */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Date of Birth</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show Age</span>
                  <Switch
                    checked={formData.show_age}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_age: checked }))}
                  />
                </div>
              </div>
              <Input
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                className="h-12 rounded-xl"
              />
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Bio</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show</span>
                  <Switch
                    checked={formData.show_bio}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_bio: checked }))}
                  />
                </div>
              </div>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Tell others about yourself..."
                className="min-h-[100px] rounded-xl"
              />
            </div>
          </div>

          {/* DEMOGRAPHICS */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Demographics</h3>

            {/* Gender */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Gender</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show</span>
                  <Switch
                    checked={formData.show_gender}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_gender: checked }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {genderOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => setFormData(prev => ({ ...prev, gender_genre: option }))}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium transition-all",
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

            {/* Sexual Orientation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Sexual Orientation</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show</span>
                  <Switch
                    checked={formData.show_orientation}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_orientation: checked }))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {orientationOptions.map((option) => (
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

          {/* PHYSICAL */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Physical</h3>

            {/* Height */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Height (cm)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show</span>
                  <Switch
                    checked={formData.show_height}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_height: checked }))}
                  />
                </div>
              </div>
              <Input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                placeholder="Height in cm"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Weight */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Weight</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show</span>
                  <Switch
                    checked={formData.show_weight}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_weight: checked }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                  placeholder="0"
                  className="h-12 rounded-xl flex-1"
                />
                <select
                  value={formData.weight_unit}
                  onChange={(e) => setFormData(prev => ({ ...prev, weight_unit: e.target.value }))}
                  className="h-12 rounded-xl bg-muted border border-border px-3"
                >
                  <option value="kg">kg</option>
                  <option value="lbs">lbs</option>
                </select>
              </div>
            </div>
          </div>

          {/* EDUCATION & CAREER */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Education & Career</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show Academic</span>
                <Switch
                  checked={formData.show_academic}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_academic: checked }))}
                />
              </div>
            </div>

            {/* Degree */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Highest Degree</label>
              <select
                value={formData.degree}
                onChange={(e) => setFormData(prev => ({ ...prev, degree: e.target.value }))}
                className="w-full h-11 rounded-lg bg-card border border-border px-3 text-sm"
              >
                <option value="">Select degree...</option>
                {degreeOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <Input
              value={formData.school}
              onChange={(e) => setFormData(prev => ({ ...prev, school: e.target.value }))}
              placeholder="School Name"
              className="h-11 rounded-lg"
            />

            <Input
              value={formData.major}
              onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
              placeholder="Major / Field of Study"
              className="h-11 rounded-lg"
            />

            {/* Occupation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Occupation</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Show</span>
                  <Switch
                    checked={formData.show_occupation}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_occupation: checked }))}
                  />
                </div>
              </div>
              <Input
                value={formData.occupation}
                onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                placeholder="Job title / Occupation"
                className="h-11 rounded-lg"
              />
            </div>
          </div>

          {/* Affiliation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Affiliation</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show</span>
                <Switch
                  checked={formData.show_affiliation}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_affiliation: checked }))}
                />
              </div>
            </div>
            <Textarea
              value={formData.affiliation}
              onChange={(e) => setFormData(prev => ({ ...prev, affiliation: e.target.value }))}
              placeholder="Shelters, clubs, organizations..."
              className="min-h-[80px] rounded-xl"
            />
          </div>

          {/* SOCIAL & LIFESTYLE */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Social & Lifestyle</h3>

            {/* Relationship Status */}
            <div>
              <label className="text-sm font-medium mb-2 block">Relationship Status</label>
              <select
                value={formData.relationship_status}
                onChange={(e) => setFormData(prev => ({ ...prev, relationship_status: e.target.value }))}
                className="w-full h-12 rounded-xl bg-muted border border-border px-3"
              >
                <option value="">Select...</option>
                {relationshipOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Has Car */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5 text-blue-500" />
                <div>
                  <span className="text-sm font-medium">Pet Driver with Car?</span>
                  <p className="text-xs text-muted-foreground">Important for pet transport</p>
                </div>
              </div>
              <Switch
                checked={formData.has_car}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_car: checked }))}
              />
            </div>

            {/* Languages */}
            <div>
              <label className="text-sm font-medium mb-2 block">Languages</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {languageOptions.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => toggleArrayItem("languages", lang)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      formData.languages.includes(lang)
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              {/* Custom languages */}
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.languages.filter(l => !languageOptions.includes(l)).map((lang) => (
                  <span
                    key={lang}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-foreground flex items-center gap-1"
                  >
                    {lang}
                    <button onClick={() => removeLanguage(lang)}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                  placeholder="Add other language..."
                  className="h-10 rounded-lg flex-1"
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLanguage())}
                />
                <Button variant="secondary" size="sm" onClick={addCustomLanguage}>Add</Button>
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-sm font-medium mb-2 block">Location</label>
              <Input
                value={formData.location_name}
                onChange={(e) => setFormData(prev => ({ ...prev, location_name: e.target.value }))}
                placeholder="City / Area"
                className="h-12 rounded-xl"
              />
            </div>
          </div>

          {/* PET EXPERIENCE */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pet Experience</h3>

            {/* Pet Experience Types */}
            <div>
              <label className="text-sm font-medium mb-2 block">Experience with</label>
              <div className="flex flex-wrap gap-2">
                {petExperienceOptions.map((exp) => (
                  <button
                    key={exp}
                    onClick={() => toggleArrayItem("pet_experience", exp)}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium transition-all",
                      formData.pet_experience.includes(exp)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>

            {/* Years of Experience */}
            <div>
              <label className="text-sm font-medium mb-2 block">Years of Experience</label>
              <Input
                type="number"
                min="0"
                max="50"
                value={formData.experience_years}
                onChange={(e) => setFormData(prev => ({ ...prev, experience_years: e.target.value }))}
                placeholder="0"
                className="h-12 rounded-xl w-24"
              />
            </div>
          </div>

          {/* Pet Ownership */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <span className="text-sm font-medium">Currently own pets?</span>
            <Switch
              checked={formData.owns_pets}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, owns_pets: checked }))}
            />
          </div>

          {/* Social Availability */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Social Availability</span>
              <Switch
                checked={formData.social_availability}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, social_availability: checked }))}
              />
            </div>
            {formData.social_availability && (
              <div className="flex flex-wrap gap-2">
                {availabilityOptions.map((status) => (
                  <button
                    key={status}
                    onClick={() => toggleArrayItem("availability_status", status)}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium transition-all",
                      formData.availability_status.includes(status)
                        ? "bg-accent text-accent-foreground"
                        : "bg-card text-muted-foreground border border-border"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </StyledScrollArea>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default EditProfile;
