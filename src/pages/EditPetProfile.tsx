import { useState, useEffect } from "react";
import { ArrowLeft, Camera, Loader2, Save, X, Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorLabel } from "@/components/ui/ErrorLabel";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VACCINATION_OPTIONS, TEMPERAMENT_OPTIONS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { useQueryClient } from "@tanstack/react-query";

// Species options matching database
const speciesOptions = [
  { id: "dog", label: "Dogs" },
  { id: "cat", label: "Cats" },
  { id: "bird", label: "Birds" },
  { id: "fish", label: "Fish" },
  { id: "reptile", label: "Reptiles" },
  { id: "small_mammal", label: "Small Mammals" },
  { id: "farm_animal", label: "Farm Animals" },
  { id: "others", label: "Others" },
];

const catBreeds = [
  "Siamese",
  "Persian",
  "Maine Coon",
  "Ragdoll",
  "Bengal",
  "British Shorthair",
  "Sphynx",
  "Scottish Fold",
  "Abyssinian",
  "Other",
];

const speciesBreeds: Record<string, string[]> = {
  dog: ["Labrador Retriever", "Golden Retriever", "French Bulldog", "Poodle", "Corgi", "Shiba Inu", "Other"],
  cat: catBreeds,
  bird: ["Budgie", "Cockatiel", "Canary", "Parrot", "Other"],
  fish: ["Betta", "Goldfish", "Guppy", "Tetra", "Other"],
  reptile: ["Gecko", "Bearded Dragon", "Turtle", "Snake", "Other"],
  small_mammal: ["Hamster", "Rabbit", "Guinea Pig", "Ferret", "Other"],
  farm_animal: ["Goat", "Pig", "Chicken", "Duck", "Other"],
};

const genderOptions = ["Male", "Female"];

const EditPetProfile = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get("id");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(!!petId);
  const [saving, setSaving] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isNewPet, setIsNewPet] = useState(!petId);

  const [formData, setFormData] = useState({
    name: "",
    species: "",
    custom_species: "",
    breed: "",
    gender: "",
    neutered_spayed: false,
    dob: "",
    weight: "",
    weight_unit: "kg",
    bio: "",
    routine: "",
    clinic_name: "",
    preferred_vet: "",
    phone_no: "",
    microchip_id: "",
    temperament: [] as string[],
    vaccinations: [] as { name: string; date: string }[],
    vaccination_dates: [] as string[],
    next_vaccination_reminder: "",
    medications: [] as { name: string; dosage: string; frequency: string }[],
    is_active: true,
    is_public: true,
  });

  const [vaccinationInput, setVaccinationInput] = useState({ name: "", date: "" });
  const [medicationInput, setMedicationInput] = useState({ name: "", dosage: "", frequency: "" });
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    species: "",
    customSpecies: "",
    petDob: "",
    weight: "",
    vaccinationDate: "",
    nextVaccination: "",
    microchipId: "",
  });

  const hasErrors = Object.values(fieldErrors).some(Boolean);
  const hasRequiredFields =
    formData.name.trim().length > 0 &&
    (formData.species !== "" || formData.custom_species.trim().length > 0) &&
    (formData.species !== "others" || formData.custom_species.trim().length > 0);
  const isFormValid = hasRequiredFields && !hasErrors;

  useEffect(() => {
    if (petId) {
      fetchPet();
    } else {
      setLoading(false);
    }
  }, [petId]);

  const fetchPet = async () => {
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      if (error) throw error;

      if (data) {
        const d = data as any;
        const isKnownSpecies = speciesOptions.some(s => s.id === d.species);
        setFormData({
          name: d.name || "",
          species: isKnownSpecies ? d.species : "others",
          custom_species: isKnownSpecies ? "" : d.species || "",
          breed: d.breed || "",
          gender: d.gender || "",
          neutered_spayed: d.neutered_spayed || false,
          dob: d.dob || "",
          weight: d.weight?.toString() || "",
          weight_unit: d.weight_unit || "kg",
          bio: d.bio || "",
          routine: d.routine || "",
          clinic_name: d.clinic_name || "",
          preferred_vet: d.preferred_vet || "",
          phone_no: d.phone_no || "",
          microchip_id: d.microchip_id || "",
          temperament: d.temperament || [],
          vaccinations: Array.isArray(d.vaccinations) ? d.vaccinations : [],
          vaccination_dates: d.vaccination_dates || [],
          next_vaccination_reminder: d.next_vaccination_reminder || "",
          medications: Array.isArray(d.medications) ? d.medications : [],
          is_active: d.is_active ?? true,
          is_public: d.is_public ?? true,
        });
        if (d.photo_url) {
          setPhotoPreview(d.photo_url);
        }
      }
    } catch (error) {
      console.error("Error fetching pet:", error);
      toast.error(t("Failed to load pet"));
    } finally {
      setLoading(false);
    }
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

  const toggleTemperament = (temp: string) => {
    setFormData(prev => ({
      ...prev,
      temperament: prev.temperament.includes(temp)
        ? prev.temperament.filter(t => t !== temp)
        : [...prev.temperament, temp]
    }));
  };

  const addVaccination = () => {
    if (vaccinationInput.date) {
      const vaxDate = new Date(vaccinationInput.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (vaxDate > today) {
        setFieldErrors((prev) => ({
          ...prev,
          vaccinationDate: t("Vaccination date cannot be in the future"),
        }));
        return;
      }
    }
    if (vaccinationInput.name && vaccinationInput.date) {
      setFieldErrors((prev) => ({ ...prev, vaccinationDate: "" }));
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

  const addMedication = () => {
    if (medicationInput.name) {
      setFormData(prev => ({
        ...prev,
        medications: [...prev.medications, medicationInput]
      }));
      setMedicationInput({ name: "", dosage: "", frequency: "" });
    }
  };

  const removeMedication = (index: number) => {
    setFormData(prev => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index)
    }));
  };

  const validateMicrochip = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.slice(0, 15);
  };

  const handleSave = async () => {
    if (!user) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!formData.name.trim()) {
      setFieldErrors((prev) => ({ ...prev, name: t("Pet name is required") }));
    }

    if (!formData.species && !formData.custom_species.trim()) {
      setFieldErrors((prev) => ({ ...prev, species: t("Species is required") }));
    }

    if (formData.species === "others" && !formData.custom_species.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        customSpecies: t("Species is required"),
      }));
    }

    if (!formData.name.trim() || (!formData.species && !formData.custom_species.trim())) {
      return;
    }

    if (formData.dob) {
      const petDob = new Date(formData.dob);
      if (petDob > today) {
        setFieldErrors((prev) => ({
          ...prev,
          petDob: t("Pet DOB cannot be in the future"),
        }));
        return;
      }
    }

    if (formData.weight && (formData.weight.length > 4 || Number(formData.weight) > 9999)) {
      setFieldErrors((prev) => ({
        ...prev,
        weight: t("Pet weight must be 4 digits or less"),
      }));
      return;
    }

    if (formData.next_vaccination_reminder) {
      const reminderDate = new Date(formData.next_vaccination_reminder);
      if (reminderDate <= today) {
        setFieldErrors((prev) => ({
          ...prev,
          nextVaccination: t("Next vaccination must be in the future"),
        }));
        return;
      }
    }

    if (formData.microchip_id && formData.microchip_id.length !== 15) {
      setFieldErrors((prev) => ({
        ...prev,
        microchipId: t("Microchip ID must be 15 digits"),
      }));
      return;
    }

    if (formData.next_vaccination_reminder) {
      const reminderDate = new Date(formData.next_vaccination_reminder);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (reminderDate <= today) {
        setFieldErrors((prev) => ({
          ...prev,
          nextVaccination: t("Next vaccination must be in the future"),
        }));
        return;
      }
    }

    setSaving(true);

    try {
      let photoUrl = photoPreview;
      const finalPetId = petId || crypto.randomUUID();

      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${user.id}/${finalPetId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("pets")
          .upload(fileName, photoFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("pets")
          .getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      const petData = {
        name: formData.name,
        species: formData.species === "others" ? formData.custom_species : formData.species,
        breed: formData.breed || null,
        gender: formData.gender || null,
        neutered_spayed: formData.neutered_spayed,
        dob: formData.dob || null,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        weight_unit: formData.weight_unit,
        bio: formData.bio || null,
        routine: formData.routine || null,
        clinic_name: formData.clinic_name || null,
        preferred_vet: formData.preferred_vet || null,
        phone_no: formData.phone_no || null,
        vet_contact:
          [formData.clinic_name, formData.preferred_vet, formData.phone_no]
            .filter(Boolean)
            .join(" | ") || null,
        microchip_id: formData.microchip_id || null,
        temperament: formData.temperament.length > 0 ? formData.temperament : null,
        vaccinations: formData.vaccinations.length > 0 ? formData.vaccinations : null,
        vaccination_dates: formData.vaccination_dates.length > 0 ? formData.vaccination_dates : null,
        next_vaccination_reminder: formData.next_vaccination_reminder || null,
        medications: formData.medications.length > 0 ? formData.medications : null,
        is_active: formData.is_active,
        is_public: formData.is_public,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      };

      // UAT: Next Event must pull from Supabase reminders table.
      // Persist the "Next Vaccination Reminder" as a canonical reminder row for this pet.
      const syncVaccinationReminder = async (targetPetId: string) => {
        try {
          const kind = "Vaccination";
          // Delete the previous canonical record so we don't accumulate duplicates.
          await (supabase as any).from("reminders").delete().eq("pet_id", targetPetId).eq("kind", kind);

          if (formData.next_vaccination_reminder) {
            await (supabase as any).from("reminders").insert({
              owner_id: user.id,
              pet_id: targetPetId,
              kind,
              reason: "Vaccination/ Check-up Reminder",
              due_date: formData.next_vaccination_reminder,
            });
          }
        } catch (e) {
          // If the table isn't deployed yet, don't block pet save.
          console.warn("[EditPetProfile] reminders sync failed", e);
        }
      };

      if (isNewPet) {
        const { error } = await supabase
          .from("pets")
          .insert({
            id: finalPetId,
            owner_id: user.id,
            ...petData,
            created_at: new Date().toISOString(),
          });

        if (error) throw error;
        await syncVaccinationReminder(finalPetId);
        toast.success(t("Pet added!"));
        await queryClient.invalidateQueries({ queryKey: ["pets"] });
      } else {
        const { error } = await supabase
          .from("pets")
          .update(petData)
          .eq("id", petId);

        if (error) throw error;
        await syncVaccinationReminder(finalPetId);
        toast.success(t("Pet profile updated!"));
        await queryClient.invalidateQueries({ queryKey: ["pets"] });
      }

      navigate(-1);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message || t("Failed to save pet"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-nav border border-[#e2e4e6]">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      {/* Page Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">{isNewPet ? "Add Pet" : "Edit Pet Profile"}</h1>
        <Button onClick={handleSave} disabled={saving || !isFormValid} size="sm" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </header>

      <StyledScrollArea className="flex-1 px-4 py-6" maxHeight="calc(100vh - 180px)">
        <div className="space-y-6">
          {/* Photo Upload - Circular 100px */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="w-[100px] h-[100px] rounded-full flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img src={photoPreview} alt={t("Pet")} className="w-full h-full object-cover" />
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

          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Pet Name *")}</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              onBlur={() => {
                setFieldErrors((prev) => ({
                  ...prev,
                  name: formData.name.trim() ? "" : t("Pet name is required"),
                }));
              }}
              placeholder={t("Pet's name")}
              className="rounded-[12px] h-[30px]"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && <ErrorLabel message={fieldErrors.name} />}
          </div>

          {/* Species */}
          <div className="h-[64px] flex flex-col justify-start items-start">
            <label className="text-sm font-medium mb-1 block">{t("Species *")}</label>
            <div className={cn("flex flex-wrap gap-[5px] m-[0_4px_8px_0]", fieldErrors.species && "rounded-xl border border-red-500 p-2")}>
              {speciesOptions.map((species) => (
                <button
                  key={species.id}
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    species: species.id,
                    breed: species.id === "others" ? "" : prev.breed,
                  }))}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    formData.species === species.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {t(species.label)}
                </button>
              ))}
            </div>
            {formData.species === "others" && (
              <Input
                value={formData.custom_species}
                onChange={(e) => setFormData(prev => ({ ...prev, custom_species: e.target.value }))}
                onBlur={() => {
                  setFieldErrors((prev) => ({
                    ...prev,
                    customSpecies: formData.custom_species.trim() ? "" : t("Species is required"),
                  }));
                }}
                placeholder={t("Enter species...")}
                className="rounded-[12px] mt-2"
                aria-invalid={Boolean(fieldErrors.customSpecies)}
              />
            )}
            {fieldErrors.species && <ErrorLabel message={fieldErrors.species} />}
            {fieldErrors.customSpecies && <ErrorLabel message={fieldErrors.customSpecies} />}
          </div>

          {/* Breed */}
          {formData.species !== "others" && (
            <div>
              <label className="text-sm font-medium mb-1 block">{t("Breed")}</label>
              <select
                value={formData.breed}
                onChange={(e) => setFormData(prev => ({ ...prev, breed: e.target.value }))}
                className="h-9 w-full rounded-[12px] border border-[#e2e4e6] bg-white px-2 py-1 text-sm text-left"
              >
                <option value="">{t("Select breed")}</option>
                {(speciesBreeds[formData.species] || ["Other"]).map((breed) => (
                  <option key={breed} value={breed}>
                    {t(breed)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Gender & Neutered/Spayed */}
          <div className="flex flex-col gap-4">
            <div className="self-stretch">
              <label className="text-sm font-medium mb-1 block">{t("Gender")}</label>

              <div className="flex flex-col gap-2">
                {/* Neutered/Spayed Toggle - Compacted */}
                <div className="inline-flex items-center justify-between h-[36px] w-[220px] bg-[#f6f7f9] rounded-full px-4 py-2">
                  <span className="text-sm font-medium">{t("Neutered/Spayed")}</span>
                  <Switch
                    checked={formData.neutered_spayed}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, neutered_spayed: checked }))}
                    className="scale-75"
                  />
                </div>

                {/* Gender Options */}
                <div className="inline-flex items-center gap-2 h-[36px]">
                  {genderOptions.map((gender) => (
                    <button
                      key={gender}
                      onClick={() => setFormData(prev => ({ ...prev, gender }))}
                      className={cn(
                        "h-full px-4 rounded-full text-sm font-medium transition-all",
                        formData.gender === gender
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      {gender}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* DOB */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Date of Birth")}</label>
            <Input
              type="date"
              value={formData.dob}
              onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
              onBlur={() => {
                if (!formData.dob) return;
                const petDob = new Date(formData.dob);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                setFieldErrors((prev) => ({
                  ...prev,
                  petDob: petDob > today ? t("Pet DOB cannot be in the future") : "",
                }));
              }}
              className="rounded-[12px]"
              aria-invalid={Boolean(fieldErrors.petDob)}
            />
            {fieldErrors.petDob && (
              <ErrorLabel message={fieldErrors.petDob} />
            )}
          </div>

          {/* Weight */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Weight")}</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={formData.weight}
                onChange={(e) => {
                  const next = e.target.value;
                  setFormData(prev => ({ ...prev, weight: next }));
                  if (next && (next.length > 4 || Number(next) > 9999)) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      weight: t("Pet weight must be 4 digits or less"),
                    }));
                  } else {
                    setFieldErrors((prev) => ({ ...prev, weight: "" }));
                  }
                }}
                placeholder={t("0")}
                className="rounded-[12px] flex-1"
                aria-invalid={Boolean(fieldErrors.weight)}
              />
              <select
                value={formData.weight_unit}
                onChange={(e) => setFormData(prev => ({ ...prev, weight_unit: e.target.value }))}
                className="h-9 rounded-[12px] bg-white border border-brandText/30 px-2 py-1 text-sm text-left"
              >
                <option value="kg">{t("kg")}</option>
                <option value="lbs">{t("lbs")}</option>
              </select>
            </div>
            {fieldErrors.weight && (
              <ErrorLabel message={fieldErrors.weight} />
            )}
          </div>

          {/* Vaccinations */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4 border border-white">
            <h3 className="text-sm font-semibold">{t("Last Vaccination / Veterinary Visit")}</h3>
            {formData.vaccinations.map((vax, index) => (
              <div key={index} className="flex items-center gap-2 bg-card rounded-lg p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{vax.name}</p>
                  <p className="text-xs text-muted-foreground">{vax.date}</p>
                </div>
                <button onClick={() => removeVaccination(index)} className="text-destructive p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="relative mt-[15px] pb-6">
              <div className="flex gap-2">
                <select
                  value={vaccinationInput.name}
                  onChange={(e) => setVaccinationInput(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1 h-9 rounded-[12px] bg-white border border-[#e2e4e6] px-2 py-0 text-sm text-left"
                >
                  <option value="">{t("Select vaccine...")}</option>
                  {VACCINATION_OPTIONS.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={vaccinationInput.date}
                  onChange={(e) => {
                    const next = e.target.value;
                    setVaccinationInput(prev => ({ ...prev, date: next }));
                    if (next) {
                      const vaxDate = new Date(next);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      setFieldErrors((prev) => ({
                        ...prev,
                        vaccinationDate: vaxDate > today ? t("Vaccination date cannot be in the future") : "",
                      }));
                    }
                  }}
                  placeholder={t("Select date")}
                  className="rounded-[12px] w-36"
                />
                <Button onClick={addVaccination} size="sm" variant="secondary">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {fieldErrors.vaccinationDate && (
                <ErrorLabel message={fieldErrors.vaccinationDate} />
              )}
            </div>

            {/* Next Vaccination Reminder */}
            <div className="pt-3 border-t border-border">
              <label className="text-sm font-medium h-5 mb-2 block">{t("Next Visit Reminder")}</label>
              <Input
                type="date"
                value={formData.next_vaccination_reminder}
                onChange={(e) => {
                  const next = e.target.value;
                  setFormData(prev => ({ ...prev, next_vaccination_reminder: next }));
                  if (next) {
                    const reminderDate = new Date(next);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    setFieldErrors((prev) => ({
                      ...prev,
                      nextVaccination: reminderDate <= today ? t("Next vaccination must be in the future") : "",
                    }));
                  }
                }}
                className="rounded-[12px]"
                aria-invalid={Boolean(fieldErrors.nextVaccination)}
              />
              {fieldErrors.nextVaccination && (
                <ErrorLabel message={fieldErrors.nextVaccination} />
              )}
            </div>
          </div>

          {/* Medications */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4 h-[140px]">
            <h3 className="text-sm font-semibold">{t("Medications")}</h3>
            {formData.medications.map((med, index) => (
              <div key={index} className="flex items-center gap-2 bg-card rounded-lg p-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{med.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {med.dosage && `${med.dosage}`} {med.frequency && `• ${med.frequency}`}
                  </p>
                </div>
                <button onClick={() => removeMedication(index)} className="text-destructive p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="space-y-2">
              <Input
                value={medicationInput.name}
                onChange={(e) => setMedicationInput(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t("Medication name")}
                className="rounded-[12px] h-[30px]"
              />
              <div className="flex gap-2">
                <Input
                  value={medicationInput.dosage}
                  onChange={(e) => setMedicationInput(prev => ({ ...prev, dosage: e.target.value }))}
                  placeholder={t("Dosage")}
                  className="rounded-[12px] flex-1"
                />
                <Input
                  value={medicationInput.frequency}
                  onChange={(e) => setMedicationInput(prev => ({ ...prev, frequency: e.target.value }))}
                  placeholder={t("Frequency")}
                  className="rounded-[12px] flex-1"
                />
                <Button onClick={addMedication} size="sm" variant="secondary">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Temperament */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Temperament")}</label>
            <div className="flex flex-wrap gap-2">
              {TEMPERAMENT_OPTIONS.map((temp) => (
                <button
                  key={temp}
                  onClick={() => toggleTemperament(temp)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                    formData.temperament.includes(temp)
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {temp}
                </button>
              ))}
            </div>
          </div>

          {/* Vet Contact */}
          <div className="space-y-3">
            <label className="text-sm font-medium block">{t("Vet Contact")}</label>
            <Input
              value={formData.clinic_name}
              onChange={(e) => setFormData(prev => ({ ...prev, clinic_name: e.target.value }))}
              placeholder={t("Clinic name")}
              className="rounded-[12px] mt-1"
            />
            <Input
              value={formData.preferred_vet}
              onChange={(e) => setFormData(prev => ({ ...prev, preferred_vet: e.target.value }))}
              placeholder={t("Preferred vet")}
              className="rounded-[12px] my-1"
            />
            <PhoneInput
              international
              defaultCountry="HK"
              value={formData.phone_no}
              onChange={(value) => setFormData(prev => ({ ...prev, phone_no: value || "" }))}
              className="phone-input-auth h-9 rounded-[12px] bg-white border border-[#e2e4e6] px-2 py-1 text-left my-1"
              placeholder={t("Clinic phone (+XXX)")}
            />
          </div>

          {/* Microchip ID */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Microchip ID")}</label>
            <Input
              value={formData.microchip_id}
              onChange={(e) => setFormData(prev => ({ ...prev, microchip_id: validateMicrochip(e.target.value) }))}
              onBlur={() => {
                if (!formData.microchip_id) return;
                setFieldErrors((prev) => ({
                  ...prev,
                  microchipId: formData.microchip_id.length !== 15 ? t("Microchip ID must be 15 digits") : "",
                }));
              }}
              placeholder={t("000000000000000")}
              className="rounded-[12px] font-mono"
              maxLength={15}
              aria-invalid={Boolean(fieldErrors.microchipId)}
            />
            {fieldErrors.microchipId ? (
              <ErrorLabel message={fieldErrors.microchipId} />
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">{formData.microchip_id.length}/15 digits</p>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Pet Bio")}</label>
            <Textarea
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              placeholder={t("Tell us about your pet...")}
              className="min-h-[100px] rounded-[24px] border-[#e2e4e6]"
            />
          </div>

          {/* Routine */}
          <div>
            <label className="text-sm font-medium mb-1 block">{t("Daily Routine")}</label>
            <Textarea
              value={formData.routine}
              onChange={(e) => setFormData(prev => ({ ...prev, routine: e.target.value }))}
              placeholder={t("Feeding times, walks, play schedule...")}
              className="min-h-[80px] rounded-[24px] border-[#e2e4e6]"
            />
          </div>

          {/* Status Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <span className="text-sm font-medium">{t("Still Active")}</span>
                <p className="text-xs text-muted-foreground">{t("Is this pet still with you?")}</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <span className="text-sm font-medium">{t("Social Profile")}</span>
                <p className="text-xs text-muted-foreground">{t("Show this pet to your profile")}</p>
              </div>
              <Switch
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
              />
            </div>
          </div>
        </div>
      </StyledScrollArea>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default EditPetProfile;
