import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  findNodeHandle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  NativePetDetailsContent,
  type NativePetDetailsData,
} from "../components/NativePetDetailsContent";
import { AppDestructiveSlideConfirm } from "../components/nativeModalPrimitives";
import { NativePhoneField, findNativePhoneCountry } from "../components/NativePhoneField";
import { haptic } from "../lib/nativeHaptics";
import { useShakeAnimation } from "../lib/nativeAnimations";
import {
  fetchNativeProfileSummary,
  readCachedNativeProfileSummary,
  type NativeProfileSummary,
} from "../lib/nativeProfileSummary";
import { createNativeProtectedActionError, getNativeProtectedActionResult, logNativeProtectedActionFailure, requestNativeStorageCleanupResult } from "../lib/nativeStorageCleanup";
import { supabaseAnonKey, supabaseUrl } from "../lib/supabase";
import { huddleModalTokens } from "../components/nativeModalPrimitives.styles";
import {
  huddleButtons,
  huddleColors,
  huddleFieldStates,
  huddleFormControls,
  huddleLayout,
  huddleRadii,
  huddleShadows,
  huddleSpacing,
  huddleType,
} from "../theme/huddleDesignTokens";

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

type PetFormData = {
  name: string;
  species: string;
  customSpecies: string;
  breed: string;
  gender: string;
  neuteredSpayed: boolean;
  dob: string;
  weight: string;
  weightUnit: "kg" | "lb";
  bio: string;
  routine: string;
  clinicName: string;
  preferredVet: string;
  phoneNo: string;
  microchipId: string;
  temperament: string[];
  vetVisitRecords: VetVisitRecord[];
  reminders: ReminderEntry[];
  medications: MedicationRecord[];
  isActive: boolean;
  isPublic: boolean;
};

const PET_FORM_SELECT = [
  "id",
  "owner_id",
  "name",
  "species",
  "breed",
  "gender",
  "neutered_spayed",
  "dob",
  "weight",
  "weight_unit",
  "bio",
  "routine",
  "clinic_name",
  "preferred_vet",
  "phone_no",
  "microchip_id",
  "temperament",
  "vet_visit_records",
  "vaccinations",
  "vaccination_dates",
  "set_reminder",
  "next_vaccination_reminder",
  "medications",
  "photo_url",
  "is_active",
  "is_public",
].join(", ");

type NativeSetPetScreenProps = {
  accessToken?: string | null;
  onNavigate: (path: string, options?: { refreshOnboarding?: boolean }) => void;
  onGoBack?: () => void;
  onboardingMode?: boolean;
  petId?: string | null;
  userId: string | null;
};

const cleanAccessToken = (accessToken?: string | null) => String(accessToken || "").trim();

const decodeJwtSubject = (accessToken?: string | null) => {
  const token = cleanAccessToken(accessToken);
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const decoded = globalThis.atob(padded);
    const parsed = JSON.parse(decoded) as { sub?: unknown };
    return typeof parsed.sub === "string" && parsed.sub.trim() ? parsed.sub.trim() : null;
  } catch {
    return null;
  }
};

const requireActivePetSession = (accessToken?: string | null, userId?: string | null) => {
  const token = cleanAccessToken(accessToken);
  if (!token) throw new Error("Please sign in again to save your pet profile.");
  const sessionUserId = decodeJwtSubject(token) || String(userId || "").trim();
  if (!sessionUserId) throw new Error("Please sign in again to save your pet profile.");
  if (userId && sessionUserId !== userId) throw new Error("Please sign in again to save your pet profile.");
  return { token, userId: sessionUserId };
};

const petRestHeaders = (accessToken: string, extra?: Record<string, string>) => ({
  Authorization: `Bearer ${accessToken}`,
  apikey: supabaseAnonKey,
  ...extra,
});

const parseRestJson = async (response: Response) => {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const restErrorMessage = (parsed: unknown, fallback: string) => {
  if (parsed && typeof parsed === "object" && "message" in parsed) {
    return String((parsed as { message?: unknown }).message || fallback);
  }
  return typeof parsed === "string" && parsed ? parsed : fallback;
};

const petRestUrl = (table: string) => new URL(`${supabaseUrl}/rest/v1/${table}`);

const fetchPetRowWithToken = async (petId: string, ownerId: string, accessToken: string) => {
  const url = petRestUrl("pets");
  url.searchParams.set("select", PET_FORM_SELECT);
  url.searchParams.set("id", `eq.${petId}`);
  url.searchParams.set("owner_id", `eq.${ownerId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    headers: petRestHeaders(accessToken, { accept: "application/json" }),
  });
  const parsed = await parseRestJson(response);
  if (!response.ok) throw new Error(restErrorMessage(parsed, response.statusText));
  return Array.isArray(parsed) ? (parsed[0] as Record<string, unknown> | undefined) ?? null : null;
};

const savePetRowWithToken = async (
  petId: string,
  ownerId: string,
  payload: Record<string, unknown>,
  isNewPet: boolean,
  accessToken: string,
) => {
  const url = petRestUrl("pets");
  if (isNewPet) {
    url.searchParams.set("on_conflict", "id");
  } else {
    url.searchParams.set("id", `eq.${petId}`);
    url.searchParams.set("owner_id", `eq.${ownerId}`);
  }
  const response = await fetch(url.toString(), {
    method: isNewPet ? "POST" : "PATCH",
    headers: petRestHeaders(accessToken, {
      "content-type": "application/json",
      prefer: isNewPet ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    }),
    body: JSON.stringify(isNewPet ? { id: petId, owner_id: ownerId, ...payload } : payload),
  });
  const parsed = await parseRestJson(response);
  if (!response.ok) throw new Error(restErrorMessage(parsed, response.statusText));
};

const deletePetRowWithToken = async (
  petId: string,
  ownerId: string,
  accessToken: string,
) => {
  const url = petRestUrl("pets");
  url.searchParams.set("id", `eq.${petId}`);
  url.searchParams.set("owner_id", `eq.${ownerId}`);
  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: petRestHeaders(accessToken, { prefer: "return=minimal" }),
  });
  const parsed = await parseRestJson(response);
  if (!response.ok) throw new Error(restErrorMessage(parsed, response.statusText));
};

const updateProfileOnboardingWithToken = async (ownerId: string, payload: Record<string, unknown>, accessToken: string) => {
  const patchUrl = petRestUrl("profiles");
  patchUrl.searchParams.set("id", `eq.${ownerId}`);
  const patchResponse = await fetch(patchUrl.toString(), {
    method: "PATCH",
    headers: petRestHeaders(accessToken, { "content-type": "application/json", prefer: "return=representation" }),
    body: JSON.stringify(payload),
  });
  const patchParsed = await parseRestJson(patchResponse);
  if (!patchResponse.ok) throw new Error(restErrorMessage(patchParsed, patchResponse.statusText));
  if (Array.isArray(patchParsed) && patchParsed.length > 0) return;

  const upsertUrl = petRestUrl("profiles");
  upsertUrl.searchParams.set("on_conflict", "id");
  const upsertResponse = await fetch(upsertUrl.toString(), {
    method: "POST",
    headers: petRestHeaders(accessToken, {
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify({ id: ownerId, ...payload }),
  });
  const upsertParsed = await parseRestJson(upsertResponse);
  if (!upsertResponse.ok) throw new Error(restErrorMessage(upsertParsed, upsertResponse.statusText));
};

const postPetProfileCompleted = async (ownerId: string, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/functions/v1/brevo-sync`, {
    method: "POST",
    headers: petRestHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify({ event: "pet_profile_completed", user_id: ownerId }),
  });
  if (!response.ok && __DEV__) {
    console.warn("[brevo-sync] pet_profile_completed failed silently", response.status);
  }
};

const extractPetObjectPathFromUrl = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const pathname = decodeURIComponent(url.pathname || "");
    const match = pathname.match(/\/storage\/v1\/object\/public\/pets\/(.+)$/);
    return match?.[1] ? match[1].replace(/^\/+/, "") : null;
  } catch {
    return null;
  }
};

const registerPetMediaAssetWithToken = async (petId: string, objectPath: string, accessToken: string) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/register_native_media_asset`, {
    method: "POST",
    headers: petRestHeaders(accessToken, { "content-type": "application/json" }),
    body: JSON.stringify({
      p_bucket: "pets",
      p_content_id: petId,
      p_content_type: "pet_photo",
      p_expires_at: null,
      p_object_path: objectPath,
    }),
  });
  const parsed = await parseRestJson(response);
  if (!response.ok) throw new Error(restErrorMessage(parsed, response.statusText));
};

type DateTarget = "dob" | "visitDate" | "reminderDate";
type SelectTarget = "breed" | "temperament" | "visitReason" | "vaccine" | "reminderReason" | "doseUnit" | "frequencyUnit";
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
  dog: [
    "Beagle",
    "Border Collie",
    "Bulldog",
    "Cavalier King Charles Spaniel",
    "Chihuahua",
    "Cocker Spaniel",
    "Corgi",
    "Dachshund",
    "French Bulldog",
    "German Shepherd",
    "Golden Retriever",
    "Husky",
    "Jack Russell Terrier",
    "Labrador Retriever",
    "Local Mixed-Breed",
    "Maltese",
    "Pit Bull Terrier",
    "Pomeranian",
    "Poodle",
    "Pug",
    "Rottweiler",
    "Shiba Inu",
    "Shih Tzu",
    "Yorkshire Terrier",
    "Others",
  ],
	  cat: [
	    "Abyssinian",
	    "American Shorthair",
	    "American Wirehair",
	    "Bengal",
	    "Birman",
	    "Bombay",
	    "British Shorthair",
	    "Burmese",
	    "Chartreux",
	    "Cornish Rex",
	    "Devon Rex",
	    "Domestic Shorthair",
	    "Egyptian Mau",
	    "Exotic Shorthair",
	    "Japanese Bobtail",
	    "Local Mixed-Breed",
	    "Maine Coon",
	    "Manx",
	    "Norwegian Forest Cat",
	    "Oriental Shorthair",
	    "Persian",
	    "Ragdoll",
	    "Russian Blue",
	    "Scottish Fold",
	    "Siamese",
	    "Sphynx",
	    "Others",
	  ],
	  bird: [
	    "Budgerigar",
	    "Caique",
	    "Canary",
	    "Cockatiel",
	    "Diamond Dove",
	    "Finch",
	    "Lovebird",
	    "Parakeet",
	    "Parrotlet",
	    "Parrots",
	    "Quaker Parrot",
	    "Rosella",
	    "Sun Conure",
	    "Yellow-naped Amazon",
	    "Others",
	  ],
	  fish: [
	    "Angelfish",
	    "Betta",
	    "Corydoras Catfish",
	    "Danio",
	    "Tetras",
	    "Discus",
	    "Guppy",
	    "Goldfish",
	    "Koi",
	    "Molly",
	    "Oscar",
	    "Pleco",
	    "Platy",
	    "Rainbowfish",
	    "Rasbora",
	    "Swordtail",
	    "Others",
	  ],
	  reptile: ["Bearded Dragon", "Gecko", "Snake", "Turtle", "Others"],
	  small_mammal: ["Chinchilla", "Ferret", "Gerbil", "Guinea Pig", "Hamster", "Hedgehog", "Hermit Crab", "Mouse", "Rabbit", "Rat", "Sugar Glider", "Others"],
	  farm_animal: ["Alpaca", "Chicken", "Donkey", "Duck", "Goat", "Llama", "Miniature Horse", "Pig", "Quail", "Sheep", "Others"],
};

const temperamentOptions = [
  "Affectionate",
  "Aggressive",
  "Anxious",
  "Calm",
  "Curious",
  "Energetic",
  "Fearful",
  "Food-motivated",
  "Friendly",
  "Independent",
  "Loyal",
  "Playful",
  "Protective",
  "Shy",
  "Trainable",
];

const vetVisitReasons: VetVisitReason[] = ["Check-up", "Vaccination", "Dental", "Spay / Neuter", "Surgery", "Emergency", "Others"];
const doseUnits: Array<NonNullable<MedicationRecord["dose_unit"]>> = ["mg", "mcg", "IU", "mL", "tablet", "drop"];
const frequencyUnits: Array<NonNullable<MedicationRecord["frequency_unit"]>> = ["hours", "days"];

const profileCountryAliases: Record<string, string> = {
  "hong kong": "HK",
  "hong kong sar": "HK",
  hk: "HK",
  "united states": "US",
  usa: "US",
  us: "US",
  "united kingdom": "GB",
  uk: "GB",
};

const findPhoneCountryByProfile = (profile: NativeProfileSummary | null | undefined) => {
  const country = typeof profile?.country === "string" ? profile.country.trim() : "";
  if (!country) return null;
  const direct = findNativePhoneCountry(country);
  if (direct) return direct;
  const normalized = country.toLowerCase();
  return findNativePhoneCountry(profileCountryAliases[normalized]) || null;
};

const vaccinesBySpecies: Record<string, string[]> = {
  dog: ["Rabies", "Core dog vaccine (DHPP/DA2PP)", "Kennel cough", "Leptospirosis", "Lyme disease", "Dog flu"],
  cat: ["Rabies", "Core cat vaccine (Cat Flu, FVRCP)", "Feline leukemia (FeLV)"],
  rabbit: ["Rabbit viral disease", "Myxomatosis"],
  ferret: ["Rabies", "Ferret distemper"],
  goat: ["Goat core vaccine (tetanus and gut disease)", "Rabies", "Other goat vaccine"],
  pig: ["Pig respiratory vaccine", "Pig fever vaccine", "Other pig vaccine"],
	  chickens_ducks: ["Marek’s disease", "Newcastle disease", "Fowl pox", "Poultry vaccine"],
};

const emptyForm: PetFormData = {
  name: "",
  species: "",
  customSpecies: "",
  breed: "",
  gender: "",
  neuteredSpayed: false,
  dob: "",
  weight: "",
  weightUnit: "kg",
  bio: "",
  routine: "",
  clinicName: "",
  preferredVet: "",
  phoneNo: "",
  microchipId: "",
  temperament: [],
  vetVisitRecords: [],
  reminders: [],
  medications: [],
  isActive: true,
  isPublic: false,
};

const parseDecimalInput = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const maxWeightByUnit = (unit: string) => (unit === "lb" ? 1000 : 100);

const parseMedicationNumericInput = (value: string, currentValue: number | null, allowDecimal: boolean) => {
  const raw = allowDecimal
    ? value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
    : value.replace(/\D/g, "");
  let digitCount = 0;
  const cleaned = raw
    .split("")
    .filter((char) => {
      if (char === "." && allowDecimal) return true;
      if (!/\d/.test(char)) return false;
      digitCount += 1;
      return digitCount <= 3;
    })
    .join("");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : currentValue;
};

const makeUuid = () => {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
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

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
const pad2 = (value: number) => String(value).padStart(2, "0");

const datePartsFromIso = (value: string) => {
  const fallback = new Date();
  if (!isIsoDate(value)) {
    return {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
    };
  }
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
};

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const isoFromParts = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;

const todayAtMidnight = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const tomorrowIsoDate = () => {
  const date = todayAtMidnight();
  date.setDate(date.getDate() + 1);
  return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

const sortVisits = (entries: VetVisitRecord[]) =>
  [...entries].sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());

const sortReminders = (entries: ReminderEntry[]) =>
  [...entries].sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime());

const parseLegacyVaccinations = (vaccinations: unknown, vaccinationDates: unknown): VetVisitRecord[] => {
  const out: VetVisitRecord[] = [];
  const dates = Array.isArray(vaccinationDates)
    ? vaccinationDates.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

  if (!Array.isArray(vaccinations)) {
    return dates
      .map((visitDate) => ({ reason: "Vaccination" as const, visitDate: formatDateOnly(visitDate) }))
      .filter((entry) => entry.visitDate);
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

const parseReminderEntries = (setReminder: unknown, legacyDate: unknown): ReminderEntry[] => {
  const normalize = (raw: Record<string, unknown>): ReminderEntry | null => {
    const reason = typeof raw.reason === "string" ? raw.reason : "Vaccination";
    const reminderDate = formatDateOnly(raw.reminderDate);
    if (!reminderDate) return null;
    return {
      reason: vetVisitReasons.includes(reason as VetVisitReason) ? (reason as VetVisitReason) : "Vaccination",
      customReason: typeof raw.customReason === "string" ? raw.customReason : null,
      reminderDate,
    };
  };

  if (Array.isArray(setReminder)) {
    return setReminder
      .map((entry) => (entry && typeof entry === "object" ? normalize(entry as Record<string, unknown>) : null))
      .filter((entry): entry is ReminderEntry => Boolean(entry));
  }

  if (setReminder && typeof setReminder === "object") {
    const single = normalize(setReminder as Record<string, unknown>);
    return single ? [single] : [];
  }

  const fallbackDate = formatDateOnly(legacyDate);
  return fallbackDate ? [{ reason: "Vaccination", reminderDate: fallbackDate, customReason: null }] : [];
};

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
    const frequencyMatch = frequency.match(/(?:every\s*)?([0-9]+)\s*(hours|days)/i);
    if (frequencyMatch) {
      frequencyValue = Number(frequencyMatch[1]);
      frequencyUnit = frequencyMatch[2].toLowerCase() as MedicationRecord["frequency_unit"];
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

const toPetPayload = (form: PetFormData, photoUrl: string | null) => ({
	  name: form.name,
	  species: form.species === "others" ? form.customSpecies : form.species,
	  breed: form.breed || null,
  gender: form.gender || null,
  neutered_spayed: form.neuteredSpayed,
  dob: form.dob || null,
  weight: parseDecimalInput(form.weight),
  weight_unit: form.weightUnit,
	  bio: form.bio || null,
	  routine: form.routine || null,
	  clinic_name: form.clinicName || null,
	  preferred_vet: form.preferredVet || null,
	  phone_no: form.phoneNo || null,
	  vet_contact: [form.clinicName, form.preferredVet, form.phoneNo].filter(Boolean).join(" | ") || null,
	  microchip_id: form.microchipId || null,
  temperament: form.temperament.length > 0 ? form.temperament : null,
  vet_visit_records: form.vetVisitRecords.length > 0 ? form.vetVisitRecords : [],
  set_reminder: form.reminders,
  medications: form.medications.length > 0 ? form.medications : [],
  is_active: form.isActive,
  is_public: form.isPublic,
  photo_url: photoUrl,
  updated_at: new Date().toISOString(),
});

const hasPetProfileData = (pet: {
  name: string;
  species: string;
  customSpecies: string;
  breed: string;
  gender: string;
  dob: string;
  weight: string | number | null | undefined;
  bio: string;
  routine: string;
  clinicName: string;
  preferredVet: string;
  phoneNo: string;
  microchipId: string;
  temperament: unknown[];
  vetVisitRecords: unknown[];
  reminders: unknown[];
  medications: unknown[];
  photoUrl?: string | null;
}) =>
  Boolean(
    pet.name.trim() ||
      pet.species.trim() ||
      pet.customSpecies.trim() ||
      pet.breed.trim() ||
      pet.gender.trim() ||
      pet.dob ||
      String(pet.weight ?? "").trim() ||
      pet.bio.trim() ||
      pet.routine.trim() ||
      pet.clinicName.trim() ||
      pet.preferredVet.trim() ||
      pet.phoneNo.trim() ||
      pet.microchipId.trim() ||
      pet.temperament.length ||
      pet.vetVisitRecords.length ||
      pet.reminders.length ||
      pet.medications.length ||
      pet.photoUrl
  );

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function ErrorText({ children }: { children: string }) {
  return <Text style={styles.errorText}>{children}</Text>;
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function GenderChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.genderChip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function InlineToggle({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked }} onPress={onPress} style={[styles.webToggleTrack, checked ? styles.webToggleTrackChecked : null]}>
      <View style={[styles.webToggleThumb, checked ? styles.webToggleThumbChecked : null]} />
    </Pressable>
  );
}

function InlineSelectMenu({
  options,
  onSelect,
  selectedValues,
  visible,
}: {
  options: string[];
  onSelect: (value: string) => void;
  selectedValues?: string[];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <View style={styles.inlinePopover}>
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.inlinePopoverScroll}>
        <View style={styles.inlineOptions}>
          {options.map((option) => (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [styles.optionRow, selectedValues?.includes(option) ? styles.optionRowSelected : null, pressed ? styles.pressed : null]}
            >
              <Text style={[styles.optionText, selectedValues?.includes(option) ? styles.optionTextSelected : null]}>{option}</Text>
              {selectedValues?.includes(option) ? <Feather color={huddleColors.blue} name="check" size={14} /> : <View style={styles.optionCheckSpacer} />}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DateField({
  error,
  focused,
  onBlur,
  onChangeText,
  onToggle,
  value,
}: {
  error?: boolean;
  focused?: boolean;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onToggle: () => void;
  value: string;
}) {
  return (
    <View style={[styles.dateField, error ? styles.inputError : null, focused ? styles.inputFocused : null]}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onToggle}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={huddleColors.mutedText}
        showSoftInputOnFocus={false}
        style={styles.dateFieldInput}
        value={value}
      />
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.dateIconButton}>
        <Feather color={huddleColors.mutedText} name="calendar" size={17} />
      </Pressable>
    </View>
  );
}

function InlineDatePicker({
  futureYearLimit = 0,
  minDate,
  onChange,
  value,
  visible,
}: {
  futureYearLimit?: number;
  minDate?: string;
  onChange: (value: string) => void;
  value: string;
  visible: boolean;
}) {
  if (!visible) return null;
  const minParts = minDate && isIsoDate(minDate) ? datePartsFromIso(minDate) : null;
  const rawParts = datePartsFromIso(value);
  const rawIso = isoFromParts(rawParts.year, rawParts.month, rawParts.day);
  const parts = minDate && rawIso < minDate ? datePartsFromIso(minDate) : rawParts;
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + Math.max(0, futureYearLimit);
  const startYear = minParts ? minParts.year : 1900;
  const years = Array.from({ length: Math.max(0, maxYear - startYear + 1) }, (_, index) => maxYear - index);
  const months = Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => (
    !minParts || parts.year > minParts.year || month >= minParts.month
  ));
  const days = Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, index) => index + 1).filter((day) => (
    !minParts || parts.year > minParts.year || parts.month > minParts.month || day >= minParts.day
  ));
  const updatePart = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    const nextIso = isoFromParts(next.year, next.month, next.day);
    onChange(minDate && nextIso < minDate ? minDate : nextIso);
  };

  return (
    <View style={styles.inlinePopover}>
      <View style={styles.inlineDateColumns}>
        <ScrollView nestedScrollEnabled style={styles.inlineDateColumn}>
          {years.map((year) => (
            <Pressable key={year} onPress={() => updatePart({ year })} style={[styles.inlineDateOption, year === parts.year ? styles.inlineDateOptionActive : null]}>
              <Text style={[styles.inlineDateOptionText, year === parts.year ? styles.inlineDateOptionTextActive : null]}>{year}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView nestedScrollEnabled style={styles.inlineDateColumn}>
          {months.map((month) => (
            <Pressable key={month} onPress={() => updatePart({ month })} style={[styles.inlineDateOption, month === parts.month ? styles.inlineDateOptionActive : null]}>
              <Text style={[styles.inlineDateOptionText, month === parts.month ? styles.inlineDateOptionTextActive : null]}>{pad2(month)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <ScrollView nestedScrollEnabled style={styles.inlineDateColumn}>
          {days.map((day) => (
            <Pressable key={day} onPress={() => updatePart({ day })} style={[styles.inlineDateOption, day === parts.day ? styles.inlineDateOptionActive : null]}>
              <Text style={[styles.inlineDateOptionText, day === parts.day ? styles.inlineDateOptionTextActive : null]}>{pad2(day)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export function NativeSetPetScreen({
  accessToken,
  onNavigate,
  onGoBack,
  onboardingMode = true,
  petId = null,
  userId,
}: NativeSetPetScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(Boolean(petId));
  const [form, setForm] = useState<PetFormData>(emptyForm);
  const [profileMode, setProfileMode] = useState<"edit" | "view">("edit");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [savedPetId, setSavedPetId] = useState<string | null>(petId);
  const [isNewPet, setIsNewPet] = useState(onboardingMode || !petId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [removePetConfirmOpen, setRemovePetConfirmOpen] = useState(false);
  const [saveShakeAnim, triggerSaveShake] = useShakeAnimation();
  const [errors, setErrors] = useState<Partial<Record<keyof PetFormData | "visit" | "reminder" | "medication", string>>>({});
  const [selectTarget, setSelectTarget] = useState<SelectTarget | null>(null);
  const [dateTarget, setDateTarget] = useState<DateTarget | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const editScrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const scrollViewportHeightRef = useRef(0);
  const fieldRefs = useRef<Record<string, View | null>>({});
  const preferredVetInputRef = useRef<TextInput>(null);
  const [defaultPhoneCountryCode, setDefaultPhoneCountryCode] = useState<string | null>(null);
  const [visitDraft, setVisitDraft] = useState<VetVisitRecord>({ reason: "", customReason: "", visitDate: "", vaccine: "" });
  const [visitEditIndex, setVisitEditIndex] = useState<number | null>(null);
  const [showVisitEditor, setShowVisitEditor] = useState(false);
  const [reminderDraft, setReminderDraft] = useState<ReminderEntry>({ reason: "", customReason: "", reminderDate: "" });
  const [reminderEditIndex, setReminderEditIndex] = useState<number | null>(null);
  const [showReminderEditor, setShowReminderEditor] = useState(false);
  const [medicationDraft, setMedicationDraft] = useState<MedicationRecord>({
    name: "",
    dose_amount: null,
    dose_unit: null,
    frequency_value: null,
    frequency_unit: null,
  });
  const [medicationEditIndex, setMedicationEditIndex] = useState<number | null>(null);
  const [showMedicationEditor, setShowMedicationEditor] = useState(false);

  const speciesForVaccines = useMemo(() => normalizeSpeciesKey(form.species === "others" ? form.customSpecies : form.species), [form.customSpecies, form.species]);
  const vaccineOptions = vaccinesBySpecies[speciesForVaccines] ?? null;
  const breedOptions = form.species !== "others" ? speciesBreeds[form.species] ?? ["Others"] : [];

  const setFieldRef = useCallback(
    (fieldName: string) => (node: View | null) => {
      fieldRefs.current[fieldName] = node;
    },
    [],
  );

  const handleEditScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const scrollFieldIntoView = useCallback(
    (fieldName: string) => {
      const node = fieldRefs.current[fieldName];
      const scrollView = editScrollRef.current;
      if (!node || !scrollView || profileMode !== "edit") return;

      const target = findNodeHandle(node);
      const scrollTarget = findNodeHandle(scrollView);
      if (!target || !scrollTarget) return;

      window.setTimeout(() => {
        UIManager.measureInWindow(target, (_x, y, _width, height) => {
          UIManager.measureInWindow(scrollTarget, (_scrollX, scrollY, _scrollWidth, scrollHeight) => {
            const viewportHeight = scrollViewportHeightRef.current || scrollHeight || 0;
            if (!viewportHeight) return;

            const relativeTop = y - scrollY;
            const relativeBottom = relativeTop + height;
            const topLimit = huddleSpacing.x3;
            const bottomLimit = viewportHeight - huddleSpacing.x3;
            const overflowBottom = relativeBottom - bottomLimit;
            const overflowTop = relativeTop - topLimit;
            const nextY = overflowBottom > 0
              ? scrollYRef.current + overflowBottom
              : overflowTop < 0
              ? scrollYRef.current + overflowTop
              : scrollYRef.current;

            if (Math.abs(nextY - scrollYRef.current) > 1) {
              scrollView.scrollTo({ y: Math.max(0, nextY), animated: true });
            }
          });
        });
      }, 90);
    },
    [profileMode],
  );

  const focusField = useCallback(
    (fieldName: string) => {
      setSelectTarget(null);
      setDateTarget(null);
      setFocusedField(fieldName);
      scrollFieldIntoView(fieldName);
    },
    [scrollFieldIntoView],
  );

  const toggleSelectField = useCallback(
    (fieldName: SelectTarget) => {
      Keyboard.dismiss();
      setDateTarget(null);
      setFocusedField(fieldName);
      scrollFieldIntoView(fieldName === "doseUnit" ? "doseAmount" : fieldName === "frequencyUnit" ? "frequencyValue" : fieldName);
      setSelectTarget((current) => (current === fieldName ? null : fieldName));
    },
    [scrollFieldIntoView],
  );

  const toggleDateField = useCallback(
    (fieldName: DateTarget) => {
      Keyboard.dismiss();
      setSelectTarget(null);
      setFocusedField(fieldName);
      scrollFieldIntoView(fieldName);
      if (fieldName === "reminderDate") {
        const minReminderDate = tomorrowIsoDate();
        setReminderDraft((current) => (
          current.reminderDate && isIsoDate(current.reminderDate) && current.reminderDate >= minReminderDate
            ? current
            : { ...current, reminderDate: minReminderDate }
        ));
      }
      setDateTarget((current) => (current === fieldName ? null : fieldName));
    },
    [scrollFieldIntoView],
  );
  const microchipDisplay = `${form.microchipId}${"-".repeat(Math.max(0, 15 - form.microchipId.length))}`;
  const draftPetDetails = useMemo<NativePetDetailsData>(() => {
    const speciesLabel = form.species === "others"
      ? form.customSpecies.trim()
      : speciesOptions.find((option) => option.id === form.species)?.label.replace(/s$/, "") || form.species;
    const vetContact = [form.clinicName.trim(), form.preferredVet.trim(), form.phoneNo.trim()].filter(Boolean).join(" | ");

    return {
      id: savedPetId || petId || "draft",
      owner_id: userId,
      name: form.name.trim() || "Pet name",
      species: speciesLabel || "Species",
      breed: form.breed && form.breed !== "Other" ? form.breed : null,
      gender: form.gender || null,
      neutered_spayed: form.neuteredSpayed,
      dob: isIsoDate(form.dob) ? form.dob : null,
      weight: form.weight.trim() || null,
      weight_unit: form.weightUnit,
      bio: form.bio.trim() || null,
      routine: form.routine.trim() || null,
      vet_contact: vetContact || null,
      microchip_id: form.microchipId.trim() || null,
      temperament: form.temperament.length > 0 ? form.temperament : null,
      vet_visit_records: form.vetVisitRecords.length > 0 ? sortVisits(form.vetVisitRecords) : null,
      set_reminder: sortReminders(form.reminders)[0] ?? null,
      medications: form.medications.length > 0 ? form.medications : null,
      photo_url: photoUri,
      is_active: form.isActive,
    };
  }, [form, petId, photoUri, savedPetId, userId]);

  const updateForm = useCallback((patch: Partial<PetFormData>) => {
    setForm((current) => ({ ...current, ...patch }));
    setMessage(null);
  }, []);

  useEffect(() => {
    if (!userId || defaultPhoneCountryCode) return;
    let active = true;
    const applyProfileCountry = (profile: NativeProfileSummary | null | undefined) => {
      if (!active) return;
      const country = findPhoneCountryByProfile(profile);
      if (!country) return;
      setDefaultPhoneCountryCode(country.code);
    };
    void readCachedNativeProfileSummary(userId).then((cached) => applyProfileCountry(cached?.profile), () => {});
    void fetchNativeProfileSummary(userId, { force: false, accessToken }).then((snapshot) => applyProfileCountry(snapshot.profile), () => {});
    return () => {
      active = false;
    };
  }, [accessToken, defaultPhoneCountryCode, userId]);

  const fetchPet = useCallback(async () => {
    if (!petId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const session = requireActivePetSession(accessToken, userId);
      const data = await fetchPetRowWithToken(petId, session.userId, session.token);
      if (!data) {
        setMessage("Failed to load pet");
        setLoading(false);
        return;
      }

      const row = data as unknown as Record<string, unknown>;
      if (row.owner_id && row.owner_id !== session.userId) {
        onNavigate(`/pet-details?id=${petId}`);
        return;
      }

      const species = typeof row.species === "string" ? row.species : "";
      const isKnownSpecies = speciesOptions.some((option) => option.id === species);
      const parsedVisits = sortVisits(
        Array.isArray(row.vet_visit_records)
          ? (row.vet_visit_records as VetVisitRecord[])
          : parseLegacyVaccinations(row.vaccinations, row.vaccination_dates),
      );
      const parsedReminders = sortReminders(parseReminderEntries(row.set_reminder, row.next_vaccination_reminder));
      const parsedMedications = Array.isArray(row.medications)
        ? (row.medications.map(parseMedication).filter(Boolean) as MedicationRecord[])
        : [];

      const nextForm: PetFormData = {
        name: typeof row.name === "string" ? row.name : "",
        species: isKnownSpecies ? species : "others",
        customSpecies: isKnownSpecies ? "" : species || "",
        breed: typeof row.breed === "string" ? row.breed : "",
        gender: typeof row.gender === "string" ? row.gender : "",
        neuteredSpayed: row.neutered_spayed === true,
        dob: typeof row.dob === "string" ? row.dob : "",
        weight: row.weight != null ? String(row.weight) : "",
        weightUnit: row.weight_unit === "lb" ? "lb" : "kg",
        bio: typeof row.bio === "string" ? row.bio : "",
        routine: typeof row.routine === "string" ? row.routine : "",
        clinicName: typeof row.clinic_name === "string" ? row.clinic_name : "",
        preferredVet: typeof row.preferred_vet === "string" ? row.preferred_vet : "",
        phoneNo: typeof row.phone_no === "string" ? row.phone_no : "",
        microchipId: typeof row.microchip_id === "string" ? row.microchip_id : "",
        temperament: Array.isArray(row.temperament) ? row.temperament.filter((entry): entry is string => typeof entry === "string") : [],
        vetVisitRecords: parsedVisits,
        reminders: parsedReminders,
        medications: parsedMedications,
        isActive: row.is_active !== false,
        isPublic:
          typeof row.is_public === "boolean"
            ? row.is_public
            : hasPetProfileData({
                name: typeof row.name === "string" ? row.name : "",
                species: isKnownSpecies ? species : "others",
                customSpecies: isKnownSpecies ? "" : species || "",
                breed: typeof row.breed === "string" ? row.breed : "",
                gender: typeof row.gender === "string" ? row.gender : "",
                dob: typeof row.dob === "string" ? row.dob : "",
                weight: typeof row.weight === "number" || typeof row.weight === "string" ? row.weight : "",
                bio: typeof row.bio === "string" ? row.bio : "",
                routine: typeof row.routine === "string" ? row.routine : "",
                clinicName: typeof row.clinic_name === "string" ? row.clinic_name : "",
                preferredVet: typeof row.preferred_vet === "string" ? row.preferred_vet : "",
                phoneNo: typeof row.phone_no === "string" ? row.phone_no : "",
                microchipId: typeof row.microchip_id === "string" ? row.microchip_id : "",
                temperament: Array.isArray(row.temperament) ? row.temperament : [],
                vetVisitRecords: parsedVisits,
                reminders: parsedReminders,
                medications: parsedMedications,
                photoUrl: typeof row.photo_url === "string" ? row.photo_url : null,
              }),
      };

      setForm(nextForm);
      setPhotoUri(typeof row.photo_url === "string" ? row.photo_url : null);
      setSavedPetId(petId);
      setIsNewPet(false);
    } catch {
      setMessage("Failed to load pet");
    } finally {
      setLoading(false);
    }
  }, [accessToken, onNavigate, petId, userId]);

  useEffect(() => {
    void fetchPet();
  }, [fetchPet]);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required to add a pet photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
  };

  const validateBaseForm = (draftOnly: boolean) => {
    const nextErrors: Partial<Record<keyof PetFormData | "visit" | "reminder" | "medication", string>> = {};
    if (!draftOnly) {
      if (!form.name.trim()) nextErrors.name = "Pet name is required";
      if (!form.species && !form.customSpecies.trim()) nextErrors.species = "Species is required";
      if (form.species === "others" && !form.customSpecies.trim()) nextErrors.customSpecies = "Species is required";
    }
    if (form.dob) {
      if (!isIsoDate(form.dob)) {
        nextErrors.dob = "Use YYYY-MM-DD";
      } else if (new Date(`${form.dob}T00:00:00`) > todayAtMidnight()) {
        nextErrors.dob = "Pet DOB cannot be in the future";
      }
    }
    const weightNumber = parseDecimalInput(form.weight);
    const maxWeight = maxWeightByUnit(form.weightUnit);
	    if (form.weight && (weightNumber == null || weightNumber < 1 || weightNumber > maxWeight)) {
	      nextErrors.weight = "Oops...This input seems invalid.";
	    }
    const invalidReminder = form.reminders.find((entry) => new Date(`${entry.reminderDate}T00:00:00`) <= todayAtMidnight());
    if (invalidReminder) nextErrors.reminder = "Reminder date must be in the future";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const uploadPhoto = async (petId: string, activeUserId: string, activeAccessToken: string): Promise<{ objectPath: string | null; url: string | null }> => {
    if (!photoUri || photoUri.startsWith("http")) return { objectPath: null, url: photoUri };
    const extension = photoUri.split(".").pop()?.split("?")[0] || "jpg";
    const cleanExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const fileName = `${activeUserId}/${petId}.${cleanExtension}`;
    const response = await fetch(photoUri);
    const blob = await response.blob();
    const uploadUrl = `${supabaseUrl}/storage/v1/object/pets/${fileName.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
    try {
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: petRestHeaders(activeAccessToken, {
          "cache-control": "3600",
          "content-type": cleanExtension === "png" ? "image/png" : "image/jpeg",
          "x-upsert": "true",
        }),
        body: blob,
      });
      const uploadParsed = await parseRestJson(uploadResponse);
      if (!uploadResponse.ok) {
        throw createNativeProtectedActionError({
          ok: false,
          stage: "upload",
          originalError: new Error(restErrorMessage(uploadParsed, `Pet photo upload failed (${uploadResponse.status}).`)),
          cleanupAttempted: false,
          cleanupResult: "not_needed",
        });
      }
    } catch (error) {
      if (getNativeProtectedActionResult(error)) throw error;
      throw createNativeProtectedActionError({
        ok: false,
        stage: "upload",
        originalError: error,
        cleanupAttempted: false,
        cleanupResult: "not_needed",
      });
    }
    try {
      await registerPetMediaAssetWithToken(petId, fileName, activeAccessToken);
    } catch (registrationError) {
      const cleanupResult = await requestNativeStorageCleanupResult("pets", fileName, "register_pet_photo_media_failed", activeAccessToken);
      throw createNativeProtectedActionError({
        ok: false,
        stage: "register",
        originalError: registrationError,
        cleanupAttempted: true,
        cleanupResult,
      });
    }
    if (__DEV__) {
      console.log("STORAGE_URL_GET_PUBLIC", { bucket: "pets", path: fileName });
    }
    return {
      objectPath: fileName,
      url: `${supabaseUrl}/storage/v1/object/public/pets/${fileName.split("/").map((part) => encodeURIComponent(part)).join("/")}`,
    };
  };

  const savePet = async (draftOnly: boolean) => {
    let session: { token: string; userId: string };
    try {
      session = requireActivePetSession(accessToken, userId);
    } catch {
      setMessage("Please sign in again to save your pet profile.");
      return;
    }
    if (!validateBaseForm(draftOnly)) {
      haptic.error();
      triggerSaveShake();
      return;
    }
    setSaving(true);
    setMessage(null);
    let uploadedPetPhotoPath: string | null = null;
    try {
      const targetPetId = savedPetId || petId || makeUuid();
      const photoUpload = await uploadPhoto(targetPetId, session.userId, session.token);
      uploadedPetPhotoPath = photoUpload.objectPath;
      const photoUrl = photoUpload.url;
      const payload = toPetPayload(form, photoUrl);
      await savePetRowWithToken(targetPetId, session.userId, {
        ...payload,
        ...(isNewPet ? { name: payload.name || "", species: payload.species || "", created_at: new Date().toISOString() } : {}),
      }, isNewPet, session.token);
      setSavedPetId(targetPetId);
      setIsNewPet(false);
      if (photoUrl) setPhotoUri(photoUrl);
      if (draftOnly) {
        haptic.success();
        setMessage("Draft saved");
        return;
      }

      if (!onboardingMode) {
        haptic.success();
        onGoBack?.();
        if (!onGoBack) onNavigate("/");
        return;
      }

      await updateProfileOnboardingWithToken(session.userId, {
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, session.token);
      void postPetProfileCompleted(session.userId, session.token).catch((err) => console.warn("[brevo-sync] pet_profile_completed failed silently", err));
      haptic.success();
      Alert.alert(
        "Welcome to Huddle!",
        "Pet care tracking, nearby connections, and all pet community happenings – right in your palm now!",
        [{ text: "Continue", onPress: () => onNavigate("/", { refreshOnboarding: true }) }],
      );
    } catch (error) {
      let failure = getNativeProtectedActionResult(error);
      if (!failure) {
        const cleanupResult = uploadedPetPhotoPath
          ? await requestNativeStorageCleanupResult("pets", uploadedPetPhotoPath, "pet_photo_save_failed", session.token)
          : "not_needed";
        failure = {
          ok: false,
          stage: "domain_save",
          originalError: error,
          cleanupAttempted: Boolean(uploadedPetPhotoPath),
          cleanupResult,
        };
      }
      logNativeProtectedActionFailure("[native.pet] save_failed", error instanceof Error && getNativeProtectedActionResult(error) ? error : createNativeProtectedActionError(failure));
      const raw = failure.originalError instanceof Error ? failure.originalError.message : String(failure.originalError || "");
      const messageText = raw.includes("pets_weight_lt_100") ? "Oops...This input seems invalid." : raw || "Failed to save pet profile. Please retry.";
      haptic.error();
      setMessage(messageText);
    } finally {
      setSaving(false);
    }
  };

  const confirmRemovePet = () => {
    if (onboardingMode || !savedPetId || isNewPet) return;
    setRemovePetConfirmOpen(true);
  };

  const removePet = async () => {
    if (onboardingMode || !savedPetId || isNewPet) return;
    let session: { token: string; userId: string };
    try {
      session = requireActivePetSession(accessToken, userId);
    } catch {
      setRemovePetConfirmOpen(false);
      setMessage("Please sign in again to update your pet profile.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const petPhotoObjectPath = extractPetObjectPathFromUrl(photoUri);
      await deletePetRowWithToken(savedPetId, session.userId, session.token);
      if (petPhotoObjectPath) {
        await requestNativeStorageCleanupResult("pets", petPhotoObjectPath, "delete_pet_photo", session.token);
      }
      haptic.success();
      setRemovePetConfirmOpen(false);
      onGoBack?.();
      if (!onGoBack) onNavigate("/");
    } catch (error) {
      haptic.error();
      setMessage(error instanceof Error ? error.message : "Failed to remove pet.");
    } finally {
      setSaving(false);
    }
  };

  const silentSave = async () => {
    if (!savedPetId || isNewPet) return;
    try {
      const session = requireActivePetSession(accessToken, userId);
      const { photo_url: _photoUrl, ...payload } = toPetPayload(form, null);
      await savePetRowWithToken(savedPetId, session.userId, payload, false, session.token);
    } catch (err) {
      console.warn("[NativeSetPetScreen.silentSave]", err);
    }
  };

  const saveVisit = () => {
    const nextErrors = { ...errors };
    delete nextErrors.visit;
    if (!visitDraft.reason) nextErrors.visit = "Reason is required";
    if (!visitDraft.visitDate || !isIsoDate(visitDraft.visitDate)) nextErrors.visit = "Visit date is required";
    const visitDate = visitDraft.visitDate ? new Date(`${visitDraft.visitDate}T00:00:00`) : null;
    if (visitDate && form.dob && isIsoDate(form.dob) && visitDate < new Date(`${form.dob}T00:00:00`)) nextErrors.visit = "Visit date cannot be earlier than pet DOB";
    if (visitDate && visitDate > todayAtMidnight()) nextErrors.visit = "Visit date cannot be in the future";
    if (visitDraft.reason === "Others" && !visitDraft.customReason?.trim()) nextErrors.visit = "Custom reason is required";
    if (visitDraft.reason === "Vaccination" && !visitDraft.vaccine?.trim()) nextErrors.visit = "Vaccine is required";
    setErrors(nextErrors);
    if (nextErrors.visit) return;
	    updateForm({
	      vetVisitRecords: sortVisits(
        visitEditIndex == null
          ? [...form.vetVisitRecords, visitDraft]
          : form.vetVisitRecords.map((visit, index) => (index === visitEditIndex ? visitDraft : visit)),
      ),
    });
	    setVisitDraft({ reason: "", customReason: "", visitDate: "", vaccine: "" });
	    setVisitEditIndex(null);
	    setShowVisitEditor(false);
	  };

  const saveReminder = () => {
    const nextErrors = { ...errors };
    delete nextErrors.reminder;
    if (!reminderDraft.reason) nextErrors.reminder = "Reason is required";
    if (!reminderDraft.reminderDate || !isIsoDate(reminderDraft.reminderDate)) nextErrors.reminder = "Reminder date is required";
    if (reminderDraft.reminderDate && new Date(`${reminderDraft.reminderDate}T00:00:00`) <= todayAtMidnight()) nextErrors.reminder = "Reminder date must be in the future";
    if (reminderDraft.reason === "Others" && !reminderDraft.customReason?.trim()) nextErrors.reminder = "Custom reason is required";
    setErrors(nextErrors);
    if (nextErrors.reminder) return;
    updateForm({
      reminders: sortReminders(
        reminderEditIndex == null
          ? [...form.reminders, reminderDraft]
          : form.reminders.map((reminder, index) => (index === reminderEditIndex ? reminderDraft : reminder)),
      ),
    });
	    setReminderDraft({ reason: "", customReason: "", reminderDate: "" });
	    setReminderEditIndex(null);
	    setShowReminderEditor(false);
	  };

  const saveMedication = () => {
    const nextErrors = { ...errors };
    delete nextErrors.medication;
    if (!medicationDraft.name.trim()) nextErrors.medication = "Medication name is required";
    if (typeof medicationDraft.dose_amount === "number" && medicationDraft.dose_amount < 0) nextErrors.medication = "Dosage cannot be negative";
    if (medicationDraft.frequency_unit === "hours" && typeof medicationDraft.frequency_value === "number" && medicationDraft.frequency_value >= 25) {
      nextErrors.medication = "Let's keep this within 24 hours.";
    }
    setErrors(nextErrors);
    if (nextErrors.medication) return;
    updateForm({
      medications:
        medicationEditIndex == null
          ? [...form.medications, medicationDraft]
          : form.medications.map((medication, index) => (index === medicationEditIndex ? medicationDraft : medication)),
    });
	    setMedicationDraft({ name: "", dose_amount: null, dose_unit: null, frequency_value: null, frequency_unit: null });
	    setMedicationEditIndex(null);
	    setShowMedicationEditor(false);
	  };

	  const handleSelect = (value: string) => {
    if (selectTarget === "breed") updateForm({ breed: value });
    if (selectTarget === "temperament") {
      updateForm({
        temperament: form.temperament.includes(value)
          ? form.temperament.filter((entry) => entry !== value)
          : [...form.temperament, value],
      });
      return;
    }
    if (selectTarget === "visitReason") setVisitDraft((current) => ({ ...current, reason: value as VetVisitReason, customReason: value === "Others" ? current.customReason : "", vaccine: value === "Vaccination" ? current.vaccine : "" }));
    if (selectTarget === "vaccine") setVisitDraft((current) => ({ ...current, vaccine: value }));
    if (selectTarget === "reminderReason") setReminderDraft((current) => ({ ...current, reason: value as VetVisitReason, customReason: value === "Others" ? current.customReason : "" }));
    if (selectTarget === "doseUnit") setMedicationDraft((current) => ({ ...current, dose_unit: value as MedicationRecord["dose_unit"] }));
	    if (selectTarget === "frequencyUnit") setMedicationDraft((current) => ({ ...current, frequency_unit: value as MedicationRecord["frequency_unit"] }));
    setSelectTarget((current) => (current === "temperament" ? current : null));
	  };

  const activeDateValue = dateTarget === "dob" ? form.dob : dateTarget === "visitDate" ? visitDraft.visitDate : dateTarget === "reminderDate" ? reminderDraft.reminderDate : "";
  const handleDateSelect = (value: string) => {
    if (dateTarget === "dob") updateForm({ dob: value });
    if (dateTarget === "visitDate") setVisitDraft((current) => ({ ...current, visitDate: value }));
    if (dateTarget === "reminderDate") setReminderDraft((current) => ({ ...current, reminderDate: value }));
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={huddleColors.blue} size="small" />
          <Text style={styles.stateText}>Loading pet details...</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={[styles.header, { marginTop: 0, paddingTop: huddleLayout.headerHeight + huddleSpacing.x3 }]}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => {
              if (onboardingMode) {
                onNavigate("/set-profile");
                return;
              }
                if (onGoBack) {
                  onGoBack();
                  return;
                }
                onNavigate("/");
            }}
            style={styles.backButton}
          >
            <Feather color={huddleColors.iconMuted} name="chevron-left" size={26} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tell us about your pet</Text>
            <Text style={styles.subtitle}>Helps improve their health tracking</Text>
          </View>
          <Pressable
            accessibilityLabel="Save"
            disabled={profileMode !== "edit" || saving}
            onPress={() => void savePet(onboardingMode)}
            style={({ pressed }) => [
              styles.headerSaveButton,
              pressed && profileMode === "edit" && !saving ? styles.pressed : null,
              (saving || profileMode !== "edit") ? styles.disabled : null,
            ]}
          >
            {saving ? <ActivityIndicator color={huddleColors.text} size="small" /> : <Feather color={huddleColors.text} name="save" size={20} />}
          </Pressable>
        </View>

        <View style={styles.tabWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setProfileMode("edit")}
            style={[styles.tabButton, profileMode === "edit" ? styles.tabButtonActive : null]}
          >
            <Text style={[styles.tabText, profileMode === "edit" ? styles.tabTextActive : null]}>Edit</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void silentSave();
              setProfileMode("view");
            }}
            style={[styles.tabButton, profileMode === "view" ? styles.tabButtonActive : null]}
          >
            <Text style={[styles.tabText, profileMode === "view" ? styles.tabTextActive : null]}>View</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={editScrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + (onboardingMode && profileMode === "edit" ? 132 : 24) },
          ]}
          keyboardShouldPersistTaps="handled"
          onLayout={(event) => {
            scrollViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          onScroll={handleEditScroll}
          scrollEventThrottle={16}
          style={styles.contentScroller}
        >
          {profileMode === "view" ? (
            <NativePetDetailsContent pet={draftPetDetails} />
          ) : (
            <>
          <Pressable accessibilityRole="button" onPress={pickPhoto} style={styles.photoWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Feather color={huddleColors.mutedText} name="camera" size={34} />
              </View>
            )}
            <View style={styles.photoBadge}>
              <Feather color={huddleColors.onPrimary} name="camera" size={16} />
            </View>
          </Pressable>

          <View ref={setFieldRef("name")} style={styles.section}>
            <FieldLabel>Pet Name</FieldLabel>
            <TextInput
              onChangeText={(name) => updateForm({ name })}
              onBlur={() => {
                setFocusedField(null);
                setErrors((current) => ({ ...current, name: form.name.trim() ? "" : "Pet name is required" }));
              }}
              onFocus={() => focusField("name")}
              placeholder="Pet's name"
              placeholderTextColor={huddleColors.mutedText}
              returnKeyType="done"
              style={[styles.input, focusedField === "name" ? styles.inputFocused : null, errors.name ? styles.inputError : null]}
              value={form.name}
            />
            {errors.name ? <ErrorText>{errors.name}</ErrorText> : null}
          </View>

          <View style={styles.section}>
            <FieldLabel>Species</FieldLabel>
            <View style={styles.chipGrid}>
              {speciesOptions.map((species) => (
                <Chip
                  key={species.id}
                  label={species.label}
                  selected={form.species === species.id}
                  onPress={() => updateForm({ species: species.id, breed: species.id === "others" ? "" : form.breed })}
                />
              ))}
            </View>
            {errors.species ? <ErrorText>{errors.species}</ErrorText> : null}
            {form.species === "others" ? (
              <View ref={setFieldRef("customSpecies")} style={styles.fieldStack}>
                <TextInput
                  onChangeText={(customSpecies) => updateForm({ customSpecies })}
                  onBlur={() => {
                    setFocusedField(null);
                    setErrors((current) => ({ ...current, customSpecies: form.customSpecies.trim() ? "" : "Species is required" }));
                  }}
                  onFocus={() => focusField("customSpecies")}
                  placeholder="Enter species..."
                  placeholderTextColor={huddleColors.mutedText}
                  returnKeyType="done"
                  style={[styles.input, focusedField === "customSpecies" ? styles.inputFocused : null, errors.customSpecies ? styles.inputError : null]}
                  value={form.customSpecies}
                />
                {errors.customSpecies ? <ErrorText>{errors.customSpecies}</ErrorText> : null}
              </View>
            ) : null}
          </View>

          {form.species !== "others" ? (
            <View ref={setFieldRef("breed")} style={styles.section}>
              <FieldLabel>Breed</FieldLabel>
              <Pressable onPress={() => toggleSelectField("breed")} style={[styles.selectField, selectTarget === "breed" || focusedField === "breed" ? styles.inputFocused : null]}>
                <Text style={[styles.selectText, !form.breed ? styles.placeholder : null]}>{form.breed || "Select"}</Text>
                <Feather color={huddleColors.mutedText} name="chevron-down" size={18} />
              </Pressable>
              <InlineSelectMenu
                onSelect={(value) => {
                  handleSelect(value);
                  setSelectTarget(null);
                }}
                options={breedOptions}
                selectedValues={form.breed ? [form.breed] : []}
                visible={selectTarget === "breed"}
              />
            </View>
          ) : null}

	          <View style={styles.genderTwoColumn}>
	            <View style={[styles.flexOne, styles.fieldStack]}>
	              <FieldLabel>Gender</FieldLabel>
	              <View style={styles.genderRow}>
	                {["Male", "Female"].map((gender) => (
	                  <GenderChip key={gender} label={gender} selected={form.gender === gender} onPress={() => updateForm({ gender })} />
	                ))}
              </View>
            </View>
            <Pressable onPress={() => updateForm({ neuteredSpayed: !form.neuteredSpayed })} style={styles.checkboxPill}>
              <Text style={styles.checkboxPillLabel}>Neutered/Spayed</Text>
              <View style={[styles.checkboxBox, form.neuteredSpayed ? styles.checkboxBoxChecked : null]}>
                {form.neuteredSpayed ? <Feather color={huddleColors.onPrimary} name="check" size={12} /> : null}
              </View>
            </Pressable>
          </View>

          <View style={styles.twoColumn}>
	            <View ref={setFieldRef("dob")} style={[styles.flexOne, styles.fieldStack]}>
	              <FieldLabel>Date of Birth</FieldLabel>
	              <DateField
                  error={Boolean(errors.dob)}
                  focused={dateTarget === "dob" || focusedField === "dob"}
                  onChangeText={(dob) => {
                    updateForm({ dob });
                    if (!dob) {
                      setErrors((current) => ({ ...current, dob: "" }));
                      return;
                    }
                    if (dob.trim().length >= 10) {
                      setErrors((current) => ({
                        ...current,
                        dob: !isIsoDate(dob) ? "Use YYYY-MM-DD" : "",
                      }));
                    } else {
                      setErrors((current) => ({ ...current, dob: "" }));
                    }
                  }}
                  onBlur={() => {
                    setFocusedField(null);
                    setDateTarget(null);
                    if (!form.dob || form.dob.trim().length < 10) return;
                    const petDob = new Date(`${form.dob}T00:00:00`);
                    setErrors((current) => ({
                      ...current,
                      dob: petDob > todayAtMidnight() ? "Pet DOB cannot be in the future" : !isIsoDate(form.dob) ? "Use YYYY-MM-DD" : "",
                    }));
                  }}
                  onToggle={() => toggleDateField("dob")}
                  value={form.dob}
                />
                <InlineDatePicker onChange={handleDateSelect} value={activeDateValue} visible={dateTarget === "dob"} />
	              {errors.dob ? <ErrorText>{errors.dob}</ErrorText> : null}
	            </View>
            <View ref={setFieldRef("weight")} style={[styles.flexOne, styles.fieldStack]}>
              <FieldLabel>Weight</FieldLabel>
              <View style={[styles.inputWithUnit, focusedField === "weight" ? styles.inputFocused : null, errors.weight ? styles.inputError : null]}>
	                <TextInput
	                  keyboardType="decimal-pad"
                    onBlur={() => setFocusedField(null)}
	                  onChangeText={(weight) => {
	                    if (!/^\d*(?:[.,]\d*)?$/.test(weight)) return;
	                    updateForm({ weight });
	                    const parsed = parseDecimalInput(weight);
	                    const maxWeight = maxWeightByUnit(form.weightUnit);
	                    setErrors((current) => ({
	                      ...current,
	                      weight: weight && (parsed == null || parsed < 1 || parsed > maxWeight) ? "Oops...This input seems invalid." : "",
	                    }));
	                  }}
                    onFocus={() => focusField("weight")}
                  placeholder="0"
                  placeholderTextColor={huddleColors.mutedText}
                  style={styles.unitInput}
                  value={form.weight}
                />
	                <Pressable
	                  onPress={() => {
	                    const weightUnit = form.weightUnit === "kg" ? "lb" : "kg";
	                    updateForm({ weightUnit });
	                    const parsed = parseDecimalInput(form.weight);
	                    const maxWeight = maxWeightByUnit(weightUnit);
	                    setErrors((current) => ({
	                      ...current,
	                      weight: form.weight && (parsed == null || parsed < 1 || parsed > maxWeight) ? "Oops...This input seems invalid." : "",
	                    }));
	                  }}
	                  style={styles.unitPill}
	                >
	                  <Text style={styles.unitText}>{form.weightUnit}</Text>
	                </Pressable>
              </View>
              {errors.weight ? <ErrorText>{errors.weight}</ErrorText> : null}
            </View>
          </View>

          <View ref={setFieldRef("bio")} style={styles.section}>
            <FieldLabel>Pet Bio</FieldLabel>
            <TextInput
              multiline
              onChangeText={(bio) => updateForm({ bio })}
              onBlur={() => setFocusedField(null)}
              onFocus={() => focusField("bio")}
              placeholder="Tell us about your pet"
              placeholderTextColor={huddleColors.mutedText}
              style={[styles.input, styles.textArea, focusedField === "bio" ? styles.inputFocused : null]}
              value={form.bio}
            />
          </View>

          <View ref={setFieldRef("temperament")} style={styles.section}>
            <FieldLabel>Temperament</FieldLabel>
            <Pressable onPress={() => toggleSelectField("temperament")} style={[styles.selectField, selectTarget === "temperament" || focusedField === "temperament" ? styles.inputFocused : null]}>
              <Text numberOfLines={1} style={[styles.selectText, form.temperament.length === 0 ? styles.placeholder : null]}>
                {form.temperament.length > 0 ? form.temperament.join(", ") : "Select temperament"}
              </Text>
              <Feather color={huddleColors.mutedText} name="chevron-down" size={18} />
            </Pressable>
            <InlineSelectMenu onSelect={handleSelect} options={temperamentOptions} selectedValues={form.temperament} visible={selectTarget === "temperament"} />
          </View>

          <View ref={setFieldRef("routine")} style={styles.section}>
            <FieldLabel>Daily Routine</FieldLabel>
            <TextInput
              multiline
              onChangeText={(routine) => updateForm({ routine })}
              onBlur={() => setFocusedField(null)}
              onFocus={() => focusField("routine")}
              placeholder="Feeding times, walks, play schedule"
              placeholderTextColor={huddleColors.mutedText}
              style={[styles.input, styles.textAreaSmall, focusedField === "routine" ? styles.inputFocused : null]}
              value={form.routine}
            />
          </View>

          <View ref={setFieldRef("microchipId")} style={styles.section}>
            <FieldLabel>Microchip ID</FieldLabel>
            <TextInput
              autoCorrect={false}
              keyboardType="number-pad"
              onFocus={() => focusField("microchipId")}
              onBlur={() => setFocusedField(null)}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, "").slice(0, 15);
                updateForm({ microchipId: digits });
                setErrors((current) => ({ ...current, microchipId: "" }));
              }}
              placeholderTextColor={huddleColors.mutedText}
              selection={{ start: form.microchipId.length, end: form.microchipId.length }}
              style={[styles.input, styles.microchipInput, focusedField === "microchipId" ? styles.inputFocused : null]}
              value={microchipDisplay}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>VET CONTACT</Text>
            <View ref={setFieldRef("clinicName")}>
              <TextInput onBlur={() => setFocusedField(null)} onChangeText={(clinicName) => updateForm({ clinicName })} onFocus={() => focusField("clinicName")} onSubmitEditing={() => preferredVetInputRef.current?.focus()} placeholder="Clinic name" placeholderTextColor={huddleColors.mutedText} returnKeyType="next" style={[styles.input, focusedField === "clinicName" ? styles.inputFocused : null]} value={form.clinicName} />
            </View>
            <View ref={setFieldRef("preferredVet")}>
              <TextInput ref={preferredVetInputRef} onBlur={() => setFocusedField(null)} onChangeText={(preferredVet) => updateForm({ preferredVet })} onFocus={() => focusField("preferredVet")} placeholder="Preferred vet" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" style={[styles.input, focusedField === "preferredVet" ? styles.inputFocused : null]} value={form.preferredVet} />
            </View>
            <View ref={setFieldRef("phoneNo")}>
              <NativePhoneField
                defaultCountryCode={defaultPhoneCountryCode}
                onChangeText={(phoneNo) => updateForm({ phoneNo })}
                onFocus={() => focusField("phoneNo")}
                onOpenCountryPicker={() => {
                  setFocusedField("phoneNo");
                  scrollFieldIntoView("phoneNo");
                }}
                showFormatWarning
                value={form.phoneNo}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>HEALTH</Text>
	            <View style={styles.subCard}>
	              <View style={styles.subCardHeader}>
	                <Text style={styles.subCardTitle}>Vet Visit Records</Text>
	                <Pressable
	                  accessibilityLabel="Add vet visit"
	                  onPress={() => {
	                    setVisitEditIndex(null);
	                    setVisitDraft({ reason: "", customReason: "", visitDate: "", vaccine: "" });
	                    setErrors((current) => ({ ...current, visit: "" }));
	                    setShowVisitEditor((current) => !current);
	                  }}
	                  style={styles.smallIcon}
	                >
	                  <Feather color={huddleColors.blue} name="edit-2" size={16} />
	                </Pressable>
	              </View>
              {form.vetVisitRecords.map((visit, index) => (
                <Pressable
                  key={`${visit.visitDate}-${index}`}
	                  onPress={() => {
	                    setVisitDraft(visit);
	                    setVisitEditIndex(index);
	                    setErrors((current) => ({ ...current, visit: "" }));
	                    setShowVisitEditor(true);
	                  }}
                  style={styles.listRow}
                >
                  <View style={styles.flexOne}>
                    <Text style={styles.listTitle}>{visit.reason === "Others" ? visit.customReason || "Others" : visit.reason}</Text>
                    <Text style={styles.listMeta}>{[visit.visitDate, visit.vaccine].filter(Boolean).join(" • ")}</Text>
                  </View>
                  <Pressable onPress={() => updateForm({ vetVisitRecords: form.vetVisitRecords.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}>
                    <Feather color={huddleColors.validationRed} name="x" size={18} />
                  </Pressable>
                </Pressable>
              ))}
	              {showVisitEditor ? (
	                <View style={styles.editorStack}>
	                  <Pressable ref={setFieldRef("visitReason")} onPress={() => toggleSelectField("visitReason")} style={[styles.selectField, selectTarget === "visitReason" || focusedField === "visitReason" ? styles.inputFocused : null]}>
	                    <Text style={[styles.selectText, !visitDraft.reason ? styles.placeholder : null]}>{visitDraft.reason || "Select"}</Text>
	                    <Feather color={huddleColors.mutedText} name="chevron-down" size={18} />
	                  </Pressable>
                    <InlineSelectMenu
                      onSelect={(value) => {
                        handleSelect(value);
                        setSelectTarget(null);
                      }}
                      options={vetVisitReasons}
                      selectedValues={visitDraft.reason ? [visitDraft.reason] : []}
                      visible={selectTarget === "visitReason"}
                    />
	                  <View ref={setFieldRef("visitDate")}>
	                    <DateField focused={dateTarget === "visitDate" || focusedField === "visitDate"} onBlur={() => setFocusedField(null)} onChangeText={(visitDate) => setVisitDraft((current) => ({ ...current, visitDate }))} onToggle={() => toggleDateField("visitDate")} value={visitDraft.visitDate} />
	                  </View>
                    <InlineDatePicker onChange={handleDateSelect} value={activeDateValue} visible={dateTarget === "visitDate"} />
	                  {visitDraft.reason === "Others" ? (
	                    <View ref={setFieldRef("visitCustomReason")}>
	                      <TextInput onBlur={() => setFocusedField(null)} onChangeText={(customReason) => setVisitDraft((current) => ({ ...current, customReason }))} onFocus={() => focusField("visitCustomReason")} placeholder="Custom reason" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" style={[styles.input, focusedField === "visitCustomReason" ? styles.inputFocused : null]} value={visitDraft.customReason || ""} />
	                    </View>
	                  ) : null}
	                  {visitDraft.reason === "Vaccination" ? (
	                    vaccineOptions ? (
                        <>
	                        <Pressable ref={setFieldRef("vaccine")} onPress={() => toggleSelectField("vaccine")} style={[styles.selectField, selectTarget === "vaccine" || focusedField === "vaccine" ? styles.inputFocused : null]}>
	                          <Text style={[styles.selectText, !visitDraft.vaccine ? styles.placeholder : null]}>{visitDraft.vaccine || "Select"}</Text>
	                          <Feather color={huddleColors.mutedText} name="chevron-down" size={18} />
	                        </Pressable>
                          <InlineSelectMenu
                            onSelect={(value) => {
                              handleSelect(value);
                              setSelectTarget(null);
                            }}
                            options={vaccineOptions ?? []}
                            selectedValues={visitDraft.vaccine ? [visitDraft.vaccine] : []}
                            visible={selectTarget === "vaccine"}
                          />
                        </>
	                    ) : (
	                      <View ref={setFieldRef("vaccine")}>
	                        <TextInput onBlur={() => setFocusedField(null)} onChangeText={(vaccine) => setVisitDraft((current) => ({ ...current, vaccine }))} onFocus={() => focusField("vaccine")} placeholder="Vaccine" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" style={[styles.input, focusedField === "vaccine" ? styles.inputFocused : null]} value={visitDraft.vaccine || ""} />
	                      </View>
	                    )
	                  ) : null}
	                  {errors.visit ? <ErrorText>{errors.visit}</ErrorText> : null}
	                  <View style={styles.editorActions}>
	                    <Pressable
	                      onPress={() => {
	                        setShowVisitEditor(false);
	                        setVisitEditIndex(null);
	                        setErrors((current) => ({ ...current, visit: "" }));
	                      }}
		                      style={styles.secondaryButton}
		                    >
		                      <Text style={styles.secondaryButtonText}>Cancel</Text>
	                    </Pressable>
	                    <Pressable onPress={saveVisit} style={styles.iconSaveButton}>
	                      <Feather color={huddleColors.onPrimary} name="save" size={16} />
	                    </Pressable>
	                  </View>
	                </View>
	              ) : null}
	            </View>

	            <View style={styles.subCard}>
	              <View style={styles.subCardHeader}>
	                <Text style={styles.subCardTitle}>Set Reminder</Text>
	                <Pressable
	                  accessibilityLabel="Set reminder"
	                  onPress={() => {
	                    setReminderEditIndex(null);
	                    setReminderDraft({ reason: "", customReason: "", reminderDate: "" });
	                    setErrors((current) => ({ ...current, reminder: "" }));
	                    setShowReminderEditor((current) => !current);
	                  }}
	                  style={styles.smallIcon}
	                >
	                  <Feather color={huddleColors.blue} name="edit-2" size={16} />
	                </Pressable>
	              </View>
              {form.reminders.map((reminder, index) => (
                <Pressable
                  key={`${reminder.reminderDate}-${index}`}
	                  onPress={() => {
	                    setReminderDraft(reminder);
	                    setReminderEditIndex(index);
	                    setErrors((current) => ({ ...current, reminder: "" }));
	                    setShowReminderEditor(true);
	                  }}
                  style={styles.listRow}
                >
                  <View style={styles.flexOne}>
                    <Text style={styles.listTitle}>{reminder.reason === "Others" ? reminder.customReason || "Others" : reminder.reason}</Text>
                    <Text style={styles.listMeta}>{reminder.reminderDate}</Text>
                  </View>
                  <Pressable onPress={() => updateForm({ reminders: form.reminders.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}>
                    <Feather color={huddleColors.validationRed} name="x" size={18} />
                  </Pressable>
                </Pressable>
              ))}
	              {showReminderEditor ? (
	                <View style={styles.editorStack}>
	                  <Pressable ref={setFieldRef("reminderReason")} onPress={() => toggleSelectField("reminderReason")} style={[styles.selectField, selectTarget === "reminderReason" || focusedField === "reminderReason" ? styles.inputFocused : null]}>
	                    <Text style={[styles.selectText, !reminderDraft.reason ? styles.placeholder : null]}>{reminderDraft.reason || "Select"}</Text>
	                    <Feather color={huddleColors.mutedText} name="chevron-down" size={18} />
	                  </Pressable>
                    <InlineSelectMenu
                      onSelect={(value) => {
                        handleSelect(value);
                        setSelectTarget(null);
                      }}
                      options={vetVisitReasons}
                      selectedValues={reminderDraft.reason ? [reminderDraft.reason] : []}
                      visible={selectTarget === "reminderReason"}
                    />
	                  <View ref={setFieldRef("reminderDate")}>
	                    <DateField focused={dateTarget === "reminderDate" || focusedField === "reminderDate"} onBlur={() => setFocusedField(null)} onChangeText={(reminderDate) => setReminderDraft((current) => ({ ...current, reminderDate }))} onToggle={() => toggleDateField("reminderDate")} value={reminderDraft.reminderDate} />
	                  </View>
                    <InlineDatePicker futureYearLimit={3} minDate={tomorrowIsoDate()} onChange={handleDateSelect} value={activeDateValue} visible={dateTarget === "reminderDate"} />
	                  {reminderDraft.reason === "Others" ? (
	                    <View ref={setFieldRef("reminderCustomReason")}>
	                      <TextInput onBlur={() => setFocusedField(null)} onChangeText={(customReason) => setReminderDraft((current) => ({ ...current, customReason }))} onFocus={() => focusField("reminderCustomReason")} placeholder="Custom reason" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" style={[styles.input, focusedField === "reminderCustomReason" ? styles.inputFocused : null]} value={reminderDraft.customReason || ""} />
	                    </View>
	                  ) : null}
	                  {errors.reminder ? <ErrorText>{errors.reminder}</ErrorText> : null}
	                  <View style={styles.editorActions}>
	                    <Pressable
	                      onPress={() => {
	                        setShowReminderEditor(false);
	                        setReminderEditIndex(null);
	                        setErrors((current) => ({ ...current, reminder: "" }));
	                      }}
		                      style={styles.secondaryButton}
		                    >
		                      <Text style={styles.secondaryButtonText}>Cancel</Text>
	                    </Pressable>
	                    <Pressable onPress={saveReminder} style={styles.iconSaveButton}>
	                      <Feather color={huddleColors.onPrimary} name="save" size={16} />
	                    </Pressable>
	                  </View>
	                </View>
	              ) : null}
	            </View>

	            <View style={styles.subCard}>
	              <View style={styles.subCardHeader}>
	                <Text style={styles.subCardTitle}>Medications</Text>
	                <Pressable
	                  accessibilityLabel="Add medication"
	                  onPress={() => {
	                    setMedicationEditIndex(null);
	                    setMedicationDraft({ name: "", dose_amount: null, dose_unit: null, frequency_value: null, frequency_unit: null });
	                    setErrors((current) => ({ ...current, medication: "" }));
	                    setShowMedicationEditor((current) => !current);
	                  }}
	                  style={styles.smallIcon}
	                >
	                  <Feather color={huddleColors.blue} name="edit-2" size={16} />
	                </Pressable>
	              </View>
              {form.medications.map((medication, index) => (
                <Pressable
                  key={`${medication.name}-${index}`}
	                  onPress={() => {
	                    setMedicationDraft(medication);
	                    setMedicationEditIndex(index);
	                    setErrors((current) => ({ ...current, medication: "" }));
	                    setShowMedicationEditor(true);
	                  }}
                  style={styles.listRow}
                >
                  <View style={styles.flexOne}>
                    <Text style={styles.listTitle}>{medication.name}</Text>
                    <Text style={styles.listMeta}>
                      {[
                        medication.dose_amount != null && medication.dose_unit ? `${medication.dose_amount}${medication.dose_unit}` : "",
                        medication.frequency_value != null && medication.frequency_unit ? `Every ${medication.frequency_value} ${medication.frequency_unit}` : "",
                      ].filter(Boolean).join(" • ")}
                    </Text>
                  </View>
                  <Pressable onPress={() => updateForm({ medications: form.medications.filter((_, entryIndex) => entryIndex !== index) })} style={styles.smallIcon}>
                    <Feather color={huddleColors.validationRed} name="x" size={18} />
                  </Pressable>
                </Pressable>
              ))}
	              {showMedicationEditor ? (
	                <View style={styles.editorStack}>
	                  <View ref={setFieldRef("medicationName")}>
	                    <TextInput onBlur={() => setFocusedField(null)} onChangeText={(name) => setMedicationDraft((current) => ({ ...current, name }))} onFocus={() => focusField("medicationName")} placeholder="Medication name" placeholderTextColor={huddleColors.mutedText} returnKeyType="done" style={[styles.input, focusedField === "medicationName" ? styles.inputFocused : null]} value={medicationDraft.name} />
	                  </View>
	                  <View style={styles.medicationCompositeRow}>
	                    <View ref={setFieldRef("doseAmount")} style={styles.medicationCompositeBlock}>
	                      <View style={[styles.compositeField, focusedField === "doseAmount" || selectTarget === "doseUnit" ? styles.inputFocused : null]}>
	                        <TextInput
	                          keyboardType="decimal-pad"
	                          onBlur={() => setFocusedField(null)}
	                          onChangeText={(value) => setMedicationDraft((current) => ({ ...current, dose_amount: parseMedicationNumericInput(value, current.dose_amount, true) }))}
	                          onFocus={() => focusField("doseAmount")}
	                          placeholder="Dosage"
	                          placeholderTextColor={huddleColors.mutedText}
	                          style={styles.compositeFieldInput}
	                          value={medicationDraft.dose_amount == null ? "" : String(medicationDraft.dose_amount)}
	                        />
	                        <Pressable onPress={() => toggleSelectField("doseUnit")} style={styles.compositeFieldSelect}>
	                          <Text style={[styles.compositeFieldSelectText, !medicationDraft.dose_unit ? styles.placeholder : null]}>{medicationDraft.dose_unit || "Select"}</Text>
	                        </Pressable>
	                      </View>
	                      <InlineSelectMenu
	                        onSelect={(value) => {
	                          handleSelect(value);
	                          setSelectTarget(null);
	                        }}
	                        options={doseUnits}
	                        selectedValues={medicationDraft.dose_unit ? [medicationDraft.dose_unit] : []}
	                        visible={selectTarget === "doseUnit"}
	                      />
	                    </View>
	                    <View ref={setFieldRef("frequencyValue")} style={styles.medicationCompositeBlock}>
	                      <View style={[styles.compositeField, focusedField === "frequencyValue" || selectTarget === "frequencyUnit" ? styles.inputFocused : null]}>
	                        <TextInput
	                          keyboardType="number-pad"
	                          onBlur={() => setFocusedField(null)}
	                          onChangeText={(value) => setMedicationDraft((current) => ({ ...current, frequency_value: parseMedicationNumericInput(value, current.frequency_value, false) }))}
	                          onFocus={() => focusField("frequencyValue")}
	                          placeholder="Frequency"
	                          placeholderTextColor={huddleColors.mutedText}
	                          style={styles.compositeFieldInput}
	                          value={medicationDraft.frequency_value == null ? "" : String(medicationDraft.frequency_value)}
	                        />
	                        <Pressable onPress={() => toggleSelectField("frequencyUnit")} style={styles.compositeFieldSelect}>
	                          <Text style={[styles.compositeFieldSelectText, !medicationDraft.frequency_unit ? styles.placeholder : null]}>{medicationDraft.frequency_unit || "Select"}</Text>
	                        </Pressable>
	                      </View>
	                      <InlineSelectMenu
	                        onSelect={(value) => {
	                          handleSelect(value);
	                          setSelectTarget(null);
	                        }}
	                        options={frequencyUnits}
	                        selectedValues={medicationDraft.frequency_unit ? [medicationDraft.frequency_unit] : []}
	                        visible={selectTarget === "frequencyUnit"}
	                      />
	                    </View>
	                  </View>
	                  {errors.medication ? <ErrorText>{errors.medication}</ErrorText> : null}
	                  <View style={styles.editorActions}>
	                    <Pressable
	                      onPress={() => {
	                        setShowMedicationEditor(false);
	                        setMedicationEditIndex(null);
	                        setErrors((current) => ({ ...current, medication: "" }));
	                      }}
		                      style={styles.secondaryButton}
		                    >
		                      <Text style={styles.secondaryButtonText}>Cancel</Text>
	                    </Pressable>
	                    <Pressable onPress={saveMedication} style={styles.iconSaveButton}>
	                      <Feather color={huddleColors.onPrimary} name="save" size={16} />
	                    </Pressable>
	                  </View>
	                </View>
	              ) : null}
	            </View>
          </View>

          <View style={styles.switchStack}>
            <View style={styles.switchRow}>
              <View style={styles.flexOne}>
                <Text style={styles.switchTitle}>Still Active</Text>
                <Text style={styles.switchHelp}>Is this pet still with you?</Text>
              </View>
              <InlineToggle checked={form.isActive} onPress={() => updateForm({ isActive: !form.isActive })} />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.flexOne}>
                <Text style={styles.switchTitle}>Public Profile</Text>
                <Text style={styles.switchHelp}>Show this pet publicly</Text>
              </View>
              <InlineToggle checked={form.isPublic} onPress={() => updateForm({ isPublic: !form.isPublic })} />
            </View>
          </View>
          {message ? <Text style={message === "Draft saved" ? styles.successText : styles.errorText}>{message}</Text> : null}
          {!onboardingMode && profileMode === "edit" && savedPetId && !isNewPet ? (
            <Pressable disabled={saving} onPress={confirmRemovePet} style={({ pressed }) => [styles.removeInlineButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
              <Text style={styles.removeInlineButtonText}>Remove Pet</Text>
            </Pressable>
          ) : null}
            </>
          )}
        </ScrollView>

        <AppDestructiveSlideConfirm
          body="This will remove the pet from your active profile."
          busy={saving}
          onClose={() => {
            if (!saving) setRemovePetConfirmOpen(false);
          }}
          onConfirm={() => void removePet()}
          open={removePetConfirmOpen}
          slideLabel="Slide to Remove Pet"
          title="Remove Pet"
        />

        {onboardingMode && profileMode === "edit" ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + huddleSpacing.x3 }]}>
            <Animated.View style={{ transform: [{ translateX: saveShakeAnim }] }}>
              <Pressable disabled={saving} onPress={() => void savePet(false)} style={({ pressed }) => [styles.primaryButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
                {saving ? <ActivityIndicator color={huddleColors.onPrimary} /> : <Text style={styles.primaryButtonText}>Complete profile</Text>}
              </Pressable>
            </Animated.View>
            <Pressable disabled={saving} onPress={() => void savePet(true)} style={({ pressed }) => [styles.draftButton, pressed && !saving ? styles.pressed : null, saving ? styles.disabled : null]}>
              <Text style={styles.draftButtonText}>Save Draft</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: huddleColors.glassChrome,
  },
  keyboard: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: huddleSpacing.x3,
  },
  stateText: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-600",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x3,
    paddingBottom: huddleSpacing.x3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: huddleColors.divider,
    backgroundColor: huddleColors.glassChrome,
    ...huddleShadows.glassHeader,
  },
  backButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    borderRadius: huddleRadii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
  },
  headerSaveSlot: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
  },
  headerText: {
    flex: 1,
  },
  headerSaveButton: {
    width: huddleLayout.minTouch,
    height: huddleLayout.minTouch,
    borderRadius: huddleRadii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.glassControl,
  },
  title: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 22,
    lineHeight: 26,
  },
  subtitle: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: huddleType.helper,
    lineHeight: 17,
    marginTop: 2,
  },
	  content: {
	    padding: huddleSpacing.x4,
	    gap: huddleSpacing.x5,
	  },
  contentScroller: {
    backgroundColor: huddleColors.canvas,
  },
	  tabWrap: {
	    flexDirection: "row",
	    paddingHorizontal: huddleSpacing.x4,
	    paddingTop: huddleSpacing.x2,
	    borderBottomWidth: StyleSheet.hairlineWidth,
	    borderBottomColor: huddleColors.divider,
	    backgroundColor: huddleColors.canvas,
	  },
	  tabButton: {
	    flex: 1,
	    height: 36,
	    alignItems: "center",
	    justifyContent: "center",
	    borderBottomWidth: 2,
	    borderBottomColor: "transparent",
	    marginBottom: -StyleSheet.hairlineWidth,
	  },
	  tabButtonActive: {
	    borderBottomColor: huddleColors.tabActive,
	  },
	  tabText: {
	    color: huddleColors.mutedText,
	    fontFamily: "Urbanist-600",
	    fontSize: 14,
	  },
	  tabTextActive: {
	    color: huddleColors.text,
	  },
  photoWrap: {
    alignSelf: "center",
    width: 112,
    height: 112,
    borderRadius: 56,
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
    borderRadius: 56,
    backgroundColor: huddleColors.mutedCanvas,
  },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 56,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: huddleColors.photoBorder,
    backgroundColor: huddleColors.mutedCanvas,
    alignItems: "center",
    justifyContent: "center",
  },
	  photoBadge: {
	    position: "absolute",
	    right: 2,
	    bottom: 2,
	    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: huddleColors.blue,
	    alignItems: "center",
	    justifyContent: "center",
	  },
	  section: {
	    gap: huddleSpacing.x3,
	  },
  sectionTitle: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-700",
    fontSize: huddleType.helper,
    letterSpacing: 0.8,
  },
  label: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: huddleType.label,
    lineHeight: huddleType.labelLine,
  },
  input: {
    minHeight: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    lineHeight: 20,
  },
  inputFocused: {
    ...huddleFieldStates.focused,
  },
  microchipInput: {
    fontFamily: Platform.select({
      ios: "Courier",
      default: "monospace",
    }),
  },
  textArea: {
    minHeight: 112,
    paddingTop: huddleSpacing.x3,
    textAlignVertical: "top",
  },
	  textAreaSmall: {
	    minHeight: 96,
	    paddingTop: huddleSpacing.x3,
	    textAlignVertical: "top",
	  },
	  inputError: {
	    ...huddleFieldStates.error,
	  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: huddleSpacing.x2,
  },
	  rowGap: {
	    flexDirection: "row",
	    gap: huddleSpacing.x2,
	    flexWrap: "wrap",
	  },
	  genderTwoColumn: {
	    flexDirection: "row",
	    gap: huddleSpacing.x3,
	    alignItems: "flex-end",
	  },
	  genderRow: {
	    flexDirection: "row",
	    gap: huddleSpacing.x2,
	  },
	  chip: {
	    minHeight: 40,
	    borderRadius: huddleRadii.pill,
	    paddingHorizontal: huddleSpacing.x4,
	    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.mutedCanvas,
  },
  chipSelected: {
    backgroundColor: huddleColors.blue,
  },
  chipText: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-600",
    fontSize: 14,
  },
	  chipTextSelected: {
	    color: huddleColors.onPrimary,
	  },
	  genderChip: {
	    flex: 1,
	    minHeight: 40,
	    borderRadius: huddleRadii.card,
	    paddingHorizontal: huddleSpacing.x4,
	    alignItems: "center",
	    justifyContent: "center",
	    backgroundColor: huddleColors.mutedCanvas,
	  },
  twoColumn: {
    flexDirection: "row",
    gap: huddleSpacing.x3,
    alignItems: "flex-start",
  },
  flexOne: {
    flex: 1,
  },
  fieldStack: {
    gap: huddleSpacing.x3,
  },
	  switchCard: {
	    minHeight: 40,
	    flex: 1,
	    borderRadius: huddleRadii.pill,
	    backgroundColor: huddleColors.mutedCanvas,
	    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  switchLabel: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 13,
  },
  checkboxPill: {
    minHeight: 40,
    flex: 1,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.mutedCanvas,
    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  checkboxPillLabel: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 13,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: huddleColors.fieldBorderStrong,
    backgroundColor: huddleColors.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    borderColor: huddleColors.blue,
    backgroundColor: huddleColors.blue,
  },
  inputWithUnit: {
    height: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: huddleSpacing.x4,
  },
  unitInput: {
    flex: 1,
    height: huddleLayout.fieldHeight,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 15,
  },
  unitPill: {
    minWidth: 44,
    height: 32,
    borderRadius: huddleRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: huddleSpacing.x2,
    backgroundColor: huddleColors.mutedCanvas,
  },
  unitText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 12,
  },
  selectField: {
    height: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  selectText: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 15,
  },
  inlinePopover: {
    overflow: "hidden",
    borderRadius: huddleFormControls.select.menuRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleFormControls.select.menuBorderColor,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  inlinePopoverScroll: {
    maxHeight: huddleFormControls.select.menuMaxHeight,
  },
  inlineOptions: {
    padding: huddleFormControls.select.menuPadding,
  },
  optionRowSelected: {
    backgroundColor: huddleColors.canvas,
  },
  optionTextSelected: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
  },
  optionCheckSpacer: {
    width: huddleFormControls.select.checkSlot,
    height: huddleFormControls.select.checkSlot,
  },
  dateField: {
    height: huddleLayout.fieldHeight,
    borderRadius: huddleRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
  },
  dateFieldInput: {
    flex: 1,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x4,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 15,
  },
  dateIconButton: {
    width: 40,
    height: huddleLayout.fieldHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineDateColumns: {
    flexDirection: "row",
    gap: huddleFormControls.datePicker.columnGap,
    padding: huddleFormControls.datePicker.columnPadding,
  },
  inlineDateColumn: {
    flex: 1,
    maxHeight: huddleFormControls.datePicker.columnMaxHeight,
    borderRadius: huddleFormControls.datePicker.columnRadius,
    backgroundColor: huddleColors.mutedCanvas,
  },
  inlineDateOption: {
    minHeight: huddleFormControls.datePicker.optionMinHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleFormControls.datePicker.optionRadius,
  },
  inlineDateOptionActive: {
    backgroundColor: huddleColors.blue,
  },
  inlineDateOptionText: {
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 14,
  },
  inlineDateOptionTextActive: {
    color: huddleColors.onPrimary,
  },
  placeholder: {
    color: huddleColors.mutedText,
  },
  medicationCompositeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: huddleSpacing.x2,
  },
  medicationCompositeBlock: {
    flex: 1,
    minWidth: 0,
    gap: huddleSpacing.x2,
  },
  compositeField: {
    height: huddleLayout.fieldHeight,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: huddleRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorder,
    backgroundColor: huddleColors.canvas,
    overflow: "hidden",
  },
  compositeFieldInput: {
    flex: 1,
    minWidth: 0,
    height: huddleLayout.fieldHeight,
    paddingHorizontal: huddleSpacing.x3,
    color: huddleColors.text,
    fontFamily: "Urbanist-500",
    fontSize: 15,
  },
  compositeFieldSelect: {
    alignSelf: "stretch",
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: huddleColors.divider,
    paddingHorizontal: huddleSpacing.x2,
  },
  compositeFieldSelectText: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-600",
    fontSize: 12,
  },
  subCard: {
    gap: huddleSpacing.x3,
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x3,
    backgroundColor: huddleColors.mutedCanvas,
  },
  subCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subCardTitle: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 15,
  },
  listRow: {
    minHeight: 50,
    borderRadius: huddleRadii.field,
    backgroundColor: huddleColors.canvas,
    paddingHorizontal: huddleSpacing.x3,
    paddingVertical: huddleSpacing.x2,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x2,
  },
  listTitle: {
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 14,
  },
  listMeta: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    marginTop: 2,
  },
	  smallIcon: {
	    width: 34,
	    height: 34,
	    alignItems: "center",
	    justifyContent: "center",
	  },
	  editorStack: {
	    gap: huddleSpacing.x2,
	    paddingTop: huddleSpacing.x2,
	    borderTopWidth: StyleSheet.hairlineWidth,
	    borderTopColor: huddleColors.sectionDividerStrong,
	  },
	  editorActions: {
	    flexDirection: "row",
	    justifyContent: "flex-end",
	    alignItems: "center",
	    gap: huddleSpacing.x2,
	  },
	  iconSaveButton: {
	    width: huddleButtons.base.minHeight,
	    minHeight: huddleButtons.base.minHeight,
	    borderRadius: huddleRadii.button,
	    alignItems: "center",
	    justifyContent: "center",
	    backgroundColor: huddleColors.blue,
	  },
  secondaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
	  secondaryButtonText: {
	    ...huddleButtons.label,
	    color: huddleColors.text,
	  },
  switchStack: {
    gap: huddleSpacing.x3,
  },
  switchRow: {
    minHeight: 72,
    borderRadius: huddleRadii.card,
    padding: huddleSpacing.x4,
    backgroundColor: huddleColors.mutedCanvas,
    flexDirection: "row",
    alignItems: "center",
    gap: huddleSpacing.x3,
  },
  switchTitle: {
    color: huddleColors.text,
    fontFamily: "Urbanist-700",
    fontSize: 15,
  },
  switchHelp: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-500",
    fontSize: 12,
    marginTop: 2,
  },
  webToggleTrack: {
    width: 50,
    height: 28,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.toggleOff,
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: huddleColors.fieldBorderSoft,
  },
  webToggleTrackChecked: {
    backgroundColor: huddleColors.blue,
    borderColor: huddleColors.blue,
  },
  webToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: huddleRadii.pill,
    backgroundColor: huddleColors.canvas,
    ...huddleShadows.glassElevation1,
  },
  webToggleThumbChecked: {
    alignSelf: "flex-end",
  },
  errorText: {
    color: huddleColors.validationRed,
    fontFamily: "Urbanist-600",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  warningText: {
    color: huddleColors.mutedText,
    fontFamily: "Urbanist-600",
    fontSize: 12,
  },
  successText: {
    color: huddleColors.blue,
    fontFamily: "Urbanist-700",
    fontSize: 13,
  },
  footer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    gap: huddleSpacing.x2,
    paddingHorizontal: huddleSpacing.x4,
    paddingTop: huddleSpacing.x3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: huddleColors.divider,
    backgroundColor: huddleColors.glassOverlay,
    ...huddleShadows.glassElevation2,
  },
  primaryButton: {
    ...huddleButtons.base,
    ...huddleButtons.primary,
  },
  primaryButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  draftButton: {
    ...huddleButtons.base,
    ...huddleButtons.secondary,
  },
  draftButtonText: {
    ...huddleButtons.label,
    color: huddleColors.text,
  },
  removeButton: {
    ...huddleButtons.base,
    backgroundColor: huddleColors.validationRed,
  },
  removeButtonText: {
    ...huddleButtons.label,
    color: huddleColors.onPrimary,
  },
  removeInlineButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: huddleRadii.button,
    backgroundColor: huddleColors.validationSoft,
    ...huddleFieldStates.error,
  },
  removeInlineButtonText: {
    ...huddleButtons.label,
    color: huddleColors.validationRed,
  },
  disabled: {
    ...huddleButtons.disabled,
  },
  pressed: {
    ...huddleButtons.pressed,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: huddleColors.backdrop,
  },
  modalCard: {
    maxHeight: "76%",
    borderTopLeftRadius: huddleRadii.modal,
    borderTopRightRadius: huddleRadii.modal,
    backgroundColor: huddleColors.canvas,
    paddingTop: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x5,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: huddleSpacing.x4,
    paddingBottom: huddleSpacing.x2,
  },
	  modalTitle: {
	    color: huddleModalTokens.color.text,
	    fontFamily: huddleModalTokens.type.titleFamily,
	    fontSize: huddleModalTokens.type.titleSize,
	    lineHeight: huddleModalTokens.type.titleLine,
	    paddingHorizontal: huddleModalTokens.spacing.x4,
	    paddingRight: huddleModalTokens.spacing.x7 + huddleModalTokens.spacing.x5,
	    paddingTop: huddleModalTokens.spacing.x5,
	  },
	  datePickerColumns: {
	    flexDirection: "row",
	    gap: huddleModalTokens.spacing.x2,
	    paddingHorizontal: huddleModalTokens.spacing.x4,
	    paddingTop: huddleModalTokens.spacing.x3,
	  },
	  datePickerColumn: {
	    maxHeight: 220,
	    flex: 1,
	    borderRadius: huddleModalTokens.radius.field,
	    backgroundColor: huddleColors.mutedCanvas,
	  },
	  datePickerOption: {
	    minHeight: 40,
	    alignItems: "center",
	    justifyContent: "center",
	    borderRadius: huddleModalTokens.radius.field,
	  },
	  datePickerOptionActive: {
	    backgroundColor: huddleModalTokens.color.blue,
	  },
	  datePickerOptionText: {
	    color: huddleModalTokens.color.text,
	    fontFamily: huddleModalTokens.type.labelFamily,
	    fontSize: 14,
	  },
	  datePickerOptionTextActive: {
	    color: huddleModalTokens.color.onPrimary,
	  },
	  datePickerDoneButton: {
	    height: huddleModalTokens.size.buttonHeight,
	    borderRadius: huddleModalTokens.radius.button,
	    alignItems: "center",
	    justifyContent: "center",
	    marginHorizontal: huddleModalTokens.spacing.x4,
	    marginTop: huddleModalTokens.spacing.x4,
	    backgroundColor: huddleModalTokens.color.blue,
	  },
	  datePickerDoneText: {
	    color: huddleModalTokens.color.onPrimary,
	    fontFamily: huddleModalTokens.type.buttonFamily,
	    fontSize: 15,
	  },
	  iconButton: {
    width: 40,
    height: 40,
    borderRadius: huddleRadii.card,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: huddleColors.mutedCanvas,
  },
  modalOptions: {
    paddingHorizontal: huddleSpacing.x4,
    gap: huddleSpacing.x2,
  },
  optionRow: {
    minHeight: huddleFormControls.select.optionMinHeight,
    borderRadius: huddleFormControls.select.optionRadius,
    paddingHorizontal: huddleFormControls.select.optionPaddingHorizontal,
    paddingVertical: huddleFormControls.select.optionPaddingVertical,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: huddleSpacing.x2,
    backgroundColor: huddleColors.canvas,
  },
  optionText: {
    flex: 1,
    color: huddleColors.text,
    fontFamily: "Urbanist-600",
    fontSize: 14,
    lineHeight: 18,
  },
  optionCheckSlot: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
