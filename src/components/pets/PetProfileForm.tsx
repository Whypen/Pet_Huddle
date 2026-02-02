import { useState } from "react";
import { Camera, Plus, X, PawPrint, Syringe, Pill, Cpu, Stethoscope, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SPECIES_LIST, BREED_OPTIONS, VACCINATION_OPTIONS, TEMPERAMENT_OPTIONS } from "@/lib/constants";

interface PetData {
  id?: string;
  photoUrl: string;
  name: string;
  species: string;
  customSpecies: string;
  breed: string;
  gender: string;
  neuteredSpayed: boolean;
  weight: number | null;
  weightUnit: string;
  dob: string;
  vaccinations: { name: string; date: string }[];
  medications: string;
  microchipId: string;
  routine: string;
  temperament: string[];
  vetContact: string;
  bio: string;
  isActive: boolean;
}

interface PetProfileFormProps {
  userId: string;
  initialData?: Partial<PetData>;
  onSave: (data: PetData) => void;
  onCancel?: () => void;
  submitLabel?: string;
  showCancel?: boolean;
}

export const PetProfileForm = ({
  userId,
  initialData,
  onSave,
  onCancel,
  submitLabel = "Save Pet Profile",
  showCancel = true,
}: PetProfileFormProps) => {
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(initialData?.photoUrl || "");

  const [formData, setFormData] = useState<PetData>({
    id: initialData?.id,
    photoUrl: initialData?.photoUrl || "",
    name: initialData?.name || "",
    species: initialData?.species || "",
    customSpecies: initialData?.customSpecies || "",
    breed: initialData?.breed || "",
    gender: initialData?.gender || "",
    neuteredSpayed: initialData?.neuteredSpayed || false,
    weight: initialData?.weight || null,
    weightUnit: initialData?.weightUnit || "kg",
    dob: initialData?.dob || "",
    vaccinations: initialData?.vaccinations || [],
    medications: initialData?.medications || "",
    microchipId: initialData?.microchipId || "",
    routine: initialData?.routine || "",
    temperament: initialData?.temperament || [],
    vetContact: initialData?.vetContact || "",
    bio: initialData?.bio || "",
    isActive: initialData?.isActive ?? true,
  });

  const getBreedOptions = () => {
    return BREED_OPTIONS[formData.species] || [];
  };

  const calculateAge = (dob: string) => {
    if (!dob) return "";
    const birth = new Date(dob);
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const months = now.getMonth() - birth.getMonth();

    if (years < 1) {
      return `${Math.max(0, years * 12 + months)} months`;
    }
    return `${years} year${years !== 1 ? "s" : ""}`;
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

  const addVaccination = (name: string) => {
    if (!formData.vaccinations.find(v => v.name === name)) {
      setFormData(prev => ({
        ...prev,
        vaccinations: [...prev.vaccinations, { name, date: new Date().toISOString().split("T")[0] }]
      }));
    }
  };

  const removeVaccination = (name: string) => {
    setFormData(prev => ({
      ...prev,
      vaccinations: prev.vaccinations.filter(v => v.name !== name)
    }));
  };

  const toggleTemperament = (temp: string) => {
    setFormData(prev => {
      if (prev.temperament.includes(temp)) {
        return { ...prev, temperament: prev.temperament.filter(t => t !== temp) };
      }
      return { ...prev, temperament: [...prev.temperament, temp] };
    });
  };

  const validateMicrochip = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 15);
    setFormData(prev => ({ ...prev, microchipId: cleaned }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      toast.error("Please enter your pet's name");
      return;
    }
    if (!formData.species) {
      toast.error("Please select a species");
      return;
    }
    if (formData.species === "Others" && !formData.customSpecies.trim()) {
      toast.error("Please enter a custom species name");
      return;
    }

    setLoading(true);
    try {
      let photoUrl = formData.photoUrl;

      // Upload photo if provided
      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const filePath = `${userId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("pets")
          .upload(filePath, photoFile);

        if (uploadError) {
          console.error("Pet photo upload error:", uploadError);
          toast.error("Failed to upload pet photo");
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
          .from("pets")
          .getPublicUrl(filePath);

        photoUrl = publicUrl;
      }

      const species = formData.species === "Others" ? formData.customSpecies : formData.species;

      const petDataToSave = {
        ...formData,
        photoUrl,
        species,
      };

      onSave(petDataToSave);
    } catch (error: any) {
      console.error("Error saving pet:", error);
      if (!error.message?.includes("Failed to")) {
        toast.error("Failed to save pet profile");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Photo Upload */}
      <div className="flex justify-center">
        <label className="relative cursor-pointer group">
          <div className="w-28 h-28 rounded-2xl bg-muted overflow-hidden border-4 border-primary/20 group-hover:border-primary/40 transition-colors">
            {photoPreview ? (
              <img src={photoPreview} alt="Pet" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Plus className="w-4 h-4 text-primary-foreground" />
          </div>
          <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        </label>
      </div>

      {/* Mandatory Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Pet Name *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="What's your pet's name?"
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label>Species *</Label>
          <Select
            value={formData.species}
            onValueChange={(value) => setFormData(prev => ({ ...prev, species: value, breed: "" }))}
          >
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Select species" />
            </SelectTrigger>
            <SelectContent>
              {SPECIES_LIST.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {formData.species === "Others" && (
          <div className="space-y-2">
            <Label>Custom Species *</Label>
            <Input
              value={formData.customSpecies}
              onChange={(e) => setFormData(prev => ({ ...prev, customSpecies: e.target.value }))}
              placeholder="Enter species name"
              className="h-12 rounded-xl"
            />
          </div>
        )}

        {formData.species && formData.species !== "Others" && (
          <div className="space-y-2">
            <Label>Breed</Label>
            <Select
              value={formData.breed}
              onValueChange={(value) => setFormData(prev => ({ ...prev, breed: value }))}
            >
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Select breed" />
              </SelectTrigger>
              <SelectContent>
                {getBreedOptions().map(breed => (
                  <SelectItem key={breed} value={breed}>{breed}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Gender and Neutered/Spayed side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={formData.gender}
              onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}
            >
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Neutered/Spayed</Label>
            <div className="h-12 rounded-xl border border-border px-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {formData.neuteredSpayed ? "Yes" : "No"}
              </span>
              <Switch
                checked={formData.neuteredSpayed}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, neuteredSpayed: checked }))}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Weight</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                value={formData.weight || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, weight: parseFloat(e.target.value) || null }))}
                placeholder="0"
                className="h-12 rounded-xl"
              />
              <Select
                value={formData.weightUnit}
                onValueChange={(value) => setFormData(prev => ({ ...prev, weightUnit: value }))}
              >
                <SelectTrigger className="w-20 h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="lbs">lbs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <Input
              type="date"
              value={formData.dob}
              onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
              className="h-12 rounded-xl"
            />
          </div>
        </div>

        {formData.dob && (
          <p className="text-sm text-muted-foreground">
            Pet Age: {calculateAge(formData.dob)}
          </p>
        )}
      </div>

      {/* The Vault (Optional) */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Syringe className="w-4 h-4 text-primary" />
          The Vault (Health Records)
        </h3>

        {/* Vaccinations */}
        <div className="space-y-3">
          <Label className="text-sm">Vaccinations</Label>
          <div className="flex flex-wrap gap-2">
            {VACCINATION_OPTIONS.map(vax => {
              const isAdded = formData.vaccinations.some(v => v.name === vax);
              return (
                <Badge
                  key={vax}
                  variant={isAdded ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1.5 text-sm"
                  onClick={() => isAdded ? removeVaccination(vax) : addVaccination(vax)}
                >
                  {vax}
                  {isAdded && <Check className="w-3 h-3 ml-1" />}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Medications */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Pill className="w-4 h-4 text-muted-foreground" />
            Medications / Medical Notes
          </Label>
          <Textarea
            value={formData.medications}
            onChange={(e) => setFormData(prev => ({ ...prev, medications: e.target.value }))}
            placeholder="Any current medications or medical conditions..."
            className="rounded-xl resize-none"
            rows={2}
          />
        </div>

        {/* Microchip */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            Microchip ID
          </Label>
          <Input
            value={formData.microchipId}
            onChange={(e) => validateMicrochip(e.target.value)}
            placeholder="15-digit microchip number"
            className="h-11 rounded-xl font-mono"
            maxLength={15}
          />
          {formData.microchipId && formData.microchipId.length < 15 && (
            <p className="text-xs text-muted-foreground">
              {15 - formData.microchipId.length} more digits needed
            </p>
          )}
        </div>
      </div>

      {/* Lifestyle */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <PawPrint className="w-4 h-4 text-primary" />
          Lifestyle
        </h3>

        <div className="space-y-2">
          <Label className="text-sm">Daily Routine</Label>
          <Textarea
            value={formData.routine}
            onChange={(e) => setFormData(prev => ({ ...prev, routine: e.target.value }))}
            placeholder="Walk times, feeding schedule, etc..."
            className="rounded-xl resize-none"
            rows={2}
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm">Temperament</Label>
          <div className="flex flex-wrap gap-2">
            {TEMPERAMENT_OPTIONS.map(temp => (
              <Badge
                key={temp}
                variant={formData.temperament.includes(temp) ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-sm"
                onClick={() => toggleTemperament(temp)}
              >
                {temp}
                {formData.temperament.includes(temp) && <X className="w-3 h-3 ml-1" />}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Stethoscope className="w-4 h-4 text-muted-foreground" />
            Vet Contact
          </Label>
          <Input
            value={formData.vetContact}
            onChange={(e) => setFormData(prev => ({ ...prev, vetContact: e.target.value }))}
            placeholder="Vet name and phone number"
            className="h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Pet Bio</Label>
          <Textarea
            value={formData.bio}
            onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
            placeholder="Tell us about your pet's personality..."
            className="rounded-xl resize-none"
            rows={3}
          />
        </div>
      </div>

      {/* Status Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
        <div>
          <Label>Pet is Still Active</Label>
          <p className="text-xs text-muted-foreground">Uncheck if passed away or rehomed</p>
        </div>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
        />
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        <Button
          onClick={handleSubmit}
          disabled={loading || !formData.name.trim() || (!formData.species || (formData.species === "Others" && !formData.customSpecies.trim()))}
          className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              {submitLabel}
            </>
          )}
        </Button>

        {showCancel && onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full h-11 text-muted-foreground"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
};
