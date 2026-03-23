import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ArrowLeft, Camera, Check, ChevronDown, Loader2, Pencil, Phone, Save, X } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSignup } from "@/contexts/SignupContext";
import { supabase } from "@/integrations/supabase/client";
import { GlobalHeader } from "@/components/layout/GlobalHeader";
import { PremiumUpsell } from "@/components/social/PremiumUpsell";
import { StyledScrollArea } from "@/components/ui/styled-scrollbar";
import { NeuButton } from "@/components/ui/NeuButton";
import { NeuControl } from "@/components/ui/NeuControl";
import { NeuToggle } from "@/components/ui/NeuToggle";
import { NeuDropdown } from "@/components/ui";
import { ErrorLabel } from "@/components/ui/ErrorLabel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TEMPERAMENT_OPTIONS } from "@/lib/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";
import { PetDetailsBody, getSterilizedLabel, toTitleCase } from "@/components/pets/PetDetailsBody";
import {
  SETPET_PREFILL_KEY,
  SETPROFILE_PREFILL_KEY,
  SIGNUP_STORAGE_KEY,
  SIGNUP_PASSWORD_SESSION_KEY,
  SIGNUP_PENDING_VERIFICATION_KEY,
  buildScopedStorageKey,
  normalizeStorageOwner,
} from "@/lib/signupOnboarding";

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

const speciesBreeds: Record<string, string[]> = {
  dog: ["Labrador Retriever", "Golden Retriever", "French Bulldog", "Poodle", "Corgi", "Shiba Inu", "Other"],
  cat: ["Siamese", "Persian", "Maine Coon", "Ragdoll", "Bengal", "British Shorthair", "Sphynx", "Scottish Fold", "Abyssinian", "Other"],
  bird: ["Budgie", "Cockatiel", "Canary", "Parrot", "Other"],
  fish: ["Betta", "Goldfish", "Guppy", "Tetra", "Other"],
  reptile: ["Gecko", "Bearded Dragon", "Turtle", "Snake", "Other"],
  small_mammal: ["Hamster", "Rabbit", "Guinea Pig", "Ferret", "Other"],
  farm_animal: ["Goat", "Pig", "Chicken", "Duck", "Other"],
};

const genderOptions = ["Male", "Female"];

type EditPetProfileProps = {
  onboardingMode?: boolean;
};

type PetFormData = {
  name: string;
  species: string;
  custom_species: string;
  breed: string;
  gender: string;
  neutered_spayed: boolean;
  dob: string;
  weight: string;
  weight_unit: string;
  bio: string;
  routine: string;
  clinic_name: string;
  preferred_vet: string;
  phone_no: string;
  microchip_id: string;
  temperament: string[];
  vet_visit_records: VetVisitRecord[];
  set_reminder: ReminderEntry[];
  medications: MedicationRecord[];
  is_active: boolean;
  is_public: boolean;
};

type VetVisitReason = "Check-up" | "Vaccination" | "Dental" | "Spay / Neuter" | "Surgery" | "Emergency" | "Others";

type VetVisitRecord = {
  reason: VetVisitReason | "";
  customReason?: string | null;
  visitDate: string;
  vaccine?: string | null;
};

type ReminderEntry = {
  reason: VetVisitReason | "";
  customReason?: string | null;
  reminderDate: string;
};

type MedicationRecord = {
  name: string;
  dose_amount: number | null;
  dose_unit: "mg" | "mcg" | "IU" | "mL" | "tablet" | "drop" | null;
  frequency_value: number | null;
  frequency_unit: "hours" | "days" | null;
  dosage?: string | null;
  frequency?: string | null;
};

const VET_VISIT_REASONS: VetVisitReason[] = ["Check-up", "Vaccination", "Dental", "Spay / Neuter", "Surgery", "Emergency", "Others"];
const DOSE_UNITS: Array<NonNullable<MedicationRecord["dose_unit"]>> = ["mg", "mcg", "IU", "mL", "tablet", "drop"];
const FREQUENCY_UNITS: Array<NonNullable<MedicationRecord["frequency_unit"]>> = ["hours", "days"];
const humanizeNumericDbError = (message: string) => {
  const lower = message.toLowerCase();
  if (lower.includes("pets_weight_lt_100") || lower.includes("pets_weight_lt_1000")) {
    return "Oops...This input seems invalid.";
  }
  if (lower.includes("invalid input syntax for type integer")) return "Input must be a whole number";
  return message;
};

const parseDecimalInput = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const maxWeightByUnit = (unit: string) => (unit === "lb" ? 1000 : 100);

const VACCINES_BY_SPECIES: Record<string, string[]> = {
  dog: ["Rabies", "Core dog vaccine (DHPP/DA2PP)", "Kennel cough", "Leptospirosis", "Lyme disease", "Dog flu"],
  cat: ["Rabies", "Core cat vaccine (Cat Flu, FVRCP)", "Feline leukemia (FeLV)"],
  rabbit: ["Rabbit viral disease", "Myxomatosis"],
  ferret: ["Rabies", "Ferret distemper"],
  goat: ["Goat core vaccine (tetanus and gut disease)", "Rabies", "Other goat vaccine"],
  pig: ["Pig respiratory vaccine", "Pig fever vaccine", "Other pig vaccine"],
  chickens_ducks: ["Marek’s disease", "Newcastle disease", "Fowl pox", "Poultry vaccine"],
};

const normalizeSpeciesKey = (raw: string) => {
  const normalized = raw.toLowerCase().trim().replace(/[\s/]+/g, "_");
  if (["dog", "dogs"].includes(normalized)) return "dog";
  if (["cat", "cats"].includes(normalized)) return "cat";
  if (["rabbit", "rabbits"].includes(normalized)) return "rabbit";
  if (["ferret", "ferrets"].includes(normalized)) return "ferret";
  if (["goat", "goats"].includes(normalized)) return "goat";
  if (["pig", "pigs"].includes(normalized)) return "pig";
  if (["chicken", "chickens", "duck", "ducks", "chickens_ducks"].includes(normalized)) return "chickens_ducks";
  return normalized;
};

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
      const dateFromDates = dates[index] ?? "";
      const visitDate = formatDateOnly(dateFromDates);
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

const parseReminderEntries = (setReminder: unknown, legacyDate: unknown): ReminderEntry[] => {
  const normalize = (raw: Record<string, unknown>): ReminderEntry | null => {
    const reason = typeof raw.reason === "string" ? raw.reason : "Vaccination";
    const reminderDate = formatDateOnly(raw.reminderDate);
    if (!reminderDate) return null;
    return {
      reason: VET_VISIT_REASONS.includes(reason as VetVisitReason) ? (reason as VetVisitReason) : "Vaccination",
      customReason: typeof raw.customReason === "string" ? raw.customReason : null,
      reminderDate,
    };
  };

  if (Array.isArray(setReminder)) {
    return setReminder
      .map((row) => (row && typeof row === "object" ? normalize(row as Record<string, unknown>) : null))
      .filter((row): row is ReminderEntry => Boolean(row));
  }

  if (setReminder && typeof setReminder === "object") {
    const single = normalize(setReminder as Record<string, unknown>);
    return single ? [single] : [];
  }

  const fallbackDate = formatDateOnly(legacyDate);
  return fallbackDate ? [{ reason: "Vaccination", reminderDate: fallbackDate, customReason: null }] : [];
};

const sortRemindersAsc = (entries: ReminderEntry[]) =>
  [...entries].sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime());

const sortVetVisitsDesc = (entries: VetVisitRecord[]) =>
  [...entries].sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());

const parseMedication = (item: unknown): MedicationRecord | null => {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;

  let doseAmount = typeof raw.dose_amount === "number" ? raw.dose_amount : null;
  let doseUnit = (typeof raw.dose_unit === "string" ? raw.dose_unit : null) as MedicationRecord["dose_unit"];
  let frequencyValue = typeof raw.frequency_value === "number" ? raw.frequency_value : null;
  let frequencyUnit = (typeof raw.frequency_unit === "string" ? raw.frequency_unit : null) as MedicationRecord["frequency_unit"];

  const dosage = typeof raw.dosage === "string" ? raw.dosage : null;
  const frequency = typeof raw.frequency === "string" ? raw.frequency : null;

  if ((doseAmount == null || !doseUnit) && dosage) {
    const doseMatch = dosage.match(/([0-9]+(?:\.[0-9]+)?)\s*(mg|mcg|IU|mL|tablet|drop)/i);
    if (doseMatch) {
      doseAmount = Number(doseMatch[1]);
      doseUnit = doseMatch[2] as MedicationRecord["dose_unit"];
    }
  }

  if ((frequencyValue == null || !frequencyUnit) && frequency) {
    const freqMatch = frequency.match(/(?:every\s*)?([0-9]+)\s*(hours|days)/i);
    if (freqMatch) {
      frequencyValue = Number(freqMatch[1]);
      frequencyUnit = freqMatch[2].toLowerCase() as MedicationRecord["frequency_unit"];
    }
  }

  return {
    name,
    dose_amount: doseAmount,
    dose_unit: doseUnit ?? null,
    frequency_value: frequencyValue,
    frequency_unit: frequencyUnit ?? null,
    dosage,
    frequency,
  };
};

const formatPetAge = (dob: string) => {
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

const PetDraftPreview = ({
  formData,
  photoPreview,
  speciesLabel,
  remindersSorted,
}: {
  formData: PetFormData;
  photoPreview: string | null;
  speciesLabel: string;
  remindersSorted: ReminderEntry[];
}) => {
  const displaySpecies = toTitleCase(speciesLabel) || "Species";
  const displayBreed = formData.breed && formData.breed !== "Other" ? formData.breed.trim() : "";
  const displayName = formData.name.trim() || "Pet name";
  const ageLabel = formatPetAge(formData.dob);

  return (
    <div className="space-y-4">
      {/* ── Staff Badge ─────────────────────────────────────────────────── */}
      <div
        className="w-full bg-white flex flex-col overflow-hidden relative"
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
        {/* Punched slot */}
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
        {/* Photo zone */}
        <div className="relative overflow-hidden" style={{ flex: "1 1 0" }}>
          {photoPreview ? (
            <img
              src={photoPreview}
              alt={displayName}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 bg-[rgba(237,237,250,0.7)] flex items-center justify-center">
              <Camera className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
        </div>
        {/* Sleeve divider */}
        <div style={{ height: 1, background: "rgba(176,190,220,0.45)", flexShrink: 0 }} />
        {/* Content zone — auto-sized */}
        <div
          className="flex flex-col items-center gap-[5px] px-4 text-center"
          style={{ flex: "0 0 auto", paddingTop: 16, paddingBottom: 14 }}
        >
          <h2
            className="font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)] truncate w-full"
            style={{ fontSize: "clamp(18px,5.5vw,24px)" }}
          >
            {displayName}
          </h2>
          <p
            className="font-medium text-[var(--text-secondary)] truncate w-full"
            style={{ fontSize: "clamp(14px,4vw,16px)" }}
          >
            {[displaySpecies, displayBreed].filter(Boolean).join(" · ")}
          </p>
          {(formData.gender || formData.neutered_spayed) && (
            <p style={{ fontSize: "clamp(14px,3.8vw,16px)", color: "rgba(66,73,101,0.58)" }}>
              {[formData.gender, formData.neutered_spayed ? getSterilizedLabel(formData.gender) : null]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
          )}
          {ageLabel && (
            <p style={{ fontSize: "clamp(14px,3.8vw,16px)", color: "rgba(66,73,101,0.58)" }}>
              {ageLabel}
            </p>
          )}
          <p
            className="font-semibold uppercase tracking-[0.18em] mt-1"
            style={{ fontSize: "clamp(9px,2.5vw,11px)", color: "rgba(66,73,101,0.32)" }}
          >
            PET ID
          </p>
        </div>
      </div>
      {/* ── End Badge ───────────────────────────────────────────────────── */}

      <PetDetailsBody
        data={{
          dob: formData.dob,
          weight: formData.weight,
          weightUnit: formData.weight_unit,
          microchipId: formData.microchip_id,
          bio: formData.bio,
          routine: formData.routine,
          temperament: formData.temperament,
          reminder: remindersSorted[0] ?? null,
          vetVisits: formData.vet_visit_records,
          medications: formData.medications,
          clinicName: formData.clinic_name,
          preferredVet: formData.preferred_vet,
          phoneNo: formData.phone_no,
        }}
      />
    </div>
  );
};

const hasPetProfileData = (pet: {
  name: string;
  species: string;
  custom_species: string;
  breed: string;
  gender: string;
  dob: string;
  weight: string | number | null | undefined;
  bio: string;
  routine: string;
  clinic_name: string;
  preferred_vet: string;
  phone_no: string;
  microchip_id: string;
  temperament: unknown[];
  vet_visit_records: unknown[];
  set_reminder: unknown[];
  medications: unknown[];
  photo_url?: string | null;
}) =>
  Boolean(
    pet.name.trim() ||
      pet.species.trim() ||
      pet.custom_species.trim() ||
      pet.breed.trim() ||
      pet.gender.trim() ||
      pet.dob ||
      String(pet.weight ?? "").trim() ||
      pet.bio.trim() ||
      pet.routine.trim() ||
      pet.clinic_name.trim() ||
      pet.preferred_vet.trim() ||
      pet.phone_no.trim() ||
      pet.microchip_id.trim() ||
      pet.temperament.length ||
      pet.vet_visit_records.length ||
      pet.set_reminder.length ||
      pet.medications.length ||
      pet.photo_url
  );

const EditPetProfile = ({ onboardingMode = false }: EditPetProfileProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const petIdParam = searchParams.get("id");
  const petId = onboardingMode ? null : petIdParam;
  const { user } = useAuth();
  const { data: signupData } = useSignup();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(!!petId);
  const [saving, setSaving] = useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isNewPet, setIsNewPet] = useState(onboardingMode || !petId);
  const [profileMode, setProfileMode] = useState<"edit" | "view">("edit");
  const [savedPetId, setSavedPetId] = useState<string | null>(petId);
  const resolveSetPetPrefillKey = useCallback(() => {
    if (!onboardingMode || user?.id) return null;
    const normalizedOwner = normalizeStorageOwner(signupData.email || "");
    if (!normalizedOwner) return null;
    return buildScopedStorageKey(SETPET_PREFILL_KEY, normalizedOwner);
  }, [onboardingMode, signupData.email, user?.id]);

  const clearOnboardingDraftKeys = useCallback((ownerHint?: string | null) => {
    const owners = Array.from(
      new Set(
        [ownerHint, signupData.email, user?.id]
          .map((value) => normalizeStorageOwner(value || ""))
          .filter(Boolean),
      ),
    ) as string[];
    try {
      owners.forEach((owner) => {
        localStorage.removeItem(buildScopedStorageKey(SETPROFILE_PREFILL_KEY, owner));
        localStorage.removeItem(buildScopedStorageKey(SETPET_PREFILL_KEY, owner));
        localStorage.removeItem(buildScopedStorageKey(SIGNUP_STORAGE_KEY, owner));
        sessionStorage.removeItem(buildScopedStorageKey(SIGNUP_PASSWORD_SESSION_KEY, owner));
        sessionStorage.removeItem(buildScopedStorageKey(SIGNUP_PENDING_VERIFICATION_KEY, owner));
      });
      sessionStorage.removeItem("huddle_vi_status");
      sessionStorage.removeItem("signup_verify_submitted_v1");
      sessionStorage.removeItem("signup_verify_docs_submitted");
    } catch {
      // best-effort cleanup only
    }
  }, [signupData.email, user?.id]);

  const petPhoneClass = "w-full pl-10 pr-4 [&_.PhoneInputCountry]:bg-transparent [&_.PhoneInputCountry]:shadow-none [&_.PhoneInputCountrySelectArrow]:opacity-50 [&_.PhoneInputCountryIcon]:bg-transparent [&_.PhoneInputInput]:bg-transparent [&_.PhoneInputInput]:border-0 [&_.PhoneInputInput]:shadow-none [&_.PhoneInputInput]:outline-none";

  const [formData, setFormData] = useState<PetFormData>({
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
    vet_visit_records: [] as VetVisitRecord[],
    set_reminder: [] as ReminderEntry[],
    medications: [] as MedicationRecord[],
    is_active: true,
    is_public: false,
  });

  const [visitInput, setVisitInput] = useState<VetVisitRecord>({ reason: "", customReason: "", visitDate: "", vaccine: "" });
  const [visitEditIndex, setVisitEditIndex] = useState<number | null>(null);
  const [visitError, setVisitError] = useState("");
  const [showVisitEditor, setShowVisitEditor] = useState(false);

  const [reminderInput, setReminderInput] = useState<ReminderEntry>({ reason: "", customReason: "", reminderDate: "" });
  const [reminderEditIndex, setReminderEditIndex] = useState<number | null>(null);
  const [reminderError, setReminderError] = useState("");
  const [showReminderEditor, setShowReminderEditor] = useState(false);

  const [medicationInput, setMedicationInput] = useState<MedicationRecord>({
    name: "",
    dose_amount: null,
    dose_unit: null,
    frequency_value: null,
    frequency_unit: null,
  });
  const [medicationEditIndex, setMedicationEditIndex] = useState<number | null>(null);
  const [medicationError, setMedicationError] = useState("");
  const [showMedicationEditor, setShowMedicationEditor] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    species: "",
    customSpecies: "",
    petDob: "",
    weight: "",
    microchipId: "",
  });

  const hasErrors = Object.values(fieldErrors).some(Boolean);
  const hasRequiredFields =
    formData.name.trim().length > 0 &&
    (formData.species !== "" || formData.custom_species.trim().length > 0) &&
    (formData.species !== "others" || formData.custom_species.trim().length > 0);
  const isFormValid = hasRequiredFields && !hasErrors;

  const speciesForVaccines = useMemo(() => {
    const raw = formData.species === "others" ? formData.custom_species : formData.species;
    return normalizeSpeciesKey(raw);
  }, [formData.species, formData.custom_species]);

  const vaccineOptions = VACCINES_BY_SPECIES[speciesForVaccines] ?? null;
  const remindersSorted = useMemo(() => sortRemindersAsc(formData.set_reminder), [formData.set_reminder]);
  const microchipDisplay = `${formData.microchip_id}${"-".repeat(Math.max(0, 15 - formData.microchip_id.length))}`;
  const speciesPreviewLabel = useMemo(() => {
    const selected = speciesOptions.find((option) => option.id === formData.species);
    if (formData.species === "others") return formData.custom_species.trim();
    return selected?.label ? toTitleCase(selected.label.replace(/s$/, "")) : toTitleCase(formData.species);
  }, [formData.custom_species, formData.species]);

  const fetchPet = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", petId)
        .single();

      if (error) throw error;
      if (data?.owner_id && user?.id && data.owner_id !== user.id) {
        toast.error("You can only edit your own pet profile.");
        navigate(`/pet-details?id=${petId}`, { replace: true });
        return;
      }

      if (data) {
        const d = data as Record<string, unknown>;
        const species = typeof d.species === "string" ? d.species : "";
        const isKnownSpecies = speciesOptions.some((s) => s.id === species);
        const parsedVisits = sortVetVisitsDesc(Array.isArray(d.vet_visit_records)
          ? (d.vet_visit_records as VetVisitRecord[])
          : parseLegacyVaccinations(d.vaccinations, d.vaccination_dates));

        const parsedReminders = sortRemindersAsc(parseReminderEntries(d.set_reminder, d.next_vaccination_reminder));
        const parsedMedications = Array.isArray(d.medications)
          ? (d.medications.map(parseMedication).filter(Boolean) as MedicationRecord[])
          : [];

        const mappedPet = {
          name: (d.name as string) || "",
          species: isKnownSpecies ? species : "others",
          custom_species: isKnownSpecies ? "" : species || "",
          breed: (d.breed as string) || "",
          gender: (d.gender as string) || "",
          neutered_spayed: (d.neutered_spayed as boolean) || false,
          dob: (d.dob as string) || "",
          weight: d.weight != null ? String(d.weight) : "",
          weight_unit: (d.weight_unit as string) || "kg",
          bio: (d.bio as string) || "",
          routine: (d.routine as string) || "",
          clinic_name: (d.clinic_name as string) || "",
          preferred_vet: (d.preferred_vet as string) || "",
          phone_no: (d.phone_no as string) || "",
          microchip_id: (d.microchip_id as string) || "",
          temperament: (Array.isArray(d.temperament) ? d.temperament : []) as string[],
          vet_visit_records: parsedVisits,
          set_reminder: parsedReminders,
          medications: parsedMedications,
          is_active: d.is_active !== false,
          is_public:
            typeof d.is_public === "boolean"
              ? d.is_public
              : hasPetProfileData({
                  name: (d.name as string) || "",
                  species: isKnownSpecies ? species : "others",
                  custom_species: isKnownSpecies ? "" : species || "",
                  breed: (d.breed as string) || "",
                  gender: (d.gender as string) || "",
                  dob: (d.dob as string) || "",
                  weight: d.weight != null ? String(d.weight) : "",
                  bio: (d.bio as string) || "",
                  routine: (d.routine as string) || "",
                  clinic_name: (d.clinic_name as string) || "",
                  preferred_vet: (d.preferred_vet as string) || "",
                  phone_no: (d.phone_no as string) || "",
                  microchip_id: (d.microchip_id as string) || "",
                  temperament: (Array.isArray(d.temperament) ? d.temperament : []) as unknown[],
                  vet_visit_records: parsedVisits as unknown[],
                  set_reminder: parsedReminders as unknown[],
                  medications: parsedMedications as unknown[],
                  photo_url: (d.photo_url as string) || null,
                }),
        };
        setFormData(mappedPet);
        setReminderInput(parsedReminders[0] ?? { reason: "", customReason: "", reminderDate: "" });
        if (d.photo_url) {
          setPhotoPreview(d.photo_url as string);
        }
      }
    } catch {
      toast.error(t("Failed to load pet"));
    } finally {
      setLoading(false);
    }
  }, [navigate, petId, t, user?.id]);

  useEffect(() => {
    if (!onboardingMode || user?.id || petId) return;
    const prefillKey = resolveSetPetPrefillKey();
    if (!prefillKey) return;
    try {
      const raw = localStorage.getItem(prefillKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as Partial<typeof formData> & {
        photo_preview?: string;
        saved_pet_id?: string;
        prefill_owner?: string;
      };
      const expectedOwner = normalizeStorageOwner(signupData.email || "");
      const cachedOwner = normalizeStorageOwner(cached.prefill_owner || "");
      if (!expectedOwner || !cachedOwner || expectedOwner !== cachedOwner) return;
      setFormData((prev) => ({
        ...prev,
        ...cached,
        temperament: Array.isArray(cached.temperament) ? cached.temperament : prev.temperament,
        vet_visit_records: Array.isArray(cached.vet_visit_records) ? cached.vet_visit_records : prev.vet_visit_records,
        set_reminder: Array.isArray(cached.set_reminder) ? cached.set_reminder : prev.set_reminder,
        medications: Array.isArray(cached.medications) ? cached.medications : prev.medications,
      }));
      if (cached.photo_preview) setPhotoPreview(cached.photo_preview);
      if (cached.saved_pet_id) setSavedPetId(cached.saved_pet_id);
      setIsNewPet(false);
    } catch {
      // no-op
    }
  }, [onboardingMode, user, petId, resolveSetPetPrefillKey]);

  useEffect(() => {
    if (petId) {
      void fetchPet();
    } else {
      setLoading(false);
    }
  }, [petId, fetchPet]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const toggleTemperament = (temp: string) => {
    setFormData((prev) => ({
      ...prev,
      temperament: prev.temperament.includes(temp)
        ? prev.temperament.filter((t) => t !== temp)
        : [...prev.temperament, temp],
    }));
  };

  const validateVisitInput = (record: VetVisitRecord) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!record.reason) {
      setVisitError("Reason is required");
      return false;
    }

    if (!record.visitDate) {
      setVisitError("Visit date is required");
      return false;
    }

    const visitDate = new Date(record.visitDate);
    if (formData.dob) {
      const petDob = new Date(formData.dob);
      petDob.setHours(0, 0, 0, 0);
      if (visitDate < petDob) {
        setVisitError("Visit date cannot be earlier than pet DOB");
        return false;
      }
    }

    if (visitDate > today) {
      setVisitError("Visit date cannot be in the future");
      return false;
    }

    if (record.reason === "Others" && !record.customReason?.trim()) {
      setVisitError("Custom reason is required");
      return false;
    }

    if (record.reason === "Vaccination" && !record.vaccine?.trim()) {
      setVisitError("Vaccine is required");
      return false;
    }

    setVisitError("");
    return true;
  };

  const addOrUpdateVisit = () => {
    if (!validateVisitInput(visitInput)) return;

    if (visitEditIndex != null) {
      setFormData((prev) => ({
        ...prev,
        vet_visit_records: sortVetVisitsDesc(prev.vet_visit_records.map((visit, idx) => (idx === visitEditIndex ? visitInput : visit))),
      }));
    } else {
      setFormData((prev) => ({ ...prev, vet_visit_records: sortVetVisitsDesc([...prev.vet_visit_records, visitInput]) }));
    }

    setVisitInput({ reason: "", customReason: "", visitDate: "", vaccine: "" });
    setVisitEditIndex(null);
    setShowVisitEditor(false);
  };

  const editVisit = (index: number) => {
    setVisitInput(formData.vet_visit_records[index]);
    setVisitEditIndex(index);
    setVisitError("");
    setShowVisitEditor(true);
  };

  const removeVisit = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      vet_visit_records: prev.vet_visit_records.filter((_, i) => i !== index),
    }));
    if (visitEditIndex === index) {
      setVisitEditIndex(null);
      setVisitInput({ reason: "", customReason: "", visitDate: "", vaccine: "" });
    }
  };

  const saveReminder = () => {
    if (!reminderInput.reason) {
      setReminderError("Reason is required");
      return;
    }
    if (!reminderInput.reminderDate) {
      setReminderError("Reminder date is required");
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderDate = new Date(reminderInput.reminderDate);
    if (reminderDate <= today) {
      setReminderError("Reminder date must be in the future");
      return;
    }
    if (reminderInput.reason === "Others" && !reminderInput.customReason?.trim()) {
      setReminderError("Custom reason is required");
      return;
    }
    setReminderError("");
    setFormData((prev) => {
      const next = [...prev.set_reminder];
      if (reminderEditIndex != null) {
        next[reminderEditIndex] = reminderInput;
      } else {
        next.push(reminderInput);
      }
      return { ...prev, set_reminder: sortRemindersAsc(next) };
    });
    setReminderEditIndex(null);
    setShowReminderEditor(false);
    toast.success("Reminder saved");
  };

  const clearReminder = (index?: number) => {
    setFormData((prev) => {
      if (typeof index !== "number") return { ...prev, set_reminder: [] };
      return { ...prev, set_reminder: prev.set_reminder.filter((_, i) => i !== index) };
    });
    setReminderInput({ reason: "", customReason: "", reminderDate: "" });
    setReminderEditIndex(null);
    setReminderError("");
    setShowReminderEditor(false);
    toast.success("Reminder cleared");
  };

  const validateMedicationInput = (entry: MedicationRecord) => {
    if (!entry.name.trim()) {
      setMedicationError("Medication name is required");
      return false;
    }
    if (typeof entry.dose_amount === "number" && entry.dose_amount < 0) {
      setMedicationError("Dosage cannot be negative");
      return false;
    }
    if (entry.frequency_unit === "hours" && typeof entry.frequency_value === "number" && entry.frequency_value >= 25) {
      setMedicationError("Let’s keep this within 24 hours.");
      return false;
    }
    setMedicationError("");
    return true;
  };

  const addOrUpdateMedication = () => {
    if (!validateMedicationInput(medicationInput)) return;

    if (medicationEditIndex != null) {
      setFormData((prev) => ({
        ...prev,
        medications: prev.medications.map((med, idx) => (idx === medicationEditIndex ? medicationInput : med)),
      }));
    } else {
      setFormData((prev) => ({ ...prev, medications: [...prev.medications, medicationInput] }));
    }

    setMedicationInput({ name: "", dose_amount: null, dose_unit: null, frequency_value: null, frequency_unit: null });
    setMedicationEditIndex(null);
    setShowMedicationEditor(false);
  };

  const editMedication = (index: number) => {
    setMedicationInput(formData.medications[index]);
    setMedicationEditIndex(index);
    setMedicationError("");
    setShowMedicationEditor(true);
  };

  const removeMedication = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
    if (medicationEditIndex === index) {
      setMedicationEditIndex(null);
      setMedicationInput({ name: "", dose_amount: null, dose_unit: null, frequency_value: null, frequency_unit: null });
    }
  };

  // ── Silent draft save (View tab) ────────────────────────────────────────────
  const silentSave = async () => {
    if (!user || !savedPetId) return; // Only persist drafts for existing pets
    try {
      await supabase.from("pets").update({
        name: formData.name,
        species: formData.species === "others" ? formData.custom_species : formData.species,
        breed: formData.breed || null,
        gender: formData.gender || null,
        neutered_spayed: formData.neutered_spayed,
        dob: formData.dob || null,
        weight: parseDecimalInput(formData.weight),
        weight_unit: formData.weight_unit,
        bio: formData.bio || null,
        routine: formData.routine || null,
        clinic_name: formData.clinic_name || null,
        preferred_vet: formData.preferred_vet || null,
        phone_no: formData.phone_no || null,
        vet_contact:
          [formData.clinic_name, formData.preferred_vet, formData.phone_no].filter(Boolean).join(" | ") || null,
        microchip_id: formData.microchip_id || null,
        temperament: formData.temperament.length > 0 ? formData.temperament : null,
        vet_visit_records: formData.vet_visit_records.length > 0 ? (formData.vet_visit_records as unknown as Json[]) : [],
        set_reminder: (formData.set_reminder as unknown as Json) ?? null,
        medications: formData.medications.length > 0 ? (formData.medications as unknown as Json[]) : [],
        is_active: formData.is_active,
        is_public: formData.is_public,
        updated_at: new Date().toISOString(),
      }).eq("id", savedPetId);
    } catch (err) {
      console.warn("[EditPetProfile.silentSave]", err);
    }
  };

  const handleSave = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const activeUser = user ?? sessionData.session?.user ?? null;
    if (!activeUser) {
      if (!onboardingMode) {
        toast.error("Please sign in again to save your pet profile.");
        return;
      }
      try {
        const prefillKey = resolveSetPetPrefillKey();
        const localId = savedPetId || `local-${crypto.randomUUID()}`;
        if (prefillKey) {
          localStorage.setItem(
            prefillKey,
            JSON.stringify({
              prefill_owner: normalizeStorageOwner(signupData.email || ""),
              ...formData,
              saved_pet_id: localId,
              photo_preview: photoPreview || "",
              updated_at: new Date().toISOString(),
            }),
          );
        }
        setSavedPetId(localId);
        toast.success(t("Pet profile saved"));
        navigate("/", { replace: true });
      } catch {
        toast.error("Failed to save pet profile. Please retry.");
      }
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!formData.name.trim()) {
      setFieldErrors((prev) => ({ ...prev, name: t("Pet name is required") }));
      return;
    }

    if (!formData.species && !formData.custom_species.trim()) {
      setFieldErrors((prev) => ({ ...prev, species: t("Species is required") }));
      return;
    }

    if (formData.species === "others" && !formData.custom_species.trim()) {
      setFieldErrors((prev) => ({ ...prev, customSpecies: t("Species is required") }));
      return;
    }

    if (formData.dob) {
      const petDob = new Date(formData.dob);
      if (petDob > today) {
        setFieldErrors((prev) => ({ ...prev, petDob: "Pet DOB cannot be in the future" }));
        return;
      }
    }

    const weightNumber = parseDecimalInput(formData.weight);
    const maxWeight = maxWeightByUnit(formData.weight_unit);
    if (formData.weight && (weightNumber == null || weightNumber < 1 || weightNumber > maxWeight)) {
      setFieldErrors((prev) => ({ ...prev, weight: "Oops...This input seems invalid." }));
      return;
    }

    const invalidReminder = formData.set_reminder.find((entry) => {
      const reminderDate = new Date(entry.reminderDate);
      return reminderDate <= today;
    });
    if (invalidReminder) {
      setReminderError("Reminder date must be in the future");
      return;
    }

    const hasNegativeDose = formData.medications.some((med) => typeof med.dose_amount === "number" && med.dose_amount < 0);
    if (hasNegativeDose) {
      setMedicationError("Dosage cannot be negative");
      return;
    }

    setSaving(true);

    try {
      let photoUrl = photoPreview;
      const finalPetId = petId || crypto.randomUUID();

      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${activeUser.id}/${finalPetId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("pets")
          .upload(fileName, photoFile, { upsert: true });

        if (uploadError) {
          toast.error("Photo upload failed. Please retry.");
          setSaving(false);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("pets").getPublicUrl(fileName);

        photoUrl = publicUrl;
      }

      const petData = {
        name: formData.name,
        species: formData.species === "others" ? formData.custom_species : formData.species,
        breed: formData.breed || null,
        gender: formData.gender || null,
        neutered_spayed: formData.neutered_spayed,
        dob: formData.dob || null,
        weight: parseDecimalInput(formData.weight),
        weight_unit: formData.weight_unit,
        bio: formData.bio || null,
        routine: formData.routine || null,
        clinic_name: formData.clinic_name || null,
        preferred_vet: formData.preferred_vet || null,
        phone_no: formData.phone_no || null,
        vet_contact: [formData.clinic_name, formData.preferred_vet, formData.phone_no].filter(Boolean).join(" | ") || null,
        microchip_id: formData.microchip_id || null,
        temperament: formData.temperament.length > 0 ? formData.temperament : null,
        vet_visit_records: (formData.vet_visit_records as unknown as Json[]).length > 0 ? (formData.vet_visit_records as unknown as Json[]) : [],
        set_reminder: (formData.set_reminder as unknown as Json) ?? null,
        medications: (formData.medications as unknown as Json[]).length > 0 ? (formData.medications as unknown as Json[]) : [],
        is_active: formData.is_active,
        is_public: formData.is_public,
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      };

      if (isNewPet) {
        const { error } = await supabase.from("pets").insert({
          id: finalPetId,
          owner_id: activeUser.id,
          ...petData,
          created_at: new Date().toISOString(),
        });

        if (error) {
          toast.error(humanizeNumericDbError(error.message || "Failed to save pet profile. Please retry."));
          return;
        }

        if (!onboardingMode) {
          toast.success(t("Pet added!"));
        }
        await queryClient.invalidateQueries({ queryKey: ["pets"] });
        setSavedPetId(finalPetId);
      } else {
        const { error } = await supabase.from("pets").update(petData).eq("id", petId);

        if (error) {
          toast.error(humanizeNumericDbError(error.message || "Failed to save pet profile. Please retry."));
          return;
        }

        if (!onboardingMode) {
          toast.success(t("Pet profile updated!"));
        }
        await queryClient.invalidateQueries({ queryKey: ["pets"] });
        setSavedPetId(petId);
      }

      try {
        const prefillKey = resolveSetPetPrefillKey();
        if (prefillKey) {
          localStorage.removeItem(prefillKey);
        }
      } catch {
        // no-op
      }

      // Brevo CRM sync — fire-and-forget, never blocks the user flow
      void supabase.functions.invoke("brevo-sync", {
        body: { event: "pet_profile_completed", user_id: activeUser.id },
      }).catch((err) => console.warn("[brevo-sync] pet_profile_completed failed silently", err));

      const shouldGoHome = onboardingMode || location.pathname === "/set-pet";
      if (shouldGoHome) {
        if (onboardingMode) {
          clearOnboardingDraftKeys(activeUser.id);
          toast.success("Welcome to Huddle! Pet care tracking, nearby connections, and all pet community happenings – right in your palm now!");
        }
        navigate("/", { replace: true });
      } else {
        navigate(-1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(humanizeNumericDbError(message || "Failed to save pet profile. Please retry."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full min-h-0 bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-background flex flex-col overflow-hidden">
      <GlobalHeader onUpgradeClick={() => setIsPremiumOpen(true)} />

      <header className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">Tell us about your pet</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Helps improve their health tracking</p>
        </div>
        <NeuControl
          size="icon-md"
          variant="tertiary"
          onClick={handleSave}
          disabled={profileMode !== "edit" || saving}
          aria-label="Save"
        >
          {saving ? <Loader2 size={20} strokeWidth={1.75} className="animate-spin" aria-hidden /> : <Save size={20} strokeWidth={1.75} aria-hidden />}
        </NeuControl>
      </header>
      <div className="px-4 pt-2">
        <div className="grid grid-cols-2 border-b border-border">
          <button
            type="button"
            onClick={() => setProfileMode("edit")}
            className={cn(
              "h-9 text-sm font-medium transition-colors border-b-2 -mb-px focus:outline-none",
              profileMode === "edit" ? "text-brandText border-[rgba(66,73,101,0.22)]" : "text-muted-foreground border-transparent"
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { void silentSave(); setProfileMode("view"); }}
            className={cn(
              "h-9 text-sm font-medium transition-colors border-b-2 -mb-px focus:outline-none",
              profileMode === "view" ? "text-brandText border-[rgba(66,73,101,0.22)]" : "text-muted-foreground border-transparent"
            )}
          >
            View
          </button>
        </div>
      </div>

      <StyledScrollArea className="flex-1 min-h-0 px-4 py-6 pb-6">
        {profileMode === "view" ? (
          <PetDraftPreview
            formData={formData}
            photoPreview={photoPreview}
            speciesLabel={speciesPreviewLabel}
            remindersSorted={remindersSorted}
          />
        ) : (
        <div className="space-y-6">
          <div className="flex justify-center">
            <div
              className="relative w-[100px] h-[100px] cursor-pointer group"
              onClick={() => photoInputRef.current?.click()}
            >
              <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-muted border-4 border-dashed border-border group-hover:border-accent transition-colors">
                {photoPreview ? (
                  <img src={photoPreview} alt={t("Pet")} className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center pointer-events-none">
                <Camera className="w-4 h-4 text-accent-foreground" />
              </div>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t("Pet Name")}</label>
            <div className={cn("form-field-rest relative flex items-center", fieldErrors.name && "form-field-error")}>
              <input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                onBlur={() => {
                  setFieldErrors((prev) => ({ ...prev, name: formData.name.trim() ? "" : t("Pet name is required") }));
                }}
                placeholder={t("Pet's name")}
                className="field-input-core"
                aria-invalid={Boolean(fieldErrors.name)}
              />
            </div>
            {fieldErrors.name && <ErrorLabel message={fieldErrors.name} />}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t("Species")}</label>
            <div className={cn("flex flex-wrap gap-2 mb-2", fieldErrors.species && "rounded-xl border border-red-500 p-2")}>
              {speciesOptions.map((species) => (
                <button
                  key={species.id}
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      species: species.id,
                      breed: species.id === "others" ? "" : prev.breed,
                    }))
                  }
                  className={cn(
                    "h-10 px-4 rounded-full text-sm font-medium transition-all inline-flex items-center justify-center",
                    formData.species === species.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {t(species.label)}
                </button>
              ))}
            </div>
            {formData.species === "others" && (
              <div className={cn("form-field-rest relative flex items-center mt-2", fieldErrors.customSpecies && "form-field-error")}>
                <input
                  value={formData.custom_species}
                  onChange={(e) => setFormData((prev) => ({ ...prev, custom_species: e.target.value }))}
                  onBlur={() => {
                    setFieldErrors((prev) => ({ ...prev, customSpecies: formData.custom_species.trim() ? "" : t("Species is required") }));
                  }}
                  placeholder={t("Enter species...")}
                  className="field-input-core"
                  aria-invalid={Boolean(fieldErrors.customSpecies)}
                />
              </div>
            )}
            {fieldErrors.species && <ErrorLabel message={fieldErrors.species} />}
            {fieldErrors.customSpecies && <ErrorLabel message={fieldErrors.customSpecies} />}
          </div>

          {formData.species !== "others" && (
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Breed")}</label>
              <NeuDropdown
                placeholder="Select"
                options={(speciesBreeds[formData.species] || ["Other"]).map((breed) => ({ value: breed, label: t(breed) }))}
                value={formData.breed}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, breed: value }))}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Gender")}</label>
              <div className="flex gap-2">
                {genderOptions.map((gender) => (
                  <button
                    key={gender}
                    onClick={() => setFormData((prev) => ({ ...prev, gender }))}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center rounded-xl px-4 text-sm font-medium transition-all",
                      formData.gender === gender ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-10 flex items-center justify-between rounded-full bg-muted px-4">
              <label className="font-medium text-sm">{t("Neutered/Spayed")}</label>
              <input
                type="checkbox"
                checked={formData.neutered_spayed}
                onChange={(e) => setFormData((prev) => ({ ...prev, neutered_spayed: e.target.checked }))}
                className="h-4 w-4 rounded border-brandText/30 accent-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div>
              <label className="text-sm font-medium mb-2 block">{t("Date of Birth")}</label>
              <div className={cn("form-field-rest relative flex items-center", fieldErrors.petDob && "form-field-error")}>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData((prev) => ({ ...prev, dob: e.target.value }))}
                  onBlur={() => {
                    if (!formData.dob) return;
                    const petDob = new Date(formData.dob);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    setFieldErrors((prev) => ({ ...prev, petDob: petDob > today ? "Pet DOB cannot be in the future" : "" }));
                  }}
                  className="field-input-core pr-3"
                  aria-invalid={Boolean(fieldErrors.petDob)}
                />
              </div>
              {fieldErrors.petDob && <ErrorLabel message={fieldErrors.petDob} />}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">{t("Weight")}</label>
              <div className="form-field-rest relative flex items-center">
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.weight}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!/^\d*(?:[.,]\d*)?$/.test(next)) return;
                    setFormData((prev) => ({ ...prev, weight: next }));
                    const parsed = parseDecimalInput(next);
                    const maxWeight = maxWeightByUnit(formData.weight_unit);
                    if (next && (parsed == null || parsed < 1 || parsed > maxWeight)) {
                      setFieldErrors((prev) => ({ ...prev, weight: "Oops...This input seems invalid." }));
                    } else {
                      setFieldErrors((prev) => ({ ...prev, weight: "" }));
                    }
                  }}
                  placeholder={t("0")}
                  className="field-input-core pr-14"
                  aria-invalid={Boolean(fieldErrors.weight)}
                />
                <select
                  value={formData.weight_unit}
                  onChange={(e) => {
                    const nextUnit = e.target.value;
                    setFormData((prev) => ({ ...prev, weight_unit: nextUnit }));
                    const parsed = parseDecimalInput(formData.weight);
                    const maxWeight = maxWeightByUnit(nextUnit);
                    if (formData.weight && (parsed == null || parsed < 1 || parsed > maxWeight)) {
                      setFieldErrors((prev) => ({ ...prev, weight: "Oops...This input seems invalid." }));
                    } else {
                      setFieldErrors((prev) => ({ ...prev, weight: "" }));
                    }
                  }}
                  className="absolute right-3 h-7 border-0 bg-transparent text-xs text-[var(--text-tertiary)] pr-4 focus:outline-none"
                >
                  <option value="kg">{t("kg")}</option>
                  <option value="lb">{t("lb")}</option>
                </select>
              </div>
              {fieldErrors.weight && <ErrorLabel message={fieldErrors.weight} />}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t("Pet Bio")}</label>
            <div className="form-field-rest relative h-auto min-h-[112px] py-3">
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
                placeholder={t("Tell us about your pet")}
                className="field-input-core resize-none min-h-[88px]"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t("Temperament")}</label>
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="form-field-rest w-full h-[44px] px-4 flex items-center justify-between text-[14px]"
                  >
                    <span className={cn("truncate", formData.temperament.length === 0 && "text-muted-foreground")}>
                      {formData.temperament.length > 0 ? formData.temperament.join(", ") : "Select temperament"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="z-[95] w-[min(360px,calc(100vw-40px))] p-2 rounded-[14px] border border-brandText/10 bg-white"
                >
                  <div className="max-h-[220px] overflow-y-auto pr-1">
                    {TEMPERAMENT_OPTIONS.map((temp) => (
                      <button
                        key={temp}
                        type="button"
                        onClick={() => toggleTemperament(temp)}
                        className="w-full flex items-center justify-between rounded-[10px] px-3 py-2 text-sm text-left hover:bg-muted/40"
                      >
                        <span>{temp}</span>
                        {formData.temperament.includes(temp) ? <Check className="w-4 h-4 text-brandBlue" strokeWidth={2} /> : <span className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t("Daily Routine")}</label>
            <div className="form-field-rest relative h-auto min-h-[96px] py-3">
              <textarea
                value={formData.routine}
                onChange={(e) => setFormData((prev) => ({ ...prev, routine: e.target.value }))}
                placeholder={t("Feeding times, walks, play schedule")}
                className="field-input-core resize-none min-h-[72px]"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">{t("Microchip ID")}</label>
            <div className={cn("form-field-rest relative flex items-center", fieldErrors.microchipId && "form-field-error")}>
              <input
                value={microchipDisplay}
                onChange={() => {
                  // controlled via key/paste handlers to avoid cursor jump on masked value
                }}
                onFocus={(e) => {
                  const pos = formData.microchip_id.length;
                  requestAnimationFrame(() => e.currentTarget.setSelectionRange(pos, pos));
                }}
                onClick={(e) => {
                  const pos = formData.microchip_id.length;
                  e.currentTarget.setSelectionRange(pos, pos);
                }}
                onKeyDown={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  if (e.key === "Backspace" || e.key === "Delete") {
                    e.preventDefault();
                    setFormData((prev) => ({ ...prev, microchip_id: prev.microchip_id.slice(0, -1) }));
                    setFieldErrors((prev) => ({ ...prev, microchipId: "" }));
                    return;
                  }
                  if (/^\d$/.test(e.key)) {
                    e.preventDefault();
                    setFormData((prev) => ({
                      ...prev,
                      microchip_id: prev.microchip_id.length < 15 ? `${prev.microchip_id}${e.key}` : prev.microchip_id,
                    }));
                    setFieldErrors((prev) => ({ ...prev, microchipId: "" }));
                    return;
                  }
                  if (["Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                  e.preventDefault();
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
                  if (!pasted) return;
                  setFormData((prev) => ({
                    ...prev,
                    microchip_id: `${prev.microchip_id}${pasted}`.slice(0, 15),
                  }));
                  setFieldErrors((prev) => ({ ...prev, microchipId: "" }));
                }}
                className="field-input-core font-mono"
                aria-invalid={Boolean(fieldErrors.microchipId)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">VET CONTACT</h3>
            <div className="form-field-rest relative flex items-center">
              <input
                value={formData.clinic_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, clinic_name: e.target.value }))}
                placeholder={t("Clinic name")}
                className="field-input-core"
              />
            </div>
            <div className="form-field-rest relative flex items-center">
              <input
                value={formData.preferred_vet}
                onChange={(e) => setFormData((prev) => ({ ...prev, preferred_vet: e.target.value }))}
                placeholder={t("Preferred vet")}
                className="field-input-core"
              />
            </div>
            <div className="form-field-rest relative flex items-center">
              <Phone className="absolute left-4 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
              <PhoneInput
                international
                defaultCountry="HK"
                value={formData.phone_no}
                onChange={(value) => setFormData((prev) => ({ ...prev, phone_no: value || "" }))}
                className={petPhoneClass}
                inputStyle={{
                  width: "100%",
                  height: "100%",
                  fontSize: "15px",
                  border: "none",
                  boxShadow: "none",
                  padding: 0,
                  background: "transparent",
                  color: "var(--text-primary,#424965)",
                  outline: "none",
                }}
                placeholder={t("Clinic phone (+XXX)")}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">HEALTH</h3>
          <div className="p-3 rounded-xl bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Vet Visit Records</span>
              <NeuControl
                size="icon-sm"
                variant="tertiary"
                onClick={() => {
                  setVisitEditIndex(null);
                  setVisitInput({ reason: "", customReason: "", visitDate: "", vaccine: "" });
                  setVisitError("");
                  setShowVisitEditor((prev) => !prev);
                }}
                aria-label="Add vet visit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </NeuControl>
            </div>
            {formData.vet_visit_records.map((visit, index) => (
              <div key={`${visit.visitDate}-${index}`} className="form-field-rest relative flex items-center gap-2 px-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{visit.reason === "Others" ? visit.customReason : visit.reason}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {visit.visitDate}
                    {visit.vaccine ? ` • ${visit.vaccine}` : ""}
                  </p>
                </div>
                <button onClick={() => editVisit(index)} className="text-muted-foreground p-1" aria-label="Edit visit">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => removeVisit(index)} className="text-destructive p-1" aria-label="Remove visit">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            {showVisitEditor && (
              <div className="space-y-2 border-t border-brandText/10 pt-2">
                <NeuDropdown
                  placeholder="Select"
                  options={VET_VISIT_REASONS.map((reason) => ({ value: reason, label: reason }))}
                  value={visitInput.reason}
                  onValueChange={(value) =>
                    setVisitInput((prev) => ({
                      ...prev,
                      reason: value as VetVisitReason,
                      customReason: value === "Others" ? prev.customReason : "",
                      vaccine: value === "Vaccination" ? prev.vaccine : "",
                    }))
                  }
                />
                <div className="form-field-rest relative flex items-center">
                  <input
                    type="date"
                    value={visitInput.visitDate}
                    onChange={(e) => setVisitInput((prev) => ({ ...prev, visitDate: e.target.value }))}
                    className="field-input-core pr-3"
                  />
                </div>

                {visitInput.reason === "Others" && (
                  <div className="form-field-rest relative flex items-center">
                    <input
                      value={visitInput.customReason || ""}
                      onChange={(e) => setVisitInput((prev) => ({ ...prev, customReason: e.target.value }))}
                      placeholder="Custom reason"
                      className="field-input-core"
                    />
                  </div>
                )}

                {visitInput.reason === "Vaccination" &&
                  (vaccineOptions ? (
                    <NeuDropdown
                      placeholder="Select"
                      options={vaccineOptions.map((vaccine) => ({ value: vaccine, label: vaccine }))}
                      value={visitInput.vaccine || ""}
                      onValueChange={(value) => setVisitInput((prev) => ({ ...prev, vaccine: value }))}
                    />
                  ) : (
                    <div className="form-field-rest relative flex items-center">
                      <input
                        value={visitInput.vaccine || ""}
                        onChange={(e) => setVisitInput((prev) => ({ ...prev, vaccine: e.target.value }))}
                        placeholder="Vaccine"
                        className="field-input-core"
                      />
                    </div>
                  ))}

                <div className="flex justify-end gap-2">
                  <NeuButton
                    onClick={() => {
                      setShowVisitEditor(false);
                      setVisitEditIndex(null);
                      setVisitError("");
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </NeuButton>
                  <NeuControl onClick={addOrUpdateVisit} size="icon-sm" variant="secondary" aria-label={visitEditIndex != null ? "Update visit" : "Save visit"}>
                    <Save className="w-4 h-4" />
                  </NeuControl>
                </div>
              </div>
            )}
            {visitError && <ErrorLabel message={visitError} />}
          </div>

          <div className="p-3 rounded-xl bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Set Reminder</span>
              <NeuControl
                size="icon-sm"
                variant="tertiary"
                onClick={() => {
                  setReminderEditIndex(null);
                  setReminderInput({ reason: "", customReason: "", reminderDate: "" });
                  setReminderError("");
                  setShowReminderEditor((prev) => !prev);
                }}
                aria-label="Set reminder"
              >
                <Pencil className="w-3.5 h-3.5" />
              </NeuControl>
            </div>
            {remindersSorted.map((entry, index) => (
              <div key={`${entry.reminderDate}-${entry.reason}-${index}`} className="form-field-rest relative flex items-center gap-2 px-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{entry.reason === "Others" ? (entry.customReason || "Others") : entry.reason}</p>
                  <p className="text-xs text-muted-foreground truncate">{entry.reminderDate}</p>
                </div>
                <button
                  onClick={() => {
                    setReminderInput(entry);
                    setReminderEditIndex(index);
                    setReminderError("");
                    setShowReminderEditor(true);
                  }}
                  className="text-muted-foreground p-1"
                  aria-label="Edit reminder"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => clearReminder(index)} className="text-destructive p-1" aria-label="Clear reminder">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {showReminderEditor && (
              <div className="space-y-2 border-t border-brandText/10 pt-2">
                <NeuDropdown
                  placeholder="Select"
                  options={VET_VISIT_REASONS.map((reason) => ({ value: reason, label: reason }))}
                  value={reminderInput.reason}
                  onValueChange={(value) =>
                    setReminderInput((prev) => ({
                      ...prev,
                      reason: value as VetVisitReason,
                      customReason: value === "Others" ? prev.customReason : "",
                    }))
                  }
                />
                <div className="form-field-rest relative flex items-center">
                  <input
                    type="date"
                    value={reminderInput.reminderDate}
                    onChange={(e) => setReminderInput((prev) => ({ ...prev, reminderDate: e.target.value }))}
                    className="field-input-core pr-3"
                  />
                </div>

                {reminderInput.reason === "Others" && (
                  <div className="form-field-rest relative flex items-center">
                    <input
                      value={reminderInput.customReason || ""}
                      onChange={(e) => setReminderInput((prev) => ({ ...prev, customReason: e.target.value }))}
                      placeholder="Custom reason"
                      className="field-input-core"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <NeuButton onClick={() => { setShowReminderEditor(false); setReminderEditIndex(null); }} size="sm" variant="ghost">
                    Cancel
                  </NeuButton>
                  <NeuControl variant="secondary" onClick={saveReminder} size="icon-sm" aria-label={reminderEditIndex != null ? "Update reminder" : "Save reminder"}>
                    <Save className="w-4 h-4" />
                  </NeuControl>
                </div>
              </div>
            )}
            {reminderError && <ErrorLabel message={reminderError} />}
          </div>

          <div className="p-3 rounded-xl bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("Medications")}</span>
              <NeuControl
                size="icon-sm"
                variant="tertiary"
                onClick={() => {
                  setMedicationEditIndex(null);
                  setMedicationInput({ name: "", dose_amount: null, dose_unit: null, frequency_value: null, frequency_unit: null });
                  setMedicationError("");
                  setShowMedicationEditor((prev) => !prev);
                }}
                aria-label="Add medication"
              >
                <Pencil className="w-3.5 h-3.5" />
              </NeuControl>
            </div>
            {formData.medications.map((med, index) => (
              <div key={`${med.name}-${index}`} className="form-field-rest relative flex items-center gap-2 px-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{med.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {med.dose_amount != null && med.dose_unit ? `${med.dose_amount}${med.dose_unit}` : med.dosage || ""}
                    {(med.frequency_value != null && med.frequency_unit) || med.frequency ? ` • ${med.frequency_value != null && med.frequency_unit ? `Every ${med.frequency_value} ${med.frequency_unit}` : med.frequency}` : ""}
                  </p>
                </div>
                <button onClick={() => editMedication(index)} className="text-muted-foreground p-1" aria-label="Edit medication">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => removeMedication(index)} className="text-destructive p-1" aria-label="Remove medication">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {showMedicationEditor && (
              <div className="space-y-2 border-t border-brandText/10 pt-2">
                <div className="form-field-rest relative flex items-center">
                  <input
                    value={medicationInput.name}
                    onChange={(e) => setMedicationInput((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t("Medication name")}
                    className="field-input-core"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="form-field-rest relative flex items-center">
                    <input
                      type="number"
                      value={medicationInput.dose_amount ?? ""}
                      onChange={(e) =>
                        setMedicationInput((prev) => {
                          if (e.target.value === "") return { ...prev, dose_amount: null };
                          const parsed = Number(e.target.value);
                          return { ...prev, dose_amount: Number.isNaN(parsed) ? null : Math.max(0, parsed) };
                        })
                      }
                      placeholder="Dosage"
                      className="field-input-core pr-0"
                      min={0}
                      step="any"
                    />
                    <select
                      value={medicationInput.dose_unit ?? ""}
                      onChange={(e) =>
                        setMedicationInput((prev) => ({ ...prev, dose_unit: (e.target.value || null) as MedicationRecord["dose_unit"] }))
                      }
                      className="absolute right-2 h-7 border-0 bg-transparent text-xs text-[var(--text-tertiary)] focus:outline-none"
                    >
                      <option value="">Select</option>
                      {DOSE_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field-rest relative flex items-center">
                    <input
                      type="number"
                      value={medicationInput.frequency_value ?? ""}
                      onChange={(e) =>
                        setMedicationInput((prev) => ({
                          ...prev,
                          frequency_value: e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                        }))
                      }
                      placeholder="Frequency"
                      className="field-input-core pr-0"
                      min={0}
                      step="any"
                    />
                    <select
                      value={medicationInput.frequency_unit ?? ""}
                      onChange={(e) =>
                        setMedicationInput((prev) => ({ ...prev, frequency_unit: (e.target.value || null) as MedicationRecord["frequency_unit"] }))
                      }
                      className="absolute right-2 h-7 border-0 bg-transparent text-xs text-[var(--text-tertiary)] focus:outline-none"
                    >
                      <option value="">Select</option>
                      {FREQUENCY_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <NeuButton
                    onClick={() => {
                      setShowMedicationEditor(false);
                      setMedicationEditIndex(null);
                      setMedicationError("");
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </NeuButton>
                  <NeuControl onClick={addOrUpdateMedication} size="icon-sm" variant="secondary" aria-label={medicationEditIndex != null ? "Update medication" : "Save medication"}>
                    <Save className="w-4 h-4" />
                  </NeuControl>
                </div>
              </div>
            )}
            {medicationError && <ErrorLabel message={medicationError} />}
          </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <span className="text-sm font-medium">{t("Still Active")}</span>
                <p className="text-xs text-muted-foreground">{t("Is this pet still with you?")}</p>
              </div>
              <NeuToggle
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <span className="text-sm font-medium">{t("Public Profile")}</span>
                <p className="text-xs text-muted-foreground">{t("Show this pet publicly")}</p>
              </div>
              <NeuToggle
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_public: checked }))}
              />
            </div>
          </div>
        </div>
        )}
      </StyledScrollArea>

      <PremiumUpsell isOpen={isPremiumOpen} onClose={() => setIsPremiumOpen(false)} />
    </div>
  );
};

export default EditPetProfile;
