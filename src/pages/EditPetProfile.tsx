import { useState, useEffect } from "react";
import { ArrowLeft, Camera, Loader2, Save, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

// Aligned species list with User Setup
const speciesOptions = [
  { id: "dog", label: "Dog" },
  { id: "cat", label: "Cat" },
  { id: "bird", label: "Bird" },
  { id: "rabbit", label: "Rabbit" },
  { id: "reptile", label: "Reptile" },
  { id: "hamster", label: "Hamster" },
  { id: "others", label: "Others" },
];

const temperamentOptions = [
  "Playful", "Calm", "Energetic", "Shy", "Friendly", "Protective", 
  "Curious", "Independent", "Affectionate", "Anxious"
];

const genderOptions = ["Male", "Female", "Unknown"];

const vaccinationOptions = [
  "Rabies", "DHPP", "Bordetella", "Leptospirosis", "Lyme Disease",
  "FVRCP", "FeLV", "Heartworm", "Parvo", "Distemper"
];

const EditPetProfile = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get("id");
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    species: "",
    custom_species: "",
    breed: "",
    gender: "",
    dob: "",
    weight: "",
    weight_unit: "kg",
    bio: "",
    routine: "",
    vet_contact: "",
    microchip_id: "",
    temperament: [] as string[],
    vaccinations: [] as { name: string; date: string }[],
    medications: "",
    is_active: true,
    is_public: true,
  });

  const [vaccinationInput, setVaccinationInput] = useState({ name: "", date: "" });

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
        setFormData({
          name: data.name,
          species: speciesOptions.find(s => s.id === data.species) ? data.species : "others",
          custom_species: speciesOptions.find(s => s.id === data.species) ? "" : data.species,
          breed: data.breed || "",
          gender: data.gender || "",
          dob: data.dob || "",
          weight: data.weight?.toString() || "",
          weight_unit: data.weight_unit || "kg",
          bio: data.bio || "",
          routine: data.routine || "",
          vet_contact: data.vet_contact || "",
          microchip_id: data.microchip_id || "",
          temperament: data.temperament || [],
          vaccinations: (data.vaccinations as any) || [],
          medications: ((data.medications as any)?.text) || "",
          is_active: data.is_active ?? true,
          is_public: data.is_public ?? true,
        });
        if (data.photo_url) {
          setPhotoPreview(data.photo_url);
        }
      }
    } catch (error) {
      console.error("Error fetching pet:", error);
      toast.error("Failed to load pet");
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
    const digits = value.replace(/\D/g, '');
    return digits.slice(0, 15);
  };

  const handleSave = async () => {
    if (!user || !petId) return;
    
    if (!formData.name || (!formData.species && !formData.custom_species)) {
      toast.error("Name and species are required");
      return;
    }
    
    setSaving(true);
    
    try {
      let photoUrl = photoPreview;
      
      if (photoFile) {
        const fileExt = photoFile.name.split('.').pop();
        const fileName = `${user.id}/${petId}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("pets")
          .upload(fileName, photoFile, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from("pets")
          .getPublicUrl(fileName);
        
        photoUrl = publicUrl;
      }
      
      const { error } = await supabase
        .from("pets")
        .update({
          name: formData.name,
          species: formData.species === "others" ? formData.custom_species : formData.species,
          breed: formData.breed || null,
          gender: formData.gender || null,
          dob: formData.dob || null,
          weight: formData.weight ? parseFloat(formData.weight) : null,
          weight_unit: formData.weight_unit,
          bio: formData.bio || null,
          routine: formData.routine || null,
          vet_contact: formData.vet_contact || null,
          microchip_id: formData.microchip_id || null,
          temperament: formData.temperament,
          vaccinations: formData.vaccinations,
          medications: formData.medications ? { text: formData.medications } : null,
          is_active: formData.is_active,
          is_public: formData.is_public,
          photo_url: photoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", petId);
      
      if (error) throw error;
      
      toast.success("Pet profile updated!");
      navigate(-1);
    } catch (error: any) {
      toast.error(error.message || "Failed to update pet");
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
    <div className="min-h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />
      
      {/* Page Header */}
      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Edit Pet Profile</h1>
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </Button>
      </header>

      <StyledScrollArea className="flex-1 px-4 py-6" maxHeight="calc(100vh - 180px)">
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <label className="relative cursor-pointer group">
              <div className="w-28 h-28 rounded-2xl flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img src={photoPreview} alt="Pet" className="w-full h-full object-cover" />
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
            <label className="text-sm font-medium mb-2 block">Pet Name *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Pet's name"
              className="h-12 rounded-xl"
            />
          </div>

          {/* Species */}
          <div>
            <label className="text-sm font-medium mb-2 block">Species *</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {speciesOptions.map((species) => (
                <button
                  key={species.id}
                  onClick={() => setFormData(prev => ({ ...prev, species: species.id }))}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium transition-all",
                    formData.species === species.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {species.label}
                </button>
              ))}
            </div>
            {formData.species === "others" && (
              <Input
                value={formData.custom_species}
                onChange={(e) => setFormData(prev => ({ ...prev, custom_species: e.target.value }))}
                placeholder="Enter species..."
                className="h-12 rounded-xl mt-2"
              />
            )}
          </div>

          {/* Breed */}
          <div>
            <label className="text-sm font-medium mb-2 block">Breed</label>
            <Input
              value={formData.breed}
              onChange={(e) => setFormData(prev => ({ ...prev, breed: e.target.value }))}
              placeholder="Breed"
              className="h-12 rounded-xl"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="text-sm font-medium mb-2 block">Gender</label>
            <div className="flex gap-2">
              {genderOptions.map((gender) => (
                <button
                  key={gender}
                  onClick={() => setFormData(prev => ({ ...prev, gender }))}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all",
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

          {/* DOB & Weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Date of Birth</label>
              <Input
                type="date"
                value={formData.dob}
                onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                className="h-12 rounded-xl"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Weight (kg)</label>
              <Input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                placeholder="0"
                className="h-12 rounded-xl"
              />
            </div>
          </div>

          {/* The Vault */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <h3 className="text-sm font-semibold">🔐 The Vault</h3>
            
            {/* Microchip */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Microchip ID (15 digits)</label>
              <Input
                value={formData.microchip_id}
                onChange={(e) => setFormData(prev => ({ ...prev, microchip_id: validateMicrochip(e.target.value) }))}
                placeholder="000000000000000"
                className="h-11 rounded-lg font-mono"
                maxLength={15}
              />
              <p className="text-xs text-muted-foreground mt-1">{formData.microchip_id.length}/15 digits</p>
            </div>

            {/* Vaccinations */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Vaccinations</label>
              {formData.vaccinations.map((vax, index) => (
                <div key={index} className="flex items-center gap-2 bg-card rounded-lg p-2 mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{vax.name}</p>
                    <p className="text-xs text-muted-foreground">{vax.date}</p>
                  </div>
                  <button onClick={() => removeVaccination(index)} className="text-destructive p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <select
                  value={vaccinationInput.name}
                  onChange={(e) => setVaccinationInput(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1 h-10 rounded-lg bg-card border border-border px-3 text-sm"
                >
                  <option value="">Select vaccine...</option>
                  {vaccinationOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={vaccinationInput.date}
                  onChange={(e) => setVaccinationInput(prev => ({ ...prev, date: e.target.value }))}
                  className="h-10 rounded-lg w-32"
                />
                <Button onClick={addVaccination} size="sm" variant="secondary">Add</Button>
              </div>
            </div>

            {/* Medications */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Medications</label>
              <Textarea
                value={formData.medications}
                onChange={(e) => setFormData(prev => ({ ...prev, medications: e.target.value }))}
                placeholder="Current medications..."
                className="min-h-[60px] rounded-lg"
              />
            </div>
          </div>

          {/* Lifestyle */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-4">
            <h3 className="text-sm font-semibold">🌿 Lifestyle</h3>
            
            {/* Temperament */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Temperament</label>
              <div className="flex flex-wrap gap-2">
                {temperamentOptions.map((temp) => (
                  <button
                    key={temp}
                    onClick={() => toggleTemperament(temp)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      formData.temperament.includes(temp)
                        ? "bg-accent text-accent-foreground"
                        : "bg-card text-muted-foreground border border-border"
                    )}
                  >
                    {temp}
                  </button>
                ))}
              </div>
            </div>

            {/* Routine */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Daily Routine</label>
              <Textarea
                value={formData.routine}
                onChange={(e) => setFormData(prev => ({ ...prev, routine: e.target.value }))}
                placeholder="Feeding times, walks, etc..."
                className="min-h-[60px] rounded-lg"
              />
            </div>

            {/* Vet Contact */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vet Contact</label>
              <Input
                value={formData.vet_contact}
                onChange={(e) => setFormData(prev => ({ ...prev, vet_contact: e.target.value }))}
                placeholder="Vet name / phone"
                className="h-11 rounded-lg"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pet Bio</label>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Tell us about your pet..."
                className="min-h-[80px] rounded-lg"
              />
            </div>
          </div>

          {/* Status Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <span className="text-sm font-medium">Still Active</span>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <span className="text-sm font-medium">Public Profile</span>
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
