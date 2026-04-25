import { useState, useEffect, useCallback } from "react";
import { Pencil, Loader2, Camera } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/layouts/PageHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { NeuControl } from "@/components/ui/NeuControl";
import { PetDetailsBody, getSterilizedLabel, toTitleCase } from "@/components/pets/PetDetailsBody";
import { toast } from "sonner";
import { resolveCopy } from "@/lib/copy";
import { useAuth } from "@/contexts/AuthContext";

type VetVisitRecord = {
  reason: string;
  customReason?: string | null;
  visitDate: string;
  vaccine?: string | null;
};

type SetReminder = {
  reason: string;
  customReason?: string | null;
  reminderDate: string;
};

type MedicationRecord = {
  name: string;
  dose_amount: number | null;
  dose_unit: string | null;
  frequency_value: number | null;
  frequency_unit: string | null;
  dosage?: string | null;
  frequency?: string | null;
};

interface PetDetailsData {
  id: string;
  owner_id: string | null;
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
  vet_visit_records: VetVisitRecord[] | null;
  set_reminder: SetReminder | null;
  medications: MedicationRecord[] | null;
  photo_url: string | null;
  is_active: boolean;
}

const formatDateOnly = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.slice(0, 10);
};

const parseLegacyVaccinations = (vaccinations: unknown, vaccinationDates: unknown): VetVisitRecord[] => {
  const out: VetVisitRecord[] = [];
  const dates = Array.isArray(vaccinationDates)
    ? vaccinationDates.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];

  if (!Array.isArray(vaccinations)) {
    return dates.map((visitDate) => ({ reason: "Vaccination", visitDate: formatDateOnly(visitDate) })).filter((r) => r.visitDate);
  }

  vaccinations.forEach((item, index) => {
    if (typeof item === "string") {
      const visitDate = formatDateOnly(dates[index] ?? "");
      if (!visitDate) return;
      out.push({ reason: "Vaccination", vaccine: item, visitDate });
      return;
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const visitDate = formatDateOnly(record.visitDate ?? record.date ?? dates[index] ?? "");
      if (!visitDate) return;
      out.push({
        reason: "Vaccination",
        vaccine: typeof record.vaccine === "string" ? record.vaccine : typeof record.name === "string" ? record.name : null,
        visitDate,
      });
    }
  });

  return out;
};

const parseReminder = (setReminder: unknown, legacyDate: unknown): SetReminder | null => {
  const normalize = (raw: Record<string, unknown>): SetReminder | null => {
    const reminderDate = formatDateOnly(raw.reminderDate);
    if (!reminderDate) return null;
    return {
      reason: typeof raw.reason === "string" ? raw.reason : "Vaccination",
      customReason: typeof raw.customReason === "string" ? raw.customReason : null,
      reminderDate,
    };
  };
  if (Array.isArray(setReminder)) {
    const parsed = setReminder
      .map((row) => (row && typeof row === "object" ? normalize(row as Record<string, unknown>) : null))
      .filter((row): row is SetReminder => Boolean(row))
      .sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime());
    if (parsed.length > 0) return parsed[0];
  } else if (setReminder && typeof setReminder === "object") {
    const single = normalize(setReminder as Record<string, unknown>);
    if (single) return single;
  }
  const fallbackDate = formatDateOnly(legacyDate);
  return fallbackDate ? { reason: "Vaccination", reminderDate: fallbackDate, customReason: null } : null;
};

const parseMedication = (item: unknown): MedicationRecord | null => {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  return {
    name,
    dose_amount: typeof raw.dose_amount === "number" ? raw.dose_amount : null,
    dose_unit: typeof raw.dose_unit === "string" ? raw.dose_unit : null,
    frequency_value: typeof raw.frequency_value === "number" ? raw.frequency_value : null,
    frequency_unit: typeof raw.frequency_unit === "string" ? raw.frequency_unit : null,
    dosage: typeof raw.dosage === "string" ? raw.dosage : null,
    frequency: typeof raw.frequency === "string" ? raw.frequency : null,
  };
};

const formatPetAge = (dob: string | null) => {
  if (!dob) return "";
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  if (today.getDate() < birthDate.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0) return `${Math.max(months, 0)} mo`;
  if (months <= 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
};

const PetDetails = () => {
  const t = resolveCopy;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get("id");
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<PetDetailsData | null>(null);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const fetchPetDetails = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      if (error) throw error;
      const row = data as Record<string, unknown>;

      const vetVisits = Array.isArray(row.vet_visit_records)
        ? (row.vet_visit_records as VetVisitRecord[])
        : parseLegacyVaccinations(row.vaccinations, row.vaccination_dates);
      const reminder = parseReminder(row.set_reminder, row.next_vaccination_reminder);
      const meds = Array.isArray(row.medications)
        ? (row.medications.map(parseMedication).filter(Boolean) as MedicationRecord[])
        : [];

      setPet({
        id: String(row.id),
        owner_id: typeof row.owner_id === "string" ? row.owner_id : null,
        name: (row.name as string) || "",
        species: (row.species as string) || "",
        breed: (row.breed as string) || null,
        gender: (row.gender as string) || null,
        neutered_spayed: Boolean(row.neutered_spayed),
        dob: (row.dob as string) || null,
        weight: typeof row.weight === "number" ? row.weight : null,
        weight_unit: (row.weight_unit as string) || "kg",
        bio: (row.bio as string) || null,
        routine: (row.routine as string) || null,
        vet_contact: (row.vet_contact as string) || null,
        microchip_id: (row.microchip_id as string) || null,
        temperament: Array.isArray(row.temperament) ? (row.temperament as string[]) : null,
        vet_visit_records: vetVisits,
        set_reminder: reminder,
        medications: meds,
        photo_url: (row.photo_url as string) || null,
        is_active: row.is_active !== false,
      });
    } catch {
      toast.error(t("Failed to load pet details"));
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate, petId, t]);

  useEffect(() => {
    if (petId) {
      void fetchPetDetails();
    }
  }, [fetchPetDetails, petId]);

  if (loading) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        {/* Skeleton header bar */}
        <div className="h-[56px] flex-shrink-0 bg-[var(--bg-card)] border-b border-border/20" />
        {/* Skeleton hero */}
        <div className="h-[260px] flex-shrink-0 bg-muted animate-pulse" />
        {/* Skeleton identity strip */}
        <div className="px-4 pt-4 space-y-2">
          <div className="h-7 w-32 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-24 rounded-lg bg-muted animate-pulse" />
          <div className="flex gap-2 pt-1">
            <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
            <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
          </div>
        </div>
        {/* Skeleton section dividers */}
        <div className="mx-4 mt-6 h-[56px] rounded-[22px] bg-muted animate-pulse" />
        <div className="mx-4 mt-2 h-[56px] rounded-[22px] bg-muted animate-pulse" />
      </div>
    );
  }

  if (!pet) return null;

  const canEditPet = Boolean(user?.id && pet.owner_id && user.id === pet.owner_id);
  const displaySpecies = toTitleCase(pet.species) || "Species";
  const displayBreed = pet.breed?.trim() || "";
  const ageLabel = formatPetAge(pet.dob);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <PageHeader
        title={
          <span className="text-[13px] font-[500] text-[var(--text-secondary)] truncate">
            {pet.name}
          </span>
        }
        showBack
        onBack={() => navigate("/")}
        right={
          canEditPet ? (
            <NeuControl
              size="icon-md"
              variant="tertiary"
              aria-label="Edit pet"
              onClick={() => navigate(`/edit-pet-profile?id=${pet.id}`)}
            >
              <Pencil size={18} strokeWidth={1.75} />
            </NeuControl>
          ) : undefined
        }
      />

      <StyledScrollArea className="flex-1 min-h-0">
        <div className="px-4 pt-[72px] pb-[calc(64px+env(safe-area-inset-bottom))]">
          {/* ── Staff Badge Hero ─────────────────────────────────────────── */}
          {/* Badge card — full width, clear plastic sleeve */}
            <div
              className="w-full mx-auto bg-white flex flex-col overflow-hidden relative"
              style={{
                aspectRatio: "5 / 8",
                borderRadius: 14,
                border: "1.5px solid rgba(176,190,220,0.68)",
                boxShadow: [
                  "inset 0 0 0 1px rgba(255,255,255,0.52)",
                  "inset 0 0 18px rgba(66,73,101,0.04)",
                  "0 2px 6px rgba(0,0,0,0.06)",
                  "0 12px 36px rgba(66,73,101,0.14)",
                ].join(", "),
              }}
            >
              {/* Punched slot — wide pill shape centred at top, like a real badge */}
              <div
                aria-hidden
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 12,
                  width: "28%",
                  height: 11,
                  borderRadius: 999,
                  background: "#ffffff",
                  border: "1px solid rgba(140,155,190,0.45)",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.16), 0 1px 0 rgba(255,255,255,0.7)",
                  zIndex: 2,
                }}
              />

              {/* Photo zone — fills remaining space */}
              <div className="relative overflow-hidden" style={{ flex: "1 1 0" }}>
                {pet.photo_url ? (
                  <img
                    src={pet.photo_url}
                    alt={pet.name}
                    className="absolute inset-0 w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[rgba(237,237,250,0.7)] flex items-center justify-center">
                    <Camera className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Sleeve divider line */}
              <div style={{ height: 1, background: "rgba(176,190,220,0.45)", flexShrink: 0 }} />

              {/* Content zone — auto-sized to content */}
              <div
                className="flex flex-col items-center gap-[5px] px-4 text-center"
                style={{ flex: "0 0 auto", paddingTop: 16, paddingBottom: 14 }}
              >
                <h2
                  className="font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)] truncate w-full"
                  style={{ fontSize: "clamp(18px,5.5vw,24px)" }}
                >
                  {pet.name}
                </h2>
                <p
                  className="font-medium text-[var(--text-secondary)] truncate w-full"
                  style={{ fontSize: "clamp(14px,4vw,16px)" }}
                >
                  {[displaySpecies, displayBreed].filter(Boolean).join(" · ")}
                </p>
                {(pet.gender || pet.neutered_spayed) && (
                  <p style={{ fontSize: "clamp(14px,3.8vw,16px)", color: "rgba(66,73,101,0.58)" }}>
                    {[pet.gender, pet.neutered_spayed ? getSterilizedLabel(pet.gender) : null]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                )}
                {ageLabel && (
                  <p style={{ fontSize: "clamp(14px,3.8vw,16px)", color: "rgba(66,73,101,0.58)" }}>
                    {ageLabel}
                  </p>
                )}

                {/* PET ID footer */}
                <p
                  className="font-semibold uppercase tracking-[0.18em] mt-1"
                  style={{ fontSize: "clamp(9px,2.5vw,11px)", color: "rgba(66,73,101,0.32)" }}
                >
                  PET ID
                </p>
              </div>
            </div>
          {/* ── End Badge Hero ────────────────────────────────────────────── */}

          <PetDetailsBody
            className="pt-4"
            data={{
              dob: pet.dob,
              weight: pet.weight,
              weightUnit: pet.weight_unit,
              microchipId: pet.microchip_id,
              bio: pet.bio,
              routine: pet.routine,
              temperament: pet.temperament,
              reminder: pet.set_reminder,
              vetVisits: pet.vet_visit_records,
              medications: pet.medications,
            }}
          />
        </div>
      </StyledScrollArea>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default PetDetails;
