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
import { useLanguage } from "@/contexts/LanguageContext";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

// Option constants matching database schema
const genderOptions = ["Male", "Female", "Non-binary", "PNA"];
const orientationOptions = ["Straight", "Gay/Lesbian", "Bisexual", "Queer", "PNA"];
const degreeOptions = ["College", "Associate Degree", "Bachelor", "Master", "Doctorate / PhD", "PNA"];
const relationshipOptions = ["Single", "In a relationship", "Open relationship", "Married", "Divorced", "PNA"];
const petExperienceOptions = ["Dogs", "Cats", "Birds", "Fish", "Reptiles", "Small Mammals", "Farm Animals", "Others", "None"];
const languageOptions = ["English", "Cantonese", "Mandarin", "Spanish", "French", "Japanese", "Korean", "German", "Portuguese", "Italian"];
const availabilityOptions = ["Pet Parents", "Pet Nanny", "Animal Friend (no pet)"];
const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const NUMERIC_ONLY_REGEX = /^\d+$/;

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryOptions = Array.from({ length: 26 * 26 }, (_, idx) => {
  const a = String.fromCharCode(65 + Math.floor(idx / 26));
  const b = String.fromCharCode(65 + (idx % 26));
  const code = `${a}${b}`;
  const label = countryDisplayNames.of(code);
  return label && label !== code && !label.toLowerCase().includes("unknown") ? { code, label } : null;
}).filter((item): item is { code: string; label: string } => Boolean(item))
  .sort((a, b) => a.label.localeCompare(b.label));

const EditProfile = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [customLanguage, setCustomLanguage] = useState("");
  const [petsProfileCount, setPetsProfileCount] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const isIdentityLocked = profile?.verification_status === "approved" || profile?.is_verified;

  const [formData, setFormData] = useState({
    // Basic Info
    display_name: "",
    legal_name: "",
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
      const parsedCountry = (profile.location_name || "").split(",").map((part) => part.trim()).filter(Boolean).pop();
      const matchedCountry = parsedCountry
        ? countryOptions.find((country) => country.label.toLowerCase() === parsedCountry.toLowerCase())
        : null;

      setFormData({
        display_name: profile.display_name || "",
        legal_name: profile.legal_name || "",
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
      setSelectedCountry(matchedCountry?.code || "");
      if (profile.avatar_url) {
        setPhotoPreview(profile.avatar_url);
      }
    }
  }, [profile]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("pets")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .then(({ count }) => {
        const petCount = count || 0;
        setPetsProfileCount(petCount);
        setFormData((prev) => ({
          ...prev,
          owns_pets: petCount > 0,
          availability_status:
            petCount > 0
              ? prev.availability_status.filter((status) => status !== "Animal Friend (no pet)")
              : prev.availability_status,
        }));
      });
  }, [user?.id]);

  useEffect(() => {
    if (formData.pet_experience.includes("None")) {
      setFormData((prev) => ({ ...prev, experience_years: "" }));
    }
  }, [formData.pet_experience]);

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error(t("Geolocation is not supported on this device"));
      return;
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locale = new Intl.Locale(navigator.language || "en");
        const region = locale.region
          ? countryOptions.find((country) => country.code === locale.region)
          : null;
        setSelectedCountry(region?.code || "");
        setFormData((prev) => ({
          ...prev,
          location_name: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}${region ? `, ${region.label}` : ""}`,
        }));
        setDetectingLocation(false);
      },
      () => {
        toast.error(t("Unable to detect current location"));
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

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

    if (!formData.legal_name.trim()) {
      toast.error(t("Legal name is required"));
      return;
    }
    if (!formData.display_name.trim()) {
      toast.error(t("Display name is required"));
      return;
    }
    if (!formData.phone.trim()) {
      toast.error(t("Phone number is required"));
      return;
    }
    if (!E164_PHONE_REGEX.test(formData.phone.trim())) {
      toast.error(t("Phone number must include country code, e.g. +85212345678"));
      return;
    }
    if (!formData.dob) {
      toast.error(t("Date of birth is required"));
      return;
    }
    if (formData.height && (!NUMERIC_ONLY_REGEX.test(formData.height) || Number(formData.height) > 300)) {
      toast.error(t("Height must be a number up to 300"));
      return;
    }
    if (formData.weight && (!NUMERIC_ONLY_REGEX.test(formData.weight) || Number(formData.weight) > 700)) {
      toast.error(t("Weight must be a number up to 700"));
      return;
    }
    if (NUMERIC_ONLY_REGEX.test(formData.school.trim()) && formData.school.trim().length > 0) {
      toast.error(t("School cannot be numbers only"));
      return;
    }
    if (NUMERIC_ONLY_REGEX.test(formData.major.trim()) && formData.major.trim().length > 0) {
      toast.error(t("Major cannot be numbers only"));
      return;
    }
    if (NUMERIC_ONLY_REGEX.test(formData.occupation.trim()) && formData.occupation.trim().length > 0) {
      toast.error(t("Occupation cannot be numbers only"));
      return;
    }
    if (formData.pet_experience.length > 0 && !formData.pet_experience.includes("None")) {
      if (!formData.experience_years || !NUMERIC_ONLY_REGEX.test(formData.experience_years)) {
        toast.error(t("Years of experience must be numeric"));
        return;
      }
    }

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
          display_name: isIdentityLocked ? profile?.display_name || formData.display_name : formData.display_name,
          legal_name: isIdentityLocked ? profile?.legal_name || formData.legal_name : formData.legal_name,
          phone: isIdentityLocked ? profile?.phone || formData.phone : (formData.phone || null),
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
          experience_years:
            formData.pet_experience.includes("None") || !formData.experience_years
              ? null
              : parseInt(formData.experience_years),
          owns_pets: petsProfileCount > 0 ? true : formData.owns_pets,
          social_availability: formData.social_availability,
          availability_status:
            petsProfileCount > 0
              ? formData.availability_status.filter((status) => status !== "Animal Friend (no pet)")
              : formData.availability_status,
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
      toast.success(t("Profile updated!"));
      navigate(-1);
    } catch (error: any) {
      toast.error(error.message || t("Failed to update profile"));
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
        <h1 className="text-xl font-bold flex-1">{t("Edit Profile")}</h1>
        <Button onClick={handleSave} disabled={loading} size="sm" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t("Save")}
        </Button>
      </header>

      <StyledScrollArea className="flex-1 px-4 py-6" maxHeight="calc(100vh - 180px)">
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="w-28 h-28 rounded-full flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img src={photoPreview} alt={t("Profile")} className="w-full h-full object-cover" />
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
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Basic Info")}</h3>

            {/* Legal Name */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Legal Name")}</label>
              <Input
                value={formData.legal_name}
                onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                placeholder={t("Your legal name")}
                className="h-12 rounded-xl"
                required
                disabled={isIdentityLocked}
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Display Name")}</label>
              <Input
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder={t("Your display name")}
                className="h-12 rounded-xl"
                required
                disabled={isIdentityLocked}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Phone")}</label>
              <PhoneInput
                international
                defaultCountry="HK"
                value={formData.phone}
                onChange={(value) => setFormData((prev) => ({ ...prev, phone: value || "" }))}
                className="phone-input-auth h-12 rounded-xl border border-border px-3"
                placeholder={t("Phone (+XXX)")}
                disabled={isIdentityLocked}
              />
            </div>

            {/* Date of Birth */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Date of Birth")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show Age")}</span>
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
                required
              />
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Bio")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show")}</span>
                  <Switch
                    checked={formData.show_bio}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_bio: checked }))}
                  />
                </div>
              </div>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder={t("Tell others about yourself...")}
                className="min-h-[100px] rounded-xl"
              />
            </div>
          </div>

          {/* DEMOGRAPHICS */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Demographics")}</h3>

            {/* Gender */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Gender")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show")}</span>
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
                <label className="text-sm font-medium">{t("Sexual Orientation")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show")}</span>
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
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Physical")}</h3>

            {/* Height */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Height (cm)")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show")}</span>
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
                placeholder={t("Height in cm")}
                className="h-12 rounded-xl"
                min={0}
                max={300}
                inputMode="numeric"
              />
            </div>

            {/* Weight */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">{t("Weight")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show")}</span>
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
                  placeholder={t("0")}
                  className="h-12 rounded-xl flex-1"
                  min={0}
                  max={700}
                  inputMode="numeric"
                />
                <select
                  value={formData.weight_unit}
                  onChange={(e) => setFormData(prev => ({ ...prev, weight_unit: e.target.value }))}
                  className="h-12 rounded-xl bg-muted border border-border px-3"
                >
                  <option value="kg">{t("kg")}</option>
                  <option value="lbs">{t("lbs")}</option>
                </select>
              </div>
            </div>
          </div>

          {/* EDUCATION & CAREER */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{t("Education & Career")}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("Show Academic")}</span>
                <Switch
                  checked={formData.show_academic}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_academic: checked }))}
                />
              </div>
            </div>

            {/* Degree */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("Highest Degree")}</label>
              <select
                value={formData.degree}
                onChange={(e) => setFormData(prev => ({ ...prev, degree: e.target.value }))}
                className="w-full h-11 rounded-lg bg-card border border-border px-3 text-sm"
              >
                <option value="">{t("Select degree...")}</option>
                {degreeOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <Input
              value={formData.school}
              onChange={(e) => setFormData(prev => ({ ...prev, school: e.target.value }))}
              placeholder={t("School Name")}
              className="h-11 rounded-lg"
            />

            <Input
              value={formData.major}
              onChange={(e) => setFormData(prev => ({ ...prev, major: e.target.value }))}
              placeholder={t("Major / Field of Study")}
              className="h-11 rounded-lg"
            />

            {/* Occupation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">{t("Occupation")}</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("Show")}</span>
                  <Switch
                    checked={formData.show_occupation}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_occupation: checked }))}
                  />
                </div>
              </div>
              <Input
                value={formData.occupation}
                onChange={(e) => setFormData(prev => ({ ...prev, occupation: e.target.value }))}
                placeholder={t("Job title / Occupation")}
                className="h-11 rounded-lg"
              />
            </div>
          </div>

          {/* Affiliation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t("Affiliation")}</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("Show")}</span>
                <Switch
                  checked={formData.show_affiliation}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, show_affiliation: checked }))}
                />
              </div>
            </div>
            <Textarea
              value={formData.affiliation}
              onChange={(e) => setFormData(prev => ({ ...prev, affiliation: e.target.value }))}
              placeholder={t("Shelters, clubs, organizations...")}
              className="min-h-[80px] rounded-xl"
            />
          </div>

          {/* SOCIAL & LIFESTYLE */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Social & Lifestyle")}</h3>

            {/* Relationship Status */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Relationship Status")}</label>
              <select
                value={formData.relationship_status}
                onChange={(e) => setFormData(prev => ({ ...prev, relationship_status: e.target.value }))}
                className="w-full h-12 rounded-xl bg-muted border border-border px-3"
              >
                <option value="">{t("Select...")}</option>
                {relationshipOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Has Car */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-3">
                <Car className="w-5 h-5" style={{ color: "#3283FF" }} />
                <div>
                  <span className="text-sm font-medium">{t("Pet Driver with Car?")}</span>
                  <p className="text-xs text-muted-foreground">{t("Important for pet transport")}</p>
                </div>
              </div>
              <Switch
                checked={formData.has_car}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, has_car: checked }))}
              />
            </div>

            {/* Languages */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Languages")}</label>
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
                  placeholder={t("Add other language...")}
                  className="h-10 rounded-lg flex-1"
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLanguage())}
                />
                <Button variant="secondary" size="sm" onClick={addCustomLanguage}>{t("Add")}</Button>
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Location")}</label>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useCurrentLocation}
                  disabled={detectingLocation}
                >
                  {detectingLocation ? t("Detecting...") : t("Use Current Location")}
                </Button>
                <select
                  value={selectedCountry}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedCountry(code);
                    const countryLabel = countryOptions.find((country) => country.code === code)?.label || "";
                    setFormData((prev) => ({
                      ...prev,
                      location_name: prev.location_name.includes(",")
                        ? `${prev.location_name.split(",")[0].trim()}, ${countryLabel}`
                        : countryLabel,
                    }));
                  }}
                  className="h-9 rounded-lg bg-muted border border-border px-3 text-sm flex-1"
                >
                  <option value="">{t("Select country")}</option>
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                value={formData.location_name}
                onChange={(e) => setFormData(prev => ({ ...prev, location_name: e.target.value }))}
                placeholder={t("City / Area, Country")}
                className="h-12 rounded-xl"
              />
            </div>
          </div>

          {/* PET EXPERIENCE */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Pet Experience")}</h3>

            {/* Pet Experience Types */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Experience with")}</label>
              <div className="flex flex-wrap gap-2">
                {petExperienceOptions.map((exp) => (
                  <button
                    key={exp}
                    onClick={() => {
                      if (exp === "None") {
                        setFormData((prev) => ({
                          ...prev,
                          pet_experience: prev.pet_experience.includes("None") ? [] : ["None"],
                          experience_years: "",
                        }));
                        return;
                      }
                      setFormData((prev) => {
                        const withoutNone = prev.pet_experience.filter((item) => item !== "None");
                        const next = withoutNone.includes(exp)
                          ? withoutNone.filter((item) => item !== exp)
                          : [...withoutNone, exp];
                        return { ...prev, pet_experience: next };
                      });
                    }}
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
            {formData.pet_experience.length > 0 && !formData.pet_experience.includes("None") && (
              <div>
                <label className="text-sm font-medium mb-2 block">{t("Years of Experience")}</label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  value={formData.experience_years}
                  onChange={(e) => setFormData(prev => ({ ...prev, experience_years: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder={t("0")}
                  className="h-12 rounded-xl w-28"
                  inputMode="numeric"
                />
                {formData.experience_years === "0" && (
                  <p className="text-xs text-muted-foreground mt-1">{t("Less than 1 year")}</p>
                )}
              </div>
            )}
          </div>

          {/* Pet Ownership */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
            <span className="text-sm font-medium">{t("Currently own pets?")}</span>
            <Switch
              checked={petsProfileCount > 0 ? true : formData.owns_pets}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, owns_pets: checked }))}
              disabled={petsProfileCount > 0}
            />
          </div>

          {/* Social Availability */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{t("Social Availability")}</span>
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
                    onClick={() => {
                      if (petsProfileCount > 0 && status === "Animal Friend (no pet)") {
                        toast.error(t("Animal Friend (no pet) is unavailable when you already have pet profiles"));
                        return;
                      }
                      toggleArrayItem("availability_status", status);
                    }}
                    disabled={petsProfileCount > 0 && status === "Animal Friend (no pet)"}
                    className={cn(
                      "px-3 py-2 rounded-full text-sm font-medium transition-all",
                      formData.availability_status.includes(status)
                        ? "bg-accent text-accent-foreground"
                        : "bg-card text-muted-foreground border border-border",
                      petsProfileCount > 0 && status === "Animal Friend (no pet)" && "opacity-40 cursor-not-allowed"
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
