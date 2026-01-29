import { useState, useEffect } from "react";
import { ArrowLeft, Camera, Loader2, Save } from "lucide-react";
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

const genderOptions = ["Male", "Female", "Non-binary", "Prefer not to say"];
const orientationOptions = ["Straight", "Gay", "Bisexual", "Trans", "Non-binary", "Prefer not to say"];
const availabilityOptions = ["Pet Parents", "Pet Carer", "Animal Friend (no pet)"];

const EditProfile = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    display_name: "",
    bio: "",
    gender_genre: "",
    dob: "",
    height: "",
    degree: "",
    school: "",
    major: "",
    affiliation: "",
    owns_pets: false,
    social_availability: false,
    availability_status: [] as string[],
    // Privacy toggles
    show_gender: true,
    show_age: true,
    show_height: false,
    show_academic: false,
    show_affiliation: false,
    show_bio: true,
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || "",
        bio: profile.bio || "",
        gender_genre: profile.gender_genre || "",
        dob: profile.dob || "",
        height: profile.height?.toString() || "",
        degree: profile.degree || "",
        school: profile.school || "",
        major: profile.major || "",
        affiliation: profile.affiliation || "",
        owns_pets: profile.owns_pets || false,
        social_availability: profile.social_availability || false,
        availability_status: profile.availability_status || [],
        show_gender: profile.show_gender ?? true,
        show_age: profile.show_age ?? true,
        show_height: profile.show_height ?? false,
        show_academic: profile.show_academic ?? false,
        show_affiliation: profile.show_affiliation ?? false,
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

  const toggleAvailabilityStatus = (status: string) => {
    setFormData(prev => ({
      ...prev,
      availability_status: prev.availability_status.includes(status)
        ? prev.availability_status.filter(s => s !== status)
        : [...prev.availability_status, status]
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
          bio: formData.bio,
          gender_genre: formData.gender_genre,
          dob: formData.dob || null,
          height: formData.height ? parseInt(formData.height) : null,
          degree: formData.degree || null,
          school: formData.school || null,
          major: formData.major || null,
          affiliation: formData.affiliation || null,
          owns_pets: formData.owns_pets,
          social_availability: formData.social_availability,
          availability_status: formData.availability_status,
          show_gender: formData.show_gender,
          show_age: formData.show_age,
          show_height: formData.show_height,
          show_academic: formData.show_academic,
          show_affiliation: formData.show_affiliation,
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

          {/* Gender */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Gender / Orientation</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show</span>
                <Switch
                  checked={formData.show_gender}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_gender: checked }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...genderOptions, ...orientationOptions].map((option) => (
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

          {/* DOB */}
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

          {/* Academic */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Academic & Skills</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show</span>
                <Switch
                  checked={formData.show_academic}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_academic: checked }))}
                />
              </div>
            </div>
            <Input
              value={formData.degree}
              onChange={(e) => setFormData(prev => ({ ...prev, degree: e.target.value }))}
              placeholder="Highest Degree"
              className="h-11 rounded-lg"
            />
            <Input
              value={formData.school}
              onChange={(e) => setFormData(prev => ({ ...prev, school: e.target.value }))}
              placeholder="School Name"
              className="h-11 rounded-lg"
            />
            <Input
              value={formData.major}
              onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
              placeholder="Major"
              className="h-11 rounded-lg"
            />
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
                    onClick={() => toggleAvailabilityStatus(status)}
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
