import { useState, useEffect, useCallback } from "react";
import { Pencil, Weight, Cpu, Loader2, Pill, BellRing, CakeSlice, Stethoscope, ChevronDown } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/layouts/PageHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuChip } from "@/components/ui/NeuChip";
import { InsetDivider } from "@/components/ui/InsetPanel";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

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

const getSterilizedLabel = (gender: string | null) => {
  if (!gender) return "Sterilized";
  return gender.toLowerCase() === "female" ? "Spayed" : "Neutered";
};

const toTitleCase = (value: string) =>
  value
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatBirthdayChip = (dob: string) => {
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${day}-${month}`;
};

const PetDetails = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const petId = searchParams.get("id");
  const [loading, setLoading] = useState(true);
  const [pet, setPet] = useState<PetDetailsData | null>(null);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showTempRoutine, setShowTempRoutine] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showAllVetVisits, setShowAllVetVisits] = useState(false);
  const [showAllMeds, setShowAllMeds] = useState(false);

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
      <div className="h-full min-h-0 flex flex-col">
        {/* Skeleton header bar */}
        <div className="h-[56px] flex-shrink-0 bg-[var(--bg-card)] border-b border-border/20" />
        {/* Skeleton hero */}
        <div className="h-[200px] flex-shrink-0 bg-muted animate-pulse" />
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

  const hasHealthData =
    pet.set_reminder ||
    (pet.vet_visit_records && pet.vet_visit_records.length > 0) ||
    (pet.medications && pet.medications.length > 0);

  const hasTempRoutine =
    (pet.temperament && pet.temperament.length > 0) || !!pet.routine;

  const visibleVetVisits = showAllVetVisits
    ? (pet.vet_visit_records ?? [])
    : (pet.vet_visit_records ?? []).slice(0, 3);

  const visibleMeds = showAllMeds
    ? (pet.medications ?? [])
    : (pet.medications ?? []).slice(0, 3);

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
          <NeuControl
            size="icon-md"
            variant="tertiary"
            aria-label="Edit pet"
            onClick={() => navigate(`/edit-pet-profile?id=${pet.id}`)}
          >
            <Pencil size={18} strokeWidth={1.75} />
          </NeuControl>
        }
      />

      {/* Hero photo with overlay */}
      <div className="relative h-[200px] flex-shrink-0 overflow-hidden mt-[56px]">
        {pet.photo_url ? (
          <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary to-accent" />
        )}
        <div className="absolute bottom-0 left-0 right-0 h-[70%] bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <h2 className="text-[26px] font-[700] text-white leading-tight mb-2">
            {pet.name}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <NeuChip as="span">
              {toTitleCase(pet.species)}{pet.breed ? ` \u00b7 ${pet.breed}` : ""}
            </NeuChip>
            {pet.gender && <NeuChip as="span">{pet.gender}</NeuChip>}
            {pet.neutered_spayed && (
              <NeuChip as="span">{getSterilizedLabel(pet.gender)}</NeuChip>
            )}
          </div>
        </div>
      </div>

      <StyledScrollArea className="flex-1 min-h-0">
        <div className="pb-[calc(64px+env(safe-area-inset-bottom))]">

          {/* Stat blocks: DOB, Weight, Microchip */}
          {(pet.dob || pet.weight || pet.microchip_id) && (
            <div className="px-4 pt-4 pb-2 flex gap-3">
              {pet.dob && (
                <div className="flex-1 min-w-0 card-e1 p-3 rounded-xl flex flex-col items-center text-center">
                  <CakeSlice size={18} strokeWidth={1.75} className="mb-1.5 text-primary" />
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-none mb-1">Birthday</p>
                  <p className="text-[12px] font-[600] text-[var(--text-primary)] leading-tight">
                    {formatBirthdayChip(pet.dob)}{calculateAge(pet.dob) !== null ? ` (${calculateAge(pet.dob)}y)` : ""}
                  </p>
                </div>
              )}
              {pet.weight && (
                <div className="flex-1 min-w-0 card-e1 p-3 rounded-xl flex flex-col items-center text-center">
                  <Weight size={18} strokeWidth={1.75} className="mb-1.5 text-primary" />
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-none mb-1">Weight</p>
                  <p className="text-[12px] font-[600] text-[var(--text-primary)] leading-tight">
                    {pet.weight} {pet.weight_unit}
                  </p>
                </div>
              )}
              {pet.microchip_id && (
                <div className="flex-1 min-w-0 card-e1 p-3 rounded-xl flex flex-col items-center text-center">
                  <Cpu size={18} strokeWidth={1.75} className="mb-1.5 text-primary" />
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-none mb-1">Microchip</p>
                  <p className="text-[12px] font-[600] text-[var(--text-primary)] leading-tight break-all">
                    {pet.microchip_id}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Bio card */}
          {pet.bio && (
            <div className="card-e1 mx-4 mb-4 p-4 rounded-xl">
              <p className={cn(
                "text-[14px] leading-[1.55] text-[var(--text-secondary)]",
                !bioExpanded && "line-clamp-3"
              )}>
                {pet.bio}
              </p>
              {pet.bio.length > 120 && (
                <NeuControl
                  size="sm"
                  variant="tertiary"
                  className="mt-2 -ml-1"
                  onClick={() => setBioExpanded((v) => !v)}
                >
                  <ChevronDown
                    size={14}
                    strokeWidth={1.75}
                    className={cn("transition-transform mr-1", bioExpanded && "rotate-180")}
                    aria-hidden
                  />
                  {bioExpanded ? "Show less" : "Show more"}
                </NeuControl>
              )}
            </div>
          )}

          {/* Health — unified card block */}
          {hasHealthData && (
            <div className="mx-4 mb-2 card-e1 rounded-[22px] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHealth((v) => !v)}
                className="w-full h-[56px] flex items-center px-4 gap-3"
                aria-expanded={showHealth}
              >
                <span className="flex-1 text-left text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                  Health
                </span>
                <ChevronDown
                  size={16}
                  strokeWidth={1.75}
                  className={cn("text-[var(--text-secondary)] transition-transform", showHealth && "rotate-180")}
                />
              </button>

              {showHealth && (
                <>
                  <InsetDivider />

                  {/* Reminder row */}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <BellRing size={16} strokeWidth={1.75} className="text-[var(--text-secondary)] mt-[2px] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-[500] text-[var(--text-primary)]">
                        {pet.set_reminder
                          ? (pet.set_reminder.reason === "Others"
                              ? pet.set_reminder.customReason || "Reminder"
                              : pet.set_reminder.reason)
                          : "No reminder set"}
                      </p>
                      {pet.set_reminder && (
                        <p className="text-[11px] text-[var(--text-tertiary)]">{pet.set_reminder.reminderDate}</p>
                      )}
                    </div>
                  </div>

                  <InsetDivider />

                  {/* Vet visit rows */}
                  {visibleVetVisits.length === 0 ? (
                    <div className="px-4 py-3">
                      <p className="text-[13px] text-[var(--text-tertiary)]">No vet visit records.</p>
                    </div>
                  ) : (
                    <>
                      {visibleVetVisits.map((record, idx) => (
                        <div key={`${record.visitDate}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                          <Stethoscope size={16} strokeWidth={1.75} className="text-[var(--text-secondary)] mt-[2px] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-[500] text-[var(--text-primary)]">
                              {record.reason === "Others" ? record.customReason || "Visit" : record.reason}
                              {record.vaccine ? ` \u00b7 ${record.vaccine}` : ""}
                            </p>
                            <p className="text-[11px] text-[var(--text-tertiary)]">{record.visitDate}</p>
                          </div>
                        </div>
                      ))}
                      {(pet.vet_visit_records ?? []).length > 3 && (
                        <div className="px-4 pb-2">
                          <NeuControl
                            size="sm"
                            variant="tertiary"
                            onClick={() => setShowAllVetVisits((v) => !v)}
                          >
                            {showAllVetVisits
                              ? "Show less"
                              : `Show ${(pet.vet_visit_records ?? []).length - 3} more`}
                          </NeuControl>
                        </div>
                      )}
                    </>
                  )}

                  {/* Medications */}
                  {(pet.medications ?? []).length > 0 && (
                    <>
                      <InsetDivider />
                      {visibleMeds.map((med, idx) => (
                        <div key={`${med.name}-${idx}`} className="flex items-start gap-3 px-4 py-3">
                          <Pill size={16} strokeWidth={1.75} className="text-[var(--text-secondary)] mt-[2px] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-[500] text-[var(--text-primary)]">{med.name}</p>
                            <p className="text-[11px] text-[var(--text-tertiary)]">
                              {med.dose_amount != null && med.dose_unit
                                ? `${med.dose_amount}${med.dose_unit}`
                                : med.dosage || ""}
                              {(med.frequency_value != null && med.frequency_unit)
                                ? ` \u00b7 Every ${med.frequency_value} ${med.frequency_unit}`
                                : med.frequency
                                ? ` \u00b7 ${med.frequency}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                      {(pet.medications ?? []).length > 3 && (
                        <div className="px-4 pb-2">
                          <NeuControl
                            size="sm"
                            variant="tertiary"
                            onClick={() => setShowAllMeds((v) => !v)}
                          >
                            {showAllMeds
                              ? "Show less"
                              : `Show ${(pet.medications ?? []).length - 3} more`}
                          </NeuControl>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Temperament & Routine — unified card block */}
          {hasTempRoutine && (
            <div className="mx-4 mb-4 card-e1 rounded-[22px] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTempRoutine((v) => !v)}
                className="w-full h-[56px] flex items-center px-4 gap-3"
                aria-expanded={showTempRoutine}
              >
                <span className="flex-1 text-left text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                  Temperament &amp; Routine
                </span>
                <ChevronDown
                  size={16}
                  strokeWidth={1.75}
                  className={cn("text-[var(--text-secondary)] transition-transform", showTempRoutine && "rotate-180")}
                />
              </button>

              {showTempRoutine && (
                <>
                  <InsetDivider />
                  {pet.temperament && pet.temperament.length > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {pet.temperament.map((temp) => (
                          <NeuChip key={temp} as="span">{temp}</NeuChip>
                        ))}
                      </div>
                    </div>
                  )}
                  {pet.temperament && pet.temperament.length > 0 && pet.routine && (
                    <InsetDivider />
                  )}
                  {pet.routine && (
                    <div className="px-4 py-3">
                      <p className="text-[11px] font-[500] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
                        Daily Routine
                      </p>
                      <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)] whitespace-pre-wrap">
                        {pet.routine}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </StyledScrollArea>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default PetDetails;
