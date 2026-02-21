import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Edit, Calendar, Weight, Ruler, Syringe, Pill, Stethoscope, Cpu, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PlusUpsell } from "@/components/social/PlusUpsell";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

interface PetDetails {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  neutered_spayed: boolean;
  dob: string | null;
  weight: number | null;
  weight_unit: string;
  bio: string | null;
  routine: string | null;
  vet_contact: string | null;
  microchip_id: string | null;
  temperament: string[] | null;
  vaccinations: { name: string; date: string }[] | null;
  vaccination_dates: string[] | null;
  next_vaccination_reminder: string | null;
  medications: { name: string; dosage: string; frequency: string }[] | null;
  photo_url: string | null;
  is_active: boolean;
}

const PetDetails = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get("id");
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<PetDetails | null>(null);
  const [isPlusOpen, setIsPlusOpen] = useState(false);

  const fetchPetDetails = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      if (error) throw error;
      setPet(data as unknown as PetDetails);
    } catch (error) {
      console.error("Error fetching pet:", error);
      toast.error(t("Failed to load pet details"));
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate, petId, t]);

  useEffect(() => {
    if (petId) {
      fetchPetDetails();
    }
  }, [fetchPetDetails, petId]);

  const calculateAge = (dob: string | null) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      years--;
    }
    return years;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pet) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-nav">
      <GlobalHeader onUpgradeClick={() => setIsPlusOpen(true)} />

      {/* Hero Header */}
      <div className="relative h-64 overflow-hidden">
        {pet.photo_url ? (
          <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

        {/* Back & Edit Buttons */}
        <div className="absolute top-4 left-0 right-0 px-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-full bg-background/80  hover:bg-background transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Button
            onClick={() => navigate(`/edit-pet-profile?id=${pet.id}`)}
            size="sm"
            className="gap-2 bg-background/80  hover:bg-background text-foreground"
          >
            <Edit className="w-4 h-4" />
            Edit
          </Button>
        </div>

        {/* Pet Name Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold text-foreground mb-2"
          >
            {pet.name}
          </motion.h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Badge variant="secondary">{pet.species}</Badge>
            {pet.breed && <Badge variant="outline">{pet.breed}</Badge>}
            {pet.gender && <Badge variant="outline">{pet.gender}</Badge>}
            {pet.neutered_spayed && <Badge variant="outline">{t("Fixed")}</Badge>}
          </div>
        </div>
      </div>

      <StyledScrollArea className="flex-1 px-4 py-6" maxHeight="calc(100vh - 300px)">
        <div className="space-y-6 max-w-2xl mx-auto">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {pet.dob && (
              <div className="p-4 rounded-xl bg-muted/50 text-center">
                <Calendar className="w-5 h-5 mx-auto mb-2 text-primary" />
                <p className="text-xs text-muted-foreground">{t("Age")}</p>
                <p className="font-semibold">{calculateAge(pet.dob)} years</p>
              </div>
            )}
            {pet.weight && (
              <div className="p-4 rounded-xl bg-muted/50 text-center">
                <Weight className="w-5 h-5 mx-auto mb-2 text-primary" />
                <p className="text-xs text-muted-foreground">{t("Weight")}</p>
                <p className="font-semibold">{pet.weight} {pet.weight_unit}</p>
              </div>
            )}
            {pet.microchip_id && (
              <div className="p-4 rounded-xl bg-muted/50 text-center">
                <Cpu className="w-5 h-5 mx-auto mb-2 text-primary" />
                <p className="text-xs text-muted-foreground">{t("Microchipped")}</p>
                <p className="font-semibold text-xs">{pet.microchip_id.slice(0, 8)}...</p>
              </div>
            )}
            {pet.vet_contact && (
              <div className="p-4 rounded-xl bg-muted/50 text-center">
                <Stethoscope className="w-5 h-5 mx-auto mb-2 text-primary" />
                <p className="text-xs text-muted-foreground">{t("Vet On File")}</p>
                <p className="font-semibold text-xs">{t("Yes")}</p>
              </div>
            )}
          </div>

          {/* Bio */}
          {pet.bio && (
            <div className="p-4 rounded-xl bg-muted/50">
              <h3 className="text-sm font-semibold mb-2">{t("About")} {pet.name}</h3>
              <p className="text-sm text-muted-foreground">{pet.bio}</p>
            </div>
          )}

          {/* Temperament */}
          {pet.temperament && pet.temperament.length > 0 && (
            <div className="p-4 rounded-xl bg-muted/50">
              <h3 className="text-sm font-semibold mb-3">{t("Temperament")}</h3>
              <div className="flex flex-wrap gap-2">
                {pet.temperament.map((temp) => (
                  <Badge key={temp} variant="secondary">{temp}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Routine */}
          {pet.routine && (
            <div className="p-4 rounded-xl bg-muted/50">
              <h3 className="text-sm font-semibold mb-2">{t("Daily Routine")}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{pet.routine}</p>
            </div>
          )}

          {/* Vaccinations */}
          {pet.vaccinations && pet.vaccinations.length > 0 && (
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-3">
                <Syringe className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("Vaccinations")}</h3>
              </div>
              <div className="space-y-2">
                {pet.vaccinations.map((vax, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-card">
                    <span className="text-sm font-medium">{vax.name}</span>
                    <span className="text-xs text-muted-foreground">{vax.date}</span>
                  </div>
                ))}
              </div>
              {pet.next_vaccination_reminder && (
                <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-xs text-primary font-medium">{t("Next Reminder")}: {pet.next_vaccination_reminder}</p>
                </div>
              )}
            </div>
          )}

          {/* Medications */}
          {pet.medications && pet.medications.length > 0 && (
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-3">
                <Pill className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("Medications")}</h3>
              </div>
              <div className="space-y-2">
                {pet.medications.map((med, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-card">
                    <p className="text-sm font-medium">{med.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {med.dosage && `${med.dosage}`} {med.frequency && `• ${med.frequency}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vet Contact */}
          {pet.vet_contact && (
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Stethoscope className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("Veterinarian")}</h3>
              </div>
              <p className="text-sm">{pet.vet_contact}</p>
            </div>
          )}
        </div>
      </StyledScrollArea>

      <PlusUpsell isOpen={isPlusOpen} onClose={() => setIsPlusOpen(false)} />
    </div>
  );
};

export default PetDetails;
